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
export { createTrustedUIAdapter, mountAuditViewer, mountCapabilityBrowser, mountPlanGraph, mountPlanPreview, mountResult, mountTimeline, mountTimelineDetail, renderAuditViewerToHTML, renderCapabilityBrowserToHTML, renderPlanGraphToHTML, renderPlanPreviewToHTML, renderResultToHTML, renderTimelineDetailToHTML, renderTimelineToHTML } from '@kupola/pivot-ui';
export { createCapabilityRegistry } from './capability-registry.js';

import { CommandStatus, RiskLevel, createAuditEvent, createCommand, createResult, createValidationResult, redactParams, validateCommand, validateParams } from '@kupola/pivot-protocol';
import { PolicyDecision, createPolicyPipeline } from '@kupola/pivot-policy';
import { createPlan, evaluatePlanEdgeCondition, getExecutionLayers, getExecutionOrder, validatePlan } from '@kupola/pivot-orchestrator';
import { createCapabilityRegistry } from './capability-registry.js';
import { createTrustedUIAdapter } from '@kupola/pivot-ui';

export function createPivotRuntime(options = {}) {
  const registry = options.registry ?? createCapabilityRegistry(options.capabilityRegistry);
  const policyPipeline = options.policyPipeline ?? createPolicyPipeline(options.policies);
  const ui = createTrustedUIAdapter(options.ui);
  const planLimits = normalizePlanLimits(options.planLimits);
  const auditSinks = normalizeAuditSinks(options.auditSinks, options.onAudit);
  const auditEvents = [];

  const emitAudit = async (eventInput, auditContext = {}) => {
    const event = createAuditEvent({
      ...eventInput,
      metadata: sanitizeAuditMetadata(
        mergeAuditMetadata(auditContext.commandMetadata, auditContext.auditMetadata, eventInput.metadata),
        DEFAULT_AUDIT_SENSITIVE_NAMES
      )
    });

    auditEvents.push(event);

    await Promise.allSettled(auditSinks.map((sink) => Promise.resolve().then(() => sink(event))));

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

  const executeCommand = async (command, context = {}, options = {}) => {
    const timeline = [];
    const executionOptions = normalizeExecutionOptions(options);
    const validation = registry.validateCommand(command);
    const capability = registry.get(command?.capability);
    const auditContext = {
      ...context,
      commandMetadata: command?.metadata
    };

    if (!validation.valid) {
      timeline.push(createTimelineStep('validation', 'failed', 'Command validation failed.', {
        errors: validation.errors,
        warnings: validation.warnings
      }));

      const audit = await emitAudit({
        actor: context.actor,
        intent: command?.intent,
        commandId: command?.id,
        capability: command?.capability,
        decision: PolicyDecision.DENY,
        status: CommandStatus.REJECTED,
        reason: validation.errors.join('; ')
      }, auditContext);

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
      const audit = await emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.BLOCKED,
        reason: policyDecision.reason
      }, auditContext);

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

      const audit = await emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: PolicyDecision.CONFIRM,
        status: CommandStatus.REJECTED,
        reason: 'User rejected command confirmation.'
      }, auditContext);

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

      const audit = await emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.FAILED,
        reason: 'Capability has no execute function.'
      }, auditContext);

      return createResult({
        ok: false,
        message: 'Capability is not executable.',
        explain: { capability: capability.name, timeline },
        audit
      });
    }

    const maxAttempts = executionOptions.retry.maxAttempts;
    let lastFailure = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const data = await executeCapabilityWithTimeout(
          capability,
          { command, params: command.params, context },
          executionOptions.timeoutMs
        );

        const message = attempt === 1 ? 'Command executed.' : `Command executed after ${attempt} attempts.`;
        timeline.push(createTimelineStep('execution', 'executed', message, {
          capability: capability.name,
          attempt,
          maxAttempts
        }));

        const audit = await emitAudit({
          actor: context.actor,
          intent: command.intent,
          commandId: command.id,
          capability: command.capability,
          decision: policyDecision.decision,
          status: CommandStatus.EXECUTED,
          reason: message
        }, auditContext);

        return createResult({
          ok: true,
          data,
          message,
          explain: { capability: capability.name, policy: policyDecision, attempts: attempt, timeline },
          audit
        });
      } catch (error) {
        const failure = normalizeExecutionError(error);
        lastFailure = failure;
        const canRetry = attempt < maxAttempts && failure.commandStatus === CommandStatus.FAILED;

        timeline.push(createTimelineStep('execution', failure.timelineStatus, canRetry ? 'Command execution attempt failed.' : failure.timelineMessage, {
          error: failure.reason,
          status: failure.httpStatus,
          attempt,
          maxAttempts,
          retrying: canRetry
        }));

        if (canRetry) {
          const delayMs = getRetryDelay(executionOptions.retry, attempt);

          timeline.push(createTimelineStep('execution', 'retrying', `Retrying command execution in ${delayMs}ms.`, {
            attempt,
            nextAttempt: attempt + 1,
            maxAttempts,
            delayMs
          }));

          if (delayMs > 0) {
            await sleep(delayMs);
          }

          continue;
        }

        const audit = await emitAudit({
          actor: context.actor,
          intent: command.intent,
          commandId: command.id,
          capability: command.capability,
          decision: failure.decision ?? policyDecision.decision,
          status: failure.commandStatus,
          reason: failure.reason,
          metadata: failure.httpStatus ? { httpStatus: failure.httpStatus } : {}
        }, auditContext);

        return createResult({
          ok: false,
          message: failure.resultMessage,
          explain: {
            error: audit.reason,
            status: failure.httpStatus,
            attempts: attempt,
            timeline
          },
          audit
        });
      }
    }

    const audit = await emitAudit({
      actor: context.actor,
      intent: command.intent,
      commandId: command.id,
      capability: command.capability,
      decision: lastFailure?.decision ?? policyDecision.decision,
      status: lastFailure?.commandStatus ?? CommandStatus.FAILED,
      reason: lastFailure?.reason ?? 'Command execution failed.'
    }, auditContext);

    return createResult({
      ok: false,
      message: lastFailure?.resultMessage ?? 'Command execution failed.',
      explain: {
        error: audit.reason,
        attempts: maxAttempts,
        timeline
      },
      audit
    });
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

      const command = createPlanNodeCommand(plan, node, capability, null, { preview: true });
      const inputValidation = validatePlanNodeInputContract(node, command.params);

      if (!inputValidation.valid) {
        const preview = createResult({
          ok: false,
          message: 'Plan node input contract failed.',
          explain: {
            nodeId: node.id,
            capability: node.capability,
            contract: 'input',
            errors: inputValidation.errors,
            warnings: inputValidation.warnings
          }
        });

        nodePreviews.push({ node, command: previewPlanCommand(command), preview });
        timeline.push(createTimelineStep('plan.node.preview', 'blocked', `Plan node preview blocked: ${node.id}`, {
          nodeId: node.id,
          capability: node.capability,
          contract: 'input',
          reason: preview.message
        }));
        continue;
      }

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
        contract: {
          inputSchema: node.inputSchema ?? null,
          outputSchema: node.outputSchema ?? null
        },
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
      const compensationSteps = normalizeCompensationSteps(item.node);
      const strategy = normalizeCompensationStrategy(item.node.compensation);

      if (compensationSteps.length === 0) {
        compensations.push({
          node: item.node,
          command: null,
          steps: [],
          strategy,
          result: createResult({
            ok: true,
            message: 'No compensation configured.',
            data: { skipped: true }
          })
        });
        continue;
      }

      const orderedSteps = strategy.order === 'forward' ? compensationSteps : [...compensationSteps].reverse();
      const stepResults = [];

      for (const [stepIndex, step] of orderedSteps.entries()) {
        if (!shouldRunCompensationStep(step)) {
          stepResults.push(createSkippedCompensationStep(step, stepIndex));
          continue;
        }

        const capabilityName = step.capability ?? item.node.compensateCapability;
        const capability = registry.get(capabilityName);

        if (!capability) {
          const result = createResult({
            ok: false,
            message: `Compensation capability is not registered: ${String(capabilityName)}`,
            explain: { capability: capabilityName, stepIndex }
          });

          stepResults.push({
            step,
            command: null,
            result,
            skipped: false
          });

          if (strategy.stopOnFailure !== false) {
            break;
          }

          continue;
        }

        const command = step.command ? resolvePlanCommand(step.command, resultsByNodeId) : createCommand({
          intent: step.intent ?? `Compensate ${item.node.id}`,
          resource: capability.resource,
          action: capability.action,
          capability: capability.name,
          risk: step.risk ?? capability.risk,
          params: resolvePlanParams(step.params ?? {}, resultsByNodeId),
          metadata: {
            ...(step.metadata ?? {}),
            planId: plan.id,
            nodeId: item.node.id,
            failedNodeId: failedNode?.id,
            compensation: true,
            compensationStep: stepIndex
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

        stepResults.push({
          step,
          command,
          result,
          skipped: false
        });

        if (!result.ok && strategy.stopOnFailure !== false) {
          break;
        }
      }

      const aggregateResult = createCompensationAggregateResult(item.node, stepResults, strategy);

      compensations.push({
        node: item.node,
        command: stepResults.find((entry) => entry.command)?.command ?? null,
        steps: stepResults,
        strategy,
        result: aggregateResult
      });
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

export function parseStructuredCommandOutput(output) {
  const extraction = extractStructuredOutputPayload(output, 'command');

  if (!extraction.valid) {
    return createResult({
      ok: false,
      message: 'Structured command output is invalid.',
      data: null,
      explain: {
        errors: extraction.errors,
        warnings: extraction.warnings,
        expectedType: 'command'
      }
    });
  }

  const command = createCommand(pickStructuredFields(extraction.payload, STRUCTURED_COMMAND_FIELDS));
  const validation = validateCommand(command);

  if (!validation.valid) {
    return createResult({
      ok: false,
      message: 'Structured command output is invalid.',
      data: null,
      explain: {
        errors: validation.errors,
        warnings: validation.warnings,
        expectedType: 'command'
      }
    });
  }

  return createResult({
    ok: true,
    message: 'Structured command output parsed.',
    data: {
      command,
      source: extraction.payload
    },
    explain: {
      errors: validation.errors,
      warnings: validation.warnings,
      expectedType: 'command'
    }
  });
}

export function parseStructuredPlanOutput(output) {
  const extraction = extractStructuredOutputPayload(output, 'plan');

  if (!extraction.valid) {
    return createResult({
      ok: false,
      message: 'Structured plan output is invalid.',
      data: null,
      explain: {
        errors: extraction.errors,
        warnings: extraction.warnings,
        expectedType: 'plan'
      }
    });
  }

  const plan = createPlan(pickStructuredFields(extraction.payload, STRUCTURED_PLAN_FIELDS));
  const validation = validatePlan(plan);

  if (!validation.valid) {
    return createResult({
      ok: false,
      message: 'Structured plan output is invalid.',
      data: null,
      explain: {
        errors: validation.errors,
        warnings: validation.warnings,
        expectedType: 'plan'
      }
    });
  }

  return createResult({
    ok: true,
    message: 'Structured plan output parsed.',
    data: {
      plan,
      source: extraction.payload
    },
    explain: {
      errors: validation.errors,
      warnings: validation.warnings,
      expectedType: 'plan'
    }
  });
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
  const { execute: _execute, ...preview } = capability;
  return preview;
}

function redactCommand(command, capability) {
  return {
    ...command,
    params: redactParams(command.params, capability.paramsSchema)
  };
}

function extractStructuredOutputPayload(output, expectedType) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(output)) {
    return {
      valid: false,
      errors: ['Structured output must be a plain object.'],
      warnings,
      payload: null
    };
  }

  const declaredType = output.type ?? output.kind;

  if (declaredType !== undefined && declaredType !== expectedType) {
    errors.push(`Structured output type must be ${expectedType}.`);
  }

  const envelopeField = expectedType === 'command' ? 'command' : 'plan';
  const envelopePayload = output[envelopeField];

  if (envelopePayload !== undefined) {
    if (!isPlainObject(envelopePayload)) {
      errors.push(`Structured output ${envelopeField} must be a plain object.`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      payload: envelopePayload
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    payload: output
  };
}

function pickStructuredFields(value, allowedFields) {
  if (!isPlainObject(value)) {
    return {};
  }

  return Object.fromEntries(
    allowedFields
      .filter((field) => Object.hasOwn(value, field))
      .map((field) => [field, value[field]])
  );
}

const STRUCTURED_COMMAND_FIELDS = ['id', 'intent', 'resource', 'action', 'capability', 'risk', 'params', 'metadata'];
const STRUCTURED_PLAN_FIELDS = ['id', 'intent', 'nodes', 'edges', 'metadata'];

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
    command = createPlanNodeCommand(plan, node, capability, resultsByNodeId);
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

  const inputValidation = validatePlanNodeInputContract(node, command.params);

  if (!inputValidation.valid) {
    const result = createResult({
      ok: false,
      message: 'Plan node input contract failed.',
      explain: {
        nodeId: node.id,
        capability: node.capability,
        contract: 'input',
        errors: inputValidation.errors,
        warnings: inputValidation.warnings
      }
    });

    timeline.push(createTimelineStep('plan.node', 'failed', `Plan node failed: ${node.id}`, {
      nodeId: node.id,
      capability: node.capability,
      contract: 'input',
      reason: result.message
    }));

    return { node, command, result, timeline };
  }

  const result = await executeCommand(command, {
    ...context,
    plan,
    node,
    planResults: resultsByNodeId
  }, getPlanNodeExecutionOptions(node));

  const outputValidation = validatePlanNodeOutputContract(node, result.data);

  if (result.ok && !outputValidation.valid) {
    const contractResult = createResult({
      ok: false,
      data: result.data,
      message: 'Plan node output contract failed.',
      explain: {
        ...result.explain,
        nodeId: node.id,
        capability: node.capability,
        contract: 'output',
        errors: outputValidation.errors,
        warnings: outputValidation.warnings
      },
      audit: result.audit
    });

    timeline.push(...(Array.isArray(result.explain?.timeline) ? result.explain.timeline : []));
    timeline.push(createTimelineStep('plan.node', 'failed', `Plan node failed: ${node.id}`, {
      nodeId: node.id,
      capability: node.capability,
      contract: 'output',
      reason: contractResult.message
    }));

    return { node, command, result: contractResult, timeline };
  }

  if (Array.isArray(result.explain?.timeline)) {
    timeline.push(...result.explain.timeline);
  }

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

    const audit = await emitAudit({
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
    }, context);

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

  const audit = await emitAudit({
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
  }, context);

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

function createPlanNodeCommand(plan, node, capability, resultsByNodeId = {}, options = {}) {
  const preview = Boolean(options.preview);

  if (node.command) {
    return resolvePlanCommand(node.command, resultsByNodeId, node.input, preview);
  }

  const params = buildPlanNodeParams(node, resultsByNodeId, preview);

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

function resolvePlanCommand(command, resultsByNodeId, input = {}, preview = false) {
  const commandParams = preview ? previewPlanParams(command.params ?? {}) : resolvePlanParams(command.params ?? {}, resultsByNodeId);
  const inputParams = preview ? previewPlanParams(input ?? {}) : resolvePlanParams(input ?? {}, resultsByNodeId);

  return {
    ...command,
    params: mergePlanNodeParams(inputParams, commandParams)
  };
}

function previewPlanCommand(command) {
  return {
    ...command,
    params: previewPlanParams(command.params ?? {})
  };
}

function buildPlanNodeParams(node, resultsByNodeId, preview = false) {
  const inputParams = preview ? previewPlanParams(node.input ?? {}) : resolvePlanParams(node.input ?? {}, resultsByNodeId);
  const explicitParams = preview ? previewPlanParams(node.params ?? {}) : resolvePlanParams(node.params ?? {}, resultsByNodeId);
  return mergePlanNodeParams(inputParams, explicitParams);
}

function mergePlanNodeParams(inputParams, explicitParams) {
  if (!isPlainObject(inputParams) && !isPlainObject(explicitParams)) {
    return {};
  }

  if (!isPlainObject(inputParams)) {
    return explicitParams;
  }

  if (!isPlainObject(explicitParams)) {
    return inputParams;
  }

  return {
    ...inputParams,
    ...explicitParams
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

function validatePlanNodeInputContract(node, params) {
  return validatePlanNodeContract(node.inputSchema, params, 'input');
}

function validatePlanNodeOutputContract(node, data) {
  return validatePlanNodeContract(node.outputSchema, data, 'output');
}

function validatePlanNodeContract(schema, value, contractName) {
  if (!isPlainObject(schema) || Object.keys(schema).length === 0) {
    return createValidationResult();
  }

  if (!isPlainObject(value)) {
    return createValidationResult([`Plan node ${contractName} must resolve to a plain object.`]);
  }

  return validateParams(value, schema, { allowUnknown: true });
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

  if (error?.name === 'TimeoutError' || error?.code === 'ETIMEDOUT' || httpStatus === 504) {
    return {
      httpStatus: httpStatus ?? 504,
      reason: fallbackReason || 'Command execution timed out.',
      decision: null,
      commandStatus: CommandStatus.FAILED,
      resultMessage: fallbackReason || 'Command execution timed out.',
      timelineStatus: 'timed-out',
      timelineMessage: 'Command execution timed out.'
    };
  }

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

function normalizeAuditSinks(auditSinks = [], onAudit) {
  const sinks = [];

  if (typeof onAudit === 'function') {
    sinks.push(onAudit);
  }

  if (Array.isArray(auditSinks)) {
    for (const sink of auditSinks) {
      if (typeof sink === 'function') {
        sinks.push(sink);
      }
    }
  }

  return sinks;
}

function mergeAuditMetadata(...values) {
  const merged = {};

  for (const value of values) {
    if (isPlainObject(value)) {
      Object.assign(merged, value);
    }
  }

  return merged;
}

function sanitizeAuditMetadata(value, sensitiveNames) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item, sensitiveNames));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [
        key,
        isSensitiveAuditField(key, sensitiveNames)
          ? '[redacted]'
          : sanitizeAuditMetadata(entryValue, sensitiveNames)
      ])
    );
  }

  return value;
}

function isSensitiveAuditField(field, sensitiveNames) {
  const normalized = String(field).toLowerCase();
  return sensitiveNames.some((name) => normalized === String(name).toLowerCase());
}

function normalizeExecutionOptions(options = {}) {
  const value = options ?? {};
  return {
    retry: normalizeRetryOptions(value.retry),
    timeoutMs: normalizeTimeoutMs(value.timeoutMs)
  };
}

function normalizeRetryOptions(retry = {}) {
  const value = retry ?? {};
  return {
    maxAttempts: normalizeRetryAttempts(value.maxAttempts),
    delayMs: normalizeRetryDelay(value.delayMs),
    backoff: normalizeRetryBackoff(value.backoff),
    maxDelayMs: normalizeRetryMaxDelay(value.maxDelayMs)
  };
}

function normalizeRetryAttempts(value) {
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function normalizeRetryDelay(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function normalizeRetryMaxDelay(value) {
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function normalizeRetryBackoff(value) {
  return ['fixed', 'linear', 'exponential'].includes(value) ? value : 'fixed';
}

function normalizeTimeoutMs(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function getRetryDelay(retry, attempt) {
  const baseDelay = retry.delayMs;
  const rawDelay = retry.backoff === 'linear'
    ? baseDelay * attempt
    : retry.backoff === 'exponential'
      ? baseDelay * (2 ** (attempt - 1))
      : baseDelay;
  const cappedDelay = retry.maxDelayMs === null ? rawDelay : Math.min(rawDelay, retry.maxDelayMs);
  return Math.max(0, cappedDelay);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function executeCapabilityWithTimeout(capability, input, timeoutMs) {
  if (timeoutMs === null) {
    return capability.execute(input);
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`Command execution timed out after ${timeoutMs}ms.`);
      error.name = 'TimeoutError';
      error.status = 504;
      reject(error);
    }, timeoutMs);

    Promise.resolve()
      .then(() => capability.execute(input))
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function getPlanNodeExecutionOptions(node) {
  return {
    retry: node.retry,
    timeoutMs: node.timeout?.ms
  };
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
  const compensationSteps = compensations.reduce((count, compensation) => count + countCompensationSteps(compensation.steps), 0);
  const failedCompensationSteps = compensations.reduce((count, compensation) => count + countFailedCompensationSteps(compensation.steps), 0);

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
      compensationSteps,
      failedCompensations: compensations.filter((item) => !item.result.ok).length,
      failedCompensationSteps,
      timeline
    }
  });
}

function addCompensationTimeline(timeline, compensations) {
  for (const compensation of compensations) {
    for (const [index, step] of (compensation.steps ?? []).entries()) {
      timeline.push(createTimelineStep(
        'plan.compensation.step',
        step.skipped ? 'skipped' : step.result.ok ? 'executed' : 'failed',
        step.skipped
          ? `Plan compensation step skipped: ${compensation.node.id}`
          : `Plan compensation step ${step.result.ok ? 'executed' : 'failed'}: ${compensation.node.id}`,
        {
          nodeId: compensation.node.id,
          stepIndex: index,
          commandId: step.command?.id ?? null,
          reason: step.result.message,
          skipped: Boolean(step.skipped)
        }
      ));
    }

    timeline.push(createTimelineStep('plan.compensation', compensation.result.ok ? 'executed' : 'failed', `Plan compensation ${compensation.result.ok ? 'executed' : 'failed'}: ${compensation.node.id}`, {
      nodeId: compensation.node.id,
      commandId: compensation.command?.id,
      reason: compensation.result.message,
      steps: Array.isArray(compensation.steps) ? compensation.steps.length : 0,
      strategy: compensation.strategy ?? {}
    }));
  }
}

function normalizeCompensationSteps(node) {
  if (!node) {
    return [];
  }

  if (Array.isArray(node.compensate)) {
    return node.compensate.filter((step) => isPlainObject(step));
  }

  if (isPlainObject(node.compensate)) {
    return [node.compensate];
  }

  if (typeof node.compensateCapability === 'string' && node.compensateCapability.trim() !== '') {
    return [{ capability: node.compensateCapability }];
  }

  return [];
}

function normalizeCompensationStrategy(strategy) {
  if (!isPlainObject(strategy)) {
    return {
      order: 'reverse',
      stopOnFailure: true
    };
  }

  return {
    order: strategy.order === 'forward' ? 'forward' : 'reverse',
    stopOnFailure: strategy.stopOnFailure !== false
  };
}

function shouldRunCompensationStep(step) {
  return step?.when !== 'on-success';
}

function createSkippedCompensationStep(step, stepIndex) {
  return {
    step,
    command: null,
    skipped: true,
    result: createResult({
      ok: true,
      message: 'Compensation step skipped.',
      data: { skipped: true, stepIndex }
    })
  };
}

function createCompensationAggregateResult(node, stepResults, strategy) {
  const executedSteps = stepResults.filter((step) => !step.skipped);
  const failedSteps = executedSteps.filter((step) => !step.result.ok);
  const skippedSteps = stepResults.filter((step) => step.skipped);
  const ok = executedSteps.length === 0 ? true : failedSteps.length === 0;

  return createResult({
    ok,
    message: ok ? 'Plan compensation executed.' : 'Plan compensation completed with failures.',
    data: {
      nodeId: node.id,
      skipped: executedSteps.length === 0,
      steps: stepResults,
      strategy
    },
    explain: {
      nodeId: node.id,
      steps: stepResults.length,
      executedSteps: executedSteps.length,
      failedSteps: failedSteps.length,
      skippedSteps: skippedSteps.length,
      strategy
    }
  });
}

function countCompensationSteps(stepResults = []) {
  return Array.isArray(stepResults) ? stepResults.filter((step) => !step.skipped).length : 0;
}

function countFailedCompensationSteps(stepResults = []) {
  return Array.isArray(stepResults) ? stepResults.filter((step) => !step.skipped && !step.result.ok).length : 0;
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

const DEFAULT_AUDIT_SENSITIVE_NAMES = [
  'password',
  'passwd',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'apikey',
  'authorization',
  'credential',
  'credentials'
];
