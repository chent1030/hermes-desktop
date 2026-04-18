import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import { I18nProvider } from "../components/I18nProvider";

vi.mock("../screens/Layout/Layout", () => ({
  default: () => <div>Workspace ready</div>,
}));

import DesktopRoot from "./DesktopRoot";
import { PlatformProvider } from "./PlatformProvider";

describe("PlatformProvider", () => {
  beforeEach(() => {
    setSharedLocale("en");
  });

  afterEach(() => {
    setSharedLocale("en");
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
      expect(screen.getByText("Workspace ready")).toBeInTheDocument();
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
      expect(screen.getByText("租户")).toBeInTheDocument();
    });
  });

  it("blocks entering workspace when the platform returns no authorized models", async () => {
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
      expect(screen.getByText("Failed at: Model configuration")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "No authorized default model is ready. Ask your tenant or platform administrator to configure an available default model.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/platform models unavailable/i)).toBeInTheDocument();
    expect(screen.getByText("Initializing workspace")).toBeInTheDocument();
    expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
  });

  it("blocks entering workspace when the platform does not provide a default model", async () => {
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
      expect(screen.getByText("Failed at: Model configuration")).toBeInTheDocument();
    });

    expect(
      screen.getByText(
        "No authorized default model is ready. Ask your tenant or platform administrator to configure an available default model.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/platform default model missing/i)).toBeInTheDocument();
    expect(screen.getByText("Initializing workspace")).toBeInTheDocument();
    expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
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
      expect(screen.getByText("Workspace ready")).toBeInTheDocument();
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
    expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
  });
});
