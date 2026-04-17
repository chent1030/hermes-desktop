import { shell } from "electron";
import type { AuditStatus } from "../../shared/platform/audit";
import type {
  LocalSkillState,
  TenantLoginInput,
  WorkspaceBootstrap,
} from "../../shared/platform/contracts";
import {
  clearWorkspaceSession,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
  selectWorkspaceModel,
} from "./runtime";
import { listInstalledSkills } from "../skills";
import { getSessionState } from "./session";

export async function platformLogin(
  payload: TenantLoginInput,
): Promise<void> {
  await loginWithPassword(payload);
}

export async function platformRefreshSession(): Promise<void> {
  await refreshWorkspaceSession();
}

export async function platformLogout(): Promise<void> {
  clearWorkspaceSession();
}

export async function platformInitializeWorkspace(): Promise<WorkspaceBootstrap> {
  return initializeWorkspaceState();
}

export async function platformSelectModel(
  modelId: string,
): Promise<WorkspaceBootstrap> {
  return selectWorkspaceModel(modelId);
}

export async function platformGetAuditStatus(): Promise<AuditStatus> {
  throw new Error("platform audit not implemented");
}

export async function platformRetryAuditFlush(): Promise<AuditStatus> {
  throw new Error("platform audit not implemented");
}

export async function platformDownloadSkillPackage(
  skillId: string,
): Promise<boolean> {
  const session = getSessionState();
  const skill = session?.workspace?.skills.find((item) => item.id === skillId);
  if (!skill) {
    throw new Error("skill not found");
  }

  await shell.openExternal(skill.downloadUrl);
  return true;
}

export async function platformSyncSkillInstallations(): Promise<
  LocalSkillState[]
> {
  const session = getSessionState();
  if (!session?.workspace) {
    throw new Error("workspace not initialized");
  }

  const installedSkills = listInstalledSkills();

  return session.workspace.skills.map((skill) => {
    const localSkill = installedSkills.find((item) => item.name === skill.name);

    return {
      skillId: skill.id,
      installed: Boolean(localSkill),
      version: localSkill ? skill.version : null,
      status: localSkill ? "installed" : "not-downloaded",
      path: localSkill?.path || null,
    };
  });
}
