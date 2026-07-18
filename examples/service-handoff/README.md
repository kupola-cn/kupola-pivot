# Service Handoff

This example shows a backend-style PIVOT integration.

It demonstrates:

- capability metadata exposure
- preview, simulate, and execute service endpoints
- backend authorization checks
- plan preview and plan execution through the service boundary
- human approval and compensation inside a server-wrapped workflow
- audit sink capture for executed, confirmed, and failed operations

Run:

```bash
npm run example:service-handoff
```

The example uses a mocked service layer around PIVOT. Real projects should keep auth, scope, audit, and persistence on the server, then call PIVOT runtime methods from those handlers.
