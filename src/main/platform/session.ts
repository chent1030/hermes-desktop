import type { WorkspaceBootstrap } from "../../shared/platform/contracts";

export interface PlatformSessionState {
  accessToken: string;
  refreshToken: string;
  workspace: WorkspaceBootstrap | null;
}

let state: PlatformSessionState | null = null;

export function setSessionTokens(
  accessToken: string,
  refreshToken: string,
): void {
  state = {
    accessToken,
    refreshToken,
    workspace: null,
  };
}

export function getSessionState(): PlatformSessionState | null {
  return state;
}

export function setWorkspaceBootstrap(workspace: WorkspaceBootstrap): void {
  if (!state) {
    throw new Error("platform session missing");
  }

  state = {
    ...state,
    workspace,
  };
}

export function clearSessionState(): void {
  state = null;
}
