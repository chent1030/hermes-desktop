# Platform Run Tool Lifecycle Design

## 1. 背景

当前桌面端已经具备最小 `run.tool.progress` 事件，但仍有两个明显缺口：

1. 只有进度事件，没有完整生命周期
2. 只有 API 流式链路接了工具进度，CLI fallback 还没有统一接入

这会导致平台虽然能看到部分工具运行痕迹，但仍然无法稳定判断：

- 某次聊天里是否真的进入过工具运行阶段
- 工具运行最终是正常收尾还是失败中断
- API 与 CLI 两条执行链路的审计是否一致

## 2. 目标

在不改变 `chat.*` 会话聚合逻辑的前提下，为工具运行补齐最小生命周期：

- `run.tool.started`
- `run.tool.progress`
- `run.tool.completed`
- `run.tool.failed`

并保证 API 流式与 CLI fallback 两条链路的行为一致。

## 3. 方案

采用“按一次聊天中的工具运行阶段聚合”的最小方案，而不是按单个工具调用做复杂建模。

具体规则：

- 第一次探测到工具进度时：
  - 发 `run.tool.started`
  - 同时发当次 `run.tool.progress`
- 后续每次工具进度：
  - 继续发 `run.tool.progress`
- 如果该次聊天最终成功结束，且期间出现过工具进度：
  - 发 `run.tool.completed`
- 如果该次聊天最终失败，且期间出现过工具进度：
  - 发 `run.tool.failed`

## 4. Payload 规则

### 4.1 started

- `label`
- `sessionId`
- `resumeSessionId`
- `profile`
- `source`，取值 `api` 或 `cli`

### 4.2 progress

- `label`
- `sessionId`
- `resumeSessionId`
- `profile`
- `source`

### 4.3 completed

- `sessionId`
- `resumeSessionId`
- `profile`
- `source`
- `progressCount`
- `lastLabel`

### 4.4 failed

- `sessionId`
- `resumeSessionId`
- `profile`
- `source`
- `progressCount`
- `lastLabel`
- `error`

## 5. CLI 一致性规则

CLI fallback 当前会把 stdout 直接透传给聊天窗口。

本次补充规则：

- 如果 stdout 行命中工具进度样式 `` `emoji label` `` 或裸文本 `emoji label`
- 则：
  - 触发 `onToolProgress`
  - 写入 `run.tool.*` 审计
  - 不再把这类进度行当普通回答正文透传到聊天内容里

普通回答内容仍按现有逻辑透传。

## 6. 边界

本次不做：

- 按单个工具调用生成独立 `toolId`
- 工具入参与出参审计
- CLI 复杂多行工具块解析
- 平台会话中心按 `run.tool.*` 建立聚合视图

## 7. 验证

至少覆盖：

1. API 流式工具进度触发 `started -> progress -> completed`
2. API 流式工具进度后遇到流错误，触发 `run.tool.failed`
3. CLI fallback 检出工具进度并产生与 API 一致的生命周期事件
