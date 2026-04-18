use std::fmt::{Display, Formatter};
use std::time::{SystemTime, UNIX_EPOCH};

use postgres::{Client, NoTls, Transaction};
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

CREATE TABLE IF NOT EXISTS platform_admin_auth_sessions (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES platform_admin_users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(128) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    rotated_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"#;

const INVALID_CREDENTIALS_MESSAGE: &str = "invalid tenant code, username, or password";
const INVALID_REFRESH_TOKEN_MESSAGE: &str = "invalid or expired refresh token";

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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthTenant {
    pub id: i64,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthUser {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub tenant: AuthTenant,
    pub user: AuthUser,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthPrincipal {
    pub tenant: AuthTenant,
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
pub struct UserSeed {
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
    Store(String),
}

impl Display for AuthError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message) => write!(f, "{message}"),
            Self::InvalidCredentials => write!(f, "{INVALID_CREDENTIALS_MESSAGE}"),
            Self::InvalidRefreshToken => write!(f, "{INVALID_REFRESH_TOKEN_MESSAGE}"),
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
        tenant_code: &str,
        username: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError>;

    fn create_refresh_session(
        &mut self,
        principal: &AuthPrincipal,
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
        next_refresh_token_hash: &str,
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

    pub fn upsert_login_fixture(
        &self,
        tenant: &TenantSeed,
        user: &UserSeed,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        client.batch_execute(AUTH_SCHEMA_SQL)?;

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
        let tenant_id: i64 = tenant_row.get("id");

        client.execute(
            "
            INSERT INTO platform_admin_users (
                tenant_id,
                username,
                display_name,
                password_hash,
                role_code,
                is_active
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (tenant_id, username)
            DO UPDATE SET
                display_name = EXCLUDED.display_name,
                password_hash = EXCLUDED.password_hash,
                role_code = EXCLUDED.role_code,
                is_active = EXCLUDED.is_active,
                updated_at = NOW()
            ",
            &[
                &tenant_id,
                &user.username,
                &user.display_name,
                &hash_password(&user.password),
                &user.role_code,
                &user.is_active,
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
        tenant_code: &str,
        username: &str,
    ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                u.id AS user_id,
                u.username,
                u.display_name,
                u.role_code,
                u.password_hash
            FROM platform_admin_users u
            INNER JOIN platform_admin_tenants t ON t.id = u.tenant_id
            WHERE t.code = $1
              AND u.username = $2
              AND t.is_active = TRUE
              AND u.is_active = TRUE
            ",
            &[&tenant_code, &username],
        )?;

        Ok(row.map(row_to_principal))
    }

    fn create_refresh_session(
        &mut self,
        principal: &AuthPrincipal,
        refresh_token_hash: &str,
    ) -> Result<(), AuthStoreError> {
        let mut client = self.connect()?;
        insert_refresh_session(&mut client, principal, refresh_token_hash)?;
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
                u.id AS user_id,
                u.username,
                u.display_name,
                u.role_code,
                u.password_hash
            FROM platform_admin_auth_sessions s
            INNER JOIN platform_admin_tenants t ON t.id = s.tenant_id
            INNER JOIN platform_admin_users u ON u.id = s.user_id
            WHERE s.refresh_token_hash = $1
              AND s.is_active = TRUE
              AND s.expires_at > NOW()
              AND t.is_active = TRUE
              AND u.is_active = TRUE
            ",
            &[&refresh_token_hash],
        )?;

        Ok(row.map(row_to_principal))
    }

    fn replace_refresh_session(
        &mut self,
        current_refresh_token_hash: &str,
        principal: &AuthPrincipal,
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

        insert_refresh_session_tx(&mut transaction, principal, next_refresh_token_hash)?;
        transaction.commit()?;
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

    let principal = store
        .find_principal(&request.tenant_code, &request.username)
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
    let next_refresh_token_hash = hash_token(&response.refresh_token);
    store
        .replace_refresh_session(
            &current_refresh_token_hash,
            &principal,
            &next_refresh_token_hash,
        )
        .map_err(|error| AuthError::Store(error.to_string()))?;

    Ok(response)
}

pub fn invalid_credentials_message() -> &'static str {
    INVALID_CREDENTIALS_MESSAGE
}

pub fn invalid_refresh_token_message() -> &'static str {
    INVALID_REFRESH_TOKEN_MESSAGE
}

pub fn hash_password(password: &str) -> String {
    hash_value(password)
}

fn hash_token(token: &str) -> String {
    hash_value(token)
}

fn hash_value(value: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(value.as_bytes());
    hex::encode(digest.finalize())
}

fn validate_login_request(request: &LoginRequest) -> Result<(), AuthError> {
    if request.tenant_code.trim().is_empty() {
        return Err(AuthError::InvalidRequest(
            "tenantCode is required".to_string(),
        ));
    }
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

fn issue_login_session<S: AuthStore>(
    store: &mut S,
    principal: &AuthPrincipal,
    session_salt: &str,
) -> Result<LoginResponse, AuthError> {
    let response = build_login_response(principal, session_salt);
    let refresh_token_hash = hash_token(&response.refresh_token);
    store
        .create_refresh_session(principal, &refresh_token_hash)
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
    digest.update(principal.tenant.code.as_bytes());
    digest.update(principal.user.username.as_bytes());
    digest.update(timestamp.to_string().as_bytes());
    format!("{prefix}_{}", hex::encode(digest.finalize()))
}

fn row_to_principal(row: postgres::Row) -> AuthPrincipal {
    AuthPrincipal {
        tenant: AuthTenant {
            id: row.get("tenant_id"),
            code: row.get("tenant_code"),
            name: row.get("tenant_name"),
        },
        user: AuthUser {
            id: row.get("user_id"),
            username: row.get("username"),
            display_name: row.get("display_name"),
            role_code: row.get("role_code"),
        },
        password_hash: row.get("password_hash"),
    }
}

fn insert_refresh_session(
    client: &mut Client,
    principal: &AuthPrincipal,
    refresh_token_hash: &str,
) -> Result<(), postgres::Error> {
    client.execute(
        "
        INSERT INTO platform_admin_auth_sessions (
            tenant_id,
            user_id,
            refresh_token_hash
        )
        VALUES ($1, $2, $3)
        ",
        &[
            &principal.tenant.id,
            &principal.user.id,
            &refresh_token_hash,
        ],
    )?;

    Ok(())
}

fn insert_refresh_session_tx(
    transaction: &mut Transaction<'_>,
    principal: &AuthPrincipal,
    refresh_token_hash: &str,
) -> Result<(), postgres::Error> {
    transaction.execute(
        "
        INSERT INTO platform_admin_auth_sessions (
            tenant_id,
            user_id,
            refresh_token_hash
        )
        VALUES ($1, $2, $3)
        ",
        &[
            &principal.tenant.id,
            &principal.user.id,
            &refresh_token_hash,
        ],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[derive(Default)]
    struct MemoryAuthStore {
        principal: Option<AuthPrincipal>,
        last_lookup: Option<(String, String)>,
        last_refresh_lookup: Option<String>,
        active_refresh_token_hash: Option<String>,
        rotation_history: Vec<(String, String)>,
    }

    impl AuthStore for MemoryAuthStore {
        fn find_principal(
            &mut self,
            tenant_code: &str,
            username: &str,
        ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
            self.last_lookup = Some((tenant_code.to_string(), username.to_string()));
            Ok(self.principal.clone())
        }

        fn create_refresh_session(
            &mut self,
            _principal: &AuthPrincipal,
            refresh_token_hash: &str,
        ) -> Result<(), AuthStoreError> {
            self.active_refresh_token_hash = Some(refresh_token_hash.to_string());
            Ok(())
        }

        fn find_principal_by_refresh_token(
            &mut self,
            refresh_token_hash: &str,
        ) -> Result<Option<AuthPrincipal>, AuthStoreError> {
            self.last_refresh_lookup = Some(refresh_token_hash.to_string());
            if self.active_refresh_token_hash.as_deref() == Some(refresh_token_hash) {
                Ok(self.principal.clone())
            } else {
                Ok(None)
            }
        }

        fn replace_refresh_session(
            &mut self,
            current_refresh_token_hash: &str,
            _principal: &AuthPrincipal,
            next_refresh_token_hash: &str,
        ) -> Result<(), AuthStoreError> {
            self.rotation_history.push((
                current_refresh_token_hash.to_string(),
                next_refresh_token_hash.to_string(),
            ));
            self.active_refresh_token_hash = Some(next_refresh_token_hash.to_string());
            Ok(())
        }
    }

    fn sample_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: AuthTenant {
                id: 7,
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
            },
            user: AuthUser {
                id: 42,
                username: "admin".to_string(),
                display_name: "ACME Admin".to_string(),
                role_code: "tenant_admin".to_string(),
            },
            password_hash: hash_password("secret123"),
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
    fn authenticates_login_with_matching_password() {
        let mut store = MemoryAuthStore {
            principal: Some(sample_principal()),
            last_lookup: None,
            last_refresh_lookup: None,
            active_refresh_token_hash: None,
            rotation_history: Vec::new(),
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
            Some(("acme".to_string(), "admin".to_string()))
        );
        assert_eq!(response.tenant.code, "acme");
        assert_eq!(response.user.role_code, "tenant_admin");
        assert!(response.access_token.starts_with("atk_"));
        assert!(response.refresh_token.starts_with("rtk_"));
        assert_eq!(
            store.active_refresh_token_hash,
            Some(hash_token(&response.refresh_token))
        );
    }

    #[test]
    fn refreshes_session_with_valid_refresh_token() {
        let principal = sample_principal();
        let current_refresh_token = "rtk_current".to_string();
        let mut store = MemoryAuthStore {
            principal: Some(principal.clone()),
            last_lookup: None,
            last_refresh_lookup: None,
            active_refresh_token_hash: Some(hash_token(&current_refresh_token)),
            rotation_history: Vec::new(),
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
        assert_eq!(response.tenant.code, principal.tenant.code);
        assert!(response.access_token.starts_with("atk_"));
        assert!(response.refresh_token.starts_with("rtk_"));
        assert_eq!(store.rotation_history.len(), 1);
        assert_eq!(
            store.active_refresh_token_hash,
            Some(hash_token(&response.refresh_token))
        );
    }

    #[test]
    fn rejects_refresh_with_unknown_token() {
        let mut store = MemoryAuthStore {
            principal: Some(sample_principal()),
            last_lookup: None,
            last_refresh_lookup: None,
            active_refresh_token_hash: Some(hash_token("rtk_known")),
            rotation_history: Vec::new(),
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
            principal: Some(sample_principal()),
            last_lookup: None,
            last_refresh_lookup: None,
            active_refresh_token_hash: None,
            rotation_history: Vec::new(),
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
        let database_url =
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured");
        let store = PgAuthStore::new(database_url);
        store.ensure_schema().expect("schema should be created");
        store
            .upsert_login_fixture(
                &TenantSeed {
                    code: "stage1-live".to_string(),
                    name: "Stage 1 Live Tenant".to_string(),
                    is_active: true,
                },
                &UserSeed {
                    username: "platform_admin".to_string(),
                    display_name: "Platform Admin".to_string(),
                    password: "Stage1!Pass123".to_string(),
                    role_code: "super_admin".to_string(),
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

        assert_eq!(response.tenant.code, "stage1-live");
        assert_eq!(response.user.username, "platform_admin");
        assert_eq!(response.user.role_code, "super_admin");
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn refreshes_live_postgres_session() {
        let database_url =
            env::var("ADMIN_DATABASE_URL").expect("ADMIN_DATABASE_URL should be configured");
        let store = PgAuthStore::new(database_url);
        store.ensure_schema().expect("schema should be created");
        store
            .upsert_login_fixture(
                &TenantSeed {
                    code: "stage1-live-refresh".to_string(),
                    name: "Stage 1 Live Refresh Tenant".to_string(),
                    is_active: true,
                },
                &UserSeed {
                    username: "platform_admin_refresh".to_string(),
                    display_name: "Platform Admin Refresh".to_string(),
                    password: "Stage1!Pass123".to_string(),
                    role_code: "super_admin".to_string(),
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

        assert_eq!(refresh_response.tenant.code, "stage1-live-refresh");
        assert_eq!(refresh_response.user.username, "platform_admin_refresh");
        assert!(refresh_response.refresh_token.starts_with("rtk_"));
    }
}
