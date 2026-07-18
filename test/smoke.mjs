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

const planValidation = validatePlan(plan);
const limitedPlanValidation = validatePlan(plan, { maxNodes: 1, maxEdges: 1 });
const invalidConditionalPlanValidation = validatePlan(invalidConditionalPlan);
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
const referencedPlanResult = await runtime.executePlan(referencedPlan, {
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

if (limitedPlanValidation.valid || !limitedPlanValidation.errors.some((error) => error.includes('node count exceeds limit'))) {
  throw new Error('Expected plan validation limits to reject oversized plans.');
}

if (invalidConditionalPlanValidation.valid || !invalidConditionalPlanValidation.errors.some((error) => error.includes('Unknown plan edge condition'))) {
  throw new Error('Expected plan validation to reject unknown plan edge condition strings.');
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

if (brokenReferenceResult.ok || !brokenReferenceResult.data.nodes[0].result.message.includes('params could not be resolved')) {
  throw new Error('Expected plan execution to fail when a param reference cannot be resolved.');
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
