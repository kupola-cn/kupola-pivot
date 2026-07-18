# Capability Registry

PIVOT does not let AI call arbitrary APIs. A project must register capabilities first. A capability describes what the app can do, what resource it touches, which action it performs, which params are allowed, and which permission hints should be checked before execution.

For larger projects, PIVOT also supports a capability manifest layer with `manifestVersion`, `version`, `domain`, `group`, `tags`, `dependencies`, `inputSchema`, `outputSchema`, and `examples`.

## Capability Shape

```js
runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: 'create',
  risk: 'medium',
  description: 'Create an organization node.',
  manifestVersion: '0.1.0',
  version: '1.0.0',
  domain: 'organization',
  group: 'organization.lifecycle',
  tags: ['organization', 'create'],
  dependencies: [
    {
      capability: 'organization.query',
      optional: true,
      description: 'Resolve the parent node before creation.'
    }
  ],
  permissions: ['organization:create'],
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  inputSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  outputSchema: {
    id: { type: 'string' },
    name: { type: 'string' }
  },
  examples: [
    {
      label: 'Create branch',
      params: { name: 'Branch C', parentId: 'group' }
    }
  ],
  allowUnknownParams: false,
  execute: async ({ params }) => {
    return api.createOrganization(params);
  }
});
```

You can also build the manifest explicitly:

```js
const manifest = createCapabilityManifest({
  name: 'organization.create',
  manifestVersion: '0.1.0',
  version: '1.0.0',
  resource: 'organization',
  action: 'create',
  risk: 'medium',
  paramsSchema: {
    name: { type: 'string', required: true }
  },
  outputSchema: {},
  execute: async () => ({ ok: true })
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

`listCapabilities()` and registry `list()` can filter by `domain`, `group`, `version`, `tag`, and `tags` in addition to `resource`, `action`, and `permission`.

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

Runtime plan preview and execution are also checked against `planLimits`:

```js
const runtime = createPivotRuntime({
  planLimits: {
    maxNodes: 50,
    maxEdges: 100
  }
});
```

```js
const result = await runtime.executePlan(plan, context);
```

Each node is converted into a command and executed through the same validation, policy, confirmation, execution, and audit path as `executeCommand`.

## Conditional Plan Edges

Plan edges can include declarative conditions. PIVOT does not run arbitrary JavaScript expressions from plans.

```js
const plan = createPlan({
  nodes: [
    { id: 'classify', capability: 'organization.classify' },
    {
      id: 'create-branch',
      capability: 'organization.create',
      params: { name: 'Branch C', parentId: 'group' }
    },
    {
      id: 'create-department',
      capability: 'organization.create',
      params: { name: 'Department C', parentId: 'group' }
    }
  ],
  edges: [
    {
      from: 'classify',
      to: 'create-branch',
      condition: { path: 'data.kind', equals: 'branch' }
    },
    {
      from: 'classify',
      to: 'create-department',
      condition: { path: 'data.kind', equals: 'department' }
    }
  ]
});
```

Supported string conditions:

- `always`
- `success`
- `failure`
- `skipped`

Supported object condition fields:

- `ok: boolean`
- `skipped: boolean`
- `path: string`
- `exists: boolean`
- `equals: unknown`
- `notEquals: unknown`
- `in: unknown[]`

During `executePlan`, a node with conditional incoming edges runs only when at least one conditional incoming edge matches. Otherwise the node result is marked as skipped and its capability is not executed. `previewPlan` validates condition shape, but it does not evaluate result-dependent conditions because capability execution has not happened yet.

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

## Node Result References

Plan nodes can pass data from earlier node results into later node params:

```js
const plan = createPlan({
  nodes: [
    { id: 'lookup-parent', capability: 'organization.query' },
    {
      id: 'create-branch',
      capability: 'organization.create',
      params: {
        name: 'Branch C',
        parentId: { $from: 'lookup-parent', path: 'data.id' }
      }
    }
  ],
  edges: [{ from: 'lookup-parent', to: 'create-branch' }]
});
```

During `previewPlan`, references are shown as placeholders such as `[ref:lookup-parent.data.id]`. During `executePlan`, references are resolved from previous node results. If a source node or path cannot be found, the node fails before its capability execute function is called.
