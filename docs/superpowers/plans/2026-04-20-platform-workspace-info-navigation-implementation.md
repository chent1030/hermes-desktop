# Platform Workspace Info Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把桌面端登录后的平台状态从工作区顶部移走，改为侧边栏新增“工作区信息”入口承接租户、账号、模型、审计状态与会话操作，同时保留主界面零打扰体验。

**Architecture:** 保持现有 `Layout` 作为登录后唯一主容器，在侧边栏新增 `workspace-info` 视图，并新增一个独立 `WorkspaceInfo` 页面集中消费 `usePlatform()` 提供的工作区状态。`PlatformProvider` 新增手动 `refreshSession()` 动作供页面按钮与现有定时续期共用，`WorkspaceShell` 仅保留外层容器职责，不再渲染横幅或顶部 meta。

**Tech Stack:** TypeScript, React, Electron renderer, shared i18n, Vitest

---

## File Map

- Create: `src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.tsx`
  - 新的环境/状态页，集中展示租户、账号、模型、审计和会话操作。
- Create: `src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx`
  - 覆盖页面信息展示、异常局部表达和按钮动作。
- Modify: `src/renderer/src/screens/Layout/Layout.tsx`
  - 新增 `workspace-info` 视图和侧边栏导航项，并接入新页面。
- Modify: `src/renderer/src/screens/Workspace/WorkspaceShell.tsx`
  - 删除 `WorkspaceBanner` 和顶部 `workspace-shell-meta`，仅保留工作区容器。
- Modify: `src/renderer/src/platform/DesktopRoot.tsx`
  - 不再把 `audit` 透传给 `WorkspaceShell`。
- Modify: `src/renderer/src/platform/PlatformProvider.tsx`
  - 对外暴露 `refreshSession()`，并让定时续期复用同一条错误恢复链路。
- Modify: `src/renderer/src/platform/PlatformProvider.test.tsx`
  - 覆盖手动刷新动作与 locale 同步后的工作区入口断言。
- Modify: `src/renderer/src/assets/main.css`
  - 删除顶部 meta 相关样式的使用点，新增 `WorkspaceInfo` 页面卡片/状态/按钮布局样式。
- Modify: `src/shared/i18n/locales/en/navigation.ts`
- Modify: `src/shared/i18n/locales/zh-CN/navigation.ts`
  - 侧边栏“工作区信息”导航文案。
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`
  - 页面标题、分组标题、租户编码、显示名、刷新会话等文案。
- Modify: `src/renderer/src/screens/Layout/Layout.localization.test.tsx`
  - 断言新增导航和点击后切到新页面。
- Modify: `src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx`
  - 断言顶部横幅和 meta 已移除。
- Modify: `src/renderer/src/screens/PlatformLocalization.test.tsx`
  - 用 `WorkspaceInfo` 替代原来的横幅文案覆盖。
- Modify: `src/renderer/src/screens/Login/Login.test.tsx`
- Modify: `src/renderer/src/screens/Models/Models.localization.test.tsx`
- Modify: `src/renderer/src/screens/Settings/Settings.localization.test.tsx`
  - 补 `refreshSession: vi.fn()`，保持 `PlatformContext` 测试桩类型完整。

---

### Task 1: 给平台上下文补齐手动刷新会话动作

**Files:**
- Modify: `src/renderer/src/platform/PlatformProvider.tsx`
- Modify: `src/renderer/src/platform/PlatformProvider.test.tsx`
- Modify: `src/renderer/src/screens/Login/Login.test.tsx`
- Modify: `src/renderer/src/screens/Models/Models.localization.test.tsx`
- Modify: `src/renderer/src/screens/Settings/Settings.localization.test.tsx`
- Modify: `src/renderer/src/screens/Layout/Layout.localization.test.tsx`
- Modify: `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [ ] **Step 1: 先写失败测试，确认 `PlatformProvider` 暴露手动刷新动作**

```tsx
// src/renderer/src/platform/PlatformProvider.test.tsx
import { usePlatform } from "./usePlatform";

function RefreshSessionProbe(): React.JSX.Element {
  const { refreshSession } = usePlatform();
  return (
    <button onClick={() => void refreshSession()}>
      Manual refresh
    </button>
  );
}

it("exposes a manual refresh action from platform context", async () => {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      refreshTenantSession: vi.fn().mockResolvedValue(undefined),
      logoutTenant: vi.fn().mockResolvedValue(undefined),
    },
  });

  render(
    <I18nProvider>
      <PlatformProvider>
        <RefreshSessionProbe />
      </PlatformProvider>
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Manual refresh" }));

  await waitFor(() => {
    expect(window.hermesAPI.refreshTenantSession).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx`
Expected: FAIL，提示 `refreshSession` 不存在于 `PlatformContextValue` 或按钮点击后没有触发 `refreshTenantSession()`。

- [ ] **Step 3: 在 `PlatformProvider` 中实现 `refreshSession()` 并让定时器复用它**

```tsx
// src/renderer/src/platform/PlatformProvider.tsx
interface PlatformContextValue {
  stage: PlatformStage;
  workspace: WorkspaceBootstrap | null;
  audit: AuditStatus | null;
  initError: string | null;
  initStatus?: WorkspaceInitStatus;
  sessionRecoveryReason?: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  refreshSession: () => Promise<void>;
  retryInitialization: () => Promise<void>;
  logout: () => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
}

const refreshSession = useCallback(async (): Promise<void> => {
  try {
    await window.hermesAPI.refreshTenantSession();
  } catch (error) {
    const reason = (error as Error).message || "refresh token expired";
    await startSessionRecovery(reason);
    throw error;
  }
}, [startSessionRecovery]);

useEffect(() => {
  if (
    stage !== "workspace" ||
    typeof window.hermesAPI.refreshTenantSession !== "function"
  ) {
    return;
  }

  const timer = window.setInterval(() => {
    void refreshSession();
  }, 5 * 60 * 1000);

  return () => {
    window.clearInterval(timer);
  };
}, [stage, refreshSession]);

const value = useMemo<PlatformContextValue>(
  () => ({
    stage,
    workspace,
    audit,
    initError,
    initStatus,
    sessionRecoveryReason,
    login,
    refreshSession,
    retryInitialization: runInitialization,
    logout,
    setSelectedModel,
  }),
  [
    stage,
    workspace,
    audit,
    initError,
    initStatus,
    sessionRecoveryReason,
    login,
    refreshSession,
    runInitialization,
    logout,
    setSelectedModel,
  ],
);
```

- [ ] **Step 4: 补齐所有 `PlatformContext.Provider` 测试桩上的 `refreshSession` 字段**

```tsx
// 把同一行补到以下每个 Provider value 中：
refreshSession: vi.fn(),
```

Apply to:
- `src/renderer/src/screens/Login/Login.test.tsx`
- `src/renderer/src/screens/Models/Models.localization.test.tsx`
- `src/renderer/src/screens/Settings/Settings.localization.test.tsx`
- `src/renderer/src/screens/Layout/Layout.localization.test.tsx`
- `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [ ] **Step 5: 跑回归，确认上下文改动没有击穿现有平台测试**

Run: `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/Login/Login.test.tsx src/renderer/src/screens/Models/Models.localization.test.tsx src/renderer/src/screens/Settings/Settings.localization.test.tsx`
Expected: PASS，`PlatformProvider` 新测试通过，其余上下文消费者测试恢复编译并通过。

- [ ] **Step 6: 提交这一小步**

```bash
git add src/renderer/src/platform/PlatformProvider.tsx \
  src/renderer/src/platform/PlatformProvider.test.tsx \
  src/renderer/src/screens/Login/Login.test.tsx \
  src/renderer/src/screens/Models/Models.localization.test.tsx \
  src/renderer/src/screens/Settings/Settings.localization.test.tsx \
  src/renderer/src/screens/Layout/Layout.localization.test.tsx \
  src/renderer/src/screens/PlatformLocalization.test.tsx
git commit -m "feat: expose manual platform session refresh"
```

---

### Task 2: 新建“工作区信息”页面并承接状态与动作

**Files:**
- Create: `src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.tsx`
- Create: `src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx`
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`
- Modify: `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [ ] **Step 1: 先写失败测试，锁定页面信息架构和局部异常表达**

```tsx
// src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx
it("renders workspace identity, status, audit detail, and actions for degraded audit", () => {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      retryAuditFlush: vi.fn().mockResolvedValue(undefined),
    },
  });

  render(
    <I18nProvider>
      <PlatformContext.Provider
        value={{
          stage: "workspace",
          workspace: {
            tenant: { id: "t1", code: "acme", name: "Acme" },
            user: { id: "u1", username: "alice", displayName: "Alice" },
            locale: "zh-CN",
            features: { gatewayVisible: false },
            models: [
              {
                id: "m1",
                provider: "openai",
                model: "gpt-5.4",
                label: "GPT-5.4",
                baseUrl: "",
                isDefault: true,
              },
            ],
            selectedModelId: "m1",
            skills: [],
          },
          audit: {
            health: "degraded",
            localHealth: "healthy",
            remoteHealth: "degraded",
            queuedEvents: 2,
            droppedEvents: 1,
            lastError: "审计服务不可用",
          },
          initError: null,
          login: vi.fn(),
          refreshSession: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
        }}
      >
        <WorkspaceInfo />
      </PlatformContext.Provider>
    </I18nProvider>,
  );

  expect(screen.getByRole("heading", { name: "工作区信息" })).toBeInTheDocument();
  expect(screen.getByText("基本信息")).toBeInTheDocument();
  expect(screen.getByText("工作区状态")).toBeInTheDocument();
  expect(screen.getByText("审计详情")).toBeInTheDocument();
  expect(screen.getByText("会话操作")).toBeInTheDocument();
  expect(screen.getByText("租户编码")).toBeInTheDocument();
  expect(screen.getByText("acme")).toBeInTheDocument();
  expect(screen.getByText("显示名")).toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  expect(screen.getByText("当前模型")).toBeInTheDocument();
  expect(screen.getByText("GPT-5.4")).toBeInTheDocument();
  expect(screen.getByText("本地审计状态")).toBeInTheDocument();
  expect(screen.getByText("平台审计状态")).toBeInTheDocument();
  expect(screen.getByText("待补传：2")).toBeInTheDocument();
  expect(screen.getByText("已丢弃：1")).toBeInTheDocument();
  expect(screen.getByText("审计服务不可用")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "刷新会话" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重新初始化" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "退出登录" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试审计上传" })).toBeInTheDocument();
});

it("hides retry audit upload when audit is healthy", () => {
  render(
    <I18nProvider>
      <PlatformContext.Provider
        value={{
          stage: "workspace",
          workspace: {
            tenant: { id: "t1", code: "acme", name: "Acme" },
            user: { id: "u1", username: "alice", displayName: "Alice" },
            locale: "zh-CN",
            features: { gatewayVisible: false },
            models: [],
            selectedModelId: "",
            skills: [],
          },
          audit: {
            health: "healthy",
            localHealth: "healthy",
            remoteHealth: "healthy",
            queuedEvents: 0,
            droppedEvents: 0,
            lastError: null,
          },
          initError: null,
          login: vi.fn(),
          refreshSession: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
        }}
      >
        <WorkspaceInfo />
      </PlatformContext.Provider>
    </I18nProvider>,
  );

  expect(screen.queryByRole("button", { name: "重试审计上传" })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认页面尚不存在**

Run: `npm run test -- src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx`
Expected: FAIL，提示 `WorkspaceInfo` 文件不存在，或标题/字段/按钮文案都尚未渲染。

- [ ] **Step 3: 先补齐页面所需中英文文案**

```ts
// src/shared/i18n/locales/zh-CN/platform.ts
workspaceInfoTitle: "工作区信息",
workspaceInfoDescription: "集中查看当前租户、账号、模型与审计链路状态。",
workspaceInfoIdentity: "基本信息",
workspaceInfoStatus: "工作区状态",
workspaceInfoAuditDetails: "审计详情",
workspaceInfoActions: "会话操作",
workspaceInfoTenantCode: "租户编码",
workspaceInfoDisplayName: "显示名",
workspaceInfoUsername: "用户名",
workspaceInfoAuditLocal: "本地审计状态",
workspaceInfoAuditRemote: "平台审计状态",
workspaceInfoQueued: "待上传数量",
workspaceInfoDropped: "已丢弃数量",
workspaceInfoLastError: "最近错误",
workspaceInfoAuditHealthyHint: "审计链路正常，当前没有待处理异常。",
refreshSession: "刷新会话",

// src/shared/i18n/locales/en/platform.ts
workspaceInfoTitle: "Workspace info",
workspaceInfoDescription: "Review tenant, account, model, and audit delivery state in one place.",
workspaceInfoIdentity: "Identity",
workspaceInfoStatus: "Workspace status",
workspaceInfoAuditDetails: "Audit details",
workspaceInfoActions: "Session actions",
workspaceInfoTenantCode: "Tenant code",
workspaceInfoDisplayName: "Display name",
workspaceInfoUsername: "Username",
workspaceInfoAuditLocal: "Local audit status",
workspaceInfoAuditRemote: "Platform audit status",
workspaceInfoQueued: "Queued events",
workspaceInfoDropped: "Dropped events",
workspaceInfoLastError: "Last error",
workspaceInfoAuditHealthyHint: "Audit delivery is healthy. No retry is needed right now.",
refreshSession: "Refresh session",
```

- [ ] **Step 4: 实现 `WorkspaceInfo` 页面，集中承接状态与动作**

```tsx
// src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.tsx
import type { AuditHealth, AuditStatus } from "../../../../shared/platform/audit";
import { useI18n } from "../../components/useI18n";
import { usePlatform } from "../../platform/usePlatform";

function getAuditLabel(
  health: AuditHealth | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (health === "degraded") return t("platform.auditDegraded");
  if (health === "buffering") return t("platform.auditBuffering");
  if (health === "reauth-required") return t("platform.auditReauthRequired");
  return t("platform.auditHealthy");
}

function getAuditHint(
  audit: AuditStatus | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!audit || audit.health === "healthy") {
    return t("platform.workspaceInfoAuditHealthyHint");
  }
  if (audit.health === "buffering") return t("platform.auditBufferingHint");
  if (audit.health === "degraded") return t("platform.auditDegradedHint");
  return t("platform.auditReauthHint");
}

export default function WorkspaceInfo(): React.JSX.Element {
  const { t } = useI18n();
  const {
    workspace,
    audit,
    refreshSession,
    retryInitialization,
    logout,
  } = usePlatform();

  const selectedModel =
    workspace?.models.find((model) => model.id === workspace.selectedModelId)?.label ||
    workspace?.selectedModelId ||
    t("platform.currentModelFallback");
  const showRetryAudit =
    audit?.health === "buffering" || audit?.health === "degraded";

  return (
    <div className="settings-container workspace-info-page">
      <header className="workspace-info-header">
        <h1 className="settings-header">{t("platform.workspaceInfoTitle")}</h1>
        <p className="workspace-info-description">
          {t("platform.workspaceInfoDescription")}
        </p>
      </header>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoIdentity")}
        </h2>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.tenant")}</div>
            <div className="settings-detail-value">{workspace?.tenant.name ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoTenantCode")}
            </div>
            <div className="settings-detail-value">{workspace?.tenant.code ?? "-"}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoDisplayName")}
            </div>
            <div className="settings-detail-value">
              {workspace?.user.displayName ?? "-"}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoUsername")}
            </div>
            <div className="settings-detail-value">{workspace?.user.username ?? "-"}</div>
          </div>
        </div>
      </section>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoStatus")}
        </h2>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.currentModel")}</div>
            <div className="settings-detail-value">{selectedModel}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">{t("platform.auditStatus")}</div>
            <div className="settings-detail-value">{getAuditLabel(audit?.health, t)}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoAuditLocal")}
            </div>
            <div className="settings-detail-value">
              {getAuditLabel(audit?.localHealth, t)}
            </div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoAuditRemote")}
            </div>
            <div className="settings-detail-value">
              {getAuditLabel(audit?.remoteHealth, t)}
            </div>
          </div>
        </div>
      </section>

      <section className={`settings-card workspace-info-audit workspace-info-audit-${audit?.health ?? "healthy"}`}>
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoAuditDetails")}
        </h2>
        <p className="workspace-info-description">{getAuditHint(audit, t)}</p>
        <div className="settings-detail-grid">
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoQueued")}
            </div>
            <div className="settings-detail-value">{t("platform.auditQueued", { count: audit?.queuedEvents ?? 0 })}</div>
          </div>
          <div className="settings-detail-item">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoDropped")}
            </div>
            <div className="settings-detail-value">{t("platform.auditDropped", { count: audit?.droppedEvents ?? 0 })}</div>
          </div>
          <div className="settings-detail-item workspace-info-full-span">
            <div className="settings-detail-label">
              {t("platform.workspaceInfoLastError")}
            </div>
            <div className="settings-detail-value">{audit?.lastError ?? "-"}</div>
          </div>
        </div>
        {showRetryAudit && (
          <div className="workspace-info-actions-row">
            <button className="btn btn-secondary" onClick={() => void window.hermesAPI.retryAuditFlush()}>
              {t("platform.retryAuditUpload")}
            </button>
          </div>
        )}
      </section>

      <section className="settings-card">
        <h2 className="workspace-info-section-title">
          {t("platform.workspaceInfoActions")}
        </h2>
        <div className="workspace-info-actions-row">
          <button className="btn btn-secondary" onClick={() => void refreshSession()}>
            {t("platform.refreshSession")}
          </button>
          <button className="btn btn-secondary" onClick={() => void retryInitialization()}>
            {t("platform.reinitialize")}
          </button>
          <button className="btn btn-primary workspace-info-signout" onClick={() => void logout()}>
            {t("platform.signOut")}
          </button>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: 把平台中文文案测试从横幅迁到新页面**

```tsx
// src/renderer/src/screens/PlatformLocalization.test.tsx
import WorkspaceInfo from "./WorkspaceInfo/WorkspaceInfo";

it("renders localized workspace info copy in Chinese", () => {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      retryAuditFlush: vi.fn().mockResolvedValue(undefined),
    },
  });

  render(
    <I18nProvider>
      <PlatformContext.Provider
        value={{
          stage: "workspace",
          workspace: {
            tenant: { id: "t1", code: "acme", name: "Acme" },
            user: { id: "u1", username: "alice", displayName: "Alice" },
            locale: "zh-CN",
            features: { gatewayVisible: false },
            models: [],
            selectedModelId: "",
            skills: [],
          },
          audit: {
            health: "degraded",
            localHealth: "healthy",
            remoteHealth: "degraded",
            queuedEvents: 2,
            droppedEvents: 1,
            lastError: "服务不可用",
          },
          initError: null,
          login: vi.fn(),
          refreshSession: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
        }}
      >
        <WorkspaceInfo />
      </PlatformContext.Provider>
    </I18nProvider>,
  );

  expect(screen.getByRole("heading", { name: "工作区信息" })).toBeInTheDocument();
  expect(screen.getByText("租户编码")).toBeInTheDocument();
  expect(screen.getByText("会话操作")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "刷新会话" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试审计上传" })).toBeInTheDocument();
});
```

- [ ] **Step 6: 跑页面测试确认新页面可以独立成立**

Run: `npm run test -- src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx`
Expected: PASS，页面四个区块、异常局部表达和动作按钮都通过断言。

- [ ] **Step 7: 提交这一小步**

```bash
git add src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.tsx \
  src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx \
  src/shared/i18n/locales/en/platform.ts \
  src/shared/i18n/locales/zh-CN/platform.ts \
  src/renderer/src/screens/PlatformLocalization.test.tsx
git commit -m "feat: add workspace info status screen"
```

---

### Task 3: 把入口接进侧边栏，并从顶部移除平台状态条

**Files:**
- Modify: `src/renderer/src/screens/Layout/Layout.tsx`
- Modify: `src/renderer/src/screens/Workspace/WorkspaceShell.tsx`
- Modify: `src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx`
- Modify: `src/renderer/src/platform/DesktopRoot.tsx`
- Modify: `src/renderer/src/platform/PlatformProvider.test.tsx`
- Modify: `src/renderer/src/screens/Layout/Layout.localization.test.tsx`
- Modify: `src/shared/i18n/locales/en/navigation.ts`
- Modify: `src/shared/i18n/locales/zh-CN/navigation.ts`
- Modify: `src/renderer/src/assets/main.css`

- [ ] **Step 1: 先改测试，锁定“顶部无打扰 + 侧边栏新入口”行为**

```tsx
// src/renderer/src/screens/Layout/Layout.localization.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../WorkspaceInfo/WorkspaceInfo", () => ({
  default: () => <div>Workspace Info Screen</div>,
}));

it("renders the workspace info nav item in Chinese and opens the page", () => {
  render(
    <I18nProvider>
      <PlatformContext.Provider
        value={{
          stage: "workspace",
          workspace: {
            tenant: { id: "t1", code: "acme", name: "Acme" },
            user: { id: "u1", username: "alice", displayName: "Alice" },
            locale: "zh-CN",
            features: { gatewayVisible: false },
            models: [],
            selectedModelId: "",
            skills: [],
          },
          audit: null,
          initError: null,
          login: vi.fn(),
          refreshSession: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
        }}
      >
        <Layout gatewayVisible={false} />
      </PlatformContext.Provider>
    </I18nProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: /工作区信息/i }));
  expect(screen.getByText("Workspace Info Screen")).toBeInTheDocument();
});

// src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx
it("removes the top audit banner and workspace meta strip", () => {
  render(
    <I18nProvider>
      <WorkspaceShell
        workspace={{
          tenant: { id: "t1", code: "acme", name: "Acme" },
          user: { id: "u1", username: "alice", displayName: "Alice" },
          locale: "zh-CN",
          features: { gatewayVisible: false },
          models: [],
          selectedModelId: "",
          skills: [],
        }}
      />
    </I18nProvider>,
  );

  expect(screen.queryByText("审计告警")).not.toBeInTheDocument();
  expect(screen.queryByText("租户")).not.toBeInTheDocument();
  expect(screen.queryByText("当前模型")).not.toBeInTheDocument();
  expect(screen.getByText("Gateway hidden")).toBeInTheDocument();
});

// src/renderer/src/platform/PlatformProvider.test.tsx
await waitFor(() => {
  expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认当前实现仍然卡在旧顶部结构**

Run: `npm run test -- src/renderer/src/screens/Layout/Layout.localization.test.tsx src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx src/renderer/src/platform/PlatformProvider.test.tsx`
Expected: FAIL，当前缺少“工作区信息”导航项，`WorkspaceShell` 仍会渲染顶部 meta，`PlatformProvider` 的 locale 同步测试仍依赖旧顶部文本。

- [ ] **Step 3: 接入侧边栏入口和 `workspace-info` 视图**

```tsx
// src/shared/i18n/locales/zh-CN/navigation.ts
workspaceInfo: "工作区信息",

// src/shared/i18n/locales/en/navigation.ts
workspaceInfo: "Workspace info",

// src/renderer/src/screens/Layout/Layout.tsx
import WorkspaceInfo from "../WorkspaceInfo/WorkspaceInfo";
import {
  ChatBubble,
  Clock,
  Users,
  Settings as SettingsIcon,
  Puzzle,
  Sparkles,
  Brain,
  Wrench,
  Building,
  Layers,
  Timer,
  Download,
  Monitor,
} from "../../assets/icons";

type View =
  | "chat"
  | "sessions"
  | "agents"
  | "office"
  | "models"
  | "skills"
  | "soul"
  | "memory"
  | "tools"
  | "schedules"
  | "workspace-info"
  | "settings";

const NAV_ITEMS: { view: View; icon: LucideIcon; labelKey: string }[] = [
  { view: "chat", icon: ChatBubble, labelKey: "navigation.chat" },
  { view: "sessions", icon: Clock, labelKey: "navigation.sessions" },
  { view: "agents", icon: Users, labelKey: "navigation.agents" },
  { view: "office", icon: Building, labelKey: "navigation.office" },
  { view: "models", icon: Layers, labelKey: "navigation.models" },
  { view: "skills", icon: Puzzle, labelKey: "navigation.skills" },
  { view: "soul", icon: Sparkles, labelKey: "navigation.soul" },
  { view: "memory", icon: Brain, labelKey: "navigation.memory" },
  { view: "tools", icon: Wrench, labelKey: "navigation.tools" },
  { view: "schedules", icon: Timer, labelKey: "navigation.schedules" },
  { view: "workspace-info", icon: Monitor, labelKey: "navigation.workspaceInfo" },
  { view: "settings", icon: SettingsIcon, labelKey: "navigation.settings" },
];

{view === "workspace-info" && <WorkspaceInfo />}
```

- [ ] **Step 4: 精简 `WorkspaceShell` 和 `DesktopRoot`，彻底移除顶部平台状态条**

```tsx
// src/renderer/src/screens/Workspace/WorkspaceShell.tsx
import type { WorkspaceBootstrap } from "../../../../shared/platform/contracts";
import Layout from "../Layout/Layout";

export default function WorkspaceShell({
  workspace,
}: {
  workspace: WorkspaceBootstrap;
}): React.JSX.Element {
  return (
    <div className="workspace-shell">
      <Layout gatewayVisible={workspace.features.gatewayVisible} />
    </div>
  );
}

// src/renderer/src/platform/DesktopRoot.tsx
export default function DesktopRoot(): React.JSX.Element {
  const { stage, workspace } = usePlatform();

  if (stage === "login") return <Login />;
  if (stage === "initializing") return <Initializing />;
  if (stage === "session-recovery") return <SessionRecovery />;
  if (!workspace) return <Initializing />;

  return <WorkspaceShell workspace={workspace} />;
}
```

- [ ] **Step 5: 补齐 `WorkspaceInfo` 页面样式，确保桌面端不挤占主任务区域**

```css
/* src/renderer/src/assets/main.css */
.workspace-info-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.workspace-info-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-info-description {
  margin: 0;
  color: var(--text-secondary);
  font-size: 14px;
  line-height: 1.6;
}

.workspace-info-section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin: 0 0 16px;
}

.workspace-info-audit {
  border-color: var(--border);
}

.workspace-info-audit-degraded,
.workspace-info-audit-buffering {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  background: color-mix(in srgb, var(--accent-subtle) 35%, var(--bg-secondary));
}

.workspace-info-audit-reauth-required {
  border-color: color-mix(in srgb, #d92d20 45%, var(--border));
  background: color-mix(in srgb, #d92d20 8%, var(--bg-secondary));
}

.workspace-info-actions-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
}

.workspace-info-signout {
  background: color-mix(in srgb, #d92d20 84%, #111827);
}

.workspace-info-full-span {
  grid-column: 1 / -1;
}

@media (max-width: 960px) {
  .workspace-info-actions-row {
    flex-direction: column;
  }
}
```

- [ ] **Step 6: 跑核心回归并补一次类型检查**

Run: `npm run test -- src/renderer/src/screens/Layout/Layout.localization.test.tsx src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/WorkspaceInfo/WorkspaceInfo.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx && npm run typecheck`
Expected: PASS，侧边栏可进入“工作区信息”，工作区顶部不再有横幅和 meta，相关 React/TypeScript 类型检查通过。

- [ ] **Step 7: 提交这一小步**

```bash
git add src/renderer/src/screens/Layout/Layout.tsx \
  src/renderer/src/screens/Workspace/WorkspaceShell.tsx \
  src/renderer/src/screens/Workspace/WorkspaceShell.test.tsx \
  src/renderer/src/platform/DesktopRoot.tsx \
  src/renderer/src/platform/PlatformProvider.test.tsx \
  src/renderer/src/screens/Layout/Layout.localization.test.tsx \
  src/shared/i18n/locales/en/navigation.ts \
  src/shared/i18n/locales/zh-CN/navigation.ts \
  src/renderer/src/assets/main.css
git commit -m "refactor: move workspace status into sidebar page"
```

---

## Spec Coverage Check

- 顶部不再显示审计告警横幅：Task 3 的 `WorkspaceShell` 精简和测试断言覆盖。
- 顶部不再显示租户/账号/模型/审计状态条：Task 3 的 `WorkspaceShell` 精简和测试断言覆盖。
- 左侧导航新增“工作区信息”：Task 3 的 `Layout`、`navigation` 文案和导航测试覆盖。
- 页面展示租户、账号、模型、审计状态和会话操作：Task 2 的 `WorkspaceInfo` 组件与测试覆盖。
- 审计异常只在页面内部表达：Task 2 的 `WorkspaceInfo` 异常提示 + Task 3 的顶部移除覆盖。
- “刷新会话”动作可用：Task 1 的 `PlatformProvider.refreshSession()` + Task 2 的按钮接入覆盖。
- 第一阶段不大改 `Settings`：本计划仅更新 `Settings.localization.test.tsx` 的上下文桩，不调整 `Settings.tsx` 功能。

## Placeholder Scan

- 已避免 `TBD`、`TODO`、"后续实现" 之类占位描述。
- 每个代码步骤都给出了实际文件路径、命令和代码片段。
- 所有新增 API 名称保持一致：`refreshSession`、`workspace-info`、`WorkspaceInfo`。

## Type Consistency Check

- `PlatformContextValue` 新字段统一命名为 `refreshSession`。
- `Layout` 内新视图统一使用 `workspace-info`，与导航项和条件渲染保持一致。
- 本地化键统一使用 `platform.workspaceInfo*` 和 `navigation.workspaceInfo`。
