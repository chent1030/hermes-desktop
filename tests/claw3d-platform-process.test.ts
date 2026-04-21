import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const execFileSync = vi.fn();

vi.mock("child_process", () => ({
  default: {
    spawn: vi.fn(),
    execSync: vi.fn(),
    execFileSync,
  },
  spawn: vi.fn(),
  execSync: vi.fn(),
  execFileSync,
  ChildProcess: class {},
}));

describe("claw3d process termination", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses taskkill on Windows to stop the full process tree", async () => {
    const processKill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const claw3d = await import("../src/main/claw3d");

    expect(typeof claw3d.stopProcessByPid).toBe("function");

    claw3d.stopProcessByPid(4321, { platform: "win32" });

    expect(execFileSync).toHaveBeenCalledWith(
      "taskkill",
      ["/pid", "4321", "/t", "/f"],
      { stdio: "ignore" },
    );
    expect(processKill).not.toHaveBeenCalled();
  });

  it("uses negative pid signaling on Unix platforms", async () => {
    const processKill = vi.spyOn(process, "kill").mockImplementation(() => true);
    const claw3d = await import("../src/main/claw3d");

    claw3d.stopProcessByPid(4321, { platform: "darwin" });

    expect(processKill).toHaveBeenCalledWith(-4321, "SIGTERM");
    expect(execFileSync).not.toHaveBeenCalled();
  });
});
