import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const bundleDir = join(root, "resources", "runtime", "windows-x64");
const pythonDir = join(bundleDir, "python");
const hermesDir = join(bundleDir, "hermes");
const pythonSourceDir = process.env.HERMES_WINDOWS_PYTHON_DIR;
const hermesSourceDir = process.env.HERMES_AGENT_SOURCE_DIR;

if (!pythonSourceDir || !hermesSourceDir) {
  throw new Error(
    "Set HERMES_WINDOWS_PYTHON_DIR and HERMES_AGENT_SOURCE_DIR before building Windows runtime.",
  );
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
