# PIVOT Roadmap

## 0.1 Foundation

- Define protocol contracts for intent, command, capability, resource, result, and audit event.
- Define frontend policy decision types and risk levels.
- Define basic orchestrator primitives for single actions and linear flows.
- Build Kupola-based trusted UI adapter contracts.
- Implement capability registry, command validation, execution result wrapping, and audit events.
- Keep `dgc/` as design notes and decision history.

## 0.2 Developer Preview

- Implement policy middleware pipeline.
- Implement result preview and confirmation hooks.
- Add HIS-style example for query, create, update, delete, and organization hierarchy operations.

## 0.3 Workflow Preview

- Add node-based flow definitions for complex business orchestration.
- Support dependency edges, preconditions, rollback hints, and human approval nodes.
- Add visual workflow editor exploration, likely powered by Kupola UI primitives.

## 1.0 Production Track

- Stable public API.
- Security documentation and threat model.
- Test coverage for protocol, policy, orchestrator, and UI adapters.
- Framework-agnostic browser package.
- Optional integrations for AI API providers.
- Full docs site and migration guide from `@kupola/ai-adapter` 2.x.
