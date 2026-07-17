# Changelog

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
