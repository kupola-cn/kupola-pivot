import {
  ActionType,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPlan,
  createPivotRuntime,
  createTrustedUIAdapter,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
  renderTimelineDetailToHTML
} from '@kupola/pivot';

const events = [];

const kupola = {
  Drawer: {
    open(input) {
      events.push({ surface: 'drawer', action: 'open', title: input?.title ?? '' });
      console.log(`[Drawer] open: ${input?.title ?? ''}`);
      if (typeof input?.content === 'string') {
        console.log(input.content.slice(0, 120).replace(/\s+/g, ' '));
      }
    },
    close() {
      events.push({ surface: 'drawer', action: 'close' });
      console.log('[Drawer] close');
    }
  },
  Modal: {
    async confirm(input) {
      events.push({ surface: 'modal', action: 'confirm', title: input?.title ?? '' });
      console.log(`[Modal] confirm: ${input?.title ?? ''}`);
      return true;
    }
  },
  Table: {
    render({ title, columns = [], rows = [] }) {
      const header = columns.map((column) => `<th>${escapeHTML(column.label ?? column.key ?? '')}</th>`).join('');
      const body = rows.map((row) => {
        const cells = columns.map((column) => `<td>${escapeHTML(row[column.key] ?? '')}</td>`).join('');
        return `<tr>${cells}</tr>`;
      }).join('');

      events.push({ surface: 'table', action: 'render', title: title ?? '', rows: rows.length });

      return [
        '<section class="kupola-table">',
        title ? `<h2>${escapeHTML(title)}</h2>` : '',
        '<table>',
        `<thead><tr>${header}</tr></thead>`,
        `<tbody>${body}</tbody>`,
        '</table>',
        '</section>'
      ].join('');
    }
  },
  Message: {
    info(message) {
      events.push({ surface: 'message', action: 'info', message });
      console.log(`[Message] info: ${message}`);
    },
    success(message) {
      events.push({ surface: 'message', action: 'success', message });
      console.log(`[Message] success: ${message}`);
    }
  }
};

const ui = createTrustedUIAdapter({
  openAssistant(options) {
    kupola.Drawer.open({
      title: options?.title ?? 'PIVOT Assistant',
      content: options?.content ?? ''
    });
  },
  closeAssistant() {
    kupola.Drawer.close();
  },
  confirm: async (input) => kupola.Modal.confirm({
    title: input.command?.intent ?? 'Confirm command',
    content: renderTimelineDetailToHTML({
      ok: true,
      message: input.policy?.reason ?? 'Confirm command',
      data: { command: input.command },
      explain: { timeline: [] }
    })
  }),
  approve: async (input) => kupola.Modal.confirm({
    title: input.approval?.title ?? 'Approve plan step',
    content: renderTimelineDetailToHTML({
      ok: true,
      message: input.approval?.description ?? 'Approve plan step',
      data: { approval: input.approval },
      explain: { timeline: [] }
    })
  })
});

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui
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
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => ({ id: 'org-1', ...params })
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
  intent: 'Query the group, confirm, and finalize branch C.',
  nodes: [
    { id: 'query-group', capability: 'organization.query' },
    {
      id: 'approve-create',
      type: 'approval',
      approval: {
        title: 'Approve branch creation',
        description: 'Use the Kupola Modal to approve the next step.'
      }
    },
    {
      id: 'finalize-branch',
      capability: 'organization.finalize',
      params: {
        name: 'Branch C',
        parentId: 'group'
      }
    }
  ],
  edges: [
    { from: 'query-group', to: 'approve-create' },
    { from: 'approve-create', to: 'finalize-branch' }
  ]
});

kupola.Message.info('Capability catalog ready.');
kupola.Drawer.open({
  title: 'Capability catalog',
  content: kupola.Table.render({
    title: 'Organization capabilities',
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'resource', label: 'Resource' },
      { key: 'action', label: 'Action' },
      { key: 'risk', label: 'Risk' }
    ],
    rows: runtime.listCapabilities().map((capability) => ({
      name: capability.name,
      resource: capability.resource,
      action: capability.action,
      risk: capability.risk
    }))
  })
});

const commandPreview = await runtime.previewCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});

kupola.Drawer.open({
  title: 'Command preview',
  content: renderTimelineDetailToHTML(commandPreview, {
    title: 'Command preview'
  })
});

const commandResult = await runtime.executeCommand(command, {
  actor: { id: 'user-1', permissions: ['organization:create'] }
});
kupola.Drawer.close();

const planPreview = await runtime.previewPlan(plan, {
  actor: { id: 'user-1', permissions: ['organization:query', 'organization:create'] }
});

kupola.Drawer.open({
  title: 'Plan graph',
  content: renderPlanGraphToHTML(planPreview)
});

const planResult = await runtime.executePlan(plan, {
  actor: { id: 'user-1', permissions: ['organization:query', 'organization:create'] }
});
kupola.Drawer.close();

kupola.Message.success(commandResult.message);
kupola.Message.success(planResult.message);

console.log('plan preview html:', renderPlanPreviewToHTML(planPreview).slice(0, 120).replace(/\s+/g, ' '));
console.log('events:', JSON.stringify(events, null, 2));

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
