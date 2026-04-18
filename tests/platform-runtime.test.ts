import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueAuditEvent, resetAuditState } from "../src/main/platform/audit";
import {
  clearWorkspaceSession,
  flushWorkspaceAuditEvents,
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
