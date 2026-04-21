import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("windows runtime consumers", () => {
  let sandboxRoot = "";

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), "hermes-win-runtime-"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../src/main/installer");
    vi.resetModules();
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it("lists bundled skills from the packaged hermes runtime directory", async () => {
    const skillDir = join(
      sandboxRoot,
      "hermes",
      "skills",
      "productivity",
      "code-review",
    );
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      ["---", "name: Code Review", "description: Review code", "---", ""].join(
        "\n",
      ),
    );

    vi.doMock("../src/main/installer", () => ({
      HERMES_HOME: join(sandboxRoot, "hermes-home"),
      HERMES_PYTHON: join(sandboxRoot, "python", "python.exe"),
      HERMES_SCRIPT: join(sandboxRoot, "hermes", "hermes"),
      HERMES_REPO: sandboxRoot,
      getEnhancedPath: () => "",
    }));

    const skillsModule = await import("../src/main/skills");

    expect(skillsModule.listBundledSkills()).toEqual([
      expect.objectContaining({
        name: "Code Review",
        category: "productivity",
        source: "bundled",
        installed: false,
      }),
    ]);
  });

  it("builds Windows npm lookup candidates with cmd executables", async () => {
    const claw3dModule = (await import("../src/main/claw3d")) as Record<
      string,
      unknown
    >;

    expect(typeof claw3dModule.getNpmExecutableCandidates).toBe("function");
    expect(typeof claw3dModule.getNpmLocatorCommand).toBe("function");

    const getNpmExecutableCandidates = claw3dModule.getNpmExecutableCandidates as (
      options: { platform: NodeJS.Platform; home: string },
    ) => string[];
    const getNpmLocatorCommand = claw3dModule.getNpmLocatorCommand as (
      platform: NodeJS.Platform,
    ) => string;

    const candidates = getNpmExecutableCandidates({
      platform: "win32",
      home: "C:/Users/tester",
    });

    expect(candidates).toContain("npm.cmd");
    expect(candidates.some((candidate) => candidate.endsWith("npm.cmd"))).toBe(
      true,
    );
    expect(getNpmLocatorCommand("win32")).toBe("where npm");
  });
});
