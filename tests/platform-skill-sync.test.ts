import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
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

vi.mock("../src/main/skills", () => ({
  listInstalledSkills: vi.fn(),
  findDownloadedSkillPackage: vi.fn(),
}));

import { platformSyncSkillInstallations } from "../src/main/platform/index";
import { enqueueAuditEvent } from "../src/main/platform/audit";
import {
  clearSessionState,
  setSessionTokens,
  setWorkspaceBootstrap,
} from "../src/main/platform/session";
import {
  findDownloadedSkillPackage,
  listInstalledSkills,
} from "../src/main/skills";

describe("platform skill sync", () => {
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
          id: "skill-installed",
          scope: "global",
          name: "Code Review",
          version: "1.0.0",
          description: "Review code",
          downloadUrl: "https://example.com/review.zip",
        },
        {
          id: "skill-outdated",
          scope: "tenant",
          name: "Acme CRM",
          version: "2.0.0",
          description: "CRM sync",
          downloadUrl: "https://example.com/crm.zip",
        },
        {
          id: "skill-downloaded",
          scope: "global",
          name: "Knowledge Base",
          version: "3.0.0",
          description: "Knowledge",
          downloadUrl: "https://example.com/kb.zip",
        },
        {
          id: "skill-broken",
          scope: "tenant",
          name: "Broken Skill",
          version: "4.0.0",
          description: "Broken",
          downloadUrl: "https://example.com/broken.zip",
        },
      ],
    });
  });

  it("maps installed, outdated, downloaded, and broken local skill states", async () => {
    vi.mocked(listInstalledSkills).mockReturnValue([
      {
        name: "Code Review",
        category: "productivity",
        description: "Review code",
        path: "/tmp/review",
        version: "1.0.0",
        isBroken: false,
      },
      {
        name: "Acme CRM",
        category: "tenant",
        description: "CRM sync",
        path: "/tmp/crm",
        version: "1.5.0",
        isBroken: false,
      },
      {
        name: "Broken Skill",
        category: "tenant",
        description: "",
        path: "/tmp/broken",
        version: null,
        isBroken: true,
      },
    ]);
    vi.mocked(findDownloadedSkillPackage).mockImplementation((skill) => {
      if (skill.id === "skill-downloaded") {
        return {
          path: "/Users/demo/Downloads/knowledge-base-3.0.0.zip",
          version: "3.0.0",
        };
      }

      return null;
    });

    const states = await platformSyncSkillInstallations();

    expect(states).toEqual([
      {
        skillId: "skill-installed",
        installed: true,
        version: "1.0.0",
        status: "installed",
        path: "/tmp/review",
      },
      {
        skillId: "skill-outdated",
        installed: true,
        version: "1.5.0",
        status: "outdated",
        path: "/tmp/crm",
      },
      {
        skillId: "skill-downloaded",
        installed: false,
        version: "3.0.0",
        status: "downloaded",
        path: "/Users/demo/Downloads/knowledge-base-3.0.0.zip",
      },
      {
        skillId: "skill-broken",
        installed: true,
        version: null,
        status: "broken",
        path: "/tmp/broken",
      },
    ]);

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.skill.sync.completed",
        payload: {
          installedCount: 1,
          downloadedCount: 1,
          outdatedCount: 1,
          brokenCount: 1,
          notDownloadedCount: 0,
          totalCount: 4,
          scopeBreakdown: {
            global: 2,
            tenant: 2,
          },
        },
      }),
    );
  });
});
