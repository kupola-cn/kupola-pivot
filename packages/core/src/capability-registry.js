import {
  createCapability,
  validateCapability,
  validateCommand,
  validateParams
} from '@kupola/pivot-protocol';

export function createCapabilityRegistry(options = {}) {
  const capabilities = new Map();
  const onDuplicate = options.onDuplicate ?? 'replace';

  return {
    register(capabilityInput) {
      const capability = createCapability(capabilityInput);
      const validation = validateCapability(capability);

      if (!validation.valid) {
        throw new Error(`Invalid PIVOT capability: ${validation.errors.join('; ')}`);
      }

      if (capabilities.has(capability.name) && onDuplicate === 'error') {
        throw new Error(`PIVOT capability already registered: ${capability.name}`);
      }

      capabilities.set(capability.name, freezeCapability(capability));
      return capabilities.get(capability.name);
    },

    unregister(name) {
      return capabilities.delete(name);
    },

    get(name) {
      return capabilities.get(name) ?? null;
    },

    has(name) {
      return capabilities.has(name);
    },

    list(filter = {}) {
      return Array.from(capabilities.values()).filter((capability) => {
        if (filter.resource && capability.resource !== filter.resource) return false;
        if (filter.action && capability.action !== filter.action) return false;
        if (filter.permission && !capability.permissions.includes(filter.permission)) return false;
        if (filter.domain && capability.domain !== filter.domain) return false;
        if (filter.group && capability.group !== filter.group) return false;
        if (filter.version && capability.version !== filter.version) return false;

        if (Array.isArray(filter.tags) && filter.tags.length > 0) {
          const capabilityTags = Array.isArray(capability.tags) ? capability.tags : [];

          if (!filter.tags.every((tag) => capabilityTags.includes(tag))) {
            return false;
          }
        } else if (filter.tag) {
          const capabilityTags = Array.isArray(capability.tags) ? capability.tags : [];

          if (!capabilityTags.includes(filter.tag)) {
            return false;
          }
        }

        return true;
      });
    },

    validateCommand(command) {
      const commandValidation = validateCommand(command, { capabilities });

      if (!commandValidation.valid) {
        return commandValidation;
      }

      const capability = capabilities.get(command.capability);
      const paramValidation = validateParams(command.params, capability.paramsSchema, {
        allowUnknown: capability.allowUnknownParams
      });

      return {
        valid: commandValidation.valid && paramValidation.valid,
        errors: [...commandValidation.errors, ...paramValidation.errors],
        warnings: commandValidation.warnings
      };
    },

    size() {
      return capabilities.size;
    }
  };
}

function freezeCapability(capability) {
  return deepFreeze(cloneValue(capability));
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entryValue]) => [key, cloneValue(entryValue)])
    );
  }

  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  for (const child of Object.values(value)) {
    deepFreeze(child);
  }

  return value;
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}
