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

This repository is in early architecture and foundation work. The first milestone is to define stable contracts before implementing production behavior.

See:

- [Architecture](docs/architecture.md)
- [Capability Registry](docs/capabilities.md)
- [Security Model](docs/security.md)
- [Roadmap](docs/roadmap.md)
- [Design Notes](dgc/AI_NATIVE_WEB_APP_TODO.md)
