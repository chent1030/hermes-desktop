use std::fmt::{Display, Formatter};
use std::time::{SystemTime, UNIX_EPOCH};

use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthPrincipal, AuthTenant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogRecord {
    pub id: String,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillCatalogInput {
    pub tenant_id: Option<i64>,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkillCatalogError {
    InvalidRequest(String),
    Forbidden(String),
    Conflict(String),
    NotFound(String),
    Store(String),
}

impl Display for SkillCatalogError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message)
            | Self::Forbidden(message)
            | Self::Conflict(message)
            | Self::NotFound(message)
            | Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for SkillCatalogError {}

#[derive(Debug)]
pub struct SkillCatalogStoreError(pub String);

impl Display for SkillCatalogStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for SkillCatalogStoreError {}

impl From<postgres::Error> for SkillCatalogStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait SkillCatalogStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, SkillCatalogStoreError>;
    fn list_skill_catalog(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<SkillCatalogRecord>, SkillCatalogStoreError>;
    fn create_skill_catalog_item(
        &mut self,
        id: &str,
        tenant_id: Option<i64>,
        name: &str,
        version: &str,
        description: &str,
        download_url: &str,
    ) -> Result<SkillCatalogRecord, SkillCatalogStoreError>;
    fn find_skill_catalog_item(
        &mut self,
        id: &str,
    ) -> Result<Option<SkillCatalogRecord>, SkillCatalogStoreError>;
    fn deactivate_skill_catalog_item(&mut self, id: &str) -> Result<(), SkillCatalogStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgSkillCatalogStore {
    database_url: String,
}

impl PgSkillCatalogStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    fn connect(&self) -> Result<Client, SkillCatalogStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl SkillCatalogStore for PgSkillCatalogStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, SkillCatalogStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            WHERE id = $1
            ",
            &[&tenant_id],
        )?;
        Ok(row.map(|row| AuthTenant {
            id: row.get("id"),
            code: row.get("code"),
            name: row.get("name"),
            is_active: row.get("is_active"),
        }))
    }

    fn list_skill_catalog(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<SkillCatalogRecord>, SkillCatalogStoreError> {
        let mut client = self.connect()?;
        let rows = if let Some(tenant_id) = tenant_id {
            client.query(
                "
                SELECT
                    s.id,
                    s.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    s.name,
                    s.version,
                    s.description,
                    s.download_url,
                    s.is_active
                FROM platform_desktop_skill_catalog s
                LEFT JOIN platform_admin_tenants t ON t.id = s.tenant_id
                WHERE s.tenant_id = $1
                ORDER BY s.is_active DESC, s.name ASC, s.version DESC, s.id ASC
                ",
                &[&tenant_id],
            )?
        } else {
            client.query(
                "
                SELECT
                    s.id,
                    s.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    s.name,
                    s.version,
                    s.description,
                    s.download_url,
                    s.is_active
                FROM platform_desktop_skill_catalog s
                LEFT JOIN platform_admin_tenants t ON t.id = s.tenant_id
                WHERE s.tenant_id IS NULL
                ORDER BY s.is_active DESC, s.name ASC, s.version DESC, s.id ASC
                ",
                &[],
            )?
        };

        Ok(rows.into_iter().map(row_to_skill_catalog).collect())
    }

    fn create_skill_catalog_item(
        &mut self,
        id: &str,
        tenant_id: Option<i64>,
        name: &str,
        version: &str,
        description: &str,
        download_url: &str,
    ) -> Result<SkillCatalogRecord, SkillCatalogStoreError> {
        let mut client = self.connect()?;
        let scope = if tenant_id.is_some() { "tenant" } else { "global" };
        let row = client.query_one(
            "
            INSERT INTO platform_desktop_skill_catalog (
                id,
                scope,
                tenant_id,
                name,
                version,
                description,
                download_url,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING id, tenant_id, name, version, description, download_url, is_active
            ",
            &[&id, &scope, &tenant_id, &name, &version, &description, &download_url],
        )?;

        let tenant = tenant_id
            .map(|value| self.find_tenant(value))
            .transpose()?
            .flatten();

        Ok(SkillCatalogRecord {
            id: row.get("id"),
            scope_type: scope.to_string(),
            tenant,
            name: row.get("name"),
            version: row.get("version"),
            description: row.get("description"),
            download_url: row.get("download_url"),
            is_active: row.get("is_active"),
        })
    }

    fn find_skill_catalog_item(
        &mut self,
        id: &str,
    ) -> Result<Option<SkillCatalogRecord>, SkillCatalogStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                s.id,
                s.tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                t.is_active AS tenant_is_active,
                s.name,
                s.version,
                s.description,
                s.download_url,
                s.is_active
            FROM platform_desktop_skill_catalog s
            LEFT JOIN platform_admin_tenants t ON t.id = s.tenant_id
            WHERE s.id = $1
            ",
            &[&id],
        )?;
        Ok(row.map(row_to_skill_catalog))
    }

    fn deactivate_skill_catalog_item(&mut self, id: &str) -> Result<(), SkillCatalogStoreError> {
        let mut client = self.connect()?;
        client.execute(
            "
            UPDATE platform_desktop_skill_catalog
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            ",
            &[&id],
        )?;
        Ok(())
    }
}

pub fn list_skill_catalog_for_actor<S: SkillCatalogStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<SkillCatalogRecord>, SkillCatalogError> {
    match actor.user.role_code.as_str() {
        "super_admin" => {
            if let Some(tenant_id) = requested_tenant_id {
                let tenant = store
                    .find_tenant(tenant_id)
                    .map_err(|error| SkillCatalogError::Store(error.to_string()))?
                    .ok_or(SkillCatalogError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(SkillCatalogError::Conflict("tenant is inactive".to_string()));
                }
            }
            store
                .list_skill_catalog(requested_tenant_id)
                .map_err(|error| SkillCatalogError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                SkillCatalogError::Forbidden(
                    "tenant admin must belong to a tenant".to_string(),
                ),
            )?;
            store
                .list_skill_catalog(Some(tenant_id))
                .map_err(|error| SkillCatalogError::Store(error.to_string()))
        }
        _ => Err(SkillCatalogError::Forbidden(
            "actor is not allowed to list skill catalog".to_string(),
        )),
    }
}

pub fn create_skill_catalog_item_for_actor<S: SkillCatalogStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    input: CreateSkillCatalogInput,
) -> Result<SkillCatalogRecord, SkillCatalogError> {
    validate_skill_catalog_input(&input)?;

    match actor.user.role_code.as_str() {
        "super_admin" => {
            if let Some(tenant_id) = input.tenant_id {
                let tenant = store
                    .find_tenant(tenant_id)
                    .map_err(|error| SkillCatalogError::Store(error.to_string()))?
                    .ok_or(SkillCatalogError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(SkillCatalogError::Conflict("tenant is inactive".to_string()));
                }
            }

            store
                .create_skill_catalog_item(
                    &next_skill_catalog_id(),
                    input.tenant_id,
                    input.name.trim(),
                    input.version.trim(),
                    input.description.trim(),
                    input.download_url.trim(),
                )
                .map_err(map_store_write_error)
        }
        "tenant_admin" => {
            let actor_tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                SkillCatalogError::Forbidden(
                    "tenant admin must belong to a tenant".to_string(),
                ),
            )?;
            match input.tenant_id {
                None => {
                    return Err(SkillCatalogError::Forbidden(
                        "tenant admin cannot manage global skill catalog".to_string(),
                    ))
                }
                Some(tenant_id) if tenant_id != actor_tenant_id => {
                    return Err(SkillCatalogError::Forbidden(
                        "tenant admin can only manage own tenant skill catalog".to_string(),
                    ))
                }
                _ => {}
            }

            store
                .create_skill_catalog_item(
                    &next_skill_catalog_id(),
                    Some(actor_tenant_id),
                    input.name.trim(),
                    input.version.trim(),
                    input.description.trim(),
                    input.download_url.trim(),
                )
                .map_err(map_store_write_error)
        }
        _ => Err(SkillCatalogError::Forbidden(
            "actor is not allowed to create skill catalog".to_string(),
        )),
    }
}

pub fn deactivate_skill_catalog_item_for_actor<S: SkillCatalogStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    skill_id: &str,
) -> Result<(), SkillCatalogError> {
    let record = store
        .find_skill_catalog_item(skill_id)
        .map_err(|error| SkillCatalogError::Store(error.to_string()))?
        .ok_or(SkillCatalogError::NotFound("skill catalog item not found".to_string()))?;

    match actor.user.role_code.as_str() {
        "super_admin" => store
            .deactivate_skill_catalog_item(skill_id)
            .map_err(|error| SkillCatalogError::Store(error.to_string())),
        "tenant_admin" => {
            let actor_tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                SkillCatalogError::Forbidden(
                    "tenant admin must belong to a tenant".to_string(),
                ),
            )?;
            if record.tenant.as_ref().map(|tenant| tenant.id) != Some(actor_tenant_id) {
                return Err(SkillCatalogError::Forbidden(
                    "tenant admin can only manage own tenant skill catalog".to_string(),
                ));
            }
            store
                .deactivate_skill_catalog_item(skill_id)
                .map_err(|error| SkillCatalogError::Store(error.to_string()))
        }
        _ => Err(SkillCatalogError::Forbidden(
            "actor is not allowed to deactivate skill catalog".to_string(),
        )),
    }
}

fn validate_skill_catalog_input(input: &CreateSkillCatalogInput) -> Result<(), SkillCatalogError> {
    if input.name.trim().is_empty() {
        return Err(SkillCatalogError::InvalidRequest(
            "name is required".to_string(),
        ));
    }
    if input.version.trim().is_empty() {
        return Err(SkillCatalogError::InvalidRequest(
            "version is required".to_string(),
        ));
    }
    if input.download_url.trim().is_empty() {
        return Err(SkillCatalogError::InvalidRequest(
            "downloadUrl is required".to_string(),
        ));
    }
    Ok(())
}

fn next_skill_catalog_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch");
    format!("skl_{}_{}", now.as_secs(), now.subsec_nanos())
}

fn map_store_write_error(error: SkillCatalogStoreError) -> SkillCatalogError {
    let message = error.to_string();
    if message.contains("duplicate key") || message.contains("unique constraint") {
        SkillCatalogError::Conflict("resource already exists".to_string())
    } else {
        SkillCatalogError::Store(message)
    }
}

fn row_to_skill_catalog(row: postgres::Row) -> SkillCatalogRecord {
    let tenant_id: Option<i64> = row.get("tenant_id");
    let tenant = tenant_id.map(|id| AuthTenant {
        id,
        code: row
            .get::<_, Option<String>>("tenant_code")
            .unwrap_or_default(),
        name: row
            .get::<_, Option<String>>("tenant_name")
            .unwrap_or_default(),
        is_active: row
            .get::<_, Option<bool>>("tenant_is_active")
            .unwrap_or(true),
    });

    SkillCatalogRecord {
        id: row.get("id"),
        scope_type: if tenant_id.is_some() {
            "tenant".to_string()
        } else {
            "global".to_string()
        },
        tenant,
        name: row.get("name"),
        version: row.get("version"),
        description: row.get("description"),
        download_url: row.get("download_url"),
        is_active: row.get("is_active"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::AuthUser;

    #[derive(Default)]
    struct MemorySkillCatalogStore {
        tenants: Vec<AuthTenant>,
        skills: Vec<SkillCatalogRecord>,
    }

    impl SkillCatalogStore for MemorySkillCatalogStore {
        fn find_tenant(
            &mut self,
            tenant_id: i64,
        ) -> Result<Option<AuthTenant>, SkillCatalogStoreError> {
            Ok(self
                .tenants
                .iter()
                .find(|tenant| tenant.id == tenant_id)
                .cloned())
        }

        fn list_skill_catalog(
            &mut self,
            tenant_id: Option<i64>,
        ) -> Result<Vec<SkillCatalogRecord>, SkillCatalogStoreError> {
            Ok(self
                .skills
                .iter()
                .filter(|record| record.tenant.as_ref().map(|tenant| tenant.id) == tenant_id)
                .cloned()
                .collect())
        }

        fn create_skill_catalog_item(
            &mut self,
            id: &str,
            tenant_id: Option<i64>,
            name: &str,
            version: &str,
            description: &str,
            download_url: &str,
        ) -> Result<SkillCatalogRecord, SkillCatalogStoreError> {
            let tenant = tenant_id.and_then(|value| {
                self.tenants
                    .iter()
                    .find(|tenant| tenant.id == value)
                    .cloned()
            });
            let record = SkillCatalogRecord {
                id: id.to_string(),
                scope_type: if tenant_id.is_some() {
                    "tenant".to_string()
                } else {
                    "global".to_string()
                },
                tenant,
                name: name.to_string(),
                version: version.to_string(),
                description: description.to_string(),
                download_url: download_url.to_string(),
                is_active: true,
            };
            self.skills.push(record.clone());
            Ok(record)
        }

        fn find_skill_catalog_item(
            &mut self,
            id: &str,
        ) -> Result<Option<SkillCatalogRecord>, SkillCatalogStoreError> {
            Ok(self.skills.iter().find(|record| record.id == id).cloned())
        }

        fn deactivate_skill_catalog_item(&mut self, id: &str) -> Result<(), SkillCatalogStoreError> {
            if let Some(record) = self.skills.iter_mut().find(|record| record.id == id) {
                record.is_active = false;
            }
            Ok(())
        }
    }

    fn sample_super_admin_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: None,
            user: AuthUser {
                id: 1,
                username: "root".to_string(),
                display_name: "Platform Root".to_string(),
                role_code: "super_admin".to_string(),
                scope_type: "platform".to_string(),
                is_active: true,
            },
            password_hash: String::new(),
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
    fn super_admin_can_create_global_skill_catalog_item() {
        let actor = sample_super_admin_principal();
        let mut store = MemorySkillCatalogStore::default();

        let created = create_skill_catalog_item_for_actor(
            &mut store,
            &actor,
            CreateSkillCatalogInput {
                tenant_id: None,
                name: "Code Review".to_string(),
                version: "1.0.0".to_string(),
                description: "Review code".to_string(),
                download_url: "https://example.com/skills/code-review.zip".to_string(),
            },
        )
        .expect("super admin should create global skill");

        assert_eq!(created.scope_type, "global");
        assert_eq!(created.name, "Code Review");
    }

    #[test]
    fn tenant_admin_cannot_create_global_skill_catalog_item() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySkillCatalogStore::default();

        let error = create_skill_catalog_item_for_actor(
            &mut store,
            &actor,
            CreateSkillCatalogInput {
                tenant_id: None,
                name: "Global OCR".to_string(),
                version: "1.0.0".to_string(),
                description: "OCR".to_string(),
                download_url: "https://example.com/skills/ocr.zip".to_string(),
            },
        )
        .expect_err("tenant admin must not create global skill");

        assert!(matches!(error, SkillCatalogError::Forbidden(_)));
    }
}
