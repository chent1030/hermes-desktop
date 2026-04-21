# Platform Admin 租户管理与后台 RBAC 设计

## 1. 背景

当前 `platform-admin/` 已完成：

- 后台健康检查
- 租户登录
- 刷新令牌续期
- PostgreSQL 认证基础表
- 管理端登录与会话续期页面

下一步需要进入平台后台真正的“管理能力”闭环，即：

- 超级管理员可以管理租户
- 超级管理员可以为租户创建租户管理员与普通用户
- 租户管理员可以管理本租户普通用户
- 初始超级管理员可由服务启动时自动播种

本期目标是打稳平台后台的权限边界与数据边界，不追求一次性把全部 RBAC、审计、模型配置、Skill Hub 都做完。

## 2. 本期范围

### 2.1 包含

- 平台级超级管理员账号模型
- 租户级后台账号模型
- 租户创建、查看、停用
- 后台账号创建、查看、停用
- 按角色切分超级管理员与租户管理员视图
- 服务启动时自动播种初始超级管理员
- 停用账号后禁止登录与 refresh

### 2.2 不包含

- 物理删除租户或账号
- 更完整的 RBAC 权限点系统
- SSO / OAuth
- 密码重置流程
- 审批流
- 邀请码 / 邮件邀请
- 更细粒度的组织架构

## 3. 用户已确认的边界

用户已明确确认：

- 初始超级管理员采用平台级账号，不属于任何租户
- 本期同时支持超级管理员视角和租户管理员视角
- 第一阶段只做停用/禁用，不做物理删除
- 租户管理员不能创建租户管理员
- 初始超级管理员采用环境变量播种

## 4. 方案对比

### 方案 A：平台级超管 + 租户级后台账号双层模型（采用）

平台级超级管理员与租户级账号共存，但统一进入后台账号体系：

- `super_admin` 为平台级账号，不绑定租户
- `tenant_admin` / `tenant_user` 为租户级账号，必须绑定租户

优点：

- 平台权限与租户权限边界清晰
- 与当前产品“单套平台、多租户共享”的结构一致
- 后续扩展更细 RBAC 时不需要推倒重来

缺点：

- 数据模型需要显式表达平台级与租户级两类账号

### 方案 B：所有后台账号都绑定租户

把超级管理员也挂到一个内置 `system` 租户下。

优点：

- 表结构更统一

缺点：

- 平台级权限与租户级权限会被人为混在一起
- 后续跨租户权限、平台审计、平台配置中心边界容易变脏

### 方案 C：先保留环境变量 root，不进入数据库

优点：

- 实现速度最快

缺点：

- 不可审计
- 不可管理
- 难以演进为生产可用

## 5. 目标架构

本期采用“统一后台账号模型 + 角色约束 + 服务端强制租户上下文”：

1. 统一后台账号表承接所有后台登录主体
2. 以 `role_code` 区分 `super_admin`、`tenant_admin`、`tenant_user`
3. 通过 `scope_type` 区分平台级账号与租户级账号
4. 所有管理接口在服务端执行角色判定
5. 租户管理员所有写操作都强制绑定自身租户，不信任前端传参

## 6. 数据模型设计

### 6.1 租户表

继续使用现有 `platform_admin_tenants`：

- `id`
- `code`
- `name`
- `is_active`
- `created_at`
- `updated_at`

行为约束：

- 只允许停用，不允许物理删除
- 停用后该租户下账号不可继续登录与 refresh

### 6.2 后台账号表

新增统一后台账号表，例如 `platform_admin_accounts`：

- `id`
- `scope_type`：`platform` | `tenant`
- `tenant_id`：平台级账号为空，租户级账号必填
- `username`
- `display_name`
- `password_hash`
- `role_code`：`super_admin` | `tenant_admin` | `tenant_user`
- `is_active`
- `created_at`
- `updated_at`

约束：

- 平台级账号必须 `scope_type = platform` 且 `tenant_id IS NULL`
- 租户级账号必须 `scope_type = tenant` 且 `tenant_id IS NOT NULL`
- `super_admin` 只能是平台级账号
- `tenant_admin` / `tenant_user` 只能是租户级账号
- 用户名唯一性采用：
  - 平台级账号：全局唯一
  - 租户级账号：租户内唯一

### 6.3 会话表

现有 `platform_admin_auth_sessions` 继续保留，但外键改为绑定统一后台账号表。

会话约束：

- 登录成功创建 refresh 会话
- refresh 成功后旧 refresh token 立即失效
- 账号或租户被停用后，登录与 refresh 都必须失败

## 7. 角色能力边界

### 7.1 超级管理员

可以：

- 查看租户列表
- 创建租户
- 停用租户
- 查看任意租户的后台账号
- 为任意租户创建 `tenant_admin`
- 为任意租户创建 `tenant_user`
- 停用任意租户级账号

不在本期做：

- 平台级普通管理员
- 更细粒度权限配置

### 7.2 租户管理员

可以：

- 查看本租户后台账号
- 创建本租户 `tenant_user`
- 停用本租户 `tenant_user`

不可以：

- 创建租户
- 停用租户
- 创建 `tenant_admin`
- 管理其他租户
- 管理平台级账号

### 7.3 普通租户账号

本期仅需要具备被后台创建、查看、停用的能力，不提供后台管理界面。

## 8. 初始超级管理员播种

### 8.1 环境变量

服务启动时读取：

- `ADMIN_BOOTSTRAP_SUPER_USERNAME`
- `ADMIN_BOOTSTRAP_SUPER_PASSWORD`
- `ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME`

### 8.2 启动行为

启动顺序：

1. 确保数据库 schema 已初始化
2. 检查是否存在 `super_admin`
3. 若不存在且环境变量完整，则创建一个平台级超级管理员
4. 若已存在，则幂等跳过

### 8.3 安全原则

- 不允许重复创建多个同用户名超级管理员
- 不把明文密码写入日志
- 若未配置环境变量，只跳过播种，不影响服务启动

## 9. 接口设计

### 9.1 认证上下文

所有后台管理接口最终都依赖 access token 恢复操作者身份。  
本期可以先采用“服务端 token -> 账号解析”的最小闭环方式，不要求完整 JWT 体系。

### 9.2 超级管理员接口

- `GET /api/admin/me`
- `GET /api/admin/tenants`
- `POST /api/admin/tenants`
- `POST /api/admin/tenants/:tenantId/deactivate`
- `GET /api/admin/accounts?tenantId=:tenantId`
- `POST /api/admin/accounts`
- `POST /api/admin/accounts/:accountId/deactivate`

行为约束：

- 仅 `super_admin` 可调用租户管理接口
- 创建账号时服务端校验角色和租户归属是否合法

### 9.3 租户管理员接口

- `GET /api/admin/me`
- `GET /api/admin/tenant/accounts`
- `POST /api/admin/tenant/accounts`
- `POST /api/admin/tenant/accounts/:accountId/deactivate`

行为约束：

- 服务端从当前会话中拿 `tenant_id`
- 前端不提供可切换租户参数
- 即使前端伪造 `tenantId`，后端也忽略或拒绝

## 10. 前端管理台设计

### 10.1 登录后工作台切换

登录成功后根据 `roleCode` 进入不同工作台：

- `super_admin` -> 平台管理工作台
- `tenant_admin` -> 本租户账号管理工作台

### 10.2 超级管理员工作台

页面模块：

- 租户列表
- 创建租户表单
- 选中租户后的账号列表
- 创建账号表单

创建账号时可选角色：

- `tenant_admin`
- `tenant_user`

### 10.3 租户管理员工作台

页面模块：

- 本租户账号列表
- 创建普通用户表单

页面限制：

- 不展示“创建租户管理员”
- 不展示租户切换
- 不展示平台租户管理入口

## 11. 错误处理

- 用户名冲突：`409 Conflict`
- 租户编码冲突：`409 Conflict`
- 越权访问：`403 Forbidden`
- 非法请求体：`400 Bad Request`
- 已停用账号登录：`401 Unauthorized`
- 已停用账号 refresh：`401 Unauthorized`
- 已停用租户下账号登录/refresh：`401 Unauthorized`

额外保护：

- 若系统只剩最后一个激活的 `super_admin`，禁止停用，返回 `409`

## 12. 测试设计

### 12.1 Rust

必须覆盖：

- 初始超级管理员播种幂等
- 超级管理员创建租户
- 超级管理员创建租户管理员
- 租户管理员只能创建普通用户
- 停用账号后无法登录
- 停用账号后无法 refresh
- 停用租户后租户内账号无法登录/refresh
- 最后一个 `super_admin` 不可停用

### 12.2 React

必须覆盖：

- 超级管理员登录后进入平台管理工作台
- 租户管理员登录后进入本租户工作台
- 租户管理员界面不出现“创建租户管理员”
- 创建表单提交到正确接口

## 13. 推荐实施顺序

1. 重整后台账号 schema，建立统一后台账号表
2. 接入初始超级管理员自动播种
3. 落地超级管理员租户/账号接口
4. 落地租户管理员受限接口
5. 补管理台两套工作台页面
6. 完成 fresh verification 与真实 PostgreSQL 活体验证

## 14. 验收标准

满足以下条件即可认为本期完成：

1. 首次启动可通过环境变量自动生成一个平台级超级管理员
2. 超级管理员可创建租户
3. 超级管理员可为指定租户创建租户管理员和普通用户
4. 租户管理员只能管理本租户普通用户
5. 停用后账号不能再登录或 refresh
6. 所有核心路径有自动化测试覆盖
7. 真实 PostgreSQL 验证通过

## 15. 风险与控制

### 15.1 平台级账号与租户级账号混用风险

通过 `scope_type` + `role_code` 双重约束避免逻辑混乱。

### 15.2 越权风险

所有租户管理员接口都必须基于服务端恢复的租户上下文执行，不信任前端传参。

### 15.3 停用后的残留会话风险

登录和 refresh 时都必须重新校验账号与租户 `is_active`，确保停用后立即失效。

### 15.4 初始播种重复风险

超级管理员播种必须幂等，且只在不存在 `super_admin` 时执行。
