# API Stability Boundary

This is the current documentation boundary for PIVOT.

It is a practical guide for pilots, not a 1.0 compatibility contract.

## Pilot-Stable

These surfaces are expected to keep working as documented across the current Developer Preview line and pilot integrations:

- package entrypoints for `@kupola/pivot`, `@kupola/pivot-protocol`, `@kupola/pivot-policy`, `@kupola/pivot-orchestrator`, and `@kupola/pivot-ui`
- command protocol, capability protocol, result protocol, and audit event shape
- capability registry registration, lookup, listing, and validation
- `previewCommand()`
- `executeCommand()`
- `previewPlan()`
- `executePlan()`
- compensation records and explain timeline data
- `createTrustedUIAdapter()`
- `mountResult()`
- `mountTimeline()`
- `mountTimelineDetail()`
- `mountAuditViewer()`
- `mountCapabilityBrowser()`
- backend security guidance in `docs/backend-security.md`

## Preview-Level

These surfaces are usable now, but they may evolve with the integration-preview line:

- `simulateCommand()`
- `parseStructuredCommandOutput()`
- `parseStructuredPlanOutput()`
- plan graph rendering and mounting helpers
- example workflows under `examples/`
- generated API reference output

## Working Rule

Use pilot-stable surfaces for host-app contracts.

Use preview-level surfaces when you want stronger ergonomics or richer examples, but keep a small compatibility buffer around them.

If a preview-level surface becomes stable, update this document together with the changelog and roadmap.
