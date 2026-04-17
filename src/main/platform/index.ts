import { shell } from "electron";
import type { AuditStatus } from "../../shared/platform/audit";
import type {
  LocalSkillState,
  TenantLoginInput,
  WorkspaceBootstrap,
} from "../../shared/platform/contracts";
import {
  clearWorkspaceSession,
  flushWorkspaceAuditEvents,
  initializeWorkspaceState,
  loginWithPassword,
  refreshWorkspaceSession,
  selectWorkspaceModel,
} from "./runtime";
import { listInstalledSkills } from "../skills";
import {
  enqueueAuditEvent,
  getAuditStatus,
  markAuditReauthRequired,
} from "./audit";
import { getSessionState } from "./session";

export async function platformLogin(
  payload: TenantLoginInput,
): Promise<void> {
  await loginWithPassword(payload);
  enqueueAuditEvent({
    type: "auth.login.succeeded",
    payload: {
      tenantCode: payload.tenantCode,
      username: payload.username,
    },
  });
  void flushWorkspaceAuditEvents();
}

export async function platformRefreshSession(): Promise<void> {
  try {
    await refreshWorkspaceSession();
  } catch (error) {
    markAuditReauthRequired();
    throw error;
  }
}

export async function platformLogout(): Promise<void> {
  enqueueAuditEvent({
    type: "auth.logout",
    payload: {},
  });
  await flushWorkspaceAuditEvents().catch(() => undefined);
  clearWorkspaceSession();
}

export async function platformInitializeWorkspace(): Promise<WorkspaceBootstrap> {
  const workspace = await initializeWorkspaceState();
  enqueueAuditEvent({
    type: "workspace.initialized",
    payload: {
      tenantId: workspace.tenant.id,
      userId: workspace.user.id,
      modelCount: workspace.models.length,
      skillCount: workspace.skills.length,
    },
  });
  void flushWorkspaceAuditEvents();
  return workspace;
}

export async function platformSelectModel(
  modelId: string,
): Promise<WorkspaceBootstrap> {
  const workspace = selectWorkspaceModel(modelId);
  enqueueAuditEvent({
    type: "model.selected",
    payload: { modelId },
  });
  void flushWorkspaceAuditEvents();
  return workspace;
}

export async function platformGetAuditStatus(): Promise<AuditStatus> {
  return getAuditStatus();
}

export async function platformRetryAuditFlush(): Promise<AuditStatus> {
  return flushWorkspaceAuditEvents();
}

export async function platformDownloadSkillPackage(
  skillId: string,
): Promise<boolean> {
  enqueueAuditEvent({
    type: "skill.download.clicked",
    payload: { skillId },
  });
  void flushWorkspaceAuditEvents();

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

  const states: LocalSkillState[] = session.workspace.skills.map((skill) => {
    const localSkill = installedSkills.find((item) => item.name === skill.name);

    return {
      skillId: skill.id,
      installed: Boolean(localSkill),
      version: localSkill ? skill.version : null,
      status: localSkill ? "installed" : "not-downloaded",
      path: localSkill?.path || null,
    };
  });

  enqueueAuditEvent({
    type: "skill.sync.completed",
    payload: {
      installedCount: states.filter((item) => item.installed).length,
      totalCount: states.length,
    },
  });
  void flushWorkspaceAuditEvents();

  return states;
}
