use std::fmt::{Display, Formatter};

use postgres::{Client, NoTls};
use serde::Serialize;

use crate::auth::{AuthPrincipal, AuthTenant};

pub const DESKTOP_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS platform_desktop_model_profiles (
    id VARCHAR(128) PRIMARY KEY,
    tenant_id BIGINT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    provider VARCHAR(64) NOT NULL,
    model VARCHAR(128) NOT NULL,
    label VARCHAR(255) NOT NULL,
    base_url VARCHAR(512) NOT NULL DEFAULT '',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_desktop_skill_catalog (
    id VARCHAR(128) PRIMARY KEY,
    scope VARCHAR(32) NOT NULL,
    tenant_id BIGINT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(64) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    download_url VARCHAR(1024) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (scope IN ('global', 'tenant')),
    CHECK (
        (scope = 'global' AND tenant_id IS NULL)
        OR (scope = 'tenant' AND tenant_id IS NOT NULL)
    )
);
"#;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopTenantView {
    pub id: String,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUserView {
    pub id: String,
    pub username: String,
    pub display_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopFeatures {
    pub gateway_visible: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBootstrapResponse {
    pub tenant: DesktopTenantView,
    pub user: DesktopUserView,
    pub locale: String,
    pub features: DesktopFeatures,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopModelProfile {
    pub id: String,
    pub provider: String,
    pub model: String,
    pub label: String,
    pub base_url: String,
    pub is_default: bool,
    #[serde(skip_serializing)]
    pub tenant_id: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DesktopModelProfilesResponse {
    pub items: Vec<DesktopModelProfile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSkillCatalogItem {
    pub id: String,
    pub scope: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DesktopSkillCatalogResponse {
    pub items: Vec<DesktopSkillCatalogItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DesktopError {
    Forbidden(String),
    Store(String),
}

impl Display for DesktopError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Forbidden(message) | Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for DesktopError {}

#[derive(Debug)]
pub struct DesktopStoreError(pub String);

impl Display for DesktopStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for DesktopStoreError {}

impl From<postgres::Error> for DesktopStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait DesktopStore {
    fn list_model_profiles(
        &mut self,
        tenant_id: i64,
    ) -> Result<Vec<DesktopModelProfile>, DesktopStoreError>;

    fn list_skill_catalog(
        &mut self,
        tenant_id: i64,
    ) -> Result<Vec<DesktopSkillCatalogItem>, DesktopStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgDesktopStore {
    database_url: String,
}

impl PgDesktopStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    pub fn ensure_schema(&self) -> Result<(), DesktopStoreError> {
        let mut client = self.connect()?;
        client.batch_execute(DESKTOP_SCHEMA_SQL)?;
        Ok(())
    }

    fn connect(&self) -> Result<Client, DesktopStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl DesktopStore for PgDesktopStore {
    fn list_model_profiles(
        &mut self,
        tenant_id: i64,
    ) -> Result<Vec<DesktopModelProfile>, DesktopStoreError> {
        let mut client = self.connect()?;
        let rows = client.query(
            "
            SELECT id, tenant_id, provider, model, label, base_url, is_default
            FROM platform_desktop_model_profiles
            WHERE is_active = TRUE
              AND (tenant_id IS NULL OR tenant_id = $1)
            ORDER BY is_default DESC, id ASC
            ",
            &[&tenant_id],
        )?;

        Ok(rows
            .into_iter()
            .map(|row| DesktopModelProfile {
                id: row.get("id"),
                provider: row.get("provider"),
                model: row.get("model"),
                label: row.get("label"),
                base_url: row.get("base_url"),
                is_default: row.get("is_default"),
                tenant_id: row.get("tenant_id"),
            })
            .collect())
    }

    fn list_skill_catalog(
        &mut self,
        tenant_id: i64,
    ) -> Result<Vec<DesktopSkillCatalogItem>, DesktopStoreError> {
        let mut client = self.connect()?;
        let rows = client.query(
            "
            SELECT id, scope, name, version, description, download_url
            FROM platform_desktop_skill_catalog
            WHERE is_active = TRUE
              AND (tenant_id IS NULL OR tenant_id = $1)
            ORDER BY scope ASC, id ASC
            ",
            &[&tenant_id],
        )?;

        Ok(rows
            .into_iter()
            .map(|row| DesktopSkillCatalogItem {
                id: row.get("id"),
                scope: row.get("scope"),
                name: row.get("name"),
                version: row.get("version"),
                description: row.get("description"),
                download_url: row.get("download_url"),
            })
            .collect())
    }
}

pub fn desktop_bootstrap_for_actor<S: DesktopStore>(
    _store: &mut S,
    actor: &AuthPrincipal,
) -> Result<DesktopBootstrapResponse, DesktopError> {
    let tenant = tenant_context(actor)?;

    Ok(DesktopBootstrapResponse {
        tenant: DesktopTenantView {
            id: tenant.id.to_string(),
            code: tenant.code.clone(),
            name: tenant.name.clone(),
        },
        user: DesktopUserView {
            id: actor.user.id.to_string(),
            username: actor.user.username.clone(),
            display_name: actor.user.display_name.clone(),
        },
        locale: "zh-CN".to_string(),
        features: DesktopFeatures {
            gateway_visible: false,
        },
    })
}

pub fn desktop_model_profiles_for_actor<S: DesktopStore>(
    store: &mut S,
    actor: &AuthPrincipal,
) -> Result<DesktopModelProfilesResponse, DesktopError> {
    let tenant = tenant_context(actor)?;
    let mut items = store
        .list_model_profiles(tenant.id)
        .map_err(|error| DesktopError::Store(error.to_string()))?;
    let has_tenant_default = items
        .iter()
        .any(|item| item.tenant_id == Some(tenant.id) && item.is_default);
    let has_global_default = items
        .iter()
        .any(|item| item.tenant_id.is_none() && item.is_default);

    if has_tenant_default {
        for item in &mut items {
            item.is_default = item.tenant_id == Some(tenant.id) && item.is_default;
        }
    } else if has_global_default {
        for item in &mut items {
            item.is_default = item.tenant_id.is_none() && item.is_default;
        }
    }

    Ok(DesktopModelProfilesResponse { items })
}

pub fn desktop_skill_catalog_for_actor<S: DesktopStore>(
    store: &mut S,
    actor: &AuthPrincipal,
) -> Result<DesktopSkillCatalogResponse, DesktopError> {
    let tenant = tenant_context(actor)?;
    let items = store
        .list_skill_catalog(tenant.id)
        .map_err(|error| DesktopError::Store(error.to_string()))?;
    Ok(DesktopSkillCatalogResponse { items })
}

fn tenant_context(actor: &AuthPrincipal) -> Result<&AuthTenant, DesktopError> {
    match (actor.user.scope_type.as_str(), actor.tenant.as_ref()) {
        ("tenant", Some(tenant)) => Ok(tenant),
        _ => Err(DesktopError::Forbidden(
            "desktop delivery requires a tenant-scoped actor".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthPrincipal, AuthUser};

    #[derive(Default)]
    struct MemoryDesktopStore {
        models: Vec<DesktopModelProfile>,
        skills: Vec<DesktopSkillCatalogItem>,
    }

    impl DesktopStore for MemoryDesktopStore {
        fn list_model_profiles(
            &mut self,
            _tenant_id: i64,
        ) -> Result<Vec<DesktopModelProfile>, DesktopStoreError> {
            Ok(self.models.clone())
        }

        fn list_skill_catalog(
            &mut self,
            _tenant_id: i64,
        ) -> Result<Vec<DesktopSkillCatalogItem>, DesktopStoreError> {
            Ok(self.skills.clone())
        }
    }

    fn sample_tenant_admin_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: Some(AuthTenant {
                id: 7,
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
                is_active: true,
            }),
            user: AuthUser {
                id: 42,
                username: "admin".to_string(),
                display_name: "ACME Admin".to_string(),
                role_code: "tenant_admin".to_string(),
                scope_type: "tenant".to_string(),
                is_active: true,
            },
            password_hash: String::new(),
        }
    }

    #[test]
    fn tenant_actor_receives_bootstrap_models_and_skill_catalog() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryDesktopStore::default();
        store.models = vec![DesktopModelProfile {
            id: "model-default".to_string(),
            provider: "openai".to_string(),
            model: "gpt-5.4".to_string(),
            label: "GPT-5.4".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            is_default: true,
            tenant_id: None,
        }];
        store.skills = vec![DesktopSkillCatalogItem {
            id: "skill-global-1".to_string(),
            scope: "global".to_string(),
            name: "Image OCR".to_string(),
            version: "1.0.0".to_string(),
            description: "OCR skill".to_string(),
            download_url: "https://example.com/ocr.zip".to_string(),
        }];

        let bootstrap =
            desktop_bootstrap_for_actor(&mut store, &actor).expect("bootstrap should succeed");
        let models =
            desktop_model_profiles_for_actor(&mut store, &actor).expect("models should succeed");
        let skills =
            desktop_skill_catalog_for_actor(&mut store, &actor).expect("skills should succeed");

        assert_eq!(bootstrap.tenant.code, "acme");
        assert_eq!(bootstrap.user.username, "admin");
        assert_eq!(models.items.len(), 1);
        assert_eq!(skills.items.len(), 1);
    }

    #[test]
    fn tenant_default_model_overrides_global_default_in_desktop_view() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryDesktopStore::default();
        store.models = vec![
            DesktopModelProfile {
                id: "global-default".to_string(),
                provider: "openai".to_string(),
                model: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
                tenant_id: None,
            },
            DesktopModelProfile {
                id: "tenant-default".to_string(),
                provider: "openai".to_string(),
                model: "gpt-4.1".to_string(),
                label: "GPT-4.1 Tenant".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
                tenant_id: Some(7),
            },
        ];

        let models =
            desktop_model_profiles_for_actor(&mut store, &actor).expect("models should succeed");

        let defaults = models
            .items
            .iter()
            .filter(|item| item.is_default)
            .map(|item| item.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(defaults, vec!["tenant-default"]);
    }
}
