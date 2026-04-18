export type HealthStatus = "checking" | "online" | "offline";

export type RoleCode = "super_admin" | "tenant_admin" | "tenant_user";

export interface SessionTenant {
  id: number;
  code: string;
  name: string;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  roleCode: RoleCode;
  scopeType?: "platform" | "tenant";
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  tenant: SessionTenant | null;
  user: SessionUser;
}

export interface TenantRecord {
  id: number;
  code: string;
  name: string;
  isActive: boolean;
}

export interface AdminAccountRecord {
  id: number;
  scopeType: "platform" | "tenant";
  tenant: SessionTenant | null;
  username: string;
  displayName: string;
  roleCode: RoleCode;
  isActive: boolean;
}

export interface ModelProfileRecord {
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

export interface SkillCatalogRecord {
  id: string;
  scopeType: "global" | "tenant";
  tenant: SessionTenant | null;
  name: string;
  version: string;
  description: string;
  downloadUrl: string;
  isActive: boolean;
}

export interface AuditActorRecord {
  id: number;
  username: string;
  displayName: string;
  roleCode: RoleCode;
}

export type AuditEventFamilyKey = "run" | "chat" | "auth" | "workspace" | "other";

export interface AuditEventRecord {
  id: number;
  tenant: SessionTenant;
  account: AuditActorRecord;
  eventFamily?: AuditEventFamilyKey;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

export interface SessionSummaryRecord {
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

export interface AuditFilters {
  eventFamily: AuditEventFamilyKey | "";
  eventType: string;
  occurredFrom: string;
  occurredTo: string;
  accountQuery: string;
  payloadQuery: string;
  limit: string;
}

export interface SessionFilters {
  lastEventType: string;
  hasFailure: string;
  lastOccurredFrom: string;
  lastOccurredTo: string;
  limit: string;
}

export interface AuditFamilySummary {
  key: AuditEventFamilyKey;
  label: string;
  count: number;
}

export type WorkspaceSection =
  | "overview"
  | "tenants"
  | "accounts"
  | "models"
  | "skills"
  | "audit"
  | "sessions";
