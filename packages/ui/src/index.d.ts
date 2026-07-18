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

export interface PivotPlanPreviewNode {
  node: PivotPlanNode;
  command: PivotCommand | null;
  preview: PivotResult;
}

export interface PivotPlanPreviewData {
  plan: PivotPlan;
  nodes: PivotPlanPreviewNode[];
  status: 'ready' | 'blocked';
  requiresConfirmation: boolean;
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

export type PivotPlanGraphInput = PivotPlan | PivotPlanGraphPreviewData | PivotResult<PivotPlanGraphPreviewData>;

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

export interface PivotPlanPreviewOptions {
  className?: string;
  includeTimeline?: boolean;
  includeNodes?: boolean;
  emptyText?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}

export function createTrustedUIAdapter(adapter?: Partial<TrustedUIAdapter>): TrustedUIAdapter;
export function renderTimelineToHTML(timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
  ariaLabel?: string;
}): string;
export function renderResultToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  ariaLabel?: string;
}): string;
export function renderTimelineDetailToHTML(result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
  ariaLabel?: string;
}): string;
export function renderAuditViewerToHTML(audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
}): string;
export function renderCapabilityBrowserToHTML(capabilities?: PivotCapability[], options?: PivotCapabilityBrowserOptions): string;
export function renderPlanPreviewToHTML(preview: PivotResult<PivotPlanPreviewData>, options?: PivotPlanPreviewOptions): string;
export function renderPlanGraphToHTML(plan: PivotPlanGraphInput, options?: PivotPlanGraphOptions): string;
export function mountTimeline<TElement extends Element>(target: string | TElement, timeline?: unknown[], options?: {
  className?: string;
  emptyText?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
export function mountResult<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
export function mountTimelineDetail<TElement extends Element>(target: string | TElement, result: PivotResult, options?: {
  className?: string;
  includeTimeline?: boolean;
  includeAudit?: boolean;
  emptyText?: string;
  title?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
export function mountAuditViewer<TElement extends Element>(target: string | TElement, audits?: PivotAuditEvent[], options?: {
  className?: string;
  emptyText?: string;
  title?: string;
  message?: string;
  ariaLabel?: string;
  liveRegion?: boolean;
}): TElement | Element;
export function mountCapabilityBrowser<TElement extends Element>(target: string | TElement, capabilities?: PivotCapability[], options?: PivotCapabilityBrowserOptions): TElement | Element;
export function mountPlanGraph<TElement extends Element>(target: string | TElement, plan: PivotPlanGraphInput, options?: PivotPlanGraphOptions): TElement | Element;
export function mountPlanPreview<TElement extends Element>(target: string | TElement, preview: PivotResult<PivotPlanPreviewData>, options?: PivotPlanPreviewOptions): TElement | Element;
