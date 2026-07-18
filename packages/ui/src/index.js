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

  if (!Array.isArray(timeline) || timeline.length === 0) {
    return `<ol class="${escapeAttr(className)} pivot-timeline--empty"><li>${escapeHTML(emptyText)}</li></ol>`;
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

  return `<ol class="${escapeAttr(className)}">${items}</ol>`;
}

export function renderResultToHTML(result, options = {}) {
  const className = options.className ?? 'pivot-result';
  const ok = Boolean(result?.ok);
  const status = ok ? 'success' : 'failed';
  const message = result?.message ?? '';
  const timeline = result?.explain?.timeline ?? [];
  const includeTimeline = options.includeTimeline ?? true;

  return [
    `<section class="${escapeAttr(className)} pivot-result--${status}">`,
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

  if (!result || typeof result !== 'object') {
    return `<section class="${escapeAttr(className)} pivot-timeline-detail--empty"><div class="pivot-timeline-detail__empty">${escapeHTML(emptyText)}</div></section>`;
  }

  return [
    `<section class="${escapeAttr(className)} pivot-timeline-detail--${escapeAttr(status)}">`,
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

  if (!preview || typeof preview !== 'object') {
    return `<section class="${escapeAttr(className)} pivot-plan-preview--empty"><div class="pivot-plan-preview__empty">${escapeHTML(emptyText)}</div></section>`;
  }

  return [
    `<section class="${escapeAttr(className)} pivot-plan-preview--${escapeAttr(status)}">`,
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

export function mountTimeline(target, timeline = [], options = {}) {
  const element = resolveTarget(target);
  element.innerHTML = renderTimelineToHTML(timeline, options);
  return element;
}

export function mountResult(target, result, options = {}) {
  const element = resolveTarget(target);
  element.innerHTML = renderResultToHTML(result, options);
  return element;
}

export function mountPlanPreview(target, preview, options = {}) {
  const element = resolveTarget(target);
  element.innerHTML = renderPlanPreviewToHTML(preview, options);
  return element;
}

export function mountTimelineDetail(target, result, options = {}) {
  const element = resolveTarget(target);
  element.innerHTML = renderTimelineDetailToHTML(result, options);
  return element;
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
