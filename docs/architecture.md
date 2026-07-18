# PIVOT Architecture

PIVOT is built around one rule: AI should not directly operate data, APIs, DOM, or business state. AI can propose structured intent and plans. PIVOT validates, explains, confirms, executes, and audits them through registered capabilities.

AI provider adapters belong outside the runtime core. They should handle prompt construction, provider calls, and response parsing, then hand structured output back to PIVOT for validation and preview. See [AI Integration](ai-integration.md) for the adapter boundary and failure feedback flow.

## Layers

```text
Trusted UI
  -> intent input and confirmation
Protocol
  -> normalized command and result contracts
Capability Registry
  -> what the app can do and how it can be called
Policy
  -> frontend interaction checks, risk hints, and permission prompts
Orchestrator
  -> single-step action, multi-step flow, and business dependency planning
Execution Adapter
  -> project-owned API calls, never direct database access
Audit
  -> explainable logs, decisions, sources, and outcomes
```

## Capability Registration

Every operation must pass through a capability registry. The registry is the boundary between AI intent and project-owned APIs.

A capability declares:

- name
- resource
- action
- risk level
- parameter schema
- input and output schema
- capability version
- domain, group, and tags for discovery
- dependency descriptions for multi-step flows
- example templates for project integration
- permission hints
- confirmation requirement
- project-owned execute function

This keeps PIVOT from becoming an unsafe "AI can call anything" layer. AI can propose commands, but only registered capabilities can be validated and executed.

## Core Principles

- Protocol-first: every operation has a structured command, resource, action, risk level, and expected result.
- Intent-driven: UI and workflows are organized around what the user wants to complete, not only around pages.
- Verifiable: important results include source, decision path, confidence, and policy status.
- Orchestrated: complex business operations can be represented as ordered or graph-based steps.
- Trusted UI: high-risk operations require preview, confirmation, rollback strategy, or approval.

## Kupola 2.x Reuse

PIVOT should reuse Kupola 2.x for UI primitives and styling where possible:

- Drawer and modal for assistant surfaces and confirmations
- Table and result view for structured data preview
- Form and select for capability configuration
- Message and notification for permission and execution feedback
- Theme tokens for brand and dark mode consistency

PIVOT should not copy Kupola 2.x component code unless there is a clear reason. The preferred direction is adapter-based reuse.

## Business Complexity

Simple CRUD can be modeled as one command. Real business work often needs dependencies between data, rules, and steps.

PIVOT supports two levels:

- Intent Action: one capability call, such as querying roles or creating one organization.
- Intent Flow: multiple related nodes, such as creating a branch under a group, assigning roles, creating menus, and notifying owners.

For complex business orchestration, PIVOT should support a node workflow model, but it should stay optional. Developers can start with linear steps and adopt graph workflows only when business dependencies require them.

## Plan Validation

The orchestrator package provides basic graph validation:

- duplicate node detection
- edge reference checks
- cycle detection
- execution order derivation for directed acyclic plans

This keeps early workflow modeling practical without forcing a visual workflow editor too early.

## Plan Execution

`executePlan(plan, context)` runs a validated directed acyclic plan in dependency order. Independent nodes in the same dependency layer may execute in parallel. Each node resolves a registered capability and is executed through the same command pipeline as `executeCommand`, including validation, policy checks, confirmation, execution, result wrapping, and audit events.

Plan nodes can also request per-node retry and timeout controls. Retries count total execution attempts for the capability execution stage, and timeouts apply to each attempt without changing the DAG semantics or the approval/policy flow around the node.

Plan nodes may declare `input` mappings plus `inputSchema` and `outputSchema` contracts. Mapped input is resolved before execution, the input contract is checked before the capability runs, and the output contract is checked after a successful capability result returns.

The default behavior stops on the first failed node. Apps can pass `{ stopOnError: false }` to continue and collect all node results.

Plan edges may include declarative conditions. Conditional branches are evaluated from previous node results during execution, and non-matching branch nodes are marked as skipped instead of calling their capabilities. Conditions are data objects or known string aliases, not executable JavaScript.

Plans may also include approval nodes. Approval nodes are explicit workflow gates handled by the trusted UI adapter, not registered capabilities. They are useful when a person must review the plan before the next step executes.

## Compensation

Plan nodes can define a `compensate` capability. When a later node fails and `compensateOnError` is enabled, PIVOT runs compensation commands for previously successful nodes in reverse execution order.

Compensation is not a database transaction. It is a business-level recovery hook. Each compensation command still goes through validation, policy checks, confirmation, execution, result wrapping, and audit events.

## Explain Timeline

Command and plan results include an optional `explain.timeline` array. The timeline is designed for UI surfaces that need to show why an operation was allowed, blocked, confirmed, executed, failed, or compensated.

Typical stages include:

- `validation`
- `policy`
- `confirmation`
- `execution`
- `plan.validation`
- `plan.node`
- `plan.compensation`

`@kupola/pivot-ui` can render timelines and results as escaped HTML strings or mount them into DOM elements. The renderer is intentionally small and framework-neutral.

Default browser styles are exported from `@kupola/pivot/css` and `@kupola/pivot-ui/css`. Apps can override the CSS variables or the generated classes.
