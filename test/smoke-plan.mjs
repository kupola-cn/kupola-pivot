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
  evaluatePlanEdgeCondition,
  getExecutionOrder,
  parseStructuredCommandOutput,
  parseStructuredPlanOutput,
  renderAuditViewerToHTML,
  renderCapabilityBrowserToHTML,
  renderPlanGraphToHTML,
  renderPlanPreviewToHTML,
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
  approvalRuntime,
  approvalCalls,
  auditRuntime,
  flakyAttempts,
  manifestRegistry,
  maxParallelExecutions,
  rejectionRuntime,
  runtime
} from './smoke-fixtures.mjs';
import { parsedStructuredCommand, result } from './smoke-command.mjs';

const plan = createPlan({
  intent: 'Create a HIS organization branch.',
  nodes: [
    { id: 'validate-parent', capability: 'organization.query' },
    {
      id: 'create-branch',
      capability: 'organization.create',
      params: { name: 'Branch E', parentId: 'group' }
    }
  ],
  edges: [{ from: 'validate-parent', to: 'create-branch' }]
});

const referencedPlan = createPlan({
  intent: 'Create a HIS organization branch from a previous query result.',
  nodes: [
    { id: 'lookup-parent', capability: 'organization.query' },
    {
      id: 'create-referenced-branch',
      capability: 'organization.create',
      params: {
        name: 'Branch G',
        parentId: { $from: 'lookup-parent', path: 'data.id' }
      }
    }
  ],
  edges: [{ from: 'lookup-parent', to: 'create-referenced-branch' }]
});

const structuredPlanOutput = {
  kind: 'plan',
  plan: referencedPlan
};

const topLevelStructuredPlanOutput = referencedPlan;

const invalidStructuredPlanOutput = parseStructuredPlanOutput({
  type: 'plan',
  plan: {
    id: 'broken-plan-output',
    intent: 'Broken plan output.',
    nodes: 'not-an-array',
    edges: []
  }
});

const parsedTopLevelStructuredPlan = parseStructuredPlanOutput(topLevelStructuredPlanOutput);

const contractPlan = createPlan({
  intent: 'Create a HIS organization branch with explicit input mapping and output contract.',
  nodes: [
    { id: 'lookup-parent-contract', capability: 'organization.query' },
    {
      id: 'create-branch-contract',
      capability: 'organization.create',
      input: {
        name: 'Branch L',
        parentId: { $from: 'lookup-parent-contract', path: 'data.id' }
      },
      inputSchema: {
        name: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      },
      outputSchema: {
        id: { type: 'string', required: true },
        name: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      }
    }
  ],
  edges: [{ from: 'lookup-parent-contract', to: 'create-branch-contract' }]
});

const invalidContractPlan = createPlan({
  intent: 'Reject an invalid plan node contract.',
  nodes: [
    {
      id: 'invalid-contract-node',
      capability: 'organization.create',
      input: 'bad-input'
    }
  ],
  edges: []
});

const outputContractFailurePlan = createPlan({
  intent: 'Reject a node whose output does not match the declared contract.',
  nodes: [
    {
      id: 'output-contract-failure',
      capability: 'organization.create.partial',
      input: {
        name: 'Branch M',
        parentId: 'group'
      },
      outputSchema: {
        id: { type: 'string', required: true },
        parentId: { type: 'string', required: true }
      }
    }
  ],
  edges: []
});

const brokenReferencePlan = createPlan({
  intent: 'Try to create a branch with a missing reference.',
  nodes: [
    {
      id: 'create-with-missing-reference',
      capability: 'organization.create',
      params: {
        name: 'Branch H',
        parentId: { $from: 'missing-node', path: 'data.id' }
      }
    }
  ],
  edges: []
});

const conditionalPlan = createPlan({
  intent: 'Create the matching organization branch from a classified result.',
  nodes: [
    { id: 'classify-organization', capability: 'organization.classify' },
    {
      id: 'create-branch-condition',
      capability: 'organization.create',
      params: { name: 'Branch I', parentId: 'group' }
    },
    {
      id: 'create-department-condition',
      capability: 'organization.create',
      params: { name: 'Department I', parentId: 'group' }
    }
  ],
  edges: [
    {
      from: 'classify-organization',
      to: 'create-branch-condition',
      condition: { path: 'data.kind', equals: 'branch' }
    },
    {
      from: 'classify-organization',
      to: 'create-department-condition',
      condition: { path: 'data.kind', equals: 'department' }
    }
  ]
});

const invalidConditionalPlan = createPlan({
  intent: 'Reject an unsafe condition expression.',
  nodes: [
    { id: 'classify-unsafe', capability: 'organization.classify' },
    { id: 'create-unsafe', capability: 'organization.create' }
  ],
  edges: [
    { from: 'classify-unsafe', to: 'create-unsafe', condition: 'data.kind === "branch"' }
  ]
});

const invalidAdvancedConditionPlan = createPlan({
  intent: 'Reject malformed advanced edge conditions.',
  nodes: [
    { id: 'classify-malformed', capability: 'organization.classify' },
    { id: 'create-malformed', capability: 'organization.create' }
  ],
  edges: [
    {
      from: 'classify-malformed',
      to: 'create-malformed',
      condition: { path: 'data.total', empty: 'yes' }
    }
  ]
});

const approvalPlan = createPlan({
  intent: 'Classify, approve, and finalize an organization branch.',
  nodes: [
    { id: 'classify-approval', capability: 'organization.classify' },
    {
      id: 'human-approval',
      type: 'approval',
      intent: 'Approve final branch creation.',
      approval: {
        title: 'Approve branch creation',
        description: 'Human approval is required before finalizing the branch.'
      }
    },
    {
      id: 'finalize-branch',
      capability: 'organization.finalize',
      params: { name: 'Branch J', parentId: 'group' }
    }
  ],
  edges: [
    { from: 'classify-approval', to: 'human-approval' },
    { from: 'human-approval', to: 'finalize-branch' }
  ]
});

const rejectedApprovalPlan = createPlan({
  intent: 'Reject a human approval gate.',
  nodes: [
    { id: 'classify-rejected-approval', capability: 'organization.classify' },
    {
      id: 'human-approval-rejected',
      type: 'approval',
      approval: {
        title: 'Reject branch creation'
      }
    },
    {
      id: 'finalize-rejected-branch',
      capability: 'organization.finalize',
      params: { name: 'Branch K', parentId: 'group' }
    }
  ],
  edges: [
    { from: 'classify-rejected-approval', to: 'human-approval-rejected' },
    { from: 'human-approval-rejected', to: 'finalize-rejected-branch' }
  ]
});

const parallelPlan = createPlan({
  intent: 'Run two independent organization actions in parallel.',
  nodes: [
    { id: 'parallel-alpha', capability: 'organization.parallel.alpha' },
    { id: 'parallel-beta', capability: 'organization.parallel.beta' }
  ],
  edges: []
});

const retryPlan = createPlan({
  intent: 'Retry a transient node failure.',
  nodes: [
    {
      id: 'retry-flaky',
      capability: 'organization.flaky',
      retry: {
        maxAttempts: 2,
        delayMs: 0,
        backoff: 'fixed'
      }
    }
  ],
  edges: []
});

const timeoutPlan = createPlan({
  intent: 'Timeout a slow node.',
  nodes: [
    {
      id: 'timeout-slow',
      capability: 'organization.slow',
      timeout: {
        ms: 20
      },
      retry: {
        maxAttempts: 2,
        delayMs: 0
      }
    }
  ],
  edges: []
});

const planValidation = validatePlan(plan);
const limitedPlanValidation = validatePlan(plan, { maxNodes: 1, maxEdges: 1 });
const invalidConditionalPlanValidation = validatePlan(invalidConditionalPlan);
const invalidAdvancedConditionPlanValidation = validatePlan(invalidAdvancedConditionPlan);
const invalidContractPlanValidation = validatePlan(invalidContractPlan);
const order = getExecutionOrder(plan);
const planPreview = await runtime.previewPlan(plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const blockedPlanPreview = await runtime.previewPlan(plan, {
  actor: {
    id: 'user-2',
    permissions: []
  }
});
const planResult = await runtime.executePlan(plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const referencedPlanPreview = await runtime.previewPlan(referencedPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const contractPlanPreview = await runtime.previewPlan(contractPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const referencedPlanResult = await runtime.executePlan(referencedPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const parsedStructuredPlan = parseStructuredPlanOutput(structuredPlanOutput);
const parsedStructuredCommandPreview = await runtime.previewCommand(parsedStructuredCommand.data.command, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const parsedStructuredPlanResult = await runtime.executePlan(parsedStructuredPlan.data.plan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const contractPlanResult = await runtime.executePlan(contractPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const brokenReferenceResult = await runtime.executePlan(brokenReferencePlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const outputContractFailureResult = await runtime.executePlan(outputContractFailurePlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  }
});
const approvalPlanPreview = await approvalRuntime.previewPlan(approvalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const approvalPlanResult = await approvalRuntime.executePlan(approvalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const rejectedApprovalPlanResult = await rejectionRuntime.executePlan(rejectedApprovalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});
const parallelPlanResult = await runtime.executePlan(parallelPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const retryPlanResult = await runtime.executePlan(retryPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const timeoutPlanResult = await runtime.executePlan(timeoutPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query']
  }
});
const conditionalPlanResult = await runtime.executePlan(conditionalPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create']
  }
});

const limitedRuntime = createPivotRuntime({
  planLimits: { maxNodes: 1, maxEdges: 1 }
});
const oversizedPreview = await limitedRuntime.previewPlan(plan);
const oversizedExecution = await limitedRuntime.executePlan(plan);

const failingPlan = createPlan({
  intent: 'Create a branch and compensate on failure.',
  nodes: [
    {
      id: 'create-branch-with-compensation',
      capability: 'organization.create',
      params: { name: 'Branch F', parentId: 'group' },
      compensate: [
        {
          capability: 'organization.delete',
          params: { id: 'org-1' }
        },
        {
          capability: 'organization.rollback.note',
          intent: 'Record rollback for branch F.',
          params: { note: 'branch-f-rollback' },
          metadata: { reason: 'cleanup' }
        }
      ],
      compensation: {
        order: 'forward',
        stopOnFailure: true
      }
    },
    { id: 'fail-after-create', capability: 'organization.fail' }
  ],
  edges: [{ from: 'create-branch-with-compensation', to: 'fail-after-create' }]
});

const failingPlanResult = await runtime.executePlan(failingPlan, {
  actor: {
    id: 'user-1',
    permissions: ['organization:query', 'organization:create', 'organization:delete']
  }
});

if (!planValidation.valid || order.map((node) => node.id).join(',') !== 'validate-parent,create-branch') {
  throw new Error('Expected plan validation and execution order to succeed.');
}

if (limitedPlanValidation.valid || !limitedPlanValidation.errors.some((error) => error.includes('node count exceeds limit'))) {
  throw new Error('Expected plan validation limits to reject oversized plans.');
}

if (invalidConditionalPlanValidation.valid || !invalidConditionalPlanValidation.errors.some((error) => error.includes('Unknown plan edge condition'))) {
  throw new Error('Expected plan validation to reject unknown plan edge condition strings.');
}

if (invalidAdvancedConditionPlanValidation.valid || !invalidAdvancedConditionPlanValidation.errors.some((error) => error.includes('empty must be a boolean'))) {
  throw new Error('Expected plan validation to reject malformed advanced edge conditions.');
}

const advancedConditionSource = {
  ok: true,
  data: {
    total: 2,
    name: 'Zhang San',
    tags: ['admin', 'active'],
    records: [{ id: 'u-1' }]
  }
};

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.total', gt: 1 } }, advancedConditionSource)) {
  throw new Error('Expected gt edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.total', gte: 2 } }, advancedConditionSource)) {
  throw new Error('Expected gte edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.total', lt: 3 } }, advancedConditionSource)) {
  throw new Error('Expected lt edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.total', lte: 2 } }, advancedConditionSource)) {
  throw new Error('Expected lte edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.name', contains: 'San' } }, advancedConditionSource)) {
  throw new Error('Expected string contains edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.tags', contains: 'active' } }, advancedConditionSource)) {
  throw new Error('Expected array contains edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.records', notEmpty: true } }, advancedConditionSource)) {
  throw new Error('Expected notEmpty edge condition to match.');
}

if (!evaluatePlanEdgeCondition({ condition: { path: 'data.missing', empty: true } }, advancedConditionSource)) {
  throw new Error('Expected empty edge condition to match missing values.');
}

if (evaluatePlanEdgeCondition({ condition: { path: 'data.total', gt: 5 } }, advancedConditionSource)) {
  throw new Error('Expected non-matching gt edge condition to fail.');
}

if (invalidContractPlanValidation.valid || !invalidContractPlanValidation.errors.some((error) => error.includes('Plan node input must be a plain object'))) {
  throw new Error('Expected plan validation to reject invalid node contract shapes.');
}

if (!parsedStructuredCommandPreview.ok || !parsedStructuredCommandPreview.data.requiresConfirmation) {
  throw new Error('Expected parsed structured command output to preview successfully.');
}

if (parsedStructuredCommandPreview.data.command.params.parentId !== 'group') {
  throw new Error('Expected parsed structured command preview to preserve command params.');
}

if (!parsedStructuredPlan.ok || parsedStructuredPlan.data.plan.id !== referencedPlan.id) {
  throw new Error('Expected structured plan output to parse into a plan.');
}

if (parsedStructuredPlanResult.ok !== true || parsedStructuredPlanResult.data.nodes.length !== 2) {
  throw new Error('Expected parsed structured plan output to execute successfully.');
}

if (!parsedTopLevelStructuredPlan.ok || parsedTopLevelStructuredPlan.data.plan.id !== referencedPlan.id) {
  throw new Error('Expected top-level structured plan output to parse into a plan.');
}

if (invalidStructuredPlanOutput.ok || !invalidStructuredPlanOutput.explain.errors.some((error) => error.includes('Plan nodes must be an array.'))) {
  throw new Error('Expected invalid structured plan output to fail validation.');
}

if (!planPreview.ok || !planPreview.data.requiresConfirmation || planPreview.data.status !== 'ready') {
  throw new Error('Expected plan preview to be ready and require confirmation.');
}

if (!Array.isArray(planPreview.explain.timeline) || !planPreview.explain.timeline.some((step) => step.stage === 'plan.node.preview')) {
  throw new Error('Expected plan preview to include node preview timeline steps.');
}

if (blockedPlanPreview.ok || blockedPlanPreview.data.status !== 'blocked') {
  throw new Error('Expected unauthorized plan preview to be blocked.');
}

if (oversizedPreview.ok || oversizedPreview.data.status !== 'blocked') {
  throw new Error('Expected runtime plan preview to block oversized plans.');
}

if (oversizedExecution.ok || oversizedExecution.data.nodes.length !== 0) {
  throw new Error('Expected runtime plan execution to reject oversized plans before nodes run.');
}

if (!referencedPlanPreview.ok || referencedPlanPreview.data.nodes[1].command.params.parentId !== '[ref:lookup-parent.data.id]') {
  throw new Error('Expected plan preview to show node param reference placeholders.');
}

if (!referencedPlanResult.ok || referencedPlanResult.data.nodes[1].result.data.parentId !== 'group') {
  throw new Error('Expected plan execution to resolve params from previous node results.');
}

if (!contractPlanPreview.ok || contractPlanPreview.data.nodes[1].command.params.parentId !== '[ref:lookup-parent-contract.data.id]') {
  throw new Error('Expected input mapping preview to show reference placeholders.');
}

if (!contractPlanResult.ok || contractPlanResult.data.nodes[1].result.data.parentId !== 'group') {
  throw new Error('Expected input mapping execution to resolve mapped node input values.');
}

if (brokenReferenceResult.ok || !brokenReferenceResult.data.nodes[0].result.message.includes('params could not be resolved')) {
  throw new Error('Expected plan execution to fail when a param reference cannot be resolved.');
}

if (outputContractFailureResult.ok || !outputContractFailureResult.data.nodes[0].result.message.includes('output contract failed')) {
  throw new Error('Expected plan execution to fail when a node output violates its contract.');
}

if (!outputContractFailureResult.explain.timeline.some((step) => step.stage === 'plan.node' && step.status === 'failed' && step.metadata.contract === 'output')) {
  throw new Error('Expected output contract failure to appear in the plan timeline.');
}

if (!conditionalPlanResult.ok || conditionalPlanResult.data.nodes.length !== 3) {
  throw new Error('Expected conditional plan execution to finish with executed and skipped branches.');
}

if (!conditionalPlanResult.data.nodes.find((item) => item.node.id === 'create-branch-condition')?.result.ok) {
  throw new Error('Expected matching conditional branch to execute.');
}

if (!conditionalPlanResult.data.nodes.find((item) => item.node.id === 'create-department-condition')?.result.data?.skipped) {
  throw new Error('Expected non-matching conditional branch to be skipped.');
}

if (conditionalPlanResult.explain.skippedNodes !== 1 || conditionalPlanResult.explain.executedNodes !== 2) {
  throw new Error('Expected conditional plan explain counts to distinguish executed and skipped nodes.');
}

if (!conditionalPlanResult.explain.timeline.some((step) => step.stage === 'plan.node' && step.status === 'skipped')) {
  throw new Error('Expected conditional plan timeline to include skipped node steps.');
}

if (!approvalPlanPreview.ok || !approvalPlanPreview.data.requiresConfirmation || !approvalPlanPreview.data.nodes.find((item) => item.node.id === 'human-approval')?.preview.data?.requiresApproval) {
  throw new Error('Expected approval plan preview to require approval.');
}

if (!approvalPlanResult.ok || approvalPlanResult.data.nodes.find((item) => item.node.id === 'human-approval')?.result.audit?.status !== 'confirmed') {
  throw new Error('Expected approval plan to confirm human approval and continue.');
}

if (rejectedApprovalPlanResult.ok || rejectedApprovalPlanResult.data.nodes.find((item) => item.node.id === 'human-approval-rejected')?.result.ok !== false) {
  throw new Error('Expected rejected approval plan to fail at the approval node.');
}

if (rejectedApprovalPlanResult.data.nodes.find((item) => item.node.id === 'finalize-rejected-branch')?.result?.data?.skipped) {
  throw new Error('Expected rejected approval plan to stop before the final node.');
}

if (!approvalCalls.length || approvalCalls[0].approval.title !== 'Approve branch creation') {
  throw new Error('Expected approval adapter to receive approval context.');
}

if (!parallelPlanResult.ok || parallelPlanResult.data.nodes.length !== 2 || maxParallelExecutions < 2) {
  throw new Error('Expected parallel plan execution to run independent nodes concurrently.');
}

if (!parallelPlanResult.explain.timeline.some((step) => step.stage === 'plan.layer' && step.status === 'started' && step.metadata.parallel)) {
  throw new Error('Expected parallel plan timeline to record a parallel layer.');
}

if (!retryPlanResult.ok || retryPlanResult.data.nodes[0].result.data.attempts !== 2 || flakyAttempts !== 2) {
  throw new Error('Expected retry plan execution to retry the flaky node and then succeed.');
}

if (!retryPlanResult.explain.timeline.some((step) => step.stage === 'execution' && step.status === 'retrying')) {
  throw new Error('Expected retry plan timeline to include a retry step.');
}

if (timeoutPlanResult.ok || timeoutPlanResult.data.nodes[0].result.audit?.metadata?.httpStatus !== 504) {
  throw new Error('Expected timeout plan execution to fail with a timeout status.');
}

if (!timeoutPlanResult.explain.timeline.some((step) => step.stage === 'execution' && step.status === 'timed-out')) {
  throw new Error('Expected timeout plan timeline to include a timeout step.');
}

if (!planResult.ok || planResult.data.nodes.length !== 2) {
  throw new Error('Expected plan execution to run both nodes.');
}

if (!Array.isArray(planResult.explain.timeline) || !planResult.explain.timeline.some((step) => step.stage === 'plan.node')) {
  throw new Error('Expected plan execution to include node timeline steps.');
}

if (failingPlanResult.ok || failingPlanResult.data.compensations.length !== 1) {
  throw new Error('Expected failed plan to run one compensation.');
}

if (!failingPlanResult.data.compensations[0].result.ok || failingPlanResult.data.compensations[0].steps.length !== 2) {
  throw new Error('Expected plan compensation to succeed.');
}

if (failingPlanResult.data.compensations[0].steps[0].command?.capability !== 'organization.delete' || failingPlanResult.data.compensations[0].steps[1].command?.capability !== 'organization.rollback.note') {
  throw new Error('Expected plan compensation steps to execute in declared order.');
}

if (!failingPlanResult.explain.timeline.some((step) => step.stage === 'plan.compensation.step') || !failingPlanResult.explain.timeline.some((step) => step.stage === 'plan.compensation')) {
  throw new Error('Expected failed plan timeline to include compensation steps.');
}

export {
  runtime,
  auditRuntime,
  manifestRegistry,
  planPreview,
  conditionalPlanResult,
  failingPlanResult,
  result
};
