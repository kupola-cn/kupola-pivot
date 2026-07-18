# PIVOT Roadmap

## 0.1 Foundation

- Define protocol contracts for intent, command, capability, resource, result, and audit event.
- Define frontend policy decision types and risk levels.
- Define basic orchestrator primitives for single actions and linear flows.
- Build Kupola-based trusted UI adapter contracts.
- Implement capability registry, command validation, execution result wrapping, and audit events.
- Keep `dgc/` as design notes and decision history.

## 0.2.0 Developer Preview

- Implement policy middleware pipeline.
- Implement result preview and confirmation hooks.
- Add HIS-style example for query, create, update, delete, and organization hierarchy operations.
- Document migration path from Kupola 2.x and `@kupola/ai-adapter`.
- Publish a consolidated Developer Preview changelog.

## 0.1.1 Package Hardening

- Add TypeScript declaration files for public packages.
- Add package `types` exports.
- Add built-in frontend policy helpers for permission hints, risk levels, sensitive resources, and backend status mapping.
- Keep backend authorization as the final security boundary.

## 0.1.3 Execution Preview

- Add `runtime.previewCommand(command, context)`.
- Return capability, policy result, warnings, and confirmation requirement before execution.
- Support UI drawers/modals that explain what will happen before calling project APIs.

## 0.1.4 Orchestrator Validation

- Add stable plan IDs.
- Add `validatePlan(plan)`.
- Add `getExecutionOrder(plan)`.
- Detect duplicate nodes, invalid edges, and cycles.

## 0.1.5 Flow Runner

- Add `runtime.executePlan(plan, context, options)`.
- Execute plan nodes through the same guarded command pipeline as single commands.
- Return per-node command/result records.
- Stop on first failure by default, with optional continue-on-error behavior.

## 0.1.6 Compensation

- Add node-level `compensate` capability descriptors.
- Run successful node compensations in reverse order after a later node fails.
- Return compensation records in plan results.
- Keep compensation inside the same validation, policy, confirmation, execution, and audit pipeline.

## 0.1.7 Explain Timeline

- Add `explain.timeline` to command preview and execution results.
- Add plan-level timeline steps for validation, node execution, and compensation.
- Keep timeline as plain data so UI packages can render it later without binding core to a component library.

## 0.1.8 Timeline UI Renderer

- Add `renderTimelineToHTML`.
- Add `renderResultToHTML`.
- Add `mountTimeline`.
- Add `mountResult`.
- Escape rendered content by default.

## 0.1.9 Default UI CSS

- Add default result and timeline CSS.
- Export CSS from `@kupola/pivot/css`.
- Export CSS from `@kupola/pivot-ui/css`.
- Keep styles configurable through CSS variables and class overrides.

## 0.3.x Workflow Integration Preview

0.3.x should turn the current Developer Preview into a stronger integration preview for real project pilots. The focus is no longer adding every workflow primitive from scratch; the 0.2.x line already covers plan validation, conditional branches, parallel layers, retries, timeouts, approval nodes, compensation strategy, audit sinks, AI structured-output examples, UI renderers, examples, and release automation.

The 0.3.x target is to prove those pieces work together in host applications:

- keep public API churn small and document any necessary breaking change before release
- add end-to-end examples that combine AI proposal, command or plan validation, preview, approval, execution, compensation, and audit export
- harden the framework-neutral UI helpers around browser mounting, accessibility attributes, empty states, and hostile text rendering
- add integration-oriented tests for plan previews, graph rendering, approval gates, compensation records, audit sinks, and AI validation feedback
- document recommended server endpoints for capabilities, policy context, audit persistence, and rate-limit or abuse-protection handoff
- define package import patterns for apps that use only protocol/policy packages versus apps that install the full `@kupola/pivot` bundle

0.3.x non-goals:

- no direct database access layer
- no browser-side replacement for backend authorization
- no provider-specific AI SDK dependency in the core runtime
- no mandatory visual workflow editor dependency
- no guarantee that all public APIs are production-stable before the 1.0 track

Exit criteria for the 0.3.x line:

- at least one complex example covers AI-generated plan, preview, human approval, execution, compensation, and audit sink output
- `npm test`, release checks, and workspace package dry-runs remain clean before every publish
- docs explain which APIs are stable enough for pilots and which are still preview-level; see [API Stability Boundary](api-stability.md)
- Kupola 2.x UI bridge remains adapter-based and does not fork component code into PIVOT

## 1.0 Production-Ready Standard

1.0 should be treated as a production contract, not just a larger version number. A 1.0 release is ready only when these standards are met:

- Public API: exported functions, result shapes, plan node contracts, policy decisions, audit event shapes, and package entrypoints are documented and covered by compatibility tests.
- Security: threat model, backend authorization boundary, prompt-injection guidance, sensitive-data redaction, audit minimization, and abuse-protection handoff are documented with examples.
- Reliability: command execution, plan execution, compensation, approval nodes, retries, timeouts, conditional branches, skipped nodes, and failure mapping have focused unit and integration coverage.
- UI trust: preview, confirmation, timeline, audit, capability browser, and plan graph renderers escape untrusted text and expose predictable mount APIs for host apps.
- Packaging: all workspace package versions stay aligned at publish time, package exports are stable, TypeScript declarations are generated or maintained, and release automation verifies registry consistency.
- Migration: Kupola 2.x and `@kupola/ai-adapter` 2.x users have a documented path that preserves existing UI, backend APIs, and AI adapters while adopting PIVOT incrementally.
- Operations: audit sinks, backend status mapping, and recommended service-side policy context patterns are documented well enough for production app teams.

1.0 non-goals:

- PIVOT does not become a backend framework.
- PIVOT does not own project authentication, authorization, tenant scope, database access, or service rate limits.
- PIVOT does not require one AI provider, UI framework, or workflow editor.

## Long-Term Kupola Relationship

Kupola 2.x and `@kupola/ai-adapter` 2.x stay supported as the stable UI and AI-adapter foundation while PIVOT matures.

The intended relationship is:

- Kupola 2.x owns general UI primitives, theme tokens, and existing app surfaces.
- `@kupola/ai-adapter` 2.x owns provider calls, prompt construction, response parsing, and provider-specific compatibility.
- PIVOT owns protocol contracts, capability registration, policy decisions, previews, workflow execution, explain timelines, compensation, approvals, and audit events.
- Host applications own backend APIs, authentication, authorization, data scope, sensitive-data filtering, persistence, and operational controls.

PIVOT is the candidate architecture track for Kupola 3.x AI-native applications, but it should remain usable as an independent advanced runtime. The practical rule is adapter-first integration: a Kupola 2.x app can wrap PIVOT with existing Drawer, Modal, Table, Form, Message, theme, and notification primitives; a non-Kupola app can still use the protocol, policy, orchestrator, and UI HTML helpers without adopting the full Kupola component stack.
