# Platform Run Tool Lifecycle Implementation Plan

**Goal:** 补齐工具运行的最小生命周期审计，并让 API / CLI 两条链路保持一致。

**Architecture:** 在 `src/main/hermes.ts` 内部引入一次聊天级别的工具运行状态跟踪器；在 API 自定义事件、API 旧式内嵌进度文本、CLI stdout 工具进度行三处共用；完成态和失败态分别挂在现有聊天完成/失败分支上发射。

**Tech Stack:** TypeScript, Electron main process, Vitest

---

## Task 1: 先补失败测试锁定生命周期

**Files:**
- Modify: `tests/hermes-platform-audit.test.ts`

- [x] **Step 1: 补 API 成功链路的 started/progress/completed 测试**
- [x] **Step 2: 补 API 失败链路的 started/progress/failed 测试**
- [x] **Step 3: 补 CLI fallback 一致性测试**

## Task 2: 实现工具生命周期审计

**Files:**
- Modify: `src/main/hermes.ts`

- [x] **Step 1: 引入工具运行状态跟踪**
- [x] **Step 2: API 链路补 started/completed/failed**
- [x] **Step 3: CLI 链路识别工具进度并补 started/completed/failed**

## Task 3: 文档与验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-phase2-remaining-gaps-review.md`

- [x] **Step 1: 更新事件说明**
- [x] **Step 2: 跑相关测试与类型检查**
- [ ] **Step 3: 提交并推送**

## Verification

- `npm run test -- tests/hermes-platform-audit.test.ts`
- `npm run typecheck`
