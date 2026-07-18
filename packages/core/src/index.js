export {
  ActionType,
  CAPABILITY_MANIFEST_VERSION,
  CommandStatus,
  FieldType,
  PIVOT_PROTOCOL_VERSION,
  RiskLevel,
  createCapability,
  createCapabilityManifest,
  createAuditEvent,
  createCommand,
  createResult,
  createValidationResult,
  redactParams,
  validateCapability,
  validateCapabilityManifest,
  validateCommand,
  validateParams
} from '@kupola/pivot-protocol';
export {
  PolicyDecision,
  allow,
  confirm,
  createPermissionPolicy,
  createPolicyPipeline,
  createRiskPolicy,
  createSensitiveResourcePolicy,
  deny,
  escalate,
  mapHttpStatusToPolicy
} from '@kupola/pivot-policy';
export { addEdge, addNode, createPlan, evaluatePlanEdgeCondition, getExecutionLayers, getExecutionOrder, validatePlan } from '@kupola/pivot-orchestrator';
export { createTrustedUIAdapter, mountResult, mountTimeline, renderResultToHTML, renderTimelineToHTML } from '@kupola/pivot-ui';
export { createCapabilityRegistry } from './capability-registry.js';

import { CommandStatus, RiskLevel, createAuditEvent, createCommand, createResult, redactParams } from '@kupola/pivot-protocol';
import { PolicyDecision, confirm, createPolicyPipeline } from '@kupola/pivot-policy';
import { evaluatePlanEdgeCondition, getExecutionLayers, getExecutionOrder, validatePlan } from '@kupola/pivot-orchestrator';
import { createCapabilityRegistry } from './capability-registry.js';
import { createTrustedUIAdapter } from '@kupola/pivot-ui';

export function createPivotRuntime(options = {}) {
  const registry = options.registry ?? createCapabilityRegistry(options.capabilityRegistry);
  const policyPipeline = options.policyPipeline ?? createPolicyPipeline(options.policies);
  const ui = createTrustedUIAdapter(options.ui);
  const planLimits = normalizePlanLimits(options.planLimits);
  const auditEvents = [];

  const emitAudit = (eventInput) => {
    const event = createAuditEvent(eventInput);
    auditEvents.push(event);
    options.onAudit?.(event);
    return event;
  };

  const previewCommand = async (command, context = {}) => {
    const timeline = [];
    const validation = registry.validateCommand(command);
    const capability = registry.get(command?.capability);

    if (!validation.valid) {
      timeline.push(createTimelineStep('validation', 'failed', 'Command validation failed.', {
        errors: validation.errors,
        warnings: validation.warnings
      }));

      return createResult({
        ok: false,
        message: 'Command validation failed.',
        explain: {
          errors: validation.errors,
          warnings: validation.warnings,
          requiresConfirmation: false,
          timeline
        }
      });
    }

    timeline.push(createTimelineStep('validation', 'passed', 'Command validation passed.', {
      warnings: validation.warnings
    }));

    const policyDecision = await policyPipeline.evaluate({ command, capability, context });
    timeline.push(createTimelineStep('policy', policyDecision.decision, policyDecision.reason, {
      policy: policyDecision
    }));

    const requiresConfirmation = needsConfirmation(command, capability, policyDecision);
    timeline.push(createTimelineStep('preview', 'ready', 'Command preview is ready.', {
      requiresConfirmation
    }));

    return createResult({
      ok: policyDecision.decision !== PolicyDecision.DENY && policyDecision.decision !== PolicyDecision.ESCALATE,
      data: {
        command: redactCommand(command, capability),
        capability: toCapabilityPreview(capability),
        policy: policyDecision,
        requiresConfirmation
      },
      message: policyDecision.reason,
      explain: {
        policy: policyDecision,
        warnings: validation.warnings,
        timeline
      }
    });
  };

  const executeCommand = async (command, context = {}) => {
    const timeline = [];
    const validation = registry.validateCommand(command);
    const capability = registry.get(command?.capability);

    if (!validation.valid) {
      timeline.push(createTimelineStep('validation', 'failed', 'Command validation failed.', {
        errors: validation.errors,
        warnings: validation.warnings
      }));

      const audit = emitAudit({
        actor: context.actor,
        intent: command?.intent,
        commandId: command?.id,
        capability: command?.capability,
        decision: PolicyDecision.DENY,
        status: CommandStatus.REJECTED,
        reason: validation.errors.join('; ')
      });

      return createResult({
        ok: false,
        message: 'Command validation failed.',
        explain: { errors: validation.errors, warnings: validation.warnings, timeline },
        audit
      });
    }

    timeline.push(createTimelineStep('validation', 'passed', 'Command validation passed.', {
      warnings: validation.warnings
    }));

    const policyDecision = await policyPipeline.evaluate({ command, capability, context });
    timeline.push(createTimelineStep('policy', policyDecision.decision, policyDecision.reason, {
      policy: policyDecision
    }));

    if (policyDecision.decision === PolicyDecision.DENY || policyDecision.decision === PolicyDecision.ESCALATE) {
      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.BLOCKED,
        reason: policyDecision.reason
      });

      return createResult({
        ok: false,
        message: policyDecision.reason,
        explain: { policy: policyDecision, timeline },
        audit
      });
    }

    const requiresConfirmation = needsConfirmation(command, capability, policyDecision);
    timeline.push(createTimelineStep('confirmation', requiresConfirmation ? 'required' : 'skipped', requiresConfirmation ? 'Confirmation is required.' : 'Confirmation is not required.'));

    const confirmation = requiresConfirmation
      ? await ui.confirm({ command: redactCommand(command, capability), capability, policy: policyDecision, context })
      : true;

    if (!confirmation) {
      timeline.push(createTimelineStep('confirmation', 'rejected', 'User rejected command confirmation.'));

      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: PolicyDecision.CONFIRM,
        status: CommandStatus.REJECTED,
        reason: 'User rejected command confirmation.'
      });

      return createResult({
        ok: false,
        message: 'Command confirmation was rejected.',
        explain: { policy: policyDecision, timeline },
        audit
      });
    }

    if (requiresConfirmation) {
      timeline.push(createTimelineStep('confirmation', 'confirmed', 'User confirmed command execution.'));
    }

    if (typeof capability.execute !== 'function') {
      timeline.push(createTimelineStep('execution', 'failed', 'Capability has no execute function.'));

      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.FAILED,
        reason: 'Capability has no execute function.'
      });

      return createResult({
        ok: false,
        message: 'Capability is not executable.',
        explain: { capability: capability.name, timeline },
        audit
      });
    }

    try {
      const data = await capability.execute({ command, params: command.params, context });
      timeline.push(createTimelineStep('execution', 'executed', 'Command executed.', {
        capability: capability.name
      }));

      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.EXECUTED,
        reason: 'Command executed.'
      });

      return createResult({
        ok: true,
        data,
        message: 'Command executed.',
        explain: { capability: capability.name, policy: policyDecision, timeline },
        audit
      });
    } catch (error) {
      const failure = normalizeExecutionError(error);
      timeline.push(createTimelineStep('execution', failure.timelineStatus, failure.timelineMessage, {
        error: failure.reason,
        status: failure.httpStatus
      }));

      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: failure.decision ?? policyDecision.decision,
        status: failure.commandStatus,
        reason: failure.reason,
        metadata: failure.httpStatus ? { httpStatus: failure.httpStatus } : {}
      });

      return createResult({
        ok: false,
        message: failure.resultMessage,
        explain: {
          error: audit.reason,
          status: failure.httpStatus,
          timeline
        },
        audit
      });
    }
  };

  const previewPlan = async (plan, context = {}) => {
    const timeline = [];
    const validation = validatePlan(plan, planLimits);

    if (!validation.valid) {
      timeline.push(createTimelineStep('plan.validation', 'failed', 'Plan validation failed.', validation));

      return createResult({
        ok: false,
        message: 'Plan validation failed.',
        explain: { ...validation, timeline },
        data: {
          plan,
          nodes: [],
          status: 'blocked',
          requiresConfirmation: false
        }
      });
    }

    const orderedNodes = getExecutionOrder(plan);
    const nodePreviews = [];
    timeline.push(createTimelineStep('plan.validation', 'passed', 'Plan validation passed.', {
      warnings: validation.warnings,
      nodes: orderedNodes.length
    }));

    for (const node of orderedNodes) {
      timeline.push(createTimelineStep('plan.node.preview', 'started', `Plan node preview started: ${node.id}`, {
        nodeId: node.id,
        capability: node.capability
      }));

      if (isApprovalNode(node)) {
        const preview = createApprovalPreview(plan, node);

        nodePreviews.push({ node, command: null, preview });
        timeline.push(createTimelineStep('plan.node.preview', 'ready', `Plan approval node preview ready: ${node.id}`, {
          nodeId: node.id,
          approval: true,
          requiresApproval: true
        }));
        continue;
      }

      const capability = registry.get(node.capability);

      if (!capability) {
        const preview = createResult({
          ok: false,
          message: `Plan node capability is not registered: ${node.capability}`,
          explain: { nodeId: node.id, capability: node.capability }
        });

        nodePreviews.push({ node, command: null, preview });
        timeline.push(createTimelineStep('plan.node.preview', 'blocked', `Plan node preview blocked: ${node.id}`, {
          nodeId: node.id,
          capability: node.capability,
          reason: preview.message
        }));
        continue;
      }

      const command = node.command
        ? previewPlanCommand(node.command)
        : createPlanNodeCommand(plan, node, capability, null);
      const preview = await previewCommand(command, {
        ...context,
        plan,
        node
      });

      nodePreviews.push({
        node,
        command: preview.data?.command ?? redactCommand(command, capability),
        preview
      });
      timeline.push(createTimelineStep('plan.node.preview', preview.ok ? 'ready' : 'blocked', `Plan node preview ${preview.ok ? 'ready' : 'blocked'}: ${node.id}`, {
        nodeId: node.id,
        capability: node.capability,
        commandId: command.id,
        reason: preview.message
      }));
    }

    const blockedNodes = nodePreviews.filter((item) => !item.preview.ok);
    const confirmationNodes = nodePreviews.filter((item) => Boolean(item.preview.data?.requiresConfirmation));
    const ok = blockedNodes.length === 0;
    timeline.push(createTimelineStep('plan.preview', ok ? 'ready' : 'blocked', ok ? 'Plan preview is ready.' : 'Plan preview contains blocked nodes.', {
      blockedNodes: blockedNodes.length,
      confirmationNodes: confirmationNodes.length
    }));

    return createResult({
      ok,
      message: ok ? 'Plan preview is ready.' : 'Plan preview contains blocked nodes.',
      data: {
        plan,
        nodes: nodePreviews,
        status: ok ? 'ready' : 'blocked',
        requiresConfirmation: confirmationNodes.length > 0
      },
      explain: {
        nodes: nodePreviews.length,
        blockedNodes: blockedNodes.length,
        confirmationNodes: confirmationNodes.length,
        timeline
      }
    });
  };

  const executePlan = async (plan, context = {}, options = {}) => {
    const timeline = [];
    const validation = validatePlan(plan, planLimits);

    if (!validation.valid) {
      timeline.push(createTimelineStep('plan.validation', 'failed', 'Plan validation failed.', validation));

      return createResult({
        ok: false,
        message: 'Plan validation failed.',
        explain: { ...validation, timeline },
        data: {
          plan,
          nodes: []
        }
      });
    }

    const stopOnError = options.stopOnError ?? true;
    const compensateOnError = options.compensateOnError ?? true;
    const executionLayers = getExecutionLayers(plan);
    const orderedNodes = executionLayers.flat();
    const nodeResults = [];
    const resultsByNodeId = {};
    const incomingEdgesByNodeId = groupIncomingEdges(plan);
    timeline.push(createTimelineStep('plan.validation', 'passed', 'Plan validation passed.', {
      warnings: validation.warnings,
      nodes: orderedNodes.length
    }));

    for (const [layerIndex, layer] of executionLayers.entries()) {
      timeline.push(createTimelineStep('plan.layer', 'started', `Plan layer started: ${layerIndex + 1}`, {
        layerIndex,
        nodeIds: layer.map((node) => node.id),
        nodeCount: layer.length,
        parallel: layer.length > 1
      }));

      const layerResults = await Promise.all(layer.map((node) => executePlanNode({
        plan,
        node,
        context,
        registry,
        executeCommand,
        ui,
        emitAudit,
        incomingEdgesByNodeId,
        resultsByNodeId
      })));

      for (const entry of layerResults) {
        nodeResults.push({ node: entry.node, command: entry.command, result: entry.result });
        resultsByNodeId[entry.node.id] = entry.result;
        timeline.push(...entry.timeline);
      }

      const failedNodes = layerResults.filter((item) => !item.result.ok);
      timeline.push(createTimelineStep('plan.layer', failedNodes.length > 0 ? 'failed' : 'executed', failedNodes.length > 0 ? `Plan layer completed with failures: ${layerIndex + 1}` : `Plan layer executed: ${layerIndex + 1}`, {
        layerIndex,
        nodeIds: layer.map((node) => node.id),
        failedNodes: failedNodes.length,
        parallel: layer.length > 1
      }));

      if (failedNodes.length > 0 && stopOnError) {
        const compensations = compensateOnError
          ? await compensatePlan({ plan, nodeResults, context, resultsByNodeId, failedNode: failedNodes[0]?.node })
          : [];

        addCompensationTimeline(timeline, compensations);
        return createPlanResult(plan, nodeResults, false, 'Plan execution failed.', compensations, timeline);
      }
    }

    const ok = nodeResults.every((item) => item.result.ok);
    timeline.push(createTimelineStep('plan.execution', ok ? 'executed' : 'failed', ok ? 'Plan executed.' : 'Plan completed with failures.'));
    return createPlanResult(plan, nodeResults, ok, ok ? 'Plan executed.' : 'Plan completed with failures.', [], timeline);
  };

  const compensatePlan = async ({ plan, nodeResults, context, resultsByNodeId, failedNode }) => {
    const compensations = [];
    const successfulNodes = nodeResults.filter((item) => item.result.ok && !item.result.data?.skipped && !isApprovalNode(item.node)).reverse();

    for (const item of successfulNodes) {
      const compensation = item.node.compensate;

      if (!compensation) {
        compensations.push({
          node: item.node,
          command: null,
          result: createResult({
            ok: true,
            message: 'No compensation configured.',
            data: { skipped: true }
          })
        });
        continue;
      }

      const capabilityName = compensation.capability ?? item.node.compensateCapability;
      const capability = registry.get(capabilityName);

      if (!capability) {
        compensations.push({
          node: item.node,
          command: null,
          result: createResult({
            ok: false,
            message: `Compensation capability is not registered: ${String(capabilityName)}`,
            explain: { capability: capabilityName }
          })
        });
        continue;
      }

      const command = compensation.command ? resolvePlanCommand(compensation.command, resultsByNodeId) : createCommand({
        intent: compensation.intent ?? `Compensate ${item.node.id}`,
        resource: capability.resource,
        action: capability.action,
        capability: capability.name,
        risk: compensation.risk ?? capability.risk,
        params: resolvePlanParams(compensation.params ?? {}, resultsByNodeId),
        metadata: {
          ...(compensation.metadata ?? {}),
          planId: plan.id,
          nodeId: item.node.id,
          failedNodeId: failedNode?.id,
          compensation: true
        }
      });

      const result = await executeCommand(command, {
        ...context,
        plan,
        node: item.node,
        failedNode,
        compensatedNodeResult: item.result,
        planResults: resultsByNodeId,
        compensating: true
      });

      compensations.push({ node: item.node, command, result });
    }

    return compensations;
  };

  return {
    registry,
    ui,

    registerCapability(capability) {
      return registry.register(capability);
    },

    getCapability(name) {
      return registry.get(name);
    },

    listCapabilities(filter) {
      return registry.list(filter);
    },

    validateCommand(command) {
      return registry.validateCommand(command);
    },

    previewCommand,
    previewPlan,
    executeCommand,
    executePlan,

    getAuditEvents() {
      return [...auditEvents];
    }
  };
}

function needsConfirmation(command, capability, policyDecision) {
  if (policyDecision.decision === PolicyDecision.CONFIRM) {
    return true;
  }

  if (capability.requiresConfirmation) {
    return true;
  }

  return command.risk === RiskLevel.HIGH || command.risk === RiskLevel.CRITICAL;
}

function toCapabilityPreview(capability) {
  const { execute, ...preview } = capability;
  return preview;
}

function redactCommand(command, capability) {
  return {
    ...command,
    params: redactParams(command.params, capability.paramsSchema)
  };
}

function isApprovalNode(node) {
  return node?.type === 'approval' || node?.type === 'human-approval';
}

function normalizeApproval(node) {
  return {
    title: node.approval?.title ?? node.intent ?? `Approve plan node ${node.id}`,
    description: node.approval?.description ?? '',
    requiredPermission: node.approval?.requiredPermission ?? '',
    assignee: node.approval?.assignee ?? '',
    metadata: node.approval?.metadata ?? {}
  };
}

function createApprovalPreview(plan, node) {
  const approval = normalizeApproval(node);

  return createResult({
    ok: true,
    data: {
      planId: plan.id,
      nodeId: node.id,
      approval,
      requiresApproval: true,
      requiresConfirmation: true
    },
    message: 'Plan approval is required.',
    explain: {
      nodeId: node.id,
      approval: true,
      requiresApproval: true
    }
  });
}

async function executePlanNode({ plan, node, context, registry, executeCommand, ui, emitAudit, incomingEdgesByNodeId, resultsByNodeId }) {
  const timeline = [];
  const runState = getPlanNodeRunState(node, incomingEdgesByNodeId, resultsByNodeId);

  if (!runState.run) {
    const result = createSkippedPlanNodeResult(node, runState.reason, runState);
    timeline.push(createTimelineStep('plan.node', 'skipped', `Plan node skipped: ${node.id}`, {
      nodeId: node.id,
      capability: node.capability,
      reason: runState.reason,
      activeIncomingEdges: runState.activeIncomingEdges,
      conditionalIncomingEdges: runState.conditionalIncomingEdges
    }));
    return { node, command: null, result, timeline };
  }

  timeline.push(createTimelineStep('plan.node', 'started', `Plan node started: ${node.id}`, {
    nodeId: node.id,
    capability: node.capability
  }));

  if (isApprovalNode(node)) {
    const result = await executeApprovalNode({ plan, node, context, timeline, ui, emitAudit });
    return { node, command: null, result, timeline };
  }

  const capability = registry.get(node.capability);

  if (!capability) {
    const result = createResult({
      ok: false,
      message: `Plan node capability is not registered: ${node.capability}`,
      explain: { nodeId: node.id, capability: node.capability }
    });

    timeline.push(createTimelineStep('plan.node', 'failed', `Plan node failed: ${node.id}`, {
      nodeId: node.id,
      capability: node.capability,
      reason: result.message
    }));

    return { node, command: null, result, timeline };
  }

  let command;

  try {
    command = node.command
      ? resolvePlanCommand(node.command, resultsByNodeId)
      : createPlanNodeCommand(plan, node, capability, resultsByNodeId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const result = createResult({
      ok: false,
      message: 'Plan node params could not be resolved.',
      explain: { nodeId: node.id, capability: node.capability, error: reason }
    });

    timeline.push(createTimelineStep('plan.node', 'failed', `Plan node failed: ${node.id}`, {
      nodeId: node.id,
      capability: node.capability,
      reason
    }));

    return { node, command: null, result, timeline };
  }

  const result = await executeCommand(command, {
    ...context,
    plan,
    node,
    planResults: resultsByNodeId
  });

  timeline.push(createTimelineStep('plan.node', result.ok ? 'executed' : 'failed', `Plan node ${result.ok ? 'executed' : 'failed'}: ${node.id}`, {
    nodeId: node.id,
    capability: node.capability,
    commandId: command.id,
    reason: result.message
  }));

  return { node, command, result, timeline };
}

async function executeApprovalNode({ plan, node, context, timeline, ui, emitAudit }) {
  const approval = normalizeApproval(node);

  timeline.push(createTimelineStep('plan.approval', 'required', `Plan approval required: ${node.id}`, {
    nodeId: node.id,
    approval
  }));

  const approved = await ui.approve({
    plan,
    node,
    context,
    approval
  });

  if (!approved) {
    timeline.push(createTimelineStep('plan.approval', 'rejected', `Plan approval rejected: ${node.id}`, {
      nodeId: node.id
    }));

    const audit = emitAudit({
      actor: context.actor,
      intent: node.intent ?? plan.intent,
      commandId: '',
      capability: 'approval',
      decision: PolicyDecision.DENY,
      status: CommandStatus.REJECTED,
      reason: 'Plan approval was rejected.',
      metadata: {
        planId: plan.id,
        nodeId: node.id,
        approval: true
      }
    });

    return createResult({
      ok: false,
      data: {
        approved: false,
        approval
      },
      message: 'Plan approval was rejected.',
      explain: {
        nodeId: node.id,
        approval: true,
        approved: false
      },
      audit
    });
  }

  timeline.push(createTimelineStep('plan.approval', 'approved', `Plan approval granted: ${node.id}`, {
    nodeId: node.id
  }));

  const audit = emitAudit({
    actor: context.actor,
    intent: node.intent ?? plan.intent,
    commandId: '',
    capability: 'approval',
    decision: PolicyDecision.CONFIRM,
    status: CommandStatus.CONFIRMED,
    reason: 'Plan approval was granted.',
    metadata: {
      planId: plan.id,
      nodeId: node.id,
      approval: true
    }
  });

  return createResult({
    ok: true,
    data: {
      approved: true,
      approval
    },
    message: 'Plan approval was granted.',
    explain: {
      nodeId: node.id,
      approval: true,
      approved: true
    },
    audit
  });
}

function groupIncomingEdges(plan) {
  const incoming = new Map(plan.nodes.map((node) => [node.id, []]));

  for (const edge of plan.edges) {
    incoming.get(edge.to)?.push(edge);
  }

  return incoming;
}

function getPlanNodeRunState(node, incomingEdgesByNodeId, resultsByNodeId) {
  const incomingEdges = incomingEdgesByNodeId.get(node.id) ?? [];

  if (incomingEdges.length === 0) {
    return {
      run: true,
      reason: 'Plan node has no incoming dependencies.',
      activeIncomingEdges: 0,
      conditionalIncomingEdges: 0
    };
  }

  const conditionalEdges = incomingEdges.filter((edge) => edge.condition !== undefined && edge.condition !== null && edge.condition !== '');
  let activeConditionalEdges = 0;

  for (const edge of incomingEdges) {
    const sourceResult = resultsByNodeId[edge.from];

    if (!sourceResult) {
      return {
        run: false,
        reason: `Plan node dependency has not executed: ${edge.from}`,
        activeIncomingEdges: activeConditionalEdges,
        conditionalIncomingEdges: conditionalEdges.length
      };
    }

    if (edge.condition === undefined || edge.condition === null || edge.condition === '') {
      if (!sourceResult.ok || sourceResult.data?.skipped) {
        return {
          run: false,
          reason: `Plan node dependency was not successful: ${edge.from}`,
          activeIncomingEdges: activeConditionalEdges,
          conditionalIncomingEdges: conditionalEdges.length
        };
      }

      continue;
    }

    if (evaluatePlanEdgeCondition(edge, sourceResult)) {
      activeConditionalEdges += 1;
    }
  }

  if (conditionalEdges.length > 0 && activeConditionalEdges === 0) {
    return {
      run: false,
      reason: 'No conditional incoming edge matched.',
      activeIncomingEdges: activeConditionalEdges,
      conditionalIncomingEdges: conditionalEdges.length
    };
  }

  return {
    run: true,
    reason: 'Plan node dependencies are active.',
    activeIncomingEdges: activeConditionalEdges,
    conditionalIncomingEdges: conditionalEdges.length
  };
}

function createSkippedPlanNodeResult(node, reason, runState) {
  return createResult({
    ok: true,
    data: {
      skipped: true,
      reason
    },
    message: 'Plan node skipped.',
    explain: {
      nodeId: node.id,
      capability: node.capability,
      skipped: true,
      reason,
      activeIncomingEdges: runState.activeIncomingEdges,
      conditionalIncomingEdges: runState.conditionalIncomingEdges
    }
  });
}

function createPlanNodeCommand(plan, node, capability, resultsByNodeId = {}) {
  const params = resultsByNodeId === null
    ? previewPlanParams(node.params ?? {})
    : resolvePlanParams(node.params ?? {}, resultsByNodeId);

  return createCommand({
    intent: node.intent ?? plan.intent,
    resource: capability.resource,
    action: capability.action,
    capability: capability.name,
    risk: node.risk ?? capability.risk,
    params,
    metadata: {
      ...(node.metadata ?? {}),
      planId: plan.id,
      nodeId: node.id
    }
  });
}

function resolvePlanCommand(command, resultsByNodeId) {
  return {
    ...command,
    params: resolvePlanParams(command.params ?? {}, resultsByNodeId)
  };
}

function previewPlanCommand(command) {
  return {
    ...command,
    params: previewPlanParams(command.params ?? {})
  };
}

function previewPlanParams(value) {
  if (Array.isArray(value)) {
    return value.map((item) => previewPlanParams(item));
  }

  if (isPlainObject(value)) {
    if (typeof value.$from === 'string') {
      return `[ref:${value.$from}.${value.path ?? 'data'}]`;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, previewPlanParams(entryValue)])
    );
  }

  return value;
}

function resolvePlanParams(value, resultsByNodeId) {
  if (Array.isArray(value)) {
    return value.map((item) => resolvePlanParams(item, resultsByNodeId));
  }

  if (isPlainObject(value)) {
    if (typeof value.$from === 'string') {
      const source = resultsByNodeId[value.$from];

      if (!source) {
        throw new Error(`Plan param reference source was not found: ${value.$from}`);
      }

      return readPath(source, value.path ?? 'data');
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, resolvePlanParams(entryValue, resultsByNodeId)])
    );
  }

  return value;
}

function readPath(source, path) {
  const parts = String(path).split('.').filter(Boolean);
  let current = source;

  for (const part of parts) {
    if (current === null || current === undefined || !(part in Object(current))) {
      throw new Error(`Plan param reference path was not found: ${path}`);
    }

    current = current[part];
  }

  return current;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function normalizeExecutionError(error) {
  const httpStatus = getErrorStatus(error);
  const fallbackReason = error instanceof Error ? error.message : String(error);

  if (httpStatus === 401) {
    return {
      httpStatus,
      reason: fallbackReason || 'Authentication is required.',
      decision: PolicyDecision.DENY,
      commandStatus: CommandStatus.BLOCKED,
      resultMessage: fallbackReason || 'Authentication is required.',
      timelineStatus: 'blocked',
      timelineMessage: 'Backend authentication rejected command.'
    };
  }

  if (httpStatus === 403) {
    return {
      httpStatus,
      reason: fallbackReason || 'Backend authorization rejected this operation.',
      decision: PolicyDecision.DENY,
      commandStatus: CommandStatus.BLOCKED,
      resultMessage: fallbackReason || 'Backend authorization rejected this operation.',
      timelineStatus: 'blocked',
      timelineMessage: 'Backend authorization rejected command.'
    };
  }

  if (httpStatus === 409) {
    return {
      httpStatus,
      reason: fallbackReason || 'Backend reported a conflict.',
      decision: PolicyDecision.CONFIRM,
      commandStatus: CommandStatus.FAILED,
      resultMessage: fallbackReason || 'Backend reported a conflict.',
      timelineStatus: 'failed',
      timelineMessage: 'Backend conflict prevented command execution.'
    };
  }

  return {
    httpStatus,
    reason: fallbackReason,
    decision: null,
    commandStatus: CommandStatus.FAILED,
    resultMessage: 'Command execution failed.',
    timelineStatus: 'failed',
    timelineMessage: 'Command execution failed.'
  };
}

function getErrorStatus(error) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  const numericStatus = typeof status === 'string' ? Number.parseInt(status, 10) : status;
  return Number.isInteger(numericStatus) ? numericStatus : null;
}

function normalizePlanLimits(planLimits = {}) {
  return {
    maxNodes: normalizeLimit(planLimits.maxNodes, 100),
    maxEdges: normalizeLimit(planLimits.maxEdges, 200)
  };
}

function normalizeLimit(value, fallback) {
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

function createPlanResult(plan, nodeResults, ok, message, compensations = [], timeline = []) {
  const skippedNodes = nodeResults.filter((item) => item.result.data?.skipped).length;

  return createResult({
    ok,
    message,
    data: {
      plan,
      nodes: nodeResults,
      compensations,
      status: ok ? 'executed' : 'failed'
    },
    explain: {
      executedNodes: nodeResults.length - skippedNodes,
      skippedNodes,
      failedNodes: nodeResults.filter((item) => !item.result.ok).length,
      compensationNodes: compensations.length,
      failedCompensations: compensations.filter((item) => !item.result.ok).length,
      timeline
    }
  });
}

function addCompensationTimeline(timeline, compensations) {
  for (const compensation of compensations) {
    timeline.push(createTimelineStep('plan.compensation', compensation.result.ok ? 'executed' : 'failed', `Plan compensation ${compensation.result.ok ? 'executed' : 'failed'}: ${compensation.node.id}`, {
      nodeId: compensation.node.id,
      commandId: compensation.command?.id,
      reason: compensation.result.message
    }));
  }
}

function createTimelineStep(stage, status, message, metadata = {}) {
  return {
    stage,
    status,
    message,
    timestamp: new Date().toISOString(),
    metadata
  };
}
