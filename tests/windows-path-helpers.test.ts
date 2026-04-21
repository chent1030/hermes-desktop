import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("windows path helpers", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("electron");
    vi.doUnmock("../src/main/utils");
    vi.resetModules();
  });

  it("uses the OS downloads directory when searching for downloaded skill packages", async () => {
    vi.doMock("electron", () => ({
      app: {
        getPath: (name: string) => {
          if (name === "downloads") {
            return "C:/Users/test/Downloads";
          }
          throw new Error(`unexpected path request: ${name}`);
        },
      },
    }));
    vi.doMock("../src/main/utils", async () => {
      const actual = await vi.importActual<typeof import("../src/main/utils")>(
        "../src/main/utils",
      );
      return {
        ...actual,
        profileHome: () =>
          "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home",
      };
    });

    const skillsModule = await import("../src/main/skills");

    expect(typeof skillsModule.getSkillDownloadSearchDirs).toBe("function");
    expect(skillsModule.getSkillDownloadSearchDirs()).toEqual([
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/downloads",
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/downloads/skills",
      "C:/Users/test/Downloads",
    ]);
  });

  it("builds memory and user profile paths from the profile home", async () => {
    vi.doMock("../src/main/utils", () => ({
      profileHome: (profile?: string) =>
        profile === "team-a"
          ? "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/profiles/team-a"
          : "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home",
      safeWriteFile: vi.fn(),
    }));

    const memoryModule = await import("../src/main/memory");

    expect(typeof memoryModule.getMemoryPaths).toBe("function");
    expect(memoryModule.getMemoryPaths("team-a")).toEqual({
      memoryFile: "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/profiles/team-a/MEMORY.md",
      userFile: "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/profiles/team-a/USER.md",
      dbPath: "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home/profiles/team-a/state.db",
    });
  });
});
