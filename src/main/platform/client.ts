import type {
  SkillCatalogItem,
  WorkspaceModel,
} from "../../shared/platform/contracts";

const PLATFORM_BASE_URL =
  process.env.HERMES_PLATFORM_URL || "http://127.0.0.1:8080";

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${PLATFORM_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
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
