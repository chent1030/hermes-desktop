# Platform Session Run Linkage Design

## 1. 背景

当前平台已经同时具备：

- 会话中心：按 `chat.* + payload.sessionId` 聚合最近会话
- 运行审计：`run.tool.*`

但这两条线目前还是分开的：

- 会话中心只能看到聊天最近状态
- 审计中心能看到工具运行事件
- 管理端仍无法在“会话视角”下一眼看出某个会话是否使用过工具、最后一个工具是什么、是否出现过工具失败

## 2. 目标

在不引入新表的前提下，把 `run.tool.*` 最小联动到会话中心，让每条会话摘要除了聊天状态外，还能带上基础执行信号。

## 3. 方案

继续复用 `platform_audit_events`，按 `payload.sessionId` 做补充聚合。

本次为 `SessionSummaryRecord` 新增：

- `toolRunCount`
- `lastToolLabel`
- `lastToolSource`
- `hasToolFailure`

聚合规则：

- 仅统计同一租户、同一 `payload.sessionId` 下的 `run.tool.*`
- `toolRunCount`：统计 `run.tool.started` 次数
- `lastToolLabel`：最近一条 `run.tool.*` 的 `lastLabel` 或 `label`
- `lastToolSource`：最近一条 `run.tool.*` 的 `source`
- `hasToolFailure`：会话内出现过 `run.tool.failed` 即为 `true`

## 4. 前端展示

会话中心列表项在现有字段外，补一行最小执行摘要：

- `Tools: <count>`
- `Last tool: <label>`
- `Source: <source>`
- 若 `hasToolFailure = true`，显示 `Tool failed`

## 5. 边界

本次不做：

- 工具时间线详情页
- 工具调用参数/结果展示
- 审计中心与会话中心跳转联动
- `run.model.*` / `run.skill.*` 进入会话聚合

## 6. 验证

至少覆盖：

1. 会话中心记录支持携带工具执行聚合字段
2. 前端会话中心能展示工具执行摘要
3. 现有聊天会话筛选与分页行为不受影响
