# Platform Admin Audit Center Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台管理端审计中心补齐基础筛选和简单分页，让后台可以按事件类型、时间范围查看事件，并继续向后加载更早的审计记录。

**Architecture:** 在 `platform-admin/backend` 现有审计查询服务基础上增加可选筛选参数和 `beforeId` 分页条件；frontend 在现有审计中心卡片中补筛选表单、重新查询和“加载更多”逻辑，保持当前最小工作台结构不变。

**Tech Stack:** Rust, PostgreSQL, serde, React, TypeScript, Vitest

---

### Task 1: 扩展 backend 审计查询参数与测试

**Files:**
- Modify: `platform-admin/backend/src/audit_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/audit_center.rs`

- [ ] **Step 1: 写失败测试，覆盖 eventType 筛选、beforeId 分页和非法时间格式**
- [ ] **Step 2: 跑后端定向测试确认失败**
- [ ] **Step 3: 实现 `AuditEventQuery` 与筛选逻辑**
- [ ] **Step 4: 路由层解析 `eventType/occurredFrom/occurredTo/beforeId/limit`**
- [ ] **Step 5: 跑 `cargo test` 确认通过**
- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/backend/src/audit_center.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add audit center filters"
```

### Task 2: 扩展管理端审计中心筛选 UI 与测试

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖筛选表单和加载更多行为**
- [ ] **Step 2: 跑前端定向测试确认失败**
- [ ] **Step 3: 增加 `auditFilters / auditHasMore / isLoadingAudit` 状态**
- [ ] **Step 4: 在审计中心卡片中补筛选表单与 `Load older events`**
- [ ] **Step 5: 跑定向测试与全量前端测试**
- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add audit center filtering ui"
```

### Task 3: 更新文档并完成验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-admin-audit-center-filtering-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-admin-audit-center-filtering-implementation.md`

- [ ] **Step 1: 更新 README，补筛选参数和分页说明**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`**
- [ ] **Step 4: 跑 `npm run test`、`npm run typecheck`、`npm run build`**
- [ ] **Step 5: 用真实 PostgreSQL 跑 `cargo test -- --ignored`**
- [ ] **Step 6: 提交并推送**

```bash
git add platform-admin/README.md docs/superpowers/specs/2026-04-18-platform-admin-audit-center-filtering-design.md docs/superpowers/plans/2026-04-18-platform-admin-audit-center-filtering-implementation.md
git commit -m "docs: describe audit center filters"
git push origin platform-phase2-desktop-closure
```
