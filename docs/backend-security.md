# Backend Security

PIVOT does not replace backend security. It helps the frontend validate intent, preview work, and explain decisions, but the backend remains the final boundary.

## Server-Side Authorization

Every capability execution endpoint should enforce:

- authentication
- permission checks
- tenant and organization scope
- resource ownership
- sensitive field filtering
- request method and content type checks

Example:

```js
export async function postExecuteCommand(req, res) {
  const actor = await authenticateRequest(req);

  if (!actor) {
    return res.status(401).json({ ok: false, message: 'Authentication required.' });
  }

  const command = req.body?.command;
  const validation = runtime.validateCommand(command);

  if (!validation.valid) {
    return res.status(400).json({ ok: false, errors: validation.errors });
  }

  if (!actor.permissions.includes(requiredPermissionFor(command))) {
    return res.status(403).json({ ok: false, message: 'Forbidden.' });
  }

  if (!withinTenantScope(actor, command)) {
    return res.status(403).json({ ok: false, message: 'Out of scope.' });
  }

  const result = await runtime.executeCommand(command, {
    actor,
    auditMetadata: {
      requestId: req.headers['x-request-id']
    }
  });

  return res.json(result);
}
```

Do not rely on frontend permissions alone. A malicious client can call the backend directly.

## Rate Limits

Rate limits should be enforced on the backend for:

- authenticated user id
- tenant id
- IP address when appropriate
- capability name or route
- burst and sustained traffic

Good defaults:

- low burst limits on destructive endpoints
- separate limits for preview and execute calls
- stricter limits on AI-assisted endpoints
- explicit `429 Too Many Requests` responses

PIVOT should not be used to simulate rate limiting in the browser. Frontend checks can improve UX, but they do not protect the service.

## Abuse Protection

Add abuse controls for:

- repeated invalid structured output submissions
- repeated failed login or token verification attempts
- repeated forbidden capability calls
- unusually large plans or commands
- suspicious prompt or payload patterns

Suggested signals:

- validation failure count
- policy deny count
- 401 / 403 / 429 frequency
- request size
- node count and edge count in AI-generated plans

## AI-Assisted Requests

When a request comes from AI-generated structured output, the backend should still treat it as an untrusted client request.

- validate the parsed command or plan again
- enforce auth and scope again
- apply the same rate limits
- log the request ID and capability name

The backend must never assume that AI validation implies user authorization.

