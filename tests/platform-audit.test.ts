import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueAuditEvent,
  flushAuditQueue,
  getAuditStatus,
  markAuditFailure,
  resetAuditState,
} from "../src/main/platform/audit";

describe("platform audit queue", () => {
  beforeEach(() => {
    resetAuditState();
  });

  it("moves into buffering mode when delivery fails and recovers on success", () => {
    enqueueAuditEvent({ type: "chat.started", payload: { sessionId: "s1" } });
    markAuditFailure("503 service unavailable");

    expect(getAuditStatus().health).toBe("buffering");
    expect(getAuditStatus().queuedEvents).toBe(1);
  });

  it("flushes queued events and clears the queue on success", async () => {
    enqueueAuditEvent({ type: "chat.started", payload: { sessionId: "s1" } });
    markAuditFailure("503 service unavailable");

    const deliver = vi.fn().mockResolvedValue(undefined);
    const status = await flushAuditQueue(deliver);

    expect(deliver).toHaveBeenCalledWith([
      expect.objectContaining({
        type: "chat.started",
        payload: { sessionId: "s1" },
      }),
    ]);
    expect(status.health).toBe("healthy");
    expect(status.queuedEvents).toBe(0);
    expect(status.lastError).toBeNull();
  });

  it("keeps events buffered when flush fails", async () => {
    enqueueAuditEvent({ type: "chat.started", payload: { sessionId: "s1" } });

    const status = await flushAuditQueue(
      vi.fn().mockRejectedValue(new Error("503 service unavailable")),
    );

    expect(status.health).toBe("buffering");
    expect(status.queuedEvents).toBe(1);
    expect(status.lastError).toContain("503");
  });

  it("requires re-auth when the audit API returns 401", async () => {
    enqueueAuditEvent({ type: "chat.started", payload: { sessionId: "s1" } });

    const unauthorized = Object.assign(new Error("401 Unauthorized"), {
      status: 401,
    });
    const status = await flushAuditQueue(
      vi.fn().mockRejectedValue(unauthorized),
    );

    expect(status.health).toBe("reauth-required");
    expect(status.queuedEvents).toBe(1);
  });
});
