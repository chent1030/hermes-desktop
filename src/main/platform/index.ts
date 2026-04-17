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
import { findDownloadedSkillPackage, listInstalledSkills } from "../skills";
import {
  enqueueAuditEvent,
  getAuditStatus,
  markAuditFailure,
  markAuditReauthRequired,
} from "./audit";
import { getSessionState } from "./session";

function normalizeSkillKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function platformLogin(
  payload: TenantLoginInput,
): Promise<void> {
  try {
    await loginWithPassword(payload);
    enqueueAuditEvent({
      type: "auth.login.succeeded",
      payload: {
        tenantCode: payload.tenantCode,
        username: payload.username,
      },
    });
    void flushWorkspaceAuditEvents();
  } catch (error) {
    const message = (error as Error).message;
    enqueueAuditEvent({
      type: "auth.login.failed",
      payload: {
        tenantCode: payload.tenantCode,
        username: payload.username,
        error: message,
      },
    });
    markAuditFailure(message);
    throw error;
  }
}

export async function platformRefreshSession(): Promise<void> {
  try {
    await refreshWorkspaceSession();
  } catch (error) {
    const message = (error as Error).message;
    enqueueAuditEvent({
      type: "auth.refresh.failed",
      payload: { error: message },
    });
    markAuditReauthRequired(message);
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
  try {
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
  } catch (error) {
    const message = (error as Error).message;
    enqueueAuditEvent({
      type: "workspace.initialize.failed",
      payload: { error: message },
    });
    markAuditFailure(message);
    throw error;
  }
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
  try {
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
  } catch (error) {
    const message = (error as Error).message;
    enqueueAuditEvent({
      type: "skill.download.failed",
      payload: { skillId, error: message },
    });
    markAuditFailure(message);
    throw error;
  }
}

export async function platformSyncSkillInstallations(): Promise<
  LocalSkillState[]
> {
  try {
    const session = getSessionState();
    if (!session?.workspace) {
      throw new Error("workspace not initialized");
    }

    const installedSkills = listInstalledSkills();

    const states: LocalSkillState[] = session.workspace.skills.map((skill) => {
      const platformKey = normalizeSkillKey(skill.name);
      const localSkill = installedSkills.find(
        (item) => normalizeSkillKey(item.name) === platformKey,
      );
      const downloadedPackage = findDownloadedSkillPackage(skill);

      let status: LocalSkillState["status"] = "not-downloaded";
      if (localSkill?.isBroken) {
        status = "broken";
      } else if (localSkill && localSkill.version && localSkill.version !== skill.version) {
        status = "outdated";
      } else if (localSkill) {
        status = "installed";
      } else if (downloadedPackage) {
        status = "downloaded";
      }

      return {
        skillId: skill.id,
        installed: Boolean(localSkill),
        version: localSkill?.version || downloadedPackage?.version || null,
        status,
        path: localSkill?.path || downloadedPackage?.path || null,
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
  } catch (error) {
    const message = (error as Error).message;
    enqueueAuditEvent({
      type: "skill.sync.failed",
      payload: { error: message },
    });
    markAuditFailure(message);
    throw error;
  }
}
