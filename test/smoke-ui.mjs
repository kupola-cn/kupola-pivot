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
  mountAuditViewer,
  mountCapabilityBrowser,
  mountPlanGraph,
  mountPlanPreview,
  mountResult,
  mountTimelineDetail,
  mountTimeline,
  renderTimelineDetailToHTML,
  redactParams,
  renderResultToHTML,
  renderTimelineToHTML,
  validateCapabilityManifest,
  validateParams,
  validatePlan
} from '@kupola/pivot';
import { readFileSync } from 'node:fs';
import {
  auditRuntime,
  conditionalPlanResult,
  failingPlanResult,
  manifestRegistry,
  planPreview,
  result,
  runtime
} from './smoke-plan.mjs';

const timelineHTML = renderTimelineToHTML(result.explain.timeline);
const resultHTML = renderResultToHTML(failingPlanResult);
const planPreviewHTML = renderPlanPreviewToHTML(planPreview);
const timelineDetailHTML = renderTimelineDetailToHTML(result);
const auditViewerHTML = renderAuditViewerToHTML(auditRuntime.getAuditEvents());
const planGraphHTML = renderPlanGraphToHTML(conditionalPlanResult);
const escapedPlanGraphHTML = renderPlanGraphToHTML({
  plan: {
    id: '<script>plan</script>',
    intent: '<script>graph</script>',
    nodes: [
      {
        id: '<node>',
        capability: '<capability>',
        intent: '<intent>'
      }
    ],
    edges: [
      {
        from: '<node>',
        to: '<node>',
        condition: {
          path: 'data.kind',
          equals: '<img src=x>'
        }
      }
    ]
  }
});
const capabilityBrowserHTML = renderCapabilityBrowserToHTML(manifestRegistry.list(), {
  query: 'team',
  filter: {
    domain: 'team',
    permission: 'team:create',
    tag: 'create'
  }
});
const filteredCapabilityBrowserHTML = renderCapabilityBrowserToHTML(runtime.listCapabilities(), {
  filter: {
    risk: 'medium',
    allowUnknownParams: true
  }
});

if (!timelineHTML.includes('pivot-timeline') || !resultHTML.includes('pivot-result--failed') || !planPreviewHTML.includes('pivot-plan-preview') || !timelineDetailHTML.includes('pivot-timeline-detail') || !auditViewerHTML.includes('pivot-audit-viewer') || !capabilityBrowserHTML.includes('pivot-capability-browser') || !planGraphHTML.includes('pivot-plan-graph')) {
  throw new Error('Expected UI renderers to produce timeline and result markup.');
}

if (!timelineHTML.includes('aria-label="Timeline"') || !resultHTML.includes('role="region"') || !planPreviewHTML.includes('role="region"') || !timelineDetailHTML.includes('role="region"') || !auditViewerHTML.includes('role="region"') || !capabilityBrowserHTML.includes('role="region"') || !planGraphHTML.includes('role="region"')) {
  throw new Error('Expected UI renderers to expose accessible region semantics.');
}

if (!planPreviewHTML.includes('pivot-plan-preview__node') || !planPreviewHTML.includes('validate-parent')) {
  throw new Error('Expected plan preview renderer to include node summaries.');
}

if (!planGraphHTML.includes('pivot-plan-graph__edge-line--conditional') || !planGraphHTML.includes('create-branch-condition') || !planGraphHTML.includes('skipped')) {
  throw new Error('Expected plan graph renderer to include conditional edges and node statuses.');
}

if (escapedPlanGraphHTML.includes('<script>') || escapedPlanGraphHTML.includes('<img') || escapedPlanGraphHTML.includes('<node>')) {
  throw new Error('Expected plan graph renderer to escape HTML content.');
}

if (!capabilityBrowserHTML.includes('team.create') || !capabilityBrowserHTML.includes('pivot-capability-browser__token--permission') || !capabilityBrowserHTML.includes('pivot-capability-browser__detail-label')) {
  throw new Error('Expected capability browser renderer to include capability details and tokens.');
}

if (!filteredCapabilityBrowserHTML.includes('organization.metadata') || filteredCapabilityBrowserHTML.includes('user.password.update')) {
  throw new Error('Expected capability browser filters to narrow the visible capabilities.');
}

const escapedCapabilityBrowserHTML = renderCapabilityBrowserToHTML([
  {
    name: '<script>alert(1)</script>',
    resource: 'test',
    action: 'query',
    risk: 'low',
    permissions: ['test:query'],
    tags: ['<img>'],
    dependencies: ['dep-1'],
    inputSchema: { field: { type: 'string', required: true } },
    outputSchema: { ok: { type: 'boolean' } },
    examples: [{ label: '<b>x</b>', description: '<i>y</i>', params: { nested: '<svg>' } }]
  }
]);

if (escapedCapabilityBrowserHTML.includes('<script>') || escapedCapabilityBrowserHTML.includes('<img>') || escapedCapabilityBrowserHTML.includes('<svg>')) {
  throw new Error('Expected capability browser renderer to escape HTML content.');
}

if (!timelineDetailHTML.includes('pivot-timeline-detail__audit') || !timelineDetailHTML.includes('pivot-timeline-detail__timeline')) {
  throw new Error('Expected timeline detail renderer to include audit and timeline sections.');
}

if (!auditViewerHTML.includes('organization.audit.create') || !auditViewerHTML.includes('audit-user')) {
  throw new Error('Expected audit viewer renderer to include audit entries.');
}

const escapedHTML = renderTimelineToHTML([{ stage: '<script>', status: 'failed', message: '<img src=x onerror=alert(1)>' }]);

if (escapedHTML.includes('<script>') || escapedHTML.includes('<img')) {
  throw new Error('Expected UI renderer to escape HTML content.');
}

if (!renderTimelineToHTML([], { ariaLabel: 'Activity timeline' }).includes('role="status"')) {
  throw new Error('Expected empty timeline renderer to expose a status role.');
}

const mountTarget = createMountTarget();
mountTimeline(mountTarget, [{ stage: 'validation', status: 'passed', message: '<b>safe</b>' }], { ariaLabel: 'Activity timeline' });

if (mountTarget.attributes['data-pivot-mounted'] !== 'timeline' || mountTarget.attributes['aria-live'] !== 'polite' || mountTarget.attributes['aria-label'] !== 'Activity timeline' || mountTarget.innerHTML.includes('<b>safe</b>')) {
  throw new Error('Expected mountTimeline to set mount metadata and escape hostile text.');
}

mountResult(mountTarget, result, { ariaLabel: 'Execution result' });

if (mountTarget.attributes['data-pivot-mounted'] !== 'result') {
  throw new Error('Expected mountResult to update the mount marker.');
}

mountPlanPreview(mountTarget, planPreview, { ariaLabel: 'Plan preview region' });
mountTimelineDetail(mountTarget, result, { ariaLabel: 'Timeline detail region' });
mountAuditViewer(mountTarget, auditRuntime.getAuditEvents(), { ariaLabel: 'Audit viewer region' });
mountCapabilityBrowser(mountTarget, runtime.listCapabilities(), { ariaLabel: 'Capability browser region' });
mountPlanGraph(mountTarget, conditionalPlanResult, { ariaLabel: 'Plan graph region' });

if (mountTarget.attributes['data-pivot-mounted'] !== 'plan-graph') {
  throw new Error('Expected mountPlanGraph to update the mount marker.');
}

const css = readFileSync(new URL('../packages/ui/src/pivot.css', import.meta.url), 'utf8');

if (!css.includes('.pivot-result') || !css.includes('.pivot-timeline') || !css.includes('.pivot-capability-browser') || !css.includes('.pivot-plan-graph')) {
  throw new Error('Expected default PIVOT UI CSS to include result, timeline, capability, and graph styles.');
}

function createMountTarget() {
  return {
    innerHTML: '',
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}
