# Platform Skill Sync Audit Detail Design

## 1. 背景

桌面端第二份计划已经完成：

- 平台 Skill 只读清单下发
- 本地 Skill 探测
- Skill 页基于平台清单与本地状态合并展示
- `run.skill.sync.completed` / `run.skill.sync.failed` 审计事件上报

但当前 `run.skill.sync.completed` 的审计 payload 只有：

- `installedCount`
- `totalCount`

这不足以支撑生产排障与合规审计，平台侧无法直接判断一次探测里到底有多少 Skill 处于：

- 已下载未装配
- 已安装可用
- 版本落后
- 本地异常
- 尚未下载

## 2. 目标

在不改变现有桌面端 Skill UI、不改变平台接口结构的前提下，补强 Skill 探测完成事件的审计细节，让平台侧能从单个审计事件直接读出本机 Skill 探测分布。

## 3. 方案

采用最小增强方案：

- 保留事件名 `run.skill.sync.completed`
- 保留现有 `installedCount` / `totalCount`
- 新增分状态统计字段：
  - `downloadedCount`
  - `outdatedCount`
  - `brokenCount`
  - `notDownloadedCount`
- 新增 `scopeBreakdown`：按 `global` / `tenant` 统计总量

不采用“把每个 Skill 明细都塞进事件 payload”的原因：

- payload 会明显膨胀
- 当前阶段更需要稳定聚合数据，而不是把 Skill 清单复制一遍到审计流
- 后续若需要逐 Skill 追踪，可单独切片补 `skill.detected` 明细事件

## 4. 数据规则

对一次 `platformSyncSkillInstallations()` 结果：

- `installedCount`：`status = installed`
- `downloadedCount`：`status = downloaded`
- `outdatedCount`：`status = outdated`
- `brokenCount`：`status = broken`
- `notDownloadedCount`：`status = not-downloaded`
- `totalCount`：全部平台 Skill 数量
- `scopeBreakdown.global`：平台全局 Skill 数量
- `scopeBreakdown.tenant`：租户 Skill 数量

说明：

- `installedCount` 不再混入 `outdated` / `broken`
- 各状态计数之和应等于 `totalCount`
- 本次不新增额外错误级别；错误仍沿用 `run.skill.sync.failed`

## 5. 影响面

修改范围保持最小：

- `src/main/platform/index.ts`
- `tests/platform-skill-sync.test.ts`
- 文档记录

不会影响：

- Skill 页渲染
- 平台执行端 API
- 会话中心聚合逻辑
- 现有聊天审计链路

## 6. 验证

至少覆盖：

1. 混合状态 Skill 探测时，`run.skill.sync.completed` 事件包含完整状态统计
2. 统计值与返回给 UI 的本地状态映射一致
3. 原有 `platformSyncSkillInstallations()` 返回值保持兼容
