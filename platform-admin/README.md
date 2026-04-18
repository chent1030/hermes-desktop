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
