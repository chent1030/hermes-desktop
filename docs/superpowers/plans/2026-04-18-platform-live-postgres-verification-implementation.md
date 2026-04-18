# Platform Live PostgreSQL Verification Implementation Plan

**Goal:** 给平台后台补齐真实 PostgreSQL ignored live tests，覆盖桌面执行端读取、审计写入、审计中心、会话中心、模型配置管理、Skill catalog 管理。

**Architecture:** 复用现有 `ADMIN_DATABASE_URL` 约定，在 backend 内新增一层测试辅助工具，统一负责 live PostgreSQL 加锁、schema 初始化、账号播种与主体验证登录。各模块在各自 `#[cfg(test)]` 下增加最小 happy-path ignored tests，避免把真实库验证挤进单一大测试文件。

**Tech Stack:** Rust, PostgreSQL, cargo test ignored live tests

---

## Task 1: 建立共享 live test 辅助层

**Files:**
- Create: `platform-admin/backend/src/live_test_support.rs`
- Modify: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: 提供共享 live PostgreSQL 互斥锁**
- [ ] **Step 2: 提供数据库 URL 读取与 schema 初始化辅助函数**
- [ ] **Step 3: 提供租户管理员 / 超级管理员播种与登录辅助函数**

## Task 2: 为各核心模块补 ignored live tests

**Files:**
- Modify: `platform-admin/backend/src/desktop.rs`
- Modify: `platform-admin/backend/src/audit.rs`
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `platform-admin/backend/src/session_center.rs`
- Modify: `platform-admin/backend/src/model_profiles.rs`
- Modify: `platform-admin/backend/src/skill_catalog.rs`

- [ ] **Step 1: desktop live test 覆盖 bootstrap / model profiles / skill catalog**
- [ ] **Step 2: audit live test 覆盖事件写入与 health**
- [ ] **Step 3: audit center live test 覆盖按租户读取最近审计事件**
- [ ] **Step 4: session center live test 覆盖按 `sessionId` 聚合聊天会话**
- [ ] **Step 5: model profiles / skill catalog live tests 覆盖创建、读取、停用最小链路**

## Task 3: 验证与文档

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: 跑 `cargo test`，确认本地测试通过**
- [ ] **Step 2: 用真实 PostgreSQL 跑 `cargo test -- --ignored`**
- [ ] **Step 3: 更新 README，写明当前 live test 覆盖范围与执行方式**
- [ ] **Step 4: 提交并推送**
