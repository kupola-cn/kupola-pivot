# PIVOT Security Model

PIVOT treats frontend AI as an interaction layer, not a security boundary.

## Non-Negotiable Rule

Frontend permission checks can improve guidance, block obvious invalid actions, and show useful messages. They cannot replace backend authorization.

Backend APIs must enforce:

- authentication
- role and permission checks
- data scope
- tenant and organization boundaries
- sensitive field filtering
- rate limits and abuse protection
- 401 and 403 responses when access is invalid

## AI Execution Boundary

AI output must be treated as untrusted input.

PIVOT should:

- accept only structured commands matching the protocol
- reject unknown actions and unknown resources
- require capability registration before execution
- validate parameters before calling project APIs
- reject undeclared command params by default
- redact sensitive params before passing commands to preview and confirmation UI
- classify risk before execution
- require confirmation for destructive, sensitive, or cross-scope operations
- avoid putting sensitive fields into prompts, logs, or UI previews by default

## Permission Feedback

When a user lacks permission, PIVOT should explain the blocked operation clearly:

```text
You do not have permission to delete users.
Required capability: user.delete
Backend response: 403
```

The frontend may block early when it already knows the user lacks permission, but it must still handle backend 401/403 as the final source of truth.

## Built-In Frontend Policies

PIVOT includes policy helpers for common interaction checks:

- permission hints
- risk-level confirmation
- sensitive resource confirmation/escalation/deny
- backend status mapping for `401`, `403`, and `409`

These helpers are meant to improve UX and reduce accidental misuse. They do not prove access rights. A malicious user can bypass frontend code, so the backend must reject unauthorized requests independently.

## Backend Rejections

When a capability execute function throws an error with `status`, `statusCode`, or `response.status`, PIVOT preserves the backend security meaning:

- `401` becomes a denied blocked command.
- `403` becomes a denied blocked command.
- `409` becomes a failed conflict result.

The HTTP status is included in `result.explain.status` and `audit.metadata.httpStatus`. This makes permission failures visible without pretending the frontend was the final authority.

## Runtime Execution Guardrails

The PIVOT runtime should execute commands only after:

- the command matches the protocol
- the capability is registered
- params match the capability schema
- params do not include undeclared fields unless the capability explicitly allows them
- frontend policy has allowed or requested confirmation
- confirmation has passed when required
- the host project execute function is available

If any step fails, execution returns a failed result and writes an audit event. PIVOT should not silently fall back to direct API calls or AI-generated URLs.

## Immutable Capabilities

Registered capabilities are deep-cloned and deeply frozen by the registry. This prevents later mutations to the original input object, returned capability object, nested `paramsSchema`, `permissions`, or metadata from changing the runtime security boundary.

Project code should update a capability by re-registering it intentionally, not by mutating a previously returned object.

## Sensitive Params

Capability schemas can mark params as sensitive:

```js
paramsSchema: {
  id: { type: 'string', required: true },
  password: { type: 'string', required: true, sensitive: true }
}
```

PIVOT redacts sensitive params in command preview and confirmation input. The capability `execute` function still receives the original params so the project can call its own backend API.

Common sensitive field names such as `password`, `token`, `secret`, `apiKey`, and `authorization` are also redacted by default.

## Audit Trail

Every meaningful execution should be auditable:

- original user intent
- parsed command
- selected capability
- policy decision
- confirmation state
- API target or adapter name
- result summary
- error or rejection reason
- timestamp and actor metadata
