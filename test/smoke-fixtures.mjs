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

const assistantEvents = [];
const assistantUI = createTrustedUIAdapter({
  openAssistant: (options) => assistantEvents.push({ type: 'open', title: options?.title ?? '' }),
  closeAssistant: () => assistantEvents.push({ type: 'close' }),
  confirm: async (input) => {
    assistantEvents.push({ type: 'confirm', capability: input?.command?.capability ?? '' });
    return true;
  }
});

const assistantApproval = await assistantUI.approve({
  command: {
    capability: 'organization.create'
  }
});

assistantUI.openAssistant({ title: 'Assistant' });
assistantUI.closeAssistant();

if (!assistantApproval || assistantEvents.length !== 3 || assistantEvents[0].type !== 'confirm' || assistantEvents[1].type !== 'open' || assistantEvents[2].type !== 'close') {
  throw new Error('Expected trusted UI adapter confirm fallback and assistant surface hooks to work.');
}

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


export {
  lastConfirmInput,
  runtime,
  approvalCalls,
  activeParallelExecutions,
  maxParallelExecutions,
  flakyAttempts,
  approvalRuntime,
  assistantEvents,
  assistantUI,
  rejectionRuntime,
  auditNotifications,
  auditRuntime,
  isolatedRegistry,
  immutableCapability,
  manifestRegistry,
  manifestCapability
};
