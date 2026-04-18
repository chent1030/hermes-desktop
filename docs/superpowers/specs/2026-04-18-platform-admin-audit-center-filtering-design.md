# Platform Admin 审计中心筛选与分页增强设计

## 1. 背景

上一切片已经把平台管理端的审计中心最小可查视图打通，当前能力为：

- 超级管理员查看指定租户最近审计事件
- 租户管理员查看本租户最近审计事件
- 默认按时间倒序返回最近 100 条
- 前端能展示事件类型、账号、时间和 payload 摘要

这已经完成了“桌面端上报 - 平台入库 - 管理端可看”的基础闭环。

但当前能力仍有两个明显缺口：

1. 审计量一旦增长，后台无法快速定位某类事件
2. 首版只能看最近一批数据，不能继续向后翻看

因此下一小步聚焦：**给审计中心补上基础筛选和简单分页骨架**。

## 2. 本次范围

本次只做以下能力：

1. 按事件类型筛选
2. 按发生时间范围筛选
3. 按 `beforeId` 做简单向后翻页
4. 管理端最小可用筛选 UI
5. 文档补齐

本次明确不做：

- 多条件复杂组合保存
- 全文检索 payload
- 按账号筛选
- 高级排序切换
- 总量统计
- 图表看板
- CSV/Excel 导出

## 3. 查询模型设计

继续复用上一切片的审计查询接口，但增加可选查询参数。

### 3.1 超级管理员接口

- `GET /api/admin/audit/events?tenantId=<id>&limit=<n>&eventType=<type>&occurredFrom=<iso>&occurredTo=<iso>&beforeId=<id>`

### 3.2 租户管理员接口

- `GET /api/admin/tenant/audit/events?limit=<n>&eventType=<type>&occurredFrom=<iso>&occurredTo=<iso>&beforeId=<id>`

## 4. 参数规则

### 4.1 `tenantId`

- 超级管理员仍然必须传 `tenantId`
- 租户管理员继续由服务端自动绑定当前租户

### 4.2 `eventType`

- 可选
- 精确匹配 `event_type`
- 空字符串视为不筛选

### 4.3 `occurredFrom` / `occurredTo`

- 可选
- 采用 ISO 8601 字符串
- 含义：
  - `occurredFrom`：`occurred_at >= occurredFrom`
  - `occurredTo`：`occurred_at <= occurredTo`
- 非法时间格式返回 `400`

### 4.4 `beforeId`

- 可选
- 用于简单向后翻页
- 当存在时，只返回 `id < beforeId` 的记录
- 仍按 `occurred_at DESC, id DESC` 排序

### 4.5 `limit`

- 默认 `100`
- 最大 `200`
- 小于等于 `0` 时回落默认值

## 5. 前端交互设计

### 5.1 超级管理员审计中心

新增筛选区：

- `Event type`
- `Occurred from`
- `Occurred to`
- `Limit`
- `Apply filters`

交互规则：

- 仍需先选租户
- 点击 `Apply filters` 后重新加载第一页
- 若当前页记录数等于 limit，则显示 `Load older events`
- 点击后带上最后一条记录的 `id` 继续向后加载，并追加到当前列表

### 5.2 租户管理员审计中心

同样显示筛选区，但不显示租户切换。

## 6. 状态与分页规则

前端维护：

- `auditFilters`
- `auditLimit`
- `auditHasMore`
- `isLoadingAudit`

加载第一页时：

- 替换列表
- 重算 `hasMore`

加载更多时：

- 追加列表
- 使用最后一条记录 `id` 作为 `beforeId`

## 7. 测试策略

至少覆盖：

1. 后端支持按 `eventType` 筛选
2. 后端支持按 `beforeId` 向后翻页
3. 非法时间格式返回 `400`
4. 超级管理员前端显示筛选表单
5. 租户管理员前端也可使用筛选
6. `Load older events` 能触发下一页请求

## 8. 后续边界

完成这一小步后，审计中心会从“只能看最近一批”升级为“可以按基础条件查找并向后翻页”。

后续再继续扩展：

- 按账号筛选
- payload 关键字检索
- 会话中心联动
- 审计导出
- 统计看板
