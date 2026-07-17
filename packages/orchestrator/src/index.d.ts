export interface PivotPlanNode {
  id: string;
  type?: string;
  capability?: string;
  command?: unknown;
  params?: Record<string, unknown>;
  risk?: string;
  intent?: string;
  compensate?: {
    capability?: string;
    command?: unknown;
    intent?: string;
    risk?: string;
    params?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  compensateCapability?: string;
  metadata?: Record<string, unknown>;
}

export interface PivotPlanEdge {
  from: string;
  to: string;
  condition?: string;
  metadata?: Record<string, unknown>;
}

export interface PivotPlan {
  id: string;
  intent: string;
  nodes: PivotPlanNode[];
  edges: PivotPlanEdge[];
  metadata: Record<string, unknown>;
}

export interface PivotPlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function createPlan(input?: Partial<PivotPlan>): PivotPlan;
export function addNode(plan: PivotPlan, node: PivotPlanNode): PivotPlan;
export function addEdge(plan: PivotPlan, edge: PivotPlanEdge): PivotPlan;
export function validatePlan(plan: unknown): PivotPlanValidationResult;
export function getExecutionOrder(plan: PivotPlan): PivotPlanNode[];
