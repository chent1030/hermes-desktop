import { useEffect, useMemo, useState } from "react";
import "./app.css";

const API_BASE_URL = "http://127.0.0.1:8080";

type HealthStatus = "checking" | "online" | "offline";

type RoleCode = "super_admin" | "tenant_admin" | "tenant_user";

interface SessionTenant {
  id: number;
  code: string;
  name: string;
}

interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roleCode: RoleCode;
  scopeType?: "platform" | "tenant";
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tenant: SessionTenant | null;
  user: SessionUser;
}

interface TenantRecord {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

interface AdminAccountRecord {
  id: number;
  scopeType: "platform" | "tenant";
  tenant: SessionTenant | null;
  username: string;
  displayName: string;
  roleCode: RoleCode;
  isActive: boolean;
}

interface ModelProfileRecord {
  id: string;
  scopeType: "global" | "tenant";
  tenant: SessionTenant | null;
  provider: string;
  model: string;
  label: string;
  baseUrl: string;
  isDefault: boolean;
  isActive: boolean;
}

interface SkillCatalogRecord {
  id: string;
  scopeType: "global" | "tenant";
  tenant: SessionTenant | null;
  name: string;
  version: string;
  description: string;
  downloadUrl: string;
  isActive: boolean;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    const message =
      typeof body.message === "string"
        ? body.message
        : `${response.status} ${response.statusText}`.trim();
    throw new Error(message);
  }

  return body as T;
}

function authHeaders(session: LoginResponse, withJson = false): HeadersInit {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    ...(withJson ? { "Content-Type": "application/json" } : {}),
  };
}

export default function App(): React.JSX.Element {
  const [tenantCode, setTenantCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [healthService, setHealthService] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [accounts, setAccounts] = useState<AdminAccountRecord[]>([]);
  const [modelProfiles, setModelProfiles] = useState<ModelProfileRecord[]>([]);
  const [skillCatalog, setSkillCatalog] = useState<SkillCatalogRecord[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [modelScope, setModelScope] = useState<"global" | "tenant">("global");
  const [skillScope, setSkillScope] = useState<"global" | "tenant">("global");
  const [tenantForm, setTenantForm] = useState({ code: "", name: "" });
  const [accountForm, setAccountForm] = useState({
    username: "",
    displayName: "",
    password: "",
    roleCode: "tenant_user" as RoleCode,
  });
  const [modelForm, setModelForm] = useState({
    provider: "openai",
    model: "",
    label: "",
    baseUrl: "",
    isDefault: true,
  });
  const [skillForm, setSkillForm] = useState({
    name: "",
    version: "",
    description: "",
    downloadUrl: "",
  });

  useEffect(() => {
    let cancelled = false;

    requestJson<{ status: string; service: string }>("/api/health", {
      method: "GET",
    })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setHealthStatus("online");
        setHealthService(payload.service);
        setHealthError(null);
      })
      .catch((error: Error) => {
        if (cancelled) {
          return;
        }
        setHealthStatus("offline");
        setHealthService(null);
        setHealthError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const healthClassName = useMemo(() => {
    if (healthStatus === "online") {
      return "platform-admin-status is-online";
    }
    if (healthStatus === "offline") {
      return "platform-admin-status is-offline";
    }
    return "platform-admin-status";
  }, [healthStatus]);

  const workspaceTitle = useMemo(() => {
    if (!session) {
      return null;
    }
    return session.user.roleCode === "super_admin"
      ? "Platform workspace"
      : "Tenant workspace";
  }, [session]);

  const fetchSuperAdminModelProfiles = async (
    nextSession: LoginResponse,
    scope: "global" | "tenant",
    tenantId: number | null,
  ): Promise<ModelProfileRecord[]> => {
    if (scope === "tenant" && tenantId) {
      return requestJson<ModelProfileRecord[]>(
        `/api/admin/model-profiles?tenantId=${tenantId}`,
        {
          method: "GET",
          headers: authHeaders(nextSession),
        },
      );
    }
    return requestJson<ModelProfileRecord[]>("/api/admin/model-profiles", {
      method: "GET",
      headers: authHeaders(nextSession),
    });
  };

  const fetchSuperAdminSkillCatalog = async (
    nextSession: LoginResponse,
    scope: "global" | "tenant",
    tenantId: number | null,
  ): Promise<SkillCatalogRecord[]> => {
    if (scope === "tenant" && tenantId) {
      return requestJson<SkillCatalogRecord[]>(
        `/api/admin/skills/catalog?tenantId=${tenantId}`,
        {
          method: "GET",
          headers: authHeaders(nextSession),
        },
      );
    }
    return requestJson<SkillCatalogRecord[]>("/api/admin/skills/catalog", {
      method: "GET",
      headers: authHeaders(nextSession),
    });
  };

  const loadWorkspace = async (nextSession: LoginResponse, preferredTenantId?: number | null) => {
    setIsLoadingWorkspace(true);
    setWorkspaceError(null);

    try {
      if (nextSession.user.roleCode === "super_admin") {
        const nextTenants = await requestJson<TenantRecord[]>("/api/admin/tenants", {
          method: "GET",
          headers: authHeaders(nextSession),
        });
        setTenants(nextTenants);

        const nextSelectedTenantId =
          preferredTenantId ?? selectedTenantId ?? nextTenants[0]?.id ?? null;
        setSelectedTenantId(nextSelectedTenantId);

        if (nextSelectedTenantId) {
          const nextAccounts = await requestJson<AdminAccountRecord[]>(
            `/api/admin/accounts?tenantId=${nextSelectedTenantId}`,
            {
              method: "GET",
              headers: authHeaders(nextSession),
            },
          );
          setAccounts(nextAccounts);
        } else {
          setAccounts([]);
        }

        const nextModelScope =
          modelScope === "tenant" && nextSelectedTenantId ? "tenant" : "global";
        const nextSkillScope =
          skillScope === "tenant" && nextSelectedTenantId ? "tenant" : "global";
        setModelScope(nextModelScope);
        setSkillScope(nextSkillScope);
        const [nextModels, nextSkills] = await Promise.all([
          fetchSuperAdminModelProfiles(nextSession, nextModelScope, nextSelectedTenantId),
          fetchSuperAdminSkillCatalog(nextSession, nextSkillScope, nextSelectedTenantId),
        ]);
        setModelProfiles(nextModels);
        setSkillCatalog(nextSkills);
        return;
      }

      const tenantAccounts = await requestJson<AdminAccountRecord[]>(
        "/api/admin/tenant/accounts",
        {
          method: "GET",
          headers: authHeaders(nextSession),
        },
      );
      setTenants([]);
      setSelectedTenantId(nextSession.tenant?.id ?? null);
      setAccounts(tenantAccounts);
      const [tenantModels, tenantSkills] = await Promise.all([
        requestJson<ModelProfileRecord[]>("/api/admin/tenant/model-profiles", {
          method: "GET",
          headers: authHeaders(nextSession),
        }),
        requestJson<SkillCatalogRecord[]>("/api/admin/tenant/skills/catalog", {
          method: "GET",
          headers: authHeaders(nextSession),
        }),
      ]);
      setModelProfiles(tenantModels);
      setSkillCatalog(tenantSkills);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Workspace load failed");
    } finally {
      setIsLoadingWorkspace(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);
    setSessionNotice(null);

    try {
      const payload = await requestJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantCode,
          username,
          password,
        }),
      });
      setSession(payload);
      setSessionNotice("Session active");
      await loadWorkspace(payload, payload.tenant?.id ?? null);
    } catch (error) {
      setSession(null);
      setAccounts([]);
      setTenants([]);
      setModelProfiles([]);
      setSkillCatalog([]);
      setLoginError(error instanceof Error ? error.message : "Unknown login error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRefreshSession = async () => {
    if (!session) {
      return;
    }

    setIsRefreshingSession(true);
    setLoginError(null);
    setSessionNotice(null);

    try {
      const payload = await requestJson<LoginResponse>("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refreshToken: session.refreshToken,
        }),
      });
      setSession(payload);
      setSessionNotice("Session refreshed");
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Unknown refresh error");
    } finally {
      setIsRefreshingSession(false);
    }
  };

  const handleSelectTenant = async (tenantId: number) => {
    if (!session || session.user.roleCode !== "super_admin") {
      return;
    }
    setSelectedTenantId(tenantId);
    await loadWorkspace(session, tenantId);
  };

  const handleSelectModelScope = async (scope: "global" | "tenant") => {
    if (!session || session.user.roleCode !== "super_admin") {
      return;
    }
    const nextScope = scope === "tenant" && !selectedTenantId ? "global" : scope;
    setModelScope(nextScope);
    try {
      const nextModels = await fetchSuperAdminModelProfiles(
        session,
        nextScope,
        selectedTenantId,
      );
      setModelProfiles(nextModels);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Load model profiles failed");
    }
  };

  const handleSelectSkillScope = async (scope: "global" | "tenant") => {
    if (!session || session.user.roleCode !== "super_admin") {
      return;
    }
    const nextScope = scope === "tenant" && !selectedTenantId ? "global" : scope;
    setSkillScope(nextScope);
    try {
      const nextSkills = await fetchSuperAdminSkillCatalog(
        session,
        nextScope,
        selectedTenantId,
      );
      setSkillCatalog(nextSkills);
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Load skill catalog failed");
    }
  };

  const handleCreateTenant = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || session.user.roleCode !== "super_admin") {
      return;
    }

    setWorkspaceError(null);
    try {
      const created = await requestJson<TenantRecord>("/api/admin/tenants", {
        method: "POST",
        headers: authHeaders(session, true),
        body: JSON.stringify(tenantForm),
      });
      setTenantForm({ code: "", name: "" });
      setTenants((current) => [created, ...current]);
      setSelectedTenantId(created.id);
      setAccounts([]);
      setSessionNotice("Tenant created");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Create tenant failed");
    }
  };

  const handleCreateAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    const path =
      session.user.roleCode === "super_admin"
        ? "/api/admin/accounts"
        : "/api/admin/tenant/accounts";
    const payload =
      session.user.roleCode === "super_admin"
        ? { ...accountForm, tenantId: selectedTenantId }
        : { ...accountForm, roleCode: "tenant_user" };

    try {
      const created = await requestJson<AdminAccountRecord>(path, {
        method: "POST",
        headers: authHeaders(session, true),
        body: JSON.stringify(payload),
      });
      setAccounts((current) => [created, ...current]);
      setAccountForm({
        username: "",
        displayName: "",
        password: "",
        roleCode: "tenant_user",
      });
      setSessionNotice("Account created");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Create account failed");
    }
  };

  const handleDeactivateAccount = async (accountId: number) => {
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    const path =
      session.user.roleCode === "super_admin"
        ? `/api/admin/accounts/${accountId}/deactivate`
        : `/api/admin/tenant/accounts/${accountId}/deactivate`;

    try {
      await requestJson<{ status: string }>(path, {
        method: "POST",
        headers: authHeaders(session),
      });
      setAccounts((current) =>
        current.map((account) =>
          account.id === accountId ? { ...account, isActive: false } : account,
        ),
      );
      setSessionNotice("Account deactivated");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Deactivate account failed");
    }
  };

  const handleDeactivateTenant = async (tenantId: number) => {
    if (!session || session.user.roleCode !== "super_admin") {
      return;
    }

    setWorkspaceError(null);
    try {
      await requestJson<{ status: string }>(`/api/admin/tenants/${tenantId}/deactivate`, {
        method: "POST",
        headers: authHeaders(session),
      });
      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === tenantId ? { ...tenant, isActive: false } : tenant,
        ),
      );
      setSessionNotice("Tenant deactivated");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Deactivate tenant failed");
    }
  };

  const handleCreateModelProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    try {
      const isSuperAdmin = session.user.roleCode === "super_admin";
      const path = isSuperAdmin
        ? "/api/admin/model-profiles"
        : "/api/admin/tenant/model-profiles";
      const payload = isSuperAdmin
        ? {
            ...modelForm,
            tenantId: modelScope === "tenant" ? selectedTenantId : null,
          }
        : modelForm;
      const created = await requestJson<ModelProfileRecord>(path, {
        method: "POST",
        headers: authHeaders(session, true),
        body: JSON.stringify(payload),
      });
      setModelProfiles((current) => {
        const next = current.map((item) =>
          created.isDefault ? { ...item, isDefault: false } : item,
        );
        return [created, ...next];
      });
      setModelForm({
        provider: "openai",
        model: "",
        label: "",
        baseUrl: "",
        isDefault: true,
      });
      setSessionNotice("Model profile created");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Create model profile failed");
    }
  };

  const handleDeactivateModelProfile = async (modelId: string) => {
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    try {
      const path =
        session.user.roleCode === "super_admin"
          ? `/api/admin/model-profiles/${modelId}/deactivate`
          : `/api/admin/tenant/model-profiles/${modelId}/deactivate`;
      await requestJson<{ status: string }>(path, {
        method: "POST",
        headers: authHeaders(session),
      });
      setModelProfiles((current) =>
        current.map((item) =>
          item.id === modelId ? { ...item, isActive: false } : item,
        ),
      );
      setSessionNotice("Model profile deactivated");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Deactivate model profile failed");
    }
  };

  const handleCreateSkillCatalog = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    try {
      const isSuperAdmin = session.user.roleCode === "super_admin";
      const path = isSuperAdmin ? "/api/admin/skills/catalog" : "/api/admin/tenant/skills/catalog";
      const payload = isSuperAdmin
        ? {
            ...skillForm,
            tenantId: skillScope === "tenant" ? selectedTenantId : null,
          }
        : skillForm;
      const created = await requestJson<SkillCatalogRecord>(path, {
        method: "POST",
        headers: authHeaders(session, true),
        body: JSON.stringify(payload),
      });
      setSkillCatalog((current) => [created, ...current]);
      setSkillForm({
        name: "",
        version: "",
        description: "",
        downloadUrl: "",
      });
      setSessionNotice("Skill catalog item created");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Create skill catalog failed");
    }
  };

  const handleDeactivateSkillCatalog = async (skillId: string) => {
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    try {
      const path =
        session.user.roleCode === "super_admin"
          ? `/api/admin/skills/catalog/${skillId}/deactivate`
          : `/api/admin/tenant/skills/catalog/${skillId}/deactivate`;
      await requestJson<{ status: string }>(path, {
        method: "POST",
        headers: authHeaders(session),
      });
      setSkillCatalog((current) =>
        current.map((item) =>
          item.id === skillId ? { ...item, isActive: false } : item,
        ),
      );
      setSessionNotice("Skill catalog item deactivated");
    } catch (error) {
      setWorkspaceError(error instanceof Error ? error.message : "Deactivate skill failed");
    }
  };

  return (
    <main className="platform-admin-app">
      <section className="platform-admin-hero">
        <div>
          <p className="platform-admin-eyebrow">Stage 1 RBAC Slice</p>
          <h1>Hermes Platform Admin</h1>
          <p className="platform-admin-description">
            Platform-ready admin console for bootstrap super admins, tenant boundaries,
            tenant-account operations, and role-scoped management views.
          </p>
        </div>
        <p className={healthClassName}>
          {healthStatus === "online" ? (
            <>
              <span>Backend online</span>
              <span className="platform-admin-status-detail">
                · {healthService || "platform-admin-backend"}
              </span>
            </>
          ) : null}
          {healthStatus === "offline" ? (
            <>
              <span>Backend offline</span>
              <span className="platform-admin-status-detail">· {healthError}</span>
            </>
          ) : null}
          {healthStatus === "checking" ? <span>Checking backend reachability...</span> : null}
        </p>
      </section>

      <section className="platform-admin-layout">
        <article className="platform-admin-panel">
          <div className="platform-admin-panel-header">
            <div>
              <p className="platform-admin-section-label">Admin login</p>
              <h2>Sign in to the shared platform</h2>
            </div>
            <p className="platform-admin-panel-note">
              Leave tenant code empty when signing in as a platform super admin.
            </p>
          </div>

          <form className="platform-admin-form" onSubmit={handleSubmit}>
            <label className="platform-admin-field">
              <span>Tenant code</span>
              <input
                value={tenantCode}
                onChange={(event) => setTenantCode(event.target.value)}
                placeholder="acme"
              />
            </label>

            <label className="platform-admin-field">
              <span>Username</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
              />
            </label>

            <label className="platform-admin-field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button className="platform-admin-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {loginError ? <p className="platform-admin-error">{loginError}</p> : null}
          {workspaceError ? <p className="platform-admin-error">{workspaceError}</p> : null}

          {session ? (
            <section className="platform-admin-session" aria-label="login-session">
              <h3>Signed in as {session.user.displayName}</h3>
              <p>
                Scope: {session.tenant
                  ? `${session.tenant.name} (${session.tenant.code})`
                  : "Platform scope"}
              </p>
              <p>Account: {session.user.username}</p>
              <p>Role: {session.user.roleCode}</p>
              <div className="platform-admin-session-actions">
                <button
                  className="platform-admin-secondary-button"
                  type="button"
                  onClick={handleRefreshSession}
                  disabled={isRefreshingSession}
                >
                  {isRefreshingSession ? "Refreshing..." : "Refresh session"}
                </button>
                {sessionNotice ? (
                  <span className="platform-admin-session-notice">{sessionNotice}</span>
                ) : null}
              </div>
            </section>
          ) : null}
        </article>

        <section className="platform-admin-workspace" aria-label="admin-workspace">
          <div className="platform-admin-workspace-header">
            <div>
              <p className="platform-admin-section-label">Workspace</p>
              <h2>{workspaceTitle || "Management modules"}</h2>
            </div>
            {isLoadingWorkspace ? <p className="platform-admin-panel-note">Loading...</p> : null}
          </div>

          {!session ? (
            <section className="platform-admin-grid" aria-label="phase-1-modules">
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">Next</p>
                <h2>Tenants & RBAC</h2>
                <p>Build tenant isolation, admin accounts, and permission boundaries first.</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">Next</p>
                <h2>Config Center</h2>
                <p>Deliver platform-authorized model profiles down to desktop clients.</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">Next</p>
                <h2>Skill Hub</h2>
                <p>Reserve the registry for global skills and tenant-owned skill catalogs.</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">Next</p>
                <h2>Audit Center</h2>
                <p>Keep login, runtime, and compliance events ready for full audit closure.</p>
              </article>
            </section>
          ) : null}

          {session?.user.roleCode === "super_admin" ? (
            <div className="platform-admin-workspace-grid">
              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Tenant control</p>
                <h3>Create tenant</h3>
                <form className="platform-admin-form" onSubmit={handleCreateTenant}>
                  <label className="platform-admin-field">
                    <span>Tenant code</span>
                    <input
                      value={tenantForm.code}
                      onChange={(event) =>
                        setTenantForm((current) => ({ ...current, code: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Tenant name</span>
                    <input
                      value={tenantForm.name}
                      onChange={(event) =>
                        setTenantForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create tenant
                  </button>
                </form>

                <div className="platform-admin-list">
                  {tenants.map((tenant) => (
                    <button
                      key={tenant.id}
                      type="button"
                      className={`platform-admin-list-item${
                        selectedTenantId === tenant.id ? " is-selected" : ""
                      }`}
                      onClick={() => handleSelectTenant(tenant.id)}
                    >
                      <span>{tenant.name}</span>
                      <small>{tenant.code}</small>
                      <small>{tenant.isActive ? "active" : "inactive"}</small>
                    </button>
                  ))}
                </div>
                {selectedTenantId ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => handleDeactivateTenant(selectedTenantId)}
                  >
                    Deactivate tenant
                  </button>
                ) : null}
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Tenant account control</p>
                <h3>Create tenant account</h3>
                <form className="platform-admin-form" onSubmit={handleCreateAccount}>
                  <label className="platform-admin-field">
                    <span>Username</span>
                    <input
                      value={accountForm.username}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, username: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Display name</span>
                    <input
                      value={accountForm.displayName}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={accountForm.password}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Role</span>
                    <select
                      value={accountForm.roleCode}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          roleCode: event.target.value as RoleCode,
                        }))
                      }
                    >
                      <option value="tenant_admin">Create tenant admin</option>
                      <option value="tenant_user">Create tenant user</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create account
                  </button>
                </form>

                <div className="platform-admin-list">
                  {accounts.map((account) => (
                    <div key={account.id} className="platform-admin-list-item is-static">
                      <span>{account.displayName}</span>
                      <small>{account.username}</small>
                      <small>{account.roleCode}</small>
                      <small>{account.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateAccount(account.id)}
                      >
                        Deactivate account
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Config center</p>
                <h3>Model profile control</h3>
                <label className="platform-admin-field">
                  <span>Model scope</span>
                  <select
                    value={modelScope}
                    onChange={(event) =>
                      void handleSelectModelScope(event.target.value as "global" | "tenant")
                    }
                  >
                    <option value="global">Global models</option>
                    {selectedTenantId ? (
                      <option value="tenant">Selected tenant models</option>
                    ) : null}
                  </select>
                </label>
                <form className="platform-admin-form" onSubmit={handleCreateModelProfile}>
                  <label className="platform-admin-field">
                    <span>Provider</span>
                    <input
                      value={modelForm.provider}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, provider: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Model ID</span>
                    <input
                      value={modelForm.model}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, model: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Label</span>
                    <input
                      value={modelForm.label}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Base URL</span>
                    <input
                      value={modelForm.baseUrl}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Default</span>
                    <select
                      value={modelForm.isDefault ? "true" : "false"}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          isDefault: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="true">Default model</option>
                      <option value="false">Optional model</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create model profile
                  </button>
                </form>

                <div className="platform-admin-list">
                  {modelProfiles.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.label}</span>
                      <small>{item.provider}</small>
                      <small>{item.model}</small>
                      <small>{item.isDefault ? "default" : "optional"}</small>
                      <small>{item.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateModelProfile(item.id)}
                      >
                        Deactivate model
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Skill hub</p>
                <h3>Skill catalog control</h3>
                <label className="platform-admin-field">
                  <span>Skill scope</span>
                  <select
                    value={skillScope}
                    onChange={(event) =>
                      void handleSelectSkillScope(event.target.value as "global" | "tenant")
                    }
                  >
                    <option value="global">Global skills</option>
                    {selectedTenantId ? (
                      <option value="tenant">Selected tenant skills</option>
                    ) : null}
                  </select>
                </label>
                <form className="platform-admin-form" onSubmit={handleCreateSkillCatalog}>
                  <label className="platform-admin-field">
                    <span>Name</span>
                    <input
                      value={skillForm.name}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Version</span>
                    <input
                      value={skillForm.version}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, version: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Description</span>
                    <input
                      value={skillForm.description}
                      onChange={(event) =>
                        setSkillForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Download URL</span>
                    <input
                      value={skillForm.downloadUrl}
                      onChange={(event) =>
                        setSkillForm((current) => ({
                          ...current,
                          downloadUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create skill
                  </button>
                </form>

                <div className="platform-admin-list">
                  {skillCatalog.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.name}</span>
                      <small>{item.version}</small>
                      <small>{item.scopeType}</small>
                      <small>{item.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateSkillCatalog(item.id)}
                      >
                        Deactivate skill
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}

          {session?.user.roleCode === "tenant_admin" ? (
            <div className="platform-admin-workspace-grid is-single-column">
              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Tenant account control</p>
                <h3>Create tenant user</h3>
                <form className="platform-admin-form" onSubmit={handleCreateAccount}>
                  <label className="platform-admin-field">
                    <span>Username</span>
                    <input
                      value={accountForm.username}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, username: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Display name</span>
                    <input
                      value={accountForm.displayName}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={accountForm.password}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create tenant user
                  </button>
                </form>

                <div className="platform-admin-list">
                  {accounts.map((account) => (
                    <div key={account.id} className="platform-admin-list-item is-static">
                      <span>{account.displayName}</span>
                      <small>{account.username}</small>
                      <small>{account.roleCode}</small>
                      <small>{account.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateAccount(account.id)}
                      >
                        Deactivate account
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Tenant config center</p>
                <h3>Tenant model profiles</h3>
                <form className="platform-admin-form" onSubmit={handleCreateModelProfile}>
                  <label className="platform-admin-field">
                    <span>Provider</span>
                    <input
                      value={modelForm.provider}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, provider: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Model ID</span>
                    <input
                      value={modelForm.model}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, model: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Label</span>
                    <input
                      value={modelForm.label}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Base URL</span>
                    <input
                      value={modelForm.baseUrl}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Default</span>
                    <select
                      value={modelForm.isDefault ? "true" : "false"}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          isDefault: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="true">Default model</option>
                      <option value="false">Optional model</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create model profile
                  </button>
                </form>

                <div className="platform-admin-list">
                  {modelProfiles.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.label}</span>
                      <small>{item.provider}</small>
                      <small>{item.model}</small>
                      <small>{item.isDefault ? "default" : "optional"}</small>
                      <small>{item.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateModelProfile(item.id)}
                      >
                        Deactivate model
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">Tenant skill hub</p>
                <h3>Tenant skill catalog</h3>
                <form className="platform-admin-form" onSubmit={handleCreateSkillCatalog}>
                  <label className="platform-admin-field">
                    <span>Name</span>
                    <input
                      value={skillForm.name}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Version</span>
                    <input
                      value={skillForm.version}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, version: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Description</span>
                    <input
                      value={skillForm.description}
                      onChange={(event) =>
                        setSkillForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>Download URL</span>
                    <input
                      value={skillForm.downloadUrl}
                      onChange={(event) =>
                        setSkillForm((current) => ({
                          ...current,
                          downloadUrl: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    Create skill
                  </button>
                </form>

                <div className="platform-admin-list">
                  {skillCatalog.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.name}</span>
                      <small>{item.version}</small>
                      <small>{item.scopeType}</small>
                      <small>{item.isActive ? "active" : "inactive"}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateSkillCatalog(item.id)}
                      >
                        Deactivate skill
                      </button>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
