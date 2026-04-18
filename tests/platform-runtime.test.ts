import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueAuditEvent, resetAuditState } from "../src/main/platform/audit";
import {
  clearWorkspaceSession,
  flushWorkspaceAuditEvents,
  getWorkspaceAuditStatus,
  getWorkspaceInitStatus,
  getWorkspaceRuntime,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
} from "../src/main/platform/runtime";

describe("platform runtime", () => {
  beforeEach(() => {
    clearWorkspaceSession();
    resetAuditState();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores tokens in memory and auto-selects the default model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
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
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });
    const workspace = await initializeWorkspaceState();

    expect(workspace.selectedModelId).toBe("m-default");
    expect(getWorkspaceRuntime()?.refreshToken).toBe("r1");
  });

  it("fails initialization when the platform returns no authorized models", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(initializeWorkspaceState()).rejects.toThrow(
      "platform models unavailable",
    );
  });

  it("fails initialization when the platform does not provide a default model", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "m-manual",
                  provider: "openai",
                  model: "gpt-5.4",
                  label: "GPT-5.4",
                  baseUrl: "",
                  isDefault: false,
                },
              ],
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(initializeWorkspaceState()).rejects.toThrow(
      "platform default model missing",
    );
  });

  it("clears the in-memory session when refresh fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockRejectedValueOnce(new Error("401")),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(refreshWorkspaceSession()).rejects.toThrow("401");
    expect(getWorkspaceRuntime()).toBeNull();
  });

  it("surfaces backend message when tenant login fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "invalid credentials" }), {
          status: 401,
          statusText: "Unauthorized",
          headers: {
            "Content-Type": "application/json",
          },
        }),
      ),
    );

    await expect(
      loginWithPassword({
        tenantCode: "acme",
        username: "alice",
        password: "bad-secret",
      }),
    ).rejects.toMatchObject({
      message: "invalid credentials",
      status: 401,
    });
  });

  it("surfaces backend message when bootstrap initialization fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "workspace bootstrap disabled" }), {
            status: 503,
            statusText: "Service Unavailable",
            headers: {
              "Content-Type": "application/json",
            },
          }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(initializeWorkspaceState()).rejects.toMatchObject({
      message: "workspace bootstrap disabled",
      status: 503,
    });
  });

  it("tracks init progress through bootstrap, models, skills, and completed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
      )
      .mockImplementationOnce(async () => {
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
    expect(getWorkspaceInitStatus()).toMatchObject({
      phase: "completed",
      failedPhase: null,
      lastError: null,
    });
  });

  it("keeps the failed init phase when model loading breaks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(initializeWorkspaceState()).rejects.toThrow(
      "platform models unavailable",
    );
    expect(getWorkspaceInitStatus()).toMatchObject({
      phase: "failed",
      failedPhase: "models",
      lastError: "platform models unavailable",
    });
  });

  it("degrades audit status when the remote audit health probe fails", async () => {
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
            headers: {
              "Content-Type": "application/json",
            },
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
      queuedEvents: 0,
      lastError: "audit service unavailable",
    });
  });

  it("requires re-login when the remote audit health probe returns unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ message: "session expired" }), {
            status: 401,
            statusText: "Unauthorized",
            headers: {
              "Content-Type": "application/json",
            },
          }),
        ),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });

    await expect(getWorkspaceAuditStatus()).resolves.toMatchObject({
      health: "reauth-required",
      localHealth: "reauth-required",
      remoteHealth: "reauth-required",
      lastError: "session expired",
    });
  });

  it("preserves the initialized workspace when refresh succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
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
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a2", refreshToken: "r2" })),
        ),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });
    const workspace = await initializeWorkspaceState();

    await refreshWorkspaceSession();

    expect(getWorkspaceRuntime()).toMatchObject({
      accessToken: "a2",
      refreshToken: "r2",
      workspace,
    });
  });

  it("refreshes the session and retries audit upload after a 401 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a1", refreshToken: "r1" })),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              tenant: { id: "t1", code: "acme", name: "Acme" },
              user: { id: "u1", username: "alice", displayName: "Alice" },
              locale: "zh-CN",
              features: { gatewayVisible: false },
            }),
          ),
        )
        .mockResolvedValueOnce(
          new Response(
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
          ),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] })))
        .mockResolvedValueOnce(
          new Response("Unauthorized", {
            status: 401,
            statusText: "Unauthorized",
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: "a2", refreshToken: "r2" })),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: 1 }))),
    );

    await loginWithPassword({
      tenantCode: "acme",
      username: "alice",
      password: "secret",
    });
    await initializeWorkspaceState();
    enqueueAuditEvent({ type: "chat.started", payload: { sessionId: "s1" } });

    const status = await flushWorkspaceAuditEvents();

    expect(status.health).toBe("healthy");
    expect(status.queuedEvents).toBe(0);
    expect(getWorkspaceRuntime()).toMatchObject({
      accessToken: "a2",
      refreshToken: "r2",
    });
  });
});
