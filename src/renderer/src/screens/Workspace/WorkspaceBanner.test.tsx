import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../components/I18nProvider";
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
      </I18nProvider>,
    );

    expect(screen.getByText("Audit warning")).toBeInTheDocument();
    expect(screen.getByText("Queued: 42")).toBeInTheDocument();
    expect(screen.getByText("Dropped: 3")).toBeInTheDocument();
    expect(screen.getByText("503 service unavailable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry audit upload" }));
    expect(window.hermesAPI.retryAuditFlush).toHaveBeenCalled();
  });

  it("shows a blocking error banner when re-auth is required", () => {
    render(
      <I18nProvider>
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
      </I18nProvider>,
    );

    expect(screen.getByText("Audit blocked")).toBeInTheDocument();
    expect(screen.getByText("Session expired. Please sign in again.")).toBeInTheDocument();
    expect(screen.getByText("refresh token expired")).toBeInTheDocument();
  });
});
