import {
  ActionType,
  RiskLevel,
  createCommand,
  createPlan,
  createPermissionPolicy,
  createPivotRuntime,
  parseStructuredCommandOutput,
  parseStructuredPlanOutput,
  mapHttpStatusToPolicy
} from '@kupola/pivot';

const api = createHisApi();

const runtime = createPivotRuntime({
  policies: [createPermissionPolicy()],
  ui: {
    confirm: async ({ command }) => {
      console.log(`[confirm] ${command.resource}.${command.action}`);
      return true;
    }
  }
});

registerHisCapabilities(runtime);

const adminContext = {
  actor: {
    id: 'admin',
    permissions: ['role:query', 'organization:create', 'organization:delete', 'role:delete']
  },
  api
};

const limitedContext = {
  actor: {
    id: 'limited-user',
    permissions: ['role:query']
  },
  api
};

const queryRoles = createCommand({
  intent: '查询所有角色',
  resource: 'role',
  action: ActionType.QUERY,
  capability: 'role.query',
  risk: RiskLevel.LOW,
  params: {}
});

const createBranch = createCommand({
  intent: '在集团下增加分机构C',
  resource: 'organization',
  action: ActionType.CREATE,
  capability: 'organization.create',
  risk: RiskLevel.MEDIUM,
  params: {
    name: '分机构C',
    parentId: 'group'
  }
});

const deleteRole = createCommand({
  intent: '删除管理员角色',
  resource: 'role',
  action: ActionType.DELETE,
  capability: 'role.delete',
  risk: RiskLevel.HIGH,
  params: {
    id: 'role-admin'
  }
});

const createBranchPlan = createPlan({
  intent: '校验集团并创建分机构D',
  nodes: [
    {
      id: 'query-group',
      capability: 'organization.query',
      params: { id: 'group' }
    },
    {
      id: 'create-branch-d',
      capability: 'organization.create',
      params: { name: '分机构D', parentId: { $from: 'query-group', path: 'data.id' } }
    }
  ],
  edges: [{ from: 'query-group', to: 'create-branch-d' }]
});

const compensatedPlan = createPlan({
  intent: '创建分机构E后触发失败并回滚',
  nodes: [
    {
      id: 'create-branch-e',
      capability: 'organization.create',
      params: { name: '分机构E', parentId: 'group' },
      compensate: {
        capability: 'organization.deleteLatest',
        params: {}
      }
    },
    {
      id: 'fail-after-branch-e',
      capability: 'organization.fail',
      params: {}
    }
  ],
  edges: [{ from: 'create-branch-e', to: 'fail-after-branch-e' }]
});

const aiCommandOutput = {
  type: 'command',
  command: {
    intent: '在集团下增加分机构F',
    resource: 'organization',
    action: ActionType.CREATE,
    capability: 'organization.create',
    risk: RiskLevel.MEDIUM,
    params: {
      name: '分机构F',
      parentId: 'group'
    }
  }
};

const aiCommandDraftOutput = {
  type: 'command',
  command: {
    intent: '在集团下增加分机构F'
  }
};

const aiPlanOutput = {
  kind: 'plan',
  plan: createPlan({
    intent: '先查询集团，再创建分机构F',
    nodes: [
      {
        id: 'query-group-ai',
        capability: 'organization.query',
        params: { id: 'group' }
      },
      {
        id: 'create-branch-f',
        capability: 'organization.create',
        params: {
          name: '分机构F',
          parentId: { $from: 'query-group-ai', path: 'data.id' }
        }
      }
    ],
    edges: [{ from: 'query-group-ai', to: 'create-branch-f' }]
  })
};

const aiPlanDraftOutput = {
  kind: 'plan',
  plan: {
    id: 'ai-plan-draft',
    intent: 'broken plan draft',
    nodes: 'not-an-array',
    edges: []
  }
};

console.log('query roles:', await runtime.executeCommand(queryRoles, adminContext));
console.log('create branch preview:', await runtime.previewCommand(createBranch, adminContext));
console.log('create branch:', await runtime.executeCommand(createBranch, adminContext));
console.log('create branch plan preview:', await runtime.previewPlan(createBranchPlan, adminContext));
console.log('create branch plan:', await runtime.executePlan(createBranchPlan, adminContext));
console.log('compensated plan:', await runtime.executePlan(compensatedPlan, adminContext));
console.log('ai command feedback:', summarizeStructuredOutput(parseStructuredCommandOutput(aiCommandDraftOutput)));
const parsedAiCommand = parseStructuredCommandOutput(aiCommandOutput);
if (!parsedAiCommand.ok) {
  throw new Error(`Expected structured AI command output to parse: ${parsedAiCommand.explain.errors.join('; ')}`);
}
console.log('ai command preview:', await runtime.previewCommand(parsedAiCommand.data.command, adminContext));
console.log('ai command execute:', await runtime.executeCommand(parsedAiCommand.data.command, adminContext));
console.log('ai plan feedback:', summarizeStructuredOutput(parseStructuredPlanOutput(aiPlanDraftOutput)));
const parsedAiPlan = parseStructuredPlanOutput(aiPlanOutput);
if (!parsedAiPlan.ok) {
  throw new Error(`Expected structured AI plan output to parse: ${parsedAiPlan.explain.errors.join('; ')}`);
}
console.log('ai plan preview:', await runtime.previewPlan(parsedAiPlan.data.plan, adminContext));
console.log('ai plan execute:', await runtime.executePlan(parsedAiPlan.data.plan, adminContext));
console.log('blocked delete:', await runtime.executeCommand(deleteRole, limitedContext));
console.log('backend 403:', await runtime.executeCommand(deleteRole, adminContext));
console.log('audit count:', runtime.getAuditEvents().length);

function registerHisCapabilities(targetRuntime) {
  targetRuntime.registerCapability({
    name: 'role.query',
    resource: 'role',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['role:query'],
    paramsSchema: {},
    execute: async ({ context }) => context.api.queryRoles()
  });

  targetRuntime.registerCapability({
    name: 'organization.query',
    resource: 'organization',
    action: ActionType.QUERY,
    risk: RiskLevel.LOW,
    permissions: ['organization:create'],
    paramsSchema: {
      id: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.queryOrganization(params.id)
  });

  targetRuntime.registerCapability({
    name: 'organization.create',
    resource: 'organization',
    action: ActionType.CREATE,
    risk: RiskLevel.MEDIUM,
    permissions: ['organization:create'],
    requiresConfirmation: true,
    paramsSchema: {
      name: { type: 'string', required: true },
      parentId: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => context.api.createOrganization(params)
  });

  targetRuntime.registerCapability({
    name: 'organization.deleteLatest',
    resource: 'organization',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['organization:delete'],
    requiresConfirmation: true,
    paramsSchema: {},
    execute: async ({ context }) => context.api.deleteLatestOrganization()
  });

  targetRuntime.registerCapability({
    name: 'organization.fail',
    resource: 'organization',
    action: ActionType.EXECUTE,
    risk: RiskLevel.LOW,
    permissions: ['organization:create'],
    paramsSchema: {},
    execute: async () => {
      throw new Error('Simulated downstream HIS API failure.');
    }
  });

  targetRuntime.registerCapability({
    name: 'role.delete',
    resource: 'role',
    action: ActionType.DELETE,
    risk: RiskLevel.HIGH,
    permissions: ['role:delete'],
    requiresConfirmation: true,
    paramsSchema: {
      id: { type: 'string', required: true }
    },
    execute: async ({ params, context }) => {
      try {
        return await context.api.deleteRole(params.id);
      } catch (error) {
        const policy = mapHttpStatusToPolicy(error.status, error.message);
        const mappedError = new Error(policy?.reason ?? error.message);
        mappedError.status = error.status;
        throw mappedError;
      }
    }
  });
}

function createHisApi() {
  const roles = [
    { id: 'role-admin', name: '管理员' },
    { id: 'role-doctor', name: '医生' },
    { id: 'role-nurse', name: '护士' }
  ];

  const organizations = [
    { id: 'group', name: '集团', parentId: null }
  ];

  return {
    async queryRoles() {
      return roles;
    },

    async createOrganization(input) {
      const parent = organizations.find((item) => item.id === input.parentId);

      if (!parent) {
        const error = new Error('Parent organization was not found.');
        error.status = 404;
        throw error;
      }

      const organization = {
        id: `org-${organizations.length + 1}`,
        name: input.name,
        parentId: input.parentId
      };

      organizations.push(organization);
      return organization;
    },

    async queryOrganization(id) {
      return organizations.find((item) => item.id === id) ?? null;
    },

    async deleteLatestOrganization() {
      const organization = organizations.at(-1);

      if (!organization || organization.id === 'group') {
        return { deleted: false };
      }

      organizations.pop();
      return { id: organization.id, deleted: true };
    },

    async deleteRole(id) {
      if (id === 'role-admin') {
        const error = new Error('Backend authorization rejected deleting protected admin role.');
        error.status = 403;
        throw error;
      }

      return { id, deleted: true };
    }
  };
}

function summarizeStructuredOutput(result) {
  return {
    ok: result.ok,
    message: result.message,
    errors: result.explain?.errors ?? [],
    warnings: result.explain?.warnings ?? []
  };
}
