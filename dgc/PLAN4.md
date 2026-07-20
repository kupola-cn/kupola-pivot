# Kupola PIVOT Flow Designer PLAN4

更新时间：2026-07-20

## 背景

PLAN3 已完成流程设计器的语义闭环、schema 驱动 Inspector、画布拖拽和端口连线、查询用户官方模板、npm UI 入口。

PLAN4 的目标不是继续堆新节点，而是做发布前硬化：

```text
可运行 demo
  -> 真实 UI 接入验证
  -> 文档和 API 边界收敛
  -> 类型和 subpath 检查
  -> 发布前验收清单
```

不推送，不发布 npm，不做无功能版本更新。

## 核心目标

- 让 `his-sys/his-web/pages/his-flow-designer.html` 成为可直接验证的 HIS Flow Designer 页面。
- 确认 `@kupola/pivot-flow/ui` 和 `@kupola/pivot-flow/css` 的实际接入体验。
- 明确 headless API 与 UI API 的稳定边界。
- 检查默认 UI 是否真实复用 Kupola UI 体系，不重复造基础组件。
- 建立发布前检查清单，但本阶段不执行发布。

## 阶段 1：可运行 HIS Demo

- [x] 增加可运行的 `his-sys/his-web/pages/his-flow-designer.html`。
- [x] HIS 页面使用 `@kupola/pivot-flow` 模板、节点 schema、`flowToPlan()` 和 Runtime 执行能力，不直接裸露包内部 FlowManager 控制台。
- [x] 示例默认加载 `user.query-by-name` 模板，并收敛为当前 Runtime 稳定支持的顺序执行链路。
- [x] 示例注册 `user.query` capability。
- [x] 示例注册 `human.select`、`ui.display`、`message.show` frontend adapters。
- [x] 示例提供 mock HIS 用户数据，能覆盖张三多条结果。
- [x] 示例提供节点属性 JSON 编辑、节点添加、节点选择和节点连接入口。
- [x] 启动 Vite 服务并通过浏览器验证页面可访问、可执行。

## 阶段 2：Kupola UI 复用核查

- [x] 新增 `FlowWorkbench` 业务页面封装，HIS 页面只负责传入 flow、nodeTypes、Runtime/capability 和 adapters。
- [x] `FlowWorkbench` 使用 Kupola `ds-*` class 和 token，未新增基础 Button/Form/Table primitive。
- [x] `FlowWorkbench` 提供节点库、无限画布、节点拖动、输入/输出端口拖拽连线、属性面板、运行结果和日志。
- [ ] 梳理当前 Flow UI 使用的 Kupola class/token。
- [ ] 确认 `@kupola/kupola` 是否提供可直接 import 的 Button/Form/Table/Drawer/Modal/Message 组件。
- [ ] 如存在稳定组件 API，优先封装 Flow UI adapter，不直接重写基础组件。
- [ ] 如果当前只能通过 class/token 复用，文档明确该层级和后续迁移路径。
- [ ] 记录不应在 pivot-flow 内部自建的基础 UI primitive 清单。

## 阶段 3：API 边界和文档收敛

- [ ] README 增加 headless API 和 UI API 对照表。
- [ ] README 标注稳定 API、实验 API 和内部 API。
- [ ] README 补充 `@kupola/pivot-flow/ui`、`@kupola/pivot-flow/css`、`his-sys/his-web/pages/his-flow-designer.html` 使用说明。
- [ ] 文档明确 backend authorization、data scope、audit、transaction 仍由后端负责。
- [ ] 文档说明 renderer replacement、frontend adapter 和 custom node 的边界。

## 阶段 4：类型和导出检查

- [ ] 检查 package `exports` 的 `.`、`./ui`、`./css`。
- [x] 检查 `src/index.d.ts` 与 JS export 是否一致。
- [x] 检查 `src/ui.d.ts` 与 `src/ui.js` 是否一致。
- [x] 增加必要的 subpath import 测试。
- [ ] 保持 package version 不变。

## 阶段 5：发布前验收清单

- [ ] 建立 release readiness checklist。
- [ ] 记录必须通过的测试命令。
- [ ] 记录不发布 npm 时的本地验收流程。
- [ ] 记录发布前必须人工确认的 UI demo 项。
- [ ] 不执行 npm publish。

## 验收标准

- [x] HIS demo 页面可以在本地 Vite 服务中打开。
- [x] Demo 中可以看到 HIS 业务化节点库、画布、Inspector、Preview/Run 和结果面板。
- [x] Demo 默认流程使用通用 Query Node 完成“查询张三的信息”。
- [x] Demo 的多条张三结果进入 `human.select` 并展示选中详情。
- [ ] 文档能让使用者在 10 分钟内接入默认设计器。
- [ ] 文档明确 UI 基于 Kupola UI，不重复实现基础组件。
- [ ] `@kupola/pivot-flow/ui` 和 `@kupola/pivot-flow/css` 的使用方式清楚。
- [ ] 类型声明和 JS export 对齐。
- [ ] 所有必要测试通过。
- [ ] 没有推送、没有发布 npm、没有无功能版本变更。

## 一句话方向

```text
PLAN4 要把 PLAN3 的能力从“已经实现”推进到“使用者可以真实接入和验证”。
```
