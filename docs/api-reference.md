# API Reference

Generated from the public TypeScript declaration files.

## @kupola/pivot-protocol

Protocol contracts for commands, capabilities, results, and audit events.

### PIVOT_PROTOCOL_VERSION

```ts
export const PIVOT_PROTOCOL_VERSION: '0.1.0';
```

### CAPABILITY_MANIFEST_VERSION

```ts
export const CAPABILITY_MANIFEST_VERSION: '0.1.0';
```

### ActionType

```ts
export const ActionType: Readonly<{
  QUERY: 'query';
  CREATE: 'create';
  UPDATE: 'update';
  DELETE: 'delete';
  EXECUTE: 'execute';
  FLOW: 'flow';
}>;
```

### ActionTypeValue

```ts
export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType];
```

### RiskLevel

```ts
export const RiskLevel: Readonly<{
  LOW: 'low';
  MEDIUM: 'medium';
  HIGH: 'high';
  CRITICAL: 'critical';
}>;
```

### RiskLevelValue

```ts
export type RiskLevelValue = (typeof RiskLevel)[keyof typeof RiskLevel];
```

### CommandStatus

```ts
export const CommandStatus: Readonly<{
  DRAFT: 'draft';
  VALIDATED: 'validated';
  BLOCKED: 'blocked';
  CONFIRMED: 'confirmed';
  EXECUTED: 'executed';
  REJECTED: 'rejected';
  FAILED: 'failed';
}>;
```

### CommandStatusValue

```ts
export type CommandStatusValue = (typeof CommandStatus)[keyof typeof CommandStatus];
```

### FieldType

```ts
export const FieldType: Readonly<{
  STRING: 'string';
  NUMBER: 'number';
  BOOLEAN: 'boolean';
  ARRAY: 'array';
  OBJECT: 'object';
  DATE: 'date';
  ENUM: 'enum';
}>;
```

### FieldTypeValue

```ts
export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType];
```

### FieldRule

```ts
export interface FieldRule {
  type?: FieldTypeValue;
  required?: boolean;
  options?: unknown[];
  sensitive?: boolean;
}
```

### ParamsSchema

```ts
export type ParamsSchema = Record<string, FieldTypeValue | FieldRule>;
```

### PivotCapabilityDependency

```ts
export interface PivotCapabilityDependency {
  capability: string;
  version?: string;
  optional?: boolean;
  description?: string;
}
```

### PivotCapabilityExample

```ts
export interface PivotCapabilityExample {
  label?: string;
  description?: string;
  params?: Record<string, unknown>;
  command?: Partial<PivotCommand>;
  output?: unknown;
}
```

### PivotCommand

```ts
export interface PivotCommand {
  protocolVersion: typeof PIVOT_PROTOCOL_VERSION;
  id: string;
  intent: string;
  resource: string;
  action: ActionTypeValue;
  capability: string;
  status: CommandStatusValue;
  risk: RiskLevelValue;
  params: Record<string, unknown>;
  metadata: Record<string, unknown>;
}
```

### PivotCapability

```ts
export interface PivotCapability {
  name: string;
  resource: string;
  action: ActionTypeValue;
  risk: RiskLevelValue;
  description: string;
  paramsSchema: ParamsSchema;
  inputSchema?: ParamsSchema;
  manifestVersion?: string;
  version?: string;
  domain?: string;
  group?: string;
  tags?: string[];
  dependencies?: PivotCapabilityDependency[];
  outputSchema?: Record<string, unknown>;
  examples?: PivotCapabilityExample[];
  allowUnknownParams: boolean;
  permissions: string[];
  requiresConfirmation: boolean;
  execute?: PivotCapabilityExecutor | null;
  dryRun?: PivotCapabilityExecutor | null;
  metadata: Record<string, unknown>;
}
```

### PivotCapabilityManifest

```ts
export interface PivotCapabilityManifest extends PivotCapability {
  manifestVersion: string;
  version: string;
  domain: string;
  group: string;
  tags: string[];
  dependencies: PivotCapabilityDependency[];
  inputSchema: ParamsSchema;
  outputSchema: Record<string, unknown>;
  examples: PivotCapabilityExample[];
}
```

### PivotExecutionContext

```ts
export interface PivotExecutionContext {
  actor?: unknown;
  permissions?: string[];
  auditMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}
```

### PivotCapabilityExecutor

```ts
export type PivotCapabilityExecutor = (input: {
  command: PivotCommand;
  params: Record<string, unknown>;
  context: PivotExecutionContext;
}) => unknown | Promise<unknown>;
```

### PivotAuditEvent

```ts
export interface PivotAuditEvent {
  id: string;
  timestamp: string;
  actor: unknown;
  intent: string;
  commandId: string;
  capability: string;
  decision: string;
  status: string;
  reason: string;
  metadata: Record<string, unknown>;
}
```

### PivotResult

```ts
export interface PivotResult<TData = unknown> {
  ok: boolean;
  data: TData | null;
  message: string;
  explain: unknown;
  audit: PivotAuditEvent | null;
}
```

### ValidationResult

```ts
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### createCommand

```ts
export function createCommand(input?: Partial<PivotCommand>): PivotCommand;
```

### createCapability

```ts
export function createCapability(input?: Partial<PivotCapability>): PivotCapability;
```

### createCapabilityManifest

```ts
export function createCapabilityManifest(input?: Partial<PivotCapabilityManifest>): PivotCapabilityManifest;
```

### createResult

```ts
export function createResult<TData = unknown>(input?: Partial<PivotResult<TData>>): PivotResult<TData>;
```

### createAuditEvent

```ts
export function createAuditEvent(input?: Partial<PivotAuditEvent>): PivotAuditEvent;
```

### createValidationResult

```ts
export function createValidationResult(errors?: string[], warnings?: string[]): ValidationResult;
```

### validateCommand

```ts
export function validateCommand(command: unknown, options?: { capabilities?: Map<string, PivotCapability> }): ValidationResult;
```

### validateParams

```ts
export function validateParams(params?: Record<string, unknown>, schema?: ParamsSchema, options?: { allowUnknown?: boolean }): ValidationResult;
```

### redactParams

```ts
export function redactParams(params?: Record<string, unknown>, schema?: ParamsSchema, options?: {
  redactedValue?: unknown;
  sensitiveNames?: string[];
}): Record<string, unknown>;
```

### validateCapability

```ts
export function validateCapability(capability: unknown): ValidationResult;
```

### validateCapabilityManifest

```ts
export function validateCapabilityManifest(capability: unknown): ValidationResult;
```

## @kupola/pivot-policy

Policy helpers for confirmation, escalation, and denial decisions.

### PolicyDecision

```ts
export const PolicyDecision: Readonly<{
  ALLOW: 'allow';
  DENY: 'deny';
  CONFIRM: 'confirm';
  ESCALATE: 'escalate';
}>;
```

### PolicyDecisionValue

```ts
export type PolicyDecisionValue = (typeof PolicyDecision)[keyof typeof PolicyDecision];
```

### PolicyResult

```ts
export interface PolicyResult {
  decision: PolicyDecisionValue;
  reason: string;
  metadata?: Record<string, unknown>;
}
```

### PolicyContext

```ts
export interface PolicyContext {
  command: PivotCommand;
  capability: PivotCapability;
  context: PivotExecutionContext;
}
```

### PivotPolicy

```ts
export type PivotPolicy = (context: PolicyContext) => PolicyResult | void | Promise<PolicyResult | void>;
```

### allow

```ts
export function allow(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
```

### deny

```ts
export function deny(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
```

### confirm

```ts
export function confirm(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
```

### escalate

```ts
export function escalate(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
```

### createPolicyPipeline

```ts
export function createPolicyPipeline(policies?: PivotPolicy[]): {
  evaluate(context: PolicyContext): Promise<PolicyResult>;
};
```

### createPermissionPolicy

```ts
export function createPermissionPolicy(options?: {
  getPermissions?: (context: PolicyContext) => string[];
  mode?: 'all' | 'any';
}): PivotPolicy;
```

### createRiskPolicy

```ts
export function createRiskPolicy(options?: {
  confirmAt?: RiskLevelValue[];
  escalateAt?: RiskLevelValue[];
}): PivotPolicy;
```

### createSensitiveResourcePolicy

```ts
export function createSensitiveResourcePolicy(options?: {
  resources?: string[];
  actions?: string[];
  decision?: 'confirm' | 'escalate' | 'deny';
}): PivotPolicy;
```

### mapHttpStatusToPolicy

```ts
export function mapHttpStatusToPolicy(status: number, message?: string): PolicyResult | null;
```

## @kupola/pivot-orchestrator

Plan validation, DAG execution, and edge-condition helpers.

### PivotPlanNode

```ts
export interface PivotPlanNode {
  id: string;
  type?: string;
  capability?: string;
  command?: unknown;
  input?: Record<string, unknown>;
  params?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  risk?: string;
  intent?: string;
  retry?: PivotPlanNodeRetry;
  timeout?: PivotPlanNodeTimeout;
  approval?: {
    title?: string;
    description?: string;
    requiredPermission?: string;
    assignee?: string;
    metadata?: Record<string, unknown>;
  };
  compensate?: PivotPlanNodeCompensation | PivotPlanNodeCompensation[];
  compensation?: PivotPlanNodeCompensationStrategy;
  compensateCapability?: string;
  metadata?: Record<string, unknown>;
}
```

### PivotPlanNodeCompensation

```ts
export interface PivotPlanNodeCompensation {
  capability?: string;
  command?: unknown;
  intent?: string;
  risk?: string;
  params?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  when?: 'always' | 'on-failure' | 'on-success';
}
```

### PivotPlanNodeCompensationStrategy

```ts
export interface PivotPlanNodeCompensationStrategy {
  order?: 'forward' | 'reverse';
  stopOnFailure?: boolean;
}
```

### PivotPlanNodeRetry

```ts
export interface PivotPlanNodeRetry {
  maxAttempts?: number;
  delayMs?: number;
  backoff?: 'fixed' | 'linear' | 'exponential';
  maxDelayMs?: number;
}
```

### PivotPlanNodeTimeout

```ts
export interface PivotPlanNodeTimeout {
  ms?: number;
}
```

### PivotPlanEdge

```ts
export interface PivotPlanEdge {
  from: string;
  to: string;
  condition?: PivotPlanEdgeCondition;
  metadata?: Record<string, unknown>;
}
```

### PivotPlanEdgeCondition

```ts
export type PivotPlanEdgeCondition =
  | 'always'
  | 'success'
  | 'failure'
  | 'skipped'
  | {
      ok?: boolean;
      skipped?: boolean;
      path?: string;
      exists?: boolean;
      equals?: unknown;
      notEquals?: unknown;
      in?: unknown[];
    };
```

### PivotPlan

```ts
export interface PivotPlan {
  id: string;
  intent: string;
  nodes: PivotPlanNode[];
  edges: PivotPlanEdge[];
  metadata: Record<string, unknown>;
}
```

### PivotPlanValidationResult

```ts
export interface PivotPlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### PivotPlanValidationOptions

```ts
export interface PivotPlanValidationOptions {
  maxNodes?: number;
  maxEdges?: number;
}
```

### createPlan

```ts
export function createPlan(input?: Partial<PivotPlan>): PivotPlan;
```

### addNode

```ts
export function addNode(plan: PivotPlan, node: PivotPlanNode): PivotPlan;
```

### addEdge

```ts
export function addEdge(plan: PivotPlan, edge: PivotPlanEdge): PivotPlan;
```

### validatePlan

```ts
export function validatePlan(plan: unknown, options?: PivotPlanValidationOptions): PivotPlanValidationResult;
```

### getExecutionOrder

```ts
export function getExecutionOrder(plan: PivotPlan): PivotPlanNode[];
```

### getExecutionLayers

```ts
export function getExecutionLayers(plan: PivotPlan): PivotPlanNode[][];
```

### evaluatePlanEdgeCondition

```ts
export function evaluatePlanEdgeCondition(edge: PivotPlanEdge, sourceResult: unknown): boolean;
```

## @kupola/pivot-ui

Trusted UI adapter types and HTML renderers.

### TrustedUIConfirmInput

```ts
export interface TrustedUIConfirmInput {
  command: PivotCommand;
  capability: PivotCapability;
  policy: PolicyResult;
  context: PivotExecutionContext;
}
```

### TrustedUIApproveInput

```ts
export interface TrustedUIApproveInput {
  plan: PivotPlan;
  node: PivotPlanNode;
  context: PivotExecutionContext;
  approval: Record<string, unknown>;
}
```

### TrustedUIAdapter

```ts
export interface TrustedUIAdapter {
  showMessage(message: string, options?: Record<string, unknown>): void;
  showResult(result: PivotResult): void;
  confirm(input: TrustedUIConfirmInput): boolean | Promise<boolean>;
  approve(input: TrustedUIApproveInput): boolean | Promise<boolean>;
  openAssistant(options?: Record<string, unknown>): void;
  closeAssistant(): void;
}
```

### PivotCapabilityFilter

```ts
export interface PivotCapabilityFilter {
  resource?: string;
  action?: string;
  permission?: string;
  permissions?: string[];
  domain?: string;
  group?: string;
  version?: string;
  risk?: string;
  tag?: string;
  tags?: string[];
  dependency?: string;
  dependencies?: string[];
  requiresConfirmation?: boolean;
  allowUnknownParams?: boolean;
}
```

### PivotCapabilityBrowserOptions

```ts
export interface PivotCapabilityBrowserOptions {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  query?: string;
  filter?: PivotCapabilityFilter;
  ariaLabel?: string;
  liveRegion?: boolean;
}
```

### PivotPlanPreviewNode

```ts
export interface PivotPlanPreviewNode {
  node: PivotPlanNode;
  command: PivotCommand | null;
  preview: PivotResult;
}
```

### PivotPlanPreviewData

```ts
export interface PivotPlanPreviewData {
  plan: PivotPlan;
  nodes: PivotPlanPreviewNode[];
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
}
```

### PivotPlanGraphPreviewNode

```ts
export interface PivotPlanGraphPreviewNode {
  node: PivotPlanNode;
  command: PivotCommand | null;
  preview: PivotResult;
}
```

### PivotPlanGraphPreviewData

```ts
export interface PivotPlanGraphPreviewData {
  plan: PivotPlan;
  nodes: PivotPlanGraphPreviewNode[];
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
}
```

### PivotPlanGraphInput

```ts
export type PivotPlanGraphInput = PivotPlan | PivotPlanGraphPreviewData | PivotResult<PivotPlanGraphPreviewData>;
```

### PivotPlanGraphOptions

```ts
export interface PivotPlanGraphOptions {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  showEdges?: boolean;
  includeEdgeList?: boolean;
  ariaLabel?: string;
  liveRegion?: boolean;
}
```

### PivotPlanPreviewOptions

```ts
export interface PivotPlanPreviewOptions {
  className?: string;
  includeTimeline?: boolean;
  includeNodes?: boolean;
  emptyText?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}
```

### createTrustedUIAdapter

```ts
export function createTrustedUIAdapter(adapter?: Partial<TrustedUIAdapter>): TrustedUIAdapter;
```

### renderTimelineToHTML

```ts
export function renderTimelineToHTML(timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
  ariaLabel?: string;
}): string;
```

### renderResultToHTML

```ts
export function renderResultToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  ariaLabel?: string;
}): string;
```

### renderTimelineDetailToHTML

```ts
export function renderTimelineDetailToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
  ariaLabel?: string;
}): string;
```

### renderAuditViewerToHTML

```ts
export function renderAuditViewerToHTML(audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
}): string;
```

### renderCapabilityBrowserToHTML

```ts
export function renderCapabilityBrowserToHTML(capabilities?: PivotCapability[], options?: PivotCapabilityBrowserOptions): string;
```

### renderPlanPreviewToHTML

```ts
export function renderPlanPreviewToHTML(preview: PivotResult<PivotPlanPreviewData>, options?: PivotPlanPreviewOptions): string;
```

### renderPlanGraphToHTML

```ts
export function renderPlanGraphToHTML(plan: PivotPlanGraphInput, options?: PivotPlanGraphOptions): string;
```

### mountTimeline

```ts
export function mountTimeline<TElement extends Element>(target: string | TElement, timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
```

### mountResult

```ts
export function mountResult<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
```

### mountTimelineDetail

```ts
export function mountTimelineDetail<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
```

### mountAuditViewer

```ts
export function mountAuditViewer<TElement extends Element>(target: string | TElement, audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
```

### mountCapabilityBrowser

```ts
export function mountCapabilityBrowser<TElement extends Element>(target: string | TElement, capabilities?: PivotCapability[], options?: PivotCapabilityBrowserOptions): TElement | Element;
```

### mountPlanGraph

```ts
export function mountPlanGraph<TElement extends Element>(target: string | TElement, plan: PivotPlanGraphInput, options?: PivotPlanGraphOptions): TElement | Element;
```

### mountPlanPreview

```ts
export function mountPlanPreview<TElement extends Element>(target: string | TElement, preview: PivotResult<PivotPlanPreviewData>, options?: PivotPlanPreviewOptions): TElement | Element;
```

## @kupola/pivot

Core runtime composition layer and top-level re-exports.

### Re-exports

```ts
export * from '@kupola/pivot-protocol';
export * from '@kupola/pivot-policy';
export * from '@kupola/pivot-orchestrator';
export * from '@kupola/pivot-ui';
```

### CapabilityRegistry

```ts
export interface CapabilityRegistry {
  register(capability: Partial<PivotCapability>): PivotCapability;
  unregister(name: string): boolean;
  get(name: string): PivotCapability | null;
  has(name: string): boolean;
  list(filter?: PivotCapabilityFilter): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  size(): number;
}
```

### PivotExplainTimelineStep

```ts
export interface PivotExplainTimelineStep {
  stage: string;
  status: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}
```

### PivotCommandPreviewData

```ts
export interface PivotCommandPreviewData {
  command: PivotCommand;
  capability: Omit<PivotCapability, 'execute' | 'dryRun'>;
  policy: unknown;
  requiresConfirmation: boolean;
}
```

### PivotCommandSimulationData

```ts
export interface PivotCommandSimulationData extends PivotCommandPreviewData {
  simulation: unknown;
}
```

### PivotExplain

```ts
export interface PivotExplain {
  timeline?: PivotExplainTimelineStep[];
  [key: string]: unknown;
}
```

### createCapabilityRegistry

```ts
export function createCapabilityRegistry(options?: {
  onDuplicate?: 'replace' | 'error';
}): CapabilityRegistry;
```

### PivotAuditSink

```ts
export type PivotAuditSink = (event: PivotAuditEvent) => void | Promise<void>;
```

### parseStructuredCommandOutput

```ts
export function parseStructuredCommandOutput(output: unknown): PivotResult<{
  command: PivotCommand;
  source: unknown;
}>;
```

### parseStructuredPlanOutput

```ts
export function parseStructuredPlanOutput(output: unknown): PivotResult<{
  plan: PivotPlan;
  source: unknown;
}>;
```

### PivotRuntime

```ts
export interface PivotRuntime {
  registry: CapabilityRegistry;
  ui: TrustedUIAdapter;
  registerCapability(capability: Partial<PivotCapability>): PivotCapability;
  getCapability(name: string): PivotCapability | null;
  listCapabilities(filter?: PivotCapabilityFilter): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  previewCommand(command: PivotCommand, context?: PivotExecutionContext): Promise<PivotResult<PivotCommandPreviewData>>;
  simulateCommand(command: PivotCommand, context?: PivotExecutionContext, options?: {
    timeoutMs?: number;
  }): Promise<PivotResult<PivotCommandSimulationData>>;
  previewPlan(plan: PivotPlan, context?: PivotExecutionContext): Promise<PivotResult<PivotPlanPreviewData>>;
  executeCommand<TData = unknown>(command: PivotCommand, context?: PivotExecutionContext, options?: {
    retry?: PivotPlanNodeRetry;
    timeoutMs?: number;
  }): Promise<PivotResult<TData>>;
  executePlan(plan: PivotPlan, context?: PivotExecutionContext, options?: {
    stopOnError?: boolean;
    compensateOnError?: boolean;
  }): Promise<PivotResult<PivotPlanExecutionData>>;
  getAuditEvents(): PivotAuditEvent[];
}
```

### PivotPlanExecutionNodeResult

```ts
export interface PivotPlanExecutionNodeResult {
  node: PivotPlanNode;
  command: PivotCommand | null;
  result: PivotResult;
}
```

### PivotPlanExecutionCompensationResult

```ts
export interface PivotPlanExecutionCompensationResult {
  node: PivotPlanNode;
  command: PivotCommand | null;
  result: PivotResult;
}
```

### PivotPlanExecutionData

```ts
export interface PivotPlanExecutionData {
  plan: PivotPlan;
  nodes: PivotPlanExecutionNodeResult[];
  compensations: PivotPlanExecutionCompensationResult[];
  status: 'executed' | 'failed';
}
```

### createPivotRuntime

```ts
export function createPivotRuntime(options?: {
  registry?: CapabilityRegistry;
  capabilityRegistry?: { onDuplicate?: 'replace' | 'error' };
  policies?: PivotPolicy[];
  policyPipeline?: { evaluate(input: unknown): Promise<unknown> };
  planLimits?: PivotPlanValidationOptions;
  ui?: Partial<TrustedUIAdapter>;
  onAudit?: (event: PivotAuditEvent) => void | Promise<void>;
  auditSinks?: PivotAuditSink[];
}): PivotRuntime;
```
