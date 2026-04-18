import type { AuditStatus } from "../../shared/platform/audit";

const MAX_QUEUE = 500;

export interface QueuedAuditEvent {
  type: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

let status: AuditStatus = {
  health: "healthy",
  localHealth: "healthy",
  remoteHealth: "healthy",
  queuedEvents: 0,
  droppedEvents: 0,
  lastError: null,
};

const queue: QueuedAuditEvent[] = [];
let flushInFlight: Promise<AuditStatus> | null = null;

function isReauthError(error: unknown): boolean {
  const statusCode =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : Number.NaN;

  if (statusCode === 401 || statusCode === 403) {
    return true;
  }

  return /(^|\s)(401|403)\b/.test((error as Error)?.message || "");
}

export function enqueueAuditEvent(event: {
  type: string;
  payload: Record<string, unknown>;
}): void {
  if (queue.length >= MAX_QUEUE) {
    status = {
      ...status,
      health: "degraded",
      localHealth: "degraded",
      droppedEvents: status.droppedEvents + 1,
      lastError: "audit queue capacity reached",
    };
    return;
  }

  queue.push({
    ...event,
    occurredAt: new Date().toISOString(),
  });
  status = {
    ...status,
    queuedEvents: queue.length,
  };
}

export function markAuditFailure(message: string): void {
  status = {
    ...status,
    health: "buffering",
    localHealth: "buffering",
    queuedEvents: queue.length,
    lastError: message,
  };
}

export function markAuditSuccess(): void {
  queue.length = 0;
  status = {
    health: "healthy",
    localHealth: "healthy",
    remoteHealth: "healthy",
    queuedEvents: 0,
    droppedEvents: status.droppedEvents,
    lastError: null,
  };
}

export function markAuditReauthRequired(message?: string): void {
  status = {
    ...status,
    health: "reauth-required",
    localHealth: "reauth-required",
    queuedEvents: queue.length,
    lastError: message || status.lastError,
  };
}

export function getAuditStatus(): AuditStatus {
  return status;
}

export async function flushAuditQueue(
  deliver: (events: QueuedAuditEvent[]) => Promise<void>,
): Promise<AuditStatus> {
  if (flushInFlight) {
    return flushInFlight;
  }

  if (queue.length === 0) {
    status = {
      ...status,
      health: "healthy",
      localHealth: "healthy",
      queuedEvents: 0,
      lastError: null,
    };
    return status;
  }

  const batch = queue.slice();
  flushInFlight = deliver(batch)
    .then(() => {
      queue.splice(0, batch.length);
      status = {
        health: "healthy",
        localHealth: "healthy",
        remoteHealth: "healthy",
        queuedEvents: queue.length,
        droppedEvents: status.droppedEvents,
        lastError: null,
      };
      return status;
    })
    .catch((error: unknown) => {
      const message = (error as Error)?.message || "audit upload failed";
      if (isReauthError(error)) {
        markAuditReauthRequired(message);
      } else {
        markAuditFailure(message);
      }
      return status;
    })
    .finally(() => {
      flushInFlight = null;
    });

  return flushInFlight;
}

export function resetAuditState(): void {
  queue.length = 0;
  flushInFlight = null;
  status = {
    health: "healthy",
    localHealth: "healthy",
    remoteHealth: "healthy",
    queuedEvents: 0,
    droppedEvents: 0,
    lastError: null,
  };
}
