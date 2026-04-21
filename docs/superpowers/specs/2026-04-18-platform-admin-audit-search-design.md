# Platform Admin Audit Search Design

## 1. 背景

当前管理端审计中心已经支持：

- `eventType` 精确筛选
- `eventPrefix` 事件族筛选
- `run.*` 事件摘要展示

但一线排障时仍有两个明显短板：

1. 无法直接按账号定位某个操作者的行为
2. 无法按 `payload` 中的关键字做快速检索

这会导致平台管理员或租户管理员需要翻页查找，或直接依赖数据库查询，降低管理端作为“最小运维工作台”的实际价值。

## 2. 目标

本次只补两个最小但高频的检索能力：

1. 审计中心支持按账号关键字筛选
2. 审计中心支持按 `payload` 关键字检索

要求保持当前权限边界不变：

- 超级管理员仍只能在指定租户范围内查审计
- 租户管理员仍只能查本租户审计
- 仅增强检索能力，不改事件模型，不做统计图表

## 3. 方案

### 3.1 后端查询参数扩展

在 `AuditEventQuery` 中新增两个可选字段：

- `account_query`
- `payload_query`

HTTP 查询参数统一使用 camelCase：

- `accountQuery`
- `payloadQuery`

规则如下：

- 空字符串按未传处理
- `accountQuery` 对账号名与展示名做模糊匹配
- `payloadQuery` 对审计事件 `payload` 的文本化内容做模糊匹配
- 可与已有 `eventType`、`eventPrefix`、时间范围、分页参数叠加使用

### 3.2 PostgreSQL 过滤规则

PostgreSQL 查询在现有条件基础上新增：

- `a.username ILIKE '%' || $param || '%'`
- `a.display_name ILIKE '%' || $param || '%'`
- `e.payload::text ILIKE '%' || $param || '%'`

其中：

- 账号筛选同时匹配 `username` 与 `display_name`
- `payload` 检索使用 `payload::text`，优先满足第一期可用性，不额外引入 JSON 索引优化

这是一个“先打稳平台”的最小增强，后续如果检索压力升高，再评估 GIN / trigram 等索引策略。

### 3.3 内存测试存根行为对齐

`MemoryAuditCenterStore` 也同步实现同样的逻辑：

- 账号筛选命中 `username` 或 `display_name`
- `payload` 检索命中 `payload.to_string()` 的包含关系

这样可以保证 Rust 单测先锁定行为，再落 PostgreSQL 实现。

### 3.4 前端筛选交互

审计中心筛选表单新增两个输入项：

- `Account`
- `Payload contains`

交互规则：

- 两项均为可选文本框
- 点击 `Apply filters` 时拼到请求 URL
- 点击 `Load older events` 时沿用同一组筛选条件继续分页

本次仍然不做：

- 高级搜索语法
- 多字段组合保存
- 高亮命中关键字
- 会话中心联动跳转

## 4. 边界与权衡

本方案选择“文本模糊检索优先”，优点是：

- 改动小，能直接并入现有审计中心
- 适合当前第二份计划的收口节奏
- 前后端测试都容易覆盖

代价是：

- `payload::text` 检索更偏运维检索，不是高性能全文搜索方案
- 大数据量场景下仍可能需要后续索引与专门检索服务

这属于可接受权衡，因为当前目标是补齐平台最小排障能力，而不是建设完整搜索系统。

## 5. 验证

至少覆盖以下验证：

1. Rust 单测覆盖 `accountQuery` 过滤
2. Rust 单测覆盖 `payloadQuery` 过滤
3. 前端测试覆盖 `Apply filters` 会把 `accountQuery` / `payloadQuery` 拼到请求 URL
4. `Load older events` 继续沿用新增筛选参数
5. `platform-admin/README.md` 与剩余缺口文档同步更新
