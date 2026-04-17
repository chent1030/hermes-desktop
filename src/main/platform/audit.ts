import type { AuditStatus } from "../../shared/platform/audit";

const MAX_QUEUE = 500;

let status: AuditStatus = {
  health: "healthy",
  queuedEvents: 0,
  droppedEvents: 0,
  lastError: null,
};

const queue: Array<{ type: string; payload: Record<string, unknown> }> = [];

export function enqueueAuditEvent(event: {
  type: string;
  payload: Record<string, unknown>;
}): void {
  if (queue.length >= MAX_QUEUE) {
    status = {
      ...status,
      health: "degraded",
      droppedEvents: status.droppedEvents + 1,
      lastError: "audit queue capacity reached",
    };
    return;
  }

  queue.push(event);
  status = {
    ...status,
    queuedEvents: queue.length,
  };
}

export function markAuditFailure(message: string): void {
  status = {
    ...status,
    health: "buffering",
    queuedEvents: queue.length,
    lastError: message,
  };
}

export function markAuditSuccess(): void {
  queue.length = 0;
  status = {
    health: "healthy",
    queuedEvents: 0,
    droppedEvents: status.droppedEvents,
    lastError: null,
  };
}

export function markAuditReauthRequired(): void {
  status = {
    ...status,
    health: "reauth-required",
  };
}

export function getAuditStatus(): AuditStatus {
  return status;
}

export function resetAuditState(): void {
  queue.length = 0;
  status = {
    health: "healthy",
    queuedEvents: 0,
    droppedEvents: 0,
    lastError: null,
  };
}
