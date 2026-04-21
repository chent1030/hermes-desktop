import type {
  SkillCatalogItem,
  WorkspaceModel,
} from "../../shared/platform/contracts";
import type { QueuedAuditEvent } from "./audit";

const PLATFORM_BASE_URL =
  process.env.HERMES_PLATFORM_URL || "http://127.0.0.1:8080";

export class PlatformRequestError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PlatformRequestError";
    this.status = status;
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const text = await response.text();

  if (!text) {
    return fallback;
  }

  try {
    const body = JSON.parse(text) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall back to raw text when the response is not JSON.
  }

  return text.trim() || fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PLATFORM_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    throw new PlatformRequestError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export function loginRequest(body: {
  tenantCode: string;
  username: string;
  password: string;
}): Promise<{ accessToken: string; refreshToken: string }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function refreshRequest(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  return request("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refreshToken }),
  });
}

export function fetchBootstrap(accessToken: string): Promise<{
  tenant: { id: string; code: string; name: string };
  user: { id: string; username: string; displayName: string };
  locale: "en" | "zh-CN";
  features: { gatewayVisible: boolean };
}> {
  return request("/api/desktop/bootstrap", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function fetchModels(
  accessToken: string,
): Promise<{ items: WorkspaceModel[] }> {
  return request("/api/desktop/model-profiles", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function fetchSkillCatalog(
  accessToken: string,
): Promise<{ items: SkillCatalogItem[] }> {
  return request("/api/desktop/skills/catalog", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

export function postAuditEvents(
  accessToken: string,
  events: QueuedAuditEvent[],
): Promise<void> {
  return request("/api/audit/events:batch", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ events }),
  });
}

export function fetchAuditHealth(
  accessToken: string,
): Promise<{ status: string }> {
  return request("/api/audit/health", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
