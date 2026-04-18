import { useEffect, useMemo, useState } from "react";
import "./app.css";

const API_BASE_URL = "http://127.0.0.1:8080";

const modules = [
  {
    title: "Tenants & RBAC",
    description: "Build tenant isolation, admin accounts, and permission boundaries first.",
  },
  {
    title: "Config Center",
    description: "Deliver platform-authorized model profiles down to desktop clients.",
  },
  {
    title: "Skill Hub",
    description: "Reserve the registry for global skills and tenant-owned skill catalogs.",
  },
  {
    title: "Audit Center",
    description: "Keep login, runtime, and compliance events ready for full audit closure.",
  },
] as const;

type HealthStatus = "checking" | "online" | "offline";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tenant: {
    id: number;
    code: string;
    name: string;
  };
  user: {
    id: number;
    username: string;
    displayName: string;
    roleCode: string;
  };
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

export default function App(): React.JSX.Element {
  const [tenantCode, setTenantCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [healthStatus, setHealthStatus] = useState<HealthStatus>("checking");
  const [healthService, setHealthService] = useState<string | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingSession, setIsRefreshingSession] = useState(false);
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

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
    } catch (error) {
      setSession(null);
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

  return (
    <main className="platform-admin-app">
      <section className="platform-admin-hero">
        <div>
          <p className="platform-admin-eyebrow">Stage 1 Auth Slice</p>
          <h1>Hermes Platform Admin</h1>
          <p className="platform-admin-description">
            First business slice for the platform console: tenant-aware account login,
            PostgreSQL-backed identity lookup, and a stable admin entry for the next
            model/config/skill phases.
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
              Session tokens stay in memory only for this stage.
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

          {session ? (
            <section className="platform-admin-session" aria-label="login-session">
              <h3>Signed in as {session.user.displayName}</h3>
              <p>Tenant: {session.tenant.name} ({session.tenant.code})</p>
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

        <section className="platform-admin-grid" aria-label="phase-1-modules">
          {modules.map((module) => (
            <article key={module.title} className="platform-admin-card">
              <p className="platform-admin-section-label">Next</p>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
