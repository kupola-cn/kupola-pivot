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

export function validatePlan(plan, options = {}) {
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

  const maxNodes = normalizeLimit(options.maxNodes);
  const maxEdges = normalizeLimit(options.maxEdges);

  if (maxNodes !== null && plan.nodes.length > maxNodes) {
    errors.push(`Plan node count exceeds limit: ${plan.nodes.length}/${maxNodes}`);
  }

  if (maxEdges !== null && plan.edges.length > maxEdges) {
    errors.push(`Plan edge count exceeds limit: ${plan.edges.length}/${maxEdges}`);
  }

  const nodeIds = new Set();

  for (const node of plan.nodes) {
    if (!node?.id) {
      errors.push('Plan node id is required.');
      continue;
    }

    validateNodeContracts(node, errors);

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

    validateEdgeCondition(edge.condition, errors);
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
  return getExecutionLayers(plan).flat();
}

export function getExecutionLayers(plan) {
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

  let queue = plan.nodes.filter((node) => incomingCount.get(node.id) === 0).map((node) => node.id);
  const layers = [];

  while (queue.length > 0) {
    const currentLayer = queue.map((id) => nodesById.get(id));
    layers.push(currentLayer);
    const nextQueue = [];

    for (const id of queue) {
      for (const nextId of outgoing.get(id)) {
        incomingCount.set(nextId, incomingCount.get(nextId) - 1);

        if (incomingCount.get(nextId) === 0) {
          nextQueue.push(nextId);
        }
      }
    }

    queue = nextQueue;
  }

  return layers;
}

export function evaluatePlanEdgeCondition(edge, sourceResult) {
  const condition = edge?.condition;

  if (condition === undefined || condition === null || condition === '' || condition === 'always') {
    return true;
  }

  if (condition === 'success') {
    return Boolean(sourceResult?.ok);
  }

  if (condition === 'failure') {
    return sourceResult?.ok === false;
  }

  if (condition === 'skipped') {
    return Boolean(sourceResult?.data?.skipped);
  }

  if (!isPlainObject(condition)) {
    return false;
  }

  if (typeof condition.ok === 'boolean' && sourceResult?.ok !== condition.ok) {
    return false;
  }

  if (typeof condition.skipped === 'boolean' && Boolean(sourceResult?.data?.skipped) !== condition.skipped) {
    return false;
  }

  if (typeof condition.path !== 'string' || condition.path.trim() === '') {
    return true;
  }

  const pathResult = getPath(sourceResult, condition.path);

  if (typeof condition.exists === 'boolean' && pathResult.found !== condition.exists) {
    return false;
  }

  if (Object.hasOwn(condition, 'equals') && pathResult.value !== condition.equals) {
    return false;
  }

  if (Object.hasOwn(condition, 'notEquals') && pathResult.value === condition.notEquals) {
    return false;
  }

  if (Array.isArray(condition.in) && !condition.in.includes(pathResult.value)) {
    return false;
  }

  return true;
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

function normalizeLimit(limit) {
  return Number.isInteger(limit) && limit >= 0 ? limit : null;
}

function validateEdgeCondition(condition, errors) {
  if (condition === undefined || condition === null || condition === '') {
    return;
  }

  if (typeof condition === 'string') {
    if (!['always', 'success', 'failure', 'skipped'].includes(condition)) {
      errors.push(`Unknown plan edge condition: ${condition}`);
    }

    return;
  }

  if (!isPlainObject(condition)) {
    errors.push('Plan edge condition must be a string or plain object.');
    return;
  }

  const allowedFields = new Set(['ok', 'skipped', 'path', 'exists', 'equals', 'notEquals', 'in']);
  const operatorFields = ['ok', 'skipped', 'exists', 'equals', 'notEquals', 'in'];
  const hasOperator = operatorFields.some((field) => Object.hasOwn(condition, field));

  for (const field of Object.keys(condition)) {
    if (!allowedFields.has(field)) {
      errors.push(`Unknown plan edge condition field: ${field}`);
    }
  }

  if (!hasOperator) {
    errors.push('Plan edge condition must include at least one operator.');
  }

  if (condition.ok !== undefined && typeof condition.ok !== 'boolean') {
    errors.push('Plan edge condition ok must be a boolean.');
  }

  if (condition.skipped !== undefined && typeof condition.skipped !== 'boolean') {
    errors.push('Plan edge condition skipped must be a boolean.');
  }

  if (condition.path !== undefined && (typeof condition.path !== 'string' || condition.path.trim() === '')) {
    errors.push('Plan edge condition path must be a non-empty string.');
  }

  if (condition.exists !== undefined && typeof condition.exists !== 'boolean') {
    errors.push('Plan edge condition exists must be a boolean.');
  }

  if (condition.in !== undefined && !Array.isArray(condition.in)) {
    errors.push('Plan edge condition in must be an array.');
  }
}

function validateNodeContracts(node, errors) {
  const fields = [
    ['command', node.command],
    ['input', node.input],
    ['params', node.params],
    ['inputSchema', node.inputSchema],
    ['outputSchema', node.outputSchema],
    ['retry', node.retry],
    ['timeout', node.timeout],
    ['approval', node.approval],
    ['compensate', node.compensate],
    ['metadata', node.metadata]
  ];

  for (const [field, value] of fields) {
    if (value !== undefined && !isPlainObject(value)) {
      errors.push(`Plan node ${field} must be a plain object.`);
    }
  }
}

function getPath(value, path) {
  const segments = path.split('.').filter(Boolean);
  let current = value;

  for (const segment of segments) {
    if (current === null || current === undefined || !Object.hasOwn(Object(current), segment)) {
      return { found: false, value: undefined };
    }

    current = current[segment];
  }

  return { found: true, value: current };
}
