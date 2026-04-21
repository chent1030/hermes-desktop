import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../components/I18nProvider";
import { PlatformContext } from "../../platform/PlatformProvider";
import WorkspaceBanner from "./WorkspaceBanner";

describe("WorkspaceBanner", () => {
  it("shows warning details and retry action for buffered or degraded audit delivery", () => {
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
            workspace: null,
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryAuditFlush: window.hermesAPI.retryAuditFlush,
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <WorkspaceBanner
            audit={{
              health: "degraded",
              localHealth: "healthy",
              remoteHealth: "degraded",
              queuedEvents: 42,
              droppedEvents: 3,
              lastError: "503 service unavailable",
            }}
          />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("审计告警")).toBeInTheDocument();
    expect(screen.getByText("待补传：42")).toBeInTheDocument();
    expect(screen.getByText("已丢弃：3")).toBeInTheDocument();
    expect(screen.getByText("503 service unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重试审计上传" }));
    expect(window.hermesAPI.retryAuditFlush).toHaveBeenCalled();
  });

  it("shows a blocking error banner when re-auth is required", () => {
    render(
      <I18nProvider>
        <PlatformContext.Provider
          value={{
            stage: "workspace",
            workspace: null,
            audit: null,
            initError: null,
            login: vi.fn(),
            refreshSession: vi.fn(),
            retryAuditFlush: vi.fn(),
            retryInitialization: vi.fn(),
            logout: vi.fn(),
            setSelectedModel: vi.fn(),
          }}
        >
          <WorkspaceBanner
            audit={{
              health: "reauth-required",
              localHealth: "reauth-required",
              remoteHealth: "reauth-required",
              queuedEvents: 4,
              droppedEvents: 0,
              lastError: "refresh token expired",
            }}
          />
        </PlatformContext.Provider>
      </I18nProvider>,
    );

    expect(screen.getByText("审计阻断")).toBeInTheDocument();
    expect(screen.getByText("会话已过期，请重新登录。")).toBeInTheDocument();
    expect(screen.getByText("refresh token expired")).toBeInTheDocument();
  });
});
