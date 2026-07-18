export * from '@kupola/pivot-protocol';
export * from '@kupola/pivot-policy';
export * from '@kupola/pivot-orchestrator';
export * from '@kupola/pivot-ui';

import type {
  PivotAuditEvent,
  PivotCapability,
  PivotCommand,
  PivotExecutionContext,
  PivotResult,
  ValidationResult
} from '@kupola/pivot-protocol';
import type { PivotPolicy } from '@kupola/pivot-policy';
import type { PivotPlan, PivotPlanNode, PivotPlanNodeRetry, PivotPlanValidationOptions } from '@kupola/pivot-orchestrator';
import type { PivotCapabilityFilter, PivotPlanPreviewData, TrustedUIAdapter } from '@kupola/pivot-ui';

export interface CapabilityRegistry {
  register(capability: Partial<PivotCapability>): PivotCapability;
  unregister(name: string): boolean;
  get(name: string): PivotCapability | null;
  has(name: string): boolean;
  list(filter?: PivotCapabilityFilter): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  size(): number;
}

export interface PivotExplainTimelineStep {
  stage: string;
  status: string;
  message: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export interface PivotExplain {
  timeline?: PivotExplainTimelineStep[];
  [key: string]: unknown;
}

export function createCapabilityRegistry(options?: {
  onDuplicate?: 'replace' | 'error';
}): CapabilityRegistry;

export type PivotAuditSink = (event: PivotAuditEvent) => void | Promise<void>;
export function parseStructuredCommandOutput(output: unknown): PivotResult<{
  command: PivotCommand;
  source: unknown;
}>;
export function parseStructuredPlanOutput(output: unknown): PivotResult<{
  plan: PivotPlan;
  source: unknown;
}>;

export interface PivotRuntime {
  registry: CapabilityRegistry;
  ui: TrustedUIAdapter;
  registerCapability(capability: Partial<PivotCapability>): PivotCapability;
  getCapability(name: string): PivotCapability | null;
  listCapabilities(filter?: PivotCapabilityFilter): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  previewCommand(command: PivotCommand, context?: PivotExecutionContext): Promise<PivotResult<{
    command: PivotCommand;
    capability: Omit<PivotCapability, 'execute'>;
    policy: unknown;
    requiresConfirmation: boolean;
  }>>;
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

export interface PivotPlanExecutionNodeResult {
  node: PivotPlanNode;
  command: PivotCommand | null;
  result: PivotResult;
}

export interface PivotPlanExecutionCompensationResult {
  node: PivotPlanNode;
  command: PivotCommand | null;
  result: PivotResult;
}

export interface PivotPlanExecutionData {
  plan: PivotPlan;
  nodes: PivotPlanExecutionNodeResult[];
  compensations: PivotPlanExecutionCompensationResult[];
  status: 'executed' | 'failed';
}

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
