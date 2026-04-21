import { describe, expect, it } from "vitest";
import { getHermesExecOptions, HERMES_REPO } from "../src/main/installer";

describe("getHermesExecOptions", () => {
  it("uses the runtime root as cwd instead of a nested hermes-agent directory", () => {
    const options = getHermesExecOptions(15000);

    expect(options.cwd).toBe(HERMES_REPO);
    expect(String(options.cwd).includes("hermes-agent")).toBe(false);
    expect(options.timeout).toBe(15000);
    expect(options.env?.HERMES_HOME).toBeDefined();
  });
});
