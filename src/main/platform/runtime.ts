import type { AuditStatus } from "../../shared/platform/audit";
import type {
  TenantLoginInput,
  WorkspaceBootstrap,
} from "../../shared/platform/contracts";
import {
  fetchAuditHealth,
  fetchBootstrap,
  fetchModels,
  fetchSkillCatalog,
  loginRequest,
  postAuditEvents,
  refreshRequest,
} from "./client";
import {
  flushAuditQueue,
  getAuditStatus,
  markAuditReauthRequired,
} from "./audit";
import {
  clearSessionState,
  getSessionState,
  setSessionTokens,
  setWorkspaceBootstrap,
} from "./session";

export async function loginWithPassword(
  input: TenantLoginInput,
): Promise<void> {
  const tokens = await loginRequest(input);
  setSessionTokens(tokens.accessToken, tokens.refreshToken);
}

export async function initializeWorkspaceState(): Promise<WorkspaceBootstrap> {
  const session = getSessionState();
  if (!session) {
    throw new Error("platform login required");
  }

  const [bootstrap, models, skills] = await Promise.all([
    fetchBootstrap(session.accessToken),
    fetchModels(session.accessToken),
    fetchSkillCatalog(session.accessToken),
  ]);

  if (models.items.length === 0) {
    throw new Error("platform models unavailable");
  }

  const defaultModel = models.items.find((item) => item.isDefault);
  if (!defaultModel) {
    throw new Error("platform default model missing");
  }

  const workspace: WorkspaceBootstrap = {
    ...bootstrap,
    models: models.items,
    selectedModelId: defaultModel.id,
    skills: skills.items,
  };

  setWorkspaceBootstrap(workspace);
  return workspace;
}

export async function refreshWorkspaceSession(): Promise<void> {
  const session = getSessionState();
  if (!session) {
    throw new Error("platform login required");
  }

  try {
    const tokens = await refreshRequest(session.refreshToken);
    setSessionTokens(tokens.accessToken, tokens.refreshToken, {
      preserveWorkspace: true,
    });
  } catch (error) {
    clearSessionState();
    throw error;
  }
}

export function selectWorkspaceModel(modelId: string): WorkspaceBootstrap {
  const session = getSessionState();
  if (!session?.workspace) {
    throw new Error("workspace not initialized");
  }

  const model = session.workspace.models.find((item) => item.id === modelId);
  if (!model) {
    throw new Error("unauthorized model");
  }

  const workspace = {
    ...session.workspace,
    selectedModelId: modelId,
  };
  setWorkspaceBootstrap(workspace);
  return workspace;
}

export function getWorkspaceRuntime() {
  return getSessionState();
}

export function clearWorkspaceSession(): void {
  clearSessionState();
}

function isReauthError(error: unknown): boolean {
  const statusCode =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : Number.NaN;

  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  return /(^|\s)(401|403)\b/.test((error as Error)?.message || "");
}

export async function getWorkspaceAuditStatus(): Promise<AuditStatus> {
  const localStatus = getAuditStatus();
  const session = getSessionState();
  if (!session || localStatus.health === "reauth-required") {
    return localStatus;
  }

  try {
    await fetchAuditHealth(session.accessToken);
    return localStatus;
  } catch (error) {
    const message = (error as Error)?.message || "audit health check failed";
    if (isReauthError(error)) {
      markAuditReauthRequired(message);
      return getAuditStatus();
    }

    if (localStatus.health === "buffering") {
      return localStatus;
    }

    return {
      ...localStatus,
      health: "degraded",
      lastError: message,
    };
  }
}

export async function flushWorkspaceAuditEvents(): Promise<AuditStatus> {
  const session = getSessionState();
  if (!session) {
    markAuditReauthRequired("platform login required");
    return getAuditStatus();
  }

  let retriedWithRefresh = false;

  while (true) {
    const nextSession = getSessionState();
    if (!nextSession) {
      markAuditReauthRequired("platform login required");
      return getAuditStatus();
    }

    const status = await flushAuditQueue((events) =>
      postAuditEvents(nextSession.accessToken, events),
    );
    if (status.health !== "reauth-required" || retriedWithRefresh) {
      return status;
    }

    try {
      await refreshWorkspaceSession();
      retriedWithRefresh = true;
    } catch (error) {
      markAuditReauthRequired((error as Error).message);
      return getAuditStatus();
    }
  }
}
