# Windows Desktop Adaptation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `Windows x64` internal-test desktop release that can be packaged natively on Windows and run the login, initialization, chat, skills, and audit flows without requiring testers to preinstall Python or Git.

**Architecture:** Introduce a dedicated Windows runtime layer instead of scattering `win32` branches through the app. The implementation adds a packaged runtime manifest, a user-writable runtime bootstrap, a shared process runner, and a main-process platform adapter so packaging, startup, and Hermes child-process management all use the same path and execution model.

**Tech Stack:** Electron, electron-vite, electron-builder/NSIS, TypeScript, Vitest, Node.js `fs`/`path`/`child_process`

---

## File Structure Map

### New files

- `scripts/prepare-windows-runtime.mjs` — downloads or assembles the Windows embeddable Python runtime and copies Hermes assets into a deterministic bundle directory before packaging.
- `resources/runtime/windows-x64/runtime-manifest.json` — declares bundled executables, bootstrap copy rules, and integrity metadata used by tests and startup code.
- `src/main/runtime/paths.ts` — centralizes install directory, user data directory, runtime directory, logs directory, and temporary directory resolution for all platforms, with Windows-specific outputs tested explicitly.
- `src/main/runtime/bootstrap.ts` — copies the packaged read-only runtime bundle into a user-writable runtime home on first launch and validates required files.
- `src/main/runtime/process-runner.ts` — wraps `spawn`/`execFile` with a single API that resolves executable paths, injects environment, captures logs, and normalizes Windows errors.
- `src/main/runtime/platform-adapter.ts` — returns platform-safe BrowserWindow options, icon paths, AppUserModelId behavior, and Windows shell integration defaults.
- `tests/windows-build-config.test.ts` — validates package/build scripts and Windows extraResources configuration.
- `tests/runtime-paths.test.ts` — validates Windows path resolution and bootstrap directory layout.
- `tests/runtime-bootstrap.test.ts` — validates first-run copy behavior and manifest verification.
- `tests/process-runner.test.ts` — validates command invocation, `.exe` path handling, and Windows-style errors.
- `tests/platform-adapter.test.ts` — validates BrowserWindow options and Windows-specific shell behavior.
- `docs/windows-manual-qa.md` — manual QA checklist for install/start/login/chat/skills/audit/uninstall on Windows.

### Modified files

- `package.json` — adds Windows build configuration, `extraResources`, unpack rules, and runtime prep/build scripts.
- `src/main/index.ts` — replaces inline OS branches with the new adapter and runs runtime bootstrap before window creation.
- `src/main/installer.ts` — stops hardcoding `~/.hermes` and Unix `bin/python` paths, using the runtime path + process runner abstraction instead.
- `src/main/hermes.ts` — resolves Hermes executable paths via the runtime layer and removes Unix-only environment/path assumptions.
- `src/main/config.ts` — reads and writes Hermes config in the user runtime home returned by `paths.ts` instead of assuming `homedir()` conventions.
- `README.md` — adds Windows-native build instructions and runtime bundle preparation steps.

---

### Task 1: Define the Windows packaging contract

**Files:**
- Modify: `package.json`
- Create: `scripts/prepare-windows-runtime.mjs`
- Create: `resources/runtime/windows-x64/runtime-manifest.json`
- Test: `tests/windows-build-config.test.ts`

- [ ] **Step 1: Write the failing packaging test**

```ts
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";
import runtimeManifest from "../resources/runtime/windows-x64/runtime-manifest.json";

describe("windows build contract", () => {
  it("defines a native Windows packaging flow", () => {
    expect(packageJson.scripts["prepare:win-runtime"]).toBe(
      "node scripts/prepare-windows-runtime.mjs",
    );
    expect(packageJson.scripts["build:win"]).toContain("prepare:win-runtime");
    expect(packageJson.build.win.target).toContain("nsis");
    expect(packageJson.build.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "resources/runtime/windows-x64" }),
      ]),
    );
    expect(runtimeManifest.platform).toBe("win32");
    expect(runtimeManifest.arch).toBe("x64");
    expect(runtimeManifest.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "python", relativePath: "python/python.exe" }),
        expect.objectContaining({ id: "hermes-script", relativePath: "hermes/hermes" }),
      ]),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/windows-build-config.test.ts`
Expected: FAIL because the script, build config, and manifest do not exist yet.

- [ ] **Step 3: Write the minimal packaging implementation**

```json
{
  "scripts": {
    "prepare:win-runtime": "node scripts/prepare-windows-runtime.mjs",
    "build:win": "npm run prepare:win-runtime && npm run build && electron-builder --win nsis --x64"
  },
  "build": {
    "appId": "com.nousresearch.hermes",
    "asarUnpack": [
      "resources/runtime/**"
    ],
    "files": [
      "out/**",
      "resources/**",
      "package.json"
    ],
    "extraResources": [
      {
        "from": "resources/runtime/windows-x64",
        "to": "runtime/windows-x64",
        "filter": ["**/*"]
      }
    ],
    "win": {
      "target": ["nsis", "dir"],
      "artifactName": "Hermes-Desktop-${version}-win-x64.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "perMachine": false,
      "deleteAppDataOnUninstall": false
    }
  }
}
```

```js
// scripts/prepare-windows-runtime.mjs
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleDir = join(root, "resources", "runtime", "windows-x64");
const pythonDir = join(bundleDir, "python");
const hermesDir = join(bundleDir, "hermes");
const pythonSourceDir = process.env.HERMES_WINDOWS_PYTHON_DIR;
const hermesSourceDir = process.env.HERMES_AGENT_SOURCE_DIR;

if (!pythonSourceDir || !hermesSourceDir) {
  throw new Error("Set HERMES_WINDOWS_PYTHON_DIR and HERMES_AGENT_SOURCE_DIR before building Windows runtime.");
}

rmSync(bundleDir, { recursive: true, force: true });
mkdirSync(pythonDir, { recursive: true });
mkdirSync(hermesDir, { recursive: true });

cpSync(pythonSourceDir, pythonDir, { recursive: true });
cpSync(hermesSourceDir, hermesDir, { recursive: true });

writeFileSync(
  join(bundleDir, "runtime-manifest.json"),
  JSON.stringify(
    {
      platform: "win32",
      arch: "x64",
      entries: [
        { id: "python", relativePath: "python/python.exe" },
        { id: "hermes-script", relativePath: "hermes/hermes" },
      ],
    },
    null,
    2,
  ),
);
```

```json
{
  "platform": "win32",
  "arch": "x64",
  "entries": [
    { "id": "python", "relativePath": "python/python.exe" },
    { "id": "hermes-script", "relativePath": "hermes/hermes" }
  ]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/windows-build-config.test.ts`
Expected: PASS with one test file and one passing test.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/prepare-windows-runtime.mjs resources/runtime/windows-x64/runtime-manifest.json tests/windows-build-config.test.ts
git commit -m "build: define Windows packaging contract"
```

### Task 2: Add a shared runtime path service

**Files:**
- Create: `src/main/runtime/paths.ts`
- Modify: `src/main/config.ts`
- Test: `tests/runtime-paths.test.ts`

- [ ] **Step 1: Write the failing path test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/runtime-paths.test.ts`
Expected: FAIL because `src/main/runtime/paths.ts` does not exist.

- [ ] **Step 3: Write the minimal path service**

```ts
// src/main/runtime/paths.ts
import { join } from "node:path";
import { app } from "electron";

export interface RuntimePathOptions {
  platform?: NodeJS.Platform;
  appRoot?: string;
  userData?: string;
  temp?: string;
}

export interface RuntimePaths {
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

export function resolveRuntimePaths(options: RuntimePathOptions = {}): RuntimePaths {
  const platform = options.platform ?? process.platform;
  const appRoot = options.appRoot ?? process.resourcesPath;
  const userData = options.userData ?? app.getPath("userData");
  const temp = options.temp ?? app.getPath("temp");
  const packagedRuntimeRoot = join(appRoot, "runtime", platform === "win32" ? "windows-x64" : platform);
  const userRuntimeRoot = join(userData, "runtime");
  const hermesHome = join(userRuntimeRoot, "hermes-home");
  const pythonExecutable =
    platform === "win32"
      ? join(userRuntimeRoot, "python", "python.exe")
      : join(userRuntimeRoot, "python", "bin", "python");

  return {
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
```

```ts
// src/main/config.ts
import { resolveRuntimePaths } from "./runtime/paths";

const runtimePaths = resolveRuntimePaths();
export function getHermesHome(profile?: string): string {
  if (profile) {
    return profilePaths(profile).home;
  }
  return runtimePaths.hermesHome;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/runtime-paths.test.ts`
Expected: PASS with the Windows path expectations green.

- [ ] **Step 5: Commit**

```bash
git add src/main/runtime/paths.ts src/main/config.ts tests/runtime-paths.test.ts
git commit -m "refactor: centralize runtime path resolution"
```

### Task 3: Bootstrap a user-writable runtime on first launch

**Files:**
- Create: `src/main/runtime/bootstrap.ts`
- Modify: `src/main/index.ts`
- Test: `tests/runtime-bootstrap.test.ts`

- [ ] **Step 1: Write the failing bootstrap test**

```ts
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
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
      JSON.stringify({ entries: [{ id: "python", relativePath: "python/python.exe" }] }),
    );

    ensureRuntimeBootstrap({ packagedRuntimeRoot: packaged, userRuntimeRoot: userRuntime });

    expect(existsSync(join(userRuntime, "python", "python.exe"))).toBe(true);
    expect(existsSync(join(userRuntime, "hermes", "hermes"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/runtime-bootstrap.test.ts`
Expected: FAIL because `ensureRuntimeBootstrap` is missing.

- [ ] **Step 3: Write the minimal bootstrap implementation**

```ts
// src/main/runtime/bootstrap.ts
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface BootstrapOptions {
  packagedRuntimeRoot: string;
  userRuntimeRoot: string;
}

export function ensureRuntimeBootstrap(options: BootstrapOptions): void {
  const manifestPath = join(options.packagedRuntimeRoot, "runtime-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    entries: Array<{ id: string; relativePath: string }>;
  };

  mkdirSync(options.userRuntimeRoot, { recursive: true });
  cpSync(options.packagedRuntimeRoot, options.userRuntimeRoot, { recursive: true });

  for (const entry of manifest.entries) {
    const target = join(options.userRuntimeRoot, entry.relativePath);
    if (!existsSync(target)) {
      throw new Error(`runtime entry missing after bootstrap: ${entry.id}`);
    }
  }
}
```

```ts
// src/main/index.ts
import { resolveRuntimePaths } from "./runtime/paths";
import { ensureRuntimeBootstrap } from "./runtime/bootstrap";

app.whenReady().then(async () => {
  const runtimePaths = resolveRuntimePaths();
  ensureRuntimeBootstrap({
    packagedRuntimeRoot: runtimePaths.packagedRuntimeRoot,
    userRuntimeRoot: runtimePaths.userRuntimeRoot,
  });
  createWindow();
  setupIPC();
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/runtime-bootstrap.test.ts`
Expected: PASS, confirming first-run bootstrap copies the runtime.

- [ ] **Step 5: Commit**

```bash
git add src/main/runtime/bootstrap.ts src/main/index.ts tests/runtime-bootstrap.test.ts
git commit -m "feat: bootstrap packaged runtime into user data"
```

### Task 4: Introduce a shared process runner and migrate Hermes entrypoints

**Files:**
- Create: `src/main/runtime/process-runner.ts`
- Modify: `src/main/installer.ts`
- Modify: `src/main/hermes.ts`
- Test: `tests/process-runner.test.ts`

- [ ] **Step 1: Write the failing process-runner test**

```ts
import { describe, expect, it, vi } from "vitest";
import { createProcessRunner } from "../src/main/runtime/process-runner";

describe("process runner", () => {
  it("invokes explicit executables without shell mode", async () => {
    const spawn = vi.fn(() => ({ on: vi.fn(), stdout: { on: vi.fn() }, stderr: { on: vi.fn() } }));
    const runner = createProcessRunner({ spawnImpl: spawn as never });

    runner.spawn({
      executable: "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/python/python.exe",
      args: ["C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes/hermes", "--version"],
      env: { HERMES_HOME: "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/hermes-home" },
    });

    expect(spawn).toHaveBeenCalledWith(
      "C:/Users/test/AppData/Roaming/Hermes Desktop/runtime/python/python.exe",
      expect.any(Array),
      expect.objectContaining({ shell: false }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/process-runner.test.ts`
Expected: FAIL because the process-runner module does not exist.

- [ ] **Step 3: Write the minimal process-runner implementation and migrate call sites**

```ts
// src/main/runtime/process-runner.ts
import { spawn } from "node:child_process";

interface SpawnRequest {
  executable: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd?: string;
}

export function createProcessRunner(deps: { spawnImpl?: typeof spawn } = {}) {
  const spawnImpl = deps.spawnImpl ?? spawn;
  return {
    spawn(request: SpawnRequest) {
      return spawnImpl(request.executable, request.args, {
        cwd: request.cwd,
        env: request.env,
        shell: false,
        windowsHide: true,
      });
    },
  };
}
```

```ts
// src/main/installer.ts
import { resolveRuntimePaths } from "./runtime/paths";
import { createProcessRunner } from "./runtime/process-runner";

const runtimePaths = resolveRuntimePaths();
const processRunner = createProcessRunner();
export const HERMES_HOME = runtimePaths.hermesHome;
export const HERMES_PYTHON = runtimePaths.pythonExecutable;
export const HERMES_SCRIPT = runtimePaths.hermesScript;
```

```ts
// src/main/hermes.ts
const runtimePaths = resolveRuntimePaths();
const processRunner = createProcessRunner();
const proc = processRunner.spawn({
  executable: runtimePaths.pythonExecutable,
  args: [runtimePaths.hermesScript, ...args],
  cwd: runtimePaths.userRuntimeRoot,
  env: {
    ...process.env,
    HOME: runtimePaths.hermesHome,
    HERMES_HOME: runtimePaths.hermesHome,
  },
});
```


- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/process-runner.test.ts`
Expected: PASS, proving Windows invocations use explicit executables and `shell: false`.

- [ ] **Step 5: Commit**

```bash
git add src/main/runtime/process-runner.ts src/main/installer.ts src/main/hermes.ts tests/process-runner.test.ts
git commit -m "refactor: route Hermes child processes through process runner"
```

### Task 5: Add a main-process Windows platform adapter

**Files:**
- Create: `src/main/runtime/platform-adapter.ts`
- Modify: `src/main/index.ts`
- Test: `tests/platform-adapter.test.ts`

- [ ] **Step 1: Write the failing adapter test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/platform-adapter.test.ts`
Expected: FAIL because the adapter module is missing.

- [ ] **Step 3: Write the minimal adapter and use it from `index.ts`**

```ts
// src/main/runtime/platform-adapter.ts
import type { BrowserWindowConstructorOptions } from "electron";

export function getPlatformAdapter(platform: NodeJS.Platform) {
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
```

```ts
// src/main/index.ts
import { getPlatformAdapter } from "./runtime/platform-adapter";

function createWindow(): void {
  const adapter = getPlatformAdapter(process.platform);
  mainWindow = new BrowserWindow({
    ...adapter.getWindowOptions(icon),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      webviewTag: true,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/platform-adapter.test.ts`
Expected: PASS, confirming Windows options no longer depend on inline `darwin` branches.

- [ ] **Step 5: Commit**

```bash
git add src/main/runtime/platform-adapter.ts src/main/index.ts tests/platform-adapter.test.ts
git commit -m "refactor: centralize platform-specific window options"
```

### Task 6: Document and validate the Windows release flow end-to-end

**Files:**
- Modify: `README.md`
- Create: `docs/windows-manual-qa.md`
- Test: `tests/windows-build-config.test.ts`

- [ ] **Step 1: Write the failing docs/assertion update**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Windows release docs", () => {
  it("documents native Windows build and QA steps", () => {
    const readme = readFileSync("README.md", "utf-8");
    const qa = readFileSync("docs/windows-manual-qa.md", "utf-8");

    expect(readme).toContain("npm run prepare:win-runtime");
    expect(readme).toContain("npm run build:win");
    expect(qa).toContain("Install the NSIS package on a clean Windows x64 machine");
    expect(qa).toContain("Verify login, initialization, chat, skills, and audit upload");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/windows-build-config.test.ts`
Expected: FAIL because the README/QA checklist text has not been added yet.

- [ ] **Step 3: Write the minimal documentation updates**

````md
<!-- README.md -->
## Windows internal test build

Run these commands on a Windows x64 machine after setting the runtime source directories:

```bash
set HERMES_WINDOWS_PYTHON_DIR=C:\runtime\python-embed
set HERMES_AGENT_SOURCE_DIR=C:\runtime\hermes-agent
npm install
npm run prepare:win-runtime
npm run build:win
```

Artifacts:

- `dist/win-unpacked/`
- `dist/Hermes-Desktop-<version>-win-x64.exe`
````

````md
<!-- docs/windows-manual-qa.md -->
# Windows Manual QA

1. Install the NSIS package on a clean Windows x64 machine.
2. Launch the app and confirm the login screen renders.
3. Sign in with a tenant account and confirm initialization succeeds.
4. Send a chat message and confirm the model replies.
5. Open Skills and verify the catalog renders and downloads work.
6. Open Workspace Info and verify audit upload is healthy.
7. Exit the app, relaunch it, and confirm the login/runtime behavior matches the product spec.
8. Uninstall the app and confirm user runtime data is preserved unless manually deleted.
````

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- tests/windows-build-config.test.ts`
Expected: PASS with both config and documentation assertions green.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/windows-manual-qa.md tests/windows-build-config.test.ts
git commit -m "docs: add Windows build and QA instructions"
```

---

## Self-Review Checklist

- Spec coverage: this plan maps packaging to Task 1, path/runtime layout to Tasks 2-4, main-process behavior to Task 5, and validation/QA to Task 6.
- Placeholder scan: no `TODO`/`TBD` markers remain; each task names concrete files, commands, and expected outputs.
- Type consistency: all later tasks reuse the same `resolveRuntimePaths`, `ensureRuntimeBootstrap`, `createProcessRunner`, and `getPlatformAdapter` names introduced in earlier tasks.
