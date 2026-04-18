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
- 前端已提供双工作台：
  - 超级管理员：管理租户、管理租户账号
  - 租户管理员：仅管理本租户普通用户
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

当前权限边界：

- 超级管理员不属于任何租户
- 租户管理员只能看到并管理自己租户下的数据
- 租户管理员不能创建租户管理员
- 删除策略当前统一为“停用/禁用”，不做物理删除

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
