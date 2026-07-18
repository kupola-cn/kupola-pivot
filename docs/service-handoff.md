# Service Handoff

PIVOT keeps the browser runtime thin. The backend owns authentication, authorization, scope, persistence, and abuse protection.

## Recommended Endpoints

### Capability Metadata

`GET /api/pivot/capabilities`

Return the capabilities a user can see, plus the permission hints and policy context the UI can explain.

Suggested payload shape:

```js
{
  capabilities: [],
  policyContext: {
    permissions: [],
    role: '',
    tenantId: ''
  },
  version: '0.2.14'
}
```

Use this for browser browsing and preview UI. Do not treat it as the final authorization source.

### Preview

`POST /api/pivot/preview-command`

`POST /api/pivot/preview-plan`

Accept structured commands or plans, validate them again on the server, and return the runtime preview result.

When a capability provides `dryRun`, the backend may call `simulateCommand()` to estimate impact before execution.

Suggested responsibilities:

- validate the command or plan again on the server
- resolve capability metadata from the server registry
- record the request id or trace id
- persist a draft or preview record when the host app needs one

### Execution

`POST /api/pivot/execute-command`

`POST /api/pivot/execute-plan`

Recheck auth, scope, and rate limits before calling host APIs.

Suggested responsibilities:

- authenticate the caller
- enforce role, permission, tenant, and resource scope
- enforce rate limits and abuse controls
- forward audit metadata
- return the runtime result without trusting browser checks

### Audit

`POST /api/pivot/audit`

Store request ids, trace ids, capability names, decisions, status summaries, and error reasons.

Suggested sinks:

- application database
- append-only log
- observability pipeline
- security review queue for repeated deny or conflict patterns

## Service Boundary

Keep these concerns on the server:

- backend authorization
- tenant and organization scope
- sensitive field filtering
- request throttling
- persistence
- audit retention

Keep these concerns in PIVOT:

- protocol validation
- preview and explain data
- workflow orchestration
- confirmation and approval flow
- trusted UI rendering
