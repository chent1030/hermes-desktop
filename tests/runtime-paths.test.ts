import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "../src/main/runtime/paths";

describe("resolveRuntimePaths", () => {
  it("returns Windows install and user runtime paths without Unix-only segments", () => {
    const paths = resolveRuntimePaths({
      platform: "win32",
      appRoot: "C:/Program Files/Hermes Desktop/resources",
      userData: "C:/Users/test/AppData/Roaming/Hermes Desktop",
      temp: "C:/Users/test/AppData/Local/Temp",
    });

    expect(paths.packagedRuntimeRoot).toBe(
      "C:/Program Files/Hermes Desktop/resources/runtime/windows-x64",
    );
    expect(paths.userRuntimeRoot).toBe(
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime",
    );
    expect(paths.hermesHome).toBe(
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home",
    );
    expect(paths.pythonExecutable.endsWith("python.exe")).toBe(true);
    expect(paths.pythonExecutable.includes("/bin/python")).toBe(false);
  });
});
