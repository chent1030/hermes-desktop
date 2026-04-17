import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearWorkspaceSession,
  getWorkspaceRuntime,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
} from "../src/main/platform/runtime";

describe("platform runtime", () => {
  beforeEach(() => {
    clearWorkspaceSession();
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
});
