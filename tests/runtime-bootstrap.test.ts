import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ensureRuntimeBootstrap } from "../src/main/runtime/bootstrap";

describe("ensureRuntimeBootstrap", () => {
  it("copies packaged runtime files into the user runtime root on first launch", () => {
    const root = mkdtempSync(join(tmpdir(), "hermes-win-runtime-"));
    const packaged = join(root, "resources", "runtime", "windows-x64");
    const userRuntime = join(root, "user-runtime");

    mkdirSync(join(packaged, "python"), { recursive: true });
    mkdirSync(join(packaged, "hermes"), { recursive: true });
    writeFileSync(join(packaged, "python", "python.exe"), "binary");
    writeFileSync(join(packaged, "hermes", "hermes"), "entry");
    writeFileSync(
      join(packaged, "runtime-manifest.json"),
      JSON.stringify({
        entries: [{ id: "python", relativePath: "python/python.exe" }],
      }),
    );

    ensureRuntimeBootstrap({
      packagedRuntimeRoot: packaged,
      userRuntimeRoot: userRuntime,
    });

    expect(existsSync(join(userRuntime, "python", "python.exe"))).toBe(true);
    expect(existsSync(join(userRuntime, "hermes", "hermes"))).toBe(true);
  });
});
