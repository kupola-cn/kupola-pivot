# Migration Notes

## From Kupola 2.x and `@kupola/ai-adapter`

PIVOT does not replace Kupola 2.x immediately. Kupola 2.x remains the stable UI component and `@kupola/ai-adapter` 2.x remains the current AI adapter line.

The long-term direction is adapter-first:

- Kupola 2.x continues to provide UI primitives, theme tokens, and existing application surfaces.
- `@kupola/ai-adapter` 2.x continues to handle provider calls, prompt construction, response parsing, and provider-specific compatibility.
- PIVOT handles protocol contracts, capability registration, validation, preview, policy decisions, workflow execution, explain timelines, approvals, compensation, and audit events.
- Host applications keep ownership of backend APIs, authentication, authorization, tenant scope, data filtering, persistence, rate limits, and abuse protection.

PIVOT is the candidate architecture track for Kupola 3.x AI-native applications, but it should also remain usable as a standalone advanced runtime for projects that do not adopt the full Kupola UI stack.

Use PIVOT when you need:

- explicit capability registration
- structured command validation
- frontend policy hints
- command preview
- multi-step flow execution
- compensation hooks
- explainable timeline output

## Recommended Migration Path

1. Keep existing Kupola UI and backend APIs.
2. Identify one narrow business workflow, such as querying roles or creating an organization.
3. Register that workflow as PIVOT capabilities.
4. Convert local parser or AI output into structured commands.
5. Use `previewCommand` before high-risk execution.
6. Use `executeCommand` or `executePlan` for actual execution.
7. Render `result.explain.timeline` for user-facing transparency.

## Security Boundary

Do not migrate backend authorization into PIVOT frontend code.

Frontend permissions can block obvious invalid operations and show better messages. Backend APIs must still enforce:

- authentication
- authorization
- tenant and organization scope
- sensitive field filtering
- 401 and 403 responses

## Versioning

`0.2.x` is a Developer Preview. Public APIs are intended to be usable but are not yet final for production 1.0.

`0.3.x` targets integration hardening for real project pilots: end-to-end AI proposal to preview to approval to execution examples, stronger UI helper behavior, integration tests, server handoff guidance, and clearer package usage patterns. See [Service Handoff](service-handoff.md) and [API Stability Boundary](api-stability.md) for the current guidance.

`1.0` requires stable public APIs, compatibility tests, documented security boundaries, production-oriented migration guidance, and verified package publishing discipline. See [Production Migration Guide](production-migration.md), [Release Prep](release-prep.md), and [Roadmap](roadmap.md) for the full production-ready standard.
