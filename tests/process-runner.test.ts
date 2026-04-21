import { describe, expect, it, vi } from "vitest";
import { createProcessRunner } from "../src/main/runtime/process-runner";

describe("process runner", () => {
  it("invokes explicit executables without shell mode", () => {
    const spawnImpl = vi.fn(() => ({
      on: vi.fn(),
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
    }));
    const runner = createProcessRunner({ spawnImpl: spawnImpl as never });

    runner.spawn({
      executable:
        "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/python/python.exe",
      args: [
        "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes/hermes",
        "--version",
      ],
      env: {
        HERMES_HOME:
          "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home",
      },
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/python/python.exe",
      expect.any(Array),
      expect.objectContaining({ shell: false }),
    );
  });
});
