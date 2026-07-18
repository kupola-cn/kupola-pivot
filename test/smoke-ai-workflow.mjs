import {
  ActionType,
  RiskLevel,
  createPermissionPolicy,
  createPivotRuntime,
  parseStructuredPlanOutput,
  renderAuditViewerToHTML,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const approvalCalls = [];
const auditEvents = [];
const apiState = {
  offers: [],
  revoked: []
};

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true,
    approve: async (input) => {
      approvalCalls.push(input);
      return true;
    }
  },
  auditSinks: [
    (event) => {
      auditEvents.push(event);
    }
  ]
});

registerCrmCapabilities(runtime);

const invalidAiPlan = parseStructuredPlanOutput({
  kind: 'plan',
  plan: {
    intent: 'Apply a retention offer from AI output.',
    nodes: [{ id: 'lookup-account', capability: 'crm.account.lookup' }],
    edges: 'lookup-account -> draft-offer'
  }
});

if (invalidAiPlan.ok || !invalidAiPlan.explain.errors.some((error) => error.includes('Plan edges must be an array.'))) {
  throw new Error('Expected invalid AI plan output to return validation feedback.');
}

const parsedAiPlan = parseStructuredPlanOutput({
  kind: 'plan',
  plan: {
    intent: 'Prepare, approve, apply, and notify a retention offer.',
    nodes: [
      {
        id: 'lookup-account',
        capability: 'crm.account.lookup',
        params: { accountId: 'acct-risk' },
        outputSchema: {
          id: { type: 'string', required: true }
        }
      },
      {
        id: 'draft-offer',
        capability: 'crm.offer.draft',
        params: {
          accountId: { $from: 'lookup-account', path: 'data.id' },
          discountPct: 18
        },
        outputSchema: {
          id: { type: 'string', required: true }
        }
      },
      {
        id: 'finance-approval',
        type: 'approval',
        approval: {
          title: 'Approve retention offer',
          description: 'Finance approval is required before applying the offer.'
        }
      },
      {
        id: 'apply-offer',
        capability: 'crm.offer.apply',
        params: {
          offerId: { $from: 'draft-offer', path: 'data.id' }
        },
        compensate: [
          {
            capability: 'crm.offer.revoke',
            params: {
              offerId: { $from: 'draft-offer', path: 'data.id' },
              reason: 'Notification failed after offer application.'
            }
          }
        ]
      },
      {
        id: 'notify-owner',
        capability: 'crm.owner.notify',
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
      { from: 'apply-offer', to: 'notify-owner' }
    ]
  }
});

if (!parsedAiPlan.ok) {
  throw new Error(`Expected repaired AI plan to parse: ${parsedAiPlan.explain.errors.join('; ')}`);
}

const context = {
  actor: {
    id: 'crm-user-1',
    permissions: ['crm:account:read', 'crm:offer:create', 'crm:offer:apply', 'crm:offer:revoke', 'crm:owner:notify']
  },
  api: createCrmApi(apiState),
  auditMetadata: {
    requestId: 'ai-workflow-smoke',
    token: 'sensitive-token'
  }
};

const preview = await runtime.previewPlan(parsedAiPlan.data.plan, context);

if (!preview.ok || !preview.data.requiresConfirmation || preview.data.status !== 'ready') {
  throw new Error('Expected AI workflow preview to be ready and require confirmation.');
}

const approvalPreview = preview.data.nodes.find((entry) => entry.node.id === 'finance-approval');

if (!approvalPreview?.preview.data?.requiresApproval) {
  throw new Error('Expected AI workflow preview to mark the approval gate.');
}

const result = await runtime.executePlan(parsedAiPlan.data.plan, context);

if (result.ok || result.data.status !== 'failed') {
  throw new Error('Expected AI workflow execution to fail after downstream notification failure.');
}

if (!approvalCalls.length || approvalCalls[0].approval.title !== 'Approve retention offer') {
  throw new Error('Expected trusted UI approval hook to receive the approval context.');
}

const failedNode = result.data.nodes.find((entry) => entry.node.id === 'notify-owner');

if (!failedNode || failedNode.result.audit?.metadata?.httpStatus !== 503) {
  throw new Error('Expected failed notification node to preserve backend failure status.');
}

const compensationWithStep = result.data.compensations.find((entry) => entry.steps.length > 0);

if (!compensationWithStep?.result.ok || compensationWithStep.steps[0].command?.capability !== 'crm.offer.revoke') {
  throw new Error('Expected AI workflow failure to run offer revocation compensation.');
}

if (apiState.revoked.length !== 1 || apiState.revoked[0].offerId !== 'offer-1') {
  throw new Error('Expected compensation to revoke the applied offer.');
}

if (!auditEvents.length || !auditEvents.every((event) => event.metadata.token === '[redacted]')) {
  throw new Error('Expected audit sink to receive redacted audit metadata.');
}

if (!auditEvents.some((event) => event.capability === 'approval' && event.status === 'confirmed')) {
  throw new Error('Expected audit sink to receive approval audit event.');
}

if (!auditEvents.some((event) => event.capability === 'crm.offer.revoke' && event.metadata.compensation)) {
  throw new Error('Expected audit sink to receive compensation audit event.');
}

const previewHTML = renderPlanPreviewToHTML(preview);
const graphHTML = renderPlanGraphToHTML(preview);
const timelineHTML = renderTimelineDetailToHTML(result);
const auditHTML = renderAuditViewerToHTML(runtime.getAuditEvents());

if (!previewHTML.includes('pivot-plan-preview') || !graphHTML.includes('pivot-plan-graph') || !timelineHTML.includes('pivot-timeline-detail') || !auditHTML.includes('pivot-audit-viewer')) {
  throw new Error('Expected AI workflow integration renderers to produce UI-ready HTML.');
}

function registerCrmCapabilities(targetRuntime) {
  targetRuntime.registerCapability({
    name: 'crm.account.lookup',
    resource: 'crm.account',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['crm:account:read'],
    paramsSchema: {
      accountId: { type: 'string', required: true }
    },
    execute: async ({ params }) => ({ id: params.accountId, name: 'Globex' })
  });

  targetRuntime.registerCapability({
    name: 'crm.offer.draft',
    resource: 'crm.offer',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['crm:offer:create'],
    requiresConfirmation: true,
    paramsSchema: {
      accountId: { type: 'string', required: true },
      discountPct: { type: 'number', required: true }
    },
    execute: async ({ params, context: executionContext }) => executionContext.api.draftOffer(params)
  });

  targetRuntime.registerCapability({
    name: 'crm.offer.apply',
    resource: 'crm.offer',
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
    name: 'crm.offer.revoke',
    resource: 'crm.offer',
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
    name: 'crm.owner.notify',
    resource: 'crm.notification',
    action: ActionType.EXECUTE,
    risk: RiskLevel.MEDIUM,
    permissions: ['crm:owner:notify'],
    paramsSchema: {
      accountId: { type: 'string', required: true },
      offerId: { type: 'string', required: true }
    },
    execute: async () => {
      const error = new Error('Owner notification service is unavailable.');
      error.status = 503;
      throw error;
    }
  });
}

function createCrmApi(state) {
  return {
    async draftOffer(input) {
      const offer = {
        id: `offer-${state.offers.length + 1}`,
        accountId: input.accountId,
        discountPct: input.discountPct,
        status: 'draft'
      };

      state.offers.push(offer);
      return offer;
    },

    async applyOffer(offerId) {
      const offer = state.offers.find((item) => item.id === offerId);

      if (!offer) {
        const error = new Error(`Offer ${offerId} was not found.`);
        error.status = 404;
        throw error;
      }

      offer.status = 'applied';
      return { id: offer.id, status: offer.status };
    },

    async revokeOffer(input) {
      state.revoked.push(input);
      return { id: input.offerId, revoked: true };
    }
  };
}
