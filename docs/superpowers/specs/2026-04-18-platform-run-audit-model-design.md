# Platform Run Audit Model Design

## 1. 背景

当前桌面端平台审计事件主要分为：

- `auth.*`
- `workspace.*`
- `model.*`
- `chat.*`
- `skill.download.*`
- `skill.sync.*`

其中：

- `chat.*` 已用于会话中心按 `sessionId` 聚合
- `skill.*` 事件虽然表达的是桌面运行行为，但没有进入统一的 `run.*` 事件族

这会导致平台侧难以快速区分：

- 聊天会话事件
- 一般运行执行事件
- 配置与会话控制事件

## 2. 目标

先建立最小可用的 `run.*` 事件族，作为“非聊天运行行为”的统一入口。

本次只覆盖：

- Skill 手动下载
- Skill 本地探测同步

明确不在本次处理：

- `chat.*` 重命名
- `auth.*` / `workspace.*` / `model.*` 收编进 `run.*`
- 会话中心查询逻辑调整

## 3. 方案选择

### 方案 A：直接把现有 `skill.*` 重命名为 `run.skill.*`（采用）

采用原因：

- 语义最清晰
- 平台审计中心可以直接按 `run.` 前缀筛选
- 不会产生重复事件

### 方案 B：保留 `skill.*`，再额外重复发一份 `run.*`（不采用）

不采用原因：

- 会重复写入审计事件
- 会放大平台侧存储与排障噪音
- 同一行为出现两份审计，不利于后续统计

### 方案 C：保留事件名，仅新增 `category=run` 字段（不采用）

不采用原因：

- 平台查询和筛选仍不够直接
- 当前代码和文档都以事件名族为主

## 4. 事件模型

本次把以下事件重命名为：

- `skill.download.clicked` -> `run.skill.download.clicked`
- `skill.download.failed` -> `run.skill.download.failed`
- `skill.sync.completed` -> `run.skill.sync.completed`
- `skill.sync.failed` -> `run.skill.sync.failed`

说明：

- payload 结构保持不变
- `run.skill.sync.completed` 继续保留已补齐的聚合字段
- `chat.*` 继续只服务会话中心
- `run.*` 当前作为“非聊天运行行为”入口，不参与会话聚合

## 5. 影响面

需要同步调整：

- 桌面端主进程事件发射点
- Skill 同步测试
- 新增 Skill 下载测试
- 平台 README 中的事件说明
- 相关新文档中对 `skill.sync.completed` 的命名描述

不会影响：

- 审计写入表结构
- 审计中心查询接口
- 会话中心按 `chat.*` 聚合的逻辑

## 6. 验证

至少覆盖：

1. Skill 手动下载点击与失败走 `run.skill.download.*`
2. Skill 本地探测同步走 `run.skill.sync.*`
3. `run.skill.sync.completed` 的 payload 聚合统计保持不变
4. 会话中心仍只聚合 `chat.*`，不受影响
