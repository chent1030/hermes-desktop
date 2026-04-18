use std::fmt::{Display, Formatter};
use std::time::{SystemTime, UNIX_EPOCH};

use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const AUTH_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS platform_admin_tenants (
    id BIGSERIAL PRIMARY KEY,
    code VARCHAR(128) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS platform_admin_users (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role_code VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, username)
);

CREATE TABLE IF NOT EXISTS platform_admin_accounts (
    id BIGSERIAL PRIMARY KEY,
    scope_type VARCHAR(32) NOT NULL,
    tenant_id BIGINT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    username VARCHAR(128) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role_code VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (scope_type IN ('platform', 'tenant')),
    CHECK (
        (scope_type = 'platform' AND tenant_id IS NULL)
        OR (scope_type = 'tenant' AND tenant_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_accounts_platform_username_idx
    ON platform_admin_accounts (username)
    WHERE scope_type = 'platform';

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_accounts_tenant_username_idx
    ON platform_admin_accounts (tenant_id, username)
    WHERE scope_type = 'tenant';

CREATE TABLE IF NOT EXISTS platform_admin_auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    user_id BIGINT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    rotated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE platform_admin_auth_sessions
    ADD COLUMN IF NOT EXISTS account_id BIGINT NULL REFERENCES platform_admin_accounts(id) ON DELETE CASCADE;
ALTER TABLE platform_admin_auth_sessions
    ADD COLUMN IF NOT EXISTS access_token_hash VARCHAR(128) NULL;
ALTER TABLE platform_admin_auth_sessions
    ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE platform_admin_auth_sessions
    ALTER COLUMN user_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_admin_auth_sessions_access_token_hash_idx
    ON platform_admin_auth_sessions (access_token_hash)
    WHERE access_token_hash IS NOT NULL;
"#;

const INVALID_CREDENTIALS_MESSAGE: &str = "invalid tenant code, username, or password";
const INVALID_REFRESH_TOKEN_MESSAGE: &str = "invalid or expired refresh token";
const INVALID_ACCESS_TOKEN_MESSAGE: &str = "invalid or expired access token";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub tenant_code: String,
    pub username: String,
    pub password: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BootstrapConfig {
    pub username: Option<String>,
    pub password: Option<String>,
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTenant {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
    pub scope_type: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub tenant: Option<AuthTenant>,
    pub user: AuthUser,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthContextResponse {
    pub tenant: Option<AuthTenant>,
    pub user: AuthUser,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthPrincipal {
    pub tenant: Option<AuthTenant>,
    pub user: AuthUser,
    pub password_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TenantSeed {
    pub code: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AccountSeed {
    pub scope_type: String,
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role_code: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthError {
    InvalidRequest(String),
    InvalidCredentials,
    InvalidRefreshToken,
    InvalidAccessToken,
    Store(String),
}

impl Display for AuthError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message) => write!(f, "{message}"),
            Self::InvalidCredentials => write!(f, "{INVALID_CREDENTIALS_MESSAGE}"),
            Self::InvalidRefreshToken => write!(f, "{INVALID_REFRESH_TOKEN_MESSAGE}"),
            Self::InvalidAccessToken => write!(f, "{INVALID_ACCESS_TOKEN_MESSAGE}"),
            Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AuthError {}

#[derive(Debug)]
pub struct AuthStoreError(pub String);

impl Display for AuthStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for AuthStoreError {}

impl From<postgres::Error> for AuthStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait AuthStore {
    fn find_principal(
        &mut self,
        tenant_code: Option<&str>,
        username: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError>;

    fn create_auth_session(
        &mut self,
        principal: &AuthPrincipal,
        access_token_hash: &str,
        refresh_token_hash: &str,
    ) -> Result<(), AuthStoreError>;

    fn find_principal_by_refresh_token(
        &mut self,
        refresh_token_hash: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError>;

    fn replace_refresh_session(
        &mut self,
        current_refresh_token_hash: &str,
        principal: &AuthPrincipal,
        next_access_token_hash: &str,
        next_refresh_token_hash: &str,
    ) -> Result<(), AuthStoreError>;

    fn find_principal_by_access_token(
        &mut self,
        access_token_hash: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError>;

    fn has_active_super_admin(&mut self) -> Result<bool, AuthStoreError>;

    fn create_bootstrap_super_admin(
        &mut self,
        username: &str,
        display_name: &str,
        password_hash: &str,
    ) -> Result<(), AuthStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgAuthStore {
    database_url: String,
}

impl PgAuthStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    pub fn ensure_schema(&self) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        client.batch_execute(AUTH_SCHEMA_SQL)?;
        Ok(())
    }

    pub fn upsert_account_fixture(
        &self,
        tenant: Option<&TenantSeed>,
        account: &AccountSeed,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        client.batch_execute(AUTH_SCHEMA_SQL)?;

        let tenant_id = if let Some(tenant) = tenant {
            let tenant_row = client.query_one(
                "
                INSERT INTO platform_admin_tenants (code, name, is_active)
                VALUES ($1, $2, $3)
                ON CONFLICT (code)
                DO UPDATE SET
                    name = EXCLUDED.name,
                    is_active = EXCLUDED.is_active,
                    updated_at = NOW()
                RETURNING id
                ",
                &[&tenant.code, &tenant.name, &tenant.is_active],
            )?;
            Some(tenant_row.get::<_, i64>("id"))
        } else {
            None
        };

        client.execute(
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
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT DO NOTHING
            ",
            &[
                &account.scope_type,
                &tenant_id,
                &account.username,
                &account.display_name,
                &hash_password(&account.password),
                &account.role_code,
                &account.is_active,
            ],
        )?;

        client.execute(
            "
            UPDATE platform_admin_accounts
            SET display_name = $1,
                password_hash = $2,
                role_code = $3,
                is_active = $4,
                updated_at = NOW()
            WHERE scope_type = $5
              AND username = $6
              AND (
                (tenant_id IS NULL AND $7::BIGINT IS NULL)
                OR tenant_id = $7
              )
            ",
            &[
                &account.display_name,
                &hash_password(&account.password),
                &account.role_code,
                &account.is_active,
                &account.scope_type,
                &account.username,
                &tenant_id,
            ],
        )?;

        Ok(())
    }

    fn connect(&self) -> Result<Client, AuthStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl AuthStore for PgAuthStore {
    fn find_principal(
        &mut self,
        tenant_code: Option<&str>,
        username: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
        let mut client = self.connect()?;
        let row = if let Some(tenant_code) = tenant_code {
            client.query_opt(
                "
                SELECT
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    t.is_active AS tenant_is_active,
                    a.id AS account_id,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.scope_type,
                    a.is_active AS account_is_active,
                    a.password_hash
                FROM platform_admin_accounts a
                INNER JOIN platform_admin_tenants t ON t.id = a.tenant_id
                WHERE a.scope_type = 'tenant'
                  AND t.code = $1
                  AND a.username = $2
                  AND a.is_active = TRUE
                  AND t.is_active = TRUE
                ",
                &[&tenant_code, &username],
            )?
        } else {
            client.query_opt(
                "
                SELECT
                    NULL::BIGINT AS tenant_id,
                    NULL::VARCHAR AS tenant_code,
                    NULL::VARCHAR AS tenant_name,
                    TRUE AS tenant_is_active,
                    a.id AS account_id,
                    a.username,
                    a.display_name,
                    a.role_code,
                    a.scope_type,
                    a.is_active AS account_is_active,
                    a.password_hash
                FROM platform_admin_accounts a
                WHERE a.scope_type = 'platform'
                  AND a.username = $1
                  AND a.is_active = TRUE
                ",
                &[&username],
            )?
        };

        Ok(row.map(row_to_principal))
    }

    fn create_auth_session(
        &mut self,
        principal: &AuthPrincipal,
        access_token_hash: &str,
        refresh_token_hash: &str,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        client.execute(
            "
            INSERT INTO platform_admin_auth_sessions (
                tenant_id,
                user_id,
                account_id,
                access_token_hash,
                refresh_token_hash
            )
            VALUES ($1, NULL, $2, $3, $4)
            ",
            &[
                &principal.tenant.as_ref().map(|tenant| tenant.id),
                &principal.user.id,
                &access_token_hash,
                &refresh_token_hash,
            ],
        )?;
        Ok(())
    }

    fn find_principal_by_refresh_token(
        &mut self,
        refresh_token_hash: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                COALESCE(t.is_active, TRUE) AS tenant_is_active,
                a.id AS account_id,
                a.username,
                a.display_name,
                a.role_code,
                a.scope_type,
                a.is_active AS account_is_active,
                a.password_hash
            FROM platform_admin_auth_sessions s
            INNER JOIN platform_admin_accounts a ON a.id = s.account_id
            LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE s.refresh_token_hash = $1
              AND s.is_active = TRUE
              AND s.expires_at > NOW()
              AND a.is_active = TRUE
              AND COALESCE(t.is_active, TRUE) = TRUE
            ",
            &[&refresh_token_hash],
        )?;

        Ok(row.map(row_to_principal))
    }

    fn replace_refresh_session(
        &mut self,
        current_refresh_token_hash: &str,
        principal: &AuthPrincipal,
        next_access_token_hash: &str,
        next_refresh_token_hash: &str,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        let mut transaction = client.transaction()?;
        let updated_rows = transaction.execute(
            "
            UPDATE platform_admin_auth_sessions
            SET is_active = FALSE,
                rotated_at = NOW(),
                updated_at = NOW()
            WHERE refresh_token_hash = $1
              AND is_active = TRUE
            ",
            &[&current_refresh_token_hash],
        )?;

        if updated_rows == 0 {
            return Err(AuthStoreError(
                "refresh session not found for rotation".to_string(),
            ));
        }

        transaction.execute(
            "
            INSERT INTO platform_admin_auth_sessions (
                tenant_id,
                user_id,
                account_id,
                access_token_hash,
                refresh_token_hash
            )
            VALUES ($1, NULL, $2, $3, $4)
            ",
            &[
                &principal.tenant.as_ref().map(|tenant| tenant.id),
                &principal.user.id,
                &next_access_token_hash,
                &next_refresh_token_hash,
            ],
        )?;
        transaction.commit()?;
        Ok(())
    }

    fn find_principal_by_access_token(
        &mut self,
        access_token_hash: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                COALESCE(t.is_active, TRUE) AS tenant_is_active,
                a.id AS account_id,
                a.username,
                a.display_name,
                a.role_code,
                a.scope_type,
                a.is_active AS account_is_active,
                a.password_hash
            FROM platform_admin_auth_sessions s
            INNER JOIN platform_admin_accounts a ON a.id = s.account_id
            LEFT JOIN platform_admin_tenants t ON t.id = a.tenant_id
            WHERE s.access_token_hash = $1
              AND s.is_active = TRUE
              AND s.expires_at > NOW()
              AND a.is_active = TRUE
              AND COALESCE(t.is_active, TRUE) = TRUE
            ",
            &[&access_token_hash],
        )?;

        Ok(row.map(row_to_principal))
    }

    fn has_active_super_admin(&mut self) -> Result<bool, AuthStoreError> {
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
        let count: i64 = row.get("count");
        Ok(count > 0)
    }

    fn create_bootstrap_super_admin(
        &mut self,
        username: &str,
        display_name: &str,
        password_hash: &str,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        client.execute(
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
            VALUES ('platform', NULL, $1, $2, $3, 'super_admin', TRUE)
            ON CONFLICT DO NOTHING
            ",
            &[&username, &display_name, &password_hash],
        )?;
        Ok(())
    }
}

pub fn parse_login_request_json(body: &str) -> Result<LoginRequest, AuthError> {
    let payload: LoginRequest = serde_json::from_str(body)
        .map_err(|_| AuthError::InvalidRequest("request body must be valid JSON".to_string()))?;
    validate_login_request(&payload)?;
    Ok(payload)
}

pub fn parse_refresh_request_json(body: &str) -> Result<RefreshRequest, AuthError> {
    let payload: RefreshRequest = serde_json::from_str(body)
        .map_err(|_| AuthError::InvalidRequest("request body must be valid JSON".to_string()))?;
    validate_refresh_request(&payload)?;
    Ok(payload)
}

pub fn authenticate_login<S: AuthStore>(
    store: &mut S,
    request: LoginRequest,
    session_salt: &str,
) -> Result<LoginResponse, AuthError> {
    validate_login_request(&request)?;

    let tenant_code = normalize_tenant_code(&request.tenant_code);
    let principal = store
        .find_principal(tenant_code.as_deref(), &request.username)
        .map_err(|error| AuthError::Store(error.to_string()))?
        .ok_or(AuthError::InvalidCredentials)?;

    if principal.password_hash != hash_password(&request.password) {
        return Err(AuthError::InvalidCredentials);
    }

    issue_login_session(store, &principal, session_salt)
}

pub fn refresh_session<S: AuthStore>(
    store: &mut S,
    request: RefreshRequest,
    session_salt: &str,
) -> Result<LoginResponse, AuthError> {
    validate_refresh_request(&request)?;

    let current_refresh_token_hash = hash_token(&request.refresh_token);
    let principal = store
        .find_principal_by_refresh_token(&current_refresh_token_hash)
        .map_err(|error| AuthError::Store(error.to_string()))?
        .ok_or(AuthError::InvalidRefreshToken)?;

    let response = build_login_response(&principal, session_salt);
    let next_access_token_hash = hash_token(&response.access_token);
    let next_refresh_token_hash = hash_token(&response.refresh_token);
    store
        .replace_refresh_session(
            &current_refresh_token_hash,
            &principal,
            &next_access_token_hash,
            &next_refresh_token_hash,
        )
        .map_err(|error| AuthError::Store(error.to_string()))?;

    Ok(response)
}

pub fn authenticate_access_token<S: AuthStore>(
    store: &mut S,
    access_token: &str,
) -> Result<AuthContextResponse, AuthError> {
    if access_token.trim().is_empty() {
        return Err(AuthError::InvalidAccessToken);
    }

    let principal = store
        .find_principal_by_access_token(&hash_token(access_token))
        .map_err(|error| AuthError::Store(error.to_string()))?
        .ok_or(AuthError::InvalidAccessToken)?;

    Ok(AuthContextResponse {
        tenant: principal.tenant,
        user: principal.user,
    })
}

pub fn ensure_bootstrap_super_admin<S: AuthStore>(
    store: &mut S,
    config: &BootstrapConfig,
) -> Result<(), AuthError> {
    if store
        .has_active_super_admin()
        .map_err(|error| AuthError::Store(error.to_string()))?
    {
        return Ok(());
    }

    let username = match config.username.as_deref() {
        Some(value) if !value.trim().is_empty() => value.trim(),
        _ => return Ok(()),
    };
    let password = match config.password.as_deref() {
        Some(value) if !value.is_empty() => value,
        _ => return Ok(()),
    };
    let display_name = config
        .display_name
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(username);

    store
        .create_bootstrap_super_admin(username, display_name, &hash_password(password))
        .map_err(|error| AuthError::Store(error.to_string()))?;
    Ok(())
}

pub fn invalid_credentials_message() -> &'static str {
    INVALID_CREDENTIALS_MESSAGE
}

pub fn invalid_refresh_token_message() -> &'static str {
    INVALID_REFRESH_TOKEN_MESSAGE
}

pub fn invalid_access_token_message() -> &'static str {
    INVALID_ACCESS_TOKEN_MESSAGE
}

pub fn hash_password(password: &str) -> String {
    hash_value(password)
}

pub fn hash_token(token: &str) -> String {
    hash_value(token)
}

fn hash_value(value: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    hex::encode(digest.finalize())
}

fn validate_login_request(request: &LoginRequest) -> Result<(), AuthError> {
    if request.username.trim().is_empty() {
        return Err(AuthError::InvalidRequest("username is required".to_string()));
    }
    if request.password.is_empty() {
        return Err(AuthError::InvalidRequest("password is required".to_string()));
    }
    Ok(())
}

fn validate_refresh_request(request: &RefreshRequest) -> Result<(), AuthError> {
    if request.refresh_token.trim().is_empty() {
        return Err(AuthError::InvalidRequest(
            "refreshToken is required".to_string(),
        ));
    }
    Ok(())
}

fn normalize_tenant_code(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn issue_login_session<S: AuthStore>(
    store: &mut S,
    principal: &AuthPrincipal,
    session_salt: &str,
) -> Result<LoginResponse, AuthError> {
    let response = build_login_response(principal, session_salt);
    store
        .create_auth_session(
            principal,
            &hash_token(&response.access_token),
            &hash_token(&response.refresh_token),
        )
        .map_err(|error| AuthError::Store(error.to_string()))?;
    Ok(response)
}

fn build_login_response(principal: &AuthPrincipal, session_salt: &str) -> LoginResponse {
    let access_token = generate_token("atk", principal, session_salt);
    let refresh_token = generate_token("rtk", principal, session_salt);

    LoginResponse {
        access_token,
        refresh_token,
        tenant: principal.tenant.clone(),
        user: principal.user.clone(),
    }
}

fn generate_token(prefix: &str, principal: &AuthPrincipal, session_salt: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let mut digest = Sha256::new();
    digest.update(prefix.as_bytes());
    digest.update(session_salt.as_bytes());
    digest.update(principal.user.scope_type.as_bytes());
    digest.update(principal.user.username.as_bytes());
    if let Some(tenant) = &principal.tenant {
        digest.update(tenant.code.as_bytes());
    }
    digest.update(timestamp.to_string().as_bytes());
    format!("{prefix}_{}", hex::encode(digest.finalize()))
}

fn row_to_principal(row: postgres::Row) -> AuthPrincipal {
    let tenant_id: Option<i64> = row.get("tenant_id");
    let tenant = tenant_id.map(|id| AuthTenant {
        id,
        code: row.get::<_, Option<String>>("tenant_code").unwrap_or_default(),
        name: row.get::<_, Option<String>>("tenant_name").unwrap_or_default(),
        is_active: row.get("tenant_is_active"),
    });

    AuthPrincipal {
        tenant,
        user: AuthUser {
            id: row.get("account_id"),
            username: row.get("username"),
            display_name: row.get("display_name"),
            role_code: row.get("role_code"),
            scope_type: row.get("scope_type"),
            is_active: row.get("account_is_active"),
        },
        password_hash: row.get("password_hash"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::env;
    use std::sync::{Mutex, OnceLock};

    #[derive(Default)]
    struct MemoryAuthStore {
        principals: Vec<AuthPrincipal>,
        last_lookup: Option<(Option<String>, String)>,
        last_refresh_lookup: Option<String>,
        last_access_lookup: Option<String>,
        sessions_by_refresh_hash: HashMap<String, i64>,
        sessions_by_access_hash: HashMap<String, i64>,
        created_accounts: Vec<(String, String, String)>,
    }

    impl MemoryAuthStore {
        fn principal_by_account_id(&self, account_id: i64) -> Option<AuthPrincipal> {
            self.principals
                .iter()
                .find(|principal| principal.user.id == account_id)
                .cloned()
        }
    }

    fn live_postgres_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    impl AuthStore for MemoryAuthStore {
        fn find_principal(
            &mut self,
            tenant_code: Option<&str>,
            username: &str,
        ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
            self.last_lookup = Some((tenant_code.map(|value| value.to_string()), username.to_string()));
            Ok(self
                .principals
                .iter()
                .find(|principal| {
                    if principal.user.username != username || !principal.user.is_active {
                        return false;
                    }
                    match (tenant_code, principal.tenant.as_ref()) {
                        (Some(expected), Some(tenant)) => tenant.code == expected && tenant.is_active,
                        (None, None) => principal.user.scope_type == "platform",
                        _ => false,
                    }
                })
                .cloned())
        }

        fn create_auth_session(
            &mut self,
            principal: &AuthPrincipal,
            access_token_hash: &str,
            refresh_token_hash: &str,
        ) -> Result<(), AuthStoreError> {
            self.sessions_by_access_hash
                .insert(access_token_hash.to_string(), principal.user.id);
            self.sessions_by_refresh_hash
                .insert(refresh_token_hash.to_string(), principal.user.id);
            Ok(())
        }

        fn find_principal_by_refresh_token(
            &mut self,
            refresh_token_hash: &str,
        ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
            self.last_refresh_lookup = Some(refresh_token_hash.to_string());
            Ok(self
                .sessions_by_refresh_hash
                .get(refresh_token_hash)
                .and_then(|account_id| self.principal_by_account_id(*account_id)))
        }

        fn replace_refresh_session(
            &mut self,
            current_refresh_token_hash: &str,
            principal: &AuthPrincipal,
            next_access_token_hash: &str,
            next_refresh_token_hash: &str,
        ) -> Result<(), AuthStoreError> {
            self.sessions_by_refresh_hash.remove(current_refresh_token_hash);
            self.sessions_by_access_hash
                .insert(next_access_token_hash.to_string(), principal.user.id);
            self.sessions_by_refresh_hash
                .insert(next_refresh_token_hash.to_string(), principal.user.id);
            Ok(())
        }

        fn find_principal_by_access_token(
            &mut self,
            access_token_hash: &str,
        ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
            self.last_access_lookup = Some(access_token_hash.to_string());
            Ok(self
                .sessions_by_access_hash
                .get(access_token_hash)
                .and_then(|account_id| self.principal_by_account_id(*account_id)))
        }

        fn has_active_super_admin(&mut self) -> Result<bool, AuthStoreError> {
            Ok(self
                .principals
                .iter()
                .any(|principal| principal.user.role_code == "super_admin" && principal.user.is_active))
        }

        fn create_bootstrap_super_admin(
            &mut self,
            username: &str,
            display_name: &str,
            password_hash: &str,
        ) -> Result<(), AuthStoreError> {
            self.created_accounts.push((
                username.to_string(),
                display_name.to_string(),
                password_hash.to_string(),
            ));
            self.principals.push(AuthPrincipal {
                tenant: None,
                user: AuthUser {
                    id: (self.principals.len() + 1) as i64,
                    username: username.to_string(),
                    display_name: display_name.to_string(),
                    role_code: "super_admin".to_string(),
                    scope_type: "platform".to_string(),
                    is_active: true,
                },
                password_hash: password_hash.to_string(),
            });
            Ok(())
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
            password_hash: hash_password("secret123"),
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
            password_hash: hash_password("Secret123!"),
        }
    }

    #[test]
    fn parses_login_request_payload() {
        let payload = parse_login_request_json(
            r#"{"tenantCode":"acme","username":"admin","password":"secret123"}"#,
        )
        .expect("payload should parse");

        assert_eq!(
            payload,
            LoginRequest {
                tenant_code: "acme".to_string(),
                username: "admin".to_string(),
                password: "secret123".to_string(),
            }
        );
    }

    #[test]
    fn parses_refresh_request_payload() {
        let payload = parse_refresh_request_json(r#"{"refreshToken":"rtk_demo"}"#)
            .expect("payload should parse");

        assert_eq!(
            payload,
            RefreshRequest {
                refresh_token: "rtk_demo".to_string(),
            }
        );
    }

    #[test]
    fn authenticates_tenant_login_with_matching_password() {
        let mut store = MemoryAuthStore {
            principals: vec![sample_tenant_admin_principal()],
            ..Default::default()
        };

        let response = authenticate_login(
            &mut store,
            LoginRequest {
                tenant_code: "acme".to_string(),
                username: "admin".to_string(),
                password: "secret123".to_string(),
            },
            "stage1-salt",
        )
        .expect("login should succeed");

        assert_eq!(
            store.last_lookup,
            Some((Some("acme".to_string()), "admin".to_string()))
        );
        assert_eq!(response.tenant.as_ref().map(|tenant| tenant.code.as_str()), Some("acme"));
        assert_eq!(response.user.role_code, "tenant_admin");
        assert!(response.access_token.starts_with("atk_"));
        assert!(response.refresh_token.starts_with("rtk_"));
    }

    #[test]
    fn authenticates_platform_login_without_tenant_code() {
        let mut store = MemoryAuthStore {
            principals: vec![sample_super_admin_principal()],
            ..Default::default()
        };

        let response = authenticate_login(
            &mut store,
            LoginRequest {
                tenant_code: "".to_string(),
                username: "root".to_string(),
                password: "Secret123!".to_string(),
            },
            "platform-salt",
        )
        .expect("platform login should succeed without tenant code");

        assert_eq!(
            store.last_lookup,
            Some((None, "root".to_string()))
        );
        assert!(response.tenant.is_none());
        assert_eq!(response.user.role_code, "super_admin");
    }

    #[test]
    fn bootstraps_platform_super_admin_once() {
        let mut store = MemoryAuthStore::default();
        let config = BootstrapConfig {
            username: Some("root".to_string()),
            password: Some("Secret123!".to_string()),
            display_name: Some("Platform Root".to_string()),
        };

        ensure_bootstrap_super_admin(&mut store, &config).expect("bootstrap should succeed");
        ensure_bootstrap_super_admin(&mut store, &config).expect("bootstrap should stay idempotent");

        assert_eq!(store.created_accounts.len(), 1);
        assert_eq!(store.created_accounts[0].0, "root");
    }

    #[test]
    fn refreshes_session_with_valid_refresh_token() {
        let principal = sample_tenant_admin_principal();
        let current_refresh_token = "rtk_current".to_string();
        let access_token = "atk_current".to_string();
        let mut store = MemoryAuthStore {
            principals: vec![principal.clone()],
            sessions_by_access_hash: HashMap::from([(hash_token(&access_token), principal.user.id)]),
            sessions_by_refresh_hash: HashMap::from([(hash_token(&current_refresh_token), principal.user.id)]),
            ..Default::default()
        };

        let response = refresh_session(
            &mut store,
            RefreshRequest {
                refresh_token: current_refresh_token.clone(),
            },
            "stage1-salt",
        )
        .expect("refresh should succeed");

        assert_eq!(
            store.last_refresh_lookup,
            Some(hash_token(&current_refresh_token))
        );
        assert_eq!(response.tenant.as_ref().map(|tenant| tenant.code.as_str()), Some("acme"));
        assert!(response.access_token.starts_with("atk_"));
        assert!(response.refresh_token.starts_with("rtk_"));
    }

    #[test]
    fn authenticates_access_token_to_context() {
        let principal = sample_tenant_admin_principal();
        let access_token = "atk_active".to_string();
        let mut store = MemoryAuthStore {
            principals: vec![principal.clone()],
            sessions_by_access_hash: HashMap::from([(hash_token(&access_token), principal.user.id)]),
            ..Default::default()
        };

        let context = authenticate_access_token(&mut store, &access_token)
            .expect("access token should resolve to auth context");

        assert_eq!(context.user.username, "admin");
        assert_eq!(context.tenant.as_ref().map(|tenant| tenant.code.as_str()), Some("acme"));
    }

    #[test]
    fn rejects_refresh_with_unknown_token() {
        let mut store = MemoryAuthStore {
            principals: vec![sample_tenant_admin_principal()],
            ..Default::default()
        };

        let error = refresh_session(
            &mut store,
            RefreshRequest {
                refresh_token: "rtk_unknown".to_string(),
            },
            "stage1-salt",
        )
        .expect_err("unknown refresh token should fail");

        assert_eq!(error, AuthError::InvalidRefreshToken);
    }

    #[test]
    fn rejects_login_with_wrong_password() {
        let mut store = MemoryAuthStore {
            principals: vec![sample_tenant_admin_principal()],
            ..Default::default()
        };

        let error = authenticate_login(
            &mut store,
            LoginRequest {
                tenant_code: "acme".to_string(),
                username: "admin".to_string(),
                password: "wrong".to_string(),
            },
            "stage1-salt",
        )
        .expect_err("wrong password should fail");

        assert_eq!(error, AuthError::InvalidCredentials);
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn authenticates_against_live_postgres() {
        let _guard = live_postgres_lock()
            .lock()
            .expect("live PostgreSQL tests should acquire the shared lock");
        let database_url =
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured");
        let store = PgAuthStore::new(database_url);
        store.ensure_schema().expect("schema should be created");
        store
            .upsert_account_fixture(
                Some(&TenantSeed {
                    code: "stage1-live".to_string(),
                    name: "Stage 1 Live Tenant".to_string(),
                    is_active: true,
                }),
                &AccountSeed {
                    scope_type: "tenant".to_string(),
                    username: "platform_admin".to_string(),
                    display_name: "Platform Admin".to_string(),
                    password: "Stage1!Pass123".to_string(),
                    role_code: "tenant_admin".to_string(),
                    is_active: true,
                },
            )
            .expect("fixture should be seeded");

        let mut login_store = PgAuthStore::new(
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured"),
        );
        let response = authenticate_login(
            &mut login_store,
            LoginRequest {
                tenant_code: "stage1-live".to_string(),
                username: "platform_admin".to_string(),
                password: "Stage1!Pass123".to_string(),
            },
            "stage1-live-salt",
        )
        .expect("live login should succeed");

        assert_eq!(response.tenant.as_ref().map(|tenant| tenant.code.as_str()), Some("stage1-live"));
        assert_eq!(response.user.username, "platform_admin");
        assert_eq!(response.user.role_code, "tenant_admin");
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn refreshes_live_postgres_session() {
        let _guard = live_postgres_lock()
            .lock()
            .expect("live PostgreSQL tests should acquire the shared lock");
        let database_url =
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured");
        let store = PgAuthStore::new(database_url);
        store.ensure_schema().expect("schema should be created");
        store
            .upsert_account_fixture(
                Some(&TenantSeed {
                    code: "stage1-live-refresh".to_string(),
                    name: "Stage 1 Live Refresh Tenant".to_string(),
                    is_active: true,
                }),
                &AccountSeed {
                    scope_type: "tenant".to_string(),
                    username: "platform_admin_refresh".to_string(),
                    display_name: "Platform Admin Refresh".to_string(),
                    password: "Stage1!Pass123".to_string(),
                    role_code: "tenant_admin".to_string(),
                    is_active: true,
                },
            )
            .expect("fixture should be seeded");

        let mut login_store = PgAuthStore::new(
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured"),
        );
        let login_response = authenticate_login(
            &mut login_store,
            LoginRequest {
                tenant_code: "stage1-live-refresh".to_string(),
                username: "platform_admin_refresh".to_string(),
                password: "Stage1!Pass123".to_string(),
            },
            "stage1-live-refresh-salt",
        )
        .expect("live login should succeed");

        let mut refresh_store = PgAuthStore::new(
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured"),
        );
        let refresh_response = refresh_session(
            &mut refresh_store,
            RefreshRequest {
                refresh_token: login_response.refresh_token,
            },
            "stage1-live-refresh-salt",
        )
        .expect("live refresh should succeed");

        assert_eq!(refresh_response.user.username, "platform_admin_refresh");
        assert!(refresh_response.refresh_token.starts_with("rtk_"));
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn bootstraps_live_platform_super_admin() {
        let _guard = live_postgres_lock()
            .lock()
            .expect("live PostgreSQL tests should acquire the shared lock");
        let database_url =
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured");
        let store = PgAuthStore::new(database_url);
        store.ensure_schema().expect("schema should be created");

        let mut bootstrap_store = PgAuthStore::new(
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured"),
        );
        ensure_bootstrap_super_admin(
            &mut bootstrap_store,
            &BootstrapConfig {
                username: Some("stage1_root".to_string()),
                password: Some("Stage1!Root123".to_string()),
                display_name: Some("Stage1 Root".to_string()),
            },
        )
        .expect("bootstrap should succeed");

        let mut login_store = PgAuthStore::new(
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured"),
        );
        let response = authenticate_login(
            &mut login_store,
            LoginRequest {
                tenant_code: "".to_string(),
                username: "stage1_root".to_string(),
                password: "Stage1!Root123".to_string(),
            },
            "stage1-root-salt",
        )
        .expect("platform bootstrap login should succeed");

        assert!(response.tenant.is_none());
        assert_eq!(response.user.role_code, "super_admin");
    }
}
