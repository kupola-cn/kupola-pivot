import type { PivotAuditEvent, PivotCapability, PivotCommand, PivotExecutionContext, PivotResult } from '@kupola/pivot-protocol';
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

export interface PivotPlanGraphPreviewNode {
  node: PivotPlanNode;
  command: PivotCommand | null;
  preview: PivotResult;
}

export interface PivotPlanGraphPreviewData {
  plan: PivotPlan;
  nodes: PivotPlanGraphPreviewNode[];
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
}

export interface PivotPlanGraphOptions {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  showEdges?: boolean;
  includeEdgeList?: boolean;
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
export function renderAuditViewerToHTML(audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
}): string;
export function renderCapabilityBrowserToHTML(capabilities?: PivotCapability[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  query?: string;
  filter?: {
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
  };
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
export function renderPlanGraphToHTML(plan: PivotPlan | PivotPlanGraphPreviewData | PivotResult<PivotPlanGraphPreviewData>, options?: PivotPlanGraphOptions): string;
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
export function mountAuditViewer<TElement extends Element>(target: string | TElement, audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
}): TElement | Element;
export function mountCapabilityBrowser<TElement extends Element>(target: string | TElement, capabilities?: PivotCapability[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  query?: string;
  filter?: {
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
  };
}): TElement | Element;
export function mountPlanGraph<TElement extends Element>(target: string | TElement, plan: PivotPlan | PivotPlanGraphPreviewData | PivotResult<PivotPlanGraphPreviewData>, options?: PivotPlanGraphOptions): TElement | Element;
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
