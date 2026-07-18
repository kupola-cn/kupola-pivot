import {
  ActionType,
  CommandStatus,
  PolicyDecision,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPlan,
  createPivotRuntime
} from '@kupola/pivot';

const auditEvents = [];
const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true,
    approve: async () => true
  },
  auditSinks: [
    (event) => {
      auditEvents.push(event);
    }
  ]
});

runtime.registerCapability({
  name: 'contract.account.lookup',
  resource: 'contract.account',
  action: ActionType.QUERY,
  risk: RiskLevel.LOW,
  permissions: ['contract:account:read'],
  paramsSchema: {
    accountId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({
    id: params.accountId,
    tier: 'starter'
  })
});

runtime.registerCapability({
  name: 'contract.account.upgrade',
  resource: 'contract.account',
  action: ActionType.UPDATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['contract:account:write'],
  requiresConfirmation: true,
  paramsSchema: {
    accountId: { type: 'string', required: true },
    tier: { type: 'string', required: true },
    token: { type: 'string', required: true, sensitive: true }
  },
  dryRun: async ({ params }) => ({
    accountId: params.accountId,
    nextTier: params.tier,
    estimatedMonthlyDelta: 24
  }),
  execute: async ({ params }) => ({
    accountId: params.accountId,
    tier: params.tier,
    upgraded: true
  })
});

runtime.registerCapability({
  name: 'contract.account.rollback',
  resource: 'contract.account',
  action: ActionType.UPDATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['contract:account:write'],
  requiresConfirmation: true,
  paramsSchema: {
    accountId: { type: 'string', required: true },
    reason: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({
    accountId: params.accountId,
    reason: params.reason,
    rolledBack: true
  })
});

runtime.registerCapability({
  name: 'contract.notification.fail',
  resource: 'contract.notification',
  action: ActionType.EXECUTE,
  risk: RiskLevel.MEDIUM,
  permissions: ['contract:account:write'],
  paramsSchema: {
    accountId: { type: 'string', required: true }
  },
  execute: async () => {
    const error = new Error('Notification backend unavailable.');
    error.status = 503;
    throw error;
  }
});

const context = {
  actor: {
    id: 'contract-user',
    permissions: ['contract:account:read', 'contract:account:write']
  },
  auditMetadata: {
    requestId: 'contract-smoke',
    token: 'secret-audit-token'
  }
};

const command = createCommand({
  intent: 'Upgrade account for contract testing.',
  resource: 'contract.account',
  action: ActionType.UPDATE,
  capability: 'contract.account.upgrade',
  risk: RiskLevel.MEDIUM,
  params: {
    accountId: 'acct-contract',
    tier: 'pro',
    token: 'secret-command-token'
  }
});

const preview = await runtime.previewCommand(command, context);
assertResultShape(preview, 'previewCommand');

if (!preview.ok || !preview.data.requiresConfirmation) {
  throw new Error('Expected previewCommand contract result to require confirmation.');
}

if (preview.data.command.params.token !== '[redacted]') {
  throw new Error('Expected previewCommand contract result to redact sensitive params.');
}

if ('execute' in preview.data.capability || 'dryRun' in preview.data.capability) {
  throw new Error('Expected previewCommand capability contract to omit executable functions.');
}

if (runtime.getAuditEvents().length !== 0) {
  throw new Error('Expected previewCommand contract to avoid creating audit events.');
}

const simulation = await runtime.simulateCommand(command, context);
assertResultShape(simulation, 'simulateCommand');

if (!simulation.ok || simulation.data.simulation.estimatedMonthlyDelta !== 24) {
  throw new Error('Expected simulateCommand contract result to include dry-run data.');
}

if (simulation.audit !== null || runtime.getAuditEvents().length !== 0) {
  throw new Error('Expected simulateCommand contract to avoid creating audit events.');
}

const execution = await runtime.executeCommand(command, context);
assertResultShape(execution, 'executeCommand');
assertAuditShape(execution.audit, {
  capability: 'contract.account.upgrade',
  status: CommandStatus.EXECUTED
});

if (!execution.ok || execution.data.tier !== 'pro') {
  throw new Error('Expected executeCommand contract result to include execution data.');
}

if (execution.audit.metadata.token !== '[redacted]') {
  throw new Error('Expected executeCommand audit contract to redact sensitive metadata.');
}

const plan = createPlan({
  intent: 'Lookup, approve, upgrade, notify, and compensate on failure.',
  nodes: [
    {
      id: 'lookup',
      capability: 'contract.account.lookup',
      params: { accountId: 'acct-contract' }
    },
    {
      id: 'approval',
      type: 'approval',
      approval: {
        title: 'Approve contract plan'
      }
    },
    {
      id: 'upgrade',
      capability: 'contract.account.upgrade',
      params: {
        accountId: { $from: 'lookup', path: 'data.id' },
        tier: 'enterprise',
        token: 'secret-plan-token'
      },
      compensate: {
        capability: 'contract.account.rollback',
        params: {
          accountId: { $from: 'lookup', path: 'data.id' },
          reason: 'Plan notification failed.'
        }
      }
    },
    {
      id: 'notify',
      capability: 'contract.notification.fail',
      params: {
        accountId: { $from: 'lookup', path: 'data.id' }
      }
    }
  ],
  edges: [
    { from: 'lookup', to: 'approval' },
    { from: 'approval', to: 'upgrade' },
    { from: 'upgrade', to: 'notify' }
  ]
});

const planPreview = await runtime.previewPlan(plan, context);
assertResultShape(planPreview, 'previewPlan');

if (!planPreview.ok || planPreview.data.status !== 'ready' || planPreview.data.nodes.length !== 4) {
  throw new Error('Expected previewPlan contract result to expose ready node previews.');
}

if (!planPreview.data.nodes.find((entry) => entry.node.id === 'approval')?.preview.data?.requiresApproval) {
  throw new Error('Expected previewPlan contract result to expose approval preview data.');
}

const planExecution = await runtime.executePlan(plan, context);
assertResultShape(planExecution, 'executePlan');

if (planExecution.ok || planExecution.data.status !== 'failed') {
  throw new Error('Expected executePlan contract result to fail after notification failure.');
}

if (planExecution.data.nodes.length !== 4 || planExecution.data.compensations.length < 1) {
  throw new Error('Expected executePlan contract result to include nodes and compensation records.');
}

const upgradeCompensation = planExecution.data.compensations.find((entry) => entry.node.id === 'upgrade');

if (!upgradeCompensation?.steps?.length) {
  throw new Error('Expected executePlan contract result to include compensation step records.');
}

if (planExecution.explain.compensationSteps !== 1 || planExecution.explain.failedNodes !== 1) {
  throw new Error('Expected executePlan contract explain summary to include compensation and failure counts.');
}

const approvalAudit = planExecution.data.nodes.find((entry) => entry.node.id === 'approval')?.result.audit;
assertAuditShape(approvalAudit, {
  capability: 'approval',
  status: CommandStatus.CONFIRMED
});

if (!auditEvents.some((event) => event.capability === 'contract.notification.fail' && event.metadata.httpStatus === 503)) {
  throw new Error('Expected audit event contract to preserve backend failure status.');
}

console.log('PIVOT API contract smoke test passed.');

function assertResultShape(result, label) {
  if (!result || typeof result !== 'object') {
    throw new Error(`Expected ${label} to return a result object.`);
  }

  if (typeof result.ok !== 'boolean' || typeof result.message !== 'string') {
    throw new Error(`Expected ${label} result to expose ok and message.`);
  }

  if (!Object.hasOwn(result, 'data') || !Object.hasOwn(result, 'explain') || !Object.hasOwn(result, 'audit')) {
    throw new Error(`Expected ${label} result to expose data, explain, and audit fields.`);
  }

  if (!Array.isArray(result.explain?.timeline)) {
    throw new Error(`Expected ${label} result to expose explain.timeline.`);
  }
}

function assertAuditShape(audit, expected = {}) {
  if (!audit || typeof audit !== 'object') {
    throw new Error('Expected audit contract to expose an audit event object.');
  }

  for (const field of ['id', 'timestamp', 'intent', 'commandId', 'capability', 'decision', 'status', 'reason', 'metadata']) {
    if (!Object.hasOwn(audit, field)) {
      throw new Error(`Expected audit contract to expose field: ${field}.`);
    }
  }

  if (expected.capability && audit.capability !== expected.capability) {
    throw new Error(`Expected audit capability ${expected.capability}, got ${audit.capability}.`);
  }

  if (expected.status && audit.status !== expected.status) {
    throw new Error(`Expected audit status ${expected.status}, got ${audit.status}.`);
  }

  if (![PolicyDecision.ALLOW, PolicyDecision.CONFIRM, PolicyDecision.DENY, PolicyDecision.ESCALATE].includes(audit.decision)) {
    throw new Error(`Expected audit decision to use a known policy decision, got ${audit.decision}.`);
  }
}
