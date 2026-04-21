import { Profiler, type ProfilerOnRenderCallback } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale as setSharedLocale } from "../../../../shared/i18n";
import { I18nProvider } from "../../components/I18nProvider";
import Login from "./Login";
import { PlatformContext } from "../../platform/PlatformProvider";

describe("Login", () => {
  beforeEach(() => {
    setSharedLocale("en");
  });

  afterEach(() => {
    setSharedLocale("en");
    vi.restoreAllMocks();
  });

  it("renders the cyber enterprise login shell copy", () => {
    renderLogin();

    expect(screen.getByText("Hermes Desktop")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Enter the tenant console",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Use your tenant account to enter the controlled workspace and continue in the desktop client.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Login portal")).toBeInTheDocument();
  });

  it("shows login errors inside the access panel", async () => {
    renderLogin({
      login: vi.fn().mockRejectedValue(new Error("Access denied by policy")),
    });

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
      expect(screen.getByText("Access denied by policy")).toBeInTheDocument();
    });
  });

  it("does not re-render the whole login screen while typing credentials", () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    renderLogin(undefined, onRender);

    fireEvent.change(screen.getByLabelText("Tenant"), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });

    expect(onRender).toHaveBeenCalledTimes(1);
  });
});

function renderLogin(
  overrides?: Partial<React.ContextType<typeof PlatformContext>>,
  onRender?: ProfilerOnRenderCallback,
) {
  return render(
    <I18nProvider>
      <PlatformContext.Provider
        value={{
          stage: "login",
          workspace: null,
          audit: null,
          initError: null,
          login: vi.fn().mockResolvedValue(undefined),
          refreshSession: vi.fn(),
          retryInitialization: vi.fn(),
          logout: vi.fn(),
          setSelectedModel: vi.fn(),
          ...overrides,
        }}
      >
        <Profiler id="login" onRender={onRender ?? vi.fn()}>
          <Login />
        </Profiler>
      </PlatformContext.Provider>
    </I18nProvider>,
  );
}
