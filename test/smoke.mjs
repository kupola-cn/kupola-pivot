import {
  ActionType,
  RiskLevel,
  createCommand,
  createCapabilityRegistry,
  createCapabilityManifest,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
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

let lastConfirmInput = null;

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async (input) => {
      lastConfirmInput = input;
      return true;
    }
  }
});

const approvalCalls = [];
let activeParallelExecutions = 0;
let maxParallelExecutions = 0;
let flakyAttempts = 0;
const approvalRuntime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true,
    approve: async (input) => {
      approvalCalls.push(input);
      return true;
    }
  }
});

const rejectionRuntime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true,
    approve: async () => false
  }
});

const auditNotifications = [];
const auditRuntime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true
  },
  onAudit: async (event) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    auditNotifications.push({ sink: 'onAudit', event });
  },
  auditSinks: [
    async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      auditNotifications.push({ sink: 'auditSinkA', event });
    },
    async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      auditNotifications.push({ sink: 'auditSinkB', event });
    }
  ]
});

const isolatedRegistry = createCapabilityRegistry();
const mutableCapabilityInput = {
  name: 'user.immutable.create',
  resource: 'user',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['user:create'],
  paramsSchema: {
    username: { type: 'string', required: true }
  },
  execute: async () => ({ ok: true })
};
const immutableCapability = isolatedRegistry.register(mutableCapabilityInput);

mutableCapabilityInput.permissions.push('user:admin');
mutableCapabilityInput.paramsSchema.username.required = false;

if (immutableCapability.permissions.includes('user:admin')) {
  throw new Error('Expected registered capability permissions to be detached from source input.');
}

if (!immutableCapability.paramsSchema.username.required) {
  throw new Error('Expected registered capability paramsSchema to be detached from source input.');
}

let mutationBlocked = false;

try {
  immutableCapability.paramsSchema.username.required = false;
} catch {
  mutationBlocked = true;
}

if (!mutationBlocked || !Object.isFrozen(immutableCapability.paramsSchema.username)) {
  throw new Error('Expected registered capability nested schema to be deeply frozen.');
}

if (typeof immutableCapability.execute !== 'function') {
  throw new Error('Expected capability execute function to be preserved during deep freeze.');
}

const manifestRegistry = createCapabilityRegistry();
const manifestCapability = manifestRegistry.register(createCapabilityManifest({
  name: 'team.create',
  manifestVersion: '0.1.0',
  version: '1.0.0',
  domain: 'team',
  group: 'team.lifecycle',
  tags: ['team', 'create'],
  dependencies: [
    {
      capability: 'organization.query',
      version: '^1.0.0',
      optional: false,
      description: 'Resolve the parent organization before creating a team.'
    }
  ],
  resource: 'team',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['team:create'],
  inputSchema: {
    name: { type: 'string', required: true }
  },
  outputSchema: {
    id: { type: 'string' },
    name: { type: 'string' }
  },
  examples: [
    {
      label: 'Create team',
      description: 'Create a new team inside an organization.',
      params: { name: 'Platform' }
    }
  ],
  execute: async ({ params }) => ({ id: 'team-1', ...params })
}));

const manifestValidation = validateCapabilityManifest(manifestCapability);
const manifestTagMatches = manifestRegistry.list({ domain: 'team', tag: 'team' });
const manifestVersionMatches = manifestRegistry.list({ version: '1.0.0', tags: ['team', 'create'] });

if (!manifestValidation.valid) {
  throw new Error(`Expected capability manifest validation to succeed, got: ${manifestValidation.errors.join('; ')}`);
}

if (!manifestCapability.inputSchema.name.required || !manifestCapability.paramsSchema.name.required) {
  throw new Error('Expected capability manifest inputSchema and paramsSchema to preserve required fields.');
}

if (manifestCapability.manifestVersion !== '0.1.0' || manifestCapability.domain !== 'team' || manifestCapability.tags.length !== 2) {
  throw new Error('Expected capability manifest metadata to be preserved.');
}

if (manifestTagMatches.length !== 1 || manifestVersionMatches.length !== 1) {
  throw new Error('Expected capability registry filters to support domain, tag, version, and tag arrays.');
}

runtime.registerCapability({
  name: 'organization.query',
  resource: 'organization',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => ({ id: 'group', name: 'Group' })
});

runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  requiresConfirmation: true,
  execute: async ({ params }) => ({ id: 'org-1', ...params })
});

runtime.registerCapability({
  name: 'organization.delete',
  resource: 'organization',
  action: ActionType.DELETE,
  risk: RiskLevel.HIGH,
  permissions: ['organization:delete'],
  paramsSchema: {
    id: { type: 'string', required: true }
  },
  requiresConfirmation: true,
  execute: async ({ params }) => ({ id: params.id, deleted: true })
});

runtime.registerCapability({
  name: 'organization.metadata',
  resource: 'organization',
  action: ActionType.UPDATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  paramsSchema: {
    id: { type: 'string', required: true }
  },
  allowUnknownParams: true,
  execute: async ({ params }) => params
});

runtime.registerCapability({
  name: 'user.password.update',
  resource: 'user',
  action: ActionType.UPDATE,
  risk: RiskLevel.HIGH,
  permissions: ['user:update'],
  paramsSchema: {
    id: { type: 'string', required: true },
    password: { type: 'string', required: true, sensitive: true },
    token: { type: 'string', required: true }
  },
  requiresConfirmation: true,
  execute: async ({ params }) => ({ id: params.id, storedPassword: params.password })
});

runtime.registerCapability({
  name: 'user.backend.forbidden',
  resource: 'user',
  action: ActionType.UPDATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['user:update'],
  paramsSchema: {
    id: { type: 'string', required: true }
  },
  execute: async () => {
    const error = new Error('Forbidden by backend.');
    error.status = 403;
    throw error;
  }
});

runtime.registerCapability({
  name: 'user.backend.unauthenticated',
  resource: 'user',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['user:query'],
  paramsSchema: {},
  execute: async () => {
    const error = new Error('Login is required.');
    error.response = { status: '401' };
    throw error;
  }
});

runtime.registerCapability({
  name: 'organization.fail',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => {
    throw new Error('Intentional plan failure.');
  }
});

runtime.registerCapability({
  name: 'organization.classify',
  resource: 'organization',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => ({ kind: 'branch' })
});

runtime.registerCapability({
  name: 'organization.finalize',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.LOW,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'finalized-1', ...params })
});

runtime.registerCapability({
  name: 'organization.create.partial',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.LOW,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'partial-1', name: params.name })
});

runtime.registerCapability({
  name: 'organization.rollback.note',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {
    note: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ noted: true, note: params.note })
});

approvalRuntime.registerCapability({
  name: 'organization.classify',
  resource: 'organization',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => ({ kind: 'branch' })
});

approvalRuntime.registerCapability({
  name: 'organization.finalize',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.LOW,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'finalized-1', ...params })
});

rejectionRuntime.registerCapability({
  name: 'organization.classify',
  resource: 'organization',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => ({ kind: 'branch' })
});

rejectionRuntime.registerCapability({
  name: 'organization.finalize',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.LOW,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'finalized-1', ...params })
});

auditRuntime.registerCapability({
  name: 'organization.audit.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.LOW,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'audit-branch', ...params })
});

runtime.registerCapability({
  name: 'organization.parallel.alpha',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => {
    activeParallelExecutions += 1;
    maxParallelExecutions = Math.max(maxParallelExecutions, activeParallelExecutions);
    await new Promise((resolve) => setTimeout(resolve, 40));
    activeParallelExecutions -= 1;
    return { id: 'parallel-alpha' };
  }
});

runtime.registerCapability({
  name: 'organization.parallel.beta',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => {
    activeParallelExecutions += 1;
    maxParallelExecutions = Math.max(maxParallelExecutions, activeParallelExecutions);
    await new Promise((resolve) => setTimeout(resolve, 40));
    activeParallelExecutions -= 1;
    return { id: 'parallel-beta' };
  }
});

runtime.registerCapability({
  name: 'organization.flaky',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => {
    flakyAttempts += 1;

    if (flakyAttempts < 2) {
      throw new Error('Transient failure.');
    }

    return { id: 'flaky-success', attempts: flakyAttempts };
  }
});

runtime.registerCapability({
  name: 'organization.slow',
  resource: 'organization',
  action: ActionType.EXECUTE,
  risk: RiskLevel.LOW,
  permissions: ['organization:query'],
  paramsSchema: {},
  execute: async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
    return { id: 'slow-success' };
  }
});

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

const plan = createPlan({
  intent: 'Create a HIS organization branch.',
  nodes: [
    { id: 'validate-parent', capability: 'organization.query' },
    {
      id: 'create-branch',
      capability: 'organization.create',
      params: { name: 'Branch E', parentId: 'group' }
    }
  ],
  edges: [{ from: 'validate-parent', to: 'create-branch' }]
});

const referencedPlan = createPlan({
  intent: 'Create a HIS organization branch from a previous query result.',
  nodes: [
    { id: 'lookup-parent', capability: 'organization.query' },
    {
      id: 'create-referenced-branch',
      capability: 'organization.create',
      params: {
        name: 'Branch G',
        parentId: { $from: 'lookup-parent', path: 'data.id' }
      }
    }
  ],
  edges: [{ from: 'lookup-parent', to: 'create-referenced-branch' }]
});

const structuredPlanOutput = {
  kind: 'plan',
  plan: referencedPlan
};

const topLevelStructuredPlanOutput = referencedPlan;

const invalidStructuredPlanOutput = parseStructuredPlanOutput({
  type: 'plan',
  plan: {
    id: 'broken-plan-output',
    intent: 'Broken plan output.',
    nodes: 'not-an-array',
    edges: []
  }
});

const parsedTopLevelStructuredPlan = parseStructuredPlanOutput(topLevelStructuredPlanOutput);

const contractPlan = createPlan({
  intent: 'Create a HIS organization branch with explicit input mapping and output contract.',
  nodes: [
    { id: 'lookup-parent-contract', capability: 'organization.query' },
    {
      id: 'create-branch-contract',
      capability: 'organization.create',
      input: {
        name: 'Branch L',
        parentId: { $from: 'lookup-parent-contract', path: 'data.id' }
      },
      inputSchema: {
        name: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      },
      outputSchema: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      }
    }
  ],
  edges: [{ from: 'lookup-parent-contract', to: 'create-branch-contract' }]
});

const invalidContractPlan = createPlan({
  intent: 'Reject an invalid plan node contract.',
  nodes: [
    {
      id: 'invalid-contract-node',
      capability: 'organization.create',
      input: 'bad-input'
    }
  ],
  edges: []
});

const outputContractFailurePlan = createPlan({
  intent: 'Reject a node whose output does not match the declared contract.',
  nodes: [
    {
      id: 'output-contract-failure',
      capability: 'organization.create.partial',
      input: {
        name: 'Branch M',
        parentId: 'group'
      },
      outputSchema: {
        id: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      }
    }
  ],
  edges: []
});

const brokenReferencePlan = createPlan({
  intent: 'Try to create a branch with a missing reference.',
  nodes: [
    {
      id: 'create-with-missing-reference',
      capability: 'organization.create',
      params: {
        name: 'Branch H',
        parentId: { $from: 'missing-node', path: 'data.id' }
      }
    }
  ],
  edges: []
});

const conditionalPlan = createPlan({
  intent: 'Create the matching organization branch from a classified result.',
  nodes: [
    { id: 'classify-organization', capability: 'organization.classify' },
    {
      id: 'create-branch-condition',
      capability: 'organization.create',
      params: { name: 'Branch I', parentId: 'group' }
    },
    {
      id: 'create-department-condition',
      capability: 'organization.create',
      params: { name: 'Department I', parentId: 'group' }
    }
  ],
  edges: [
    {
      from: 'classify-organization',
      to: 'create-branch-condition',
      condition: { path: 'data.kind', equals: 'branch' }
    },
    {
      from: 'classify-organization',
      to: 'create-department-condition',
      condition: { path: 'data.kind', equals: 'department' }
    }
  ]
});

const invalidConditionalPlan = createPlan({
  intent: 'Reject an unsafe condition expression.',
  nodes: [
    { id: 'classify-unsafe', capability: 'organization.classify' },
    { id: 'create-unsafe', capability: 'organization.create' }
  ],
  edges: [
    { from: 'classify-unsafe', to: 'create-unsafe', condition: 'data.kind === "branch"' }
  ]
});

const approvalPlan = createPlan({
  intent: 'Classify, approve, and finalize an organization branch.',
  nodes: [
    { id: 'classify-approval', capability: 'organization.classify' },
    {
      id: 'human-approval',
      type: 'approval',
      intent: 'Approve final branch creation.',
      approval: {
        title: 'Approve branch creation',
        description: 'Human approval is required before finalizing the branch.'
      }
    },
    {
      id: 'finalize-branch',
      capability: 'organization.finalize',
      params: { name: 'Branch J', parentId: 'group' }
    }
  ],
  edges: [
    { from: 'classify-approval', to: 'human-approval' },
    { from: 'human-approval', to: 'finalize-branch' }
  ]
});

const rejectedApprovalPlan = createPlan({
  intent: 'Reject a human approval gate.',
  nodes: [
    { id: 'classify-rejected-approval', capability: 'organization.classify' },
    {
      id: 'human-approval-rejected',
      type: 'approval',
      approval: {
        title: 'Reject branch creation'
      }
    },
    {
      id: 'finalize-rejected-branch',
      capability: 'organization.finalize',
      params: { name: 'Branch K', parentId: 'group' }
    }
  ],
  edges: [
    { from: 'classify-rejected-approval', to: 'human-approval-rejected' },
    { from: 'human-approval-rejected', to: 'finalize-rejected-branch' }
  ]
});

const parallelPlan = createPlan({
  intent: 'Run two independent organization actions in parallel.',
  nodes: [
    { id: 'parallel-alpha', capability: 'organization.parallel.alpha' },
    { id: 'parallel-beta', capability: 'organization.parallel.beta' }
  ],
  edges: []
});

const retryPlan = createPlan({
  intent: 'Retry a transient node failure.',
  nodes: [
    {
      id: 'retry-flaky',
      capability: 'organization.flaky',
      retry: {
        maxAttempts: 2,
        delayMs: 0,
        backoff: 'fixed'
      }
    }
  ],
  edges: []
});

const timeoutPlan = createPlan({
  intent: 'Timeout a slow node.',
  nodes: [
    {
      id: 'timeout-slow',
      capability: 'organization.slow',
      timeout: {
        ms: 20
      },
      retry: {
        maxAttempts: 2,
        delayMs: 0
      }
    }
  ],
  edges: []
});

const planValidation = validatePlan(plan);
const limitedPlanValidation = validatePlan(plan, { maxNodes: 1, maxEdges: 1 });
const invalidConditionalPlanValidation = validatePlan(invalidConditionalPlan);
const invalidContractPlanValidation = validatePlan(invalidContractPlan);
const order = getExecutionOrder(plan);
const planPreview = await runtime.previewPlan(plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const blockedPlanPreview = await runtime.previewPlan(plan, {
  actor: {
    id: 'user-2',
    permissions: []
  }
});
const planResult = await runtime.executePlan(plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const referencedPlanPreview = await runtime.previewPlan(referencedPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const contractPlanPreview = await runtime.previewPlan(contractPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const referencedPlanResult = await runtime.executePlan(referencedPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const parsedStructuredPlan = parseStructuredPlanOutput(structuredPlanOutput);
const parsedStructuredCommandPreview = await runtime.previewCommand(parsedStructuredCommand.data.command, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const parsedStructuredPlanResult = await runtime.executePlan(parsedStructuredPlan.data.plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const contractPlanResult = await runtime.executePlan(contractPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const brokenReferenceResult = await runtime.executePlan(brokenReferencePlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const outputContractFailureResult = await runtime.executePlan(outputContractFailurePlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const approvalPlanPreview = await approvalRuntime.previewPlan(approvalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const approvalPlanResult = await approvalRuntime.executePlan(approvalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const rejectedApprovalPlanResult = await rejectionRuntime.executePlan(rejectedApprovalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const parallelPlanResult = await runtime.executePlan(parallelPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const retryPlanResult = await runtime.executePlan(retryPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const timeoutPlanResult = await runtime.executePlan(timeoutPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const conditionalPlanResult = await runtime.executePlan(conditionalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});

const limitedRuntime = createPivotRuntime({
  planLimits: { maxNodes: 1, maxEdges: 1 }
});
const oversizedPreview = await limitedRuntime.previewPlan(plan);
const oversizedExecution = await limitedRuntime.executePlan(plan);

const failingPlan = createPlan({
  intent: 'Create a branch and compensate on failure.',
  nodes: [
    {
      id: 'create-branch-with-compensation',
      capability: 'organization.create',
      params: { name: 'Branch F', parentId: 'group' },
      compensate: [
        {
          capability: 'organization.delete',
          params: { id: 'org-1' }
        },
        {
          capability: 'organization.rollback.note',
          intent: 'Record rollback for branch F.',
          params: { note: 'branch-f-rollback' },
          metadata: { reason: 'cleanup' }
        }
      ],
      compensation: {
        order: 'forward',
        stopOnFailure: true
      }
    },
    { id: 'fail-after-create', capability: 'organization.fail' }
  ],
  edges: [{ from: 'create-branch-with-compensation', to: 'fail-after-create' }]
});

const failingPlanResult = await runtime.executePlan(failingPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create', 'organization:delete']
  }
});

if (!planValidation.valid || order.map((node) => node.id).join(',') !== 'validate-parent,create-branch') {
  throw new Error('Expected plan validation and execution order to succeed.');
}

if (limitedPlanValidation.valid || !limitedPlanValidation.errors.some((error) => error.includes('node count exceeds limit'))) {
  throw new Error('Expected plan validation limits to reject oversized plans.');
}

if (invalidConditionalPlanValidation.valid || !invalidConditionalPlanValidation.errors.some((error) => error.includes('Unknown plan edge condition'))) {
  throw new Error('Expected plan validation to reject unknown plan edge condition strings.');
}

if (invalidContractPlanValidation.valid || !invalidContractPlanValidation.errors.some((error) => error.includes('Plan node input must be a plain object'))) {
  throw new Error('Expected plan validation to reject invalid node contract shapes.');
}

if (!parsedStructuredCommandPreview.ok || !parsedStructuredCommandPreview.data.requiresConfirmation) {
  throw new Error('Expected parsed structured command output to preview successfully.');
}

if (parsedStructuredCommandPreview.data.command.params.parentId !== 'group') {
  throw new Error('Expected parsed structured command preview to preserve command params.');
}

if (!parsedStructuredPlan.ok || parsedStructuredPlan.data.plan.id !== referencedPlan.id) {
  throw new Error('Expected structured plan output to parse into a plan.');
}

if (parsedStructuredPlanResult.ok !== true || parsedStructuredPlanResult.data.nodes.length !== 2) {
  throw new Error('Expected parsed structured plan output to execute successfully.');
}

if (!parsedTopLevelStructuredPlan.ok || parsedTopLevelStructuredPlan.data.plan.id !== referencedPlan.id) {
  throw new Error('Expected top-level structured plan output to parse into a plan.');
}

if (invalidStructuredPlanOutput.ok || !invalidStructuredPlanOutput.explain.errors.some((error) => error.includes('Plan nodes must be an array.'))) {
  throw new Error('Expected invalid structured plan output to fail validation.');
}

if (!planPreview.ok || !planPreview.data.requiresConfirmation || planPreview.data.status !== 'ready') {
  throw new Error('Expected plan preview to be ready and require confirmation.');
}

if (!Array.isArray(planPreview.explain.timeline) || !planPreview.explain.timeline.some((step) => step.stage === 'plan.node.preview')) {
  throw new Error('Expected plan preview to include node preview timeline steps.');
}

if (blockedPlanPreview.ok || blockedPlanPreview.data.status !== 'blocked') {
  throw new Error('Expected unauthorized plan preview to be blocked.');
}

if (oversizedPreview.ok || oversizedPreview.data.status !== 'blocked') {
  throw new Error('Expected runtime plan preview to block oversized plans.');
}

if (oversizedExecution.ok || oversizedExecution.data.nodes.length !== 0) {
  throw new Error('Expected runtime plan execution to reject oversized plans before nodes run.');
}

if (!referencedPlanPreview.ok || referencedPlanPreview.data.nodes[1].command.params.parentId !== '[ref:lookup-parent.data.id]') {
  throw new Error('Expected plan preview to show node param reference placeholders.');
}

if (!referencedPlanResult.ok || referencedPlanResult.data.nodes[1].result.data.parentId !== 'group') {
  throw new Error('Expected plan execution to resolve params from previous node results.');
}

if (!contractPlanPreview.ok || contractPlanPreview.data.nodes[1].command.params.parentId !== '[ref:lookup-parent-contract.data.id]') {
  throw new Error('Expected input mapping preview to show reference placeholders.');
}

if (!contractPlanResult.ok || contractPlanResult.data.nodes[1].result.data.parentId !== 'group') {
  throw new Error('Expected input mapping execution to resolve mapped node input values.');
}

if (brokenReferenceResult.ok || !brokenReferenceResult.data.nodes[0].result.message.includes('params could not be resolved')) {
  throw new Error('Expected plan execution to fail when a param reference cannot be resolved.');
}

if (outputContractFailureResult.ok || !outputContractFailureResult.data.nodes[0].result.message.includes('output contract failed')) {
  throw new Error('Expected plan execution to fail when a node output violates its contract.');
}

if (!outputContractFailureResult.explain.timeline.some((step) => step.stage === 'plan.node' && step.status === 'failed' && step.metadata.contract === 'output')) {
  throw new Error('Expected output contract failure to appear in the plan timeline.');
}

if (!conditionalPlanResult.ok || conditionalPlanResult.data.nodes.length !== 3) {
  throw new Error('Expected conditional plan execution to finish with executed and skipped branches.');
}

if (!conditionalPlanResult.data.nodes.find((item) => item.node.id === 'create-branch-condition')?.result.ok) {
  throw new Error('Expected matching conditional branch to execute.');
}

if (!conditionalPlanResult.data.nodes.find((item) => item.node.id === 'create-department-condition')?.result.data?.skipped) {
  throw new Error('Expected non-matching conditional branch to be skipped.');
}

if (conditionalPlanResult.explain.skippedNodes !== 1 || conditionalPlanResult.explain.executedNodes !== 2) {
  throw new Error('Expected conditional plan explain counts to distinguish executed and skipped nodes.');
}

if (!conditionalPlanResult.explain.timeline.some((step) => step.stage === 'plan.node' && step.status === 'skipped')) {
  throw new Error('Expected conditional plan timeline to include skipped node steps.');
}

if (!approvalPlanPreview.ok || !approvalPlanPreview.data.requiresConfirmation || !approvalPlanPreview.data.nodes.find((item) => item.node.id === 'human-approval')?.preview.data?.requiresApproval) {
  throw new Error('Expected approval plan preview to require approval.');
}

if (!approvalPlanResult.ok || approvalPlanResult.data.nodes.find((item) => item.node.id === 'human-approval')?.result.audit?.status !== 'confirmed') {
  throw new Error('Expected approval plan to confirm human approval and continue.');
}

if (rejectedApprovalPlanResult.ok || rejectedApprovalPlanResult.data.nodes.find((item) => item.node.id === 'human-approval-rejected')?.result.ok !== false) {
  throw new Error('Expected rejected approval plan to fail at the approval node.');
}

if (rejectedApprovalPlanResult.data.nodes.find((item) => item.node.id === 'finalize-rejected-branch')?.result?.data?.skipped) {
  throw new Error('Expected rejected approval plan to stop before the final node.');
}

if (!approvalCalls.length || approvalCalls[0].approval.title !== 'Approve branch creation') {
  throw new Error('Expected approval adapter to receive approval context.');
}

if (!parallelPlanResult.ok || parallelPlanResult.data.nodes.length !== 2 || maxParallelExecutions < 2) {
  throw new Error('Expected parallel plan execution to run independent nodes concurrently.');
}

if (!parallelPlanResult.explain.timeline.some((step) => step.stage === 'plan.layer' && step.status === 'started' && step.metadata.parallel)) {
  throw new Error('Expected parallel plan timeline to record a parallel layer.');
}

if (!retryPlanResult.ok || retryPlanResult.data.nodes[0].result.data.attempts !== 2 || flakyAttempts !== 2) {
  throw new Error('Expected retry plan execution to retry the flaky node and then succeed.');
}

if (!retryPlanResult.explain.timeline.some((step) => step.stage === 'execution' && step.status === 'retrying')) {
  throw new Error('Expected retry plan timeline to include a retry step.');
}

if (timeoutPlanResult.ok || timeoutPlanResult.data.nodes[0].result.audit?.metadata?.httpStatus !== 504) {
  throw new Error('Expected timeout plan execution to fail with a timeout status.');
}

if (!timeoutPlanResult.explain.timeline.some((step) => step.stage === 'execution' && step.status === 'timed-out')) {
  throw new Error('Expected timeout plan timeline to include a timeout step.');
}

if (!planResult.ok || planResult.data.nodes.length !== 2) {
  throw new Error('Expected plan execution to run both nodes.');
}

if (!Array.isArray(planResult.explain.timeline) || !planResult.explain.timeline.some((step) => step.stage === 'plan.node')) {
  throw new Error('Expected plan execution to include node timeline steps.');
}

if (failingPlanResult.ok || failingPlanResult.data.compensations.length !== 1) {
  throw new Error('Expected failed plan to run one compensation.');
}

if (!failingPlanResult.data.compensations[0].result.ok || failingPlanResult.data.compensations[0].steps.length !== 2) {
  throw new Error('Expected plan compensation to succeed.');
}

if (failingPlanResult.data.compensations[0].steps[0].command?.capability !== 'organization.delete' || failingPlanResult.data.compensations[0].steps[1].command?.capability !== 'organization.rollback.note') {
  throw new Error('Expected plan compensation steps to execute in declared order.');
}

if (!failingPlanResult.explain.timeline.some((step) => step.stage === 'plan.compensation.step') || !failingPlanResult.explain.timeline.some((step) => step.stage === 'plan.compensation')) {
  throw new Error('Expected failed plan timeline to include compensation steps.');
}

const timelineHTML = renderTimelineToHTML(result.explain.timeline);
const resultHTML = renderResultToHTML(failingPlanResult);
const planPreviewHTML = renderPlanPreviewToHTML(planPreview);
const timelineDetailHTML = renderTimelineDetailToHTML(result);
const auditViewerHTML = renderAuditViewerToHTML(auditRuntime.getAuditEvents());
const planGraphHTML = renderPlanGraphToHTML(conditionalPlanResult);
const escapedPlanGraphHTML = renderPlanGraphToHTML({
  plan: {
    id: '<script>plan</script>',
    intent: '<script>graph</script>',
    nodes: [
      {
        id: '<node>',
        capability: '<capability>',
        intent: '<intent>'
      }
    ],
    edges: [
      {
        from: '<node>',
        to: '<node>',
        condition: {
          path: 'data.kind',
          equals: '<img src=x>'
        }
      }
    ]
  }
});
const capabilityBrowserHTML = renderCapabilityBrowserToHTML(manifestRegistry.list(), {
  query: 'team',
  filter: {
    domain: 'team',
    permission: 'team:create',
    tag: 'create'
  }
});
const filteredCapabilityBrowserHTML = renderCapabilityBrowserToHTML(runtime.listCapabilities(), {
  filter: {
    risk: 'medium',
    allowUnknownParams: true
  }
});

if (!timelineHTML.includes('pivot-timeline') || !resultHTML.includes('pivot-result--failed') || !planPreviewHTML.includes('pivot-plan-preview') || !timelineDetailHTML.includes('pivot-timeline-detail') || !auditViewerHTML.includes('pivot-audit-viewer') || !capabilityBrowserHTML.includes('pivot-capability-browser') || !planGraphHTML.includes('pivot-plan-graph')) {
  throw new Error('Expected UI renderers to produce timeline and result markup.');
}

if (!planPreviewHTML.includes('pivot-plan-preview__node') || !planPreviewHTML.includes('validate-parent')) {
  throw new Error('Expected plan preview renderer to include node summaries.');
}

if (!planGraphHTML.includes('pivot-plan-graph__edge-line--conditional') || !planGraphHTML.includes('create-branch-condition') || !planGraphHTML.includes('skipped')) {
  throw new Error('Expected plan graph renderer to include conditional edges and node statuses.');
}

if (escapedPlanGraphHTML.includes('<script>') || escapedPlanGraphHTML.includes('<img') || escapedPlanGraphHTML.includes('<node>')) {
  throw new Error('Expected plan graph renderer to escape HTML content.');
}

if (!capabilityBrowserHTML.includes('team.create') || !capabilityBrowserHTML.includes('pivot-capability-browser__token--permission') || !capabilityBrowserHTML.includes('pivot-capability-browser__detail-label')) {
  throw new Error('Expected capability browser renderer to include capability details and tokens.');
}

if (!filteredCapabilityBrowserHTML.includes('organization.metadata') || filteredCapabilityBrowserHTML.includes('user.password.update')) {
  throw new Error('Expected capability browser filters to narrow the visible capabilities.');
}

const escapedCapabilityBrowserHTML = renderCapabilityBrowserToHTML([
  {
    name: '<script>alert(1)</script>',
    resource: 'test',
    action: 'query',
    risk: 'low',
    permissions: ['test:query'],
    tags: ['<img>'],
    dependencies: ['dep-1'],
    inputSchema: { field: { type: 'string', required: true } },
    outputSchema: { ok: { type: 'boolean' } },
    examples: [{ label: '<b>x</b>', description: '<i>y</i>', params: { nested: '<svg>' } }]
  }
]);

if (escapedCapabilityBrowserHTML.includes('<script>') || escapedCapabilityBrowserHTML.includes('<img>') || escapedCapabilityBrowserHTML.includes('<svg>')) {
  throw new Error('Expected capability browser renderer to escape HTML content.');
}

if (!timelineDetailHTML.includes('pivot-timeline-detail__audit') || !timelineDetailHTML.includes('pivot-timeline-detail__timeline')) {
  throw new Error('Expected timeline detail renderer to include audit and timeline sections.');
}

if (!auditViewerHTML.includes('organization.audit.create') || !auditViewerHTML.includes('audit-user')) {
  throw new Error('Expected audit viewer renderer to include audit entries.');
}

const escapedHTML = renderTimelineToHTML([{ stage: '<script>', status: 'failed', message: '<img src=x onerror=alert(1)>' }]);

if (escapedHTML.includes('<script>') || escapedHTML.includes('<img')) {
  throw new Error('Expected UI renderer to escape HTML content.');
}

const css = readFileSync(new URL('../packages/ui/src/pivot.css', import.meta.url), 'utf8');

if (!css.includes('.pivot-result') || !css.includes('.pivot-timeline') || !css.includes('.pivot-capability-browser') || !css.includes('.pivot-plan-graph')) {
  throw new Error('Expected default PIVOT UI CSS to include result, timeline, capability, and graph styles.');
}

console.log('PIVOT smoke test passed.');
