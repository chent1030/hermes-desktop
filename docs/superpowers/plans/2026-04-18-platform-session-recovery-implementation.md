# Platform Session Recovery Implementation Plan

**Goal:** 为桌面端补显式 `session-recovery` 阶段，在会话失效时展示清晰的恢复/退出中过渡态。

**Architecture:** 在 `PlatformProvider` 内新增 `session-recovery` 阶段和恢复原因状态，复用现有 `logoutTenant()` 清理逻辑；`DesktopRoot` 增加新分支渲染一个只读恢复页。

**Tech Stack:** TypeScript, React, Electron renderer, Vitest

---

## Task 1: 扩展平台状态机与恢复页

**Files:**
- Modify: `src/renderer/src/platform/PlatformProvider.tsx`
- Modify: `src/renderer/src/platform/DesktopRoot.tsx`
- Create: `src/renderer/src/screens/SessionRecovery/SessionRecovery.tsx`
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`

- [x] **Step 1: 新增 `session-recovery` 阶段与恢复原因状态**
- [x] **Step 2: 在刷新失败 / 审计 reauth-required 时切入该阶段**
- [x] **Step 3: 新增最小恢复页与双语文案**

## Task 2: 补测试并收口

**Files:**
- Modify: `src/renderer/src/platform/PlatformProvider.test.tsx`
- Modify: `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [x] **Step 1: 补刷新失败与审计 reauth 的恢复态测试**
- [x] **Step 2: 补恢复页中英文文案测试**
- [x] **Step 3: 跑定向测试与类型检查**
- [ ] **Step 4: 提交并推送**

## Verification

- `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx`
- `npm run typecheck`
