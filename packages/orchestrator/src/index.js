export function createPlan(input = {}) {
  return {
    id: input.id ?? `plan:${Date.now()}`,
    intent: input.intent ?? '',
    nodes: input.nodes ?? [],
    edges: input.edges ?? [],
    metadata: input.metadata ?? {}
  };
}

export function addNode(plan, node) {
  return {
    ...plan,
    nodes: [...plan.nodes, node]
  };
}

export function addEdge(plan, edge) {
  return {
    ...plan,
    edges: [...plan.edges, edge]
  };
}
