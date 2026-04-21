import { execFileSync } from "child_process";
import { app } from "electron";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { SkillCatalogItem } from "../shared/platform/contracts";
import {
  HERMES_HOME,
  HERMES_PYTHON,
  HERMES_SCRIPT,
  HERMES_REPO,
  getEnhancedPath,
} from "./installer";
import { profileHome } from "./utils";

export interface InstalledSkill {
  name: string;
  category: string;
  description: string;
  path: string;
  version: string | null;
  isBroken: boolean;
}

export interface DownloadedSkillPackage {
  path: string;
  version: string | null;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
}

/**
 * Parse SKILL.md frontmatter (YAML between --- markers) for name/description.
 */
function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  version: string | null;
} {
  const result = { name: "", description: "", version: null as string | null };

  // Check for YAML frontmatter
  if (!content.startsWith("---")) {
    // Fall back to first heading and first paragraph
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) result.name = headingMatch[1].trim();
    const paraMatch = content.match(/^(?!#)(?!---).+/m);
    if (paraMatch) result.description = paraMatch[0].trim().slice(0, 120);
    return result;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return result;

  const frontmatter = content.slice(3, endIdx);

  const nameMatch = frontmatter.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = frontmatter.match(
    /^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m,
  );
  if (descMatch) result.description = descMatch[1].trim();

  const versionMatch = frontmatter.match(
    /^\s*version:\s*["']?([^"'\n]+)["']?\s*$/m,
  );
  if (versionMatch) result.version = versionMatch[1].trim();

  return result;
}

function normalizeSkillKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function listArchiveFiles(dir: string, depth = 0): string[] {
  if (!existsSync(dir) || depth > 2) return [];

  try {
    const entries = readdirSync(dir);
    return entries.flatMap((entry) => {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        return listArchiveFiles(fullPath, depth + 1);
      }

      if (!/\.(zip|tgz|tar\.gz)$/i.test(entry)) {
        return [];
      }

      return [fullPath];
    });
  } catch {
    return [];
  }
}

function resolveDownloadsDir(): string {
  try {
    return app.getPath("downloads");
  } catch {
    return join(homedir(), "Downloads");
  }
}

export function getSkillDownloadSearchDirs(profile?: string): string[] {
  return [
    join(profileHome(profile), "downloads"),
    join(profileHome(profile), "downloads", "skills"),
    resolveDownloadsDir(),
  ];
}

/**
 * Walk the skills directory to find all installed skills.
 * Structure: skills/<category>/<skill-name>/SKILL.md
 */
export function listInstalledSkills(profile?: string): InstalledSkill[] {
  const skillsDir = join(profileHome(profile), "skills");
  if (!existsSync(skillsDir)) return [];

  const skills: InstalledSkill[] = [];

  try {
    const categories = readdirSync(skillsDir);

    for (const category of categories) {
      const categoryPath = join(skillsDir, category);
      if (!statSync(categoryPath).isDirectory()) continue;

      const entries = readdirSync(categoryPath);
      for (const entry of entries) {
        const entryPath = join(categoryPath, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        const skillFile = join(entryPath, "SKILL.md");
        if (!existsSync(skillFile)) {
          skills.push({
            name: entry,
            category,
            description: "",
            path: entryPath,
            version: null,
            isBroken: true,
          });
          continue;
        }

        try {
          const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
          const meta = parseSkillFrontmatter(content);

          skills.push({
            name: meta.name || entry,
            category,
            description: meta.description || "",
            path: entryPath,
            version: meta.version,
            isBroken: false,
          });
        } catch {
          skills.push({
            name: entry,
            category,
            description: "",
            path: entryPath,
            version: null,
            isBroken: true,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export function findDownloadedSkillPackage(
  skill: SkillCatalogItem,
  profile?: string,
): DownloadedSkillPackage | null {
  const skillKey = normalizeSkillKey(skill.name);
  const skillIdKey = normalizeSkillKey(skill.id);
  const versionKey = normalizeSkillKey(skill.version);
  const searchDirs = getSkillDownloadSearchDirs(profile);

  for (const dir of searchDirs) {
    for (const fullPath of listArchiveFiles(dir)) {
      const fileName = normalizeSkillKey(fullPath);
      const matchesName = fileName.includes(skillKey) || fileName.includes(skillIdKey);
      const matchesVersion = !versionKey || fileName.includes(versionKey);
      if (matchesName && matchesVersion) {
        return {
          path: fullPath,
          version: skill.version,
        };
      }
    }
  }

  return null;
}

/**
 * Get the full content of a SKILL.md for the detail view.
 */
export function getSkillContent(skillPath: string): string {
  const skillFile = join(skillPath, "SKILL.md");
  if (!existsSync(skillFile)) return "";

  try {
    return readFileSync(skillFile, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Search the skill registry via the hermes CLI.
 */
export function searchSkills(query: string): SkillSearchResult[] {
  try {
    const output = execFileSync(
      HERMES_PYTHON,
      [HERMES_SCRIPT, "skills", "browse", "--query", query, "--json"],
      {
        cwd: HERMES_REPO,
        env: {
          ...process.env,
          PATH: getEnhancedPath(),
          HOME: homedir(),
          HERMES_HOME,
        },
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 30000,
      },
    );

    const text = output.toString().trim();
    if (!text) return [];

    // Try to parse JSON output
    try {
      const results = JSON.parse(text);
      if (Array.isArray(results)) {
        return results.map((r: Record<string, string>) => ({
          name: r.name || "",
          description: r.description || "",
          category: r.category || "",
          source: r.source || "",
          installed: false,
        }));
      }
    } catch {
      // If JSON parsing fails, the CLI may not support --json flag
      // Fall back to listing bundled skills that match
    }

    return [];
  } catch {
    return [];
  }
}

function getBundledSkillsDir(): string {
  return join(HERMES_REPO, "hermes", "skills");
}

/**
 * List bundled skills from the packaged Hermes runtime.
 */
export function listBundledSkills(): SkillSearchResult[] {
  const bundledDir = getBundledSkillsDir();
  if (!existsSync(bundledDir)) return [];

  const skills: SkillSearchResult[] = [];

  try {
    const categories = readdirSync(bundledDir);

    for (const category of categories) {
      const catPath = join(bundledDir, category);
      if (!statSync(catPath).isDirectory()) continue;

      const entries = readdirSync(catPath);
      for (const entry of entries) {
        const entryPath = join(catPath, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        const skillFile = join(entryPath, "SKILL.md");
        if (!existsSync(skillFile)) continue;

        try {
          const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
          const meta = parseSkillFrontmatter(content);

          skills.push({
            name: meta.name || entry,
            description: meta.description || "",
            category,
            source: "bundled",
            installed: false,
          });
        } catch {
          skills.push({
            name: entry,
            description: "",
            category,
            source: "bundled",
            installed: false,
          });
        }
      }
    }
  } catch {
    // ignore
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export function installSkill(
  identifier: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const args = [HERMES_SCRIPT, "skills", "install", identifier, "--yes"];
    if (profile && profile !== "default") {
      args.splice(1, 0, "-p", profile);
    }

    execFileSync(HERMES_PYTHON, args, {
      cwd: HERMES_REPO,
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        HERMES_HOME,
      },
      stdio: "pipe",
      timeout: 60000,
    });
    return { success: true };
  } catch (err) {
    const msg =
      (err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message;
    return { success: false, error: msg.trim() };
  }
}

export function uninstallSkill(
  name: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const args = [HERMES_SCRIPT, "skills", "uninstall", name, "--yes"];
    if (profile && profile !== "default") {
      args.splice(1, 0, "-p", profile);
    }

    execFileSync(HERMES_PYTHON, args, {
      cwd: HERMES_REPO,
      env: {
        ...process.env,
        PATH: getEnhancedPath(),
        HOME: homedir(),
        HERMES_HOME,
      },
      stdio: "pipe",
      timeout: 30000,
    });
    return { success: true };
  } catch (err) {
    const msg =
      (err as { stderr?: Buffer }).stderr?.toString() || (err as Error).message;
    return { success: false, error: msg.trim() };
  }
}
