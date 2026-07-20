# Kupola PIVOT Flow Designer PLAN3

更新时间：2026-07-20

## 背景

当前 `@kupola/pivot` 已经具备 capability、policy、plan、preview、execute、audit 等底层能力；`@kupola/pivot-flow` 已经具备 FlowDefinition、nodes、edges、FlowManager、FlowCanvas、FlowRunner 等基础能力。

新的目标不是再造一套执行引擎，而是把这些能力整理成一个开源 npm 包使用者可以直接使用的流程设计器：

```text
添加节点
  -> 配置节点属性
  -> 连接节点
  -> 校验流程
  -> 预览影响
  -> 执行或发布
  -> 查看结果和审计
```

## 核心结论

语义闭环已经存在，但产品体验还不完整。

当前可以通过表单和分层画布完成节点、边、预览、执行、发布；但还不是完整的低代码画布体验。下一阶段应重点补齐：

- 节点拖拽添加。
- 节点端口连接。
- 可视化连线校验。
- schema 驱动的节点参数表单。
- 通用节点类型与属性配置。
- 可复用前端 UI 封装。

## PLAN3 目标

### 1. 完整画布交互

- [ ] 节点 Palette 支持拖到画布。
- [ ] 节点显示输入端口和输出端口。
- [ ] 支持点选或拖拽方式连线：先选 source，再选 target。
- [ ] 连线失败时在画布上直接提示原因。
- [ ] 节点参数编辑根据 capability `paramsSchema` 自动生成表单，不依赖手写 JSON。
- [ ] 保存后可以直接 preview、execute、publish，形成完整工作流闭环。

### 2. 前端 UI 封装

使用者不应该重复造以下 UI：

- Flow 管理页。
- 节点 Palette。
- 画布。
- 节点检查器。
- 参数映射器。
- 连接线编辑器。
- 测试面板。
- 预览面板。
- 执行结果面板。
- 运行历史。
- 发布安全检查。
- 权限矩阵。
- AI 生成 Flow 草稿审核面板。

UI 必须基于 Kupola UI 组件实现，不重复造基础组件。`@kupola/pivot-flow` 负责流程语义和编排，UI 层只组合 Kupola 的 Drawer、Modal、Table、Form、Tabs、Message、Tooltip、Dropdown、Tree、Empty、Skeleton 等组件。

建议短期采用 subpath export，长期再拆独立 UI 包：

```text
@kupola/pivot
  底层 runtime、capability、policy、plan、trusted UI。

@kupola/pivot-flow
  Flow schema、flowToPlan、FlowRunner、FlowStore、validation、versioning、AI builder。

@kupola/pivot-flow/ui
  默认 FlowManager、FlowDesigner、FlowCanvas、NodeInspector、FlowAssistantDrawer。
  依赖 @kupola/kupola，不自己实现基础 UI primitives。

@kupola/pivot-flow-ui
  当 UI API 稳定、体积和发布节奏需要独立时再拆出。
  仍然基于 @kupola/kupola 实现，不另建一套组件库。

@kupola/pivot-flow/react
@kupola/pivot-flow/vue
  后续再做框架适配，不作为当前第一优先级。
```

短期可以先保留在 `@kupola/pivot-flow` 内，通过 subpath export 区分 headless 和 UI：

```js
import { createFlowRunner, flowToPlan } from '@kupola/pivot-flow';
import { FlowManager, FlowAssistantDrawer } from '@kupola/pivot-flow/ui';
import '@kupola/pivot-flow/css';
```

决策：

- 短期不单独创建 `pivot-flow-ui` 仓库或包，先放在 `@kupola/pivot-flow/ui`，降低包管理复杂度。
- UI 代码和 headless 代码必须分层，headless API 不能依赖 DOM。
- UI 层必须使用 Kupola UI 作为基础组件来源。
- 当 UI 体积、版本节奏或框架适配复杂度明显增大时，再拆出 `@kupola/pivot-flow-ui`。
- 不允许为了 Flow Designer 重写 Table、Form、Modal、Drawer、Tooltip 等基础组件。

## 通用节点设计原则

节点必须是通用的，业务差异通过属性、capability、resource schema、paramsSchema 和 UI 配置表达，而不是为每张表、每个动作单独写一种节点。

错误方向：

```text
UserQueryNode
RoleQueryNode
DepartmentCreateNode
PurchaseOrderApproveNode
```

推荐方向：

```text
QueryNode + resource: users
ActionNode + capability: purchaseOrder.approve
DisplayNode + renderer: table
ConditionNode + condition expression
```

也就是说：

```text
节点类型少，节点属性强。
```

## 节点基础结构

建议所有节点都共享一套基础字段：

```ts
interface FlowNode {
  id: string;
  type: FlowNodeType;
  label?: string;
  description?: string;

  capability?: string;
  resource?: string;
  action?: string;

  params?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;

  ports?: {
    inputs?: FlowPort[];
    outputs?: FlowPort[];
  };

  ui?: FlowNodeUI;
  control?: FlowNodeControl;
  safety?: FlowNodeSafety;
  metadata?: Record<string, unknown>;
}
```

### 端口设计

端口用于画布连线，不直接代表 DOM 元素。

```ts
interface FlowPort {
  id: string;
  label?: string;
  kind: 'input' | 'output';
  dataType?: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'void';
  required?: boolean;
  cardinality?: 'one' | 'many' | 'none';
}
```

默认端口：

- 查询节点：`input.query`、`output.records`、`output.empty`、`output.error`。
- 动作节点：`input.params`、`output.result`、`output.error`。
- 条件节点：`input.value`、`output.true`、`output.false`。
- 展示节点：`input.data`、`output.done`。
- 确认节点：`input.payload`、`output.confirmed`、`output.rejected`。

### 控制属性

```ts
interface FlowNodeControl {
  condition?: unknown;
  retry?: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: 'fixed' | 'linear' | 'exponential';
  };
  timeoutMs?: number;
  onError?: {
    action: 'stop' | 'skip' | 'fallback';
    fallbackValue?: unknown;
  };
}
```

底层仍然应尽量映射到 PIVOT plan node，避免 `FlowEngine` 自己重新解释一套执行语义。

### UI 属性

```ts
interface FlowNodeUI {
  icon?: string;
  group?: string;
  position?: { x: number; y: number };
  renderer?: 'table' | 'detail' | 'form' | 'message' | 'drawer' | 'modal' | 'none';
  title?: string;
  columns?: unknown[];
  fields?: unknown[];
  emptyText?: string;
  multipleText?: string;
  target?: string;
}
```

UI 属性只影响展示，不应该绕过 capability、policy 和 backend authorization。

### 安全属性

```ts
interface FlowNodeSafety {
  risk?: 'low' | 'medium' | 'high' | 'critical';
  permissions?: string[];
  requiresConfirmation?: boolean;
  requiresApproval?: boolean;
  sensitiveInputs?: string[];
  sensitiveOutputs?: string[];
}
```

安全属性用于前端提示和拦截；后端必须继续做最终鉴权、数据范围、字段脱敏和业务规则校验。

## 推荐节点类型

### 1. Intent Input Node

负责收集用户意图和 slots。

```ts
{
  type: 'intent.input',
  params: {
    slots: [
      { name: 'name', type: 'string', required: true }
    ]
  }
}
```

用途：

- 自然语言输入。
- 手动补参数。
- 敏感参数输入。
- 默认值注入。

### 2. Query Node

通用查询节点，不绑定具体表。

```ts
{
  type: 'data.query',
  resource: 'users',
  capability: 'users.query',
  params: {
    filters: [
      { field: 'name', operator: 'eq', value: '{{intent.name}}' }
    ],
    limit: 20
  },
  outputSchema: {
    records: { type: 'array' },
    total: { type: 'number' }
  },
  ui: {
    renderer: 'table'
  }
}
```

查询节点必须明确：

- 查询哪个 resource。
- 使用哪个 capability。
- 查询条件如何从 intent、context 或上游节点映射。
- 结果是 `none`、`one` 还是 `many`。
- 多条结果是直接展示，还是进入人工选择节点。

### 3. Action Node

负责创建、更新、删除、审批、分配等业务操作。

```ts
{
  type: 'capability.run',
  capability: 'users.disable',
  params: {
    userId: '{{selectUser.data.id}}'
  },
  safety: {
    risk: 'high',
    requiresConfirmation: true,
    permissions: ['users:disable']
  }
}
```

### 4. Condition Node

负责分支判断。

```ts
{
  type: 'condition',
  params: {
    left: '{{queryUser.data.total}}',
    operator: 'gt',
    right: 1
  }
}
```

常见用途：

- 查询结果为空。
- 查询结果唯一。
- 查询结果多条。
- 风险等级不同。
- 后端返回状态不同。

### 5. Transform Node

负责把上游结果转换成下游参数。

```ts
{
  type: 'transform',
  params: {
    userId: '{{selectUser.data.id}}',
    displayName: '{{selectUser.data.name}}'
  }
}
```

Transform 必须使用受控 DSL 或结构化 mapping，不能执行任意 JavaScript。

### 6. Human Select Node

用于查询返回多条时，让用户选择具体记录。

```ts
{
  type: 'human.select',
  params: {
    source: '{{queryUsers.data.records}}',
    title: '选择用户',
    valueField: 'id',
    labelField: 'name'
  },
  ui: {
    renderer: 'table'
  }
}
```

这个节点对“查询张三，有重名返回多个”的场景很关键。

### 7. Display Node

负责把数据展示给前端。

```ts
{
  type: 'ui.display',
  params: {
    data: '{{queryUsers.data.records}}'
  },
  ui: {
    renderer: 'table',
    title: '用户查询结果'
  }
}
```

Display Node 不做业务执行，只做可信展示。

### 8. Confirm / Approval Node

Confirm 用于当前用户确认，Approval 用于提交审批。

```ts
{
  type: 'confirm',
  label: '确认禁用用户',
  safety: {
    risk: 'high'
  }
}
```

### 9. Output Node

用于定义整个 Flow 的最终输出。

```ts
{
  type: 'output.return',
  params: {
    result: '{{displayResult.data}}'
  }
}
```

如果没有 Output Node，默认返回最后一个执行节点的结果。

### 10. Subflow Node

用于把一个已存在的 Flow 当成节点复用，解决复杂业务流程拆分和复用问题。

```ts
{
  type: 'subflow.run',
  label: '创建用户并初始化权限',
  params: {
    flowId: 'user-create-with-default-roles',
    input: {
      name: '{{intent.name}}',
      departmentId: '{{selectDepartment.data.id}}'
    }
  },
  outputSchema: {
    result: { type: 'object' }
  }
}
```

Subflow Node 设计要求：

- 只能引用已保存且可访问的 Flow。
- 默认只能引用 published Flow；draft 引用仅用于设计器测试。
- 必须检测递归引用和循环依赖。
- 子流程输入输出必须有 schema，方便父流程映射。
- 子流程执行结果进入父流程上下文，例如 `{{createUserSubflow.data.result.userId}}`。
- 子流程的权限、确认、审批、审计不能被父流程绕过。
- 子流程版本需要固定或声明策略，例如 `version: '1.2.0'` 或 `version: 'latest-published'`。

### 11. Custom Node

用于让使用者扩展项目专属节点，但自定义节点不能绕过 PIVOT 的 capability 和 policy 边界。

```ts
registerFlowNodeType({
  type: 'his.inventory.shortage-check',
  label: '库存短缺检查',
  group: 'HIS',
  icon: 'warning',
  inputSchema: {
    materialId: { type: 'string', required: true }
  },
  outputSchema: {
    shortage: { type: 'boolean' },
    quantity: { type: 'number' }
  },
  defaultParams: {
    threshold: 0
  },
  toPlanNode(node, context) {
    return {
      id: node.id,
      capability: 'inventory.shortageCheck',
      params: node.params
    };
  },
  renderInspector(props) {
    return props.defaultInspector();
  }
});
```

Custom Node 设计要求：

- 自定义节点必须通过注册表声明，不能直接把任意代码塞进 FlowDefinition。
- 自定义节点最终应映射为 capability、subflow、condition、transform 或 UI display。
- 自定义节点的执行逻辑仍应由 capability handler 或子流程承载。
- 自定义节点必须声明 inputSchema、outputSchema、默认 params、端口和安全属性。
- 自定义节点 Inspector 可以复用默认表单，也可以扩展项目 UI。
- 自定义节点 renderer 必须基于 Kupola UI。
- 自定义节点包可以由项目方提供，例如 `@his/pivot-flow-nodes`。

建议 API：

```ts
interface FlowNodeTypePlugin {
  type: string;
  label: string;
  group?: string;
  icon?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  defaultParams?: Record<string, unknown>;
  ports?: {
    inputs?: FlowPort[];
    outputs?: FlowPort[];
  };
  safety?: FlowNodeSafety;
  toPlanNode?: (node: FlowNode, context: unknown) => unknown;
  validate?: (node: FlowNode) => unknown;
  renderInspector?: (props: unknown) => unknown;
  renderNode?: (props: unknown) => unknown;
}
```

## 查询“张三的信息”的流程示例

用户输入：

```text
查询张三的信息
```

推荐流程：

```text
intent.input
  -> users.query
  -> condition: total == 0
      -> message.show: 未找到张三
  -> condition: total == 1
      -> ui.display: 展示张三详情
  -> condition: total > 1
      -> human.select: 让用户选择具体张三
      -> ui.display: 展示选中的用户详情
```

示例 Flow：

```js
createFlow({
  id: 'query-user-by-name',
  name: '按姓名查询用户',
  intent: {
    examples: ['查询张三的信息', '查一下李四'],
    slots: [
      {
        name: 'name',
        type: 'string',
        required: true,
        pattern: '查询(?<name>\\S+)的信息'
      }
    ]
  },
  nodes: [
    {
      id: 'query-users',
      type: 'data.query',
      label: '查询用户',
      resource: 'users',
      capability: 'users.query',
      params: {
        filters: [
          { field: 'name', operator: 'eq', value: '{{intent.name}}' }
        ],
        limit: 20
      },
      ui: {
        renderer: 'table',
        columns: ['id', 'name', 'departmentName', 'phone']
      }
    },
    {
      id: 'show-empty',
      type: 'message.show',
      label: '未找到用户',
      params: {
        message: '未找到匹配用户'
      }
    },
    {
      id: 'show-one',
      type: 'ui.display',
      label: '展示用户详情',
      params: {
        data: '{{query-users.data.records.0}}'
      },
      ui: {
        renderer: 'detail'
      }
    },
    {
      id: 'select-user',
      type: 'human.select',
      label: '选择用户',
      params: {
        source: '{{query-users.data.records}}',
        valueField: 'id',
        labelField: 'name'
      },
      ui: {
        renderer: 'table'
      }
    },
    {
      id: 'show-selected',
      type: 'ui.display',
      label: '展示选中用户',
      params: {
        data: '{{select-user.data.record}}'
      },
      ui: {
        renderer: 'detail'
      }
    }
  ],
  edges: [
    {
      from: 'query-users',
      to: 'show-empty',
      condition: { path: 'data.total', equals: 0 }
    },
    {
      from: 'query-users',
      to: 'show-one',
      condition: { path: 'data.total', equals: 1 }
    },
    {
      from: 'query-users',
      to: 'select-user',
      condition: { path: 'data.total', gt: 1 }
    },
    {
      from: 'select-user',
      to: 'show-selected',
      condition: 'success'
    }
  ]
});
```

注意：当前 `evaluatePlanEdgeCondition` 尚未支持 `gt`，需要扩展条件操作符。

## 前端 UI 组件封装清单

### FlowDesigner

完整设计器容器，聚合所有子组件。

- Flow 列表。
- 模板列表。
- 节点 Palette。
- Canvas。
- Inspector。
- Edge Editor。
- Test Panel。
- Preview Panel。
- Publish Safety Panel。

### NodePalette

- 按类型分组。
- 支持搜索。
- 支持拖拽。
- 支持 capability 推荐。
- 支持从 resource schema 生成 Query / Action 节点。

### FlowCanvas

- 支持节点拖拽定位。
- 支持端口连线。
- 支持连线高亮。
- 支持失败路径高亮。
- 支持 mini map。
- 支持 zoom / pan。
- 支持分层布局和自由布局切换。

### NodeInspector

- 基础信息。
- capability 选择。
- resource/action 选择。
- paramsSchema 自动表单。
- input/output schema 展示。
- risk / permission / confirmation 配置。
- UI renderer 配置。

### EdgeEditor

- from / to / sourcePort / targetPort。
- condition 编辑器。
- 条件模板。
- 连线安全检查。

### VariableMapper

- 展示 intent slots。
- 展示 context。
- 展示上游节点 outputs。
- 一键插入 `{{nodeId.data.path}}`。

### FlowPreviewPanel

- 展示 plan preview。
- 展示权限阻断。
- 展示高风险确认。
- 展示数据依赖。
- 展示将要执行的 capability 列表。

### FlowRunPanel

- 展示执行结果。
- 展示节点状态。
- 展示失败原因。
- 展示审计摘要。
- 支持跳转到失败节点。

## 实施顺序

### 阶段 1：节点模型收敛

- [x] 明确 FlowNode 标准字段。
- [x] 明确通用节点类型。
- [x] 增加 `data.query`、`human.select`、`ui.display`、`output.return`、`subflow.run` 类型。
- [x] 增加自定义节点注册表：`registerFlowNodeType()`。
- [x] 扩展条件操作符：`gt`、`gte`、`lt`、`lte`、`contains`、`empty`、`notEmpty`。
- [x] 让 `flowToPlan` 能稳定映射新节点类型。
- [x] 子流程引用需要检测递归、循环依赖、权限和版本策略。

### 阶段 2：schema 驱动 Inspector

- [ ] 根据 capability `paramsSchema` 自动生成参数表单。
- [ ] 根据 resource schema 自动生成查询条件编辑器。
- [ ] 支持字段选择、操作符选择、默认值和模板变量插入。
- [ ] 支持输出 schema 预览。
- [ ] 自定义节点 Inspector 默认复用 schema 表单，可按需扩展。

### 阶段 3：画布交互升级

- [ ] NodePalette 拖拽到画布。
- [ ] 节点位置写入 `node.ui.position`。
- [ ] 节点端口渲染。
- [ ] 点击端口或拖拽端口创建 edge。
- [ ] 创建 edge 前调用 `canConnectFlowNodes`。
- [ ] 连线失败直接显示原因。
- [ ] 画布、Inspector、Panel、Drawer、Modal、Table、Form 必须复用 Kupola UI。

### 阶段 4：查询场景闭环

- [ ] 做“查询张三的信息”官方示例。
- [ ] 覆盖 0 条、1 条、多条结果。
- [ ] 多条结果进入 `human.select`。
- [ ] 选择后展示详情。
- [ ] 所有结果展示组件可由使用者替换。

### 阶段 5：npm 使用体验

- [ ] 增加 `createPivotFlowApp` 或 `createFlowDesigner` 一键入口。
- [ ] 文档提供 10 分钟接入示例。
- [ ] examples 增加 HIS Flow Designer 实例（HIS项目中）。
- [ ] 增加 `@kupola/pivot-flow/css` 默认样式。
- [ ] 增加 headless API 与 UI API 的边界说明。
- [ ] 短期提供 `@kupola/pivot-flow/ui`；长期视情况拆 `@kupola/pivot-flow-ui`。
- [ ] 文档明确 UI 基于 `@kupola/kupola`，不重复实现基础组件。

## 验收标准

- [ ] 使用者无需自己实现画布、连线、节点检查器、预览面板。
- [ ] 使用者只需要注册 capability 和 resource schema，就能配置大部分通用流程。
- [ ] “查询张三的信息”能通过通用 Query Node 完成，而不是写专用 UserQueryNode。
- [ ] 查询结果 0 条、1 条、多条都有默认 UI 行为。
- [x] 节点连线前会校验重复边、自连接、环和非法端口。
- [x] 设计出来的 Flow 可以保存、预览、执行、发布。
- [x] 高风险节点必须保留确认、审批、权限和审计边界。
- [ ] 默认 UI 可用，但业务项目可以替换 renderer。
- [ ] 默认 UI 使用 Kupola UI 组件实现，不重复造基础 Table/Form/Modal/Drawer。
- [x] 子流程可以作为节点复用，且不会绕过权限、确认、审批和审计。
- [x] 使用者可以注册自定义节点，但自定义节点最终仍映射到 capability、subflow、condition、transform 或 display。

## 一句话方向

```text
Kupola PIVOT Flow Designer 应该让开发者注册能力和资源语义，让使用者通过通用节点和可视化连接编排业务流程，而不是让每个项目重复造流程画布和节点 UI。
```
