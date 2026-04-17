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
  _skillId: string,
): Promise<boolean> {
  throw new Error("platform skill download not implemented");
}

export async function platformSyncSkillInstallations(): Promise<
  LocalSkillState[]
> {
  throw new Error("platform skill sync not implemented");
}
