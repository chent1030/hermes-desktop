export type AuditHealth =
  | "healthy"
  | "degraded"
  | "buffering"
  | "reauth-required";

export interface AuditStatus {
  health: AuditHealth;
  queuedEvents: number;
  droppedEvents: number;
  lastError: string | null;
}
