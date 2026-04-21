# Platform Admin Run Audit UX Implementation Plan

**Goal:** 提升管理端审计中心对 `run.*` 事件的筛选与可读性，让平台侧排障更顺手。

**Architecture:** 后端审计查询接口新增 `eventPrefix` 前缀筛选；前端审计中心新增 `Event family` 下拉框，并为 `run.tool.* / run.model.* / run.skill.*` 增加摘要渲染函数。

**Tech Stack:** Rust, React, TypeScript, Vitest

---

## Task 1: 先补失败测试锁定筛选能力

**Files:**
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [x] **Step 1: 补后端 `eventPrefix` 过滤测试**
- [x] **Step 2: 补前端 `Event family` 筛选与 `run.*` 摘要展示测试**

## Task 2: 实现后端与前端增强

**Files:**
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/frontend/src/App.tsx`

- [x] **Step 1: 后端支持 `eventPrefix` 查询**
- [x] **Step 2: 前端补 `Event family` 交互**
- [x] **Step 3: 前端补 `run.*` 摘要展示**

## Task 3: 文档与验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新文档**
- [x] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
- `cd platform-admin/backend && cargo test audit_center`
- `npm run typecheck`
