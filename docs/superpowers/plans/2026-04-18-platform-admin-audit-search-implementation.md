# Platform Admin Audit Search Implementation Plan

**Goal:** 给管理端审计中心补齐账号筛选与 `payload` 关键字检索，提升平台侧排障效率。

**Architecture:** 后端扩展 `AuditEventQuery` 与审计查询 SQL/内存过滤；前端审计中心新增 `Account` 与 `Payload contains` 两个筛选输入，并在翻页时沿用同样的筛选条件。

**Tech Stack:** Rust, React, TypeScript, Vitest

---

## Task 1: 先补失败测试锁定新增筛选行为

**Files:**
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [x] **Step 1: 补后端 `accountQuery` / `payloadQuery` 过滤测试**
- [x] **Step 2: 补前端审计中心请求参数测试**

## Task 2: 实现后端与前端筛选能力

**Files:**
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/frontend/src/App.tsx`

- [x] **Step 1: 扩展审计查询结构与路由参数解析**
- [x] **Step 2: 实现 PostgreSQL / 内存存根过滤逻辑**
- [x] **Step 3: 实现前端筛选字段与分页参数透传**

## Task 3: 文档与验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新接口与缺口文档**
- [x] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
- `cd platform-admin/backend && cargo test audit_center`
- `npm run typecheck`
- `ADMIN_DATABASE_URL='postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin' cargo test audit_center::tests::lists_live_audit_events_for_tenant_actor -- --ignored`
