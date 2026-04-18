import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import type { AuditStatus } from "../../../shared/platform/audit";
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
  audit: AuditStatus | null;
  initError: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  retryInitialization: () => Promise<void>;
  logout: () => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
}

export const PlatformContext = createContext<PlatformContextValue | null>(null);

function ensureWorkspaceReady(
  workspace: WorkspaceBootstrap,
): WorkspaceBootstrap {
  if (workspace.models.length === 0) {
    throw new Error("platform models unavailable");
  }

  const defaultModel = workspace.models.find((model) => model.isDefault);
  if (!defaultModel) {
    throw new Error("platform default model missing");
  }

  return workspace;
}

export function PlatformProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [stage, setStage] = useState<PlatformStage>("login");
  const [workspace, setWorkspace] = useState<WorkspaceBootstrap | null>(null);
  const [audit, setAudit] = useState<AuditStatus | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const runInitialization = useCallback(async (): Promise<void> => {
    setStage("initializing");
    setInitError(null);

    try {
      const nextWorkspace = ensureWorkspaceReady(
        await window.hermesAPI.initializeWorkspace(),
      );
      setSharedLocale(nextWorkspace.locale);
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
    setAudit(null);
    setWorkspace(null);
    setInitError(null);
    setStage("login");
  }, []);

  const setSelectedModel = useCallback(async (modelId: string): Promise<void> => {
    const nextWorkspace = await window.hermesAPI.selectWorkspaceModel(modelId);
    setWorkspace(nextWorkspace);
  }, []);

  useEffect(() => {
    if (stage !== "workspace" || typeof window.hermesAPI.getAuditStatus !== "function") {
      return;
    }

    let active = true;
    const syncAudit = async (): Promise<void> => {
      const nextAudit = await window.hermesAPI.getAuditStatus();
      if (!active) return;
      setAudit(nextAudit);
      if (nextAudit.health === "reauth-required") {
        await logout();
      }
    };

    void syncAudit();
    const timer = window.setInterval(() => {
      void syncAudit();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [logout, stage]);

  useEffect(() => {
    if (
      stage !== "workspace" ||
      typeof window.hermesAPI.refreshTenantSession !== "function"
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      window.hermesAPI.refreshTenantSession().catch(() => {
        void logout();
      });
    }, 5 * 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [logout, stage]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      stage,
      workspace,
      audit,
      initError,
      login,
      retryInitialization: runInitialization,
      logout,
      setSelectedModel,
    }),
    [stage, workspace, audit, initError, login, runInitialization, logout, setSelectedModel],
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
