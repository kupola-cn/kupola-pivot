export function createTrustedUIAdapter(adapter = {}) {
  return {
    showMessage: adapter.showMessage ?? (() => {}),
    showResult: adapter.showResult ?? (() => {}),
    confirm: adapter.confirm ?? (async () => false),
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
