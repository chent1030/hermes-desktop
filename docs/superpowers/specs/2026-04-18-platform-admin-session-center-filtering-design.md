# Platform Admin 会话中心筛选与分页增强设计

## 1. 背景

上一顺位切片已经把平台管理端的会话中心最小只读视图打通，当前能力为：

- 超级管理员查看指定租户最近会话
- 租户管理员查看本租户最近会话
- 后端继续复用 `platform_audit_events`，按 `payload.sessionId` 聚合最近会话
- 前端能展示 `sessionId`、最近事件类型、最近账号、最近时间、事件数和失败标记

这已经完成了“桌面端聊天审计 - 平台聚合 - 管理端可看”的第一层闭环。

但当前会话中心仍有两个明显缺口：

1. 会话一旦变多，后台无法快速定位失败会话或特定状态会话
2. 首版只能看到最近一批会话，不能继续向后翻看

因此下一小步聚焦：**给会话中心补上基础筛选与简单分页骨架**。

## 2. 方案比较与结论

本次设计阶段评估了三种路径：

### 2.1 方案 A：`lastEventType + hasFailure + 时间范围 + beforeId`（最终选定）

做法：

- 基于当前会话汇总结果增加基础筛选参数
- 保持和审计中心增强版相同的交互风格
- 用简单向后翻页代替复杂 cursor 协议

优点：

- 与审计中心能力模型一致，管理端使用体验统一
- 能直接支持“只看失败会话”“只看最近完成会话”“看某时间段会话”这些最常见运营场景
- 改动面可控，不需要重做会话汇总模型

缺点：

- 仍然属于最小能力，不覆盖账号筛选、详情页、导出等高级场景

### 2.2 方案 B：只做 `hasFailure + 时间范围 + 分页`

做法：

- 只保留最轻量的失败态和时间范围筛选

不选原因：

- 缺少 `lastEventType` 后，很多“只看最近失败 / 最近完成 / 最近开始”的场景还得人工翻列表
- 这一轮仍然要再做一次接口改造，整体并不比方案 A 省太多

### 2.3 方案 C：直接加入更丰富筛选，如账号、事件数区间、关键词

做法：

- 一次性扩充为更完整的会话检索器

不选原因：

- 当前阶段过重
- 会把“最小只读会话中心”和“会话详情检索台”混在一起
- 不符合当前“一刀一收口”的节奏

最终采用：**方案 A**。

## 3. 本次范围

本次只做以下能力：

1. 按最近事件类型筛选会话
2. 按失败标记筛选会话
3. 按最近发生时间范围筛选会话
4. 按 `beforeId` 做简单向后翻页
5. 管理端最小可用筛选 UI
6. README 与实现文档补齐

本次明确不做：

- 按账号筛选
- transcript / 会话详情页
- 会话导出
- 图表统计
- 审计中心联动跳转
- 独立会话表或物化投影

也就是说，本次只做“更容易查会话”，不做“会话中心完整版”。

## 4. 查询模型设计

继续复用上一切片的会话中心接口，但增加可选查询参数。

### 4.1 超级管理员接口

- `GET /api/admin/sessions?tenantId=<id>&limit=<n>&lastEventType=<type>&hasFailure=<bool>&lastOccurredFrom=<iso>&lastOccurredTo=<iso>&beforeId=<sessionId>`

### 4.2 租户管理员接口

- `GET /api/admin/tenant/sessions?limit=<n>&lastEventType=<type>&hasFailure=<bool>&lastOccurredFrom=<iso>&lastOccurredTo=<iso>&beforeId=<sessionId>`

## 5. 参数规则

### 5.1 `tenantId`

- 超级管理员仍然必须传 `tenantId`
- 租户管理员继续由服务端自动绑定当前租户

### 5.2 `lastEventType`

- 可选
- 精确匹配会话最近一条事件类型
- 空字符串视为不筛选
- 只对会话汇总后的 `lastEventType` 生效，不是对原始事件表做任意事件匹配

### 5.3 `hasFailure`

- 可选
- 允许值：`true` / `false`
- `true` 表示只返回出现过 `chat.failed` 的会话
- `false` 表示只返回没有失败标记的会话
- 缺省时不筛选
- 非法布尔值返回 `400`

### 5.4 `lastOccurredFrom / lastOccurredTo`

- 可选
- 使用 ISO 8601 字符串
- 含义：
  - `lastOccurredFrom`：`lastOccurredAt >= lastOccurredFrom`
  - `lastOccurredTo`：`lastOccurredAt <= lastOccurredTo`
- 非法时间格式返回 `400`

### 5.5 `beforeId`

- 可选
- 用于简单向后翻页
- 这里的 `beforeId` 实际承载的是当前分页边界会话的 `sessionId`
- 服务端以当前排序规则为基础，只返回排在该会话之后的更旧会话
- 仍按 `lastOccurredAt DESC, sessionId DESC` 排序

说明：

- 本次为了与审计中心交互一致，参数名继续使用 `beforeId`
- 虽然这里承载的是 `sessionId` 字符串，但仍属于“上一条记录主键向后翻页”的同一模式

### 5.6 `limit`

- 默认 `100`
- 最大 `200`
- 小于等于 `0` 时回落默认值

## 6. 后端筛选与分页规则

### 6.1 聚合顺序

后端仍然先从 `platform_audit_events` 生成最小会话汇总结果，再在汇总结果上做筛选和分页：

1. 只读取当前租户范围内的 `chat.*` 事件
2. 仅保留 `payload.sessionId` 非空的事件
3. 按 `sessionId` 聚合出：
   - `lastEventType`
   - `lastOccurredAt`
   - `lastAccount`
   - `eventCount`
   - `hasFailure`
4. 再对汇总结果应用筛选参数
5. 最后按 `lastOccurredAt DESC, sessionId DESC` 返回

### 6.2 `beforeId` 翻页规则

简单向后翻页规则如下：

- 服务端先定位 `beforeId` 对应会话的排序锚点：`lastOccurredAt + sessionId`
- 返回所有满足以下条件的会话：
  - `lastOccurredAt < anchor.lastOccurredAt`
  - 或者 `lastOccurredAt = anchor.lastOccurredAt && sessionId < anchor.sessionId`
- 若 `beforeId` 不存在于当前筛选结果中，则返回 `400`

这样可以保持：

- 分页结果稳定
- 不必引入复杂 token
- 与现有简单分页风格一致

## 7. 管理端前端设计

### 7.1 超级管理员会话中心

新增筛选区：

- `Last event type`
- `Has failure`
- `Last occurred from`
- `Last occurred to`
- `Limit`
- `Apply filters`

交互规则：

- 仍需先选租户
- 点击 `Apply filters` 后重新加载第一页
- 若当前页记录数等于 limit，则显示 `Load older sessions`
- 点击后带上最后一条会话记录的 `sessionId` 继续向后加载，并追加到当前列表

### 7.2 租户管理员会话中心

同样显示筛选区，但不显示租户切换。

## 8. 前端状态规则

前端新增并维护：

- `sessionFilters`
- `sessionHasMore`
- `isLoadingSessions`

加载第一页时：

- 替换会话列表
- 重算 `hasMore`

加载更多时：

- 追加列表
- 使用最后一条会话记录的 `sessionId` 作为 `beforeId`

## 9. 测试策略

至少覆盖：

1. 后端支持按 `lastEventType` 筛选
2. 后端支持按 `hasFailure` 筛选
3. 后端支持按 `beforeId` 做简单向后翻页
4. 非法 `hasFailure` 返回 `400`
5. 非法时间格式返回 `400`
6. 前端显示会话筛选表单
7. `Load older sessions` 能触发下一页请求

## 10. 后续边界

完成这一小步后，会话中心会从“只能看最近会话列表”升级为“可以按基础条件查找并继续向后翻页”。

后续再继续扩展：

- 按账号筛选
- 会话详情页
- transcript 摘要
- 与审计中心联动
- 会话导出
- 统计看板

这样可以继续保持“先稳住最小闭环，再逐步加深能力”的节奏。
