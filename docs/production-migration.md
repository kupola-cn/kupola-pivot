# Production Migration Guide

This guide is for teams moving from Kupola 2.x and `@kupola/ai-adapter` 2.x into PIVOT without rewriting the whole application.

## Migration Goals

- keep existing Kupola UI surfaces
- keep existing backend APIs and authorization
- keep provider-specific AI calls in the existing AI adapter layer
- add PIVOT as the protocol, validation, preview, execution, approval, compensation, and audit layer

## Phase 1: Choose One Workflow

Start with one narrow workflow that already has a backend API and a clear permission model.

Good candidates:

- query roles
- create an organization
- submit a procurement request
- prepare an account retention offer

Avoid starting with broad search, destructive bulk actions, or workflows that do not have backend authorization yet.

## Phase 2: Register Capabilities

Wrap each backend operation as a capability.

Keep the capability executor small:

```js
runtime.registerCapability({
  name: 'organization.create',
  resource: 'organization',
  action: ActionType.CREATE,
  risk: RiskLevel.MEDIUM,
  permissions: ['organization:create'],
  requiresConfirmation: true,
  paramsSchema: {
    name: { type: 'string', required: true },
    parentId: { type: 'string', required: true }
  },
  execute: async ({ params, context }) => context.api.createOrganization(params)
});
```

The executor should call project-owned APIs. It should not open new database access paths from the browser.

## Phase 3: Keep AI as a Proposal Source

Continue using `@kupola/ai-adapter` for provider calls.

Hand only structured output to PIVOT:

```js
const parsed = parseStructuredPlanOutput(modelOutput);

if (!parsed.ok) {
  return {
    retry: true,
    errors: parsed.explain.errors
  };
}

return runtime.previewPlan(parsed.data.plan, context);
```

Do not let model output choose hidden APIs, bypass capability names, or skip validation.

## Phase 4: Wire Existing UI

Keep Drawer, Modal, Table, Message, theme, and layout code in the host app.

Use PIVOT for the data behind those surfaces:

- `previewCommand()` or `previewPlan()` before the user confirms work
- `createTrustedUIAdapter()` to connect existing confirmation and approval UI
- `renderTimelineDetailToHTML()` or host-owned components for explain timelines
- `renderCapabilityBrowserToHTML()` or a host table for capability discovery

## Phase 5: Move Service Concerns Server-Side

Expose server handlers for:

- capability metadata
- command or plan preview
- command simulation when `dryRun` is available
- command or plan execution
- audit persistence

See [Service Handoff](service-handoff.md) for endpoint shapes.

The server must still enforce:

- authentication
- authorization
- tenant and organization scope
- sensitive field filtering
- request size limits
- rate limits and abuse protection

## Phase 6: Roll Out Safely

Recommended rollout order:

1. register capabilities without AI-generated execution
2. use previews in internal tools
3. enable command execution for one role
4. add plan execution for one workflow
5. add AI-generated command or plan drafts
6. enable audit sink review before wider rollout

Watch these signals during rollout:

- validation failures
- policy denies
- backend 401, 403, 409, and 429 responses
- compensation frequency
- user rejection frequency
- repeated prompt or structured-output repair attempts

## Production Readiness Checklist

- [ ] every capability maps to a backend-authorized API
- [ ] destructive or sensitive capabilities require confirmation or approval
- [ ] command and plan result shapes are covered by compatibility tests
- [ ] TypeScript declarations pass `npm run typecheck`
- [ ] audit metadata is minimized and redacted
- [ ] service handoff endpoints enforce auth, scope, and rate limits
- [ ] migration docs are reviewed by the host app team
- [ ] release preflight passes before publishing
