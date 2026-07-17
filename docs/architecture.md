# PIVOT Architecture

PIVOT is built around one rule: AI should not directly operate data, APIs, DOM, or business state. AI can propose structured intent and plans. PIVOT validates, explains, confirms, executes, and audits them through registered capabilities.

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
