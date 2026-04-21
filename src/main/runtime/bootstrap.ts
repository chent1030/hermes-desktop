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
    const targetPath = join(options.userRuntimeRoot, entry.relativePath);
    if (!existsSync(targetPath)) {
      throw new Error(`runtime entry missing after bootstrap: ${entry.id}`);
    }
  }
}
