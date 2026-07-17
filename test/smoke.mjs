import {
  ActionType,
  RiskLevel,
  createCommand,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
  getExecutionOrder,
  redactParams,
  renderResultToHTML,
  renderTimelineToHTML,
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

if (command.id === secondCommand.id) {
  throw new Error('Expected command IDs to be unique.');
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

const planValidation = validatePlan(plan);
const order = getExecutionOrder(plan);
const planResult = await runtime.executePlan(plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});

const failingPlan = createPlan({
  intent: 'Create a branch and compensate on failure.',
  nodes: [
    {
      id: 'create-branch-with-compensation',
      capability: 'organization.create',
      params: { name: 'Branch F', parentId: 'group' },
      compensate: {
        capability: 'organization.delete',
        params: { id: 'org-1' }
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

if (!planResult.ok || planResult.data.nodes.length !== 2) {
  throw new Error('Expected plan execution to run both nodes.');
}

if (!Array.isArray(planResult.explain.timeline) || !planResult.explain.timeline.some((step) => step.stage === 'plan.node')) {
  throw new Error('Expected plan execution to include node timeline steps.');
}

if (failingPlanResult.ok || failingPlanResult.data.compensations.length !== 1) {
  throw new Error('Expected failed plan to run one compensation.');
}

if (!failingPlanResult.data.compensations[0].result.ok) {
  throw new Error('Expected plan compensation to succeed.');
}

if (!failingPlanResult.explain.timeline.some((step) => step.stage === 'plan.compensation')) {
  throw new Error('Expected failed plan timeline to include compensation steps.');
}

const timelineHTML = renderTimelineToHTML(result.explain.timeline);
const resultHTML = renderResultToHTML(failingPlanResult);

if (!timelineHTML.includes('pivot-timeline') || !resultHTML.includes('pivot-result--failed')) {
  throw new Error('Expected UI renderers to produce timeline and result markup.');
}

const escapedHTML = renderTimelineToHTML([{ stage: '<script>', status: 'failed', message: '<img src=x onerror=alert(1)>' }]);

if (escapedHTML.includes('<script>') || escapedHTML.includes('<img')) {
  throw new Error('Expected UI renderer to escape HTML content.');
}

const css = readFileSync(new URL('../packages/ui/src/pivot.css', import.meta.url), 'utf8');

if (!css.includes('.pivot-result') || !css.includes('.pivot-timeline')) {
  throw new Error('Expected default PIVOT UI CSS to include result and timeline styles.');
}

console.log('PIVOT smoke test passed.');
