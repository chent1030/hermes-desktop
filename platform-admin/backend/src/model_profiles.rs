use std::fmt::{Display, Formatter};
use std::time::{SystemTime, UNIX_EPOCH};

use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthPrincipal, AuthTenant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileRecord {
    pub id: String,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub provider: String,
    pub model: String,
    pub label: String,
    pub base_url: String,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateModelProfileInput {
    pub tenant_id: Option<i64>,
    pub provider: String,
    pub model: String,
    pub label: String,
    pub base_url: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelProfileError {
    InvalidRequest(String),
    Forbidden(String),
    Conflict(String),
    NotFound(String),
    Store(String),
}

impl Display for ModelProfileError {
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

impl std::error::Error for ModelProfileError {}

#[derive(Debug)]
pub struct ModelProfileStoreError(pub String);

impl Display for ModelProfileStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ModelProfileStoreError {}

impl From<postgres::Error> for ModelProfileStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait ModelProfileStore {
    fn find_tenant(&mut self, tenant_id: i64)
    -> Result<Option<AuthTenant>, ModelProfileStoreError>;
    fn list_model_profiles(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<ModelProfileRecord>, ModelProfileStoreError>;
    fn create_model_profile(
        &mut self,
        id: &str,
        tenant_id: Option<i64>,
        provider: &str,
        model: &str,
        label: &str,
        base_url: &str,
        is_default: bool,
    ) -> Result<ModelProfileRecord, ModelProfileStoreError>;
    fn find_model_profile(
        &mut self,
        id: &str,
    ) -> Result<Option<ModelProfileRecord>, ModelProfileStoreError>;
    fn deactivate_model_profile(&mut self, id: &str) -> Result<(), ModelProfileStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgModelProfileStore {
    database_url: String,
}

impl PgModelProfileStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    fn connect(&self) -> Result<Client, ModelProfileStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl ModelProfileStore for PgModelProfileStore {
    fn find_tenant(
        &mut self,
        tenant_id: i64,
    ) -> Result<Option<AuthTenant>, ModelProfileStoreError> {
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

    fn list_model_profiles(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<ModelProfileRecord>, ModelProfileStoreError> {
        let mut client = self.connect()?;
        let rows = if let Some(tenant_id) = tenant_id {
            client.query(
                "
                SELECT
                    m.id,
                    m.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    m.provider,
                    m.model,
                    m.label,
                    m.base_url,
                    m.is_default,
                    m.is_active
                FROM platform_desktop_model_profiles m
                LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
                WHERE m.tenant_id = $1
                ORDER BY m.is_default DESC, m.id ASC
                ",
                &[&tenant_id],
            )?
        } else {
            client.query(
                "
                SELECT
                    m.id,
                    m.tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    m.provider,
                    m.model,
                    m.label,
                    m.base_url,
                    m.is_default,
                    m.is_active
                FROM platform_desktop_model_profiles m
                LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
                WHERE m.tenant_id IS NULL
                ORDER BY m.is_default DESC, m.id ASC
                ",
                &[],
            )?
        };

        Ok(rows.into_iter().map(row_to_model_profile).collect())
    }

    fn create_model_profile(
        &mut self,
        id: &str,
        tenant_id: Option<i64>,
        provider: &str,
        model: &str,
        label: &str,
        base_url: &str,
        is_default: bool,
    ) -> Result<ModelProfileRecord, ModelProfileStoreError> {
        let mut client = self.connect()?;
        if is_default {
            client.execute(
                "
                UPDATE platform_desktop_model_profiles
                SET is_default = FALSE,
                    updated_at = NOW()
                WHERE (($1::bigint IS NULL AND tenant_id IS NULL) OR tenant_id = $1)
                  AND is_active = TRUE
                ",
                &[&tenant_id],
            )?;
        }

        let row = client.query_one(
            "
            INSERT INTO platform_desktop_model_profiles (
                id,
                tenant_id,
                provider,
                model,
                label,
                base_url,
                is_default,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING id, tenant_id, provider, model, label, base_url, is_default, is_active
            ",
            &[
                &id,
                &tenant_id,
                &provider,
                &model,
                &label,
                &base_url,
                &is_default,
            ],
        )?;

        let tenant = tenant_id
            .map(|value| self.find_tenant(value))
            .transpose()?
            .flatten();

        Ok(ModelProfileRecord {
            id: row.get("id"),
            scope_type: if tenant_id.is_some() {
                "tenant".to_string()
            } else {
                "global".to_string()
            },
            tenant,
            provider: row.get("provider"),
            model: row.get("model"),
            label: row.get("label"),
            base_url: row.get("base_url"),
            is_default: row.get("is_default"),
            is_active: row.get("is_active"),
        })
    }

    fn find_model_profile(
        &mut self,
        id: &str,
    ) -> Result<Option<ModelProfileRecord>, ModelProfileStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                m.id,
                m.tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                t.is_active AS tenant_is_active,
                m.provider,
                m.model,
                m.label,
                m.base_url,
                m.is_default,
                m.is_active
            FROM platform_desktop_model_profiles m
            LEFT JOIN platform_admin_tenants t ON t.id = m.tenant_id
            WHERE m.id = $1
            ",
            &[&id],
        )?;
        Ok(row.map(row_to_model_profile))
    }

    fn deactivate_model_profile(&mut self, id: &str) -> Result<(), ModelProfileStoreError> {
        let mut client = self.connect()?;
        client.execute(
            "
            UPDATE platform_desktop_model_profiles
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            ",
            &[&id],
        )?;
        Ok(())
    }
}

pub fn list_model_profiles_for_actor<S: ModelProfileStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<ModelProfileRecord>, ModelProfileError> {
    match actor.user.role_code.as_str() {
        "super_admin" => {
            if let Some(tenant_id) = requested_tenant_id {
                let tenant = store
                    .find_tenant(tenant_id)
                    .map_err(|error| ModelProfileError::Store(error.to_string()))?
                    .ok_or(ModelProfileError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(ModelProfileError::Conflict(
                        "tenant is inactive".to_string(),
                    ));
                }
            }
            store
                .list_model_profiles(requested_tenant_id)
                .map_err(|error| ModelProfileError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                ModelProfileError::Forbidden("tenant admin must belong to a tenant".to_string()),
            )?;
            store
                .list_model_profiles(Some(tenant_id))
                .map_err(|error| ModelProfileError::Store(error.to_string()))
        }
        _ => Err(ModelProfileError::Forbidden(
            "actor is not allowed to list model profiles".to_string(),
        )),
    }
}

pub fn create_model_profile_for_actor<S: ModelProfileStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    input: CreateModelProfileInput,
) -> Result<ModelProfileRecord, ModelProfileError> {
    validate_model_profile_input(&input)?;

    match actor.user.role_code.as_str() {
        "super_admin" => {
            if let Some(tenant_id) = input.tenant_id {
                let tenant = store
                    .find_tenant(tenant_id)
                    .map_err(|error| ModelProfileError::Store(error.to_string()))?
                    .ok_or(ModelProfileError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(ModelProfileError::Conflict(
                        "tenant is inactive".to_string(),
                    ));
                }
            }

            store
                .create_model_profile(
                    &next_model_profile_id(),
                    input.tenant_id,
                    input.provider.trim(),
                    input.model.trim(),
                    input.label.trim(),
                    input.base_url.trim(),
                    input.is_default,
                )
                .map_err(map_store_write_error)
        }
        "tenant_admin" => {
            let actor_tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                ModelProfileError::Forbidden("tenant admin must belong to a tenant".to_string()),
            )?;
            match input.tenant_id {
                None => {
                    return Err(ModelProfileError::Forbidden(
                        "tenant admin cannot manage global model profiles".to_string(),
                    ));
                }
                Some(tenant_id) if tenant_id != actor_tenant_id => {
                    return Err(ModelProfileError::Forbidden(
                        "tenant admin can only manage own tenant model profiles".to_string(),
                    ));
                }
                _ => {}
            }

            store
                .create_model_profile(
                    &next_model_profile_id(),
                    Some(actor_tenant_id),
                    input.provider.trim(),
                    input.model.trim(),
                    input.label.trim(),
                    input.base_url.trim(),
                    input.is_default,
                )
                .map_err(map_store_write_error)
        }
        _ => Err(ModelProfileError::Forbidden(
            "actor is not allowed to create model profiles".to_string(),
        )),
    }
}

pub fn deactivate_model_profile_for_actor<S: ModelProfileStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    model_id: &str,
) -> Result<(), ModelProfileError> {
    let record = store
        .find_model_profile(model_id)
        .map_err(|error| ModelProfileError::Store(error.to_string()))?
        .ok_or(ModelProfileError::NotFound(
            "model profile not found".to_string(),
        ))?;

    match actor.user.role_code.as_str() {
        "super_admin" => store
            .deactivate_model_profile(model_id)
            .map_err(|error| ModelProfileError::Store(error.to_string())),
        "tenant_admin" => {
            let actor_tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                ModelProfileError::Forbidden("tenant admin must belong to a tenant".to_string()),
            )?;
            if record.tenant.as_ref().map(|tenant| tenant.id) != Some(actor_tenant_id) {
                return Err(ModelProfileError::Forbidden(
                    "tenant admin can only manage own tenant model profiles".to_string(),
                ));
            }
            store
                .deactivate_model_profile(model_id)
                .map_err(|error| ModelProfileError::Store(error.to_string()))
        }
        _ => Err(ModelProfileError::Forbidden(
            "actor is not allowed to deactivate model profiles".to_string(),
        )),
    }
}

fn validate_model_profile_input(input: &CreateModelProfileInput) -> Result<(), ModelProfileError> {
    if input.provider.trim().is_empty() {
        return Err(ModelProfileError::InvalidRequest(
            "provider is required".to_string(),
        ));
    }
    if input.model.trim().is_empty() {
        return Err(ModelProfileError::InvalidRequest(
            "model is required".to_string(),
        ));
    }
    if input.label.trim().is_empty() {
        return Err(ModelProfileError::InvalidRequest(
            "label is required".to_string(),
        ));
    }
    Ok(())
}

fn next_model_profile_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch");
    format!("mdl_{}_{}", now.as_secs(), now.subsec_nanos())
}

fn map_store_write_error(error: ModelProfileStoreError) -> ModelProfileError {
    let message = error.to_string();
    if message.contains("duplicate key") || message.contains("unique constraint") {
        ModelProfileError::Conflict("resource already exists".to_string())
    } else {
        ModelProfileError::Store(message)
    }
}

fn row_to_model_profile(row: postgres::Row) -> ModelProfileRecord {
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

    ModelProfileRecord {
        id: row.get("id"),
        scope_type: if tenant_id.is_some() {
            "tenant".to_string()
        } else {
            "global".to_string()
        },
        tenant,
        provider: row.get("provider"),
        model: row.get("model"),
        label: row.get("label"),
        base_url: row.get("base_url"),
        is_default: row.get("is_default"),
        is_active: row.get("is_active"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::live_test_support::{
        acquire_live_postgres_guard, ensure_live_platform_schema, live_database_url, live_unique,
        seed_live_super_admin, seed_live_tenant_admin,
    };

    #[derive(Default)]
    struct MemoryModelProfileStore {
        tenants: Vec<AuthTenant>,
        models: Vec<ModelProfileRecord>,
    }

    impl ModelProfileStore for MemoryModelProfileStore {
        fn find_tenant(
            &mut self,
            tenant_id: i64,
        ) -> Result<Option<AuthTenant>, ModelProfileStoreError> {
            Ok(self
                .tenants
                .iter()
                .find(|tenant| tenant.id == tenant_id)
                .cloned())
        }

        fn list_model_profiles(
            &mut self,
            tenant_id: Option<i64>,
        ) -> Result<Vec<ModelProfileRecord>, ModelProfileStoreError> {
            Ok(self
                .models
                .iter()
                .filter(|item| item.tenant.as_ref().map(|tenant| tenant.id) == tenant_id)
                .cloned()
                .collect())
        }

        fn create_model_profile(
            &mut self,
            id: &str,
            tenant_id: Option<i64>,
            provider: &str,
            model: &str,
            label: &str,
            base_url: &str,
            is_default: bool,
        ) -> Result<ModelProfileRecord, ModelProfileStoreError> {
            let tenant = tenant_id.and_then(|value| {
                self.tenants
                    .iter()
                    .find(|tenant| tenant.id == value)
                    .cloned()
            });
            for item in &mut self.models {
                if item.tenant.as_ref().map(|tenant| tenant.id) == tenant_id && is_default {
                    item.is_default = false;
                }
            }
            let record = ModelProfileRecord {
                id: id.to_string(),
                scope_type: if tenant_id.is_some() {
                    "tenant".to_string()
                } else {
                    "global".to_string()
                },
                tenant,
                provider: provider.to_string(),
                model: model.to_string(),
                label: label.to_string(),
                base_url: base_url.to_string(),
                is_default,
                is_active: true,
            };
            self.models.push(record.clone());
            Ok(record)
        }

        fn find_model_profile(
            &mut self,
            id: &str,
        ) -> Result<Option<ModelProfileRecord>, ModelProfileStoreError> {
            Ok(self.models.iter().find(|item| item.id == id).cloned())
        }

        fn deactivate_model_profile(&mut self, id: &str) -> Result<(), ModelProfileStoreError> {
            if let Some(item) = self.models.iter_mut().find(|item| item.id == id) {
                item.is_active = false;
            }
            Ok(())
        }
    }

    fn sample_super_admin_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: None,
            user: crate::auth::AuthUser {
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
            user: crate::auth::AuthUser {
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
    fn super_admin_can_create_global_default_model_profile() {
        let actor = sample_super_admin_principal();
        let mut store = MemoryModelProfileStore::default();

        let created = create_model_profile_for_actor(
            &mut store,
            &actor,
            CreateModelProfileInput {
                tenant_id: None,
                provider: "openai".to_string(),
                model: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
            },
        )
        .expect("super admin should create global model");

        assert_eq!(created.scope_type, "global");
        assert!(created.is_default);
    }

    #[test]
    fn tenant_admin_cannot_create_global_model_profile() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryModelProfileStore::default();

        let error = create_model_profile_for_actor(
            &mut store,
            &actor,
            CreateModelProfileInput {
                tenant_id: None,
                provider: "openai".to_string(),
                model: "gpt-5.4".to_string(),
                label: "GPT-5.4".to_string(),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
            },
        )
        .expect_err("tenant admin should not create global model");

        assert_eq!(
            error,
            ModelProfileError::Forbidden(
                "tenant admin cannot manage global model profiles".to_string(),
            ),
        );
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn manages_live_model_profiles_for_global_and_tenant_scopes() {
        let _guard = acquire_live_postgres_guard();
        let database_url = live_database_url();
        ensure_live_platform_schema(&database_url);

        let unique = live_unique("model");
        let tenant_admin = seed_live_tenant_admin(
            &database_url,
            &format!("tenant-{unique}"),
            &format!("tenant_admin_{unique}"),
            "Stage2!Pass123",
        );
        let super_admin = seed_live_super_admin(
            &database_url,
            &format!("super_admin_{unique}"),
            "Stage2!Root123",
        );
        let tenant_id = tenant_admin
            .tenant
            .as_ref()
            .expect("tenant should exist")
            .id;
        let mut store = PgModelProfileStore::new(&database_url);

        let global = create_model_profile_for_actor(
            &mut store,
            &super_admin,
            CreateModelProfileInput {
                tenant_id: None,
                provider: "openai".to_string(),
                model: format!("gpt-global-{unique}"),
                label: format!("Global {unique}"),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
            },
        )
        .expect("global model should be created");
        let tenant = create_model_profile_for_actor(
            &mut store,
            &tenant_admin,
            CreateModelProfileInput {
                tenant_id: Some(tenant_id),
                provider: "openai".to_string(),
                model: format!("gpt-tenant-{unique}"),
                label: format!("Tenant {unique}"),
                base_url: "https://api.openai.com/v1".to_string(),
                is_default: true,
            },
        )
        .expect("tenant model should be created");

        let global_items = list_model_profiles_for_actor(&mut store, &super_admin, None)
            .expect("super admin should list global models");
        let tenant_items = list_model_profiles_for_actor(&mut store, &tenant_admin, None)
            .expect("tenant admin should list tenant models");

        assert!(
            global_items
                .iter()
                .any(|item| item.id == global.id && item.is_active)
        );
        assert!(
            tenant_items
                .iter()
                .any(|item| item.id == tenant.id && item.is_active)
        );

        deactivate_model_profile_for_actor(&mut store, &tenant_admin, &tenant.id)
            .expect("tenant model should be deactivated");

        let tenant_items = list_model_profiles_for_actor(&mut store, &tenant_admin, None)
            .expect("tenant admin should list tenant models after deactivation");

        assert!(
            tenant_items
                .iter()
                .any(|item| item.id == tenant.id && !item.is_active)
        );
    }
}
