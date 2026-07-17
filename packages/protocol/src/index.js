export const PIVOT_PROTOCOL_VERSION = '0.1.0';

export const ActionType = Object.freeze({
  QUERY: 'query',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXECUTE: 'execute',
  FLOW: 'flow'
});

export const RiskLevel = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

export const CommandStatus = Object.freeze({
  DRAFT: 'draft',
  VALIDATED: 'validated',
  BLOCKED: 'blocked',
  CONFIRMED: 'confirmed',
  EXECUTED: 'executed',
  REJECTED: 'rejected',
  FAILED: 'failed'
});

export const FieldType = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  DATE: 'date',
  ENUM: 'enum'
});

export function createCommand(input = {}) {
  return {
    protocolVersion: PIVOT_PROTOCOL_VERSION,
    id: input.id ?? createId('cmd'),
    intent: '',
    resource: '',
    action: '',
    capability: '',
    status: CommandStatus.DRAFT,
    risk: RiskLevel.LOW,
    params: {},
    metadata: {},
    ...input
  };
}

export function createCapability(input = {}) {
  return {
    name: '',
    resource: '',
    action: '',
    risk: RiskLevel.LOW,
    description: '',
    paramsSchema: {},
    allowUnknownParams: false,
    permissions: [],
    requiresConfirmation: false,
    execute: null,
    metadata: {},
    ...input
  };
}

export function createResult(input = {}) {
  return {
    ok: false,
    data: null,
    message: '',
    explain: null,
    audit: null,
    ...input
  };
}

export function createAuditEvent(input = {}) {
  return {
    id: input.id ?? createId('audit'),
    timestamp: input.timestamp ?? new Date().toISOString(),
    actor: input.actor ?? null,
    intent: input.intent ?? '',
    commandId: input.commandId ?? '',
    capability: input.capability ?? '',
    decision: input.decision ?? '',
    status: input.status ?? '',
    reason: input.reason ?? '',
    metadata: input.metadata ?? {}
  };
}

export function createValidationResult(errors = [], warnings = []) {
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function validateCommand(command, options = {}) {
  const errors = [];
  const warnings = [];
  const knownCapabilities = options.capabilities ?? null;

  if (!isPlainObject(command)) {
    return createValidationResult(['Command must be a plain object.']);
  }

  if (command.protocolVersion !== PIVOT_PROTOCOL_VERSION) {
    errors.push(`Unsupported protocol version: ${String(command.protocolVersion)}`);
  }

  requireString(command, 'id', errors);
  requireString(command, 'intent', errors);
  requireString(command, 'resource', errors);
  requireString(command, 'action', errors);
  requireString(command, 'capability', errors);

  if (!Object.values(ActionType).includes(command.action)) {
    errors.push(`Unknown action: ${String(command.action)}`);
  }

  if (!Object.values(RiskLevel).includes(command.risk)) {
    errors.push(`Unknown risk level: ${String(command.risk)}`);
  }

  if (!isPlainObject(command.params)) {
    errors.push('Command params must be a plain object.');
  }

  if (!isPlainObject(command.metadata)) {
    errors.push('Command metadata must be a plain object.');
  }

  if (knownCapabilities && !knownCapabilities.has(command.capability)) {
    errors.push(`Capability is not registered: ${command.capability}`);
  }

  if (command.action === ActionType.DELETE && command.risk === RiskLevel.LOW) {
    warnings.push('Delete commands should not be low risk.');
  }

  return createValidationResult(errors, warnings);
}

export function validateParams(params = {}, schema = {}, options = {}) {
  const errors = [];
  const allowUnknown = Boolean(options.allowUnknown);

  if (!isPlainObject(params)) {
    return createValidationResult(['Params must be a plain object.']);
  }

  if (!isPlainObject(schema)) {
    return createValidationResult(['Params schema must be a plain object.']);
  }

  for (const [field, rule] of Object.entries(schema)) {
    const normalizedRule = normalizeFieldRule(rule);
    const value = params[field];

    if (normalizedRule.required && isMissing(value)) {
      errors.push(`Missing required param: ${field}`);
      continue;
    }

    if (isMissing(value)) {
      continue;
    }

    if (!matchesFieldType(value, normalizedRule)) {
      errors.push(`Invalid param type for ${field}: expected ${normalizedRule.type}`);
      continue;
    }

    if (normalizedRule.type === FieldType.ENUM && !normalizedRule.options.includes(value)) {
      errors.push(`Invalid param value for ${field}: ${String(value)}`);
    }
  }

  if (!allowUnknown) {
    const knownFields = new Set(Object.keys(schema));

    for (const field of Object.keys(params)) {
      if (!knownFields.has(field)) {
        errors.push(`Unknown param is not allowed: ${field}`);
      }
    }
  }

  return createValidationResult(errors);
}

export function validateCapability(capability) {
  const errors = [];

  if (!isPlainObject(capability)) {
    return createValidationResult(['Capability must be a plain object.']);
  }

  requireString(capability, 'name', errors);
  requireString(capability, 'resource', errors);
  requireString(capability, 'action', errors);

  if (!Object.values(ActionType).includes(capability.action)) {
    errors.push(`Unknown capability action: ${String(capability.action)}`);
  }

  if (!Object.values(RiskLevel).includes(capability.risk)) {
    errors.push(`Unknown capability risk level: ${String(capability.risk)}`);
  }

  if (!isPlainObject(capability.paramsSchema)) {
    errors.push('Capability paramsSchema must be a plain object.');
  }

  if (typeof capability.allowUnknownParams !== 'boolean') {
    errors.push('Capability allowUnknownParams must be a boolean.');
  }

  if (!Array.isArray(capability.permissions)) {
    errors.push('Capability permissions must be an array.');
  }

  if (capability.execute !== null && capability.execute !== undefined && typeof capability.execute !== 'function') {
    errors.push('Capability execute must be a function when provided.');
  }

  return createValidationResult(errors);
}

function normalizeFieldRule(rule) {
  if (typeof rule === 'string') {
    return { type: rule, required: false, options: [] };
  }

  return {
    type: rule?.type ?? FieldType.STRING,
    required: Boolean(rule?.required),
    options: Array.isArray(rule?.options) ? rule.options : []
  };
}

function matchesFieldType(value, rule) {
  switch (rule.type) {
    case FieldType.STRING:
      return typeof value === 'string';
    case FieldType.NUMBER:
      return typeof value === 'number' && Number.isFinite(value);
    case FieldType.BOOLEAN:
      return typeof value === 'boolean';
    case FieldType.ARRAY:
      return Array.isArray(value);
    case FieldType.OBJECT:
      return isPlainObject(value);
    case FieldType.DATE:
      return typeof value === 'string' && !Number.isNaN(Date.parse(value));
    case FieldType.ENUM:
      return rule.options.includes(value);
    default:
      return false;
  }
}

function requireString(target, field, errors) {
  if (typeof target[field] !== 'string' || target[field].trim() === '') {
    errors.push(`Command field is required: ${field}`);
  }
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

let idCounter = 0;

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  idCounter += 1;
  return `${prefix}:${Date.now()}:${idCounter}`;
}
