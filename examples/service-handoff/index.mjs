import {
  ActionType,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPlan,
  createPivotRuntime,
  createTrustedUIAdapter,
  renderAuditViewerToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const auditEvents = [];

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: createTrustedUIAdapter({
    confirm: async (input) => {
      console.log(`[confirm] ${input.command?.capability ?? input.command?.intent ?? 'command'}`);
      return true;
    },
    approve: async (input) => {
      console.log(`[approve] ${input.approval?.title ?? 'plan step'}`);
      return true;
    }
  }),
  auditSinks: [
    (event) => {
      auditEvents.push({
        capability: event.capability,
        decision: event.decision,
        status: event.status,
        metadata: event.metadata
      });
    }
  ]
});

registerCapabilities(runtime);

const service = createPivotService(runtime);
const adminToken = 'Bearer service-admin-token';
const viewerToken = 'Bearer service-viewer-token';

const capabilityCatalog = await service.getCapabilities({
  headers: {
    authorization: viewerToken,
    'x-request-id': 'svc-catalog-001'
  }
});

const upgradeCommand = createCommand({
  intent: 'Upgrade the premium account for a pilot tenant.',
  resource: 'account.subscription',
  action: ActionType.UPDATE,
  capability: 'account.subscription.upgrade',
  risk: RiskLevel.MEDIUM,
  params: {
    accountId: 'acct-42',
    tier: 'pro'
  }
});

const commandPreview = await service.previewCommand({
  headers: {
    authorization: adminToken,
    'x-request-id': 'svc-preview-001'
  },
  body: {
    command: upgradeCommand
  }
});

const commandSimulation = await service.simulateCommand({
  headers: {
    authorization: adminToken,
    'x-request-id': 'svc-sim-001'
  },
  body: {
    command: upgradeCommand
  }
});

const commandExecution = await service.executeCommand({
  headers: {
    authorization: adminToken,
    'x-request-id': 'svc-exec-001'
  },
  body: {
    command: upgradeCommand
  }
});

const deniedExecution = await service.executeCommand({
  headers: {
    authorization: viewerToken,
    'x-request-id': 'svc-denied-001'
  },
  body: {
    command: upgradeCommand
  }
});

const upgradePlan = createPlan({
  intent: 'Lookup the account, approve the upgrade, execute the upgrade, and notify the customer.',
  nodes: [
    {
      id: 'lookup-account',
      capability: 'account.lookup',
      params: {
        accountId: 'acct-42'
      }
    },
    {
      id: 'upgrade-approval',
      type: 'approval',
      approval: {
        title: 'Approve account upgrade',
        description: 'Human approval is required before the service plan executes.'
      }
    },
    {
      id: 'apply-upgrade',
      capability: 'account.subscription.upgrade',
      params: {
        accountId: { $from: 'lookup-account', path: 'data.id' },
        tier: 'pro'
      },
      compensate: [
        {
          capability: 'account.subscription.downgrade',
          params: {
            accountId: { $from: 'lookup-account', path: 'data.id' },
            reason: 'Rollback after notification failure.'
          }
        }
      ]
    },
    {
      id: 'notify-customer',
      capability: 'account.notification.send',
      params: {
        accountId: { $from: 'lookup-account', path: 'data.id' },
        tier: 'pro'
      }
    }
  ],
  edges: [
    { from: 'lookup-account', to: 'upgrade-approval' },
    { from: 'upgrade-approval', to: 'apply-upgrade' },
    { from: 'apply-upgrade', to: 'notify-customer' }
  ]
});

const planPreview = await service.previewPlan({
  headers: {
    authorization: adminToken,
    'x-request-id': 'svc-plan-preview-001'
  },
  body: {
    plan: upgradePlan
  }
});

const planExecution = await service.executePlan({
  headers: {
    authorization: adminToken,
    'x-request-id': 'svc-plan-exec-001'
  },
  body: {
    plan: upgradePlan
  }
});

console.log('capabilities:', summarizeResponse(capabilityCatalog));
console.log('command preview:', summarizeResponse(commandPreview));
console.log('command simulation:', summarizeResponse(commandSimulation));
console.log('command execution:', summarizeResponse(commandExecution));
console.log('denied execution:', summarizeResponse(deniedExecution));
console.log('plan preview:', summarizeResponse(planPreview));
console.log('plan execution:', summarizeResponse(planExecution));
console.log('preview html snippet:', renderPlanPreviewToHTML(planPreview.body).slice(0, 180).replace(/\s+/g, ' '));
console.log('timeline html snippet:', renderTimelineDetailToHTML(planExecution.body).slice(0, 180).replace(/\s+/g, ' '));
console.log('audit html snippet:', renderAuditViewerToHTML(auditEvents).slice(0, 180).replace(/\s+/g, ' '));
console.log('audit events:', auditEvents.length);

if (capabilityCatalog.status !== 200 || capabilityCatalog.body.capabilities.length !== 4) {
  throw new Error('Expected capability metadata endpoint to return the visible service catalog.');
}

if (commandPreview.status !== 200 || commandPreview.body.ok !== true) {
  throw new Error('Expected service preview endpoint to return a successful preview.');
}

if (commandSimulation.status !== 200 || commandSimulation.body.data?.simulation?.estimate?.monthlyDelta !== 24) {
  throw new Error('Expected service simulate endpoint to return dry-run estimation.');
}

if (commandExecution.status !== 200 || commandExecution.body.ok !== true) {
  throw new Error('Expected service execution endpoint to return a success result.');
}

if (deniedExecution.status !== 403 || deniedExecution.body.ok !== false) {
  throw new Error('Expected unauthorized service execution to be rejected.');
}

if (planPreview.status !== 200 || !planPreview.body.data?.requiresConfirmation) {
  throw new Error('Expected service plan preview to require confirmation.');
}

if (planExecution.status !== 200 || planExecution.body.ok !== false) {
  throw new Error('Expected service plan execution to fail after notification failure.');
}

if (!planExecution.body.data?.compensations?.[0]?.steps?.length) {
  throw new Error('Expected service plan execution to record compensation steps.');
}

if (!auditEvents.some((event) => event.capability === 'account.subscription.upgrade' && event.status === 'executed')) {
  throw new Error('Expected audit sink to capture the executed upgrade command.');
}

if (!auditEvents.some((event) => event.capability === 'approval' && event.status === 'confirmed')) {
  throw new Error('Expected audit sink to capture the approval gate.');
}

if (!auditEvents.some((event) => event.capability === 'account.notification.send' && event.metadata.httpStatus === 503)) {
  throw new Error('Expected audit sink to capture the backend failure status.');
}

export {
  auditEvents,
  capabilityCatalog,
  commandExecution,
  commandPreview,
  commandSimulation,
  deniedExecution,
  planExecution,
  planPreview,
  runtime
};

function registerCapabilities(targetRuntime) {
  targetRuntime.registerCapability({
    name: 'account.lookup',
    resource: 'account',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['account:read'],
    paramsSchema: {
      accountId: { type: 'string', required: true }
    },
    execute: async ({ params }) => ({
      id: params.accountId,
      tier: 'starter',
      state: 'active'
    })
  });

  targetRuntime.registerCapability({
    name: 'account.subscription.upgrade',
    resource: 'account.subscription',
    action: ActionType.UPDATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['account:write'],
    requiresConfirmation: true,
    paramsSchema: {
      accountId: { type: 'string', required: true },
      tier: { type: 'string', required: true }
    },
    dryRun: async ({ params }) => ({
      estimate: {
        monthlyDelta: 24,
        risk: 'moderate'
      },
      preview: {
        accountId: params.accountId,
        tier: params.tier
      }
    }),
    execute: async ({ params }) => ({
      accountId: params.accountId,
      tier: params.tier,
      state: 'upgraded'
    })
  });

  targetRuntime.registerCapability({
    name: 'account.subscription.downgrade',
    resource: 'account.subscription',
    action: ActionType.UPDATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['account:write'],
    requiresConfirmation: true,
    paramsSchema: {
      accountId: { type: 'string', required: true },
      reason: { type: 'string', required: true }
    },
    execute: async ({ params }) => ({
      accountId: params.accountId,
      reason: params.reason,
      state: 'downgraded'
    })
  });

  targetRuntime.registerCapability({
    name: 'account.notification.send',
    resource: 'account.notification',
    action: ActionType.EXECUTE,
    risk: RiskLevel.MEDIUM,
    permissions: ['account:write'],
    paramsSchema: {
      accountId: { type: 'string', required: true },
      tier: { type: 'string', required: true }
    },
    execute: async () => {
      const error = new Error('Notification service is unavailable.');
      error.status = 503;
      throw error;
    }
  });
}

function createPivotService(targetRuntime) {
  return {
    async getCapabilities(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, {
          ok: false,
          message: 'Authentication required.'
        });
      }

      return json(200, {
        ok: true,
        capabilities: targetRuntime.listCapabilities().map(summarizeCapability),
        policyContext: {
          permissions: actor.permissions,
          role: actor.role,
          tenantId: actor.tenantId
        }
      });
    },

    async previewCommand(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, { ok: false, message: 'Authentication required.' });
      }

      return json(200, await targetRuntime.previewCommand(request.body?.command, withContext(request, actor)));
    },

    async simulateCommand(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, { ok: false, message: 'Authentication required.' });
      }

      return json(200, await targetRuntime.simulateCommand(request.body?.command, withContext(request, actor)));
    },

    async executeCommand(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, { ok: false, message: 'Authentication required.' });
      }

      if (!actor.permissions.includes('account:write')) {
        return json(403, { ok: false, message: 'Forbidden.' });
      }

      return json(200, await targetRuntime.executeCommand(request.body?.command, withContext(request, actor)));
    },

    async previewPlan(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, { ok: false, message: 'Authentication required.' });
      }

      return json(200, await targetRuntime.previewPlan(request.body?.plan, withContext(request, actor)));
    },

    async executePlan(request) {
      const actor = authenticate(request);

      if (!actor) {
        return json(401, { ok: false, message: 'Authentication required.' });
      }

      return json(200, await targetRuntime.executePlan(request.body?.plan, withContext(request, actor)));
    }
  };
}

function authenticate(request) {
  const authorization = request?.headers?.authorization;

  if (authorization === 'Bearer service-admin-token') {
    return {
      id: 'service-admin',
      role: 'admin',
      tenantId: 'tenant-a',
      permissions: ['account:read', 'account:write']
    };
  }

  if (authorization === 'Bearer service-viewer-token') {
    return {
      id: 'service-viewer',
      role: 'viewer',
      tenantId: 'tenant-a',
      permissions: ['account:read']
    };
  }

  return null;
}

function withContext(request, actor) {
  return {
    actor,
    auditMetadata: {
      requestId: request?.headers?.['x-request-id'] ?? '',
      route: request?.route ?? ''
    }
  };
}

function summarizeCapability(capability) {
  return {
    name: capability.name,
    resource: capability.resource,
    action: capability.action,
    risk: capability.risk,
    permissions: capability.permissions,
    requiresConfirmation: capability.requiresConfirmation,
    hasDryRun: typeof capability.dryRun === 'function'
  };
}

function summarizeResponse(response) {
  const body = response.body ?? {};
  const data = body.data ?? body.capabilities ?? null;

  return {
    status: response.status,
    ok: body.ok,
    message: body.message ?? '',
    itemCount: Array.isArray(body.capabilities)
      ? body.capabilities.length
      : data && typeof data === 'object'
        ? Object.keys(data).length
        : 0
  };
}

function json(status, body) {
  return { status, body };
}
