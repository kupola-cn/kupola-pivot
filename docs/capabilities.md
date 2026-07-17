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
  allowUnknownParams: false,
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

For UI preview before execution:

```js
const preview = await runtime.previewCommand(command, context);

if (preview.ok && preview.data.requiresConfirmation) {
  // Show a confirmation drawer or modal before executing.
}
```

## Why This Matters

This mechanism gives PIVOT a hard boundary:

- Unknown resource: rejected.
- Unknown action: rejected.
- Unknown capability: rejected.
- Invalid params: rejected.
- Undeclared params: rejected by default.
- High-risk operation: confirmation or approval required.
- Backend 401/403: final authority, always respected.

Frontend checks improve interaction and explainability, but backend APIs remain the real security boundary.

Registered capabilities are immutable snapshots. The registry deep-clones and deeply freezes capability definitions so later mutations to the original input object cannot change params, permissions, risk, or metadata.

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

## Unknown Params

Unknown params are rejected by default. This prevents AI output from smuggling undeclared fields into project-owned execute functions.

```js
runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: 'create',
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  }
});
```

With the schema above, a command containing `{ name, parentId, admin: true }` fails validation because `admin` is not declared.

Only enable dynamic params for capabilities that are intentionally designed for extension:

```js
runtime.registerCapability({
  name: 'organization.metadata.update',
  resource: 'organization',
  action: 'update',
  paramsSchema: {
    id: { type: 'string', required: true }
  },
  allowUnknownParams: true
});
```

## Sensitive Params

Use `sensitive: true` for fields that must not be shown in previews or confirmation UI:

```js
runtime.registerCapability({
  name: 'user.password.update',
  resource: 'user',
  action: 'update',
  paramsSchema: {
    id: { type: 'string', required: true },
    password: { type: 'string', required: true, sensitive: true }
  },
  execute: async ({ params }) => {
    return api.updatePassword(params);
  }
});
```

`previewCommand` and confirmation UI receive `[redacted]` for sensitive params. The capability `execute` function receives the original params.

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

## Plan Execution

For multi-step business work, register each step as a capability and build a plan:

```js
const preview = await runtime.previewPlan(plan, context);
```

`previewPlan` validates the plan and previews every node through the same command validation and policy pipeline used by execution. It does not call capability `execute` functions.

```js
const result = await runtime.executePlan(plan, context);
```

Each node is converted into a command and executed through the same validation, policy, confirmation, execution, and audit path as `executeCommand`.

Nodes can also define compensation:

```js
const plan = createPlan({
  nodes: [
    {
      id: 'create-organization',
      capability: 'organization.create',
      params: { name: 'Branch C', parentId: 'group' },
      compensate: {
        capability: 'organization.delete',
        params: { id: 'created-organization-id' }
      }
    }
  ]
});
```

When a later node fails, PIVOT runs configured compensations in reverse order for successful nodes.
