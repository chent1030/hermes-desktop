# Platform Admin

平台管理后台第一阶段骨架，技术栈为 `Rust + React + PostgreSQL + Docker`。

## 目录

- `backend/`：Rust 管理后台服务
- `frontend/`：React 管理端前端
- `docker-compose.yml`：本地/部署编排骨架
- `.env.example`：环境变量模板

## 第一阶段当前目标

- 提供独立后台系统运行骨架
- 预留 PostgreSQL 连接与持久化
- 提供后端健康检查接口
- 提供前端管理台壳层
- 为后续租户、用户、RBAC、模型配置与 Skill Hub 落地留出结构

## 当前已落地切片

- 后端已支持 `GET /api/health`
- 后端已支持 `POST /api/auth/login`
- 后端已支持 `POST /api/auth/refresh`
- 后端会自动初始化 `platform_admin_tenants` / `platform_admin_users` 两张认证基础表
- 后端会自动初始化 `platform_admin_auth_sessions` 会话表，并在 refresh 时轮转刷新令牌
- 前端已提供管理端登录页，并连通健康检查、账号密码登录、会话续期请求
- 浏览器跨端口访问已补齐 CORS / `OPTIONS` 预检支持

## 登录接口约定

请求：

```json
{
  "tenantCode": "acme",
  "username": "admin",
  "password": "secret123"
}
```

成功响应：

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

刷新请求：

```json
{
  "refreshToken": "rtk_xxx"
}
```

刷新成功后会返回一组新的 `accessToken` / `refreshToken`，旧 refresh token 会在服务端立即失效。

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
  cargo test authenticates_against_live_postgres -- --ignored
```
