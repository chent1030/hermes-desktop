import { beforeEach, describe, expect, it, vi } from "vitest";

const { openExternal } = vi.hoisted(() => ({
  openExternal: vi.fn(),
}));

vi.mock("electron", () => ({
  shell: {
    openExternal,
  },
}));

vi.mock("../src/main/platform/audit", () => ({
  enqueueAuditEvent: vi.fn(),
  markAuditFailure: vi.fn(),
  markAuditReauthRequired: vi.fn(),
}));

vi.mock("../src/main/platform/runtime", async () => {
  const actual = await vi.importActual<typeof import("../src/main/platform/runtime")>(
    "../src/main/platform/runtime",
  );

  return {
    ...actual,
    flushWorkspaceAuditEvents: vi.fn().mockResolvedValue({
      health: "healthy",
      localHealth: "healthy",
      remoteHealth: "healthy",
      queuedEvents: 0,
      droppedEvents: 0,
      lastError: null,
    }),
  };
});

import { platformDownloadSkillPackage } from "../src/main/platform/index";
import { enqueueAuditEvent, markAuditFailure } from "../src/main/platform/audit";
import {
  clearSessionState,
  setSessionTokens,
  setWorkspaceBootstrap,
} from "../src/main/platform/session";

describe("platform skill download audit", () => {
  beforeEach(() => {
    clearSessionState();
    vi.clearAllMocks();

    setSessionTokens("access-token", "refresh-token");
    setWorkspaceBootstrap({
      tenant: { id: "t1", code: "acme", name: "Acme" },
      user: { id: "u1", username: "alice", displayName: "Alice" },
      locale: "zh-CN",
      features: { gatewayVisible: false },
      models: [],
      selectedModelId: "",
      skills: [
        {
          id: "skill-download",
          scope: "global",
          name: "Code Review",
          version: "1.0.0",
          description: "Review code",
          downloadUrl: "https://example.com/review.zip",
        },
      ],
    });
  });

  it("records run skill download click events", async () => {
    openExternal.mockResolvedValueOnce("ok");

    await expect(platformDownloadSkillPackage("skill-download")).resolves.toBe(true);

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.skill.download.clicked",
        payload: { skillId: "skill-download" },
      }),
    );
  });

  it("records run skill download failure events", async () => {
    await expect(platformDownloadSkillPackage("missing-skill")).rejects.toThrow(
      "skill not found",
    );

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.skill.download.failed",
        payload: {
          skillId: "missing-skill",
          error: "skill not found",
        },
      }),
    );
    expect(markAuditFailure).toHaveBeenCalledWith("skill not found");
  });
});
