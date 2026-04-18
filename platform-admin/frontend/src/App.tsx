import { useEffect, useMemo, useState } from "react";
import "./app.css";
import {
  ADMIN_COPY,
  ADMIN_LOCALE_STORAGE_KEY,
  resolveAdminLocale,
  type AdminLocale,
} from "./adminI18n";

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

interface AuditActorRecord {
  id: number;
  username: string;
  displayName: string;
  roleCode: RoleCode;
}

interface AuditEventRecord {
  id: number;
  tenant: SessionTenant;
  account: AuditActorRecord;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

interface SessionSummaryRecord {
  sessionId: string;
  tenant: SessionTenant;
  lastAccount: AuditActorRecord;
  lastEventType: string;
  lastOccurredAt: string;
  eventCount: number;
  hasFailure: boolean;
  toolRunCount?: number;
  lastToolLabel?: string | null;
  lastToolSource?: string | null;
  hasToolFailure?: boolean;
}

interface AuditFilters {
  eventPrefix: string;
  eventType: string;
  occurredFrom: string;
  occurredTo: string;
  accountQuery: string;
  payloadQuery: string;
  limit: string;
}

interface SessionFilters {
  lastEventType: string;
  hasFailure: string;
  lastOccurredFrom: string;
  lastOccurredTo: string;
  limit: string;
}

interface AuditFamilySummary {
  key: "run" | "chat" | "auth" | "workspace" | "other";
  label: string;
  count: number;
}

function formatMessage(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

function isObjectBody(value: unknown): value is { message?: unknown } {
  return typeof value === "object" && value !== null;
}

async function requestJson<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const rawText = await response.text();
  const trimmedText = rawText.trim();

  if (!trimmedText) {
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`.trim());
    }
    throw new Error(`Empty JSON response from ${path}`);
  }

  let body: unknown;
  try {
    body = JSON.parse(trimmedText);
  } catch {
    throw new Error(`Invalid JSON response from ${path}`);
  }

  if (!response.ok) {
    const message =
      isObjectBody(body) && typeof body.message === "string"
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

function readPayloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function readPayloadNumber(
  payload: Record<string, unknown>,
  key: string,
): number | null {
  const value = payload[key];
  return typeof value === "number" ? value : null;
}

function buildAuditSummaryLines(
  item: AuditEventRecord,
  copy: typeof ADMIN_COPY.en,
): string[] {
  if (item.eventType.startsWith("run.tool.")) {
    const parts: string[] = [];
    const source = readPayloadString(item.payload, "source");
    const lastLabel = readPayloadString(item.payload, "lastLabel");
    const progressCount = readPayloadNumber(item.payload, "progressCount");
    const error = readPayloadString(item.payload, "error");

    if (source) {
      parts.push(formatMessage(copy.audit.summary.source, { value: source }));
    }
    if (lastLabel) {
      parts.push(formatMessage(copy.audit.summary.lastLabel, { value: lastLabel }));
    }
    if (typeof progressCount === "number") {
      parts.push(formatMessage(copy.audit.summary.progressCount, { value: progressCount }));
    }

    return [
      parts.join(" • "),
      ...(error
        ? [formatMessage(copy.audit.summary.error, { value: error })]
        : []),
    ].filter(Boolean);
  }

  if (item.eventType.startsWith("run.model.")) {
    const parts: string[] = [];
    const modelId = readPayloadString(item.payload, "modelId");
    const error = readPayloadString(item.payload, "error");

    if (modelId) {
      parts.push(formatMessage(copy.audit.summary.model, { value: modelId }));
    }
    if (error) {
      parts.push(formatMessage(copy.audit.summary.error, { value: error }));
    }

    return parts.length > 0 ? [parts.join(" • ")] : [];
  }

  if (item.eventType === "run.skill.sync.completed") {
    const installedCount = readPayloadNumber(item.payload, "installedCount");
    const downloadedCount = readPayloadNumber(item.payload, "downloadedCount");
    const brokenCount = readPayloadNumber(item.payload, "brokenCount");
    const notDownloadedCount = readPayloadNumber(item.payload, "notDownloadedCount");
    const parts: string[] = [];

    if (typeof installedCount === "number") {
      parts.push(formatMessage(copy.audit.summary.installed, { value: installedCount }));
    }
    if (typeof downloadedCount === "number") {
      parts.push(formatMessage(copy.audit.summary.downloaded, { value: downloadedCount }));
    }
    if (typeof brokenCount === "number") {
      parts.push(formatMessage(copy.audit.summary.broken, { value: brokenCount }));
    }
    if (typeof notDownloadedCount === "number") {
      parts.push(
        formatMessage(copy.audit.summary.notDownloaded, {
          value: notDownloadedCount,
        }),
      );
    }

    return parts.length > 0 ? [parts.join(" • ")] : [];
  }

  if (item.eventType.startsWith("run.skill.")) {
    const parts: string[] = [];
    const skillId = readPayloadString(item.payload, "skillId");
    const error = readPayloadString(item.payload, "error");

    if (skillId) {
      parts.push(formatMessage(copy.audit.summary.skill, { value: skillId }));
    }
    if (error) {
      parts.push(formatMessage(copy.audit.summary.error, { value: error }));
    }

    return parts.length > 0 ? [parts.join(" • ")] : [];
  }

  return [];
}

function auditFamilyKey(
  eventType: string,
): AuditFamilySummary["key"] {
  if (eventType.startsWith("run.")) {
    return "run";
  }
  if (eventType.startsWith("chat.")) {
    return "chat";
  }
  if (eventType.startsWith("auth.")) {
    return "auth";
  }
  if (eventType.startsWith("workspace.")) {
    return "workspace";
  }
  return "other";
}

export default function App(): React.JSX.Element {
  const [locale, setLocale] = useState<AdminLocale>(() => resolveAdminLocale());
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
  const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
  const [sessions, setSessions] = useState<SessionSummaryRecord[]>([]);
  const [auditFilters, setAuditFilters] = useState<AuditFilters>({
    eventPrefix: "",
    eventType: "",
    occurredFrom: "",
    occurredTo: "",
    accountQuery: "",
    payloadQuery: "",
    limit: "100",
  });
  const [sessionFilters, setSessionFilters] = useState<SessionFilters>({
    lastEventType: "",
    hasFailure: "",
    lastOccurredFrom: "",
    lastOccurredTo: "",
    limit: "100",
  });
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [sessionHasMore, setSessionHasMore] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
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
  const copy = useMemo(() => ADMIN_COPY[locale], [locale]);

  useEffect(() => {
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const resolveErrorMessage = (error: unknown, fallback: string): string => {
    if (!(error instanceof Error)) {
      return fallback;
    }

    if (error.message.startsWith("Empty JSON response from ")) {
      return formatMessage(copy.errors.emptyJson, {
        path: error.message.replace("Empty JSON response from ", ""),
      });
    }

    if (error.message.startsWith("Invalid JSON response from ")) {
      return formatMessage(copy.errors.invalidJson, {
        path: error.message.replace("Invalid JSON response from ", ""),
      });
    }

    return error.message;
  };

  const roleLabel = (roleCode: RoleCode): string => copy.roles[roleCode];

  const auditSummary = useMemo(() => {
    const counts: Record<AuditFamilySummary["key"], number> = {
      run: 0,
      chat: 0,
      auth: 0,
      workspace: 0,
      other: 0,
    };

    for (const item of auditEvents) {
      counts[auditFamilyKey(item.eventType)] += 1;
    }

    const families: AuditFamilySummary[] = [
      { key: "run", label: copy.audit.families.run, count: counts.run },
      { key: "chat", label: copy.audit.families.chat, count: counts.chat },
      { key: "auth", label: copy.audit.families.auth, count: counts.auth },
      { key: "workspace", label: copy.audit.families.workspace, count: counts.workspace },
      { key: "other", label: copy.audit.families.other, count: counts.other },
    ];

    return {
      total: auditEvents.length,
      failures: auditEvents.filter((item) => item.eventType.endsWith(".failed")).length,
      families,
    };
  }, [auditEvents, copy.audit.families]);

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
      ? copy.workspace.platformWorkspace
      : copy.workspace.tenantWorkspace;
  }, [copy.workspace.platformWorkspace, copy.workspace.tenantWorkspace, session]);

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

  const fetchSuperAdminAuditEvents = async (
    nextSession: LoginResponse,
    tenantId: number | null,
    filters: AuditFilters,
    beforeId?: number,
  ): Promise<AuditEventRecord[]> => {
    if (!tenantId) {
      return [];
    }
    const params = new URLSearchParams({
      tenantId: String(tenantId),
      limit: filters.limit || "100",
    });
    if (filters.eventPrefix.trim()) {
      params.set("eventPrefix", filters.eventPrefix.trim());
    }
    if (filters.eventType.trim()) {
      params.set("eventType", filters.eventType.trim());
    }
    if (filters.accountQuery.trim()) {
      params.set("accountQuery", filters.accountQuery.trim());
    }
    if (filters.payloadQuery.trim()) {
      params.set("payloadQuery", filters.payloadQuery.trim());
    }
    if (filters.occurredFrom) {
      params.set("occurredFrom", new Date(filters.occurredFrom).toISOString());
    }
    if (filters.occurredTo) {
      params.set("occurredTo", new Date(filters.occurredTo).toISOString());
    }
    if (typeof beforeId === "number") {
      params.set("beforeId", String(beforeId));
    }
    return requestJson<AuditEventRecord[]>(`/api/admin/audit/events?${params.toString()}`, {
      method: "GET",
      headers: authHeaders(nextSession),
    });
  };

  const fetchTenantAuditEvents = async (
    nextSession: LoginResponse,
    filters: AuditFilters,
    beforeId?: number,
  ): Promise<AuditEventRecord[]> => {
    const params = new URLSearchParams({
      limit: filters.limit || "100",
    });
    if (filters.eventPrefix.trim()) {
      params.set("eventPrefix", filters.eventPrefix.trim());
    }
    if (filters.eventType.trim()) {
      params.set("eventType", filters.eventType.trim());
    }
    if (filters.accountQuery.trim()) {
      params.set("accountQuery", filters.accountQuery.trim());
    }
    if (filters.payloadQuery.trim()) {
      params.set("payloadQuery", filters.payloadQuery.trim());
    }
    if (filters.occurredFrom) {
      params.set("occurredFrom", new Date(filters.occurredFrom).toISOString());
    }
    if (filters.occurredTo) {
      params.set("occurredTo", new Date(filters.occurredTo).toISOString());
    }
    if (typeof beforeId === "number") {
      params.set("beforeId", String(beforeId));
    }
    return requestJson<AuditEventRecord[]>(
      `/api/admin/tenant/audit/events?${params.toString()}`,
      {
        method: "GET",
        headers: authHeaders(nextSession),
      },
    );
  };

  const fetchSuperAdminSessions = async (
    nextSession: LoginResponse,
    tenantId: number | null,
    filters: SessionFilters,
    beforeId?: string,
  ): Promise<SessionSummaryRecord[]> => {
    if (!tenantId) {
      return [];
    }
    const params = new URLSearchParams({
      tenantId: String(tenantId),
      limit: filters.limit || "100",
    });
    if (filters.lastEventType.trim()) {
      params.set("lastEventType", filters.lastEventType.trim());
    }
    if (filters.hasFailure) {
      params.set("hasFailure", filters.hasFailure);
    }
    if (filters.lastOccurredFrom) {
      params.set("lastOccurredFrom", new Date(filters.lastOccurredFrom).toISOString());
    }
    if (filters.lastOccurredTo) {
      params.set("lastOccurredTo", new Date(filters.lastOccurredTo).toISOString());
    }
    if (beforeId) {
      params.set("beforeId", beforeId);
    }
    return requestJson<SessionSummaryRecord[]>(
      `/api/admin/sessions?${params.toString()}`,
      {
        method: "GET",
        headers: authHeaders(nextSession),
      },
    );
  };

  const fetchTenantSessions = async (
    nextSession: LoginResponse,
    filters: SessionFilters,
    beforeId?: string,
  ): Promise<SessionSummaryRecord[]> => {
    const params = new URLSearchParams({
      limit: filters.limit || "100",
    });
    if (filters.lastEventType.trim()) {
      params.set("lastEventType", filters.lastEventType.trim());
    }
    if (filters.hasFailure) {
      params.set("hasFailure", filters.hasFailure);
    }
    if (filters.lastOccurredFrom) {
      params.set("lastOccurredFrom", new Date(filters.lastOccurredFrom).toISOString());
    }
    if (filters.lastOccurredTo) {
      params.set("lastOccurredTo", new Date(filters.lastOccurredTo).toISOString());
    }
    if (beforeId) {
      params.set("beforeId", beforeId);
    }
    return requestJson<SessionSummaryRecord[]>(
      `/api/admin/tenant/sessions?${params.toString()}`,
      {
        method: "GET",
        headers: authHeaders(nextSession),
      },
    );
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
        const [nextModels, nextSkills, nextAuditEvents, nextSessions] = await Promise.all([
          fetchSuperAdminModelProfiles(nextSession, nextModelScope, nextSelectedTenantId),
          fetchSuperAdminSkillCatalog(nextSession, nextSkillScope, nextSelectedTenantId),
          fetchSuperAdminAuditEvents(nextSession, nextSelectedTenantId, auditFilters),
          fetchSuperAdminSessions(nextSession, nextSelectedTenantId, sessionFilters),
        ]);
        setModelProfiles(nextModels);
        setSkillCatalog(nextSkills);
        setAuditEvents(nextAuditEvents);
        setSessions(nextSessions);
        setAuditHasMore(nextAuditEvents.length >= Number(auditFilters.limit || "100"));
        setSessionHasMore(nextSessions.length >= Number(sessionFilters.limit || "100"));
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
      const [tenantModels, tenantSkills, tenantAuditEvents, tenantSessions] = await Promise.all([
        requestJson<ModelProfileRecord[]>("/api/admin/tenant/model-profiles", {
          method: "GET",
          headers: authHeaders(nextSession),
        }),
        requestJson<SkillCatalogRecord[]>("/api/admin/tenant/skills/catalog", {
          method: "GET",
          headers: authHeaders(nextSession),
        }),
        fetchTenantAuditEvents(nextSession, auditFilters),
        fetchTenantSessions(nextSession, sessionFilters),
      ]);
      setModelProfiles(tenantModels);
      setSkillCatalog(tenantSkills);
      setAuditEvents(tenantAuditEvents);
      setSessions(tenantSessions);
      setAuditHasMore(tenantAuditEvents.length >= Number(auditFilters.limit || "100"));
      setSessionHasMore(tenantSessions.length >= Number(sessionFilters.limit || "100"));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.workspaceLoadFailed));
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
      setSessionNotice(copy.notices.sessionActive);
      await loadWorkspace(payload, payload.tenant?.id ?? null);
    } catch (error) {
      setSession(null);
      setAccounts([]);
      setTenants([]);
      setModelProfiles([]);
      setSkillCatalog([]);
      setAuditEvents([]);
      setSessions([]);
      setAuditHasMore(false);
      setSessionHasMore(false);
      setLoginError(resolveErrorMessage(error, copy.errors.unknownLoginError));
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
      setSessionNotice(copy.notices.sessionRefreshed);
    } catch (error) {
      setLoginError(resolveErrorMessage(error, copy.errors.unknownRefreshError));
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
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadModelProfilesFailed));
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
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadSkillCatalogFailed));
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
      setSessionNotice(copy.notices.tenantCreated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.createTenantFailed));
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
      setSessionNotice(copy.notices.accountCreated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.createAccountFailed));
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
      setSessionNotice(copy.notices.accountDeactivated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.deactivateAccountFailed));
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
      setSessionNotice(copy.notices.tenantDeactivated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.deactivateTenantFailed));
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
      setSessionNotice(copy.notices.modelProfileCreated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.createModelProfileFailed));
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
      setSessionNotice(copy.notices.modelProfileDeactivated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.deactivateModelProfileFailed));
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
      setSessionNotice(copy.notices.skillCatalogCreated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.createSkillCatalogFailed));
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
      setSessionNotice(copy.notices.skillCatalogDeactivated);
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.deactivateSkillFailed));
    }
  };

  const handleApplyAuditFilters = async () => {
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    setIsLoadingAudit(true);
    try {
      const items =
        session.user.roleCode === "super_admin"
          ? await fetchSuperAdminAuditEvents(session, selectedTenantId, auditFilters)
          : await fetchTenantAuditEvents(session, auditFilters);
      setAuditEvents(items);
      setAuditHasMore(items.length >= Number(auditFilters.limit || "100"));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadAuditEventsFailed));
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleLoadOlderAuditEvents = async () => {
    if (!session || auditEvents.length === 0) {
      return;
    }

    const beforeId = auditEvents[auditEvents.length - 1]?.id;
    if (!beforeId) {
      return;
    }

    setWorkspaceError(null);
    setIsLoadingAudit(true);
    try {
      const olderItems =
        session.user.roleCode === "super_admin"
          ? await fetchSuperAdminAuditEvents(session, selectedTenantId, auditFilters, beforeId)
          : await fetchTenantAuditEvents(session, auditFilters, beforeId);
      setAuditEvents((current) => [...current, ...olderItems]);
      setAuditHasMore(olderItems.length >= Number(auditFilters.limit || "100"));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadOlderAuditEventsFailed));
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleOpenSessionAudit = async (sessionId: string) => {
    if (!session) {
      return;
    }

    const nextFilters: AuditFilters = {
      eventPrefix: "",
      eventType: "",
      occurredFrom: "",
      occurredTo: "",
      accountQuery: "",
      payloadQuery: sessionId,
      limit: auditFilters.limit || "100",
    };

    setAuditFilters(nextFilters);
    setWorkspaceError(null);
    setIsLoadingAudit(true);
    try {
      const items =
        session.user.roleCode === "super_admin"
          ? await fetchSuperAdminAuditEvents(session, selectedTenantId, nextFilters)
          : await fetchTenantAuditEvents(session, nextFilters);
      setAuditEvents(items);
      setAuditHasMore(items.length >= Number(nextFilters.limit || "100"));
      setSessionNotice(formatMessage(copy.notices.auditFilteredBySession, { sessionId }));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadSessionAuditFailed));
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleApplySessionFilters = async () => {
    if (!session) {
      return;
    }

    setWorkspaceError(null);
    setIsLoadingSessions(true);
    try {
      const items =
        session.user.roleCode === "super_admin"
          ? await fetchSuperAdminSessions(session, selectedTenantId, sessionFilters)
          : await fetchTenantSessions(session, sessionFilters);
      setSessions(items);
      setSessionHasMore(items.length >= Number(sessionFilters.limit || "100"));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadSessionsFailed));
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const handleLoadOlderSessions = async () => {
    if (!session || sessions.length === 0) {
      return;
    }

    const beforeId = sessions[sessions.length - 1]?.sessionId;
    if (!beforeId) {
      return;
    }

    setWorkspaceError(null);
    setIsLoadingSessions(true);
    try {
      const olderItems =
        session.user.roleCode === "super_admin"
          ? await fetchSuperAdminSessions(session, selectedTenantId, sessionFilters, beforeId)
          : await fetchTenantSessions(session, sessionFilters, beforeId);
      setSessions((current) => [...current, ...olderItems]);
      setSessionHasMore(olderItems.length >= Number(sessionFilters.limit || "100"));
    } catch (error) {
      setWorkspaceError(resolveErrorMessage(error, copy.errors.loadOlderSessionsFailed));
    } finally {
      setIsLoadingSessions(false);
    }
  };

  const renderAuditEvent = (item: AuditEventRecord): React.JSX.Element => {
    const summaryLines = buildAuditSummaryLines(item, copy);

    return (
      <div key={item.id} className="platform-admin-list-item is-static">
        <span>{item.eventType}</span>
        <small>{item.account.displayName}</small>
        <small>{item.occurredAt}</small>
        {summaryLines.map((line) => (
          <small key={`${item.id}-${line}`}>{line}</small>
        ))}
        <small>{JSON.stringify(item.payload)}</small>
      </div>
    );
  };

  const renderSessionSummary = (item: SessionSummaryRecord): React.JSX.Element => {
    const toolParts: string[] = [];
    if ((item.toolRunCount ?? 0) > 0) {
      toolParts.push(
        formatMessage(copy.sessions.tools, { count: item.toolRunCount }),
      );
    }
    if (item.lastToolLabel) {
      toolParts.push(
        formatMessage(copy.sessions.lastTool, { value: item.lastToolLabel }),
      );
    }
    if (item.lastToolSource) {
      toolParts.push(
        formatMessage(copy.sessions.source, { value: item.lastToolSource }),
      );
    }

    return (
      <div key={item.sessionId} className="platform-admin-list-item is-static">
        <span>{item.sessionId}</span>
        <small>{item.lastEventType}</small>
        <small>{item.lastAccount.displayName}</small>
        <small>{item.lastOccurredAt}</small>
        <small>{formatMessage(copy.sessions.events, { count: item.eventCount })}</small>
        {toolParts.length > 0 ? <small>{toolParts.join(" • ")}</small> : null}
        {item.hasFailure ? <small>{copy.sessions.failed}</small> : null}
        {item.hasToolFailure ? <small>{copy.sessions.toolFailed}</small> : null}
        <button
          className="platform-admin-secondary-button"
          type="button"
          onClick={() => void handleOpenSessionAudit(item.sessionId)}
        >
          {copy.common.openInAudit}
        </button>
      </div>
    );
  };

  const renderAuditFilters = (): React.JSX.Element => (
    <div className="platform-admin-form">
      <label className="platform-admin-field">
        <span>{copy.audit.eventFamily}</span>
        <select
          value={auditFilters.eventPrefix}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, eventPrefix: event.target.value }))
          }
        >
          <option value="">{copy.audit.allEvents}</option>
          <option value="run.">{copy.audit.runEvents}</option>
          <option value="chat.">{copy.audit.chatEvents}</option>
          <option value="auth.">{copy.audit.authEvents}</option>
          <option value="workspace.">{copy.audit.workspaceEvents}</option>
        </select>
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.eventType}</span>
        <input
          value={auditFilters.eventType}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, eventType: event.target.value }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.account}</span>
        <input
          value={auditFilters.accountQuery}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, accountQuery: event.target.value }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.payloadContains}</span>
        <input
          value={auditFilters.payloadQuery}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, payloadQuery: event.target.value }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.occurredFrom}</span>
        <input
          type="datetime-local"
          value={auditFilters.occurredFrom}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, occurredFrom: event.target.value }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.occurredTo}</span>
        <input
          type="datetime-local"
          value={auditFilters.occurredTo}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, occurredTo: event.target.value }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.audit.limit}</span>
        <input
          type="number"
          min="1"
          max="200"
          value={auditFilters.limit}
          onChange={(event) =>
            setAuditFilters((current) => ({ ...current, limit: event.target.value || "100" }))
          }
        />
      </label>
      <button className="platform-admin-submit" type="button" onClick={() => void handleApplyAuditFilters()}>
        {copy.common.applyFilters}
      </button>
    </div>
  );

  const renderAuditSummary = (): React.JSX.Element => (
    <section className="platform-admin-audit-summary" aria-label="audit-summary">
      <div className="platform-admin-audit-summary-header">
        <div>
          <p className="platform-admin-section-label">{copy.audit.summarySection}</p>
          <h4>{copy.audit.summaryTitle}</h4>
        </div>
        <small>{copy.audit.summaryNote}</small>
      </div>
      <div className="platform-admin-audit-summary-grid">
        <div className="platform-admin-audit-kpi">
          <span>{copy.audit.totalEvents}</span>
          <strong>{auditSummary.total}</strong>
        </div>
        <div className="platform-admin-audit-kpi">
          <span>{copy.audit.failures}</span>
          <strong>{formatMessage(copy.audit.failedSuffix, { count: auditSummary.failures })}</strong>
        </div>
      </div>
      <div className="platform-admin-audit-family-list">
        {auditSummary.families.map((family) => {
          const percentage =
            auditSummary.total > 0 ? Math.round((family.count / auditSummary.total) * 100) : 0;
          return (
            <div key={family.key} className="platform-admin-audit-family-row">
              <div className="platform-admin-audit-family-meta">
                <span>{family.label}</span>
                <small>{formatMessage(copy.sessions.events, { count: family.count })}</small>
              </div>
              <div className="platform-admin-audit-family-bar">
                <span style={{ width: `${percentage}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );

  const renderSessionFilters = (): React.JSX.Element => (
    <div className="platform-admin-form">
      <label className="platform-admin-field">
        <span>{copy.sessions.lastEventType}</span>
        <input
          value={sessionFilters.lastEventType}
          onChange={(event) =>
            setSessionFilters((current) => ({
              ...current,
              lastEventType: event.target.value,
            }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.sessions.status}</span>
        <select
          value={sessionFilters.hasFailure}
          onChange={(event) =>
            setSessionFilters((current) => ({
              ...current,
              hasFailure: event.target.value,
            }))
          }
        >
          <option value="">{copy.sessions.allSessions}</option>
          <option value="true">{copy.sessions.failedOnly}</option>
          <option value="false">{copy.sessions.healthyOnly}</option>
        </select>
      </label>
      <label className="platform-admin-field">
        <span>{copy.sessions.lastOccurredFrom}</span>
        <input
          type="datetime-local"
          value={sessionFilters.lastOccurredFrom}
          onChange={(event) =>
            setSessionFilters((current) => ({
              ...current,
              lastOccurredFrom: event.target.value,
            }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.sessions.lastOccurredTo}</span>
        <input
          type="datetime-local"
          value={sessionFilters.lastOccurredTo}
          onChange={(event) =>
            setSessionFilters((current) => ({
              ...current,
              lastOccurredTo: event.target.value,
            }))
          }
        />
      </label>
      <label className="platform-admin-field">
        <span>{copy.sessions.limit}</span>
        <input
          type="number"
          min="1"
          max="200"
          value={sessionFilters.limit}
          onChange={(event) =>
            setSessionFilters((current) => ({ ...current, limit: event.target.value || "100" }))
          }
        />
      </label>
      <button
        className="platform-admin-submit"
        type="button"
        onClick={() => void handleApplySessionFilters()}
      >
        {copy.common.applyFilters}
      </button>
    </div>
  );

  return (
    <main className="platform-admin-app">
      <section className="platform-admin-hero">
        <div>
          <p className="platform-admin-eyebrow">{copy.stage}</p>
          <h1>{copy.title}</h1>
          <p className="platform-admin-description">{copy.description}</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <div
            className="inline-flex rounded-full border border-slate-200 bg-white/85 p-1 shadow-sm"
            aria-label={copy.localeLabel}
          >
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                locale === "zh-CN"
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:text-brand-700"
              }`}
              onClick={() => setLocale("zh-CN")}
              aria-pressed={locale === "zh-CN"}
            >
              {copy.localeChinese}
            </button>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                locale === "en"
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:text-brand-700"
              }`}
              onClick={() => setLocale("en")}
              aria-pressed={locale === "en"}
            >
              {copy.localeEnglish}
            </button>
          </div>
          <p className={healthClassName}>
            {healthStatus === "online" ? (
              <>
                <span>{copy.health.online}</span>
                <span className="platform-admin-status-detail">
                  · {healthService || "platform-admin-backend"}
                </span>
              </>
            ) : null}
            {healthStatus === "offline" ? (
              <>
                <span>{copy.health.offline}</span>
                <span className="platform-admin-status-detail">· {healthError}</span>
              </>
            ) : null}
            {healthStatus === "checking" ? <span>{copy.health.checking}</span> : null}
          </p>
        </div>
      </section>

      <section className="platform-admin-layout">
        <article className="platform-admin-panel">
          <div className="platform-admin-panel-header">
            <div>
              <p className="platform-admin-section-label">{copy.login.section}</p>
              <h2>{copy.login.title}</h2>
            </div>
            <p className="platform-admin-panel-note">{copy.login.note}</p>
          </div>

          <form className="platform-admin-form" onSubmit={handleSubmit}>
            <label className="platform-admin-field">
              <span>{copy.login.tenantCode}</span>
              <input
                value={tenantCode}
                onChange={(event) => setTenantCode(event.target.value)}
                placeholder="acme"
              />
            </label>

            <label className="platform-admin-field">
              <span>{copy.login.username}</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="admin"
              />
            </label>

            <label className="platform-admin-field">
              <span>{copy.login.password}</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
              />
            </label>

            <button className="platform-admin-submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? copy.login.signingIn : copy.login.signIn}
            </button>
          </form>

          {loginError ? <p className="platform-admin-error">{loginError}</p> : null}
          {workspaceError ? <p className="platform-admin-error">{workspaceError}</p> : null}

          {session ? (
            <section className="platform-admin-session" aria-label="login-session">
              <h3>{formatMessage(copy.login.signedInAs, { name: session.user.displayName })}</h3>
              <p>
                {copy.login.scope}: {session.tenant
                  ? `${session.tenant.name} (${session.tenant.code})`
                  : copy.login.platformScope}
              </p>
              <p>{copy.login.account}: {session.user.username}</p>
              <p>{copy.login.role}: {roleLabel(session.user.roleCode)}</p>
              <div className="platform-admin-session-actions">
                <button
                  className="platform-admin-secondary-button"
                  type="button"
                  onClick={handleRefreshSession}
                  disabled={isRefreshingSession}
                >
                  {isRefreshingSession ? copy.login.refreshing : copy.login.refresh}
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
              <p className="platform-admin-section-label">{copy.workspace.section}</p>
              <h2>{workspaceTitle || copy.workspace.managementModules}</h2>
            </div>
            {isLoadingWorkspace ? <p className="platform-admin-panel-note">{copy.workspace.loading}</p> : null}
          </div>

          {!session ? (
            <section className="platform-admin-grid" aria-label="phase-1-modules">
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">{copy.workspace.next}</p>
                <h2>{copy.workspace.tenantsRbacTitle}</h2>
                <p>{copy.workspace.tenantsRbacDesc}</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">{copy.workspace.next}</p>
                <h2>{copy.workspace.configCenterTitle}</h2>
                <p>{copy.workspace.configCenterDesc}</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">{copy.workspace.next}</p>
                <h2>{copy.workspace.skillHubTitle}</h2>
                <p>{copy.workspace.skillHubDesc}</p>
              </article>
              <article className="platform-admin-card">
                <p className="platform-admin-section-label">{copy.workspace.next}</p>
                <h2>{copy.workspace.auditCenterTitle}</h2>
                <p>{copy.workspace.auditCenterDesc}</p>
              </article>
            </section>
          ) : null}

          {session?.user.roleCode === "super_admin" ? (
            <div className="platform-admin-workspace-grid">
              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.tenantControl.section}</p>
                <h3>{copy.tenantControl.createTitle}</h3>
                <form className="platform-admin-form" onSubmit={handleCreateTenant}>
                  <label className="platform-admin-field">
                    <span>{copy.tenantControl.tenantCode}</span>
                    <input
                      value={tenantForm.code}
                      onChange={(event) =>
                        setTenantForm((current) => ({ ...current, code: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.tenantControl.tenantName}</span>
                    <input
                      value={tenantForm.name}
                      onChange={(event) =>
                        setTenantForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    {copy.tenantControl.createButton}
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
                      <small>{tenant.isActive ? copy.common.active : copy.common.inactive}</small>
                    </button>
                  ))}
                </div>
                {selectedTenantId ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => handleDeactivateTenant(selectedTenantId)}
                  >
                    {copy.tenantControl.deactivateButton}
                  </button>
                ) : null}
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.accountControl.section}</p>
                <h3>{copy.accountControl.createTitle}</h3>
                <form className="platform-admin-form" onSubmit={handleCreateAccount}>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.username}</span>
                    <input
                      value={accountForm.username}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, username: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.displayName}</span>
                    <input
                      value={accountForm.displayName}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.password}</span>
                    <input
                      type="password"
                      value={accountForm.password}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.role}</span>
                    <select
                      value={accountForm.roleCode}
                      onChange={(event) =>
                        setAccountForm((current) => ({
                          ...current,
                          roleCode: event.target.value as RoleCode,
                        }))
                      }
                    >
                      <option value="tenant_admin">{copy.accountControl.createTenantAdmin}</option>
                      <option value="tenant_user">{copy.accountControl.createTenantUser}</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    {copy.accountControl.createButton}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {accounts.map((account) => (
                    <div key={account.id} className="platform-admin-list-item is-static">
                      <span>{account.displayName}</span>
                      <small>{account.username}</small>
                      <small>{roleLabel(account.roleCode)}</small>
                      <small>{account.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateAccount(account.id)}
                      >
                        {copy.accountControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.modelControl.section}</p>
                <h3>{copy.modelControl.title}</h3>
                <label className="platform-admin-field">
                  <span>{copy.modelControl.scope}</span>
                  <select
                    value={modelScope}
                    onChange={(event) =>
                      void handleSelectModelScope(event.target.value as "global" | "tenant")
                    }
                  >
                    <option value="global">{copy.modelControl.globalModels}</option>
                    {selectedTenantId ? (
                      <option value="tenant">{copy.modelControl.tenantModels}</option>
                    ) : null}
                  </select>
                </label>
                <form className="platform-admin-form" onSubmit={handleCreateModelProfile}>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.provider}</span>
                    <input
                      value={modelForm.provider}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, provider: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.modelId}</span>
                    <input
                      value={modelForm.model}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, model: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.label}</span>
                    <input
                      value={modelForm.label}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.baseUrl}</span>
                    <input
                      value={modelForm.baseUrl}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.defaultFlag}</span>
                    <select
                      value={modelForm.isDefault ? "true" : "false"}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          isDefault: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="true">{copy.modelControl.defaultModel}</option>
                      <option value="false">{copy.modelControl.optionalModel}</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    {copy.modelControl.createButton}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {modelProfiles.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.label}</span>
                      <small>{item.provider}</small>
                      <small>{item.model}</small>
                      <small>{item.isDefault ? copy.common.default : copy.common.optional}</small>
                      <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateModelProfile(item.id)}
                      >
                        {copy.modelControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.skillControl.section}</p>
                <h3>{copy.skillControl.title}</h3>
                <label className="platform-admin-field">
                  <span>{copy.skillControl.scope}</span>
                  <select
                    value={skillScope}
                    onChange={(event) =>
                      void handleSelectSkillScope(event.target.value as "global" | "tenant")
                    }
                  >
                    <option value="global">{copy.skillControl.globalSkills}</option>
                    {selectedTenantId ? (
                      <option value="tenant">{copy.skillControl.tenantSkills}</option>
                    ) : null}
                  </select>
                </label>
                <form className="platform-admin-form" onSubmit={handleCreateSkillCatalog}>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.name}</span>
                    <input
                      value={skillForm.name}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.version}</span>
                    <input
                      value={skillForm.version}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, version: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.description}</span>
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
                    <span>{copy.skillControl.downloadUrl}</span>
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
                    {copy.skillControl.createButton}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {skillCatalog.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.name}</span>
                      <small>{item.version}</small>
                      <small>{item.scopeType === "global" ? copy.common.global : copy.common.tenant}</small>
                      <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateSkillCatalog(item.id)}
                      >
                        {copy.skillControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.audit.section}</p>
                <h3>{copy.audit.title}</h3>
                {renderAuditFilters()}
                {renderAuditSummary()}
                {!selectedTenantId ? (
                  <p className="platform-admin-panel-note">
                    {copy.audit.selectTenantHint}
                  </p>
                ) : null}
                <div className="platform-admin-list">
                  {auditEvents.map((item) => renderAuditEvent(item))}
                </div>
                {auditHasMore && selectedTenantId ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => void handleLoadOlderAuditEvents()}
                    disabled={isLoadingAudit}
                  >
                    {isLoadingAudit ? copy.common.loading : copy.common.loadOlderEvents}
                  </button>
                ) : null}
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.sessions.section}</p>
                <h3>{copy.sessions.title}</h3>
                {renderSessionFilters()}
                {!selectedTenantId ? (
                  <p className="platform-admin-panel-note">
                    {copy.sessions.selectTenantHint}
                  </p>
                ) : null}
                <div className="platform-admin-list">
                  {sessions.map((item) => renderSessionSummary(item))}
                </div>
                {sessionHasMore && selectedTenantId ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => void handleLoadOlderSessions()}
                    disabled={isLoadingSessions}
                  >
                    {isLoadingSessions ? copy.common.loading : copy.common.loadOlderSessions}
                  </button>
                ) : null}
              </article>
            </div>
          ) : null}

          {session?.user.roleCode === "tenant_admin" ? (
            <div className="platform-admin-workspace-grid is-single-column">
              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.accountControl.section}</p>
                <h3>{copy.accountControl.createTenantUserTitle}</h3>
                <form className="platform-admin-form" onSubmit={handleCreateAccount}>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.username}</span>
                    <input
                      value={accountForm.username}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, username: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.displayName}</span>
                    <input
                      value={accountForm.displayName}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, displayName: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.accountControl.password}</span>
                    <input
                      type="password"
                      value={accountForm.password}
                      onChange={(event) =>
                        setAccountForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    {copy.accountControl.createTenantUser}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {accounts.map((account) => (
                    <div key={account.id} className="platform-admin-list-item is-static">
                      <span>{account.displayName}</span>
                      <small>{account.username}</small>
                      <small>{roleLabel(account.roleCode)}</small>
                      <small>{account.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateAccount(account.id)}
                      >
                        {copy.accountControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.modelControl.tenantSection}</p>
                <h3>{copy.modelControl.tenantTitle}</h3>
                <form className="platform-admin-form" onSubmit={handleCreateModelProfile}>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.provider}</span>
                    <input
                      value={modelForm.provider}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, provider: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.modelId}</span>
                    <input
                      value={modelForm.model}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, model: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.label}</span>
                    <input
                      value={modelForm.label}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, label: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.baseUrl}</span>
                    <input
                      value={modelForm.baseUrl}
                      onChange={(event) =>
                        setModelForm((current) => ({ ...current, baseUrl: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.modelControl.defaultFlag}</span>
                    <select
                      value={modelForm.isDefault ? "true" : "false"}
                      onChange={(event) =>
                        setModelForm((current) => ({
                          ...current,
                          isDefault: event.target.value === "true",
                        }))
                      }
                    >
                      <option value="true">{copy.modelControl.defaultModel}</option>
                      <option value="false">{copy.modelControl.optionalModel}</option>
                    </select>
                  </label>
                  <button className="platform-admin-submit" type="submit">
                    {copy.modelControl.createButton}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {modelProfiles.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.label}</span>
                      <small>{item.provider}</small>
                      <small>{item.model}</small>
                      <small>{item.isDefault ? copy.common.default : copy.common.optional}</small>
                      <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateModelProfile(item.id)}
                      >
                        {copy.modelControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.skillControl.tenantSection}</p>
                <h3>{copy.skillControl.tenantTitle}</h3>
                <form className="platform-admin-form" onSubmit={handleCreateSkillCatalog}>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.name}</span>
                    <input
                      value={skillForm.name}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.version}</span>
                    <input
                      value={skillForm.version}
                      onChange={(event) =>
                        setSkillForm((current) => ({ ...current, version: event.target.value }))
                      }
                    />
                  </label>
                  <label className="platform-admin-field">
                    <span>{copy.skillControl.description}</span>
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
                    <span>{copy.skillControl.downloadUrl}</span>
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
                    {copy.skillControl.createButton}
                  </button>
                </form>

                <div className="platform-admin-list">
                  {skillCatalog.map((item) => (
                    <div key={item.id} className="platform-admin-list-item is-static">
                      <span>{item.name}</span>
                      <small>{item.version}</small>
                      <small>{item.scopeType === "global" ? copy.common.global : copy.common.tenant}</small>
                      <small>{item.isActive ? copy.common.active : copy.common.inactive}</small>
                      <button
                        className="platform-admin-secondary-button"
                        type="button"
                        onClick={() => handleDeactivateSkillCatalog(item.id)}
                      >
                        {copy.skillControl.deactivateButton}
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.audit.tenantSection}</p>
                <h3>{copy.audit.tenantTitle}</h3>
                {renderAuditFilters()}
                {renderAuditSummary()}
                <div className="platform-admin-list">
                  {auditEvents.map((item) => renderAuditEvent(item))}
                </div>
                {auditHasMore ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => void handleLoadOlderAuditEvents()}
                    disabled={isLoadingAudit}
                  >
                    {isLoadingAudit ? copy.common.loading : copy.common.loadOlderEvents}
                  </button>
                ) : null}
              </article>

              <article className="platform-admin-card platform-admin-stack-card">
                <p className="platform-admin-section-label">{copy.sessions.tenantSection}</p>
                <h3>{copy.sessions.tenantTitle}</h3>
                {renderSessionFilters()}
                <div className="platform-admin-list">
                  {sessions.map((item) => renderSessionSummary(item))}
                </div>
                {sessionHasMore ? (
                  <button
                    className="platform-admin-secondary-button"
                    type="button"
                    onClick={() => void handleLoadOlderSessions()}
                    disabled={isLoadingSessions}
                  >
                    {isLoadingSessions ? copy.common.loading : copy.common.loadOlderSessions}
                  </button>
                ) : null}
              </article>
            </div>
          ) : null}
        </section>
      </section>

      <footer className="platform-admin-footer">
        <p className="platform-admin-footer-note">{copy.footerNote}</p>
        <a
          href="http://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer"
          className="transition-colors duration-200 hover:text-brand-700 hover:underline"
        >
          苏ICP备2026017592号-1
        </a>
      </footer>
    </main>
  );
}
