export {
  ActionType,
  CommandStatus,
  FieldType,
  PIVOT_PROTOCOL_VERSION,
  RiskLevel,
  createCapability,
  createAuditEvent,
  createCommand,
  createResult,
  createValidationResult,
  redactParams,
  validateCapability,
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
export { addEdge, addNode, createPlan, getExecutionOrder, validatePlan } from '@kupola/pivot-orchestrator';
export { createTrustedUIAdapter, mountResult, mountTimeline, renderResultToHTML, renderTimelineToHTML } from '@kupola/pivot-ui';
export { createCapabilityRegistry } from './capability-registry.js';

import { CommandStatus, RiskLevel, createAuditEvent, createCommand, createResult, redactParams } from '@kupola/pivot-protocol';
import { PolicyDecision, confirm, createPolicyPipeline } from '@kupola/pivot-policy';
import { getExecutionOrder, validatePlan } from '@kupola/pivot-orchestrator';
import { createCapabilityRegistry } from './capability-registry.js';
import { createTrustedUIAdapter } from '@kupola/pivot-ui';

export function createPivotRuntime(options = {}) {
  const registry = options.registry ?? createCapabilityRegistry(options.capabilityRegistry);
  const policyPipeline = options.policyPipeline ?? createPolicyPipeline(options.policies);
  const ui = options.ui ?? createTrustedUIAdapter();
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
    const validation = validatePlan(plan);

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

      const command = node.command ?? createPlanNodeCommand(plan, node, capability);
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
    const validation = validatePlan(plan);

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
    const orderedNodes = getExecutionOrder(plan);
    const nodeResults = [];
    const resultsByNodeId = {};
    timeline.push(createTimelineStep('plan.validation', 'passed', 'Plan validation passed.', {
      warnings: validation.warnings,
      nodes: orderedNodes.length
    }));

    for (const node of orderedNodes) {
      timeline.push(createTimelineStep('plan.node', 'started', `Plan node started: ${node.id}`, {
        nodeId: node.id,
        capability: node.capability
      }));

      const capability = registry.get(node.capability);

      if (!capability) {
        const result = createResult({
          ok: false,
          message: `Plan node capability is not registered: ${node.capability}`,
          explain: { nodeId: node.id, capability: node.capability }
        });

        nodeResults.push({ node, command: null, result });
        resultsByNodeId[node.id] = result;
        timeline.push(createTimelineStep('plan.node', 'failed', `Plan node failed: ${node.id}`, {
          nodeId: node.id,
          capability: node.capability,
          reason: result.message
        }));

        if (stopOnError) {
          const compensations = compensateOnError
            ? await compensatePlan({ plan, nodeResults, context, resultsByNodeId, failedNode: node })
            : [];

          addCompensationTimeline(timeline, compensations);
          return createPlanResult(plan, nodeResults, false, 'Plan execution failed.', compensations, timeline);
        }

        continue;
      }

      const command = node.command ?? createPlanNodeCommand(plan, node, capability);

      const result = await executeCommand(command, {
        ...context,
        plan,
        node,
        planResults: resultsByNodeId
      });

      nodeResults.push({ node, command, result });
      resultsByNodeId[node.id] = result;
      timeline.push(createTimelineStep('plan.node', result.ok ? 'executed' : 'failed', `Plan node ${result.ok ? 'executed' : 'failed'}: ${node.id}`, {
        nodeId: node.id,
        capability: node.capability,
        commandId: command.id,
        reason: result.message
      }));

      if (!result.ok && stopOnError) {
        const compensations = compensateOnError
          ? await compensatePlan({ plan, nodeResults, context, resultsByNodeId, failedNode: node })
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
    const successfulNodes = nodeResults.filter((item) => item.result.ok).reverse();

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

      const command = compensation.command ?? createCommand({
        intent: compensation.intent ?? `Compensate ${item.node.id}`,
        resource: capability.resource,
        action: capability.action,
        capability: capability.name,
        risk: compensation.risk ?? capability.risk,
        params: compensation.params ?? {},
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

function createPlanNodeCommand(plan, node, capability) {
  return createCommand({
    intent: node.intent ?? plan.intent,
    resource: capability.resource,
    action: capability.action,
    capability: capability.name,
    risk: node.risk ?? capability.risk,
    params: node.params ?? {},
    metadata: {
      ...(node.metadata ?? {}),
      planId: plan.id,
      nodeId: node.id
    }
  });
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

function createPlanResult(plan, nodeResults, ok, message, compensations = [], timeline = []) {
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
      executedNodes: nodeResults.length,
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
