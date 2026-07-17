# Capability Registry

PIVOT does not let AI call arbitrary APIs. A project must register capabilities first. A capability describes what the app can do, what resource it touches, which action it performs, which params are allowed, and which permission hints should be checked before execution.

## Capability Shape

```js
runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: 'create',
  risk: 'medium',
  description: 'Create an organization node.',
  permissions: ['organization:create'],
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params }) => {
    return api.createOrganization(params);
  }
});
```

## Command Shape

AI or a local parser should produce a structured command instead of directly calling code:

```js
const command = createCommand({
  intent: 'Create branch C under the group.',
  resource: 'organization',
  action: 'create',
  capability: 'organization.create',
  risk: 'medium',
  params: {
    name: 'Branch C',
    parentId: 'group'
  }
});
```

Before execution:

```js
const validation = runtime.validateCommand(command);

if (!validation.valid) {
  // Show validation.errors in trusted UI.
}
```

## Why This Matters

This mechanism gives PIVOT a hard boundary:

- Unknown resource: rejected.
- Unknown action: rejected.
- Unknown capability: rejected.
- Invalid params: rejected.
- High-risk operation: confirmation or approval required.
- Backend 401/403: final authority, always respected.

Frontend checks improve interaction and explainability, but backend APIs remain the real security boundary.

## Execution Flow

`executeCommand` follows this order:

```text
command
  -> command validation
  -> registered capability lookup
  -> params schema validation
  -> frontend policy pipeline
  -> confirmation when required
  -> project-owned execute function
  -> result wrapper
  -> audit event
```

The capability `execute` function is owned by the host project. PIVOT should not know how to call a HIS API, CRM API, database, or AI provider by default. The app registers those details through capabilities.

Example:

```js
const result = await runtime.executeCommand(command, {
  actor: { id: 'user-1', roles: ['admin'] }
});

if (!result.ok) {
  ui.showMessage(result.message);
}
```

When the backend returns `401` or `403`, the capability should return or throw that error. PIVOT must show the rejection and record it in the audit trail.

## Built-In Policies

PIVOT currently provides a small set of frontend policy helpers:

- `createPermissionPolicy()` checks capability permission hints against `context.permissions` or `context.actor.permissions`.
- `createRiskPolicy()` asks for confirmation or escalation based on risk level.
- `createSensitiveResourcePolicy()` marks selected resources/actions as confirmation, escalation, or deny targets.
- `mapHttpStatusToPolicy()` maps backend `401`, `403`, and `409` responses into policy-style results.

Example:

```js
const runtime = createPivotRuntime({
  policies: [
    createPermissionPolicy(),
    createRiskPolicy({
      confirmAt: ['high'],
      escalateAt: ['critical']
    }),
    createSensitiveResourcePolicy({
      resources: ['user', 'role', 'menu'],
      actions: ['delete', 'update'],
      decision: 'confirm'
    })
  ]
});
```

These policies are interaction guardrails. Backend APIs must still enforce real authorization.
