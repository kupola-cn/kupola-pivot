export const PIVOT_PROTOCOL_VERSION: '0.1.0';
export const CAPABILITY_MANIFEST_VERSION: '0.1.0';

export const ActionType: Readonly<{
  QUERY: 'query';
  CREATE: 'create';
  UPDATE: 'update';
  DELETE: 'delete';
  EXECUTE: 'execute';
  FLOW: 'flow';
}>;

export type ActionTypeValue = (typeof ActionType)[keyof typeof ActionType];

export const RiskLevel: Readonly<{
  LOW: 'low';
  MEDIUM: 'medium';
  HIGH: 'high';
  CRITICAL: 'critical';
}>;

export type RiskLevelValue = (typeof RiskLevel)[keyof typeof RiskLevel];

export const CommandStatus: Readonly<{
  DRAFT: 'draft';
  VALIDATED: 'validated';
  BLOCKED: 'blocked';
  CONFIRMED: 'confirmed';
  EXECUTED: 'executed';
  REJECTED: 'rejected';
  FAILED: 'failed';
}>;

export type CommandStatusValue = (typeof CommandStatus)[keyof typeof CommandStatus];

export const FieldType: Readonly<{
  STRING: 'string';
  NUMBER: 'number';
  BOOLEAN: 'boolean';
  ARRAY: 'array';
  OBJECT: 'object';
  DATE: 'date';
  ENUM: 'enum';
}>;

export type FieldTypeValue = (typeof FieldType)[keyof typeof FieldType];

export interface FieldRule {
  type?: FieldTypeValue;
  required?: boolean;
  options?: unknown[];
  sensitive?: boolean;
}

export type ParamsSchema = Record<string, FieldTypeValue | FieldRule>;

export interface PivotCapabilityDependency {
  capability: string;
  version?: string;
  optional?: boolean;
  description?: string;
}

export interface PivotCapabilityExample {
  label?: string;
  description?: string;
  params?: Record<string, unknown>;
  command?: Partial<PivotCommand>;
  output?: unknown;
}

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

export interface PivotExecutionContext {
  actor?: unknown;
  permissions?: string[];
  auditMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export type PivotCapabilityExecutor = (input: {
  command: PivotCommand;
  params: Record<string, unknown>;
  context: PivotExecutionContext;
}) => unknown | Promise<unknown>;

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

export interface PivotResult<TData = unknown> {
  ok: boolean;
  data: TData | null;
  message: string;
  explain: unknown;
  audit: PivotAuditEvent | null;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function createCommand(input?: Partial<PivotCommand>): PivotCommand;
export function createCapability(input?: Partial<PivotCapability>): PivotCapability;
export function createCapabilityManifest(input?: Partial<PivotCapabilityManifest>): PivotCapabilityManifest;
export function createResult<TData = unknown>(input?: Partial<PivotResult<TData>>): PivotResult<TData>;
export function createAuditEvent(input?: Partial<PivotAuditEvent>): PivotAuditEvent;
export function createValidationResult(errors?: string[], warnings?: string[]): ValidationResult;
export function validateCommand(command: unknown, options?: { capabilities?: Map<string, PivotCapability> }): ValidationResult;
export function validateParams(params?: Record<string, unknown>, schema?: ParamsSchema, options?: { allowUnknown?: boolean }): ValidationResult;
export function redactParams(params?: Record<string, unknown>, schema?: ParamsSchema, options?: {
  redactedValue?: unknown;
  sensitiveNames?: string[];
}): Record<string, unknown>;
export function validateCapability(capability: unknown): ValidationResult;
export function validateCapabilityManifest(capability: unknown): ValidationResult;
