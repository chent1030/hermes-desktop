import type { BrowserWindowConstructorOptions } from "electron";

export function getPlatformAdapter(platform: NodeJS.Platform): {
  getWindowOptions: (icon: string) => BrowserWindowConstructorOptions;
} {
  return {
    getWindowOptions(icon: string): BrowserWindowConstructorOptions {
      return {
        width: 1100,
        height: 750,
        minWidth: 800,
        minHeight: 600,
        show: false,
        autoHideMenuBar: true,
        ...(platform === "darwin"
          ? {
              titleBarStyle: "hiddenInset",
              trafficLightPosition: { x: 16, y: 16 },
            }
          : {}),
        ...(platform !== "darwin" ? { icon } : {}),
      };
    },
  };
}
