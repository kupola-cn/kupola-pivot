export function createPlan(input = {}) {
  return {
    id: input.id ?? createId('plan'),
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

export function validatePlan(plan) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(plan)) {
    return { valid: false, errors: ['Plan must be a plain object.'], warnings };
  }

  if (typeof plan.id !== 'string' || plan.id.trim() === '') {
    errors.push('Plan id is required.');
  }

  if (!Array.isArray(plan.nodes)) {
    errors.push('Plan nodes must be an array.');
  }

  if (!Array.isArray(plan.edges)) {
    errors.push('Plan edges must be an array.');
  }

  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  const nodeIds = new Set();

  for (const node of plan.nodes) {
    if (!node?.id) {
      errors.push('Plan node id is required.');
      continue;
    }

    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate plan node id: ${node.id}`);
    }

    nodeIds.add(node.id);
  }

  for (const edge of plan.edges) {
    if (!nodeIds.has(edge.from)) {
      errors.push(`Plan edge references unknown from node: ${edge.from}`);
    }

    if (!nodeIds.has(edge.to)) {
      errors.push(`Plan edge references unknown to node: ${edge.to}`);
    }
  }

  if (errors.length === 0 && hasCycle(plan)) {
    errors.push('Plan contains a cycle.');
  }

  if (plan.nodes.length === 0) {
    warnings.push('Plan has no nodes.');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function getExecutionOrder(plan) {
  const validation = validatePlan(plan);

  if (!validation.valid) {
    throw new Error(`Invalid plan: ${validation.errors.join('; ')}`);
  }

  const nodesById = new Map(plan.nodes.map((node) => [node.id, node]));
  const incomingCount = new Map(plan.nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(plan.nodes.map((node) => [node.id, []]));

  for (const edge of plan.edges) {
    incomingCount.set(edge.to, incomingCount.get(edge.to) + 1);
    outgoing.get(edge.from).push(edge.to);
  }

  const queue = plan.nodes.filter((node) => incomingCount.get(node.id) === 0).map((node) => node.id);
  const ordered = [];

  while (queue.length > 0) {
    const id = queue.shift();
    ordered.push(nodesById.get(id));

    for (const nextId of outgoing.get(id)) {
      incomingCount.set(nextId, incomingCount.get(nextId) - 1);

      if (incomingCount.get(nextId) === 0) {
        queue.push(nextId);
      }
    }
  }

  return ordered;
}

function hasCycle(plan) {
  const visiting = new Set();
  const visited = new Set();
  const outgoing = new Map(plan.nodes.map((node) => [node.id, []]));

  for (const edge of plan.edges) {
    outgoing.get(edge.from)?.push(edge.to);
  }

  const visit = (id) => {
    if (visiting.has(id)) {
      return true;
    }

    if (visited.has(id)) {
      return false;
    }

    visiting.add(id);

    for (const nextId of outgoing.get(id) ?? []) {
      if (visit(nextId)) {
        return true;
      }
    }

    visiting.delete(id);
    visited.add(id);
    return false;
  };

  return plan.nodes.some((node) => visit(node.id));
}

let idCounter = 0;

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  idCounter += 1;
  return `${prefix}:${Date.now()}:${idCounter}`;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
