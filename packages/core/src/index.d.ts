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
import type { TrustedUIAdapter } from '@kupola/pivot-ui';

export interface CapabilityRegistry {
  register(capability: Partial<PivotCapability>): PivotCapability;
  unregister(name: string): boolean;
  get(name: string): PivotCapability | null;
  has(name: string): boolean;
  list(filter?: { resource?: string; action?: string; permission?: string }): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  size(): number;
}

export function createCapabilityRegistry(options?: {
  onDuplicate?: 'replace' | 'error';
}): CapabilityRegistry;

export interface PivotRuntime {
  registry: CapabilityRegistry;
  ui: TrustedUIAdapter;
  registerCapability(capability: Partial<PivotCapability>): PivotCapability;
  getCapability(name: string): PivotCapability | null;
  listCapabilities(filter?: { resource?: string; action?: string; permission?: string }): PivotCapability[];
  validateCommand(command: PivotCommand): ValidationResult;
  previewCommand(command: PivotCommand, context?: PivotExecutionContext): Promise<PivotResult<{
    command: PivotCommand;
    capability: Omit<PivotCapability, 'execute'>;
    policy: unknown;
    requiresConfirmation: boolean;
  }>>;
  executeCommand<TData = unknown>(command: PivotCommand, context?: PivotExecutionContext): Promise<PivotResult<TData>>;
  getAuditEvents(): PivotAuditEvent[];
}

export function createPivotRuntime(options?: {
  registry?: CapabilityRegistry;
  capabilityRegistry?: { onDuplicate?: 'replace' | 'error' };
  policies?: PivotPolicy[];
  policyPipeline?: { evaluate(input: unknown): Promise<unknown> };
  ui?: Partial<TrustedUIAdapter>;
  onAudit?: (event: PivotAuditEvent) => void;
}): PivotRuntime;
