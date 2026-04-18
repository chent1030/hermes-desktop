import type { AuditStatus } from "../../shared/platform/audit";
import type {
  WorkspaceInitPhase,
  WorkspaceInitStatus,
} from "../../shared/platform/init";
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

let initStatus: WorkspaceInitStatus = {
  phase: "idle",
  lastError: null,
  failedPhase: null,
};

function setInitStatus(
  phase: WorkspaceInitPhase,
  options: {
    lastError?: string | null;
    failedPhase?: WorkspaceInitStatus["failedPhase"];
  } = {},
): void {
  initStatus = {
    phase,
    lastError: options.lastError ?? null,
    failedPhase: options.failedPhase ?? null,
  };
}

export function getWorkspaceInitStatus(): WorkspaceInitStatus {
  return initStatus;
}

export async function loginWithPassword(
  input: TenantLoginInput,
): Promise<void> {
  const tokens = await loginRequest(input);
  setSessionTokens(tokens.accessToken, tokens.refreshToken);
  setInitStatus("login-complete");
}

export async function initializeWorkspaceState(): Promise<WorkspaceBootstrap> {
  const session = getSessionState();
  if (!session) {
    throw new Error("platform login required");
  }

  setInitStatus("bootstrap");
  let bootstrap: Awaited<ReturnType<typeof fetchBootstrap>>;
  try {
    bootstrap = await fetchBootstrap(session.accessToken);
  } catch (error) {
    const message = (error as Error).message;
    setInitStatus("failed", {
      failedPhase: "bootstrap",
      lastError: message,
    });
    throw error;
  }

  setInitStatus("models");
  let models: Awaited<ReturnType<typeof fetchModels>>;
  try {
    models = await fetchModels(session.accessToken);
  } catch (error) {
    const message = (error as Error).message;
    setInitStatus("failed", {
      failedPhase: "models",
      lastError: message,
    });
    throw error;
  }

  if (models.items.length === 0) {
    setInitStatus("failed", {
      failedPhase: "models",
      lastError: "platform models unavailable",
    });
    throw new Error("platform models unavailable");
  }

  const defaultModel = models.items.find((item) => item.isDefault);
  if (!defaultModel) {
    setInitStatus("failed", {
      failedPhase: "models",
      lastError: "platform default model missing",
    });
    throw new Error("platform default model missing");
  }

  setInitStatus("skills");
  let skills: Awaited<ReturnType<typeof fetchSkillCatalog>>;
  try {
    skills = await fetchSkillCatalog(session.accessToken);
  } catch (error) {
    const message = (error as Error).message;
    setInitStatus("failed", {
      failedPhase: "skills",
      lastError: message,
    });
    throw error;
  }

  const workspace: WorkspaceBootstrap = {
    ...bootstrap,
    models: models.items,
    selectedModelId: defaultModel.id,
    skills: skills.items,
  };

  setWorkspaceBootstrap(workspace);
  setInitStatus("completed");
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
  setInitStatus("idle");
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
    return {
      ...localStatus,
      remoteHealth: "healthy",
      health:
        localStatus.localHealth === "reauth-required"
          ? "reauth-required"
          : localStatus.localHealth === "buffering"
            ? "buffering"
            : localStatus.localHealth === "degraded"
              ? "degraded"
              : "healthy",
    };
  } catch (error) {
    const message = (error as Error)?.message || "audit health check failed";
    if (isReauthError(error)) {
      markAuditReauthRequired(message);
      return {
        ...getAuditStatus(),
        remoteHealth: "reauth-required",
        health: "reauth-required",
      };
    }

    if (localStatus.health === "buffering") {
      return {
        ...localStatus,
        remoteHealth: "degraded",
        health: "buffering",
        lastError: message,
      };
    }

    return {
      ...localStatus,
      localHealth: localStatus.localHealth,
      remoteHealth: "degraded",
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
