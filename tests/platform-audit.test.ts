import { beforeEach, describe, expect, it } from "vitest";
import {
  enqueueAuditEvent,
  getAuditStatus,
  markAuditFailure,
  markAuditSuccess,
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

    markAuditSuccess();
    expect(getAuditStatus().health).toBe("healthy");
  });
});
