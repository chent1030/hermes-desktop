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
  const [selectedTenantId, setSelectedTenantId] = useState<number | null>(null);
  const [tenantForm, setTenantForm] = useState({ code: "", name: "" });
  const [accountForm, setAccountForm] = useState({
    username: "",
    displayName: "",
    password: "",
    roleCode: "tenant_user" as RoleCode,
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
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
