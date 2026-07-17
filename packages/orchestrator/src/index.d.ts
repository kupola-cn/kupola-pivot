export interface PivotPlanNode {
  id: string;
  type?: string;
  capability?: string;
  params?: Record<string, unknown>;
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

export function createPlan(input?: Partial<PivotPlan>): PivotPlan;
export function addNode(plan: PivotPlan, node: PivotPlanNode): PivotPlan;
export function addEdge(plan: PivotPlan, edge: PivotPlanEdge): PivotPlan;
