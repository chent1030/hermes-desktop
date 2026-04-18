# Platform Run Audit Expansion Implementation Plan

**Goal:** 把模型切换和工具运行进度继续纳入 `run.*` 事件族，进一步补齐第二份计划里的运行审计闭环。

**Architecture:** 保持 `chat.*`、`auth.*`、`workspace.*` 原有边界不动；把模型切换重命名为 `run.model.*`，并在 `src/main/hermes.ts` 的 API 工具进度回调处补发 `run.tool.progress`。

**Tech Stack:** TypeScript, Electron main process, Vitest

---

## Task 1: 收口模型切换审计

**Files:**
- Modify: `src/main/platform/index.ts`
- Modify: `tests/platform-lifecycle-audit.test.ts`

- [x] **Step 1: 把模型切换成功/失败事件改为 `run.model.*`**
- [x] **Step 2: 补成功与失败测试**

## Task 2: 补工具运行进度审计

**Files:**
- Modify: `src/main/hermes.ts`
- Modify: `tests/hermes-platform-audit.test.ts`

- [x] **Step 1: 为 API 工具进度补 `run.tool.progress` 事件**
- [x] **Step 2: 补 API 工具进度审计测试**

## Task 3: 文档与验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新事件说明与剩余缺口描述**
- [x] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- tests/platform-lifecycle-audit.test.ts tests/hermes-platform-audit.test.ts tests/platform-skill-sync.test.ts tests/platform-skill-download.test.ts`
- `npm run typecheck`
