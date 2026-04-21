import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = resolve(process.cwd(), "package.json");
const runtimeManifestPath = resolve(
  process.cwd(),
  "resources/runtime/windows-x64/runtime-manifest.json",
);

describe("windows build contract", () => {
  it("defines a native Windows packaging flow", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
      scripts: Record<string, string>;
      build?: {
        win?: { target?: string[] };
        extraResources?: Array<{ from?: string }>;
      };
    };

    expect(packageJson.scripts["prepare:win-runtime"]).toBe(
      "node scripts/prepare-windows-runtime.mjs",
    );
    expect(packageJson.scripts["build:win"]).toContain("prepare:win-runtime");
    expect(packageJson.build?.win?.target).toContain("nsis");
    expect(packageJson.build?.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "resources/runtime/windows-x64" }),
      ]),
    );

    expect(existsSync(runtimeManifestPath)).toBe(true);
    if (!existsSync(runtimeManifestPath)) {
      return;
    }

    const runtimeManifest = JSON.parse(
      readFileSync(runtimeManifestPath, "utf-8"),
    ) as {
      platform: string;
      arch: string;
      entries: Array<{ id: string; relativePath: string }>;
    };

    expect(runtimeManifest.platform).toBe("win32");
    expect(runtimeManifest.arch).toBe("x64");
    expect(runtimeManifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "python",
          relativePath: "python/python.exe",
        }),
        expect.objectContaining({
          id: "hermes-script",
          relativePath: "hermes/hermes",
        }),
      ]),
    );
  });

  it("documents native Windows build and QA steps", () => {
    const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf-8");
    const qa = readFileSync(
      resolve(process.cwd(), "docs/windows-manual-qa.md"),
      "utf-8",
    );

    expect(readme).toContain("npm run prepare:win-runtime");
    expect(readme).toContain("npm run build:win");
    expect(qa).toContain(
      "Install the NSIS package on a clean Windows x64 machine",
    );
    expect(qa).toContain(
      "Verify login, initialization, chat, skills, and audit upload",
    );
  });
});
