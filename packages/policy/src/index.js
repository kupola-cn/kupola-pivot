export const PolicyDecision = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  CONFIRM: 'confirm',
  ESCALATE: 'escalate'
});

export function allow(reason = 'Allowed by frontend policy.', metadata) {
  return createPolicyResult(PolicyDecision.ALLOW, reason, metadata);
}

export function deny(reason = 'Denied by frontend policy.', metadata) {
  return createPolicyResult(PolicyDecision.DENY, reason, metadata);
}

export function confirm(reason = 'Confirmation is required before execution.', metadata) {
  return createPolicyResult(PolicyDecision.CONFIRM, reason, metadata);
}

export function escalate(reason = 'Human approval is required before execution.', metadata) {
  return createPolicyResult(PolicyDecision.ESCALATE, reason, metadata);
}

export function createPolicyPipeline(policies = []) {
  const normalizedPolicies = Array.isArray(policies) ? policies : [];

  return {
    async evaluate(context) {
      for (const policy of normalizedPolicies) {
        if (typeof policy !== 'function') {
          continue;
        }

        const result = await policy(context);

        if (!result || result.decision === PolicyDecision.ALLOW) {
          continue;
        }

        return result;
      }

      return allow();
    }
  };
}

export function createPermissionPolicy(options = {}) {
  const getPermissions = options.getPermissions ?? defaultGetPermissions;
  const mode = options.mode ?? 'all';

  return ({ command, capability, context }) => {
    const required = Array.isArray(capability.permissions) ? capability.permissions : [];

    if (required.length === 0) {
      return allow('Capability does not require frontend permission hints.');
    }

    const owned = new Set(getPermissions({ command, capability, context }));
    const allowed = mode === 'any'
      ? required.some((permission) => owned.has(permission))
      : required.every((permission) => owned.has(permission));

    if (allowed) {
      return allow('Permission hints matched.', { required });
    }

    return deny('Permission hints did not match.', {
      required,
      mode
    });
  };
}

export function createRiskPolicy(options = {}) {
  const confirmAt = new Set(options.confirmAt ?? ['high']);
  const escalateAt = new Set(options.escalateAt ?? ['critical']);

  return ({ command, capability }) => {
    const risk = command.risk ?? capability.risk;

    if (escalateAt.has(risk)) {
      return escalate(`Risk level requires escalation: ${risk}`, { risk });
    }

    if (confirmAt.has(risk) || capability.requiresConfirmation) {
      return confirm(`Risk level requires confirmation: ${risk}`, { risk });
    }

    return allow(`Risk level allowed: ${risk}`, { risk });
  };
}

export function createSensitiveResourcePolicy(options = {}) {
  const resources = new Set(options.resources ?? []);
  const actions = new Set(options.actions ?? []);
  const decision = options.decision ?? 'confirm';

  return ({ command }) => {
    const resourceMatched = resources.size === 0 || resources.has(command.resource);
    const actionMatched = actions.size === 0 || actions.has(command.action);

    if (!resourceMatched || !actionMatched) {
      return allow('Resource is not marked sensitive.');
    }

    const reason = `Sensitive operation requires ${decision}: ${command.resource}.${command.action}`;
    const metadata = { resource: command.resource, action: command.action };

    if (decision === 'deny') {
      return deny(reason, metadata);
    }

    if (decision === 'escalate') {
      return escalate(reason, metadata);
    }

    return confirm(reason, metadata);
  };
}

export function mapHttpStatusToPolicy(status, message) {
  if (status === 401) {
    return deny(message ?? 'Authentication is required.', { status });
  }

  if (status === 403) {
    return deny(message ?? 'Backend authorization rejected this operation.', { status });
  }

  if (status === 409) {
    return confirm(message ?? 'Backend reported a conflict. User confirmation is required.', { status });
  }

  return null;
}

function createPolicyResult(decision, reason, metadata) {
  return metadata === undefined ? { decision, reason } : { decision, reason, metadata };
}

function defaultGetPermissions({ context }) {
  if (Array.isArray(context?.permissions)) {
    return context.permissions;
  }

  if (Array.isArray(context?.actor?.permissions)) {
    return context.actor.permissions;
  }

  return [];
}
