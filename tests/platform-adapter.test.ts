import { describe, expect, it } from "vitest";
import { getPlatformAdapter } from "../src/main/runtime/platform-adapter";

describe("platform adapter", () => {
  it("returns stable BrowserWindow options for Windows", () => {
    const adapter = getPlatformAdapter("win32");
    const options = adapter.getWindowOptions("C:/app/resources/icon.png");

    expect(options.titleBarStyle).toBeUndefined();
    expect(options.icon).toBe("C:/app/resources/icon.png");
    expect(options.autoHideMenuBar).toBe(true);
  });
});
