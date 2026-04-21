import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("windows docs contract", () => {
  it("documents the native Windows x64 internal test build", () => {
    const readme = readFileSync("README.md", "utf-8");

    expect(readme).toContain("Windows internal test build");
    expect(readme).toContain("Windows x64");
    expect(readme).toContain("build:win");
  });

  it("documents unsigned installer QA expectations", () => {
    const qaDoc = readFileSync("docs/windows-manual-qa.md", "utf-8");

    expect(qaDoc).toContain("NSIS");
    expect(qaDoc.toLowerCase()).toContain("unsigned");
    expect(qaDoc).toContain("Windows x64");
  });
});
