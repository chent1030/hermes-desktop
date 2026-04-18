# Platform Run Audit Expansion Design

## 1. 背景

当前桌面端第二份计划里，运行审计已经具备：

- `run.skill.download.*`
- `run.skill.sync.*`
- `chat.*`

但仍有两类运行时行为没有进入统一的 `run.*` 事件族：

1. 工作区内的模型切换
2. 聊天过程中的工具运行进度

这会造成平台侧虽然能看到聊天开始/结束和 Skill 动作，但对“用户切了哪个模型”“聊天中实际触发了哪些工具”仍缺少统一视图。

## 2. 目标

在不改 `chat.*` 会话聚合逻辑的前提下，继续扩展 `run.*`，让平台能看到：

- 模型切换成功 / 失败
- 工具运行进度

## 3. 方案

采用最小增量方案：

- `model.selected` -> `run.model.selected`
- `model.select.failed` -> `run.model.select.failed`
- 新增 `run.tool.progress`

其中：

- `auth.*` 仍表示认证链路事件
- `workspace.*` 仍表示初始化 / 工作区生命周期事件
- `chat.*` 仍只服务会话中心聚合
- `run.*` 继续承接“非聊天生命周期、但属于运行执行面的行为”

## 4. 事件规则

### 4.1 模型切换

- 成功：
  - 事件名：`run.model.selected`
  - payload：`{ modelId }`
- 失败：
  - 事件名：`run.model.select.failed`
  - payload：`{ modelId, error }`

### 4.2 工具运行进度

- 事件名：`run.tool.progress`
- 触发点：
  - API 流式返回里的 `hermes.tool.progress`
  - API 流中兼容的旧式内嵌工具进度文本
- payload 建议包含：
  - `label`
  - `sessionId`
  - `resumeSessionId`
  - `profile`
  - `source`，取值 `api`

本次不做：

- 工具开始 / 完成 / 失败三段式事件
- CLI fallback 下的工具进度解析增强
- 会话中心按 `run.tool.*` 聚合

## 5. 影响面

- `src/main/platform/index.ts`
- `src/main/hermes.ts`
- 运行审计相关测试
- 平台 README 与剩余缺口文档

## 6. 验证

至少覆盖：

1. 模型切换成功 / 失败走 `run.model.*`
2. API 流式工具进度能写入 `run.tool.progress`
3. `chat.*` 事件族和会话中心聚合逻辑不受影响
