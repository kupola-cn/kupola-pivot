import {
  ActionType,
  RiskLevel,
  createCommand,
  createCapabilityRegistry,
  createCapabilityManifest,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
  createTrustedUIAdapter,
  getExecutionOrder,
  parseStructuredCommandOutput,
  parseStructuredPlanOutput,
  renderAuditViewerToHTML,
  renderCapabilityBrowserToHTML,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML,
  redactParams,
  renderResultToHTML,
  renderTimelineToHTML,
  validateCapabilityManifest,
  validateParams,
  validatePlan
} from '@kupola/pivot';
import { readFileSync } from 'node:fs';
import {
  approvalRuntime,
  auditNotifications,
  auditRuntime,
  assistantEvents,
  assistantUI,
  flakyAttempts,
  immutableCapability,
  lastConfirmInput,
  manifestCapability,
  manifestRegistry,
  maxParallelExecutions,
  rejectionRuntime,
  simulationCalls,
  simulationRuntime,
  runtime
} from './smoke-fixtures.mjs';

const command = createCommand({
  intent: 'Create Branch C under the group.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: { name: 'Branch C', parentId: 'group' }
});

const secondCommand = createCommand({
  intent: 'Create Branch D under the group.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: { name: 'Branch D', parentId: 'group' }
});

const structuredCommandOutput = {
  type: 'command',
  command: {
    intent: 'Create Branch H from structured output.',
    resource: 'organization',
    action: ActionType.CREATE,
    capability: 'organization.create',
    risk: RiskLevel.MEDIUM,
    params: { name: 'Branch H', parentId: 'group' }
  }
};

const topLevelStructuredCommandOutput = {
  intent: 'Create Branch H from top-level structured output.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: { name: 'Branch H', parentId: 'group' }
};

const invalidStructuredCommandOutput = parseStructuredCommandOutput({
  type: 'command',
  command: {
    intent: 'Broken command output.'
  }
});

const parsedStructuredCommand = parseStructuredCommandOutput(structuredCommandOutput);
const parsedTopLevelStructuredCommand = parseStructuredCommandOutput(topLevelStructuredCommandOutput);
const simulationCommand = createCommand({
  intent: 'Simulate creating Branch S under the group.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.simulate',
  risk: RiskLevel.MEDIUM,
  params: { name: 'Branch S', parentId: 'group' }
});

if (command.id === secondCommand.id) {
  throw new Error('Expected command IDs to be unique.');
}

if (invalidStructuredCommandOutput.ok || !invalidStructuredCommandOutput.explain.errors.some((error) => error.includes('Command field is required'))) {
  throw new Error('Expected invalid structured command output to fail validation.');
}

if (!parsedStructuredCommand.ok || parsedStructuredCommand.data.command.capability !== 'organization.create') {
  throw new Error('Expected structured command output to parse into a command.');
}

if (!parsedTopLevelStructuredCommand.ok || parsedTopLevelStructuredCommand.data.command.intent !== topLevelStructuredCommandOutput.intent) {
  throw new Error('Expected top-level structured command output to parse into a command.');
}

const simulationResult = await simulationRuntime.simulateCommand(simulationCommand, {
  actor: {
    id: 'simulation-user',
    permissions: ['organization:create']
  }
});

if (!simulationResult.ok || simulationResult.data.simulation.projectedName !== 'Branch S' || simulationResult.data.requiresConfirmation !== true) {
  throw new Error('Expected dry-run command simulation to succeed and report simulation data.');
}

if (simulationResult.data.capability.dryRun !== undefined) {
  throw new Error('Expected simulated capability preview to omit dryRun implementation details.');
}

if (simulationCalls !== 1 || simulationResult.audit !== null) {
  throw new Error('Expected dry-run simulation to call dryRun exactly once without creating an audit event.');
}

if (!Array.isArray(simulationResult.explain.timeline) || !simulationResult.explain.timeline.some((step) => step.stage === 'simulation' && step.status === 'executed')) {
  throw new Error('Expected dry-run simulation timeline to include a simulation execution step.');
}

const unknownParamValidation = validateParams(
  { name: 'Branch C', parentId: 'group', role: 'admin' },
  {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  }
);

if (unknownParamValidation.valid) {
  throw new Error('Expected unknown params to be rejected by default.');
}

const allowedUnknownParamValidation = validateParams(
  { name: 'Branch C', parentId: 'group', metadata: { source: 'ai' } },
  {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  { allowUnknown: true }
);

if (!allowedUnknownParamValidation.valid) {
  throw new Error('Expected unknown params to be allowed when explicitly enabled.');
}

const redactedParams = redactParams(
  { password: 'secret-password', token: 'session-token', displayName: 'Alice' },
  { password: { type: 'string', sensitive: true }, token: 'string', displayName: 'string' }
);

if (redactedParams.password !== '[redacted]' || redactedParams.token !== '[redacted]' || redactedParams.displayName !== 'Alice') {
  throw new Error('Expected sensitive params to be redacted by schema and default sensitive names.');
}

const validation = runtime.validateCommand(command);
const preview = await runtime.previewCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});
const result = await runtime.executeCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});

if (!validation.valid) {
  throw new Error(`Expected valid command, got: ${validation.errors.join('; ')}`);
}

if (!preview.ok || !preview.data.requiresConfirmation) {
  throw new Error('Expected command preview to require confirmation.');
}

if (!Array.isArray(preview.explain.timeline) || preview.explain.timeline.length < 3) {
  throw new Error('Expected command preview to include an explain timeline.');
}

if (!result.ok || result.data.name !== 'Branch C') {
  throw new Error('Expected command execution to succeed.');
}

if (!Array.isArray(result.explain.timeline) || !result.explain.timeline.some((step) => step.stage === 'execution')) {
  throw new Error('Expected command execution to include an execution timeline step.');
}

if (runtime.getAuditEvents().length !== 1) {
  throw new Error('Expected exactly one audit event.');
}

const passwordCommand = createCommand({
  intent: 'Update a user password.',
  resource: 'user',
  action: ActionType.UPDATE,
  capability: 'user.password.update',
  risk: RiskLevel.HIGH,
  params: { id: 'user-3', password: 'secret-password', token: 'session-token' }
});

const passwordPreview = await runtime.previewCommand(passwordCommand, {
  actor: { id: 'user-1', permissions: ['user:update'] }
});

if (passwordPreview.data.command.params.password !== '[redacted]' || passwordPreview.data.command.params.token !== '[redacted]') {
  throw new Error('Expected preview command params to be redacted.');
}

const passwordResult = await runtime.executeCommand(passwordCommand, {
  actor: { id: 'user-1', permissions: ['user:update'] }
});

if (!passwordResult.ok || passwordResult.data.storedPassword !== 'secret-password') {
  throw new Error('Expected execution to receive original sensitive params.');
}

if (lastConfirmInput.command.params.password !== '[redacted]' || lastConfirmInput.command.params.token !== '[redacted]') {
  throw new Error('Expected confirmation input command params to be redacted.');
}

const auditCommand = createCommand({
  intent: 'Create an auditable organization branch.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.audit.create',
  risk: RiskLevel.LOW,
  params: { name: 'Audit Branch', parentId: 'group' }
});

const auditResult = await auditRuntime.executeCommand(auditCommand, {
  actor: { id: 'audit-user', permissions: ['organization:create'] },
  auditMetadata: { requestId: 'req-123', token: 'audit-token' }
});

if (!auditResult.ok) {
  throw new Error('Expected auditable command execution to succeed.');
}

if (auditNotifications.length !== 3) {
  throw new Error('Expected all audit sinks to receive the audit event.');
}

if (!auditNotifications.every((entry) => entry.event.metadata.requestId === 'req-123')) {
  throw new Error('Expected audit metadata to be merged into all audit sinks.');
}

if (!auditNotifications.every((entry) => entry.event.metadata.token === '[redacted]')) {
  throw new Error('Expected sensitive audit metadata to be redacted.');
}

if (auditRuntime.getAuditEvents()[0].metadata.token !== '[redacted]') {
  throw new Error('Expected stored audit events to keep redacted metadata.');
}

const backendForbiddenCommand = createCommand({
  intent: 'Update user through backend.',
  resource: 'user',
  action: ActionType.UPDATE,
  capability: 'user.backend.forbidden',
  risk: RiskLevel.MEDIUM,
  params: { id: 'user-4' }
});

const backendForbiddenResult = await runtime.executeCommand(backendForbiddenCommand, {
  actor: { id: 'user-1', permissions: ['user:update'] }
});

if (backendForbiddenResult.ok || backendForbiddenResult.audit.status !== 'blocked' || backendForbiddenResult.audit.decision !== 'deny') {
  throw new Error('Expected backend 403 to be represented as a denied blocked command.');
}

if (backendForbiddenResult.audit.metadata.httpStatus !== 403 || backendForbiddenResult.explain.status !== 403) {
  throw new Error('Expected backend 403 status to be included in audit and explain metadata.');
}

const backendUnauthenticatedCommand = createCommand({
  intent: 'Query user through backend.',
  resource: 'user',
  action: ActionType.QUERY,
  capability: 'user.backend.unauthenticated',
  risk: RiskLevel.LOW,
  params: {}
});

const backendUnauthenticatedResult = await runtime.executeCommand(backendUnauthenticatedCommand, {
  actor: { id: 'user-1', permissions: ['user:query'] }
});

if (backendUnauthenticatedResult.ok || backendUnauthenticatedResult.audit.status !== 'blocked' || backendUnauthenticatedResult.explain.status !== 401) {
  throw new Error('Expected backend 401 to be represented as a blocked command.');
}

const extraParamCommand = createCommand({
  intent: 'Create Branch C with an unexpected admin flag.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: { name: 'Branch C', parentId: 'group', admin: true }
});

const extraParamResult = await runtime.executeCommand(extraParamCommand, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});

if (extraParamResult.ok || !extraParamResult.explain.errors.some((error) => error.includes('Unknown param'))) {
  throw new Error('Expected execution to reject undeclared command params.');
}

const allowedExtraParamCommand = createCommand({
  intent: 'Attach dynamic metadata to Branch C.',
  resource: 'organization',
  action: ActionType.UPDATE,
  capability: 'organization.metadata',
  risk: RiskLevel.MEDIUM,
  params: { id: 'org-1', source: 'ai' }
});

const allowedExtraParamResult = await runtime.executeCommand(allowedExtraParamCommand, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});

if (!allowedExtraParamResult.ok || allowedExtraParamResult.data.source !== 'ai') {
  throw new Error('Expected capability-level allowUnknownParams to permit extra params.');
}

const blockedResult = await runtime.executeCommand(command, {
  actor: { id: 'user-2', permissions: [] }
});

const blockedPreview = await runtime.previewCommand(command, {
  actor: { id: 'user-2', permissions: [] }
});

if (blockedResult.ok || blockedResult.audit.status !== 'blocked') {
  throw new Error('Expected permission policy to block unauthorized command.');
}

if (blockedPreview.ok) {
  throw new Error('Expected preview to show unauthorized command as blocked.');
}


export { parsedStructuredCommand, result };
