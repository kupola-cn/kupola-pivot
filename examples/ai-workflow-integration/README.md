# AI Workflow Integration

This example shows an end-to-end PIVOT workflow for an AI-proposed retention plan.

It demonstrates:

- invalid structured plan output returning validation feedback
- repaired AI proposal parsing into a PIVOT plan
- plan preview before execution
- trusted UI confirmation and approval hooks
- execution through registered capabilities
- compensation after a downstream service failure
- audit sink export with sensitive metadata redaction

Run:

```bash
npm run example:ai-workflow-integration
```

The example uses a mocked AI adapter and in-memory CRM API. Real projects should keep provider calls in their own adapter, then hand structured commands or plans to PIVOT for validation, preview, confirmation, execution, and audit.
