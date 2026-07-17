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
- `kupola-pivot` explores the future 3.x architecture or a standalone advanced runtime.
- PIVOT can reuse Kupola UI primitives such as Drawer, Modal, Table, Form, Message, theme tokens, and CSS.
- PIVOT should not depend on frontend-only permissions for real security. Backend APIs must still enforce authentication, authorization, data scope, and sensitive field protection.

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

## Install

```bash
npm install @kupola/pivot
```

You can also install lower-level packages directly:

```bash
npm install @kupola/pivot-protocol @kupola/pivot-policy
```

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

Every command and plan result can include `explain.timeline`, a UI-ready list of validation, policy, confirmation, execution, failure, and compensation steps.

`@kupola/pivot-ui` also provides small rendering helpers:

```js
const html = renderResultToHTML(result);
```

Optional default styles are available:

```js
import '@kupola/pivot/css';
```

PIVOT validates the command, checks the registered capability, evaluates policies, requests confirmation when needed, executes the host-project function, and records an audit event.

See:

- [Architecture](docs/architecture.md)
- [Capability Registry](docs/capabilities.md)
- [Security Model](docs/security.md)
- [Migration Notes](docs/migration.md)
- [Roadmap](docs/roadmap.md)
- [Examples](examples/README.md)
- [Changelog](CHANGELOG.md)
- [Design Notes](dgc/AI_NATIVE_WEB_APP_TODO.md)
