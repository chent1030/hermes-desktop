# Platform Admin 后端重规划设计

## 1. 背景

当前 `platform-admin/backend` 已经具备第一阶段平台后台的基础能力：

- 后台登录、刷新、上下文读取
- 租户与后台账号管理
- 模型配置与 Skill 目录管理
- 桌面端 bootstrap、模型下发、Skill 下发
- 审计接收、审计检索、会话中心最小视图

但现有后端仍处于“阶段 1 能跑通”的结构状态，主要特征为：

- 基于 `std::net` 与手写 HTTP 处理
- 各业务模块平铺在 `src/*.rs`
- 模块内部同时承担 HTTP、业务规则、SQL 和数据映射
- 各模块直连 PostgreSQL，同步连接与查询逻辑分散
- `admin` 与 `desktop` 两类业务边界已经出现，但尚未在代码结构上真正隔离

这使得当前代码虽然可继续扩展，但会越来越容易出现以下问题：

1. handler、业务规则、SQL 逐步缠绕，修改成本持续上升
2. `admin` 管理面与 `desktop` 交付面的模型和 DTO 相互污染
3. 权限判断分散在不同模块，后续难以演进为“角色 + 权限点 + 策略扩展”
4. 审计与会话能力越来越依赖复杂 SQL 聚合，长期会成为性能与维护风险
5. 后续接入 SSO、设备识别、密钥托管、Skill 发布流时缺少稳定的演进骨架

因此，本次设计不再针对单一接口或单一切片补丁式扩展，而是对管理平台后端做一次面向长期演进的重规划。

## 2. 目标与非目标

### 2.1 目标

本次重规划的目标如下：

1. 将平台后台后端升级为 **模块化单体**，而不是继续扩展“平铺式功能文件”
2. 将当前后端从 `std` 手写 HTTP 升级到现代 Rust Web 服务栈
3. 在一个部署单元内明确拆出两个业务子域：
   - `admin control plane`
   - `desktop delivery plane`
4. 抽出共享安全内核，为“角色 + 权限点 + 策略扩展”预留稳定结构
5. 明确应用层、领域层、基础设施层边界，避免业务规则继续散落
6. 为审计中心、会话中心、后台任务、投影表、可观测性、安全治理提供长期可扩展的底座

### 2.2 非目标

本次设计明确不做以下事情：

- 不拆分为微服务
- 不在本轮直接实现 SSO、KMS、MQ、复杂策略 DSL
- 不重做前端后台页面信息架构
- 不要求一次性重写所有后端文件
- 不把 Skill Hub 立即升格为完全独立的顶级服务

## 3. 方案比较与结论

### 3.1 方案 A：模块化单体 + 分层架构 + 双子域（最终选定）

做法：

- 保持一个进程、一个部署单元、一个主数据库
- 按业务 plane 拆成 `admin` 和 `desktop`
- 子域内部再拆 `api / application / domain / infrastructure`
- 安全能力抽成共享 `iam`
- 审计、任务、配置、观测等能力抽成共享内核与基础设施

优点：

- 最符合当前阶段“单体应用 + 清晰模块化 + 长期演进”的要求
- 业务边界清楚，但部署与运维复杂度可控
- 后续扩展 SSO、设备识别、策略引擎、Skill 发布流时不会推翻已有结构

缺点：

- 需要一次较系统的骨架重构
- 迁移阶段需要并行维护新旧结构一段时间

### 3.2 方案 B：模块化单体 + 强约束 Hexagonal

做法：

- 把所有外部依赖都抽象为 port
- 领域层尽量纯净，HTTP、数据库、任务系统全部作为 adapter 接入

优点：

- 长期测试性、替换性最强
- 领域边界最纯

不选原因：

- 当前阶段抽象成本偏高
- 过早引入较多模板化结构，会拖慢业务切换和迁移

### 3.3 方案 C：渐进式保守重构

做法：

- 先切到 `axum`
- 尽量保留现有模块布局
- 后续再慢慢拆层

优点：

- 短期改造风险较低

不选原因：

- 容易长期停留在“HTTP 栈升级了，但边界依旧混乱”的半重构状态
- 难以真正解决当前的结构性问题

最终采用：**方案 A**。

## 4. 总体架构

### 4.1 总体形态

后端采用 **模块化单体** 架构，但不是“大 `lib.rs` + 一组功能文件”，而是由以下三层组成：

1. **共享内核**
   - 稳定、通用、跨域复用的核心抽象
2. **业务子域**
   - `admin control plane`
   - `desktop delivery plane`
   - 共享安全核心 `iam`
3. **基础设施与装配层**
   - 数据库、HTTP、任务、配置、可观测性、安全组件、启动组装

### 4.2 双 plane 原则

#### `admin control plane`

负责平台控制面与租户控制面业务，包括：

- 租户与后台账号管理
- 角色分配与权限管理
- 模型配置与 Skill 目录管理
- 审计中心与会话中心的后台查询入口
- 平台配置、租户配置、运营控制动作

#### `desktop delivery plane`

负责桌面执行端交付与运行态接入，包括：

- 登录后的 bootstrap
- 模型与 Skill 的有效配置下发
- 会话恢复上下文读取
- 审计/状态/运行态回传
- 版本协商、客户端能力识别、设备/实例扩展点

这两个 plane：

- 共享数据库、认证内核、审计能力、任务系统、通用中间件
- 但不共享应用服务，不混用 DTO，不直接互调 handler 或 use case

### 4.3 共享安全核心 `iam`

`iam` 作为共享业务核心域存在，负责：

- 认证
- 授权
- 主体建模
- 会话与令牌生命周期
- 角色、权限点、作用域与策略判定

其重要性高于单纯“工具模块”，但又不属于 `admin` 或 `desktop` 任一 plane，因此独立成共享核心域。

## 5. 目录结构设计

建议目录结构如下：

```text
platform-admin/backend/
├── Cargo.toml
├── src/
│   ├── main.rs
│   ├── lib.rs
│   ├── bootstrap/
│   │   ├── mod.rs
│   │   ├── config.rs
│   │   ├── app_state.rs
│   │   ├── router.rs
│   │   └── startup.rs
│   ├── kernel/
│   │   ├── mod.rs
│   │   ├── error.rs
│   │   ├── result.rs
│   │   ├── ids.rs
│   │   ├── time.rs
│   │   ├── paging.rs
│   │   ├── audit.rs
│   │   └── outbox.rs
│   ├── infrastructure/
│   │   ├── mod.rs
│   │   ├── db/
│   │   ├── http/
│   │   ├── telemetry/
│   │   ├── security/
│   │   ├── jobs/
│   │   └── serde/
│   ├── iam/
│   │   ├── mod.rs
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   ├── admin/
│   │   ├── mod.rs
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   ├── desktop/
│   │   ├── mod.rs
│   │   ├── api/
│   │   ├── application/
│   │   ├── domain/
│   │   └── infrastructure/
│   └── ops/
│       ├── mod.rs
│       ├── application/
│       ├── domain/
│       └── infrastructure/
└── tests/
    ├── admin_api/
    ├── desktop_api/
    └── support/
```

### 5.1 分层职责

#### `api`

- 路由定义
- 请求解析
- 响应映射
- 中间件挂载
- HTTP 错误转换

不承担业务规则与 SQL。

#### `application`

- use case 编排
- 事务边界控制
- 授权校验调用
- 审计写入与 outbox 写入
- 返回应用结果对象

#### `domain`

- 领域模型
- 枚举与值对象
- 领域规则
- 领域服务接口

不依赖 `axum`、`sqlx` 或 HTTP DTO。

#### `infrastructure`

- repository 实现
- SQL 查询
- token/hash 适配器
- 任务执行器
- 外部服务连接

只实现 port，不定义业务规则。

#### `bootstrap`

- 配置加载
- 依赖组装
- router 组合
- worker 启动
- telemetry 初始化

### 5.2 设计约束

必须长期保持以下依赖方向：

- `api -> application -> domain`
- `infrastructure -> domain`
- `admin` 与 `desktop` 不直接依赖对方的 `api/application`
- 共享能力优先沉到 `iam`、`kernel` 或 `ops`

## 6. 核心子域划分

### 6.1 `iam`

负责：

- 账号认证
- Access / Refresh 会话管理
- 主体、角色、权限点、作用域建模
- 策略评估
- 密码哈希与 token 签发/验证

不负责：

- 租户管理页面逻辑
- 模型配置、Skill、审计、会话中心业务本身

### 6.2 `admin`

负责：

- 租户生命周期
- 后台账号管理
- 角色分配
- 权限点查看与策略绑定
- 模型配置管理
- Skill 目录管理
- Feature flags / tenant settings
- 审计中心与会话中心的后台查询入口

### 6.3 `desktop`

负责：

- 桌面 bootstrap
- 有效配置解析与交付
- Skill 目录最终视图
- 会话恢复所需上下文
- 运行态接入与客户端协议扩展

关键原则：

- `admin` 管的是原始配置与控制动作
- `desktop` 交付的是面向桌面端消费的有效视图

### 6.4 `audit_center`

建议作为 `admin` 查询侧 + `kernel/ops` 共享事实模型组合实现：

- 事实写入进入统一审计事件流
- 后台查询由 `admin` 暴露
- 分类、脱敏、归档、统计等能力沉入共享层

### 6.5 `session_center`

负责：

- 会话聚合视图
- run/tool/chat 行为链路关联
- 最后状态、失败状态、计数统计
- 会话恢复索引

设计原则：

- `audit_center` 保存原始事实
- `session_center` 保存聚合或派生结果

### 6.6 `ops`

负责：

- 后台任务
- Outbox / Inbox
- 结构化配置
- 迁移与修复工具
- Feature flag 基础设施
- Telemetry
- 幂等与请求上下文

## 7. 请求链路与事务边界

### 7.1 统一请求链路

所有请求统一采用以下链路：

`route -> extractor/middleware -> api handler -> application use case -> domain rules -> repository -> response mapper`

各层职责如下：

- `middleware`
  - request id
  - tracing span
  - token 解析
  - principal 注入
  - 限流
  - 幂等键提取
- `api handler`
  - 参数校验
  - DTO 到 command/query 的转换
- `application use case`
  - 业务流程编排
  - 事务控制
  - 授权判定
  - 仓储调用
  - 审计/outbox 写入
- `domain`
  - 执行业务约束与状态规则
- `repository`
  - 只负责持久化与查询

### 7.2 命令与查询分离

应用层明确区分：

- `Command`
  - 修改状态
  - 例：创建租户、停用 Skill、分配角色
- `Query`
  - 只读
  - 例：读取审计事件、读取桌面 bootstrap、读取会话列表

写操作通过命令式 use case 进行，读操作通过查询式 use case 进行，不在 handler 或 repository 中混用。

### 7.3 事务边界

事务边界放在 `application use case`，不放在 repository。

一个 use case 内若包含：

- 权限校验
- 多表写入
- 审计事件写入
- outbox 事件写入

则应作为一个完整业务事务提交或回滚。

### 7.4 Desktop plane 的事务原则

`desktop` 中的 bootstrap、模型下发、Skill 下发、会话恢复等接口应优先保持只读投影特征。

若需要记录：

- 客户端版本
- 最近活跃时间
- bootstrap 成功/失败
- 心跳

建议通过：

- 独立命令接口
- 或异步事件

不要把“读取配置”和“更新状态”绑在一个 handler 中。

### 7.5 幂等与重试

建议统一抽象：

- `IdempotencyKey`
- `RequestContext`
- `CommandEnvelope<T>`

并区分两类场景：

- `admin`
  - 创建、分配、停用类操作需要幂等
- `desktop`
  - 审计上报、状态回传、恢复请求天然更需要幂等

## 8. 数据库与持久化层设计

### 8.1 技术选择

建议技术栈：

- Web：`axum`
- Runtime：`tokio`
- DB：`sqlx`
- Migration：`sqlx migrate` 或 `refinery`
- Error：`thiserror`
- Time：`time`
- ID：`uuid`
- Tracing：`tracing`

不建议在当前阶段引入重 ORM。

### 8.2 表结构分层

数据库表分为三类：

#### 事务主表

保存业务真相，例如：

- `iam_accounts`
- `iam_roles`
- `iam_permissions`
- `iam_role_bindings`
- `tenant_tenants`
- `tenant_model_profiles`
- `tenant_skill_catalog_items`

#### 事件/日志表

保存事实事件，例如：

- `audit_event_log`
- `outbox_events`
- `idempotency_records`

#### 投影/读模型表

为后台页面和桌面读取优化，例如：

- `session_projection`
- `tenant_effective_model_profiles`
- `tenant_effective_skill_catalog`
- `audit_event_stats_daily`

### 8.3 Repository 设计

repository 按聚合和 use case 边界设计，不按“每张表一个文件”设计。

例如：

- `AccountRepository`
- `RoleRepository`
- `SessionRepository`
- `TenantRepository`
- `ModelProfileRepository`
- `SkillCatalogRepository`
- `AuditEventIngestRepository`
- `AuditEventQueryRepository`
- `SessionProjectionRepository`

读仓储与写仓储允许分离。

### 8.4 Unit of Work

建议引入轻量 `UnitOfWork` 或事务上下文，使一个 use case 内的多个 repository 共享同一事务。

原则：

- 事务由 application 层控制
- repository 不自行拆分业务事务
- 同一 use case 中的多仓储调用共享一致事务视图

### 8.5 有效配置视图

模型配置与 Skill 目录从设计上区分：

- 原始配置表
- 有效交付视图

第一版可以动态求值，但代码层必须显式抽象：

- `EffectiveModelResolver`
- `EffectiveSkillResolver`

后续一旦规则变复杂，可平滑迁移到投影表。

### 8.6 审计与会话投影

建议：

- `audit_event_log`
  - 只保存事实
- `session_projection`
  - 保存会话聚合结果

后台会话列表长期不再依赖对原始审计表做复杂窗口函数聚合作为主路径。

### 8.7 索引策略

重点围绕真实查询建索引，至少包括：

- `audit_event_log (tenant_id, occurred_at desc)`
- `audit_event_log (tenant_id, event_family, occurred_at desc)`
- `audit_event_log (tenant_id, event_type, occurred_at desc)`
- `audit_event_log (session_id, occurred_at desc)`
- `session_projection (tenant_id, last_occurred_at desc)`
- `iam_role_bindings (account_id, scope_type, scope_id)`
- `tenant_model_profiles (tenant_id, is_active, updated_at desc)`

若保留 payload 检索，可按需增加 `GIN (payload)`。

## 9. 权限模型与身份体系

### 9.1 四层模型

建议权限系统拆成四层：

1. **身份主体**
   - `Subject / Principal / AuthenticatedSession`
2. **角色**
   - 命名化权限集合
3. **权限点**
   - 明确动作能力
4. **策略**
   - 在什么范围、什么上下文下允许或拒绝

最终评估链路为：

`Principal -> RoleBindings -> Permissions -> PolicyEvaluation -> Decision`

### 9.2 核心抽象

建议定义：

- `RoleId`
- `PermissionCode`
- `PolicyId`
- `ScopeType`
- `ScopeId`
- `RoleAssignment`
- `AuthorizationRequest`
- `AuthorizationDecision`

`ScopeType` 建议使用 enum，例如：

- `Platform`
- `Tenant`
- `Account`
- `Resource`

### 9.3 第一版内建角色

建议内建：

- `platform.super_admin`
- `platform.operator`
- `tenant.admin`
- `tenant.operator`
- `tenant.viewer`
- `desktop.user`

桌面端用户不应简单复用后台管理员角色。

### 9.4 Plane 级权限拆分

权限码建议显式区分 plane：

- `admin.tenant.read`
- `admin.account.write`
- `admin.audit.read`
- `desktop.bootstrap`
- `desktop.model_profile.read_effective`
- `desktop.audit.ingest`

### 9.5 策略扩展

第一版不实现完整 ABAC 引擎，但要支持三类策略来源：

- 静态内建策略
- 角色绑定时附带的 scope 策略
- 运行时上下文策略

即：

- 角色给权限
- 绑定决定范围
- 上下文决定当前是否允许

### 9.6 会话与令牌体系

建议拆分：

- `AccountSession`
- `AccessToken`
- `RefreshSession`

后续如需设备识别，再扩展：

- `ClientInstance`
- `DeviceSession`

关键原则：

- refresh token 永远只存 hash
- access token 第一版可优先采用 opaque token + 服务端 session lookup
- token rotation 视为明确状态机
- 会话失效原因需要可审计

## 10. 错误处理

### 10.1 分层错误模型

建议错误分为四层：

- `DomainError`
- `ApplicationError`
- `InfrastructureError`
- `TransportError`

原则：

- 领域错误表达业务规则不成立
- 应用错误表达 use case 执行失败
- 基础设施错误表达外部依赖失败
- 传输错误仅存在于 HTTP 层

### 10.2 错误映射

API 层统一返回稳定错误响应，例如：

- `code`
- `message`
- `request_id`
- `details`
- `retryable`

禁止通过字符串包含关系猜测 HTTP 状态码。

## 11. 审计模型

### 11.1 统一审计事件结构

建议每条审计事件至少包含：

- `event_id`
- `plane`
- `tenant_id`
- `actor_type`
- `actor_id`
- `subject_type`
- `subject_id`
- `event_family`
- `event_type`
- `event_outcome`
- `severity`
- `payload`
- `occurred_at`
- `ingested_at`
- `request_id`
- `trace_id`
- `session_id`
- `run_id`
- `tool_run_id`

### 11.2 事件命名

统一采用：

- `admin.tenant.created`
- `admin.account.role_assigned`
- `admin.model_profile.deactivated`
- `desktop.bootstrap.succeeded`
- `desktop.audit.ingested`
- `desktop.session.recovered`
- `system.outbox.delivery_failed`

### 11.3 审计写入原则

建议：

- 成功、失败、拒绝均可审计
- 高频心跳类不直接污染主审计流
- payload 有 schema 约束
- 敏感字段脱敏后再入库
- 审计事件只追加、不更新

## 12. 后台任务与异步作业

### 12.1 作业模式

优先采用：

- **数据库 outbox + 进程内 worker**

原因：

- 与模块化单体天然匹配
- 一致性更好控制
- 部署复杂度低
- 适合当前阶段

### 12.2 作业类型

建议至少支持两类：

#### 领域后处理任务

- 更新 `session_projection`
- 刷新有效模型/Skill 视图
- 生成统计聚合
- 清理失效 session
- 同步缓存

#### 平台运维任务

- 审计归档
- 数据修复
- 投影重建
- 补偿任务
- 数据保留策略执行

### 12.3 Job 元数据

每个 job 建议具备：

- `job_id`
- `job_type`
- `aggregate_type`
- `aggregate_id`
- `payload`
- `attempt`
- `status`
- `scheduled_at`
- `processed_at`
- `last_error`
- `trace_id`

执行策略建议：

- 明确最大重试次数
- 指数退避
- 死信状态可人工重放
- 幂等执行
- 支持按租户限速

## 13. 可观测性与安全

### 13.1 可观测性

建议第一版即具备：

- `tracing`
- `metrics`
- `health` 与 `readiness`
- 结构化日志
- 域级指标

稳定字段应包括：

- `request_id`
- `trace_id`
- `tenant_id`
- `plane`
- `route`
- `principal_type`
- `principal_id`
- `job_type`
- `event_type`

### 13.2 安全

建议统一纳入以下治理面：

- 身份安全
  - `argon2`
  - token hash 存储
  - 会话吊销与轮转
- 接口安全
  - CORS 白名单
  - body 限制
  - 超时
  - 限流
- 数据安全
  - 脱敏
  - 密钥托管抽象
- 权限安全
  - 所有 use case 显式授权检查
- 运维安全
  - 分环境配置
  - 管理员 bootstrap 受控
  - 高风险操作可审计

建议预留 `SecretProvider` 抽象，为未来接 KMS / Vault 做准备。

## 14. 测试策略

测试建议分为五层：

### 14.1 领域测试

验证：

- 权限判定
- scope 规则
- 默认模型唯一规则
- Skill 有效性规则
- token/session 状态机
- 事件分类

### 14.2 应用层测试

验证：

- use case 编排
- 事务边界
- 授权拒绝
- 审计与 outbox 写入
- bootstrap 有效视图解析

### 14.3 Repository / Integration 测试

验证：

- SQL 正确性
- 分页与游标
- JSONB 检索
- 唯一键冲突映射
- outbox 一致性

### 14.4 API / Contract 测试

验证：

- `admin` API 响应结构
- `desktop` bootstrap 与交付协议
- 错误响应格式
- 鉴权失败与权限拒绝行为
- 幂等键行为

### 14.5 Job / Projection 测试

验证：

- outbox 消费
- 重试幂等
- projection 可重建
- 死信可重放
- 延迟聚合最终一致

## 15. 推荐技术栈

建议收敛到以下组合：

- Web / routing：`axum`
- Runtime：`tokio`
- Middleware：`tower`、`tower-http`
- Serialization：`serde`、`serde_json`
- DB：`sqlx` + PostgreSQL
- Migrations：`sqlx migrate` 或 `refinery`
- Config：统一采用单一配置库
- Error：`thiserror`
- Tracing：`tracing`、`tracing-subscriber`
- Crypto：`argon2`
- IDs：`uuid`
- Time：`time`
- API schema：可选 `utoipa`

## 16. 迁移路线

### 16.1 迁移原则

- 先搭新骨架，再迁业务
- 保持外部 API 合同尽量稳定
- 逐域迁移，不一次性推倒重来
- 新功能优先落在新结构中，不再继续扩大旧平铺模块

### 16.2 六阶段迁移

#### 阶段 1：搭新服务骨架

- 引入 `bootstrap / kernel / infrastructure`
- 切换到 `axum`
- 建立统一配置、错误响应、连接池、tracing、health/readiness

#### 阶段 2：抽 `iam`

- 从现有 `auth.rs` 中抽出认证、授权、会话、principal、token
- 先迁 `login / refresh / me`

#### 阶段 3：拆 `admin control plane`

- 迁入租户、账号、模型、Skill、审计查询、会话查询
- 统一 handler/use case/repository 边界

#### 阶段 4：拆 `desktop delivery plane`

- 迁入 bootstrap、有效配置下发、恢复上下文、桌面接入协议
- 显式分离 desktop DTO 与 admin DTO

#### 阶段 5：重做审计与会话聚合

- 建立统一 `audit_event_log`
- 引入 outbox
- 建立 `session_projection`
- 将长期查询切到投影

#### 阶段 6：补齐策略扩展与平台作业体系

- 完善角色绑定与策略评估
- 引入 job runner、归档、重建、补偿

### 16.3 现有文件迁移建议

- `src/auth.rs` -> `iam/*`
- `src/admin.rs` -> `admin/*`
- `src/model_profiles.rs` -> `admin/*` + `desktop` 有效解析能力
- `src/skill_catalog.rs` -> `admin/*` + `desktop` 有效解析能力
- `src/desktop.rs` -> `desktop/*`
- `src/audit.rs` -> 共享审计事实模型与写入能力
- `src/audit_center.rs` -> `admin` 查询侧或独立审计查询模块
- `src/session_center.rs` -> 先保留查询，再迁入 `session_center/*`
- `src/lib.rs` -> 缩减为装配与公共入口

### 16.4 迁移期间禁忌

- 不再向旧平铺模块继续堆新逻辑
- 不混用新旧 DTO
- 不把权限判断重新散落到 handler
- 不把 session/audit 长期主查询继续做得更重

## 17. 最终目标形态

迁移完成后，平台后端应达到以下形态：

- 一个服务、一个部署单元、一个主数据库
- 明确的 `admin plane` 与 `desktop plane`
- `iam` 作为共享安全核心
- `audit_center` 保存事实，`session_center` 保存聚合
- `admin` 管原始配置，`desktop` 管有效交付视图
- `application` 控事务与编排，`domain` 控规则，`infrastructure` 控适配
- 错误、鉴权、审计、任务、配置、观测统一收口

在这一形态下，未来继续引入：

- SSO
- 设备识别
- 模型密钥托管
- Skill 发布流
- 更细的策略引擎

都不需要再推翻当前后端架构。
