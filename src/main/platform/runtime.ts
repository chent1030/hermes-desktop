import type {
  TenantLoginInput,
  WorkspaceBootstrap,
} from "../../shared/platform/contracts";
import {
  fetchBootstrap,
  fetchModels,
  fetchSkillCatalog,
  loginRequest,
  refreshRequest,
} from "./client";
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
    setSessionTokens(tokens.accessToken, tokens.refreshToken);
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
