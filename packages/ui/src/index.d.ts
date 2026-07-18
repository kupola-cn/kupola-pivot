import type { PivotCapability, PivotCommand, PivotExecutionContext, PivotResult } from '@kupola/pivot-protocol';
import type { PolicyResult } from '@kupola/pivot-policy';
import type { PivotPlan, PivotPlanNode } from '@kupola/pivot-orchestrator';

export interface TrustedUIConfirmInput {
  command: PivotCommand;
  capability: PivotCapability;
  policy: PolicyResult;
  context: PivotExecutionContext;
}

export interface TrustedUIApproveInput {
  plan: PivotPlan;
  node: PivotPlanNode;
  context: PivotExecutionContext;
  approval: Record<string, unknown>;
}

export interface TrustedUIAdapter {
  showMessage(message: string, options?: Record<string, unknown>): void;
  showResult(result: PivotResult): void;
  confirm(input: TrustedUIConfirmInput): boolean | Promise<boolean>;
  approve(input: TrustedUIApproveInput): boolean | Promise<boolean>;
  openAssistant(options?: Record<string, unknown>): void;
  closeAssistant(): void;
}

export function createTrustedUIAdapter(adapter?: Partial<TrustedUIAdapter>): TrustedUIAdapter;
export function renderTimelineToHTML(timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
}): string;
export function renderResultToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
}): string;
export function renderTimelineDetailToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
}): string;
export function renderPlanPreviewToHTML(preview: PivotResult<{
  plan: PivotPlan;
  nodes: Array<{
    node: PivotPlanNode;
    command: PivotCommand | null;
    preview: PivotResult;
  }>;
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
}>, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeNodes?: boolean;
  emptyText?: string;
}): string;
export function mountTimeline<TElement extends Element>(target: string | TElement, timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
}): TElement | Element;
export function mountResult<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
}): TElement | Element;
export function mountTimelineDetail<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
}): TElement | Element;
export function mountPlanPreview<TElement extends Element>(target: string | TElement, preview: PivotResult<{
  plan: PivotPlan;
  nodes: Array<{
    node: PivotPlanNode;
    command: PivotCommand | null;
    preview: PivotResult;
  }>;
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
}>, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeNodes?: boolean;
  emptyText?: string;
}): TElement | Element;
