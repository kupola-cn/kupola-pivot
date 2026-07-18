export const PIVOT_PROTOCOL_VERSION = '0.1.0';
export const CAPABILITY_MANIFEST_VERSION = '0.1.0';

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
  const paramsSchema = input.paramsSchema ?? input.inputSchema ?? {};
  const inputSchema = input.inputSchema ?? paramsSchema;

  return {
    name: '',
    resource: '',
    action: '',
    risk: RiskLevel.LOW,
    description: '',
    paramsSchema,
    inputSchema,
    allowUnknownParams: false,
    permissions: [],
    requiresConfirmation: false,
    execute: null,
    dryRun: null,
    metadata: {},
    ...input
  };
}

export function createCapabilityManifest(input = {}) {
  return createCapability({
    ...input,
    manifestVersion: input.manifestVersion ?? CAPABILITY_MANIFEST_VERSION,
    version: input.version ?? '',
    domain: input.domain ?? '',
    group: input.group ?? '',
    tags: input.tags ?? [],
    dependencies: input.dependencies ?? [],
    inputSchema: input.inputSchema ?? input.paramsSchema ?? {},
    outputSchema: input.outputSchema ?? {},
    examples: input.examples ?? [],
    paramsSchema: input.paramsSchema ?? input.inputSchema ?? {},
    metadata: input.metadata ?? {}
  });
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

export function redactParams(params = {}, schema = {}, options = {}) {
  if (!isPlainObject(params)) {
    return {};
  }

  const safeSchema = isPlainObject(schema) ? schema : {};
  const redactedValue = options.redactedValue ?? '[redacted]';
  const sensitiveNames = options.sensitiveNames ?? DEFAULT_SENSITIVE_PARAM_NAMES;
  const output = {};

  for (const [field, value] of Object.entries(params)) {
    const rule = normalizeFieldRule(safeSchema[field]);
    const sensitive = rule.sensitive ?? isSensitiveParamName(field, sensitiveNames);
    output[field] = sensitive ? redactedValue : value;
  }

  return output;
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

  if (!isPlainObject(capability.metadata)) {
    errors.push('Capability metadata must be a plain object.');
  }

  if (capability.manifestVersion !== undefined && typeof capability.manifestVersion !== 'string') {
    errors.push('Capability manifestVersion must be a string when provided.');
  }

  if (capability.version !== undefined && typeof capability.version !== 'string') {
    errors.push('Capability version must be a string when provided.');
  }

  if (capability.domain !== undefined && typeof capability.domain !== 'string') {
    errors.push('Capability domain must be a string when provided.');
  }

  if (capability.group !== undefined && typeof capability.group !== 'string') {
    errors.push('Capability group must be a string when provided.');
  }

  if (capability.tags !== undefined) {
    validateStringArray(capability.tags, 'Capability tags', errors);
  }

  if (capability.dependencies !== undefined) {
    validateCapabilityDependencies(capability.dependencies, errors);
  }

  if (capability.inputSchema !== undefined && !isPlainObject(capability.inputSchema)) {
    errors.push('Capability inputSchema must be a plain object when provided.');
  }

  if (capability.outputSchema !== undefined && !isPlainObject(capability.outputSchema)) {
    errors.push('Capability outputSchema must be a plain object when provided.');
  }

  if (capability.examples !== undefined) {
    validateCapabilityExamples(capability.examples, errors);
  }

  if (capability.execute !== null && capability.execute !== undefined && typeof capability.execute !== 'function') {
    errors.push('Capability execute must be a function when provided.');
  }

  return createValidationResult(errors);
}

export function validateCapabilityManifest(capability) {
  const validation = validateCapability(capability);
  const errors = [...validation.errors];

  if (!isPlainObject(capability)) {
    return createValidationResult(['Capability manifest must be a plain object.']);
  }

  requireString(capability, 'manifestVersion', errors);
  requireString(capability, 'version', errors);

  if (!isPlainObject(capability.inputSchema)) {
    errors.push('Capability manifest inputSchema must be a plain object.');
  }

  if (!isPlainObject(capability.outputSchema)) {
    errors.push('Capability manifest outputSchema must be a plain object.');
  }

  return createValidationResult(errors, validation.warnings);
}

function normalizeFieldRule(rule) {
  if (typeof rule === 'string') {
    return { type: rule, required: false, options: [], sensitive: undefined };
  }

  return {
    type: rule?.type ?? FieldType.STRING,
    required: Boolean(rule?.required),
    options: Array.isArray(rule?.options) ? rule.options : [],
    sensitive: typeof rule?.sensitive === 'boolean' ? rule.sensitive : undefined
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

function validateStringArray(value, label, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be an array.`);
    return;
  }

  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'string' || entry.trim() === '') {
      errors.push(`${label} must contain non-empty strings. Invalid item at index ${index}.`);
    }
  }
}

function validateCapabilityDependencies(dependencies, errors) {
  if (!Array.isArray(dependencies)) {
    errors.push('Capability dependencies must be an array.');
    return;
  }

  for (const [index, dependency] of dependencies.entries()) {
    if (!isPlainObject(dependency)) {
      errors.push(`Capability dependency must be a plain object at index ${index}.`);
      continue;
    }

    if (typeof dependency.capability !== 'string' || dependency.capability.trim() === '') {
      errors.push(`Capability dependency capability is required at index ${index}.`);
    }

    if (dependency.version !== undefined && typeof dependency.version !== 'string') {
      errors.push(`Capability dependency version must be a string at index ${index}.`);
    }

    if (dependency.optional !== undefined && typeof dependency.optional !== 'boolean') {
      errors.push(`Capability dependency optional must be a boolean at index ${index}.`);
    }

    if (dependency.description !== undefined && typeof dependency.description !== 'string') {
      errors.push(`Capability dependency description must be a string at index ${index}.`);
    }
  }
}

function validateCapabilityExamples(examples, errors) {
  if (!Array.isArray(examples)) {
    errors.push('Capability examples must be an array.');
    return;
  }

  for (const [index, example] of examples.entries()) {
    if (!isPlainObject(example)) {
      errors.push(`Capability example must be a plain object at index ${index}.`);
      continue;
    }

    if (example.label !== undefined && typeof example.label !== 'string') {
      errors.push(`Capability example label must be a string at index ${index}.`);
    }

    if (example.description !== undefined && typeof example.description !== 'string') {
      errors.push(`Capability example description must be a string at index ${index}.`);
    }

    if (example.params !== undefined && !isPlainObject(example.params)) {
      errors.push(`Capability example params must be a plain object at index ${index}.`);
    }

    if (example.command !== undefined && !isPlainObject(example.command)) {
      errors.push(`Capability example command must be a plain object at index ${index}.`);
    }
  }
}

function isMissing(value) {
  return value === undefined || value === null || value === '';
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

const DEFAULT_SENSITIVE_PARAM_NAMES = [
  'password',
  'passwd',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'apikey',
  'authorization',
  'credential',
  'credentials'
];

function isSensitiveParamName(field, sensitiveNames) {
  const normalized = String(field).toLowerCase();
  return sensitiveNames.some((name) => normalized === String(name).toLowerCase());
}

let idCounter = 0;

function createId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}:${globalThis.crypto.randomUUID()}`;
  }

  idCounter += 1;
  return `${prefix}:${Date.now()}:${idCounter}`;
}
