# Kupola PIVOT

PIVOT is a protocol-first, intent-driven runtime for building secure, explainable, AI-native web applications.

PIVOT is the next architecture track for Kupola. Kupola 2.x keeps serving as a stable UI component library and AI adapter foundation. PIVOT starts from a different center: user intent, capability registration, policy checks, workflow orchestration, explainable execution, and trusted UI feedback.

```text
P - Protocol-first
I - Intent-driven
V - Verifiable
O - Orchestrated
T - Trusted UI
```

## Positioning

PIVOT is not a CRUD generator and it is not a chat panel wrapper.

It is designed to be the trusted execution layer between users, AI services, UI components, business APIs, and backend authorization.

```text
User intent
  -> PIVOT protocol
  -> capability registry
  -> policy and permission checks
  -> orchestration plan
  -> confirmed execution
  -> explainable result and audit trail
```

## Relationship With Kupola

- `kupola-u` continues to maintain Kupola 2.x and `@kupola/ai-adapter` 2.x.
- `kupola-pivot` is the candidate architecture track for Kupola 3.x AI-native applications, while remaining usable as a standalone advanced runtime.
- PIVOT can reuse Kupola UI primitives such as Drawer, Modal, Table, Form, Message, theme tokens, and CSS.
- PIVOT should integrate with `@kupola/ai-adapter` through structured output handoff instead of depending on provider SDKs in the runtime core.
- PIVOT should not depend on frontend-only permissions for real security. Backend APIs must still enforce authentication, authorization, data scope, and sensitive field protection.

See [Roadmap](docs/roadmap.md) for the 0.3.x integration-preview target, the 1.0 production-ready standard, and the long-term Kupola relationship.

## Repository Layout

```text
dgc/                  Design notes migrated from the earlier local discussion
docs/                 Architecture, security, roadmap, and design documents
packages/core/        Runtime entry and shared composition layer
packages/protocol/    Command, capability, resource, and result contracts
packages/policy/      Frontend policy checks, risk levels, and permission hints
packages/orchestrator/ Workflow and action planning primitives
packages/ui/          Kupola-based trusted UI adapters
examples/             Future examples, including HIS-style business apps
```

## Current Stage

PIVOT is currently in Developer Preview. The core API is usable for experiments, examples, and early project integration, but it is not yet a production-stable 1.0 contract.

The next 0.3.x line focuses on integration hardening: end-to-end AI proposal to preview to approval to execution examples, stronger UI mount behavior, integration tests, server handoff guidance, and clearer package usage patterns. The 1.0 line will require stable public APIs, compatibility tests, documented security boundaries, production-oriented migration guidance, and verified package publishing discipline.

When a capability provides `dryRun`, use `simulateCommand()` for impact estimation before execution. `previewCommand()` stays the lighter policy-and-confirmation path.

For pilots, `@kupola/pivot` is the easiest starting point because it bundles protocol, policy, orchestrator, and UI helpers. Use `@kupola/pivot-protocol` and `@kupola/pivot-policy` directly when you only need contracts or policy helpers, and add `@kupola/pivot-orchestrator` / `@kupola/pivot-ui` only when that layer is actually needed.

Preview-level surfaces may still evolve between 0.2.x and 0.3.x. The pilot-stable expectation is that command validation, preview, execution, compensation, audit metadata, and trusted UI mount behavior continue to work as documented, even if the surrounding example code and docs keep moving.

## Install

```bash
npm install @kupola/pivot
```

You can also install lower-level packages directly:

```bash
npm install @kupola/pivot-protocol @kupola/pivot-policy
```

For an app that already owns UI shell and workflow orchestration, install only the pieces you need:

```bash
npm install @kupola/pivot-protocol @kupola/pivot-policy @kupola/pivot-orchestrator
```

## Release

Use `npm run release:check` to verify version consistency across the workspace and `npm run release:publish` to run the release pipeline.

## Quick Example

```js
import {
  ActionType,
  RiskLevel,
  createCommand,
  createPermissionPolicy,
  createPivotRuntime
} from '@kupola/pivot';

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async () => true
  }
});

runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params, context }) => {
    return context.api.createOrganization(params);
  }
});

const command = createCommand({
  intent: 'Create Branch C under the group.',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: {
    name: 'Branch C',
    parentId: 'group'
  }
});

const result = await runtime.executeCommand(command, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  },
  api
});

if (!result.ok) {
  console.warn(result.message);
}
```

For larger apps, `createCapabilityManifest()` can add version, domain, group, tags, dependencies, input/output schemas, and example templates while remaining compatible with `registerCapability()`.

Use `previewCommand` when UI needs to show a confirmation or explain why an operation is blocked before execution:

```js
const preview = await runtime.previewCommand(command, {
  actor: {
    id: 'user-1',
    permissions: ['organization:create']
  },
  api
});
```

Use `executePlan` when a business task needs multiple ordered capabilities:

```js
const planPreview = await runtime.previewPlan(plan, context);
const planResult = await runtime.executePlan(plan, context);
```

Plan nodes may define `compensate` so successful steps can be reversed when a later step fails.

Plans can also include conditional branches and approval nodes when a workflow needs data-dependent routing or a human gate before execution continues.
Independent plan nodes in the same dependency layer may execute in parallel.

Every command and plan result can include `explain.timeline`, a UI-ready list of validation, policy, confirmation, execution, failure, and compensation steps.

`@kupola/pivot-ui` also provides small rendering helpers:

```js
const html = renderResultToHTML(result);
const browser = renderCapabilityBrowserToHTML(runtime.listCapabilities());
const graph = renderPlanGraphToHTML(planPreview);
```

Optional default styles are available:

```js
import '@kupola/pivot/css';
```

PIVOT validates the command, checks the registered capability, evaluates policies, requests confirmation when needed, executes the host-project function, and records an audit event.

See:

- [Architecture](docs/architecture.md)
- [AI Integration](docs/ai-integration.md)
- [Backend Security](docs/backend-security.md)
- [Capability Registry](docs/capabilities.md)
- [API Reference](docs/api-reference.md)
- [UI Integration](docs/ui-integration.md)
- [Security Model](docs/security.md)
- [Migration Notes](docs/migration.md)
- [Roadmap](docs/roadmap.md)
- [Examples](examples/README.md)
- [Changelog](CHANGELOG.md)
- [Design Notes](dgc/AI_NATIVE_WEB_APP_TODO.md)
