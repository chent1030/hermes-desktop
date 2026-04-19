export interface TenantLoginInput {
  tenantCode: string;
  username: string;
  password: string;
}

export interface PlatformUser {
  id: string;
  username: string;
  displayName: string;
}

export interface PlatformTenant {
  id: string;
  code: string;
  name: string;
}

export interface WorkspaceModel {
  id: string;
  provider: string;
  model: string;
  label: string;
  baseUrl: string;
  apiKey?: string;
  isDefault: boolean;
}

export interface SkillCatalogItem {
  id: string;
  scope: "global" | "tenant";
  name: string;
  version: string;
  description: string;
  downloadUrl: string;
}

export interface LocalSkillState {
  skillId: string;
  installed: boolean;
  version: string | null;
  status: "not-downloaded" | "downloaded" | "installed" | "outdated" | "broken";
  path: string | null;
}

export interface WorkspaceBootstrap {
  tenant: PlatformTenant;
  user: PlatformUser;
  locale: "en" | "zh-CN";
  features: {
    gatewayVisible: boolean;
  };
  models: WorkspaceModel[];
  selectedModelId: string;
  skills: SkillCatalogItem[];
}
