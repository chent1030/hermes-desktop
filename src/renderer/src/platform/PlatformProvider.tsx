import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { setLocale as setSharedLocale } from "../../../shared/i18n";
import type { AuditStatus } from "../../../shared/platform/audit";
import type { WorkspaceInitStatus } from "../../../shared/platform/init";
import type { WorkspaceBootstrap } from "../../../shared/platform/contracts";

type PlatformStage = "login" | "initializing" | "workspace" | "session-recovery";

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
  initStatus?: WorkspaceInitStatus;
  sessionRecoveryReason?: string | null;
  login: (payload: LoginPayload) => Promise<void>;
  refreshSession: () => Promise<void>;
  retryInitialization: () => Promise<void>;
  logout: () => Promise<void>;
  setSelectedModel: (modelId: string) => Promise<void>;
}

export const PlatformContext = createContext<PlatformContextValue | null>(null);

function normalizeWorkspace(
  workspace: WorkspaceBootstrap,
): WorkspaceBootstrap {
  const normalizedSelectedModelId =
    workspace.selectedModelId ||
    workspace.models.find((model) => model.isDefault)?.id ||
    workspace.models[0]?.id ||
    "";

  return {
    ...workspace,
    selectedModelId: normalizedSelectedModelId,
  };
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
  const [initStatus, setInitStatus] = useState<WorkspaceInitStatus>({
    phase: "idle",
    failedPhase: null,
    lastError: null,
  });
  const [sessionRecoveryReason, setSessionRecoveryReason] = useState<string | null>(null);

  const runInitialization = useCallback(async (): Promise<void> => {
    setStage("initializing");
    setInitError(null);
    setSessionRecoveryReason(null);

    try {
      const nextWorkspace = normalizeWorkspace(
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
      setSessionRecoveryReason(null);
      await window.hermesAPI.loginTenant(payload);
      await runInitialization();
    },
    [runInitialization],
  );

  const resetToLogin = useCallback((): void => {
    setAudit(null);
    setWorkspace(null);
    setInitError(null);
    setSessionRecoveryReason(null);
    setInitStatus({
      phase: "idle",
      failedPhase: null,
      lastError: null,
    });
    setStage("login");
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    await window.hermesAPI.logoutTenant();
    resetToLogin();
  }, [resetToLogin]);

  const startSessionRecovery = useCallback(
    async (reason: string): Promise<void> => {
      setSessionRecoveryReason(reason);
      setStage("session-recovery");

      try {
        await window.hermesAPI.logoutTenant();
      } finally {
        resetToLogin();
      }
    },
    [resetToLogin],
  );

  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      await window.hermesAPI.refreshTenantSession();
    } catch (error) {
      const reason = (error as Error).message || "refresh token expired";
      await startSessionRecovery(reason);
      throw error;
    }
  }, [startSessionRecovery]);

  const setSelectedModel = useCallback(async (modelId: string): Promise<void> => {
    const nextWorkspace = await window.hermesAPI.selectWorkspaceModel(modelId);
    setWorkspace(nextWorkspace);
  }, []);

  useEffect(() => {
    if (
      stage !== "initializing" ||
      typeof window.hermesAPI.getWorkspaceInitStatus !== "function"
    ) {
      return;
    }

    let active = true;
    const syncInitStatus = async (): Promise<void> => {
      const nextInitStatus = await window.hermesAPI.getWorkspaceInitStatus();
      if (!active) return;
      setInitStatus(nextInitStatus);
    };

    void syncInitStatus();
    const timer = window.setInterval(() => {
      void syncInitStatus();
    }, 300);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [stage]);

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
        await startSessionRecovery(nextAudit.lastError || "platform session expired");
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
  }, [stage, startSessionRecovery]);

  useEffect(() => {
    if (
      stage !== "workspace" ||
      typeof window.hermesAPI.refreshTenantSession !== "function"
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshSession();
    }, 5 * 60 * 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [stage, refreshSession]);

  const value = useMemo<PlatformContextValue>(
    () => ({
      stage,
      workspace,
      audit,
      initError,
      initStatus,
      sessionRecoveryReason,
      login,
      refreshSession,
      retryInitialization: runInitialization,
      logout,
      setSelectedModel,
    }),
    [
      stage,
      workspace,
      audit,
      initError,
      initStatus,
      sessionRecoveryReason,
      login,
      refreshSession,
      runInitialization,
      logout,
      setSelectedModel,
    ],
  );

  return (
    <PlatformContext.Provider value={value}>
      {children}
    </PlatformContext.Provider>
  );
}
