# Platform Desktop Error Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:test-driven-development and complete this plan step by step.

**Goal:** 让桌面端在登录、初始化、刷新和审计链路上优先展示平台后端返回的明确错误消息，而不是笼统的 HTTP 状态文本。

**Architecture:** 保持现有平台运行时调用入口不变，只在 `src/main/platform/client.ts` 这一层补统一错误解析；测试集中放在 `tests/platform-runtime.test.ts`。

**Tech Stack:** TypeScript, Vitest

---

### Task 1: 先补红灯测试

**Files:**
- Modify: `tests/platform-runtime.test.ts`

- [ ] 新增“登录失败透传后端 message”测试
- [ ] 新增“初始化接口失败透传后端 message”测试
- [ ] 跑 `npm run test -- tests/platform-runtime.test.ts`，确认先红灯

### Task 2: 实现平台客户端错误解析

**Files:**
- Modify: `src/main/platform/client.ts`

- [ ] 为非 2xx 响应解析 JSON `message`
- [ ] 为非 JSON 响应保留纯文本回退
- [ ] 保持 `PlatformRequestError.status` 不变
- [ ] 再跑 `npm run test -- tests/platform-runtime.test.ts`，确认转绿

### Task 3: 做收口验证

**Files:**
- No additional files required

- [ ] 跑 `npm run test -- tests/platform-runtime.test.ts src/renderer/src/platform/PlatformProvider.test.tsx`
- [ ] 如无回归，再视情况补 `npm run test`
