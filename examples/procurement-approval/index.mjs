import {
  ActionType,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPlan,
  createPivotRuntime,
  createTrustedUIAdapter,
  renderCapabilityBrowserToHTML,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const ui = createTrustedUIAdapter({
  openAssistant(options) {
    console.log(`[assistant] open: ${options?.title ?? 'PIVOT Assistant'}`);
  },
  closeAssistant() {
    console.log('[assistant] close');
  },
  confirm: async (input) => {
    console.log(`[confirm] ${input.command?.capability ?? input.command?.intent ?? 'command'}`);
    return true;
  },
  approve: async (input) => {
    console.log(`[approve] ${input.approval?.title ?? 'plan step'}`);
    return true;
  }
});

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui
});

const api = createProcurementApi();

registerProcurementCapabilities(runtime);

const buyerContext = {
  actor: {
    id: 'buyer-1',
    permissions: [
      'procurement:request:create',
      'procurement:request:read',
      'procurement:order:create',
      'procurement:order:cancel',
      'procurement:dispatch:create',
      'procurement:audit:create'
    ]
  },
  api
};

const requestCommand = createCommand({
  intent: 'Submit a procurement request for 24 monitors.',
  resource: 'procurement.request',
  action: ActionType.CREATE,
  capability: 'procurement.request.submit',
  risk: RiskLevel.MEDIUM,
  params: {
    item: 'Monitors',
    amount: 18400,
    supplier: 'Northwind Displays'
  }
});

const highValuePlan = createPurchasePlan('req-high', {
  approvalTitle: 'Approve high-value purchase',
  dispatchCapability: 'procurement.dispatch',
  includeApproval: true,
  includeCompensation: false
});
const lowValuePlan = createPurchasePlan('req-low', {
  approvalTitle: 'Approve low-value purchase',
  dispatchCapability: 'procurement.dispatch',
  includeApproval: false,
  includeCompensation: false
});
const failingPlan = createPurchasePlan('req-high', {
  approvalTitle: 'Approve contingency purchase',
  dispatchCapability: 'procurement.dispatch.unavailable',
  includeApproval: true,
  includeCompensation: true
});

const requestPreview = await runtime.previewCommand(requestCommand, buyerContext);
console.log('request preview:', summarizeCommandPreview(requestPreview));

const requestResult = await runtime.executeCommand(requestCommand, buyerContext);
console.log('request result:', summarizeCommandResult(requestResult));

const capabilityBrowserHTML = renderCapabilityBrowserToHTML(runtime.listCapabilities(), {
  query: 'procurement'
});
const highValuePlanPreview = await runtime.previewPlan(highValuePlan, buyerContext);
const lowValuePlanPreview = await runtime.previewPlan(lowValuePlan, buyerContext);

console.log('capability browser snippet:', capabilityBrowserHTML.slice(0, 160).replace(/\s+/g, ' '));
console.log('high-value plan preview:', renderPlanPreviewToHTML(highValuePlanPreview).slice(0, 160).replace(/\s+/g, ' '));
console.log('low-value plan preview:', renderPlanPreviewToHTML(lowValuePlanPreview).slice(0, 160).replace(/\s+/g, ' '));
console.log('high-value plan graph:', renderPlanGraphToHTML(highValuePlanPreview).slice(0, 160).replace(/\s+/g, ' '));

const highValuePlanResult = await runtime.executePlan(highValuePlan, buyerContext);
const lowValuePlanResult = await runtime.executePlan(lowValuePlan, buyerContext);
const failingPlanResult = await runtime.executePlan(failingPlan, buyerContext);

console.log('high-value plan result:', summarizePlanResult(highValuePlanResult));
console.log('low-value plan result:', summarizePlanResult(lowValuePlanResult));
console.log('failing plan result:', summarizePlanResult(failingPlanResult));
console.log('failing plan timeline:', renderTimelineDetailToHTML(failingPlanResult).slice(0, 160).replace(/\s+/g, ' '));

function registerProcurementCapabilities(targetRuntime) {
  targetRuntime.registerCapability({
    name: 'procurement.request.submit',
    resource: 'procurement.request',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['procurement:request:create'],
    requiresConfirmation: true,
    paramsSchema: {
      item: { type: 'string', required: true },
      amount: { type: 'number', required: true },
      supplier: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.submitRequest(params)
  });

  targetRuntime.registerCapability({
    name: 'procurement.request.assess',
    resource: 'procurement.request',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['procurement:request:read'],
    paramsSchema: {
      requestId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.assessRequest(params.requestId)
  });

  targetRuntime.registerCapability({
    name: 'procurement.order.create',
    resource: 'procurement.order',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['procurement:order:create'],
    requiresConfirmation: true,
    paramsSchema: {
      requestId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.createOrder(params)
  });

  targetRuntime.registerCapability({
    name: 'procurement.order.cancel',
    resource: 'procurement.order',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['procurement:order:cancel'],
    requiresConfirmation: true,
    paramsSchema: {
      orderId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.cancelOrder(params.orderId)
  });

  targetRuntime.registerCapability({
    name: 'procurement.dispatch',
    resource: 'procurement.dispatch',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['procurement:dispatch:create'],
    paramsSchema: {
      orderId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.dispatchOrder(params.orderId)
  });

  targetRuntime.registerCapability({
    name: 'procurement.dispatch.unavailable',
    resource: 'procurement.dispatch',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['procurement:dispatch:create'],
    paramsSchema: {
      orderId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.dispatchOrderUnavailable(params.orderId)
  });

  targetRuntime.registerCapability({
    name: 'procurement.audit.note',
    resource: 'procurement.audit',
    action: ActionType.CREATE,
    risk: RiskLevel.LOW,
    permissions: ['procurement:audit:create'],
    paramsSchema: {
      note: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.addAuditNote(params.note)
  });
}

function createPurchasePlan(requestId, options = {}) {
  const nodes = [
    {
      id: `${requestId}-assess`,
      capability: 'procurement.request.assess',
      params: { requestId }
    }
  ];

  const edges = [];

  if (options.includeApproval) {
    nodes.push({
      id: `${requestId}-approval`,
      type: 'approval',
      approval: {
        title: options.approvalTitle ?? 'Approve procurement request',
        description: 'Approve the purchase before placing the order.'
      }
    });

    edges.push({ from: `${requestId}-assess`, to: `${requestId}-approval` });
    edges.push({ from: `${requestId}-approval`, to: `${requestId}-create-order` });
  }

  nodes.push(
    {
      id: `${requestId}-create-order`,
      capability: 'procurement.order.create',
      params: {
        requestId: { $from: `${requestId}-assess`, path: 'data.id' }
      },
      compensate: options.includeCompensation
        ? [
            {
              capability: 'procurement.order.cancel',
              params: {
                orderId: { $from: `${requestId}-create-order`, path: 'data.id' }
              }
            },
            {
              capability: 'procurement.audit.note',
              params: {
                note: 'Dispatch failed after order creation.'
              }
            }
          ]
        : undefined
    },
    {
      id: `${requestId}-dispatch`,
      capability: options.dispatchCapability ?? 'procurement.dispatch',
      params: {
        orderId: { $from: `${requestId}-create-order`, path: 'data.id' }
      }
    }
  );

  edges.push(
    { from: `${requestId}-assess`, to: `${requestId}-create-order` },
    { from: `${requestId}-create-order`, to: `${requestId}-dispatch` }
  );

  return createPlan({
    intent: options.includeCompensation
      ? `Create a purchase order for ${requestId} and roll back if dispatch fails.`
      : `Route procurement request ${requestId} through ordering.`,
    nodes,
    edges
  });
}

function createProcurementApi() {
  const requests = [
    {
      id: 'req-high',
      item: 'Monitors',
      amount: 18400,
      supplier: 'Northwind Displays',
      requiresFinanceApproval: true
    },
    {
      id: 'req-low',
      item: 'Desk chairs',
      amount: 2400,
      supplier: 'Northwind Office',
      requiresFinanceApproval: false
    }
  ];

  const orders = [];
  const auditNotes = [];

  return {
    async submitRequest(input) {
      const request = {
        id: `req-${requests.length + 1}`,
        item: input.item,
        amount: input.amount,
        supplier: input.supplier,
        requiresFinanceApproval: input.amount > 5000
      };

      requests.push(request);
      return request;
    },

    async assessRequest(requestId) {
      const request = requests.find((item) => item.id === requestId);

      if (!request) {
        const error = new Error(`Request ${requestId} was not found.`);
        error.status = 404;
        throw error;
      }

      return {
        ...request,
        budgetRemaining: 50000 - request.amount,
        estimatedLeadTimeDays: request.amount > 10000 ? 12 : 5
      };
    },

    async createOrder(input) {
      const request = requests.find((item) => item.id === input.requestId);

      if (!request) {
        const error = new Error(`Request ${input.requestId} was not found.`);
        error.status = 404;
        throw error;
      }

      const order = {
        id: `po-${orders.length + 1}`,
        requestId: request.id,
        item: request.item,
        amount: request.amount,
        supplier: request.supplier,
        status: 'created'
      };

      orders.push(order);
      return order;
    },

    async cancelOrder(orderId) {
      const index = orders.findIndex((item) => item.id === orderId);

      if (index === -1) {
        return { id: orderId, cancelled: false };
      }

      const [order] = orders.splice(index, 1);
      return { id: order.id, cancelled: true };
    },

    async dispatchOrder(orderId) {
      const order = orders.find((item) => item.id === orderId);

      if (!order) {
        const error = new Error(`Order ${orderId} was not found.`);
        error.status = 404;
        throw error;
      }

      order.status = 'dispatched';
      return { id: order.id, status: 'dispatched' };
    },

    async dispatchOrderUnavailable(orderId) {
      const order = orders.find((item) => item.id === orderId);

      if (!order) {
        const error = new Error(`Order ${orderId} was not found.`);
        error.status = 404;
        throw error;
      }

      const error = new Error('Warehouse dispatch service is temporarily unavailable.');
      error.status = 503;
      throw error;
    },

    async addAuditNote(note) {
      auditNotes.push(note);
      return { noted: true, count: auditNotes.length };
    }
  };
}

function summarizeCommandPreview(result) {
  return {
    ok: result.ok,
    status: result.data?.status,
    requiresConfirmation: result.data?.requiresConfirmation,
    message: result.message
  };
}

function summarizeCommandResult(result) {
  return {
    ok: result.ok,
    status: result.data?.status ?? result.audit?.status,
    message: result.message
  };
}

function summarizePlanResult(result) {
  return {
    ok: result.ok,
    message: result.message,
    nodes: result.data?.nodes?.map((entry) => ({
      id: entry.node.id,
      ok: entry.result?.ok ?? false,
      skipped: entry.result?.data?.skipped ?? false
    })) ?? [],
    compensations: result.data?.compensations?.map((entry) => ({
      ok: entry.result?.ok ?? false,
      steps: entry.steps.length
    })) ?? []
  };
}
