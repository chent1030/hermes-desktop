import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("windows installer flow", () => {
  let sandboxRoot = "";

  beforeEach(() => {
    sandboxRoot = mkdtempSync(join(tmpdir(), "hermes-win-install-"));
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("../src/main/config");
    vi.doUnmock("../src/main/runtime/paths");
    vi.doUnmock("../src/main/runtime/bootstrap");
    vi.doUnmock("../src/main/runtime/process-runner");
    vi.doUnmock("../src/main/utils");
    vi.doUnmock("child_process");
    vi.resetModules();
    rmSync(sandboxRoot, { recursive: true, force: true });
  });

  it("builds a bundled runtime install plan for Windows instead of using install.sh", async () => {
    const installer = await import("../src/main/installer");

    expect(typeof installer.buildInstallPlan).toBe("function");

    const plan = installer.buildInstallPlan({ platform: "win32" });

    expect(plan.mode).toBe("bundled-runtime");
    expect(JSON.stringify(plan)).not.toContain("install.sh");
  });

  it("bootstraps the bundled runtime on Windows without spawning the shell installer", async () => {
    const packagedRuntimeRoot = join(sandboxRoot, "packaged-runtime");
    const userRuntimeRoot = join(sandboxRoot, "user-runtime");
    const pythonExecutable = join(userRuntimeRoot, "python", "python.exe");
    const hermesScript = join(userRuntimeRoot, "hermes", "hermes");
    const spawn = vi.fn();
    const ensureRuntimeBootstrap = vi.fn(() => {
      mkdirSync(join(userRuntimeRoot, "python"), { recursive: true });
      mkdirSync(join(userRuntimeRoot, "hermes"), { recursive: true });
      writeFileSync(pythonExecutable, "");
      writeFileSync(hermesScript, "");
    });

    vi.doMock("../src/main/config", () => ({
      getModelConfig: () => ({
        provider: "openai",
        model: "gpt-5.4",
        baseUrl: "",
      }),
    }));
    vi.doMock("../src/main/runtime/paths", () => ({
      resolveRuntimePaths: () => ({
        platform: "win32",
        packagedRuntimeRoot,
        userRuntimeRoot,
        hermesHome: join(userRuntimeRoot, "hermes-home"),
        logsDir: join(userRuntimeRoot, "logs"),
        tempDir: join(userRuntimeRoot, "temp"),
        pythonExecutable,
        hermesScript,
        hermesConfigFile: join(userRuntimeRoot, "hermes-home", "config.yaml"),
        hermesEnvFile: join(userRuntimeRoot, "hermes-home", ".env"),
      }),
    }));
    vi.doMock("../src/main/runtime/bootstrap", () => ({
      ensureRuntimeBootstrap,
    }));
    vi.doMock("../src/main/runtime/process-runner", () => ({
      createProcessRunner: () => ({ spawn: vi.fn() }),
    }));
    vi.doMock("../src/main/utils", () => ({
      stripAnsi: (value: string) => value,
    }));
    vi.doMock("child_process", () => ({
      default: {
        spawn,
        execFile: vi.fn(),
        execSync: vi.fn(),
      },
      spawn,
      execFile: vi.fn(),
      execSync: vi.fn(),
    }));

    const installer = await import("../src/main/installer");
    const progress: string[] = [];

    await expect(
      installer.runInstall((event) => {
        progress.push(event.title);
      }),
    ).resolves.toBeUndefined();

    expect(ensureRuntimeBootstrap).toHaveBeenCalledWith({
      packagedRuntimeRoot,
      userRuntimeRoot,
    });
    expect(spawn).not.toHaveBeenCalled();
    expect(progress.some((title) => title.includes("runtime"))).toBe(true);
  });
});
