import {
  ActionType,
  RiskLevel,
  createPermissionPolicy,
  createPivotRuntime,
  createTrustedUIAdapter,
  parseStructuredPlanOutput,
  renderAuditViewerToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const auditSinkEvents = [];
const uiEvents = [];

const ui = createTrustedUIAdapter({
  openAssistant(options) {
    uiEvents.push({ type: 'open', title: options?.title ?? 'PIVOT Assistant' });
  },
  closeAssistant() {
    uiEvents.push({ type: 'close' });
  },
  confirm: async (input) => {
    uiEvents.push({ type: 'confirm', capability: input.command?.capability ?? '' });
    return true;
  },
  approve: async (input) => {
    uiEvents.push({ type: 'approve', title: input.approval?.title ?? '' });
    return true;
  }
});

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui,
  auditSinks: [
    async (event) => {
      auditSinkEvents.push({
        status: event.status,
        decision: event.decision,
        capability: event.capability,
        metadata: event.metadata
      });
    }
  ]
});

const api = createRetentionApi();
registerCapabilities(runtime);

const context = {
  actor: {
    id: 'success-manager-1',
    permissions: [
      'crm:account:read',
      'crm:offer:create',
      'crm:offer:apply',
      'crm:offer:revoke',
      'crm:csm:notify'
    ]
  },
  api,
  auditMetadata: {
    requestId: 'ai-retention-001',
    token: 'sink-secret-token'
  }
};

const invalidProposal = await draftRetentionPlan({ repair: false });
const invalidParse = parseStructuredPlanOutput(invalidProposal);

if (!invalidParse.ok) {
  console.log('validation feedback:', invalidParse.explain.errors);
}

const repairedProposal = await draftRetentionPlan({
  repair: true,
  feedback: invalidParse.explain.errors
});
const parsedPlan = parseStructuredPlanOutput(repairedProposal);

if (!parsedPlan.ok) {
  throw new Error(`Expected repaired AI plan to parse: ${parsedPlan.explain.errors.join('; ')}`);
}

const preview = await runtime.previewPlan(parsedPlan.data.plan, context);

if (!preview.ok) {
  throw new Error(`Expected repaired AI plan preview to succeed: ${preview.message}`);
}

ui.openAssistant({ title: 'Retention workflow preview' });
console.log('plan preview:', summarizePlanPreview(preview));
console.log('preview html snippet:', renderPlanPreviewToHTML(preview).slice(0, 180).replace(/\s+/g, ' '));

const result = await runtime.executePlan(parsedPlan.data.plan, context);
ui.closeAssistant();

console.log('plan result:', summarizePlanResult(result));
console.log('timeline html snippet:', renderTimelineDetailToHTML(result).slice(0, 180).replace(/\s+/g, ' '));
console.log('audit viewer snippet:', renderAuditViewerToHTML(runtime.getAuditEvents()).slice(0, 180).replace(/\s+/g, ' '));
console.log('audit sink summary:', summarizeAuditSink(auditSinkEvents));
console.log('trusted ui events:', uiEvents);

function registerCapabilities(targetRuntime) {
  targetRuntime.registerCapability({
    name: 'crm.account.lookup',
    resource: 'crm.account',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['crm:account:read'],
    paramsSchema: {
      accountId: { type: 'string', required: true }
    },
    outputSchema: {
      id: { type: 'string', required: true },
      name: { type: 'string', required: true },
      riskScore: { type: 'number', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.lookupAccount(params.accountId)
  });

  targetRuntime.registerCapability({
    name: 'crm.retention.offer.draft',
    resource: 'crm.retention.offer',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['crm:offer:create'],
    requiresConfirmation: true,
    paramsSchema: {
      accountId: { type: 'string', required: true },
      discountPct: { type: 'number', required: true },
      expiresInDays: { type: 'number', required: true }
    },
    outputSchema: {
      id: { type: 'string', required: true },
      accountId: { type: 'string', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.draftOffer(params)
  });

  targetRuntime.registerCapability({
    name: 'crm.retention.offer.apply',
    resource: 'crm.retention.offer',
    action: ActionType.UPDATE,
    risk: RiskLevel.HIGH,
    permissions: ['crm:offer:apply'],
    requiresConfirmation: true,
    paramsSchema: {
      offerId: { type: 'string', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.applyOffer(params.offerId)
  });

  targetRuntime.registerCapability({
    name: 'crm.retention.offer.revoke',
    resource: 'crm.retention.offer',
    action: ActionType.UPDATE,
    risk: RiskLevel.HIGH,
    permissions: ['crm:offer:revoke'],
    requiresConfirmation: true,
    paramsSchema: {
      offerId: { type: 'string', required: true },
      reason: { type: 'string', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.revokeOffer(params)
  });

  targetRuntime.registerCapability({
    name: 'crm.retention.csm.notify',
    resource: 'crm.retention.notification',
    action: ActionType.EXECUTE,
    risk: RiskLevel.MEDIUM,
    permissions: ['crm:csm:notify'],
    paramsSchema: {
      accountId: { type: 'string', required: true },
      offerId: { type: 'string', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.notifyCsm(params)
  });
}

async function draftRetentionPlan({ repair }) {
  if (!repair) {
    return {
      kind: 'plan',
      plan: {
        intent: 'Prepare a retention offer for an at-risk enterprise account.',
        nodes: [
          {
            id: 'lookup-account',
            capability: 'crm.account.lookup',
            params: { accountId: 'acct-risk' }
          }
        ],
        edges: 'lookup-account -> draft-offer'
      }
    };
  }

  return {
    kind: 'plan',
    plan: {
      intent: 'Prepare, approve, apply, and notify a retention offer for an at-risk enterprise account.',
      nodes: [
        {
          id: 'lookup-account',
          capability: 'crm.account.lookup',
          params: { accountId: 'acct-risk' },
          outputSchema: {
            id: { type: 'string', required: true },
            name: { type: 'string', required: true },
            riskScore: { type: 'number', required: true }
          }
        },
        {
          id: 'draft-offer',
          capability: 'crm.retention.offer.draft',
          params: {
            accountId: { $from: 'lookup-account', path: 'data.id' },
            discountPct: 18,
            expiresInDays: 14
          },
          outputSchema: {
            id: { type: 'string', required: true },
            accountId: { type: 'string', required: true }
          }
        },
        {
          id: 'finance-approval',
          type: 'approval',
          approval: {
            title: 'Approve retention discount',
            description: 'Finance approval is required before applying an 18 percent retention offer.',
            requiredPermission: 'crm:offer:apply',
            metadata: { source: 'ai-proposal' }
          }
        },
        {
          id: 'apply-offer',
          capability: 'crm.retention.offer.apply',
          params: {
            offerId: { $from: 'draft-offer', path: 'data.id' }
          },
          compensate: [
            {
              capability: 'crm.retention.offer.revoke',
              params: {
                offerId: { $from: 'draft-offer', path: 'data.id' },
                reason: 'Downstream CSM notification failed after offer application.'
              }
            }
          ]
        },
        {
          id: 'notify-csm',
          capability: 'crm.retention.csm.notify',
          params: {
            accountId: { $from: 'lookup-account', path: 'data.id' },
            offerId: { $from: 'draft-offer', path: 'data.id' }
          }
        }
      ],
      edges: [
        { from: 'lookup-account', to: 'draft-offer' },
        { from: 'draft-offer', to: 'finance-approval' },
        { from: 'finance-approval', to: 'apply-offer' },
        { from: 'apply-offer', to: 'notify-csm' }
      ]
    }
  };
}

function createRetentionApi() {
  const offers = [];
  const revokedOffers = [];

  return {
    async lookupAccount(accountId) {
      return {
        id: accountId,
        name: 'Globex Enterprise',
        riskScore: 92
      };
    },

    async draftOffer(input) {
      const offer = {
        id: `offer-${offers.length + 1}`,
        accountId: input.accountId,
        discountPct: input.discountPct,
        expiresInDays: input.expiresInDays,
        status: 'draft'
      };

      offers.push(offer);
      return offer;
    },

    async applyOffer(offerId) {
      const offer = offers.find((item) => item.id === offerId);

      if (!offer) {
        const error = new Error(`Offer ${offerId} was not found.`);
        error.status = 404;
        throw error;
      }

      offer.status = 'applied';
      return { id: offer.id, accountId: offer.accountId, status: 'applied' };
    },

    async revokeOffer(input) {
      revokedOffers.push(input);
      return { offerId: input.offerId, revoked: true, count: revokedOffers.length };
    },

    async notifyCsm() {
      const error = new Error('CSM notification service is temporarily unavailable.');
      error.status = 503;
      throw error;
    }
  };
}

function summarizePlanPreview(preview) {
  return {
    ok: preview.ok,
    status: preview.data.status,
    requiresConfirmation: preview.data.requiresConfirmation,
    nodes: preview.data.nodes.map((entry) => ({
      id: entry.node.id,
      ok: entry.preview.ok,
      requiresApproval: Boolean(entry.preview.data?.requiresApproval)
    }))
  };
}

function summarizePlanResult(result) {
  return {
    ok: result.ok,
    message: result.message,
    nodes: result.data.nodes.map((entry) => ({
      id: entry.node.id,
      ok: entry.result.ok,
      status: entry.result.audit?.status ?? entry.result.data?.status
    })),
    compensationSteps: result.data.compensations.reduce((count, entry) => count + entry.steps.length, 0)
  };
}

function summarizeAuditSink(events) {
  return {
    count: events.length,
    capabilities: events.map((event) => event.capability),
    redacted: events.every((event) => event.metadata?.token === '[redacted]')
  };
}
