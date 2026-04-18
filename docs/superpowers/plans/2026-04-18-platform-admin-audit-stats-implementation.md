# Platform Admin Audit Stats Implementation Plan

**Goal:** 给管理端审计中心补齐最小统计与图表摘要，提升运维排障效率。

**Architecture:** 仅在前端基于当前 `auditEvents` 计算总数、失败数与事件族占比条，不新增后端接口。

**Tech Stack:** React, TypeScript, Vitest

---

## Task 1: 先补失败测试锁定统计摘要行为

**Files:**
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [x] **Step 1: 补审计统计面板测试**

## Task 2: 实现审计统计与图表

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `platform-admin/frontend/src/app.css`

- [x] **Step 1: 实现统计计算逻辑**
- [x] **Step 2: 渲染摘要卡片与占比条**

## Task 3: 文档与验证

**Files:**
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新剩余缺口文档**
- [x] **Step 2: 跑前端测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
- `npm run typecheck`
