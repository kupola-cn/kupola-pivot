# Changelog

## 0.2.7 - Plan Param References

### Added

- Plan node params can reference previous node results with `{ $from, path }`.
- `previewPlan` shows result references as readable placeholders.
- `executePlan` fails a node before execution when a param reference cannot be resolved.

## 0.2.6 - Plan Size Limits

### Added

- Optional `maxNodes` and `maxEdges` limits for `validatePlan`.
- Runtime `planLimits` option with default limits before plan preview and execution.

## 0.2.5 - Immutable Capability Registry

### Changed

- Registered capabilities are now deep-cloned and deeply frozen.
- Later mutations to source capability input, nested schemas, permissions, or metadata no longer change registry behavior.

## 0.2.4 - Plan Preview

### Added

- `previewPlan()` runtime API for validating and previewing all plan nodes before execution.
- Plan preview timeline steps for node-level readiness and blocking reasons.

## 0.2.3 - Backend Rejection Semantics

### Changed

- Runtime execution now maps backend `401` and `403` errors to denied blocked command results.
- Runtime execution now records backend HTTP status in result explain data and audit metadata.
- Backend `409` errors are represented as conflict failures.

## 0.2.2 - Sensitive Param Redaction

### Added

- `redactParams()` protocol helper for UI-safe command previews.
- `FieldRule.sensitive` for capability schema fields.

### Changed

- `previewCommand` and confirmation inputs now receive redacted command params.
- Sensitive field names such as `password`, `token`, `secret`, `apiKey`, and `authorization` are redacted by default.

## 0.2.1 - Security Hardening

### Added

- Capability-level `allowUnknownParams` switch for intentionally dynamic command params.

### Changed

- Command param validation now rejects undeclared params by default before runtime execution.
- Security and capability docs now describe the unknown-param boundary.

## 0.2.0 - Developer Preview

PIVOT 0.2.0 marks the first Developer Preview release.

### Added

- Protocol contracts for commands, capabilities, results, risk levels, and audit events.
- Capability registry with validation and parameter schema checks.
- Runtime command preview and execution.
- Built-in frontend policies for permission hints, risk levels, sensitive resources, and backend status mapping.
- Plan validation, execution ordering, flow execution, and compensation hooks.
- Explain timeline data for command and plan results.
- Framework-neutral result and timeline HTML renderers.
- Default CSS for result and timeline UI.
- HIS basic example covering query, organization creation, permission blocking, backend 403 handling, plan execution, and compensation.

### Security

- AI output is treated as untrusted structured input.
- Unknown capabilities and invalid params are rejected before execution.
- Frontend policy checks are interaction guardrails only.
- Backend authentication, authorization, data scope, and sensitive field filtering remain mandatory.

## 0.1.x - Foundation Iterations

- `0.1.9` added default UI CSS.
- `0.1.8` added timeline UI renderers.
- `0.1.7` added explain timelines.
- `0.1.6` added plan compensation.
- `0.1.5` added plan execution.
- `0.1.4` added plan validation.
- `0.1.3` added command preview.
- `0.1.2` added HIS basic example and stable IDs.
- `0.1.1` added TypeScript declarations and built-in policies.
- `0.1.0` initialized the PIVOT runtime packages.
