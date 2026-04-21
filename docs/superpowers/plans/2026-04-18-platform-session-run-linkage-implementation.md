# Platform Session Run Linkage Implementation Plan

**Goal:** 把 `run.tool.*` 的最小执行信号挂到会话中心摘要上，让平台能从会话视角快速判断工具使用情况。

**Architecture:** 在 `platform-admin/backend/src/session_center.rs` 的现有 `chat.*` 聚合基础上，增加同 `sessionId` 的 `run.tool.*` 补充聚合；前端 `Session center` / `Tenant session center` 列表项增加执行摘要渲染。

**Tech Stack:** Rust, React, TypeScript, Vitest

---

## Task 1: 先补失败测试

**Files:**
- Modify: `platform-admin/backend/src/session_center.rs`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [x] **Step 1: 补会话摘要工具字段测试**
- [x] **Step 2: 补前端会话工具摘要展示测试**

## Task 2: 实现后端与前端联动

**Files:**
- Modify: `platform-admin/backend/src/session_center.rs`
- Modify: `platform-admin/frontend/src/App.tsx`

- [x] **Step 1: 后端补 `run.tool.*` 聚合字段**
- [x] **Step 2: 前端补会话执行摘要渲染**

## Task 3: 文档与验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新文档**
- [ ] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
- `cd platform-admin/backend && cargo test session_center`
- `npm run typecheck`
