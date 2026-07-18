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
