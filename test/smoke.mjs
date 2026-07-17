import { ActionType, RiskLevel, createCommand, createPivotRuntime } from '@kupola/pivot';

const runtime = createPivotRuntime({
  ui: {
    confirm: async () => true
  }
});

runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
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

const validation = runtime.validateCommand(command);
const result = await runtime.executeCommand(command, { actor: { id: 'user-1' } });

if (!validation.valid) {
  throw new Error(`Expected valid command, got: ${validation.errors.join('; ')}`);
}

if (!result.ok || result.data.name !== 'Branch C') {
  throw new Error('Expected command execution to succeed.');
}

if (runtime.getAuditEvents().length !== 1) {
  throw new Error('Expected exactly one audit event.');
}

console.log('PIVOT smoke test passed.');
