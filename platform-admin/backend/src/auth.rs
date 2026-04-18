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
"#;

const INVALID_CREDENTIALS_MESSAGE: &str = "invalid tenant code, username, or password";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub tenant_code: String,
    pub username: String,
    pub password: String,
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
    Store(String),
}

impl Display for AuthError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message) => write!(f, "{message}"),
            Self::InvalidCredentials => write!(f, "{INVALID_CREDENTIALS_MESSAGE}"),
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

        Ok(row.map(|row| AuthPrincipal {
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
        }))
    }
}

pub fn parse_login_request_json(body: &str) -> Result<LoginRequest, AuthError> {
    let payload: LoginRequest = serde_json::from_str(body)
        .map_err(|_| AuthError::InvalidRequest("request body must be valid JSON".to_string()))?;
    validate_login_request(&payload)?;
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

    let access_token = generate_token("atk", &principal, session_salt);
    let refresh_token = generate_token("rtk", &principal, session_salt);

    Ok(LoginResponse {
        access_token,
        refresh_token,
        tenant: principal.tenant,
        user: principal.user,
    })
}

pub fn invalid_credentials_message() -> &'static str {
    INVALID_CREDENTIALS_MESSAGE
}

pub fn hash_password(password: &str) -> String {
    let mut digest = Sha256::new();
    digest.update(password.as_bytes());
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

fn generate_token(prefix: &str, principal: &AuthPrincipal, session_salt: &str) -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or_default();
    let mut digest = Sha256::new();
    digest.update(prefix.as_bytes());
    digest.update(session_salt.as_bytes());
    digest.update(principal.tenant.code.as_bytes());
    digest.update(principal.user.username.as_bytes());
    digest.update(timestamp.to_string().as_bytes());
    format!("{prefix}_{}", hex::encode(digest.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[derive(Default)]
    struct MemoryAuthStore {
        principal: Option<AuthPrincipal>,
        last_lookup: Option<(String, String)>,
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
    fn authenticates_login_with_matching_password() {
        let mut store = MemoryAuthStore {
            principal: Some(sample_principal()),
            last_lookup: None,
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
    }

    #[test]
    fn rejects_login_with_wrong_password() {
        let mut store = MemoryAuthStore {
            principal: Some(sample_principal()),
            last_lookup: None,
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
}
