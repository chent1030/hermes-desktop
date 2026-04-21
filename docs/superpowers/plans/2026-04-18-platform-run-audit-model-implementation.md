# Platform Run Audit Model Implementation Plan

**Goal:** 把非聊天的 Skill 下载与 Skill 探测事件收敛到 `run.*` 事件族，同时保持现有 payload 与平台查询边界稳定。

**Architecture:** 直接修改桌面端主进程审计发射点，把 `skill.download.*` / `skill.sync.*` 统一重命名为 `run.skill.download.*` / `run.skill.sync.*`；不做重复发射，不改审计表结构。

**Tech Stack:** TypeScript, Electron main process, Vitest

---

## Task 1: 重命名 Skill 运行事件

**Files:**
- Modify: `src/main/platform/index.ts`
- Modify: `tests/platform-skill-sync.test.ts`
- Create: `tests/platform-skill-download.test.ts`

- [ ] **Step 1: 调整 Skill 下载事件名为 `run.skill.download.*`**
- [ ] **Step 2: 调整 Skill 同步事件名为 `run.skill.sync.*`**
- [ ] **Step 3: 补下载成功/失败审计测试**
- [ ] **Step 4: 回跑定向测试**

## Task 2: 更新文档并收口

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-skill-sync-audit-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-skill-sync-audit-implementation.md`

- [ ] **Step 1: 更新事件命名说明**
- [ ] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**
