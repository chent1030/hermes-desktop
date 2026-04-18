# Platform Phase 2 Remaining Gaps Review

## 1. 目的

这份文档用于在 `platform-phase2-desktop-closure` 分支上，对第二份计划当前状态做一次事实盘点，明确：

- 已经闭环的能力
- 仍然存在的剩余缺口
- 下一阶段的建议优先级

## 2. 当前已基本闭环的能力

结合当前代码、测试和最新验证记录，以下能力已基本成型：

- 租户登录主入口
- 在线初始化主链路
- 平台模型下发与默认模型自动选中
- Skill 只读清单下发
- 本地 Skill 探测与状态回填
- 手动下载 Skill
- 聊天审计主链路
- 初始化进度展示
- 审计总状态 / 本地缓冲状态 / 平台审计服务状态展示
- 管理端最小模型中心、Skill 中心、审计中心、会话中心
- 平台后台本地测试 + 真实 PostgreSQL 认证链路验证

## 3. 剩余缺口

### Gap 1：桌面端主状态机还没有显式落 `SessionRecoveryOrLogout`

设计文档中桌面端目标状态机是：

1. `Login`
2. `Initializing`
3. `Workspace`
4. `SessionRecoveryOrLogout`

但当前 `src/renderer/src/platform/PlatformProvider.tsx` 里的 `PlatformStage` 仍只有：

- `login`
- `initializing`
- `workspace`

这说明刷新失败后的“恢复中 / 强制退出中”还没有独立状态面，当前更多是直接回退到登录路径。

影响：

- 用户感知层面缺少一个显式的会话恢复过渡状态
- 后续若要补更细的刷新中提示、批量补传恢复、统一退出原因展示，边界还不够清晰

### Gap 2：运行审计已开始引入 `run.*` 事件族，但覆盖范围仍有限

当前仓库里可以看到的审计事件主要集中在：

- `auth.*`
- `workspace.*`
- `model.*`
- `chat.*`
- `run.skill.sync.*`
- `run.skill.download.*`

这说明当前已经有了最小 `run.*` 入口，但它目前只覆盖了 Skill 相关运行行为。

这意味着第二份计划里提到的“聊天与运行审计完整接入”，目前更接近：

- 聊天审计已接上
- 与 Skill 探测、Skill 下载相关的运行面已接上 `run.*`
- 更广义的运行执行事件仍未沉淀为统一事件模型

影响：

- 平台侧已经可以区分一部分“非聊天运行行为”
- 后续如果要做执行链路排障、租户运行行为追踪，事件模型还需要补齐

### Gap 3：真实 PostgreSQL live tests 目前只覆盖认证链路

当前 `platform-admin/backend/src` 中带 `#[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]` 的 live tests 都在 `auth.rs`。

已经验证通过的真实库能力包括：

- 超级管理员播种
- 登录认证
- 刷新令牌续期

但以下关键平台能力还没有对应的 ignored live tests：

- 桌面执行端 bootstrap / model profiles / skill catalog
- 审计写入与健康检查
- 审计中心查询
- 会话中心查询
- 模型配置管理
- Skill catalog 管理

影响：

- 当前真实库验证更偏“认证可用”，还不是“整条平台闭环可用”
- 一旦后续数据库结构或查询语句调整，回归保护还不够强

### Gap 4：Gateway 仍保留进程与 IPC 能力，只是桌面端界面隐藏

这项严格来说不算偏离需求，因为已确认要求是“只在桌面端界面隐藏”。

但从代码事实上看：

- `src/main/index.ts` 仍注册 `start-gateway` / `stop-gateway` / `gateway-status`
- `src/preload/index.ts` 与 `src/preload/index.d.ts` 仍暴露对应 API

所以当前达成的是：

- UI 不展示 Gateway
- 进程能力与 IPC 能力仍然保留

这和已确认需求是一致的，但如果后续产品口径升级为“第一阶段彻底不可触达 Gateway”，则还需要单独切片处理。

## 4. 建议优先级

如果继续按“平台稳定优先”推进，建议顺序如下：

1. **优先补 Gap 3**：给桌面执行端 API、审计写入、审计中心、会话中心补真实 PostgreSQL live tests
2. **再补 Gap 2**：继续扩展 `run.*`，明确哪些非聊天执行行为都应归入该事件族
3. **然后补 Gap 1**：在桌面端引入显式 `SessionRecoveryOrLogout` 状态面
4. **Gap 4 暂不处理**：除非产品口径从“界面隐藏”升级为“能力禁用”

## 5. 本轮结论

当前分支已经具备较完整的第二份计划骨架，剩余工作不再是“大面积缺功能”，而是三类收口工作：

- 真实环境回归保护补强
- 运行审计模型补齐
- 状态机边界收口

这意味着后续每一刀都应该继续保持“小切片 + 文档 + 测试 + 推送”的节奏，不建议再做大而混杂的改造。
