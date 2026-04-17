import { createContext, useCallback, useMemo, useState } from "react";
import type { WorkspaceBootstrap } from "../../../shared/platform/contracts";

type PlatformStage = "login" | "initializing" | "workspace";

interface LoginPayload {
  tenantCode: string;
  username: string;
  password: string;
}

interface PlatformContextValue {
  stage: PlatformStage;
  workspace: WorkspaceBootstrap | null;
  initError: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  retryInitialization: () => Promise<void>;
  logout: () => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
}

export const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [stage, setStage] = useState<PlatformStage>("login");
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const runInitialization = useCallback(async (): Promise<void> => {
    setStage("initializing");
    setInitError(null);

    try {
      const nextWorkspace = await window.hermesAPI.initializeWorkspace();
      setWorkspace(nextWorkspace);
      setStage("workspace");
    } catch (error) {
      setInitError((error as Error).message);
      setStage("initializing");
    }
  }, []);

  const login = useCallback(
    async (payload: LoginPayload): Promise<void> => {
      await window.hermesAPI.loginTenant(payload);
      await runInitialization();
    },
    [runInitialization],
  );

  const logout = useCallback(async (): Promise<void> => {
    await window.hermesAPI.logoutTenant();
    setWorkspace(null);
    setInitError(null);
    setStage("login");
  }, []);

  const setSelectedModel = useCallback(async (modelId: string): Promise<void> => {
    const nextWorkspace = await window.hermesAPI.selectWorkspaceModel(modelId);
    setWorkspace(nextWorkspace);
  }, []);

  const value = useMemo<PlatformContextValue>(
    () => ({
      stage,
      workspace,
      initError,
      login,
      retryInitialization: runInitialization,
      logout,
      setSelectedModel,
    }),
    [stage, workspace, initError, login, runInitialization, logout, setSelectedModel],
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
