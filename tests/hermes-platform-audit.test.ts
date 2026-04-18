import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const enqueueAuditEvent = vi.fn();
const markAuditFailure = vi.fn();
const flushWorkspaceAuditEvents = vi.fn().mockResolvedValue({
  health: "healthy",
  queuedEvents: 0,
  droppedEvents: 0,
  lastError: null,
});
const getWorkspaceRuntime = vi.fn().mockReturnValue(null);
const getModelConfig = vi.fn().mockReturnValue({
  provider: "openai",
  model: "gpt-5.4",
  baseUrl: "https://api.openai.com/v1",
});
const readEnv = vi.fn().mockReturnValue({});
const httpGet = vi.fn();
const httpRequest = vi.fn();
const spawn = vi.fn();

vi.mock("../src/main/platform/audit", () => ({
  enqueueAuditEvent,
  markAuditFailure,
}));

vi.mock("../src/main/platform/runtime", () => ({
  flushWorkspaceAuditEvents,
  getWorkspaceRuntime,
}));

vi.mock("../src/main/config", () => ({
  getModelConfig,
  readEnv,
}));

vi.mock("../src/main/installer", () => ({
  HERMES_HOME: "/tmp/hermes-home",
  HERMES_REPO: "/tmp/hermes-repo",
  HERMES_PYTHON: "python3",
  HERMES_SCRIPT: "hermes.py",
  getEnhancedPath: () => process.env.PATH || "",
}));

vi.mock("../src/main/utils", () => ({
  stripAnsi: (value: string) => value,
}));

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(false),
    readFileSync: vi.fn(),
    appendFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

vi.mock("http", () => ({
  default: {
    get: httpGet,
    request: httpRequest,
  },
}));

vi.mock("child_process", () => ({
  default: {
    spawn,
  },
  ChildProcess: class {},
  spawn,
}));

function createRequestHandle(): EventEmitter & {
  destroy: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  on: (event: string, listener: (...args: unknown[]) => void) => EventEmitter;
  write: ReturnType<typeof vi.fn>;
} {
  const request = new EventEmitter() as EventEmitter & {
    destroy: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
  };
  request.destroy = vi.fn();
  request.write = vi.fn();
  request.end = vi.fn();
  return request;
}

describe("hermes platform audit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    flushWorkspaceAuditEvents.mockResolvedValue({
      health: "healthy",
      queuedEvents: 0,
      droppedEvents: 0,
      lastError: null,
    });
  });

  afterEach(async () => {
    const hermes = await import("../src/main/hermes");
    hermes.stopHealthPolling();
  });

  it("records a chat failure audit event when the API request fails", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.resume = vi.fn();
      callback(response);

      const request = createRequestHandle();
      return request;
    });

    httpRequest.mockImplementation((_url, _options, callback) => {
      const request = createRequestHandle();
      request.end.mockImplementation(() => {
        const response = new EventEmitter() as EventEmitter & {
          headers: Record<string, string>;
          statusCode: number;
        };
        response.statusCode = 500;
        response.headers = {};
        callback(response);
        response.emit(
          "data",
          Buffer.from(JSON.stringify({ error: { message: "upstream failure" } })),
        );
        response.emit("end");
      });
      return request;
    });

    const hermes = await import("../src/main/hermes");
    const errorPromise = new Promise<string>((resolve) => {
      void hermes.sendMessage(
        "hello platform",
        {
          onChunk: vi.fn(),
          onDone: vi.fn(),
          onError: resolve,
        },
        "default",
      );
    });

    await expect(errorPromise).resolves.toBe("upstream failure");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.started",
        payload: expect.objectContaining({
          messageLength: "hello platform".length,
          profile: "default",
          resumeSessionId: null,
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.failed",
        payload: expect.objectContaining({
          error: "upstream failure",
          profile: "default",
          resumeSessionId: null,
          sessionId: null,
        }),
      }),
    );
    expect(markAuditFailure).toHaveBeenCalledWith("upstream failure");
    expect(flushWorkspaceAuditEvents).toHaveBeenCalledTimes(2);
  });

  it("records chat lifecycle audit events when falling back to the CLI", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 503;
      response.resume = vi.fn();
      callback(response);

      return createRequestHandle();
    });

    spawn.mockImplementation(() => {
      const process = new EventEmitter() as EventEmitter & {
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
        stderr: EventEmitter;
        stdout: EventEmitter;
        unref: ReturnType<typeof vi.fn>;
      };
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.kill = vi.fn();
      process.unref = vi.fn();
      process.killed = false;

      queueMicrotask(() => {
        process.stdout.emit("data", Buffer.from("session_id: cli-session\n"));
        process.emit("close", 0);
      });

      return process;
    });

    const hermes = await import("../src/main/hermes");
    const donePromise = new Promise<string | undefined>((resolve) => {
      void hermes.sendMessage(
        "hello from cli",
        {
          onChunk: vi.fn(),
          onDone: resolve,
          onError: vi.fn(),
        },
        "default",
      );
    });

    await expect(donePromise).resolves.toBe("cli-session");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.started",
        payload: expect.objectContaining({
          messageLength: "hello from cli".length,
          profile: "default",
          resumeSessionId: null,
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.completed",
        payload: expect.objectContaining({
          sessionId: "cli-session",
          profile: "default",
          resumeSessionId: null,
        }),
      }),
    );
    expect(markAuditFailure).not.toHaveBeenCalled();
    expect(flushWorkspaceAuditEvents).toHaveBeenCalledTimes(2);
  });

  it("adds sessionId to chat lifecycle audit events when resuming an existing session", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.resume = vi.fn();
      callback(response);

      return createRequestHandle();
    });

    httpRequest.mockImplementation((_url, _options, callback) => {
      const request = createRequestHandle();
      request.end.mockImplementation(() => {
        const response = new EventEmitter() as EventEmitter & {
          headers: Record<string, string>;
          statusCode: number;
        };
        response.statusCode = 500;
        response.headers = {};
        callback(response);
        response.emit(
          "data",
          Buffer.from(JSON.stringify({ error: { message: "resume failed" } })),
        );
        response.emit("end");
      });
      return request;
    });

    const hermes = await import("../src/main/hermes");
    const errorPromise = new Promise<string>((resolve) => {
      void hermes.sendMessage(
        "resume failed",
        {
          onChunk: vi.fn(),
          onDone: vi.fn(),
          onError: resolve,
        },
        "default",
        "session-existing",
      );
    });

    await expect(errorPromise).resolves.toBe("resume failed");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.started",
        payload: expect.objectContaining({
          sessionId: "session-existing",
          resumeSessionId: "session-existing",
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "chat.failed",
        payload: expect.objectContaining({
          sessionId: "session-existing",
          resumeSessionId: "session-existing",
        }),
      }),
    );
  });

  it("records run tool lifecycle events for API streaming tool updates", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.resume = vi.fn();
      callback(response);

      return createRequestHandle();
    });

    httpRequest.mockImplementation((_url, _options, callback) => {
      const request = createRequestHandle();
      request.end.mockImplementation(() => {
        const response = new EventEmitter() as EventEmitter & {
          headers: Record<string, string>;
          statusCode: number;
        };
        response.statusCode = 200;
        response.headers = {
          "x-hermes-session-id": "session-tool-1",
        };
        callback(response);
        response.emit(
          "data",
          Buffer.from(
            'event: hermes.tool.progress\ndata: {"emoji":"🔍","tool":"search_web"}\n\n',
          ),
        );
        response.emit(
          "data",
          Buffer.from(
            'data: {"choices":[{"delta":{"content":"Tool finished."}}]}\n\n',
          ),
        );
        response.emit("data", Buffer.from("data: [DONE]\n\n"));
        response.emit("end");
      });
      return request;
    });

    const onToolProgress = vi.fn();
    const hermes = await import("../src/main/hermes");
    const donePromise = new Promise<string | undefined>((resolve) => {
      void hermes.sendMessage(
        "run tool please",
        {
          onChunk: vi.fn(),
          onDone: resolve,
          onError: vi.fn(),
          onToolProgress,
        },
        "default",
      );
    });

    await expect(donePromise).resolves.toBe("session-tool-1");

    expect(onToolProgress).toHaveBeenCalledWith("🔍 search_web");
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.started",
        payload: expect.objectContaining({
          label: "🔍 search_web",
          profile: "default",
          resumeSessionId: null,
          sessionId: "session-tool-1",
          source: "api",
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.progress",
        payload: expect.objectContaining({
          label: "🔍 search_web",
          profile: "default",
          resumeSessionId: null,
          sessionId: "session-tool-1",
          source: "api",
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.completed",
        payload: expect.objectContaining({
          profile: "default",
          resumeSessionId: null,
          sessionId: "session-tool-1",
          source: "api",
          progressCount: 1,
          lastLabel: "🔍 search_web",
        }),
      }),
    );
  });

  it("records run tool failed events when API tool execution ends with a stream error", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 200;
      response.resume = vi.fn();
      callback(response);

      return createRequestHandle();
    });

    httpRequest.mockImplementation((_url, _options, callback) => {
      const request = createRequestHandle();
      request.end.mockImplementation(() => {
        const response = new EventEmitter() as EventEmitter & {
          headers: Record<string, string>;
          statusCode: number;
        };
        response.statusCode = 200;
        response.headers = {
          "x-hermes-session-id": "session-tool-fail",
        };
        callback(response);
        response.emit(
          "data",
          Buffer.from(
            'event: hermes.tool.progress\ndata: {"emoji":"🛠","tool":"apply_patch"}\n\n',
          ),
        );
        response.emit("error", new Error("stream exploded"));
      });
      return request;
    });

    const hermes = await import("../src/main/hermes");
    const errorPromise = new Promise<string>((resolve) => {
      void hermes.sendMessage(
        "cause tool failure",
        {
          onChunk: vi.fn(),
          onDone: vi.fn(),
          onError: resolve,
          onToolProgress: vi.fn(),
        },
        "default",
      );
    });

    await expect(errorPromise).resolves.toBe("Stream error: stream exploded");

    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.failed",
        payload: expect.objectContaining({
          profile: "default",
          resumeSessionId: null,
          sessionId: "session-tool-fail",
          source: "api",
          progressCount: 1,
          lastLabel: "🛠 apply_patch",
          error: "Stream error: stream exploded",
        }),
      }),
    );
  });

  it("records run tool lifecycle events when falling back to the CLI", async () => {
    httpGet.mockImplementation((_url, _options, callback) => {
      const response = new EventEmitter() as EventEmitter & {
        resume: () => void;
        statusCode: number;
      };
      response.statusCode = 503;
      response.resume = vi.fn();
      callback(response);

      return createRequestHandle();
    });

    spawn.mockImplementation(() => {
      const process = new EventEmitter() as EventEmitter & {
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
        stderr: EventEmitter;
        stdout: EventEmitter;
        unref: ReturnType<typeof vi.fn>;
      };
      process.stdout = new EventEmitter();
      process.stderr = new EventEmitter();
      process.kill = vi.fn();
      process.unref = vi.fn();
      process.killed = false;

      queueMicrotask(() => {
        process.stdout.emit("data", Buffer.from("session_id: cli-tool-session\n"));
        process.stdout.emit("data", Buffer.from("`🔍 search_web`\n"));
        process.stdout.emit("data", Buffer.from("Final answer from CLI\n"));
        process.emit("close", 0);
      });

      return process;
    });

    const onChunk = vi.fn();
    const onToolProgress = vi.fn();
    const hermes = await import("../src/main/hermes");
    const donePromise = new Promise<string | undefined>((resolve) => {
      void hermes.sendMessage(
        "run tool in cli",
        {
          onChunk,
          onDone: resolve,
          onError: vi.fn(),
          onToolProgress,
        },
        "default",
      );
    });

    await expect(donePromise).resolves.toBe("cli-tool-session");

    expect(onToolProgress).toHaveBeenCalledWith("🔍 search_web");
    expect(onChunk).toHaveBeenCalledWith("Final answer from CLI\n");
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.started",
        payload: expect.objectContaining({
          label: "🔍 search_web",
          profile: "default",
          resumeSessionId: null,
          sessionId: "cli-tool-session",
          source: "cli",
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.progress",
        payload: expect.objectContaining({
          label: "🔍 search_web",
          profile: "default",
          resumeSessionId: null,
          sessionId: "cli-tool-session",
          source: "cli",
        }),
      }),
    );
    expect(enqueueAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "run.tool.completed",
        payload: expect.objectContaining({
          profile: "default",
          resumeSessionId: null,
          sessionId: "cli-tool-session",
          source: "cli",
          progressCount: 1,
          lastLabel: "🔍 search_web",
        }),
      }),
    );
  });
});
