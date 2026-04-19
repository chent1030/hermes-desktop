pub mod api;
pub mod application;
pub mod domain;
pub mod infrastructure;

use std::fmt::{Display, Formatter};

use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};

use crate::auth::{AuthPrincipal, AuthTenant, hash_password};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantRecord {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccountRecord {
    pub id: i64,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTenantInput {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccountInput {
    pub tenant_id: Option<i64>,
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdminError {
    InvalidRequest(String),
    Forbidden(String),
    Conflict(String),
    NotFound(String),
    Store(String),
}

impl Display for AdminError {
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

impl std::error::Error for AdminError {}

#[derive(Debug)]
pub struct AdminStoreError(pub String);

impl Display for AdminStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for AdminStoreError {}

impl From<postgres::Error> for AdminStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait AdminStore {
    fn list_tenants(&mut self) -> Result<Vec<TenantRecord>, AdminStoreError>;
    fn create_tenant(&mut self, code: &str, name: &str) -> Result<TenantRecord, AdminStoreError>;
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<TenantRecord>, AdminStoreError>;
    fn deactivate_tenant(&mut self, tenant_id: i64) -> Result<(), AdminStoreError>;
    fn list_accounts(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<AdminAccountRecord>, AdminStoreError>;
    fn create_account(
        &mut self,
        scope_type: &str,
        tenant_id: Option<i64>,
        username: &str,
        display_name: &str,
        password_hash: &str,
        role_code: &str,
    ) -> Result<AdminAccountRecord, AdminStoreError>;
    fn find_account(
        &mut self,
        account_id: i64,
    ) -> Result<Option<AdminAccountRecord>, AdminStoreError>;
    fn deactivate_account(&mut self, account_id: i64) -> Result<(), AdminStoreError>;
    fn count_active_platform_super_admin(&mut self) -> Result<i64, AdminStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgAdminStore {
    database_url: String,
}

impl PgAdminStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    fn connect(&self) -> Result<Client, AdminStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl AdminStore for PgAdminStore {
    fn list_tenants(&mut self) -> Result<Vec<TenantRecord>, AdminStoreError> {
        let mut client = self.connect()?;
        let rows = client.query(
            "
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            ORDER BY id DESC
            ",
            &[],
        )?;
        Ok(rows.into_iter().map(row_to_tenant).collect())
    }

    fn create_tenant(&mut self, code: &str, name: &str) -> Result<TenantRecord, AdminStoreError> {
        let mut client = self.connect()?;
        let row = client.query_one(
            "
            INSERT INTO platform_admin_tenants (code, name, is_active)
            VALUES ($1, $2, TRUE)
            RETURNING id, code, name, is_active
            ",
            &[&code, &name],
        )?;
        Ok(row_to_tenant(row))
    }

    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<TenantRecord>, AdminStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            WHERE id = $1
            ",
            &[&tenant_id],
        )?;
        Ok(row.map(row_to_tenant))
    }

    fn deactivate_tenant(&mut self, tenant_id: i64) -> Result<(), AdminStoreError> {
        let mut client = self.connect()?;
        client.execute(
            "
            UPDATE platform_admin_tenants
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            ",
            &[&tenant_id],
        )?;
        Ok(())
    }

    fn list_accounts(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<AdminAccountRecord>, AdminStoreError> {
        let mut client = self.connect()?;
        let rows = if let Some(tenant_id) = tenant_id {
            client.query(
                "
                SELECT
                    a.id AS account_id,
                    a.scope_type,
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.is_active AS account_is_active
                FROM platform_admin_accounts a
                LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
                WHERE a.tenant_id = $1
                ORDER BY a.id DESC
                ",
                &[&tenant_id],
            )?
        } else {
            client.query(
                "
                SELECT
                    a.id AS account_id,
                    a.scope_type,
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.is_active AS account_is_active
                FROM platform_admin_accounts a
                LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
                WHERE a.scope_type = 'tenant'
                ORDER BY a.id DESC
                ",
                &[],
            )?
        };
        Ok(rows.into_iter().map(row_to_account).collect())
    }

    fn create_account(
        &mut self,
        scope_type: &str,
        tenant_id: Option<i64>,
        username: &str,
        display_name: &str,
        password_hash: &str,
        role_code: &str,
    ) -> Result<AdminAccountRecord, AdminStoreError> {
        let mut client = self.connect()?;
        let row = client.query_one(
            "
            INSERT INTO platform_admin_accounts (
                scope_type,
                tenant_id,
                username,
                display_name,
                password_hash,
                role_code,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            RETURNING
                id AS account_id,
                scope_type,
                username,
                display_name,
                role_code,
                is_active AS account_is_active,
                tenant_id
            ",
            &[
                &scope_type,
                &tenant_id,
                &username,
                &display_name,
                &password_hash,
                &role_code,
            ],
        )?;

        let account_id: i64 = row.get("account_id");
        self.find_account(account_id)?.ok_or(AdminStoreError(
            "created account could not be reloaded".to_string(),
        ))
    }

    fn find_account(
        &mut self,
        account_id: i64,
    ) -> Result<Option<AdminAccountRecord>, AdminStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                a.id AS account_id,
                a.scope_type,
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                COALESCE(t.is_active, TRUE) AS tenant_is_active,
                a.username,
                a.display_name,
                a.role_code,
                a.is_active AS account_is_active
            FROM platform_admin_accounts a
            LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE a.id = $1
            ",
            &[&account_id],
        )?;
        Ok(row.map(row_to_account))
    }

    fn deactivate_account(&mut self, account_id: i64) -> Result<(), AdminStoreError> {
        let mut client = self.connect()?;
        client.execute(
            "
            UPDATE platform_admin_accounts
            SET is_active = FALSE,
                updated_at = NOW()
            WHERE id = $1
            ",
            &[&account_id],
        )?;
        Ok(())
    }

    fn count_active_platform_super_admin(&mut self) -> Result<i64, AdminStoreError> {
        let mut client = self.connect()?;
        let row = client.query_one(
            "
            SELECT COUNT(*)::BIGINT AS count
            FROM platform_admin_accounts
            WHERE scope_type = 'platform'
              AND role_code = 'super_admin'
              AND is_active = TRUE
            ",
            &[],
        )?;
        Ok(row.get("count"))
    }
}

pub fn list_tenants_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
) -> Result<Vec<TenantRecord>, AdminError> {
    require_super_admin(actor)?;
    store
        .list_tenants()
        .map_err(|error| AdminError::Store(error.to_string()))
}

pub fn create_tenant_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    input: CreateTenantInput,
) -> Result<TenantRecord, AdminError> {
    require_super_admin(actor)?;
    if input.code.trim().is_empty() {
        return Err(AdminError::InvalidRequest(
            "tenant code is required".to_string(),
        ));
    }
    if input.name.trim().is_empty() {
        return Err(AdminError::InvalidRequest(
            "tenant name is required".to_string(),
        ));
    }
    store
        .create_tenant(input.code.trim(), input.name.trim())
        .map_err(map_store_write_error)
}

pub fn deactivate_tenant_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    tenant_id: i64,
) -> Result<(), AdminError> {
    require_super_admin(actor)?;
    let tenant = store
        .find_tenant(tenant_id)
        .map_err(|error| AdminError::Store(error.to_string()))?
        .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
    if !tenant.is_active {
        return Ok(());
    }
    store
        .deactivate_tenant(tenant_id)
        .map_err(|error| AdminError::Store(error.to_string()))
}

pub fn list_accounts_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<AdminAccountRecord>, AdminError> {
    match actor.user.role_code.as_str() {
        "super_admin" => store
            .list_accounts(requested_tenant_id)
            .map_err(|error| AdminError::Store(error.to_string())),
        "tenant_admin" => store
            .list_accounts(actor.tenant.as_ref().map(|tenant| tenant.id))
            .map_err(|error| AdminError::Store(error.to_string())),
        _ => Err(AdminError::Forbidden(
            "actor is not allowed to list admin accounts".to_string(),
        )),
    }
}

pub fn create_account_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    input: CreateAccountInput,
) -> Result<AdminAccountRecord, AdminError> {
    validate_account_input(&input)?;

    match actor.user.role_code.as_str() {
        "super_admin" => {
            let tenant_id = input.tenant_id.ok_or(AdminError::InvalidRequest(
                "tenantId is required".to_string(),
            ))?;
            let tenant = store
                .find_tenant(tenant_id)
                .map_err(|error| AdminError::Store(error.to_string()))?
                .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
            if !tenant.is_active {
                return Err(AdminError::Conflict("tenant is inactive".to_string()));
            }
            if !matches!(input.role_code.as_str(), "tenant_admin" | "tenant_user") {
                return Err(AdminError::InvalidRequest(
                    "roleCode must be tenant_admin or tenant_user".to_string(),
                ));
            }
            store
                .create_account(
                    "tenant",
                    Some(tenant_id),
                    input.username.trim(),
                    input.display_name.trim(),
                    &hash_password(&input.password),
                    &input.role_code,
                )
                .map_err(map_store_write_error)
        }
        "tenant_admin" => {
            if input.role_code != "tenant_user" {
                return Err(AdminError::Forbidden(
                    "tenant admin cannot create tenant admin".to_string(),
                ));
            }
            let tenant_id =
                actor
                    .tenant
                    .as_ref()
                    .map(|tenant| tenant.id)
                    .ok_or(AdminError::Forbidden(
                        "tenant admin must belong to a tenant".to_string(),
                    ))?;
            store
                .create_account(
                    "tenant",
                    Some(tenant_id),
                    input.username.trim(),
                    input.display_name.trim(),
                    &hash_password(&input.password),
                    "tenant_user",
                )
                .map_err(map_store_write_error)
        }
        _ => Err(AdminError::Forbidden(
            "actor is not allowed to create accounts".to_string(),
        )),
    }
}

pub fn deactivate_account_for_actor<S: AdminStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    account_id: i64,
) -> Result<(), AdminError> {
    let account = store
        .find_account(account_id)
        .map_err(|error| AdminError::Store(error.to_string()))?
        .ok_or(AdminError::NotFound("account not found".to_string()))?;

    match actor.user.role_code.as_str() {
        "super_admin" => {
            if account.role_code == "super_admin" {
                let active_count = store
                    .count_active_platform_super_admin()
                    .map_err(|error| AdminError::Store(error.to_string()))?;
                if active_count <= 1 && account.is_active {
                    return Err(AdminError::Conflict(
                        "cannot deactivate the last active super admin".to_string(),
                    ));
                }
            }
            store
                .deactivate_account(account_id)
                .map_err(|error| AdminError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let actor_tenant_id =
                actor
                    .tenant
                    .as_ref()
                    .map(|tenant| tenant.id)
                    .ok_or(AdminError::Forbidden(
                        "tenant admin must belong to a tenant".to_string(),
                    ))?;
            if account.role_code != "tenant_user" {
                return Err(AdminError::Forbidden(
                    "tenant admin can only deactivate tenant users".to_string(),
                ));
            }
            if account.tenant.as_ref().map(|tenant| tenant.id) != Some(actor_tenant_id) {
                return Err(AdminError::Forbidden(
                    "tenant admin cannot manage accounts from other tenants".to_string(),
                ));
            }
            store
                .deactivate_account(account_id)
                .map_err(|error| AdminError::Store(error.to_string()))
        }
        _ => Err(AdminError::Forbidden(
            "actor is not allowed to deactivate accounts".to_string(),
        )),
    }
}

fn require_super_admin(actor: &AuthPrincipal) -> Result<(), AdminError> {
    if actor.user.role_code == "super_admin" {
        Ok(())
    } else {
        Err(AdminError::Forbidden(
            "actor is not allowed to manage tenants".to_string(),
        ))
    }
}

fn validate_account_input(input: &CreateAccountInput) -> Result<(), AdminError> {
    if input.username.trim().is_empty() {
        return Err(AdminError::InvalidRequest(
            "username is required".to_string(),
        ));
    }
    if input.display_name.trim().is_empty() {
        return Err(AdminError::InvalidRequest(
            "displayName is required".to_string(),
        ));
    }
    if input.password.is_empty() {
        return Err(AdminError::InvalidRequest(
            "password is required".to_string(),
        ));
    }
    Ok(())
}

fn map_store_write_error(error: AdminStoreError) -> AdminError {
    let message = error.to_string();
    if message.contains("duplicate key") || message.contains("unique constraint") {
        AdminError::Conflict("resource already exists".to_string())
    } else {
        AdminError::Store(message)
    }
}

fn row_to_tenant(row: postgres::Row) -> TenantRecord {
    TenantRecord {
        id: row.get("id"),
        code: row.get("code"),
        name: row.get("name"),
        is_active: row.get("is_active"),
    }
}

fn row_to_account(row: postgres::Row) -> AdminAccountRecord {
    let tenant_id: Option<i64> = row.get("tenant_id");
    let tenant = tenant_id.map(|id| AuthTenant {
        id,
        code: row
            .get::<_, Option<String>>("tenant_code")
            .unwrap_or_default(),
        name: row
            .get::<_, Option<String>>("tenant_name")
            .unwrap_or_default(),
        is_active: row.get("tenant_is_active"),
    });

    AdminAccountRecord {
        id: row.get("account_id"),
        scope_type: row.get("scope_type"),
        tenant,
        username: row.get("username"),
        display_name: row.get("display_name"),
        role_code: row.get("role_code"),
        is_active: row.get("account_is_active"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct MemoryAdminStore {
        next_tenant_id: i64,
        next_account_id: i64,
        tenants: Vec<TenantRecord>,
        accounts: Vec<AdminAccountRecord>,
    }

    impl MemoryAdminStore {
        fn push_tenant(&mut self, code: &str, name: &str, is_active: bool) -> TenantRecord {
            self.next_tenant_id += 1;
            let tenant = TenantRecord {
                id: self.next_tenant_id,
                code: code.to_string(),
                name: name.to_string(),
                is_active,
            };
            self.tenants.push(tenant.clone());
            tenant
        }

        fn push_account(
            &mut self,
            scope_type: &str,
            tenant: Option<AuthTenant>,
            username: &str,
            display_name: &str,
            role_code: &str,
            is_active: bool,
        ) -> AdminAccountRecord {
            self.next_account_id += 1;
            let account = AdminAccountRecord {
                id: self.next_account_id,
                scope_type: scope_type.to_string(),
                tenant,
                username: username.to_string(),
                display_name: display_name.to_string(),
                role_code: role_code.to_string(),
                is_active,
            };
            self.accounts.push(account.clone());
            account
        }
    }

    impl AdminStore for MemoryAdminStore {
        fn list_tenants(&mut self) -> Result<Vec<TenantRecord>, AdminStoreError> {
            Ok(self.tenants.clone())
        }

        fn create_tenant(
            &mut self,
            code: &str,
            name: &str,
        ) -> Result<TenantRecord, AdminStoreError> {
            if self.tenants.iter().any(|tenant| tenant.code == code) {
                return Err(AdminStoreError("duplicate key".to_string()));
            }
            Ok(self.push_tenant(code, name, true))
        }

        fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<TenantRecord>, AdminStoreError> {
            Ok(self
                .tenants
                .iter()
                .find(|tenant| tenant.id == tenant_id)
                .cloned())
        }

        fn deactivate_tenant(&mut self, tenant_id: i64) -> Result<(), AdminStoreError> {
            if let Some(tenant) = self
                .tenants
                .iter_mut()
                .find(|tenant| tenant.id == tenant_id)
            {
                tenant.is_active = false;
            }
            Ok(())
        }

        fn list_accounts(
            &mut self,
            tenant_id: Option<i64>,
        ) -> Result<Vec<AdminAccountRecord>, AdminStoreError> {
            Ok(self
                .accounts
                .iter()
                .filter(|account| match tenant_id {
                    Some(tenant_id) => {
                        account.tenant.as_ref().map(|tenant| tenant.id) == Some(tenant_id)
                    }
                    None => account.scope_type == "tenant",
                })
                .cloned()
                .collect())
        }

        fn create_account(
            &mut self,
            scope_type: &str,
            tenant_id: Option<i64>,
            username: &str,
            display_name: &str,
            _password_hash: &str,
            role_code: &str,
        ) -> Result<AdminAccountRecord, AdminStoreError> {
            if self.accounts.iter().any(|account| {
                account.username == username
                    && account.tenant.as_ref().map(|tenant| tenant.id) == tenant_id
                    && account.scope_type == scope_type
            }) {
                return Err(AdminStoreError("duplicate key".to_string()));
            }
            let tenant = tenant_id.and_then(|tenant_id| {
                self.tenants
                    .iter()
                    .find(|tenant| tenant.id == tenant_id)
                    .map(|tenant| AuthTenant {
                        id: tenant.id,
                        code: tenant.code.clone(),
                        name: tenant.name.clone(),
                        is_active: tenant.is_active,
                    })
            });
            Ok(self.push_account(scope_type, tenant, username, display_name, role_code, true))
        }

        fn find_account(
            &mut self,
            account_id: i64,
        ) -> Result<Option<AdminAccountRecord>, AdminStoreError> {
            Ok(self
                .accounts
                .iter()
                .find(|account| account.id == account_id)
                .cloned())
        }

        fn deactivate_account(&mut self, account_id: i64) -> Result<(), AdminStoreError> {
            if let Some(account) = self
                .accounts
                .iter_mut()
                .find(|account| account.id == account_id)
            {
                account.is_active = false;
            }
            Ok(())
        }

        fn count_active_platform_super_admin(&mut self) -> Result<i64, AdminStoreError> {
            Ok(self
                .accounts
                .iter()
                .filter(|account| {
                    account.scope_type == "platform"
                        && account.role_code == "super_admin"
                        && account.is_active
                })
                .count() as i64)
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
            password_hash: hash_password("Secret123!"),
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
            password_hash: hash_password("secret123"),
        }
    }

    #[test]
    fn super_admin_can_create_tenant() {
        let actor = sample_super_admin_principal();
        let mut store = MemoryAdminStore::default();

        let tenant = create_tenant_for_actor(
            &mut store,
            &actor,
            CreateTenantInput {
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
            },
        )
        .expect("super admin should create tenant");

        assert_eq!(tenant.code, "acme");
        assert!(tenant.is_active);
    }

    #[test]
    fn tenant_admin_cannot_create_tenant_admin_accounts() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAdminStore::default();
        store.push_tenant("acme", "Acme Corp", true);

        let error = create_account_for_actor(
            &mut store,
            &actor,
            CreateAccountInput {
                tenant_id: Some(7),
                username: "next-admin".to_string(),
                display_name: "Next Admin".to_string(),
                password: "Secret123!".to_string(),
                role_code: "tenant_admin".to_string(),
            },
        )
        .expect_err("tenant admin should be blocked");

        assert_eq!(
            error,
            AdminError::Forbidden("tenant admin cannot create tenant admin".to_string())
        );
    }

    #[test]
    fn tenant_admin_only_sees_own_tenant_accounts() {
        let mut store = MemoryAdminStore::default();
        let own_tenant = store.push_tenant("acme", "Acme Corp", true);
        let other_tenant = store.push_tenant("globex", "Globex", true);
        let actor = AuthPrincipal {
            tenant: Some(AuthTenant {
                id: own_tenant.id,
                code: own_tenant.code.clone(),
                name: own_tenant.name.clone(),
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
            password_hash: hash_password("secret123"),
        };
        store.push_account(
            "tenant",
            Some(AuthTenant {
                id: own_tenant.id,
                code: own_tenant.code.clone(),
                name: own_tenant.name.clone(),
                is_active: true,
            }),
            "alice",
            "Alice",
            "tenant_user",
            true,
        );
        store.push_account(
            "tenant",
            Some(AuthTenant {
                id: other_tenant.id,
                code: other_tenant.code.clone(),
                name: other_tenant.name.clone(),
                is_active: true,
            }),
            "bob",
            "Bob",
            "tenant_user",
            true,
        );

        let accounts = list_accounts_for_actor(&mut store, &actor, None)
            .expect("tenant admin should list own tenant accounts");

        assert_eq!(accounts.len(), 1);
        assert_eq!(accounts[0].username, "alice");
    }

    #[test]
    fn blocks_deactivating_last_super_admin() {
        let actor = sample_super_admin_principal();
        let mut store = MemoryAdminStore::default();
        let super_admin = store.push_account(
            "platform",
            None,
            "root",
            "Platform Root",
            "super_admin",
            true,
        );

        let error = deactivate_account_for_actor(&mut store, &actor, super_admin.id)
            .expect_err("last super admin should stay active");

        assert_eq!(
            error,
            AdminError::Conflict("cannot deactivate the last active super admin".to_string())
        );
    }
}
