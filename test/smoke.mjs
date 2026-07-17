import {
  ActionType,
  RiskLevel,
  createCommand,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
  getExecutionOrder,
  validatePlan
} from '@kupola/pivot';

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true
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

if (!result.ok || result.data.name !== 'Branch C') {
  throw new Error('Expected command execution to succeed.');
}

if (runtime.getAuditEvents().length !== 1) {
  throw new Error('Expected exactly one audit event.');
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

if (!planValidation.valid || order.map((node) => node.id).join(',') !== 'validate-parent,create-branch') {
  throw new Error('Expected plan validation and execution order to succeed.');
}

if (!planResult.ok || planResult.data.nodes.length !== 2) {
  throw new Error('Expected plan execution to run both nodes.');
}

console.log('PIVOT smoke test passed.');
