# Examples

## HIS Basic

Path:

```text
examples/his-basic
```

Run:

```bash
npm run example:his-basic
```

This example demonstrates:

- role query
- organization creation
- command preview
- permission-policy blocking
- backend 403 mapping
- plan execution
- plan compensation
- explain timeline output

The example uses an in-memory fake HIS API. Real projects should call their own backend APIs from capability `execute` functions.

## Drawer / Modal Integration

Path:

```text
examples/assistant-drawer-modal
```

Run:

```bash
npm run example:assistant-drawer-modal
```

This example shows how a host app can wire the trusted UI adapter to Drawer and Modal surfaces for command previews, confirmations, and plan approvals.

## Kupola UI Integration

Path:

```text
examples/kupola-ui-integration
```

Run:

```bash
npm run example:kupola-ui-integration
```

This example shows how a Kupola 2.x app can use Drawer, Modal, Table, and Message primitives around PIVOT previews and execution.

## Procurement Approval

Path:

```text
examples/procurement-approval
```

Run:

```bash
npm run example:procurement-approval
```

This example shows a procurement workflow with request submission, conditional finance approval, order creation, and compensation when dispatch fails.

## AI Workflow Integration

Path:

```text
examples/ai-workflow-integration
```

Run:

```bash
npm run example:ai-workflow-integration
```

This example shows an AI-proposed retention workflow moving through structured-output validation feedback, plan preview, trusted approval, execution, compensation, and audit sink export.

## Service Handoff

Path:

```text
examples/service-handoff
```

Run:

```bash
npm run example:service-handoff
```

This example shows a server-style PIVOT integration with capability metadata, preview, simulation, execution, plan orchestration, approval, compensation, and audit handling.
