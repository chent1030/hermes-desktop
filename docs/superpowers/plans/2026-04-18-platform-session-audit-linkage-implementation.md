# Platform Session Audit Linkage Implementation Plan

**Goal:** 打通管理端会话中心到审计中心的最小联动，降低平台排障切换成本。

**Architecture:** 仅在前端增加会话摘要动作按钮；点击后重置审计筛选并复用现有审计接口重新拉取数据，不新增后端接口。

**Tech Stack:** React, TypeScript, Vitest

---

## Task 1: 先补失败测试锁定联动行为

**Files:**
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [x] **Step 1: 补会话中心打开审计的交互测试**

## Task 2: 实现前端联动

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`

- [x] **Step 1: 给会话摘要补联动动作**
- [x] **Step 2: 实现点击后重置筛选并刷新审计中心**

## Task 3: 文档与验证

**Files:**
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新剩余缺口文档**
- [x] **Step 2: 跑前端测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
- `npm run typecheck`
