# Migration Notes

## From Kupola 2.x and `@kupola/ai-adapter`

PIVOT does not replace Kupola 2.x immediately. Kupola 2.x remains the stable UI component and `@kupola/ai-adapter` 2.x remains the current AI adapter line.

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

`0.2.0` is a Developer Preview. Public APIs are intended to be usable but are not yet final for production 1.0.
