import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { app } from "electron";

export interface RuntimePathOptions {
  platform?: NodeJS.Platform;
  appRoot?: string;
  userData?: string;
  temp?: string;
}

export interface RuntimePaths {
  platform: NodeJS.Platform;
  packagedRuntimeRoot: string;
  userRuntimeRoot: string;
  hermesHome: string;
  logsDir: string;
  tempDir: string;
  pythonExecutable: string;
  hermesScript: string;
  hermesConfigFile: string;
  hermesEnvFile: string;
}

export function resolveRuntimePaths(
  options: RuntimePathOptions = {},
): RuntimePaths {
  const platform = options.platform ?? process.platform;
  const appRoot =
    options.appRoot ?? process.resourcesPath ?? join(process.cwd(), "resources");
  const userData =
    options.userData ??
    safeElectronPath("userData", join(homedir(), ".hermes-desktop"));
  const temp =
    options.temp ?? safeElectronPath("temp", join(tmpdir(), "hermes-desktop"));
  const packagedRuntimeRoot = join(
    appRoot,
    "runtime",
    platform === "win32" ? "windows-x64" : platform,
  );
  const userRuntimeRoot = join(userData, "runtime");
  const hermesHome = join(userRuntimeRoot, "hermes-home");
  const pythonExecutable =
    platform === "win32"
      ? join(userRuntimeRoot, "python", "python.exe")
      : join(userRuntimeRoot, "python", "bin", "python");

  return {
    platform,
    packagedRuntimeRoot,
    userRuntimeRoot,
    hermesHome,
    logsDir: join(userRuntimeRoot, "logs"),
    tempDir: join(temp, "hermes-desktop"),
    pythonExecutable,
    hermesScript: join(userRuntimeRoot, "hermes", "hermes"),
    hermesConfigFile: join(hermesHome, "config.yaml"),
    hermesEnvFile: join(hermesHome, ".env"),
  };
}

function safeElectronPath(
  name: Parameters<typeof app.getPath>[0],
  fallback: string,
): string {
  try {
    return app.getPath(name);
  } catch {
    return fallback;
  }
}
