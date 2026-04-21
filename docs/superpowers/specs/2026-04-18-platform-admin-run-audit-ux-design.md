# Platform Admin Run Audit UX Design

## 1. 背景

桌面端第二份计划已经把以下运行审计稳定接入平台：

- `run.model.*`
- `run.skill.*`
- `run.tool.*`

但当前管理端审计中心仍然主要展示：

- `eventType`
- 账号
- 时间
- 原始 `payload` JSON

这意味着虽然数据已经进平台，但一线排障时仍需要直接读原始 JSON，可读性不够好。

## 2. 目标

本次只做一个最小但实用的审计中心收口：

1. 增加按事件族前缀筛选的能力
2. 给 `run.*` 事件提供更友好的摘要展示

## 3. 方案

### 3.1 后端筛选能力

在现有 `eventType` 精确匹配之外，再补一个可选参数：

- `eventPrefix`

规则：

- 空值表示不筛选
- 非空时按 `event_type LIKE '<prefix>%'` 过滤
- 可与 `eventType` 共存；如果两者都传，则同时生效

### 3.2 前端筛选交互

审计中心新增 `Event family` 下拉框，选项为：

- `All events`
- `Run events`
- `Chat events`
- `Auth events`
- `Workspace events`

它们分别映射为：

- `""`
- `run.`
- `chat.`
- `auth.`
- `workspace.`

仍保留原有 `Event type` 精确筛选输入框。

### 3.3 `run.*` 摘要展示

对于审计中心列表中的 `run.*` 事件，增加一行人类可读摘要：

- `run.tool.*`
  - 展示 `source` / `lastLabel` / `progressCount` / `error`
- `run.model.*`
  - 展示 `modelId` / `error`
- `run.skill.*`
  - 展示 `skillId` / 关键统计字段 / `error`

原始 JSON 仍保留，作为补充排障信息。

## 4. 边界

本次不做：

- 审计中心图表统计
- 多条件保存的复杂查询器
- 按账号筛选
- `payload` 全文检索
- 会话中心联动跳转

## 5. 验证

至少覆盖：

1. 后端支持 `eventPrefix` 过滤
2. 前端筛选会带上 `eventPrefix`
3. `run.tool.*` / `run.model.*` / `run.skill.*` 能展示更友好的摘要
