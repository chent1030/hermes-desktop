# Platform Init Progress And Audit Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为桌面端补齐真实的 4 段式初始化进度展示，并让设置页能同时展示总审计状态、本地缓冲状态和平台审计服务状态。

**Architecture:** 在 `main` 进程引入一个轻量初始化状态共享面，按真实执行顺序推进 `login-complete -> bootstrap -> models -> skills -> completed/failed`，再通过新 IPC 暴露给 `renderer`。审计状态继续由 `main` 进程统一汇总，但把 `localHealth` 与 `remoteHealth` 一并返回，渲染层复用既有轮询链路消费聚合结果。

**Tech Stack:** TypeScript, Electron IPC, React, Vitest

---

## File Map

- Create: `src/shared/platform/init.ts`
  - 平台初始化阶段类型定义，供 `main` / `preload` / `renderer` 复用
- Modify: `src/shared/platform/audit.ts`
  - 扩展 `AuditStatus`，新增 `localHealth`、`remoteHealth`
- Modify: `src/main/platform/runtime.ts`
  - 持有初始化阶段状态
  - 推进 `bootstrap -> models -> skills`
  - 暴露 `getWorkspaceInitStatus()`
  - 生成新的三层审计状态
- Modify: `src/main/platform/client.ts`
  - 已有远端审计探测逻辑继续复用，无需新增结构改动时只补必要类型引用
- Modify: `src/main/platform/index.ts`
  - 暴露平台初始化状态读取函数
- Modify: `src/main/index.ts`
  - 注册新的 IPC：`platform-get-init-status`
- Modify: `src/preload/index.ts`
  - 暴露 `getWorkspaceInitStatus()`
- Modify: `src/preload/index.d.ts`
  - 补类型声明
- Modify: `src/renderer/src/platform/PlatformProvider.tsx`
  - 在 `initializing` 阶段轮询读取初始化状态
  - 将初始化状态注入上下文
- Modify: `src/renderer/src/platform/usePlatform.ts`
  - 复用新上下文字段，无额外逻辑
- Modify: `src/renderer/src/screens/Initializing/Initializing.tsx`
  - 渲染 4 段式初始化进度
  - 失败时基于真实阶段停留并显示已有错误提示
- Modify: `src/renderer/src/screens/Settings/Settings.tsx`
  - 展示总状态 + 本地缓冲状态 + 平台审计服务状态
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`
  - 初始化阶段标签与状态文案
- Modify: `src/shared/i18n/locales/en/settings.ts`
- Modify: `src/shared/i18n/locales/zh-CN/settings.ts`
  - 设置页审计子状态文案
- Test: `tests/platform-runtime.test.ts`
  - 运行时初始化阶段推进 / 审计三层状态
- Test: `tests/platform-lifecycle-audit.test.ts`
  - `platformGetInitStatus()` / `platformGetAuditStatus()` 委托关系
- Test: `tests/preload-api-surface.test.ts`
  - `getWorkspaceInitStatus` 预加载暴露
- Test: `tests/ipc-handlers.test.ts`
  - `platform-get-init-status` IPC 注册与调用
- Test: `src/renderer/src/platform/PlatformProvider.test.tsx`
  - 初始化轮询 + 阶段停留
- Test: `src/renderer/src/screens/PlatformLocalization.test.tsx`
  - 中英文初始化阶段 UI
- Test: `src/renderer/src/screens/Settings/Settings.localization.test.tsx`
  - 设置页三层审计状态文案

---

### Task 1: 扩展共享类型与主进程运行时状态

**Files:**
- Create: `src/shared/platform/init.ts`
- Modify: `src/shared/platform/audit.ts`
- Modify: `src/main/platform/runtime.ts`
- Test: `tests/platform-runtime.test.ts`

- [ ] **Step 1: 先写失败测试，覆盖初始化阶段推进和审计子状态聚合**

```ts
it("tracks init progress through bootstrap, models, skills, and completed", async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
    )
    .mockImplementationOnce(async () => {
      const { getWorkspaceInitStatus } = await import("../src/main/platform/runtime");
      expect(getWorkspaceInitStatus().phase).toBe("bootstrap");
      return new Response(
        JSON.stringify({
          tenant: { id: "t1", code: "acme", name: "Acme" },
          user: { id: "u1", username: "alice", displayName: "Alice" },
          locale: "zh-CN",
          features: { gatewayVisible: false },
        }),
      );
    })
    .mockImplementationOnce(async () => {
      const { getWorkspaceInitStatus } = await import("../src/main/platform/runtime");
      expect(getWorkspaceInitStatus().phase).toBe("models");
      return new Response(
        JSON.stringify({
          items: [
            {
              id: "m-default",
              provider: "openai",
              model: "gpt-5.4",
              label: "GPT-5.4",
              baseUrl: "",
              isDefault: true,
            },
          ],
        }),
      );
    })
    .mockImplementationOnce(async () => {
      const { getWorkspaceInitStatus } = await import("../src/main/platform/runtime");
      expect(getWorkspaceInitStatus().phase).toBe("skills");
      return new Response(JSON.stringify({ items: [] }));
    });

  await loginWithPassword({
    tenantCode: "acme",
    username: "alice",
    password: "secret",
  });

  const workspace = await initializeWorkspaceState();
  expect(workspace.selectedModelId).toBe("m-default");

  const { getWorkspaceInitStatus } = await import("../src/main/platform/runtime");
  expect(getWorkspaceInitStatus()).toMatchObject({
    phase: "completed",
    lastError: null,
  });
});

it("marks remote degraded while keeping local healthy when audit health probe returns 503", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "audit service unavailable" }), {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "application/json" },
        }),
      ),
  );

  await loginWithPassword({
    tenantCode: "acme",
    username: "alice",
    password: "secret",
  });

  await expect(getWorkspaceAuditStatus()).resolves.toMatchObject({
    health: "degraded",
    localHealth: "healthy",
    remoteHealth: "degraded",
    lastError: "audit service unavailable",
  });
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `npm run test -- tests/platform-runtime.test.ts`
Expected: FAIL，提示 `getWorkspaceInitStatus`、`localHealth`、`remoteHealth` 或阶段推进逻辑尚不存在

- [ ] **Step 3: 新增共享初始化阶段类型**

```ts
// src/shared/platform/init.ts
export type WorkspaceInitPhase =
  | "idle"
  | "login-complete"
  | "bootstrap"
  | "models"
  | "skills"
  | "completed"
  | "failed";

export interface WorkspaceInitStatus {
  phase: WorkspaceInitPhase;
  lastError: string | null;
  failedPhase: Exclude<WorkspaceInitPhase, "idle" | "completed" | "failed"> | null;
}
```

- [ ] **Step 4: 扩展审计状态类型**

```ts
// src/shared/platform/audit.ts
export interface AuditStatus {
  health: AuditHealth;
  localHealth: AuditHealth;
  remoteHealth: AuditHealth;
  queuedEvents: number;
  droppedEvents: number;
  lastError: string | null;
}
```

- [ ] **Step 5: 在运行时维护初始化阶段状态**

```ts
// src/main/platform/runtime.ts
let initStatus: WorkspaceInitStatus = {
  phase: "idle",
  lastError: null,
  failedPhase: null,
};

function setInitStatus(
  phase: WorkspaceInitPhase,
  options: { lastError?: string | null; failedPhase?: WorkspaceInitStatus["failedPhase"] } = {},
): void {
  initStatus = {
    phase,
    lastError: options.lastError ?? null,
    failedPhase: options.failedPhase ?? null,
  };
}

export function getWorkspaceInitStatus(): WorkspaceInitStatus {
  return initStatus;
}
```

- [ ] **Step 6: 在登录、初始化、清理流程里推进阶段**

```ts
export async function loginWithPassword(input: TenantLoginInput): Promise<void> {
  const tokens = await loginRequest(input);
  setSessionTokens(tokens.accessToken, tokens.refreshToken);
  setInitStatus("login-complete");
}

export async function initializeWorkspaceState(): Promise<WorkspaceBootstrap> {
  const session = getSessionState();
  if (!session) {
    throw new Error("platform login required");
  }

  setInitStatus("bootstrap");
  const bootstrap = await fetchBootstrap(session.accessToken);

  setInitStatus("models");
  const models = await fetchModels(session.accessToken);
  if (models.items.length === 0) {
    setInitStatus("failed", {
      failedPhase: "models",
      lastError: "platform models unavailable",
    });
    throw new Error("platform models unavailable");
  }

  const defaultModel = models.items.find((item) => item.isDefault);
  if (!defaultModel) {
    setInitStatus("failed", {
      failedPhase: "models",
      lastError: "platform default model missing",
    });
    throw new Error("platform default model missing");
  }

  setInitStatus("skills");
  const skills = await fetchSkillCatalog(session.accessToken);

  const workspace: WorkspaceBootstrap = {
    ...bootstrap,
    models: models.items,
    selectedModelId: defaultModel.id,
    skills: skills.items,
  };

  setWorkspaceBootstrap(workspace);
  setInitStatus("completed");
  return workspace;
}

export function clearWorkspaceSession(): void {
  clearSessionState();
  setInitStatus("idle");
}
```

- [ ] **Step 7: 在运行时生成三层审计状态**

```ts
function mergeAuditHealth(
  localHealth: AuditHealth,
  remoteHealth: AuditHealth,
): AuditHealth {
  if (localHealth === "reauth-required" || remoteHealth === "reauth-required") {
    return "reauth-required";
  }
  if (localHealth === "buffering") {
    return "buffering";
  }
  if (localHealth === "degraded" || remoteHealth === "degraded") {
    return "degraded";
  }
  return "healthy";
}

export async function getWorkspaceAuditStatus(): Promise<AuditStatus> {
  const localStatus = getAuditStatus();
  const session = getSessionState();
  if (!session) {
    return localStatus;
  }

  try {
    await fetchAuditHealth(session.accessToken);
    return {
      ...localStatus,
      health: mergeAuditHealth(localStatus.localHealth, "healthy"),
      remoteHealth: "healthy",
    };
  } catch (error) {
    const message = (error as Error).message;
    const remoteHealth = isReauthError(error) ? "reauth-required" : "degraded";
    const next = {
      ...localStatus,
      remoteHealth,
      health: mergeAuditHealth(localStatus.localHealth, remoteHealth),
      lastError: message,
    };
    if (remoteHealth === "reauth-required") {
      markAuditReauthRequired(message);
      return getAuditStatus();
    }
    return next;
  }
}
```

- [ ] **Step 8: 跑测试确认通过**

Run: `npm run test -- tests/platform-runtime.test.ts`
Expected: PASS，新增阶段推进和审计子状态用例通过

- [ ] **Step 9: 提交这一小步**

```bash
git add src/shared/platform/init.ts src/shared/platform/audit.ts src/main/platform/runtime.ts tests/platform-runtime.test.ts
git commit -m "feat: track platform init progress"
```

### Task 2: 暴露初始化状态 IPC 与预加载 API

**Files:**
- Modify: `src/main/platform/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Test: `tests/preload-api-surface.test.ts`
- Test: `tests/ipc-handlers.test.ts`
- Test: `tests/platform-lifecycle-audit.test.ts`

- [ ] **Step 1: 先写失败测试，覆盖 IPC 和 preload 暴露**

```ts
// tests/preload-api-surface.test.ts
describe("Platform desktop APIs", () => {
  const platformMethods = [
    "loginTenant",
    "refreshTenantSession",
    "logoutTenant",
    "initializeWorkspace",
    "getWorkspaceInitStatus",
    "selectWorkspaceModel",
    "getAuditStatus",
    "retryAuditFlush",
    "downloadSkillPackage",
    "syncSkillInstallations",
  ];
});

// tests/ipc-handlers.test.ts
describe("Platform IPC handlers", () => {
  const platformChannels = [
    "platform-login",
    "platform-refresh-session",
    "platform-logout",
    "platform-initialize-workspace",
    "platform-get-init-status",
    "platform-select-model",
    "platform-get-audit-status",
    "platform-retry-audit-flush",
    "platform-download-skill-package",
    "platform-sync-skill-installations",
  ];
});
```

- [ ] **Step 2: 跑定向测试确认红灯**

Run: `npm run test -- tests/preload-api-surface.test.ts tests/ipc-handlers.test.ts tests/platform-lifecycle-audit.test.ts`
Expected: FAIL，提示缺少 `getWorkspaceInitStatus` API 或 `platform-get-init-status` handler

- [ ] **Step 3: 在平台索引层暴露初始化状态读取函数**

```ts
// src/main/platform/index.ts
import {
  clearWorkspaceSession,
  flushWorkspaceAuditEvents,
  getWorkspaceAuditStatus,
  getWorkspaceInitStatus,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
  selectWorkspaceModel,
} from "./runtime";

export async function platformGetInitStatus(): Promise<WorkspaceInitStatus> {
  return getWorkspaceInitStatus();
}
```

- [ ] **Step 4: 注册新的 IPC handler**

```ts
// src/main/index.ts
ipcMain.handle("platform-get-init-status", () => platformGetInitStatus());
```

- [ ] **Step 5: 在 preload 暴露新方法并补类型声明**

```ts
// src/preload/index.ts
import type { WorkspaceInitStatus } from "../shared/platform/init";

getWorkspaceInitStatus: (): Promise<WorkspaceInitStatus> =>
  ipcRenderer.invoke("platform-get-init-status"),
```

```ts
// src/preload/index.d.ts
import type { WorkspaceInitStatus } from "../shared/platform/init";

getWorkspaceInitStatus: () => Promise<WorkspaceInitStatus>;
```

- [ ] **Step 6: 扩展 lifecycle 测试，确认平台索引层透传**

```ts
// tests/platform-lifecycle-audit.test.ts
vi.mock("../src/main/platform/runtime", () => ({
  // ...
  getWorkspaceInitStatus: vi.fn().mockResolvedValue({
    phase: "models",
    failedPhase: null,
    lastError: null,
  }),
}));

it("returns workspace init status from runtime", async () => {
  await expect(platformGetInitStatus()).resolves.toMatchObject({
    phase: "models",
    failedPhase: null,
  });
});
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm run test -- tests/preload-api-surface.test.ts tests/ipc-handlers.test.ts tests/platform-lifecycle-audit.test.ts`
Expected: PASS，新的 API 与 IPC 用例通过

- [ ] **Step 8: 提交这一小步**

```bash
git add src/main/platform/index.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts tests/preload-api-surface.test.ts tests/ipc-handlers.test.ts tests/platform-lifecycle-audit.test.ts
git commit -m "feat: expose platform init status"
```

### Task 3: 接入初始化进度 UI 与平台上下文轮询

**Files:**
- Modify: `src/renderer/src/platform/PlatformProvider.tsx`
- Modify: `src/renderer/src/screens/Initializing/Initializing.tsx`
- Modify: `src/renderer/src/platform/usePlatform.ts`
- Modify: `src/renderer/src/platform/DesktopRoot.tsx`
- Modify: `src/shared/i18n/locales/en/platform.ts`
- Modify: `src/shared/i18n/locales/zh-CN/platform.ts`
- Test: `src/renderer/src/platform/PlatformProvider.test.tsx`
- Test: `src/renderer/src/screens/PlatformLocalization.test.tsx`

- [ ] **Step 1: 先写失败测试，覆盖初始化阶段进度显示与失败阶段停留**

```tsx
it("shows the four-step init progress and advances to model loading", async () => {
  Object.defineProperty(window, "hermesAPI", {
    configurable: true,
    value: {
      loginTenant: vi.fn().mockResolvedValue(undefined),
      initializeWorkspace: vi.fn(
        () => new Promise(() => undefined),
      ),
      getWorkspaceInitStatus: vi
        .fn()
        .mockResolvedValueOnce({
          phase: "login-complete",
          failedPhase: null,
          lastError: null,
        })
        .mockResolvedValueOnce({
          phase: "models",
          failedPhase: null,
          lastError: null,
        }),
    },
  });

  render(
    <I18nProvider>
      <PlatformProvider>
        <DesktopRoot />
      </PlatformProvider>
    </I18nProvider>,
  );

  fireEvent.change(screen.getByLabelText("Tenant"), {
    target: { value: "acme" },
  });
  fireEvent.change(screen.getByLabelText("Username"), {
    target: { value: "alice" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

  expect(await screen.findByText("Login complete")).toBeInTheDocument();
  expect(await screen.findByText("Model configuration")).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx`
Expected: FAIL，提示缺少 `getWorkspaceInitStatus` 轮询或初始化进度 UI

- [ ] **Step 3: 在平台上下文里新增初始化状态字段**

```ts
// src/renderer/src/platform/PlatformProvider.tsx
import type { WorkspaceInitStatus } from "../../../shared/platform/init";

interface PlatformContextValue {
  stage: PlatformStage;
  workspace: WorkspaceBootstrap | null;
  audit: AuditStatus | null;
  initError: string | null;
  initStatus: WorkspaceInitStatus;
  login: (payload: LoginPayload) => Promise<void>;
  retryInitialization: () => Promise<void>;
  logout: () => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
}

const [initStatus, setInitStatus] = useState<WorkspaceInitStatus>({
  phase: "idle",
  failedPhase: null,
  lastError: null,
});
```

- [ ] **Step 4: 在 `initializing` 阶段轮询主进程初始化状态**

```ts
useEffect(() => {
  if (
    stage !== "initializing" ||
    typeof window.hermesAPI.getWorkspaceInitStatus !== "function"
  ) {
    return;
  }

  let active = true;
  const syncInitStatus = async (): Promise<void> => {
    const next = await window.hermesAPI.getWorkspaceInitStatus();
    if (!active) return;
    setInitStatus(next);
  };

  void syncInitStatus();
  const timer = window.setInterval(() => {
    void syncInitStatus();
  }, 300);

  return () => {
    active = false;
    window.clearInterval(timer);
  };
}, [stage]);
```

- [ ] **Step 5: 在初始化页渲染 4 段式进度**

```tsx
const steps = [
  { key: "login-complete", label: t("platform.initStepLoginComplete") },
  { key: "bootstrap", label: t("platform.initStepBootstrap") },
  { key: "models", label: t("platform.initStepModels") },
  { key: "skills", label: t("platform.initStepSkills") },
] as const;

function getStepState(
  step: (typeof steps)[number]["key"],
  status: WorkspaceInitStatus,
): "pending" | "active" | "completed" | "failed" {
  const order = ["login-complete", "bootstrap", "models", "skills"] as const;
  const current = status.failedPhase ?? status.phase;
  const currentIndex = order.indexOf(current as (typeof order)[number]);
  const stepIndex = order.indexOf(step);

  if (status.phase === "failed" && status.failedPhase === step) return "failed";
  if (stepIndex < currentIndex) return "completed";
  if (stepIndex === currentIndex && status.phase !== "completed") return "active";
  if (status.phase === "completed") return "completed";
  return "pending";
}
```

- [ ] **Step 6: 补平台文案**

```ts
// src/shared/i18n/locales/en/platform.ts
initStepLoginComplete: "Login complete",
initStepBootstrap: "Platform context",
initStepModels: "Model configuration",
initStepSkills: "Skill catalog",
initStepPending: "Pending",
initStepActive: "In progress",
initStepCompleted: "Completed",
initStepFailed: "Failed",
```

```ts
// src/shared/i18n/locales/zh-CN/platform.ts
initStepLoginComplete: "登录完成",
initStepBootstrap: "平台上下文",
initStepModels: "模型配置",
initStepSkills: "Skill 清单",
initStepPending: "未开始",
initStepActive: "进行中",
initStepCompleted: "已完成",
initStepFailed: "失败",
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx`
Expected: PASS，初始化 4 段式进度和双语用例通过

- [ ] **Step 8: 提交这一小步**

```bash
git add src/renderer/src/platform/PlatformProvider.tsx src/renderer/src/screens/Initializing/Initializing.tsx src/shared/i18n/locales/en/platform.ts src/shared/i18n/locales/zh-CN/platform.ts src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx
git commit -m "feat: show platform init progress"
```

### Task 4: 设置页展示三层审计状态

**Files:**
- Modify: `src/renderer/src/screens/Settings/Settings.tsx`
- Modify: `src/shared/i18n/locales/en/settings.ts`
- Modify: `src/shared/i18n/locales/zh-CN/settings.ts`
- Test: `src/renderer/src/screens/Settings/Settings.localization.test.tsx`

- [ ] **Step 1: 先写失败测试，覆盖总状态 / 本地缓冲状态 / 平台审计服务状态**

```tsx
it("shows overall, local, and remote audit statuses in Chinese", () => {
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
            health: "buffering",
            localHealth: "buffering",
            remoteHealth: "degraded",
            queuedEvents: 3,
            droppedEvents: 1,
            lastError: "审计服务不可用",
          },
          initError: null,
          initStatus: {
            phase: "completed",
            failedPhase: null,
            lastError: null,
          },
          login: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
        }}
      >
        <Settings />
      </PlatformContext.Provider>
    </I18nProvider>,
  );

  expect(screen.getByText("本地缓冲状态")).toBeInTheDocument();
  expect(screen.getByText("缓冲中")).toBeInTheDocument();
  expect(screen.getByText("平台审计服务状态")).toBeInTheDocument();
  expect(screen.getByText("不可达")).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认红灯**

Run: `npm run test -- src/renderer/src/screens/Settings/Settings.localization.test.tsx`
Expected: FAIL，提示缺少本地/远端审计状态字段或文案

- [ ] **Step 3: 补设置页文案**

```ts
// src/shared/i18n/locales/en/settings.ts
status: {
  // ...
  auditLocal: "Local buffering status",
  auditRemote: "Platform audit service status",
  remoteDegraded: "Unavailable",
}
```

```ts
// src/shared/i18n/locales/zh-CN/settings.ts
status: {
  // ...
  auditLocal: "本地缓冲状态",
  auditRemote: "平台审计服务状态",
  remoteDegraded: "不可达",
}
```

- [ ] **Step 4: 在设置页拆分展示三层状态**

```tsx
function getAuditLabel(
  health: AuditHealth | undefined,
  t: (key: string) => string,
  options: { degradedKey?: string } = {},
): string {
  if (health === "buffering") return t("settings.status.buffering");
  if (health === "reauth-required") return t("settings.status.reauthRequired");
  if (health === "degraded") {
    return options.degradedKey
      ? t(options.degradedKey)
      : t("settings.status.degraded");
  }
  return t("settings.status.healthy");
}

const auditLabel = getAuditLabel(audit?.health, t);
const auditLocalLabel = getAuditLabel(audit?.localHealth, t);
const auditRemoteLabel = getAuditLabel(audit?.remoteHealth, t, {
  degradedKey: "settings.status.remoteDegraded",
});
```

```tsx
<div className="settings-detail-item">
  <div className="settings-detail-label">{t("settings.status.audit")}</div>
  <div className="settings-detail-value">{auditLabel}</div>
</div>
<div className="settings-detail-item">
  <div className="settings-detail-label">{t("settings.status.auditLocal")}</div>
  <div className="settings-detail-value">{auditLocalLabel}</div>
</div>
<div className="settings-detail-item">
  <div className="settings-detail-label">{t("settings.status.auditRemote")}</div>
  <div className="settings-detail-value">{auditRemoteLabel}</div>
</div>
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -- src/renderer/src/screens/Settings/Settings.localization.test.tsx`
Expected: PASS，设置页能展示三层审计状态

- [ ] **Step 6: 提交这一小步**

```bash
git add src/renderer/src/screens/Settings/Settings.tsx src/shared/i18n/locales/en/settings.ts src/shared/i18n/locales/zh-CN/settings.ts src/renderer/src/screens/Settings/Settings.localization.test.tsx
git commit -m "feat: detail platform audit status in settings"
```

### Task 5: 收口验证

**Files:**
- No additional files required

- [ ] **Step 1: 跑平台运行时与生命周期测试**

Run: `npm run test -- tests/platform-runtime.test.ts tests/platform-lifecycle-audit.test.ts`
Expected: PASS

- [ ] **Step 2: 跑 IPC / preload 测试**

Run: `npm run test -- tests/preload-api-surface.test.ts tests/ipc-handlers.test.ts`
Expected: PASS

- [ ] **Step 3: 跑渲染层平台相关测试**

Run: `npm run test -- src/renderer/src/platform/PlatformProvider.test.tsx src/renderer/src/screens/PlatformLocalization.test.tsx src/renderer/src/screens/Settings/Settings.localization.test.tsx`
Expected: PASS

- [ ] **Step 4: 跑类型检查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 5: 提交并推送**

```bash
git add .
git commit -m "feat: add platform init progress and audit breakdown"
git push origin platform-phase2-desktop-closure
```
