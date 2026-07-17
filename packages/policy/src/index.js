export const PolicyDecision = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  CONFIRM: 'confirm',
  ESCALATE: 'escalate'
});

export function allow(reason = 'Allowed by frontend policy.') {
  return { decision: PolicyDecision.ALLOW, reason };
}

export function deny(reason = 'Denied by frontend policy.') {
  return { decision: PolicyDecision.DENY, reason };
}

export function confirm(reason = 'Confirmation is required before execution.') {
  return { decision: PolicyDecision.CONFIRM, reason };
}

export function escalate(reason = 'Human approval is required before execution.') {
  return { decision: PolicyDecision.ESCALATE, reason };
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
