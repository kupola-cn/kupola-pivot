# AI Integration

PIVOT treats AI as a proposal source, not an execution boundary.

## Adapter Responsibilities

A project-owned AI adapter should do four things:

1. send the prompt or messages to a provider
2. request bounded structured output
3. parse the provider response into a plain object
4. return schema failures back to the model or authoring UI

The adapter should not execute capabilities, open database connections, or decide authorization.
Those steps belong to PIVOT runtime and the host application.

## Local Rules vs AI API

Local rule parsing and AI API parsing solve different problems.

- Local rules are deterministic and should stay simple.
- AI output is untrusted and must be parsed as structured data.
- Local rules may normalize known phrases into a command draft.
- AI APIs may suggest intent, but the runtime still validates the result.

Do not let a provider adapter become a second business logic layer.
It should prepare prompts, call the model, and hand the result back to PIVOT for validation.

## Recommended Flow

```text
user intent
  -> local rules or AI prompt
  -> provider response
  -> parseStructuredCommandOutput / parseStructuredPlanOutput
  -> validation feedback if invalid
  -> preview
  -> confirmation
  -> execution
```

## Command Drafts

When the provider returns a command draft, the adapter should surface only schema feedback on failure:

```js
const parsed = parseStructuredCommandOutput(modelOutput);

if (!parsed.ok) {
  return {
    retry: true,
    errors: parsed.explain.errors
  };
}

return runtime.previewCommand(parsed.data.command, context);
```

The adapter should not fabricate missing fields, guess capability names, or silently change the intent.

## Plan Drafts

Plan drafts follow the same pattern:

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

Plans are especially sensitive because they can encode multiple steps. Validation must happen before any step runs.

## Suggested Adapter Shape

```js
export function createAiAdapter({ provider, runtime }) {
  return {
    async draftCommand(input) {},
    async draftPlan(input) {},
    async repairStructuredOutput(input) {}
  };
}
```

The exact shape can vary by project, but the responsibilities should stay stable:

- provider I/O lives in the adapter
- validation lives in PIVOT
- preview and execution live in the runtime
- authorization lives on the backend

