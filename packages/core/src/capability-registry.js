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

      capabilities.set(capability.name, Object.freeze({ ...capability }));
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
        return true;
      });
    },

    validateCommand(command) {
      const commandValidation = validateCommand(command, { capabilities });

      if (!commandValidation.valid) {
        return commandValidation;
      }

      const capability = capabilities.get(command.capability);
      const paramValidation = validateParams(command.params, capability.paramsSchema);

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
