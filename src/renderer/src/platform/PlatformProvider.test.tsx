import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../components/I18nProvider";

vi.mock("../screens/Layout/Layout", () => ({
  default: () => <div>Workspace ready</div>,
}));

import DesktopRoot from "./DesktopRoot";
import { PlatformProvider } from "./PlatformProvider";

describe("PlatformProvider", () => {
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
      expect(screen.getByText("platform models unavailable")).toBeInTheDocument();
    });

    expect(screen.getByText("Initializing workspace")).toBeInTheDocument();
    expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
  });
});
