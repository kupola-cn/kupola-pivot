export function createTrustedUIAdapter(adapter = {}) {
  const confirm = adapter.confirm ?? (async () => false);

  return {
    showMessage: adapter.showMessage ?? (() => {}),
    showResult: adapter.showResult ?? (() => {}),
    confirm,
    approve: adapter.approve ?? ((input) => confirm(input)),
    openAssistant: adapter.openAssistant ?? (() => {}),
    closeAssistant: adapter.closeAssistant ?? (() => {})
  };
}

export function renderTimelineToHTML(timeline = [], options = {}) {
  const className = options.className ?? 'pivot-timeline';
  const emptyText = options.emptyText ?? 'No timeline available.';
  const ariaLabel = options.ariaLabel ?? 'Timeline';

  if (!Array.isArray(timeline) || timeline.length === 0) {
    return `<ol class="${escapeAttr(className)} pivot-timeline--empty" aria-label="${escapeAttr(ariaLabel)}"><li role="status">${escapeHTML(emptyText)}</li></ol>`;
  }

  const items = timeline.map((step) => {
    const status = step?.status ?? 'unknown';
    const stage = step?.stage ?? 'unknown';
    const message = step?.message ?? '';
    const timestamp = step?.timestamp ?? '';

    return [
      `<li class="pivot-timeline__item pivot-timeline__item--${escapeAttr(status)}" data-stage="${escapeAttr(stage)}">`,
      '<div class="pivot-timeline__marker" aria-hidden="true"></div>',
      '<div class="pivot-timeline__content">',
      `<div class="pivot-timeline__header"><span class="pivot-timeline__stage">${escapeHTML(stage)}</span><span class="pivot-timeline__status">${escapeHTML(status)}</span></div>`,
      `<div class="pivot-timeline__message">${escapeHTML(message)}</div>`,
      timestamp ? `<time class="pivot-timeline__time" datetime="${escapeAttr(timestamp)}">${escapeHTML(timestamp)}</time>` : '',
      '</div>',
      '</li>'
    ].join('');
  }).join('');

  return `<ol class="${escapeAttr(className)}" aria-label="${escapeAttr(ariaLabel)}">${items}</ol>`;
}

export function renderResultToHTML(result, options = {}) {
  const className = options.className ?? 'pivot-result';
  const ok = Boolean(result?.ok);
  const status = ok ? 'success' : 'failed';
  const message = result?.message ?? '';
  const timeline = result?.explain?.timeline ?? [];
  const includeTimeline = options.includeTimeline ?? true;
  const ariaLabel = options.ariaLabel ?? 'Result';

  return [
    `<section class="${escapeAttr(className)} pivot-result--${status}" role="region" aria-label="${escapeAttr(ariaLabel)}">`,
    `<header class="pivot-result__header"><span class="pivot-result__status">${escapeHTML(status)}</span><strong class="pivot-result__message">${escapeHTML(message)}</strong></header>`,
    includeTimeline ? renderTimelineToHTML(timeline, { className: 'pivot-result__timeline' }) : '',
    '</section>'
  ].join('');
}

export function renderTimelineDetailToHTML(result, options = {}) {
  const className = options.className ?? 'pivot-timeline-detail';
  const includeTimeline = options.includeTimeline ?? true;
  const includeAudit = options.includeAudit ?? true;
  const emptyText = options.emptyText ?? 'No timeline detail available.';
  const title = options.title ?? result?.data?.plan?.intent ?? result?.data?.command?.intent ?? result?.message ?? 'Timeline detail';
  const ok = Boolean(result?.ok);
  const status = ok ? 'success' : 'failed';
  const timeline = result?.explain?.timeline ?? [];
  const ariaLabel = options.ariaLabel ?? title;

  if (!result || typeof result !== 'object') {
    return `<section class="${escapeAttr(className)} pivot-timeline-detail--empty" role="region" aria-label="${escapeAttr(ariaLabel)}"><div class="pivot-timeline-detail__empty" role="status">${escapeHTML(emptyText)}</div></section>`;
  }

  return [
    `<section class="${escapeAttr(className)} pivot-timeline-detail--${escapeAttr(status)}" role="region" aria-label="${escapeAttr(ariaLabel)}">`,
    '<header class="pivot-timeline-detail__header">',
    `<span class="pivot-timeline-detail__status">${escapeHTML(status)}</span>`,
    `<strong class="pivot-timeline-detail__title">${escapeHTML(title)}</strong>`,
    `<div class="pivot-timeline-detail__message">${escapeHTML(result?.message ?? '')}</div>`,
    '</header>',
    '<div class="pivot-timeline-detail__summary">',
    renderTimelineDetailSummaryItem('Executed', result?.explain?.executedNodes),
    renderTimelineDetailSummaryItem('Skipped', result?.explain?.skippedNodes),
    renderTimelineDetailSummaryItem('Failed', result?.explain?.failedNodes),
    renderTimelineDetailSummaryItem('Compensations', result?.explain?.compensationNodes),
    renderTimelineDetailSummaryItem('Failed compensations', result?.explain?.failedCompensations),
    renderTimelineDetailSummaryItem('Attempts', result?.explain?.attempts),
    '</div>',
    includeAudit && result?.audit ? renderTimelineDetailAudit(result.audit) : '',
    includeTimeline ? renderTimelineToHTML(timeline, { className: 'pivot-timeline-detail__timeline' }) : '',
    '</section>'
  ].join('');
}

export function renderAuditViewerToHTML(audits = [], options = {}) {
  const className = options.className ?? 'pivot-audit-viewer';
  const emptyText = options.emptyText ?? 'No audit events available.';
  const title = options.title ?? 'Audit viewer';
  const entries = Array.isArray(audits) ? audits : [];

  if (entries.length === 0) {
    return `<section class="${escapeAttr(className)} pivot-audit-viewer--empty" role="region" aria-label="${escapeAttr(title)}"><div class="pivot-audit-viewer__empty" role="status">${escapeHTML(emptyText)}</div></section>`;
  }

  const statusCounts = countAuditStatuses(entries);
  const decisionCounts = countAuditDecisions(entries);

  return [
    `<section class="${escapeAttr(className)}" role="region" aria-label="${escapeAttr(title)}">`,
    '<header class="pivot-audit-viewer__header">',
    `<strong class="pivot-audit-viewer__title">${escapeHTML(title)}</strong>`,
    `<div class="pivot-audit-viewer__message">${escapeHTML(options.message ?? `Showing ${entries.length} audit events.`)}</div>`,
    '</header>',
    '<div class="pivot-audit-viewer__summary">',
    renderAuditSummaryItem('Total', entries.length),
    renderAuditSummaryItem('Executed', statusCounts.executed),
    renderAuditSummaryItem('Blocked', statusCounts.blocked),
    renderAuditSummaryItem('Rejected', statusCounts.rejected),
    renderAuditSummaryItem('Failed', statusCounts.failed),
    renderAuditSummaryItem('Allowed', decisionCounts.allow),
    renderAuditSummaryItem('Denied', decisionCounts.deny),
    renderAuditSummaryItem('Confirmed', decisionCounts.confirm),
    '</div>',
    '<ol class="pivot-audit-viewer__list">',
    ...entries.map((audit, index) => renderAuditEntry(audit, index)),
    '</ol>',
    '</section>'
  ].join('');
}

export function renderCapabilityBrowserToHTML(capabilities = [], options = {}) {
  const className = options.className ?? 'pivot-capability-browser';
  const emptyText = options.emptyText ?? 'No capabilities available.';
  const title = options.title ?? 'Capability browser';
  const query = typeof options.query === 'string' ? options.query.trim().toLowerCase() : '';
  const filter = options.filter ?? {};
  const entries = applyCapabilityBrowserFilter(Array.isArray(capabilities) ? capabilities : [], filter, query);
  const summary = summarizeCapabilities(entries);

  if (entries.length === 0) {
    return `<section class="${escapeAttr(className)} pivot-capability-browser--empty" role="region" aria-label="${escapeAttr(title)}"><div class="pivot-capability-browser__empty" role="status">${escapeHTML(emptyText)}</div></section>`;
  }

  return [
    `<section class="${escapeAttr(className)}" role="region" aria-label="${escapeAttr(title)}">`,
    '<header class="pivot-capability-browser__header">',
    `<strong class="pivot-capability-browser__title">${escapeHTML(title)}</strong>`,
    `<div class="pivot-capability-browser__message">${escapeHTML(options.message ?? `Showing ${entries.length} capabilities.`)}</div>`,
    '</header>',
    '<div class="pivot-capability-browser__summary">',
    renderCapabilitySummaryItem('Total', summary.total),
    renderCapabilitySummaryItem('Confirm', summary.requiresConfirmation),
    renderCapabilitySummaryItem('Low', summary.risk.low),
    renderCapabilitySummaryItem('Medium', summary.risk.medium),
    renderCapabilitySummaryItem('High', summary.risk.high),
    renderCapabilitySummaryItem('Critical', summary.risk.critical),
    '</div>',
    '<ol class="pivot-capability-browser__list">',
    ...entries.map((capability, index) => renderCapabilityBrowserEntry(capability, index)),
    '</ol>',
    '</section>'
  ].join('');
}

export function renderPlanPreviewToHTML(preview, options = {}) {
  const className = options.className ?? 'pivot-plan-preview';
  const includeTimeline = options.includeTimeline ?? true;
  const includeNodes = options.includeNodes ?? true;
  const emptyText = options.emptyText ?? 'No plan preview available.';
  const plan = preview?.data?.plan ?? null;
  const nodes = Array.isArray(preview?.data?.nodes) ? preview.data.nodes : [];
  const status = preview?.data?.status ?? (preview?.ok ? 'ready' : 'blocked');
  const requiresConfirmation = Boolean(preview?.data?.requiresConfirmation);
  const nodeCount = nodes.length;
  const blockedCount = nodes.filter((item) => !item?.preview?.ok).length;
  const confirmationCount = nodes.filter((item) => Boolean(item?.preview?.data?.requiresConfirmation)).length;
  const timeline = preview?.explain?.timeline ?? [];
  const ariaLabel = options.ariaLabel ?? plan?.intent ?? 'Plan preview';

  if (!preview || typeof preview !== 'object') {
    return `<section class="${escapeAttr(className)} pivot-plan-preview--empty" role="region" aria-label="${escapeAttr(ariaLabel)}"><div class="pivot-plan-preview__empty" role="status">${escapeHTML(emptyText)}</div></section>`;
  }

  return [
    `<section class="${escapeAttr(className)} pivot-plan-preview--${escapeAttr(status)}" role="region" aria-label="${escapeAttr(ariaLabel)}">`,
    '<header class="pivot-plan-preview__header">',
    `<span class="pivot-plan-preview__status">${escapeHTML(status)}</span>`,
    `<strong class="pivot-plan-preview__message">${escapeHTML(preview?.message ?? '')}</strong>`,
    '</header>',
    '<div class="pivot-plan-preview__summary">',
    `<div class="pivot-plan-preview__summary-item"><span class="pivot-plan-preview__label">Plan</span><span class="pivot-plan-preview__value">${escapeHTML(plan?.intent ?? plan?.id ?? '')}</span></div>`,
    `<div class="pivot-plan-preview__summary-item"><span class="pivot-plan-preview__label">Nodes</span><span class="pivot-plan-preview__value">${escapeHTML(nodeCount)}</span></div>`,
    `<div class="pivot-plan-preview__summary-item"><span class="pivot-plan-preview__label">Blocked</span><span class="pivot-plan-preview__value">${escapeHTML(blockedCount)}</span></div>`,
    `<div class="pivot-plan-preview__summary-item"><span class="pivot-plan-preview__label">Confirmation</span><span class="pivot-plan-preview__value">${escapeHTML(requiresConfirmation ? 'required' : 'not required')} (${escapeHTML(confirmationCount)})</span></div>`,
    '</div>',
    plan ? [
      '<div class="pivot-plan-preview__plan">',
      `<div class="pivot-plan-preview__plan-title">${escapeHTML(plan.intent ?? plan.id ?? 'Plan')}</div>`,
      `<div class="pivot-plan-preview__plan-id">${escapeHTML(plan.id ?? '')}</div>`,
      '</div>'
    ].join('') : '',
    includeNodes ? renderPlanPreviewNodes(nodes) : '',
    includeTimeline ? renderTimelineToHTML(timeline, { className: 'pivot-plan-preview__timeline' }) : '',
    '</section>'
  ].join('');
}

export function renderPlanGraphToHTML(value, options = {}) {
  const className = options.className ?? 'pivot-plan-graph';
  const emptyText = options.emptyText ?? 'No plan graph available.';
  const graph = normalizePlanGraphInput(value);

  if (!graph || graph.entries.length === 0) {
    return `<section class="${escapeAttr(className)} pivot-plan-graph--empty" role="region" aria-label="${escapeAttr(options.title ?? 'Plan graph')}"><div class="pivot-plan-graph__empty" role="status">${escapeHTML(emptyText)}</div></section>`;
  }

  const title = options.title ?? graph.plan?.intent ?? graph.plan?.id ?? 'Plan graph';
  const message = options.message ?? `Showing ${graph.entries.length} nodes across ${graph.layout.layers.length} layers.`;
  const graphId = createPlanGraphId();
  const summary = summarizePlanGraph(graph);

  return [
    `<section class="${escapeAttr(className)}" role="region" aria-label="${escapeAttr(title)}">`,
    '<header class="pivot-plan-graph__header">',
    `<strong class="pivot-plan-graph__title">${escapeHTML(title)}</strong>`,
    `<div class="pivot-plan-graph__message">${escapeHTML(message)}</div>`,
    '</header>',
    '<div class="pivot-plan-graph__summary">',
    renderPlanGraphSummaryItem('Nodes', summary.nodes),
    renderPlanGraphSummaryItem('Edges', summary.edges),
    renderPlanGraphSummaryItem('Layers', summary.layers),
    renderPlanGraphSummaryItem('Approval nodes', summary.approvals),
    renderPlanGraphSummaryItem('Conditional edges', summary.conditionalEdges),
    graph.previewMode ? renderPlanGraphSummaryItem('Ready', summary.ready) : '',
    graph.previewMode ? renderPlanGraphSummaryItem('Blocked', summary.blocked) : '',
    graph.previewMode ? renderPlanGraphSummaryItem('Skipped', summary.skipped) : '',
    '</div>',
    '<div class="pivot-plan-graph__viewport">',
    `<div class="pivot-plan-graph__canvas" style="width:${graph.layout.width}px;height:${graph.layout.height}px;">`,
    options.showEdges !== false ? renderPlanGraphEdges(graph, graphId) : '',
    '<ol class="pivot-plan-graph__nodes">',
    ...graph.layout.nodes.map((entry) => renderPlanGraphNode(entry, graph.layout)),
    '</ol>',
    '</div>',
    '</div>',
    options.includeEdgeList === false ? '' : renderPlanGraphEdgeList(graph),
    '</section>'
  ].join('');
}

export function mountTimeline(target, timeline = [], options = {}) {
  return mountHTML(target, renderTimelineToHTML(timeline, options), 'timeline', options);
}

export function mountResult(target, result, options = {}) {
  return mountHTML(target, renderResultToHTML(result, options), 'result', options);
}

export function mountPlanPreview(target, preview, options = {}) {
  return mountHTML(target, renderPlanPreviewToHTML(preview, options), 'plan-preview', options);
}

export function mountTimelineDetail(target, result, options = {}) {
  return mountHTML(target, renderTimelineDetailToHTML(result, options), 'timeline-detail', options);
}

export function mountAuditViewer(target, audits = [], options = {}) {
  return mountHTML(target, renderAuditViewerToHTML(audits, options), 'audit-viewer', options);
}

export function mountCapabilityBrowser(target, capabilities = [], options = {}) {
  return mountHTML(target, renderCapabilityBrowserToHTML(capabilities, options), 'capability-browser', options);
}

export function mountPlanGraph(target, value, options = {}) {
  return mountHTML(target, renderPlanGraphToHTML(value, options), 'plan-graph', options);
}

function resolveTarget(target) {
  if (!target) {
    throw new Error('PIVOT UI target is required.');
  }

  if (typeof target === 'string') {
    const element = globalThis.document?.querySelector(target);

    if (!element) {
      throw new Error(`PIVOT UI target was not found: ${target}`);
    }

    return element;
  }

  return target;
}

function mountHTML(target, html, mountedType, options = {}) {
  const element = resolveTarget(target);
  element.innerHTML = html;

  if (typeof element.setAttribute === 'function') {
    element.setAttribute('data-pivot-mounted', mountedType);

    if (options.ariaLabel) {
      element.setAttribute('aria-label', String(options.ariaLabel));
    }

    if (options.liveRegion !== false) {
      element.setAttribute('aria-live', 'polite');
    }
  }

  return element;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#96;');
}

function renderPlanPreviewNodes(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return '<ol class="pivot-plan-preview__nodes pivot-plan-preview__nodes--empty"><li>No plan nodes available.</li></ol>';
  }

  const items = nodes.map((item) => {
    const node = item?.node ?? {};
    const preview = item?.preview ?? {};
    const command = item?.command ?? null;
    const status = preview?.ok ? 'ready' : 'blocked';
    const commandCapability = command?.capability ?? node?.capability ?? '';
    const commandIntent = command?.intent ?? node?.intent ?? '';
    const previewMessage = preview?.message ?? '';

    return [
      `<li class="pivot-plan-preview__node pivot-plan-preview__node--${escapeAttr(status)}">`,
      '<div class="pivot-plan-preview__node-header">',
      `<span class="pivot-plan-preview__node-id">${escapeHTML(node?.id ?? '')}</span>`,
      `<span class="pivot-plan-preview__node-status">${escapeHTML(status)}</span>`,
      '</div>',
      `<div class="pivot-plan-preview__node-capability">${escapeHTML(commandCapability)}</div>`,
      commandIntent ? `<div class="pivot-plan-preview__node-intent">${escapeHTML(commandIntent)}</div>` : '',
      previewMessage ? `<div class="pivot-plan-preview__node-message">${escapeHTML(previewMessage)}</div>` : '',
      '</li>'
    ].join('');
  }).join('');

  return `<ol class="pivot-plan-preview__nodes">${items}</ol>`;
}

function renderTimelineDetailSummaryItem(label, value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return [
    '<div class="pivot-timeline-detail__summary-item">',
    `<span class="pivot-timeline-detail__label">${escapeHTML(label)}</span>`,
    `<span class="pivot-timeline-detail__value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function renderTimelineDetailAudit(audit) {
  return [
    '<section class="pivot-timeline-detail__audit">',
    '<div class="pivot-timeline-detail__audit-title">Audit</div>',
    '<div class="pivot-timeline-detail__audit-grid">',
    renderTimelineDetailAuditItem('ID', audit?.id),
    renderTimelineDetailAuditItem('Decision', audit?.decision),
    renderTimelineDetailAuditItem('Status', audit?.status),
    renderTimelineDetailAuditItem('Reason', audit?.reason),
    renderTimelineDetailAuditItem('Capability', audit?.capability),
    renderTimelineDetailAuditItem('Timestamp', audit?.timestamp),
    '</div>',
    '</section>'
  ].join('');
}

function renderTimelineDetailAuditItem(label, value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return [
    '<div class="pivot-timeline-detail__audit-item">',
    `<span class="pivot-timeline-detail__audit-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-timeline-detail__audit-value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function renderAuditSummaryItem(label, value) {
  if (value === undefined || value === null) {
    return '';
  }

  return [
    '<div class="pivot-audit-viewer__summary-item">',
    `<span class="pivot-audit-viewer__summary-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-audit-viewer__summary-value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function renderAuditEntry(audit, index) {
  const status = String(audit?.status ?? 'unknown').toLowerCase();
  const decision = String(audit?.decision ?? 'unknown').toLowerCase();
  const metadata = audit?.metadata ?? {};

  return [
    `<li class="pivot-audit-viewer__item pivot-audit-viewer__item--${escapeAttr(status)} pivot-audit-viewer__item--${escapeAttr(decision)}">`,
    '<article class="pivot-audit-viewer__card">',
    '<div class="pivot-audit-viewer__card-header">',
    `<span class="pivot-audit-viewer__index">#${escapeHTML(index + 1)}</span>`,
    `<span class="pivot-audit-viewer__status">${escapeHTML(status)}</span>`,
    `<span class="pivot-audit-viewer__decision">${escapeHTML(decision)}</span>`,
    '</div>',
    '<div class="pivot-audit-viewer__grid">',
    renderAuditField('Timestamp', audit?.timestamp),
    renderAuditField('Intent', audit?.intent),
    renderAuditField('Capability', audit?.capability),
    renderAuditField('Command', audit?.commandId),
    renderAuditField('Reason', audit?.reason),
    renderAuditField('Actor', formatAuditValue(audit?.actor)),
    renderAuditField('Metadata', formatAuditValue(metadata)),
    '</div>',
    '</article>',
    '</li>'
  ].join('');
}

function renderAuditField(label, value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return [
    '<div class="pivot-audit-viewer__field">',
    `<span class="pivot-audit-viewer__field-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-audit-viewer__field-value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function formatAuditValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, createJsonReplacer(), 2);
  } catch {
    return String(value);
  }
}

function createJsonReplacer() {
  const seen = new WeakSet();

  return (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }

      seen.add(value);
    }

    return value;
  };
}

function countAuditStatuses(entries) {
  return entries.reduce((accumulator, audit) => {
    const status = String(audit?.status ?? 'unknown').toLowerCase();
    accumulator[status] = (accumulator[status] ?? 0) + 1;
    return accumulator;
  }, {});
}

function countAuditDecisions(entries) {
  return entries.reduce((accumulator, audit) => {
    const decision = String(audit?.decision ?? 'unknown').toLowerCase();
    accumulator[decision] = (accumulator[decision] ?? 0) + 1;
    return accumulator;
  }, {});
}

function summarizeCapabilities(capabilities) {
  return capabilities.reduce((accumulator, capability) => {
    accumulator.total += 1;

    const risk = String(capability?.risk ?? 'unknown').toLowerCase();
    if (Object.hasOwn(accumulator.risk, risk)) {
      accumulator.risk[risk] += 1;
    }

    if (capability?.requiresConfirmation) {
      accumulator.requiresConfirmation += 1;
    }

    return accumulator;
  }, {
    total: 0,
    requiresConfirmation: 0,
    risk: {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    }
  });
}

function renderCapabilitySummaryItem(label, value) {
  return [
    '<div class="pivot-capability-browser__summary-item">',
    `<span class="pivot-capability-browser__summary-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-capability-browser__summary-value">${escapeHTML(value ?? 0)}</span>`,
    '</div>'
  ].join('');
}

function renderCapabilityBrowserEntry(capability, index) {
  const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];
  const dependencies = Array.isArray(capability?.dependencies) ? capability.dependencies : [];
  const examples = Array.isArray(capability?.examples) ? capability.examples : [];
  const tags = Array.isArray(capability?.tags) ? capability.tags : [];
  const inputSchema = capability?.inputSchema ?? capability?.paramsSchema ?? {};
  const outputSchema = capability?.outputSchema ?? {};
  const description = capability?.description ?? '';
  const risk = String(capability?.risk ?? 'unknown').toLowerCase();

  return [
    `<li class="pivot-capability-browser__item pivot-capability-browser__item--${escapeAttr(risk)}">`,
    '<article class="pivot-capability-browser__card">',
    '<div class="pivot-capability-browser__card-header">',
    `<span class="pivot-capability-browser__index">#${escapeHTML(index + 1)}</span>`,
    `<span class="pivot-capability-browser__name">${escapeHTML(capability?.name ?? '')}</span>`,
    `<span class="pivot-capability-browser__risk">${escapeHTML(risk)}</span>`,
    '</div>',
    description ? `<div class="pivot-capability-browser__description">${escapeHTML(description)}</div>` : '',
    '<div class="pivot-capability-browser__grid">',
    renderCapabilityField('Resource', capability?.resource),
    renderCapabilityField('Action', capability?.action),
    renderCapabilityField('Domain', capability?.domain),
    renderCapabilityField('Group', capability?.group),
    renderCapabilityField('Version', capability?.version),
    renderCapabilityField('Confirm', capability?.requiresConfirmation ? 'required' : 'no'),
    renderCapabilityField('Unknown params', capability?.allowUnknownParams ? 'allowed' : 'blocked'),
    renderCapabilityField('Permissions', permissions.length),
    renderCapabilityField('Dependencies', dependencies.length),
    renderCapabilityField('Examples', examples.length),
    '</div>',
    renderCapabilityTokenList('Tags', tags, 'tag'),
    renderCapabilityTokenList('Permissions', permissions, 'permission'),
    renderCapabilityDependencyList(dependencies),
    renderCapabilitySchemaSummary('Input', inputSchema),
    renderCapabilitySchemaSummary('Output', outputSchema),
    renderCapabilityExampleList(examples),
    '</article>',
    '</li>'
  ].join('');
}

function renderPlanGraphSummaryItem(label, value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return [
    '<div class="pivot-plan-graph__summary-item">',
    `<span class="pivot-plan-graph__summary-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-plan-graph__summary-value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function renderCapabilityField(label, value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return [
    '<div class="pivot-capability-browser__field">',
    `<span class="pivot-capability-browser__field-label">${escapeHTML(label)}</span>`,
    `<span class="pivot-capability-browser__field-value">${escapeHTML(value)}</span>`,
    '</div>'
  ].join('');
}

function renderCapabilityTokenList(label, values, modifier) {
  if (!Array.isArray(values) || values.length === 0) {
    return '';
  }

  return [
    '<div class="pivot-capability-browser__tokens">',
    `<span class="pivot-capability-browser__tokens-label">${escapeHTML(label)}</span>`,
    ...values.map((value) => `<span class="pivot-capability-browser__token pivot-capability-browser__token--${escapeAttr(modifier)}">${escapeHTML(value)}</span>`),
    '</div>'
  ].join('');
}

function renderCapabilityDependencyList(dependencies) {
  if (!Array.isArray(dependencies) || dependencies.length === 0) {
    return '';
  }

  return [
    '<div class="pivot-capability-browser__detail">',
    '<span class="pivot-capability-browser__detail-label">Dependencies</span>',
    '<ul class="pivot-capability-browser__detail-list">',
    ...dependencies.map((dependency) => {
      const name = typeof dependency === 'string' ? dependency : dependency?.capability;
      const version = typeof dependency === 'object' && dependency?.version ? ` ${dependency.version}` : '';
      const optional = typeof dependency === 'object' && dependency?.optional ? ' optional' : '';
      const description = typeof dependency === 'object' && dependency?.description ? ` - ${dependency.description}` : '';

      return `<li>${escapeHTML(`${name ?? 'unknown'}${version}${optional}${description}`)}</li>`;
    }),
    '</ul>',
    '</div>'
  ].join('');
}

function renderCapabilitySchemaSummary(label, schema) {
  if (!isPlainObject(schema) || Object.keys(schema).length === 0) {
    return '';
  }

  return [
    '<div class="pivot-capability-browser__detail">',
    `<span class="pivot-capability-browser__detail-label">${escapeHTML(label)} schema</span>`,
    '<ul class="pivot-capability-browser__detail-list">',
    ...Object.entries(schema).map(([field, rule]) => {
      const type = typeof rule === 'string' ? rule : rule?.type ?? 'unknown';
      const required = typeof rule === 'object' && rule?.required ? ' required' : '';
      const sensitive = typeof rule === 'object' && rule?.sensitive ? ' sensitive' : '';

      return `<li><code>${escapeHTML(field)}</code>: ${escapeHTML(`${type}${required}${sensitive}`)}</li>`;
    }),
    '</ul>',
    '</div>'
  ].join('');
}

function renderCapabilityExampleList(examples) {
  if (!Array.isArray(examples) || examples.length === 0) {
    return '';
  }

  return [
    '<div class="pivot-capability-browser__detail">',
    '<span class="pivot-capability-browser__detail-label">Examples</span>',
    '<ul class="pivot-capability-browser__detail-list">',
    ...examples.map((example) => {
      const label = typeof example === 'string' ? example : example?.label ?? 'Example';
      const description = typeof example === 'object' && example?.description ? ` - ${example.description}` : '';
      const params = typeof example === 'object' && example?.params ? ` ${formatCapabilityValue(example.params)}` : '';

      return `<li>${escapeHTML(`${label}${description}${params}`)}</li>`;
    }),
    '</ul>',
    '</div>'
  ].join('');
}

function formatCapabilityValue(value) {
  try {
    return JSON.stringify(value, createJsonReplacer());
  } catch {
    return String(value);
  }
}

function applyCapabilityBrowserFilter(capabilities, filter, query) {
  return capabilities.filter((capability) => {
    if (query && !matchesCapabilityQuery(capability, query)) {
      return false;
    }

    if (!isPlainObject(filter)) {
      return true;
    }

    if (typeof filter.resource === 'string' && capability?.resource !== filter.resource) {
      return false;
    }

    if (typeof filter.action === 'string' && capability?.action !== filter.action) {
      return false;
    }

    if (typeof filter.domain === 'string' && capability?.domain !== filter.domain) {
      return false;
    }

    if (typeof filter.group === 'string' && capability?.group !== filter.group) {
      return false;
    }

    if (typeof filter.version === 'string' && capability?.version !== filter.version) {
      return false;
    }

    if (typeof filter.risk === 'string' && String(capability?.risk ?? '').toLowerCase() !== filter.risk.toLowerCase()) {
      return false;
    }

    if (typeof filter.requiresConfirmation === 'boolean' && Boolean(capability?.requiresConfirmation) !== filter.requiresConfirmation) {
      return false;
    }

    if (typeof filter.allowUnknownParams === 'boolean' && Boolean(capability?.allowUnknownParams) !== filter.allowUnknownParams) {
      return false;
    }

    if (typeof filter.permission === 'string') {
      const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];
      if (!permissions.includes(filter.permission)) {
        return false;
      }
    }

    if (typeof filter.tag === 'string') {
      const capabilityTags = Array.isArray(capability?.tags) ? capability.tags : [];
      if (!capabilityTags.includes(filter.tag)) {
        return false;
      }
    }

    if (Array.isArray(filter.permissions) && filter.permissions.length > 0) {
      const permissions = Array.isArray(capability?.permissions) ? capability.permissions : [];
      if (!filter.permissions.every((permission) => permissions.includes(permission))) {
        return false;
      }
    }

    if (typeof filter.dependency === 'string' && !matchesCapabilityDependency(capability, filter.dependency)) {
      return false;
    }

    if (Array.isArray(filter.dependencies) && filter.dependencies.length > 0 && !filter.dependencies.every((dependency) => matchesCapabilityDependency(capability, dependency))) {
      return false;
    }

    if (Array.isArray(filter.tags) && filter.tags.length > 0) {
      const capabilityTags = Array.isArray(capability?.tags) ? capability.tags : [];
      if (!filter.tags.every((tag) => capabilityTags.includes(tag))) {
        return false;
      }
    }

    return true;
  });
}

function matchesCapabilityDependency(capability, dependencyName) {
  const dependencies = Array.isArray(capability?.dependencies) ? capability.dependencies : [];
  return dependencies.some((dependency) => {
    const name = typeof dependency === 'string' ? dependency : dependency?.capability;
    return name === dependencyName;
  });
}

function matchesCapabilityQuery(capability, query) {
  const haystack = [
    capability?.name,
    capability?.description,
    capability?.resource,
    capability?.action,
    capability?.domain,
    capability?.group,
    capability?.version,
    ...(Array.isArray(capability?.tags) ? capability.tags : []),
    ...(Array.isArray(capability?.permissions) ? capability.permissions : []),
    ...(Array.isArray(capability?.dependencies) ? capability.dependencies.map((dependency) => typeof dependency === 'string' ? dependency : dependency?.capability) : [])
  ].filter(Boolean).join(' ').toLowerCase();

  return haystack.includes(query);
}

function summarizePlanGraph(graph) {
  const nodes = graph.entries.length;
  const edges = graph.edges.length;
  const layers = graph.layout.layers.length;
  const approvals = graph.entries.filter((entry) => isPlanGraphApprovalNode(entry.node)).length;
  const conditionalEdges = graph.edges.filter((edge) => hasPlanGraphEdgeCondition(edge.condition)).length;
  const ready = graph.entries.filter((entry) => getPlanGraphNodeStatus(entry) === 'ready').length;
  const blocked = graph.entries.filter((entry) => getPlanGraphNodeStatus(entry) === 'blocked').length;
  const skipped = graph.entries.filter((entry) => getPlanGraphNodeStatus(entry) === 'skipped').length;

  return {
    nodes,
    edges,
    layers,
    approvals,
    conditionalEdges,
    ready,
    blocked,
    skipped
  };
}

function normalizePlanGraphInput(value) {
  if (!isPlainObject(value)) {
    return null;
  }

  const previewData = isPlainObject(value?.data) ? value.data : null;
  const plan = isPlainObject(previewData?.plan)
    ? previewData.plan
    : isPlainObject(value?.plan)
      ? value.plan
      : isPlainObject(value) && Array.isArray(value.nodes)
        ? value
        : null;

  const previewNodes = Array.isArray(previewData?.nodes) ? previewData.nodes : null;
  const entries = previewNodes
    ? previewNodes.map((entry) => ({
        node: isPlainObject(entry?.node) ? entry.node : {},
        command: entry?.command ?? null,
        preview: isPlainObject(entry?.preview)
          ? entry.preview
          : isPlainObject(entry?.result)
            ? entry.result
            : null
      }))
    : Array.isArray(plan?.nodes)
      ? plan.nodes.map((node) => ({
          node: isPlainObject(node) ? node : {},
          command: null,
          preview: null
        }))
      : [];
  const normalizedEntries = entries.filter((entry) => String(entry?.node?.id ?? '').trim() !== '');

  const edges = Array.isArray(plan?.edges)
    ? plan.edges.filter((edge) => isPlainObject(edge))
    : Array.isArray(value?.edges)
      ? value.edges.filter((edge) => isPlainObject(edge))
      : [];

  const layout = buildPlanGraphLayout(normalizedEntries, edges);

  return {
    plan,
    entries: normalizedEntries,
    edges,
    layout,
    previewMode: Boolean(previewNodes)
  };
}

function buildPlanGraphLayout(entries, edges) {
  const nodeWidth = 220;
  const nodeHeight = 120;
  const columnGap = 72;
  const rowGap = 24;
  const nodesById = new Map();
  const positions = new Map();
  const incomingCounts = new Map();
  const outgoingCounts = new Map();
  const indegree = new Map();
  const adjacency = new Map();
  const orderIndexById = new Map();

  entries.forEach((entry, index) => {
    const id = String(entry?.node?.id ?? '').trim();

    if (!id) {
      return;
    }

    nodesById.set(id, entry);
    incomingCounts.set(id, 0);
    outgoingCounts.set(id, 0);
    indegree.set(id, 0);
    adjacency.set(id, []);
    orderIndexById.set(id, index);
  });

  for (const edge of edges) {
    const from = String(edge?.from ?? '').trim();
    const to = String(edge?.to ?? '').trim();

    if (!from || !to || !nodesById.has(from) || !nodesById.has(to) || from === to) {
      continue;
    }

    adjacency.get(from).push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
    incomingCounts.set(to, (incomingCounts.get(to) ?? 0) + 1);
    outgoingCounts.set(from, (outgoingCounts.get(from) ?? 0) + 1);
  }

  const layerById = new Map();
  const queue = Array.from(indegree.entries())
    .filter(([, count]) => count === 0)
    .sort((left, right) => (orderIndexById.get(left[0]) ?? 0) - (orderIndexById.get(right[0]) ?? 0))
    .map(([id]) => id);
  let cursor = 0;

  for (const id of queue) {
    layerById.set(id, 0);
  }

  while (cursor < queue.length) {
    const sourceId = queue[cursor];
    cursor += 1;
    const sourceLayer = layerById.get(sourceId) ?? 0;

    for (const targetId of adjacency.get(sourceId) ?? []) {
      const nextLayer = Math.max(layerById.get(targetId) ?? 0, sourceLayer + 1);
      layerById.set(targetId, nextLayer);

      const nextIndegree = (indegree.get(targetId) ?? 0) - 1;
      indegree.set(targetId, nextIndegree);

      if (nextIndegree === 0) {
        queue.push(targetId);
      }
    }
  }

  let fallbackLayer = (Math.max(0, ...layerById.values()) ?? 0) + 1;

  for (const entry of entries) {
    const id = String(entry?.node?.id ?? '').trim();

    if (!id || layerById.has(id)) {
      continue;
    }

    layerById.set(id, fallbackLayer);
    fallbackLayer += 1;
  }

  const layers = [];

  for (const entry of entries) {
    const id = String(entry?.node?.id ?? '').trim();

    if (!id) {
      continue;
    }

    const layerIndex = layerById.get(id) ?? 0;

    if (!layers[layerIndex]) {
      layers[layerIndex] = [];
    }

    layers[layerIndex].push(entry);
  }

  const compactLayers = layers.filter((layer) => Array.isArray(layer) && layer.length > 0)
    .map((layer) => layer.sort((left, right) => (orderIndexById.get(String(left?.node?.id ?? '')) ?? 0) - (orderIndexById.get(String(right?.node?.id ?? '')) ?? 0)));

  compactLayers.forEach((layer, layerIndex) => {
    layer.forEach((entry, rowIndex) => {
      const id = String(entry?.node?.id ?? '').trim();

      if (!id) {
        return;
      }

      positions.set(id, {
        x: layerIndex * (nodeWidth + columnGap),
        y: rowIndex * (nodeHeight + rowGap),
        layerIndex,
        rowIndex
      });
    });
  });

  const width = Math.max(nodeWidth, compactLayers.length * nodeWidth + Math.max(0, compactLayers.length - 1) * columnGap);
  const maxRows = compactLayers.reduce((maximum, layer) => Math.max(maximum, layer.length), 1);
  const height = Math.max(nodeHeight, maxRows * nodeHeight + Math.max(0, maxRows - 1) * rowGap);

  return {
    nodes: entries,
    entries,
    edges,
    layers: compactLayers,
    positions,
    incomingCounts,
    outgoingCounts,
    width,
    height,
    nodeWidth,
    nodeHeight,
    columnGap,
    rowGap
  };
}

function renderPlanGraphEdges(graph, graphId) {
  const paths = graph.edges.map((edge, _index) => {
    const fromPosition = graph.layout.positions.get(String(edge?.from ?? '').trim());
    const toPosition = graph.layout.positions.get(String(edge?.to ?? '').trim());

    if (!fromPosition || !toPosition) {
      return '';
    }

    const startX = fromPosition.x + graph.layout.nodeWidth;
    const startY = fromPosition.y + (graph.layout.nodeHeight / 2);
    const endX = toPosition.x;
    const endY = toPosition.y + (graph.layout.nodeHeight / 2);
    const midX = startX + Math.max(24, (endX - startX) / 2);
    const edgeStatus = hasPlanGraphEdgeCondition(edge?.condition) ? 'conditional' : 'default';
    const label = describePlanEdgeCondition(edge?.condition);

    return [
      `<path class="pivot-plan-graph__edge-line pivot-plan-graph__edge-line--${escapeAttr(edgeStatus)}" d="M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}" marker-end="url(#${escapeAttr(graphId)}-arrow)">`,
      `<title>${escapeHTML(`${edge?.from} -> ${edge?.to}${label ? ` (${label})` : ''}`)}</title>`,
      '</path>'
    ].join('');
  }).join('');

  return [
    `<svg class="pivot-plan-graph__edges" viewBox="0 0 ${graph.layout.width} ${graph.layout.height}" aria-hidden="true">`,
    '<defs>',
    `<marker id="${escapeAttr(graphId)}-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">`,
    '<path d="M 0 0 L 8 4 L 0 8 z" fill="currentColor"></path>',
    '</marker>',
    '</defs>',
    paths,
    '</svg>'
  ].join('');
}

function renderPlanGraphNode(entry, layout) {
  const node = isPlainObject(entry?.node) ? entry.node : {};
  const preview = isPlainObject(entry?.preview) ? entry.preview : null;
  const id = String(node.id ?? '').trim();
  const position = layout.positions.get(id) ?? {
    x: 0,
    y: 0,
    layerIndex: 0,
    rowIndex: 0
  };
  const status = getPlanGraphNodeStatus(entry);
  const kind = getPlanGraphNodeKind(node);
  const capability = node.capability ?? '';
  const intent = node.intent ?? '';
  const previewMessage = preview?.message ?? '';
  const incoming = layout.incomingCounts.get(id) ?? 0;
  const outgoing = layout.outgoingCounts.get(id) ?? 0;

  return [
    `<li class="pivot-plan-graph__node pivot-plan-graph__node--${escapeAttr(status)}" data-node-id="${escapeAttr(id)}" data-layer="${escapeAttr(position.layerIndex)}" data-row="${escapeAttr(position.rowIndex)}" style="left:${position.x}px;top:${position.y}px;width:${layout.nodeWidth}px;height:${layout.nodeHeight}px;">`,
    '<article class="pivot-plan-graph__card">',
    '<div class="pivot-plan-graph__node-header">',
    `<span class="pivot-plan-graph__node-id">${escapeHTML(id)}</span>`,
    `<span class="pivot-plan-graph__node-status">${escapeHTML(status)}</span>`,
    '</div>',
    `<div class="pivot-plan-graph__node-kind">${escapeHTML(kind)}</div>`,
    capability ? `<div class="pivot-plan-graph__node-capability">${escapeHTML(capability)}</div>` : '',
    intent ? `<div class="pivot-plan-graph__node-intent">${escapeHTML(intent)}</div>` : '',
    `<div class="pivot-plan-graph__node-meta">${escapeHTML(`In ${incoming} / Out ${outgoing}`)}</div>`,
    previewMessage ? `<div class="pivot-plan-graph__node-message">${escapeHTML(previewMessage)}</div>` : '',
    '</article>',
    '</li>'
  ].join('');
}

function renderPlanGraphEdgeList(graph) {
  if (!Array.isArray(graph.edges) || graph.edges.length === 0) {
    return '';
  }

  return [
    '<ol class="pivot-plan-graph__edge-list">',
    ...graph.edges.map((edge) => {
      const label = describePlanEdgeCondition(edge?.condition);
      const from = String(edge?.from ?? '');
      const to = String(edge?.to ?? '');

      return [
        '<li class="pivot-plan-graph__edge-item">',
        `<span class="pivot-plan-graph__edge-label">${escapeHTML(`${from} -> ${to}`)}</span>`,
        label ? `<span class="pivot-plan-graph__edge-condition">${escapeHTML(label)}</span>` : '',
        '</li>'
      ].join('');
    }),
    '</ol>'
  ].join('');
}

function getPlanGraphNodeStatus(entry) {
  const node = isPlainObject(entry?.node) ? entry.node : {};
  const preview = isPlainObject(entry?.preview) ? entry.preview : null;

  if (preview?.data?.skipped) {
    return 'skipped';
  }

  if (node.type === 'approval' || node.type === 'human-approval') {
    return preview ? (preview.ok ? 'approval' : 'blocked') : 'approval';
  }

  if (preview) {
    return preview.ok ? 'ready' : 'blocked';
  }

  return node.capability ? 'planned' : 'node';
}

function getPlanGraphNodeKind(node) {
  if (!isPlainObject(node)) {
    return 'node';
  }

  if (node.type === 'approval' || node.type === 'human-approval') {
    return 'approval node';
  }

  if (node.capability) {
    return 'capability node';
  }

  return 'workflow node';
}

function isPlanGraphApprovalNode(node) {
  return isPlainObject(node) && (node.type === 'approval' || node.type === 'human-approval');
}

function hasPlanGraphEdgeCondition(condition) {
  if (condition === undefined || condition === null || condition === '') {
    return false;
  }

  if (typeof condition === 'string') {
    return condition !== 'always';
  }

  return true;
}

function describePlanEdgeCondition(condition) {
  if (condition === undefined || condition === null || condition === '' || condition === 'always') {
    return '';
  }

  if (typeof condition === 'string') {
    return condition;
  }

  if (!isPlainObject(condition)) {
    return String(condition);
  }

  const parts = [];

  if (Object.hasOwn(condition, 'ok')) {
    parts.push(`ok=${condition.ok}`);
  }

  if (Object.hasOwn(condition, 'skipped')) {
    parts.push(`skipped=${condition.skipped}`);
  }

  if (typeof condition.path === 'string' && condition.path) {
    parts.push(`path=${condition.path}`);
  }

  if (Object.hasOwn(condition, 'exists')) {
    parts.push(`exists=${condition.exists}`);
  }

  if (Object.hasOwn(condition, 'equals')) {
    parts.push(`equals=${formatPlanGraphValue(condition.equals)}`);
  }

  if (Object.hasOwn(condition, 'notEquals')) {
    parts.push(`notEquals=${formatPlanGraphValue(condition.notEquals)}`);
  }

  if (Array.isArray(condition.in)) {
    parts.push(`in=${formatPlanGraphValue(condition.in)}`);
  }

  return parts.join(' ');
}

function formatPlanGraphValue(value) {
  try {
    return JSON.stringify(value, createJsonReplacer());
  } catch {
    return String(value);
  }
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

let planGraphSequence = 0;

function createPlanGraphId() {
  planGraphSequence += 1;
  return `pivot-plan-graph-${planGraphSequence}`;
}
