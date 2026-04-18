# Platform Skill Sync Audit Implementation Plan

**Goal:** 补强 `skill.sync.completed` 审计 payload，让一次本地 Skill 探测能够上报完整状态分布统计。

**Architecture:** 继续复用 `platformSyncSkillInstallations()` 的本地状态映射结果，在映射完成后做一次轻量聚合，再把聚合结果写入既有审计事件；不新增新事件类型，不改 UI 流程。

**Tech Stack:** TypeScript, Electron main process, Vitest

---

## Task 1: 扩展 Skill 同步完成事件 payload

**Files:**
- Modify: `src/main/platform/index.ts`
- Test: `tests/platform-skill-sync.test.ts`

- [ ] **Step 1: 先补测试，锁定 `skill.sync.completed` 的状态统计**
- [ ] **Step 2: 在 `platformSyncSkillInstallations()` 内基于 `states` 聚合各状态计数与 scope 计数**
- [ ] **Step 3: 保持返回给渲染层的 `LocalSkillState[]` 不变**
- [ ] **Step 4: 跑定向测试确认通过**

## Task 2: 更新文档并收口

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: 补一条说明，记录 Skill 探测完成事件的聚合字段**
- [ ] **Step 2: 跑相关测试**
- [ ] **Step 3: 提交并推送**
