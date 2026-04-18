use std::env;
use std::fmt::{Display, Formatter};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

use serde::Serialize;

pub mod admin;
pub mod audit;
pub mod auth;
pub mod desktop;
pub mod model_profiles;

use admin::{
    AdminError, CreateAccountInput, CreateTenantInput, PgAdminStore, create_account_for_actor,
    create_tenant_for_actor, deactivate_account_for_actor, deactivate_tenant_for_actor,
    list_accounts_for_actor, list_tenants_for_actor,
};
use audit::{
    AuditBatchInput, AuditError, PgAuditStore, audit_health_for_actor,
    write_audit_events_for_actor,
};
use desktop::{
    DesktopError, PgDesktopStore, desktop_bootstrap_for_actor, desktop_model_profiles_for_actor,
    desktop_skill_catalog_for_actor,
};
use model_profiles::{
    CreateModelProfileInput, ModelProfileError, PgModelProfileStore,
    create_model_profile_for_actor, deactivate_model_profile_for_actor,
    list_model_profiles_for_actor,
};
use auth::{
    AuthError, BootstrapConfig, PgAuthStore, authenticate_access_token, authenticate_login,
    ensure_bootstrap_super_admin, invalid_access_token_message, invalid_credentials_message,
    invalid_refresh_token_message, parse_login_request_json, parse_refresh_request_json,
    refresh_session,
};

pub const SERVICE_NAME: &str = "platform-admin-backend";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub session_salt: String,
    pub bootstrap_super_username: Option<String>,
    pub bootstrap_super_password: Option<String>,
    pub bootstrap_super_display_name: Option<String>,
}

#[derive(Debug)]
pub enum ConfigError {
    InvalidPort(String),
}

impl Display for ConfigError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPort(value) => write!(f, "invalid ADMIN_BACKEND_PORT: {value}"),
        }
    }
}

impl std::error::Error for ConfigError {}

#[derive(Debug)]
pub enum ServerError {
    Io(std::io::Error),
    Store(auth::AuthStoreError),
}

impl Display for ServerError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Store(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for ServerError {}

impl From<std::io::Error> for ServerError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<auth::AuthStoreError> for ServerError {
    fn from(value: auth::AuthStoreError) -> Self {
        Self::Store(value)
    }
}

impl ServerConfig {
    pub fn from_env() -> Result<Self, ConfigError> {
        let host = env::var("ADMIN_BACKEND_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port = match env::var("ADMIN_BACKEND_PORT") {
            Ok(value) => value
                .parse::<u16>()
                .map_err(|_| ConfigError::InvalidPort(value))?,
            Err(_) => 8080,
        };
        let database_url = env::var("ADMIN_DATABASE_URL").unwrap_or_else(|_| {
            "postgres://postgres:postgres@localhost:5432/manager_admin".to_string()
        });
        let session_salt = env::var("ADMIN_SESSION_SALT")
            .unwrap_or_else(|_| "platform-admin-dev-salt".to_string());
        let bootstrap_super_username = env::var("ADMIN_BOOTSTRAP_SUPER_USERNAME").ok();
        let bootstrap_super_password = env::var("ADMIN_BOOTSTRAP_SUPER_PASSWORD").ok();
        let bootstrap_super_display_name = env::var("ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME").ok();

        Ok(Self {
            host,
            port,
            database_url,
            session_salt,
            bootstrap_super_username,
            bootstrap_super_password,
            bootstrap_super_display_name,
        })
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[derive(Debug, Serialize)]
struct HealthPayload<'a> {
    status: &'a str,
    service: &'a str,
}

#[derive(Debug, Serialize)]
struct ErrorPayload<'a> {
    error: &'a str,
    message: String,
}

pub fn health_payload_json() -> String {
    serde_json::to_string(&HealthPayload {
        status: "ok",
        service: SERVICE_NAME,
    })
    .expect("health payload should serialize")
}

pub fn handle_health_request(request: &str) -> String {
    let config = ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 8080,
        database_url: "postgres://localhost/manager_admin".to_string(),
        session_salt: "platform-admin-test-salt".to_string(),
        bootstrap_super_username: None,
        bootstrap_super_password: None,
        bootstrap_super_display_name: None,
    };
    handle_request(request, &config)
}

pub fn handle_request(request: &str, config: &ServerConfig) -> String {
    let (method, path) = parse_request_line(request);
    let normalized_path = path
        .map(|value| value.split('?').next().unwrap_or(value))
        .unwrap_or_default()
        .to_string();

    match (method, normalized_path.as_str()) {
        (Some("GET"), "/api/health") => json_response("HTTP/1.1 200 OK", &health_payload_json()),
        (Some("OPTIONS"), "/api/auth/login") => empty_response("HTTP/1.1 204 No Content"),
        (Some("OPTIONS"), "/api/auth/refresh") => empty_response("HTTP/1.1 204 No Content"),
        (Some("OPTIONS"), _) if normalized_path.starts_with("/api/desktop/") => {
            empty_response("HTTP/1.1 204 No Content")
        }
        (Some("OPTIONS"), _) if normalized_path.starts_with("/api/audit/") => {
            empty_response("HTTP/1.1 204 No Content")
        }
        (Some("OPTIONS"), _) if normalized_path.starts_with("/api/admin/") => {
            empty_response("HTTP/1.1 204 No Content")
        }
        (Some("POST"), "/api/auth/login") => handle_login_request(request, config),
        (Some("POST"), "/api/auth/refresh") => handle_refresh_request(request, config),
        (Some("GET"), "/api/desktop/bootstrap") => handle_desktop_bootstrap(request, config),
        (Some("GET"), "/api/desktop/model-profiles") => {
            handle_desktop_model_profiles(request, config)
        }
        (Some("GET"), "/api/desktop/skills/catalog") => {
            handle_desktop_skill_catalog(request, config)
        }
        (Some("POST"), "/api/audit/events:batch") => handle_audit_batch(request, config),
        (Some("GET"), "/api/audit/health") => handle_audit_health(request, config),
        (Some("GET"), "/api/admin/me") => handle_admin_me(request, config),
        (Some("GET"), "/api/admin/tenants") => handle_list_tenants(request, config),
        (Some("POST"), "/api/admin/tenants") => handle_create_tenant(request, config),
        (Some("GET"), "/api/admin/model-profiles") => handle_list_model_profiles(request, config),
        (Some("POST"), "/api/admin/model-profiles") => {
            handle_create_model_profile(request, config)
        }
        (Some("GET"), "/api/admin/accounts") => handle_list_accounts(request, config),
        (Some("POST"), "/api/admin/accounts") => handle_create_account(request, config),
        (Some("GET"), "/api/admin/tenant/model-profiles") => {
            handle_list_tenant_model_profiles(request, config)
        }
        (Some("POST"), "/api/admin/tenant/model-profiles") => {
            handle_create_tenant_model_profile(request, config)
        }
        (Some("GET"), "/api/admin/tenant/accounts") => handle_list_tenant_accounts(request, config),
        (Some("POST"), "/api/admin/tenant/accounts") => {
            handle_create_tenant_scoped_account(request, config)
        }
        (Some("POST"), _) if normalized_path.starts_with("/api/admin/model-profiles/") && normalized_path.ends_with("/deactivate") => {
            handle_deactivate_model_profile(request, config, &normalized_path)
        }
        (Some("POST"), _) if normalized_path.starts_with("/api/admin/tenant/model-profiles/") && normalized_path.ends_with("/deactivate") => {
            handle_deactivate_model_profile(request, config, &normalized_path)
        }
        (Some("POST"), _) if normalized_path.starts_with("/api/admin/tenants/") && normalized_path.ends_with("/deactivate") => {
            handle_deactivate_tenant(request, config, &normalized_path)
        }
        (Some("POST"), _) if normalized_path.starts_with("/api/admin/accounts/") && normalized_path.ends_with("/deactivate") => {
            handle_deactivate_account(request, config, &normalized_path)
        }
        (Some("POST"), _) if normalized_path.starts_with("/api/admin/tenant/accounts/") && normalized_path.ends_with("/deactivate") => {
            handle_deactivate_account(request, config, &normalized_path)
        }
        _ => json_response(
            "HTTP/1.1 404 Not Found",
            &serialize_json(&ErrorPayload {
                error: "not_found",
                message: "route not found".to_string(),
            }),
        ),
    }
}

pub fn handle_client(stream: &mut TcpStream, config: &ServerConfig) -> std::io::Result<()> {
    let mut buffer = [0_u8; 4096];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]).into_owned();
    let response = handle_request(&request, config);
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

pub fn run_server(config: &ServerConfig) -> Result<(), ServerError> {
    let store = PgAuthStore::new(&config.database_url);
    store.ensure_schema()?;
    let desktop_store = PgDesktopStore::new(&config.database_url);
    desktop_store.ensure_schema().map_err(|error| {
        ServerError::Store(auth::AuthStoreError(error.to_string()))
    })?;
    let audit_store = PgAuditStore::new(&config.database_url);
    audit_store.ensure_schema().map_err(|error| {
        ServerError::Store(auth::AuthStoreError(error.to_string()))
    })?;
    let mut bootstrap_store = PgAuthStore::new(&config.database_url);
    ensure_bootstrap_super_admin(
        &mut bootstrap_store,
        &BootstrapConfig {
            username: config.bootstrap_super_username.clone(),
            password: config.bootstrap_super_password.clone(),
            display_name: config.bootstrap_super_display_name.clone(),
        },
    )
    .map_err(|error| ServerError::Store(auth::AuthStoreError(error.to_string())))?;

    let listener = TcpListener::bind(config.bind_addr())?;
    println!(
        "{SERVICE_NAME} listening on {} (database configured: {})",
        config.bind_addr(),
        !config.database_url.is_empty()
    );

    for stream in listener.incoming() {
        let mut stream = stream?;
        handle_client(&mut stream, config)?;
    }

    Ok(())
}

fn handle_login_request(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let auth_result = parse_login_request_json(body).and_then(|payload| {
        let mut store = PgAuthStore::new(&config.database_url);
        authenticate_login(&mut store, payload, &config.session_salt)
    });

    match auth_result {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(AuthError::InvalidRequest(message)) => json_response(
            "HTTP/1.1 400 Bad Request",
            &serialize_json(&ErrorPayload {
                error: "invalid_request",
                message,
            }),
        ),
        Err(AuthError::InvalidCredentials) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_credentials",
                message: invalid_credentials_message().to_string(),
            }),
        ),
        Err(AuthError::InvalidRefreshToken) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_refresh_token",
                message: invalid_refresh_token_message().to_string(),
            }),
        ),
        Err(AuthError::InvalidAccessToken) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_access_token",
                message: invalid_access_token_message().to_string(),
            }),
        ),
        Err(AuthError::Store(message)) => json_response(
            "HTTP/1.1 500 Internal Server Error",
            &serialize_json(&ErrorPayload {
                error: "internal_error",
                message,
            }),
        ),
    }
}

fn handle_refresh_request(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let auth_result = parse_refresh_request_json(body).and_then(|payload| {
        let mut store = PgAuthStore::new(&config.database_url);
        refresh_session(&mut store, payload, &config.session_salt)
    });

    match auth_result {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(AuthError::InvalidRequest(message)) => json_response(
            "HTTP/1.1 400 Bad Request",
            &serialize_json(&ErrorPayload {
                error: "invalid_request",
                message,
            }),
        ),
        Err(AuthError::InvalidRefreshToken) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_refresh_token",
                message: invalid_refresh_token_message().to_string(),
            }),
        ),
        Err(AuthError::InvalidCredentials) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_credentials",
                message: invalid_credentials_message().to_string(),
            }),
        ),
        Err(AuthError::InvalidAccessToken) => json_response(
            "HTTP/1.1 401 Unauthorized",
            &serialize_json(&ErrorPayload {
                error: "invalid_access_token",
                message: invalid_access_token_message().to_string(),
            }),
        ),
        Err(AuthError::Store(message)) => json_response(
            "HTTP/1.1 500 Internal Server Error",
            &serialize_json(&ErrorPayload {
                error: "internal_error",
                message,
            }),
        ),
    }
}

fn handle_desktop_bootstrap(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgDesktopStore::new(&config.database_url);
        desktop_bootstrap_for_actor(&mut store, &to_principal(actor)).map_err(map_desktop_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_desktop_model_profiles(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgDesktopStore::new(&config.database_url);
        desktop_model_profiles_for_actor(&mut store, &to_principal(actor))
            .map_err(map_desktop_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_desktop_skill_catalog(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgDesktopStore::new(&config.database_url);
        desktop_skill_catalog_for_actor(&mut store, &to_principal(actor))
            .map_err(map_desktop_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_audit_batch(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let input = match serde_json::from_str::<AuditBatchInput>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "request body must be valid JSON".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAuditStore::new(&config.database_url);
        write_audit_events_for_actor(&mut store, &to_principal(actor), input)
            .map_err(map_audit_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_audit_health(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        audit_health_for_actor(&to_principal(actor)).map_err(map_audit_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_admin_me(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config) {
        Ok(actor) => json_response("HTTP/1.1 200 OK", &serialize_json(&actor)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_list_tenants(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        list_tenants_for_actor(&mut store, &to_principal(actor))
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_create_tenant(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let input = match serde_json::from_str::<CreateTenantInput>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "request body must be valid JSON".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        create_tenant_for_actor(&mut store, &to_principal(actor), input)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_list_model_profiles(request: &str, config: &ServerConfig) -> String {
    let tenant_id = query_param(request_path(request).unwrap_or_default(), "tenantId")
        .and_then(|value: String| value.parse::<i64>().ok());

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgModelProfileStore::new(&config.database_url);
        list_model_profiles_for_actor(&mut store, &to_principal(actor), tenant_id)
            .map_err(map_model_profile_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_list_tenant_model_profiles(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgModelProfileStore::new(&config.database_url);
        list_model_profiles_for_actor(&mut store, &to_principal(actor), None)
            .map_err(map_model_profile_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_create_model_profile(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let input = match serde_json::from_str::<CreateModelProfileInput>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "request body must be valid JSON".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgModelProfileStore::new(&config.database_url);
        create_model_profile_for_actor(&mut store, &to_principal(actor), input)
            .map_err(map_model_profile_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_create_tenant_model_profile(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let input = match serde_json::from_str::<CreateModelProfileInput>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "request body must be valid JSON".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let tenant_id = actor
            .tenant
            .as_ref()
            .map(|tenant| tenant.id)
            .ok_or(AdminError::Forbidden(
                "tenant admin must belong to a tenant".to_string(),
            ))?;
        let mut store = PgModelProfileStore::new(&config.database_url);
        create_model_profile_for_actor(
            &mut store,
            &to_principal(actor),
            CreateModelProfileInput {
                tenant_id: Some(tenant_id),
                ..input
            },
        )
        .map_err(map_model_profile_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_deactivate_model_profile(request: &str, config: &ServerConfig, path: &str) -> String {
    let model_id = trailing_string_resource_id_from_model_path(path);
    let model_id = match model_id {
        Some(value) => value,
        None => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "model id is invalid".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgModelProfileStore::new(&config.database_url);
        deactivate_model_profile_for_actor(&mut store, &to_principal(actor), &model_id)
            .map_err(map_model_profile_to_admin_error)
    }) {
        Ok(()) => json_response("HTTP/1.1 200 OK", r#"{"status":"ok"}"#),
        Err(error) => admin_error_response(error),
    }
}

fn handle_deactivate_tenant(request: &str, config: &ServerConfig, path: &str) -> String {
    let tenant_id = match trailing_resource_id(path, "/api/admin/tenants/", "/deactivate") {
        Some(value) => value,
        None => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "tenant id is invalid".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        deactivate_tenant_for_actor(&mut store, &to_principal(actor), tenant_id)
    }) {
        Ok(()) => json_response("HTTP/1.1 200 OK", r#"{"status":"ok"}"#),
        Err(error) => admin_error_response(error),
    }
}

fn handle_list_accounts(request: &str, config: &ServerConfig) -> String {
    let tenant_id = query_param(request_path(request).unwrap_or_default(), "tenantId")
        .and_then(|value: String| value.parse::<i64>().ok());

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        list_accounts_for_actor(&mut store, &to_principal(actor), tenant_id)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_list_tenant_accounts(request: &str, config: &ServerConfig) -> String {
    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        list_accounts_for_actor(&mut store, &to_principal(actor), None)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_create_account(request: &str, config: &ServerConfig) -> String {
    let body = request_body(request);
    let input = match serde_json::from_str::<CreateAccountInput>(body) {
        Ok(payload) => payload,
        Err(_) => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "request body must be valid JSON".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        create_account_for_actor(&mut store, &to_principal(actor), input)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}

fn handle_create_tenant_scoped_account(request: &str, config: &ServerConfig) -> String {
    handle_create_account(request, config)
}

fn handle_deactivate_account(request: &str, config: &ServerConfig, path: &str) -> String {
    let account_id = trailing_resource_id_from_account_path(path);
    let account_id = match account_id {
        Some(value) => value,
        None => {
            return json_response(
                "HTTP/1.1 400 Bad Request",
                &serialize_json(&ErrorPayload {
                    error: "invalid_request",
                    message: "account id is invalid".to_string(),
                }),
            )
        }
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgAdminStore::new(&config.database_url);
        deactivate_account_for_actor(&mut store, &to_principal(actor), account_id)
    }) {
        Ok(()) => json_response("HTTP/1.1 200 OK", r#"{"status":"ok"}"#),
        Err(error) => admin_error_response(error),
    }
}

fn parse_request_line(request: &str) -> (Option<&str>, Option<&str>) {
    let mut lines = request.lines();
    let request_line = match lines.next() {
        Some(line) => line,
        None => return (None, None),
    };
    let mut parts = request_line.split_whitespace();
    (parts.next(), parts.next())
}

fn request_body(request: &str) -> &str {
    request.split_once("\r\n\r\n").map(|(_, body)| body).unwrap_or("")
}

fn request_path(request: &str) -> Option<&str> {
    let (_, path) = parse_request_line(request);
    path
}

fn query_param(path: &str, key: &str) -> Option<String> {
    let query = path.split_once('?')?.1;
    query.split('&').find_map(|segment| {
        let (segment_key, segment_value) = segment.split_once('=')?;
        if segment_key == key {
            Some(segment_value.to_string())
        } else {
            None
        }
    })
}

fn bearer_token(request: &str) -> Option<&str> {
    request.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("authorization") {
            value.trim().strip_prefix("Bearer ")
        } else {
            None
        }
    })
}

fn authenticate_request(
    request: &str,
    config: &ServerConfig,
) -> Result<auth::AuthContextResponse, AdminError> {
    let token = bearer_token(request)
        .ok_or(AdminError::Forbidden("authorization header is required".to_string()))?;
    let mut store = PgAuthStore::new(&config.database_url);
    authenticate_access_token(&mut store, token).map_err(map_auth_to_admin_error)
}

fn map_auth_to_admin_error(error: AuthError) -> AdminError {
    match error {
        AuthError::InvalidAccessToken => {
            AdminError::Forbidden(invalid_access_token_message().to_string())
        }
        AuthError::InvalidCredentials => {
            AdminError::Forbidden(invalid_credentials_message().to_string())
        }
        AuthError::InvalidRefreshToken => {
            AdminError::Forbidden(invalid_refresh_token_message().to_string())
        }
        AuthError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        AuthError::Store(message) => AdminError::Store(message),
    }
}

fn map_desktop_to_admin_error(error: DesktopError) -> AdminError {
    match error {
        DesktopError::Forbidden(message) => AdminError::Forbidden(message),
        DesktopError::Store(message) => AdminError::Store(message),
    }
}

fn map_model_profile_to_admin_error(error: ModelProfileError) -> AdminError {
    match error {
        ModelProfileError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        ModelProfileError::Forbidden(message) => AdminError::Forbidden(message),
        ModelProfileError::Conflict(message) => AdminError::Conflict(message),
        ModelProfileError::NotFound(message) => AdminError::NotFound(message),
        ModelProfileError::Store(message) => AdminError::Store(message),
    }
}

fn map_audit_to_admin_error(error: AuditError) -> AdminError {
    match error {
        AuditError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        AuditError::Forbidden(message) => AdminError::Forbidden(message),
        AuditError::Store(message) => AdminError::Store(message),
    }
}

fn admin_error_response(error: AdminError) -> String {
    match error {
        AdminError::InvalidRequest(message) => json_response(
            "HTTP/1.1 400 Bad Request",
            &serialize_json(&ErrorPayload {
                error: "invalid_request",
                message,
            }),
        ),
        AdminError::Forbidden(message) => json_response(
            "HTTP/1.1 403 Forbidden",
            &serialize_json(&ErrorPayload {
                error: "forbidden",
                message,
            }),
        ),
        AdminError::Conflict(message) => json_response(
            "HTTP/1.1 409 Conflict",
            &serialize_json(&ErrorPayload {
                error: "conflict",
                message,
            }),
        ),
        AdminError::NotFound(message) => json_response(
            "HTTP/1.1 404 Not Found",
            &serialize_json(&ErrorPayload {
                error: "not_found",
                message,
            }),
        ),
        AdminError::Store(message) => json_response(
            "HTTP/1.1 500 Internal Server Error",
            &serialize_json(&ErrorPayload {
                error: "internal_error",
                message,
            }),
        ),
    }
}

fn to_principal(context: auth::AuthContextResponse) -> auth::AuthPrincipal {
    auth::AuthPrincipal {
        tenant: context.tenant,
        user: context.user,
        password_hash: String::new(),
    }
}

fn trailing_resource_id(path: &str, prefix: &str, suffix: &str) -> Option<i64> {
    let trimmed = path.strip_prefix(prefix)?.strip_suffix(suffix)?;
    trimmed.parse::<i64>().ok()
}

fn trailing_resource_id_from_account_path(path: &str) -> Option<i64> {
    trailing_resource_id(path, "/api/admin/accounts/", "/deactivate")
        .or_else(|| trailing_resource_id(path, "/api/admin/tenant/accounts/", "/deactivate"))
}

fn trailing_string_resource_id(path: &str, prefix: &str, suffix: &str) -> Option<String> {
    let trimmed = path.strip_prefix(prefix)?.strip_suffix(suffix)?;
    if trimmed.trim().is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn trailing_string_resource_id_from_model_path(path: &str) -> Option<String> {
    trailing_string_resource_id(path, "/api/admin/model-profiles/", "/deactivate").or_else(|| {
        trailing_string_resource_id(path, "/api/admin/tenant/model-profiles/", "/deactivate")
    })
}

fn json_response(status_line: &str, body: &str) -> String {
    format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n{}\r\n{body}",
        body.len()
        ,
        cors_headers()
    )
}

fn serialize_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("payload should serialize")
}

fn empty_response(status_line: &str) -> String {
    format!(
        "{status_line}\r\ncontent-length: 0\r\nconnection: close\r\n{}\r\n",
        cors_headers()
    )
}

fn cors_headers() -> &'static str {
    "access-control-allow-origin: *\r\naccess-control-allow-methods: GET, POST, OPTIONS\r\naccess-control-allow-headers: content-type, authorization"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    #[test]
    fn builds_health_payload_json() {
        let json = health_payload_json();
        assert!(json.contains("\"status\":\"ok\""));
        assert!(json.contains("\"service\":\"platform-admin-backend\""));
    }

    #[test]
    fn formats_http_health_response() {
        let response =
            handle_health_request("GET /api/health HTTP/1.1\r\nHost: localhost\r\n\r\n");
        assert!(response.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(response.contains("content-type: application/json"));
        assert!(response.contains("\"status\":\"ok\""));
    }

    #[test]
    fn validates_login_request_payload() {
        let response = handle_health_request(
            "POST /api/auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
        );
        assert!(response.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(response.contains("\"error\":\"invalid_request\""));
    }

    #[test]
    fn supports_cors_preflight_for_login_requests() {
        let response = handle_health_request(
            "OPTIONS /api/auth/login HTTP/1.1\r\nHost: localhost\r\nOrigin: http://127.0.0.1:4173\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: content-type\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(response.contains("access-control-allow-origin: *"));
        assert!(response.contains("access-control-allow-methods: GET, POST, OPTIONS"));
    }

    #[test]
    fn validates_refresh_request_payload() {
        let response = handle_health_request(
            "POST /api/auth/refresh HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}",
        );
        assert!(response.starts_with("HTTP/1.1 400 Bad Request\r\n"));
        assert!(response.contains("\"error\":\"invalid_request\""));
    }

    #[test]
    fn supports_cors_preflight_for_refresh_requests() {
        let response = handle_health_request(
            "OPTIONS /api/auth/refresh HTTP/1.1\r\nHost: localhost\r\nOrigin: http://127.0.0.1:4173\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: content-type\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(response.contains("access-control-allow-origin: *"));
        assert!(response.contains("access-control-allow-methods: GET, POST, OPTIONS"));
    }

    #[test]
    fn supports_cors_preflight_for_desktop_requests() {
        let response = handle_health_request(
            "OPTIONS /api/desktop/bootstrap HTTP/1.1\r\nHost: localhost\r\nOrigin: http://127.0.0.1:4173\r\nAccess-Control-Request-Method: GET\r\nAccess-Control-Request-Headers: authorization\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(response.contains("access-control-allow-origin: *"));
        assert!(response.contains("access-control-allow-headers: content-type, authorization"));
    }

    #[test]
    fn supports_cors_preflight_for_audit_requests() {
        let response = handle_health_request(
            "OPTIONS /api/audit/events:batch HTTP/1.1\r\nHost: localhost\r\nOrigin: http://127.0.0.1:4173\r\nAccess-Control-Request-Method: POST\r\nAccess-Control-Request-Headers: authorization, content-type\r\n\r\n",
        );
        assert!(response.starts_with("HTTP/1.1 204 No Content\r\n"));
        assert!(response.contains("access-control-allow-origin: *"));
        assert!(response.contains("access-control-allow-headers: content-type, authorization"));
    }

    #[test]
    fn rejects_invalid_port_from_env() {
        let _guard = env_lock()
            .lock()
            .expect("env-based config tests should acquire the shared lock");
        unsafe {
            env::set_var("ADMIN_BACKEND_PORT", "invalid");
        }
        let error = ServerConfig::from_env().expect_err("invalid port should fail");
        assert_eq!(error.to_string(), "invalid ADMIN_BACKEND_PORT: invalid");
        unsafe {
            env::remove_var("ADMIN_BACKEND_PORT");
        }
    }

    #[test]
    fn reads_bootstrap_super_admin_from_env() {
        let _guard = env_lock()
            .lock()
            .expect("env-based config tests should acquire the shared lock");
        unsafe {
            env::set_var("ADMIN_BOOTSTRAP_SUPER_USERNAME", "root");
            env::set_var("ADMIN_BOOTSTRAP_SUPER_PASSWORD", "Secret123!");
            env::set_var("ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME", "Platform Root");
        }

        let config = ServerConfig::from_env().expect("config should load");
        assert_eq!(config.bootstrap_super_username.as_deref(), Some("root"));
        assert_eq!(config.bootstrap_super_password.as_deref(), Some("Secret123!"));
        assert_eq!(
            config.bootstrap_super_display_name.as_deref(),
            Some("Platform Root")
        );

        unsafe {
            env::remove_var("ADMIN_BOOTSTRAP_SUPER_USERNAME");
            env::remove_var("ADMIN_BOOTSTRAP_SUPER_PASSWORD");
            env::remove_var("ADMIN_BOOTSTRAP_SUPER_DISPLAY_NAME");
        }
    }
}
