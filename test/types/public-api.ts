import {
  ActionType,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPivotRuntime,
  createPlan,
  createTrustedUIAdapter,
  renderPlanPreviewToHTML,
  type PivotAuditEvent,
  type PivotCapability,
  type PivotCommand,
  type PivotPlan,
  type PivotResult,
  type PivotRuntime
} from '@kupola/pivot';
import { validatePlan, type PivotPlanNode } from '@kupola/pivot-orchestrator';
import { allow, type PivotPolicy } from '@kupola/pivot-policy';
import { createCapability, type PivotCapabilityManifest } from '@kupola/pivot-protocol';
import { renderTimelineToHTML, type TrustedUIAdapter } from '@kupola/pivot-ui';

const policy: PivotPolicy = () => allow('typed policy');
const ui: TrustedUIAdapter = createTrustedUIAdapter({
  confirm: async () => true,
  approve: async () => true
});

const runtime: PivotRuntime = createPivotRuntime({
  policies: [createPermissionPolicy(), policy],
  ui,
  auditSinks: [
    (event: PivotAuditEvent) => {
      event.metadata.requestId;
    }
  ]
});

const capability: PivotCapability = createCapability({
  name: 'typed.account.create',
  resource: 'typed.account',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['typed:account:create'],
  paramsSchema: {
    name: { type: 'string', required: true }
  },
  dryRun: async ({ params }) => ({ name: params.name }),
  execute: async ({ params }) => ({ id: 'typed-account', name: params.name })
});

const manifest: Partial<PivotCapabilityManifest> = {
  name: capability.name,
  manifestVersion: '0.1.0',
  version: '1.0.0',
  domain: 'typed',
  group: 'typed.account',
  tags: ['typed'],
  dependencies: [],
  inputSchema: capability.paramsSchema,
  outputSchema: {
    id: { type: 'string' }
  },
  examples: []
};

runtime.registerCapability({
  ...manifest,
  resource: capability.resource,
  action: capability.action,
  risk: capability.risk,
  permissions: capability.permissions,
  paramsSchema: capability.paramsSchema,
  dryRun: capability.dryRun,
  execute: capability.execute
});

const command: PivotCommand = createCommand({
  intent: 'Create a typed account.',
  resource: 'typed.account',
  action: ActionType.CREATE,
  capability: 'typed.account.create',
  risk: RiskLevel.MEDIUM,
  params: {
    name: 'Typed Account'
  }
});

const node: PivotPlanNode = {
  id: 'typed-node',
  capability: command.capability,
  params: command.params
};

const plan: PivotPlan = createPlan({
  intent: 'Run a typed plan.',
  nodes: [node],
  edges: []
});

const validation = validatePlan(plan);
const timelineHtml: string = renderTimelineToHTML([]);

async function exerciseTypedRuntime(): Promise<PivotResult> {
  const preview = await runtime.previewCommand(command);
  const simulation = await runtime.simulateCommand(command);
  const execution = await runtime.executeCommand(command);
  const planPreview = await runtime.previewPlan(plan);

  const previewHtml: string = renderPlanPreviewToHTML(planPreview);

  if (!validation.valid || !preview.ok || !simulation.ok || !execution.ok || !previewHtml || !timelineHtml) {
    throw new Error('Typed PIVOT API exercise failed.');
  }

  return execution;
}

void exerciseTypedRuntime();
