import type { PivotCapability, PivotCommand, PivotExecutionContext, RiskLevelValue } from '@kupola/pivot-protocol';

export const PolicyDecision: Readonly<{
  ALLOW: 'allow';
  DENY: 'deny';
  CONFIRM: 'confirm';
  ESCALATE: 'escalate';
}>;

export type PolicyDecisionValue = (typeof PolicyDecision)[keyof typeof PolicyDecision];

export interface PolicyResult {
  decision: PolicyDecisionValue;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyContext {
  command: PivotCommand;
  capability: PivotCapability;
  context: PivotExecutionContext;
}

export type PivotPolicy = (context: PolicyContext) => PolicyResult | void | Promise<PolicyResult | void>;

export function allow(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
export function deny(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
export function confirm(reason?: string, metadata?: Record<string, unknown>): PolicyResult;
export function escalate(reason?: string, metadata?: Record<string, unknown>): PolicyResult;

export function createPolicyPipeline(policies?: PivotPolicy[]): {
  evaluate(context: PolicyContext): Promise<PolicyResult>;
};

export function createPermissionPolicy(options?: {
  getPermissions?: (context: PolicyContext) => string[];
  mode?: 'all' | 'any';
}): PivotPolicy;

export function createRiskPolicy(options?: {
  confirmAt?: RiskLevelValue[];
  escalateAt?: RiskLevelValue[];
}): PivotPolicy;

export function createSensitiveResourcePolicy(options?: {
  resources?: string[];
  actions?: string[];
  decision?: 'confirm' | 'escalate' | 'deny';
}): PivotPolicy;

export function mapHttpStatusToPolicy(status: number, message?: string): PolicyResult | null;
