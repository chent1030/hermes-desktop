# Platform Admin

平台管理后台第一阶段实现，技术栈为 `Rust + React + PostgreSQL + Docker`，当前聚焦“平台版、多租户共用、账号密码登录优先”的后台闭环。

## 目录

- `backend/`：Rust 管理后台服务
- `frontend/`：React 管理端前端
- `docker-compose.yml`：本地/部署编排骨架
- `.env.example`：环境变量模板

## 第一阶段目标

- 提供独立后台系统并运行在 Docker 中
- 使用 PostgreSQL 作为后台主数据库
- 落地平台级超级管理员 + 租户管理员两套最小 RBAC
- 支持平台超级管理员自动播种与会话续期
- 提供超级管理员 / 租户管理员双工作台
- 为后续模型配置、Skill Hub、审计中心持续扩展留出稳定接口

## 当前已落地能力

- 后端已支持 `GET /api/health`
- 后端已支持 `POST /api/auth/login`
- 后端已支持 `POST /api/auth/refresh`
- 后端启动时会自动初始化后台认证与管理所需表结构
- 后端支持平台级超级管理员自动播种，且播种逻辑幂等
- 后端支持 access token 鉴权、refresh token 轮转、后台工作台接口鉴权
- 后端支持租户管理、租户账号管理、账号停用、租户停用
- 后端支持桌面执行端接口：
  - 在线初始化 bootstrap
  - 平台授权模型下发
  - Skill 只读清单下发
  - 审计事件批量接收与健康检查
- 后端支持模型配置管理：
  - 超级管理员管理全局模型与租户模型
  - 租户管理员管理本租户模型
  - 同作用域默认模型唯一
- 前端已提供双工作台：
  - 超级管理员：管理租户、管理租户账号
  - 租户管理员：仅管理本租户普通用户
  - 两类工作台都已补模型配置卡片
- 浏览器跨端口访问已补齐 CORS / `OPTIONS` 预检支持

## 环境变量

核心环境变量如下：

```bash
ADMIN_DATABASE_URL=postgres://postgres:password@postgres:5432/manager_admin
ADMIN_SESSION_SALT=platform-admin-dev-salt
ADMIN_BOOTSTRAP_SUPER_USERNAME=root
ADMIN_BOOTSTRAP_SUPER_PASSWORD=Secret123!
ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME=Platform Root
```

- `ADMIN_BOOTSTRAP_SUPER_USERNAME` / `ADMIN_BOOTSTRAP_SUPER_PASSWORD`：用于首次启动自动播种平台超级管理员
- `ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME`：可选，不传时默认回落到用户名
- 如果数据库中已经存在激活状态的 `super_admin`，服务不会重复播种

## 登录接口约定

请求：

```json
{
  "tenantCode": "acme",
  "username": "admin",
  "password": "secret123"
}
```

租户管理员登录成功响应：

```json
{
  "accessToken": "atk_xxx",
  "refreshToken": "rtk_xxx",
  "tenant": {
    "id": 7,
    "code": "acme",
    "name": "Acme Corp"
  },
  "user": {
    "id": 42,
    "username": "admin",
    "displayName": "ACME Admin",
    "roleCode": "tenant_admin"
  }
}
```

平台超级管理员登录时，`tenantCode` 可以为空字符串；成功响应中的 `tenant` 为 `null`：

```json
{
  "accessToken": "atk_xxx",
  "refreshToken": "rtk_xxx",
  "tenant": null,
  "user": {
    "id": 1,
    "username": "root",
    "displayName": "Platform Root",
    "roleCode": "super_admin",
    "scopeType": "platform"
  }
}
```

刷新请求：

```json
{
  "refreshToken": "rtk_xxx"
}
```

刷新成功后会返回一组新的 `accessToken` / `refreshToken`，旧 refresh token 会在服务端立即失效。

## 管理接口

已开放的最小后台管理接口如下：

- `GET /api/admin/me`：读取当前登录后台账号上下文
- `GET /api/admin/tenants`：超级管理员获取租户列表
- `POST /api/admin/tenants`：超级管理员创建租户
- `POST /api/admin/tenants/:tenantId/deactivate`：超级管理员停用租户
- `GET /api/admin/accounts?tenantId=:tenantId`：超级管理员查看指定租户账号
- `POST /api/admin/accounts`：超级管理员创建指定租户账号
- `POST /api/admin/accounts/:accountId/deactivate`：超级管理员停用账号
- `GET /api/admin/tenant/accounts`：租户管理员查看本租户账号
- `POST /api/admin/tenant/accounts`：租户管理员创建本租户普通用户
- `POST /api/admin/tenant/accounts/:accountId/deactivate`：租户管理员停用本租户普通用户
- `GET /api/admin/model-profiles?tenantId=:tenantId`：超级管理员读取全局或指定租户模型
- `POST /api/admin/model-profiles`：超级管理员创建全局或指定租户模型
- `POST /api/admin/model-profiles/:modelId/deactivate`：超级管理员停用模型
- `GET /api/admin/tenant/model-profiles`：租户管理员读取本租户模型
- `POST /api/admin/tenant/model-profiles`：租户管理员创建本租户模型
- `POST /api/admin/tenant/model-profiles/:modelId/deactivate`：租户管理员停用本租户模型

当前权限边界：

- 超级管理员不属于任何租户
- 租户管理员只能看到并管理自己租户下的数据
- 租户管理员不能创建租户管理员
- 租户管理员不能管理全局模型
- 删除策略当前统一为“停用/禁用”，不做物理删除

## 模型配置管理规则

模型配置继续复用 `platform_desktop_model_profiles` 表，字段包括：

- `id`
- `tenant_id`
- `provider`
- `model`
- `label`
- `base_url`
- `is_default`
- `is_active`

默认规则如下：

- 全局模型与租户模型分别维护各自的默认值
- 同一作用域内创建新的默认模型时，旧默认会自动取消
- 桌面执行端拉取模型时：
  - 优先使用租户默认模型
  - 若租户没有默认模型，则回落到全局默认模型
  - 返回给桌面端的列表里最多只有一个 `isDefault = true`

## 桌面执行端接口

已开放的桌面执行端最小接口如下：

- `GET /api/desktop/bootstrap`：返回租户、账号、语言与功能开关
- `GET /api/desktop/model-profiles`：返回当前租户可见模型列表
- `GET /api/desktop/skills/catalog`：返回全局 Skill + 租户 Skill 只读清单
- `POST /api/audit/events:batch`：接收桌面端批量审计事件
- `GET /api/audit/health`：返回服务端审计健康状态

当前返回策略：

- 桌面执行端接口只接受租户作用域账号，不向平台超级管理员开放
- `bootstrap` 当前默认返回 `locale = "zh-CN"` 且 `gatewayVisible = false`
- 模型与 Skill 清单从 PostgreSQL 读取：
  - `platform_desktop_model_profiles`
  - `platform_desktop_skill_catalog`
- 审计事件写入：
  - `platform_audit_events`

模型表最小字段包括：

- `id`
- `tenant_id`，为空表示平台全局模型
- `provider`
- `model`
- `label`
- `base_url`
- `is_default`
- `is_active`

Skill 清单表最小字段包括：

- `id`
- `scope`，取值 `global` 或 `tenant`
- `tenant_id`
- `name`
- `version`
- `description`
- `download_url`
- `is_active`

如果某个租户当前没有可见模型，桌面端会在在线初始化阶段阻断进入工作区；这符合第二份计划中“默认模型必须存在”的约束。

## 本地验证

后端单测：

```bash
cd platform-admin/backend
cargo test
```

前端登录页测试：

```bash
cd /Users/chentao/project/hermes-desktop
npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
```

如果要直连真实 PostgreSQL 做一次活体验证，可设置 `ADMIN_DATABASE_URL` 后执行：

```bash
cd platform-admin/backend
ADMIN_DATABASE_URL=postgres://postgres:password@host:5432/manager_admin \
  cargo test live_postgres -- --ignored
```

仓库侧桌面平台链路验证：

```bash
cd /Users/chentao/project/hermes-desktop
npm run test -- tests/platform-runtime.test.ts
npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx
```
