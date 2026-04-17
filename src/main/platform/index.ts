import type { AuditStatus } from "../../shared/platform/audit";
import type {
  LocalSkillState,
  TenantLoginInput,
  WorkspaceBootstrap,
} from "../../shared/platform/contracts";

export async function platformLogin(
  _payload: TenantLoginInput,
): Promise<void> {
  throw new Error("platform login not implemented");
}

export async function platformRefreshSession(): Promise<void> {
  throw new Error("platform refresh not implemented");
}

export async function platformLogout(): Promise<void> {
  return;
}

export async function platformInitializeWorkspace(): Promise<WorkspaceBootstrap> {
  throw new Error("platform init not implemented");
}

export async function platformSelectModel(
  _modelId: string,
): Promise<WorkspaceBootstrap> {
  throw new Error("platform select model not implemented");
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
