# Procurement Approval Example

This example shows how a procurement workflow can use PIVOT for request submission, conditional approval, order creation, and rollback on downstream failure.

It covers:

- command preview and execution for procurement requests
- conditional plan routing based on request amount
- approval-node handling for finance review
- successful order dispatch
- compensation when dispatch fails after order creation
- trusted UI hooks for confirmation and approval surfaces

Run:

```bash
npm run example:procurement-approval
```

The example uses in-memory procurement data. Real systems should connect capability execution to project-owned services and keep backend authorization in place.
