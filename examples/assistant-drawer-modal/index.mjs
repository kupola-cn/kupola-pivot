import {
  ActionType,
  RiskLevel,
  createCommand,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
  createTrustedUIAdapter,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const events = [];

const drawer = {
  open(input) {
    events.push({ surface: 'drawer', action: 'open', title: input?.title ?? '' });
    console.log(`[drawer] open: ${input?.title ?? ''}`);
  },
  close() {
    events.push({ surface: 'drawer', action: 'close' });
    console.log('[drawer] close');
  }
};

const modal = {
  async confirm(input) {
    events.push({ surface: 'modal', action: 'confirm', title: input?.title ?? '' });
    console.log(`[modal] confirm: ${input?.title ?? ''}`);
    return true;
  }
};

const ui = createTrustedUIAdapter({
  openAssistant(options) {
    drawer.open({
      title: options?.title ?? 'PIVOT Assistant',
      content: options?.content ?? ''
    });
  },
  closeAssistant() {
    drawer.close();
  },
  confirm: async (input) => modal.confirm({
    title: input.command?.intent ?? 'Confirm command',
    content: renderTimelineDetailToHTML({
      ok: true,
      message: input.policy?.reason ?? 'Confirm command',
      data: { command: input.command },
      explain: { timeline: [] }
    })
  }),
  approve: async (input) => modal.confirm({
    title: input.approval?.title ?? 'Approve plan step',
    content: input.approval?.description ?? ''
  })
});

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui
});

runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'org-1', ...params })
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
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'final-1', ...params })
});

const command = createCommand({
  intent: 'Create branch C under the group.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: {
    name: 'Branch C',
    parentId: 'group'
  }
});

const plan = createPlan({
  intent: 'Classify and finalize branch C.',
  nodes: [
    { id: 'classify', capability: 'organization.classify' },
    {
      id: 'approve-finalize',
      type: 'approval',
      approval: {
        title: 'Approve branch creation',
        description: 'Use the modal to approve the next step.'
      }
    },
    {
      id: 'finalize',
      capability: 'organization.finalize',
      params: {
        name: 'Branch C',
        parentId: 'group'
      }
    }
  ],
  edges: [
    { from: 'classify', to: 'approve-finalize' },
    { from: 'approve-finalize', to: 'finalize' }
  ]
});

const commandPreview = await runtime.previewCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});

ui.openAssistant({
  title: 'Command preview',
  content: renderTimelineDetailToHTML(commandPreview, {
    title: 'Command preview'
  })
});

const commandResult = await runtime.executeCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});
ui.closeAssistant();

const planPreview = await runtime.previewPlan(plan, {
  actor: { id: 'user-1', permissions: ['organization:query', 'organization:create'] }
});

ui.openAssistant({
  title: 'Plan preview',
  content: renderPlanPreviewToHTML(planPreview)
});

const planResult = await runtime.executePlan(plan, {
  actor: { id: 'user-1', permissions: ['organization:query', 'organization:create'] }
});
ui.closeAssistant();

console.log('command result ok:', commandResult.ok);
console.log('plan result ok:', planResult.ok);
console.log('events:', JSON.stringify(events, null, 2));
