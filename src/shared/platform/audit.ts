export type AuditHealth =
  | "healthy"
  | "degraded"
  | "buffering"
  | "reauth-required";

export interface AuditStatus {
  health: AuditHealth;
  localHealth: AuditHealth;
  remoteHealth: AuditHealth;
  queuedEvents: number;
  droppedEvents: number;
  lastError: string | null;
}
