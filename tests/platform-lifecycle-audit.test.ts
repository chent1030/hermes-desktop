import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock("../src/main/platform/runtime", () => ({
  clearWorkspaceSession: vi.fn(),
  flushWorkspaceAuditEvents: vi.fn().mockResolvedValue({
    health: "healthy",
    queuedEvents: 0,
    droppedEvents: 0,
    lastError: null,
  }),
  getWorkspaceAuditStatus: vi.fn().mockResolvedValue({
    health: "healthy",
    queuedEvents: 0,
    droppedEvents: 0,
    lastError: null,
  }),
  initializeWorkspaceState: vi.fn(),
  loginWithPassword: vi.fn(),
  refreshWorkspaceSession: vi.fn(),
  selectWorkspaceModel: vi.fn(),
}));

vi.mock("../src/main/platform/audit", () => ({
  enqueueAuditEvent: vi.fn(),
  getAuditStatus: vi.fn(),
  markAuditFailure: vi.fn(),
  markAuditReauthRequired: vi.fn(),
}));

vi.mock("../src/main/skills", () => ({
  findDownloadedSkillPackage: vi.fn(),
  listInstalledSkills: vi.fn().mockReturnValue([]),
}));

import {
  platformGetAuditStatus,
  platformInitializeWorkspace,
  platformLogin,
  platformRefreshSession,
  platformSelectModel,
} from "../src/main/platform/index";
import {
  enqueueAuditEvent,
  markAuditFailure,
  markAuditReauthRequired,
} from "../src/main/platform/audit";
import {
  getWorkspaceAuditStatus,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
} from "../src/main/platform/runtime";

describe("platform lifecycle audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records a login failure audit event", async () => {
    vi.mocked(loginWithPassword).mockRejectedValueOnce(new Error("invalid credentials"));

    await expect(
      platformLogin({
        tenantCode: "acme",
        username: "alice",
        password: "bad-secret",
      }),
    ).rejects.toThrow("invalid credentials");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "auth.login.failed",
        payload: expect.objectContaining({
          tenantCode: "acme",
          username: "alice",
          error: "invalid credentials",
        }),
      }),
    );
    expect(markAuditFailure).toHaveBeenCalledWith("invalid credentials");
  });

  it("records an initialization failure audit event", async () => {
    vi.mocked(initializeWorkspaceState).mockRejectedValueOnce(
      new Error("platform default model missing"),
    );

    await expect(platformInitializeWorkspace()).rejects.toThrow(
      "platform default model missing",
    );

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "workspace.initialize.failed",
        payload: expect.objectContaining({
          error: "platform default model missing",
        }),
      }),
    );
    expect(markAuditFailure).toHaveBeenCalledWith("platform default model missing");
  });

  it("records a refresh failure and marks re-auth required", async () => {
    vi.mocked(refreshWorkspaceSession).mockRejectedValueOnce(
      new Error("refresh token expired"),
    );

    await expect(platformRefreshSession()).rejects.toThrow("refresh token expired");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "auth.refresh.failed",
        payload: expect.objectContaining({
          error: "refresh token expired",
        }),
      }),
    );
    expect(markAuditReauthRequired).toHaveBeenCalledWith("refresh token expired");
  });

  it("records a model selection failure audit event", async () => {
    const error = new Error("unauthorized model");
    const { selectWorkspaceModel } = await import("../src/main/platform/runtime");
    vi.mocked(selectWorkspaceModel).mockImplementationOnce(() => {
      throw error;
    });

    await expect(platformSelectModel("m-unauthorized")).rejects.toThrow(
      "unauthorized model",
    );

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "model.select.failed",
        payload: expect.objectContaining({
          modelId: "m-unauthorized",
          error: "unauthorized model",
        }),
      }),
    );
    expect(markAuditFailure).toHaveBeenCalledWith("unauthorized model");
  });

  it("returns the merged workspace audit status from runtime", async () => {
    vi.mocked(getWorkspaceAuditStatus).mockResolvedValueOnce({
      health: "degraded",
      queuedEvents: 0,
      droppedEvents: 0,
      lastError: "audit service unavailable",
    });

    await expect(platformGetAuditStatus()).resolves.toMatchObject({
      health: "degraded",
      lastError: "audit service unavailable",
    });
  });
});
