import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("runtime data consumers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../src/main/installer");
    vi.resetModules();
  });

  it("stores models and session data under hermes-home on Windows", async () => {
    const hermesHome =
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home";

    vi.doMock("../src/main/installer", () => ({
      HERMES_HOME: hermesHome,
    }));

    const modelsModule = await import("../src/main/models");
    const sessionsModule = await import("../src/main/sessions");
    const sessionCacheModule = await import("../src/main/session-cache");

    expect(typeof modelsModule.getModelsFilePath).toBe("function");
    expect(typeof sessionsModule.getSessionsDbPath).toBe("function");
    expect(typeof sessionCacheModule.getSessionCachePaths).toBe("function");

    expect(modelsModule.getModelsFilePath()).toBe(`${hermesHome}/models.json`);
    expect(sessionsModule.getSessionsDbPath()).toBe(`${hermesHome}/state.db`);
    expect(sessionCacheModule.getSessionCachePaths()).toEqual({
      cacheDir: `${hermesHome}/desktop`,
      cacheFile: `${hermesHome}/desktop/sessions.json`,
      dbPath: `${hermesHome}/state.db`,
    });

    expect(modelsModule.getModelsFilePath()).not.toContain("hermes-agent");
    expect(sessionsModule.getSessionsDbPath()).not.toContain("hermes-agent");
  });
});
