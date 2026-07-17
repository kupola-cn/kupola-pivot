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
export { createTrustedUIAdapter } from '@kupola/pivot-ui';
export { createCapabilityRegistry } from './capability-registry.js';

import { CommandStatus, RiskLevel, createAuditEvent, createCommand, createResult } from '@kupola/pivot-protocol';
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
    const validation = registry.validateCommand(command);
    const capability = registry.get(command?.capability);

    if (!validation.valid) {
      return createResult({
        ok: false,
        message: 'Command validation failed.',
        explain: {
          errors: validation.errors,
          warnings: validation.warnings,
          requiresConfirmation: false
        }
      });
    }

    const policyDecision = await policyPipeline.evaluate({ command, capability, context });

    return createResult({
      ok: policyDecision.decision !== PolicyDecision.DENY && policyDecision.decision !== PolicyDecision.ESCALATE,
      data: {
        command,
        capability: toCapabilityPreview(capability),
        policy: policyDecision,
        requiresConfirmation: needsConfirmation(command, capability, policyDecision)
      },
      message: policyDecision.reason,
      explain: {
        policy: policyDecision,
        warnings: validation.warnings
      }
    });
  };

  const executeCommand = async (command, context = {}) => {
    const validation = registry.validateCommand(command);
    const capability = registry.get(command?.capability);

    if (!validation.valid) {
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
        explain: { errors: validation.errors, warnings: validation.warnings },
        audit
      });
    }

    const policyDecision = await policyPipeline.evaluate({ command, capability, context });

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
        explain: { policy: policyDecision },
        audit
      });
    }

    const confirmation = needsConfirmation(command, capability, policyDecision)
      ? await ui.confirm({ command, capability, policy: policyDecision, context })
      : true;

    if (!confirmation) {
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
        explain: { policy: policyDecision },
        audit
      });
    }

    if (typeof capability.execute !== 'function') {
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
        explain: { capability: capability.name },
        audit
      });
    }

    try {
      const data = await capability.execute({ command, params: command.params, context });
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
        explain: { capability: capability.name, policy: policyDecision },
        audit
      });
    } catch (error) {
      const audit = emitAudit({
        actor: context.actor,
        intent: command.intent,
        commandId: command.id,
        capability: command.capability,
        decision: policyDecision.decision,
        status: CommandStatus.FAILED,
        reason: error instanceof Error ? error.message : String(error)
      });

      return createResult({
        ok: false,
        message: 'Command execution failed.',
        explain: { error: audit.reason },
        audit
      });
    }
  };

  const executePlan = async (plan, context = {}, options = {}) => {
    const validation = validatePlan(plan);

    if (!validation.valid) {
      return createResult({
        ok: false,
        message: 'Plan validation failed.',
        explain: validation,
        data: {
          plan,
          nodes: []
        }
      });
    }

    const stopOnError = options.stopOnError ?? true;
    const orderedNodes = getExecutionOrder(plan);
    const nodeResults = [];
    const resultsByNodeId = {};

    for (const node of orderedNodes) {
      const capability = registry.get(node.capability);

      if (!capability) {
        const result = createResult({
          ok: false,
          message: `Plan node capability is not registered: ${node.capability}`,
          explain: { nodeId: node.id, capability: node.capability }
        });

        nodeResults.push({ node, command: null, result });
        resultsByNodeId[node.id] = result;

        if (stopOnError) {
          return createPlanResult(plan, nodeResults, false, 'Plan execution failed.');
        }

        continue;
      }

      const command = node.command ?? createCommand({
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

      const result = await executeCommand(command, {
        ...context,
        plan,
        node,
        planResults: resultsByNodeId
      });

      nodeResults.push({ node, command, result });
      resultsByNodeId[node.id] = result;

      if (!result.ok && stopOnError) {
        return createPlanResult(plan, nodeResults, false, 'Plan execution failed.');
      }
    }

    const ok = nodeResults.every((item) => item.result.ok);
    return createPlanResult(plan, nodeResults, ok, ok ? 'Plan executed.' : 'Plan completed with failures.');
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

function createPlanResult(plan, nodeResults, ok, message) {
  return createResult({
    ok,
    message,
    data: {
      plan,
      nodes: nodeResults,
      status: ok ? 'executed' : 'failed'
    },
    explain: {
      executedNodes: nodeResults.length,
      failedNodes: nodeResults.filter((item) => !item.result.ok).length
    }
  });
}
