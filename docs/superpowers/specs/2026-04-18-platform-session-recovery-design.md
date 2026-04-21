# Platform Session Recovery Stage Design

## 1. 背景

第二份计划定义的桌面端主状态机目标包括：

1. `Login`
2. `Initializing`
3. `Workspace`
4. `SessionRecoveryOrLogout`

但当前实现里 `PlatformProvider` 只有：

- `login`
- `initializing`
- `workspace`

导致刷新令牌失败或审计状态进入 `reauth-required` 时，桌面端会直接跳回登录路径，用户看不到明确的“正在恢复 / 正在退出”过渡态。

## 2. 目标

在不改变当前平台主链路的前提下，补一个最小可用的显式恢复阶段，让用户能感知到：

- 会话已经失效
- 桌面端正在清理内存态
- 即将返回登录页

## 3. 方案

采用最小阶段扩展方案：

- `PlatformStage` 新增 `session-recovery`
- 仅在以下两条自动链路进入该阶段：
  - `refreshTenantSession()` 失败
  - `getAuditStatus()` 返回 `reauth-required`
- 进入该阶段后立即执行：
  - 记录恢复原因
  - 调用 `logoutTenant()`
  - 清理内存中的工作区态 / 审计态 / 初始化态
  - 回到 `login`

不采用“停留在恢复页等待用户点击”的原因：

- 已确认应用退出后必须重新登录，不需要额外确认步骤
- 当前阶段目标是状态清晰，而不是增加额外交互

## 4. UI 规则

新增一个最小恢复页，展示：

- 标题：正在恢复会话 / Recovering session
- 说明：平台会话已失效，正在清理内存中的工作区状态
- 次级提示：即将返回登录页
- 原因：若有错误文本则原样展示

该页面只作为短暂过渡态，不承载按钮与额外操作。

## 5. 影响面

- `PlatformProvider` 状态机扩展
- `DesktopRoot` 渲染分支扩展
- 中英文平台文案补充
- 渲染层测试补充

不会影响：

- 平台后端 API
- 会话中心 / 审计中心查询模型
- 桌面端初始化阶段状态机

## 6. 验证

至少覆盖：

1. 刷新令牌失败时出现 `session-recovery` 过渡态
2. 审计状态进入 `reauth-required` 时出现 `session-recovery` 过渡态
3. 恢复页中英文文案正确
