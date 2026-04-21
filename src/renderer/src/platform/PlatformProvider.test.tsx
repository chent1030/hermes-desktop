import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "../components/I18nProvider";
import { usePlatform } from "./usePlatform";

vi.mock("../screens/Layout/Layout", () => ({
  default: () => <button>聊天</button>,
}));

import DesktopRoot from "./DesktopRoot";
import { PlatformProvider } from "./PlatformProvider";

function RefreshSessionProbe(): React.JSX.Element {
  const { refreshSession } = usePlatform();

  return (
    <button onClick={() => void refreshSession()}>
      Manual refresh
    </button>
  );
}

function RetryAuditProbe(): React.JSX.Element {
  const { retryAuditFlush, sessionRecoveryReason, stage } = usePlatform();

  return (
    <div>
      <button onClick={() => void retryAuditFlush?.()}>
        Retry audit
      </button>
      <div>{stage}</div>
      <div>{sessionRecoveryReason}</div>
    </div>
  );
}

describe("PlatformProvider", () => {
  beforeEach(() => {
    setSharedLocale("en");
  });

  afterEach(() => {
    setSharedLocale("en");
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("starts on login, initializes online, then enters workspace", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });
  });

  it("syncs the renderer locale from the initialized workspace", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });
  });

  it("still enters workspace when the platform returns no authorized models", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
          tenant: { id: "t1", code: "acme", name: "Acme" },
          user: { id: "u1", username: "alice", displayName: "Alice" },
          locale: "zh-CN",
          features: { gatewayVisible: false },
          models: [],
          selectedModelId: "",
          skills: [],
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });
  });

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

  it("still enters workspace when the platform does not provide a default model", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
              isDefault: false,
            },
          ],
          selectedModelId: "m1",
          skills: [],
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });
  });

  it("shows a staged bootstrap hint when platform bootstrap loading fails", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi
          .fn()
          .mockRejectedValue(new Error("workspace bootstrap disabled")),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByText("Failed at: Platform context")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "Platform bootstrap data could not be loaded. Check connectivity and tenant authorization, then retry.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/workspace bootstrap disabled/i)).toBeInTheDocument();
  });

  it("shows four-step init progress and reflects the current init phase", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn(() => new Promise(() => undefined)),
        getWorkspaceInitStatus: vi.fn().mockResolvedValue({
          phase: "models",
          failedPhase: null,
          lastError: null,
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
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
    expect(screen.getByText("Platform context")).toBeInTheDocument();
    expect(screen.getByText("Model configuration")).toBeInTheDocument();
    expect(screen.getByText("Skill catalog")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("In progress")).toBeInTheDocument();
    });
  });

  it("returns to the tenant login path after the desktop app remounts", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
        }),
        logoutTenant: vi.fn().mockResolvedValue(undefined),
        selectWorkspaceModel: vi.fn(),
      },
    });

    const view = render(
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });

    view.unmount();

    render(
      <I18nProvider>
        <PlatformProvider>
          <DesktopRoot />
        </PlatformProvider>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("租户")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "聊天" })).not.toBeInTheDocument();
  });

  it("shows a session recovery screen while refresh logout is in progress", async () => {
    let refreshInterval: (() => void) | null = null;
    const intervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation(
        (
          handler: Parameters<typeof window.setInterval>[0],
          timeout?: Parameters<typeof window.setInterval>[1],
        ) => {
        if (timeout === 5 * 60 * 1000 && typeof handler === "function") {
          refreshInterval = handler as () => void;
        }
          return 1 as unknown as ReturnType<typeof window.setInterval>;
        },
      );

    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
        }),
        getAuditStatus: vi.fn().mockResolvedValue({
          health: "healthy",
          localHealth: "healthy",
          remoteHealth: "healthy",
          queuedEvents: 0,
          droppedEvents: 0,
          lastError: null,
        }),
        refreshTenantSession: vi.fn().mockRejectedValue(new Error("refresh token expired")),
        logoutTenant: vi.fn(() => new Promise(() => undefined)),
        selectWorkspaceModel: vi.fn(),
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

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "聊天" })).toBeInTheDocument();
    });

    expect(refreshInterval).not.toBeNull();

    await act(async () => {
      refreshInterval?.();
      await Promise.resolve();
    });

    expect(await screen.findByText("正在恢复会话")).toBeInTheDocument();
    expect(screen.getByText("即将返回登录页...")).toBeInTheDocument();
    expect(screen.getByText(/refresh token expired/i)).toBeInTheDocument();

    intervalSpy.mockRestore();
  });

  it("shows a session recovery screen when audit status requires reauth", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        loginTenant: vi.fn().mockResolvedValue(undefined),
        initializeWorkspace: vi.fn().mockResolvedValue({
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
        }),
        getAuditStatus: vi.fn().mockResolvedValue({
          health: "reauth-required",
          localHealth: "reauth-required",
          remoteHealth: "reauth-required",
          queuedEvents: 0,
          droppedEvents: 0,
          lastError: "session expired",
        }),
        refreshTenantSession: vi.fn().mockResolvedValue(undefined),
        logoutTenant: vi.fn(() => new Promise(() => undefined)),
        selectWorkspaceModel: vi.fn(),
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

    expect(await screen.findByText("正在恢复会话")).toBeInTheDocument();
    expect(screen.getByText(/session expired/i)).toBeInTheDocument();
  });

  it("starts session recovery immediately when a manual audit retry requires reauth", async () => {
    Object.defineProperty(window, "hermesAPI", {
      configurable: true,
      value: {
        retryAuditFlush: vi.fn().mockResolvedValue({
          health: "reauth-required",
          localHealth: "reauth-required",
          remoteHealth: "reauth-required",
          queuedEvents: 3,
          droppedEvents: 0,
          lastError: "invalid or expired refresh token",
        }),
        logoutTenant: vi.fn(() => new Promise(() => undefined)),
      },
    });

    render(
      <I18nProvider>
        <PlatformProvider>
          <RetryAuditProbe />
        </PlatformProvider>
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry audit" }));

    expect(await screen.findByText("session-recovery")).toBeInTheDocument();
    expect(screen.getByText(/invalid or expired refresh token/i)).toBeInTheDocument();
  });
});
