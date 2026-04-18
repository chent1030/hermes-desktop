# Platform Init And Audit Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and implement in the order below.

**Goal:** 一起补齐初始化阶段错误分层文案，以及远端审计健康探测并入工作区审计状态。

**Architecture:** 初始化错误文案主要落在 renderer 的 `Initializing` 页面和平台多语言文案；远端审计健康探测落在 main 进程平台运行时，由 renderer 继续复用现有 `getAuditStatus` 轮询链路。

**Tech Stack:** TypeScript, React, Vitest

---

### Task 1: 初始化错误分层文案

**Files:**
- Modify: `src/renderer/src/screens/Initializing/Initializing.tsx`
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`
- Test: `src/renderer/src/platform/PlatformProvider.test.tsx`
- Test: `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [ ] 先补失败测试，覆盖模型失败与 bootstrap 失败的分层提示
- [ ] 实现错误分类和双语提示
- [ ] 保留原始错误文本展示

### Task 2: 远端审计健康探测

**Files:**
- Modify: `src/main/platform/client.ts`
- Modify: `src/main/platform/runtime.ts`
- Modify: `src/main/platform/index.ts`
- Test: `tests/platform-runtime.test.ts`
- Test: `tests/platform-lifecycle-audit.test.ts`

- [ ] 先补失败测试，覆盖 `503` 降级和 `401` 进入 `reauth-required`
- [ ] 增加 `/api/audit/health` 客户端请求
- [ ] 在平台运行时合并本地审计状态与远端探测结果
- [ ] 让 renderer 继续通过既有 `platform-get-audit-status` 拿到合并结果

### Task 3: 统一验证

**Files:**
- No additional files required

- [ ] 跑 `npm run test -- tests/platform-runtime.test.ts tests/platform-lifecycle-audit.test.ts`
- [ ] 跑 `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx`
- [ ] 如无回归，再决定是否补全量测试
