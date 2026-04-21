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
  options: { preserveWorkspace?: boolean } = {},
): void {
  state = {
    accessToken,
    refreshToken,
    workspace: options.preserveWorkspace ? state?.workspace || null : null,
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
