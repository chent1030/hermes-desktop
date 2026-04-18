use std::env;
use std::fmt::{Display, Formatter};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

use serde::Serialize;

pub mod auth;

use auth::{
    AuthError, PgAuthStore, authenticate_login, invalid_credentials_message,
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

        Ok(Self {
            host,
            port,
            database_url,
            session_salt,
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
    };
    handle_request(request, &config)
}

pub fn handle_request(request: &str, config: &ServerConfig) -> String {
    let (method, path) = parse_request_line(request);

    match (method, path) {
        (Some("GET"), Some("/api/health")) => json_response("HTTP/1.1 200 OK", &health_payload_json()),
        (Some("OPTIONS"), Some("/api/auth/login")) => empty_response("HTTP/1.1 204 No Content"),
        (Some("OPTIONS"), Some("/api/auth/refresh")) => empty_response("HTTP/1.1 204 No Content"),
        (Some("POST"), Some("/api/auth/login")) => handle_login_request(request, config),
        (Some("POST"), Some("/api/auth/refresh")) => handle_refresh_request(request, config),
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
        Err(AuthError::Store(message)) => json_response(
            "HTTP/1.1 500 Internal Server Error",
            &serialize_json(&ErrorPayload {
                error: "internal_error",
                message,
            }),
        ),
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
    fn rejects_invalid_port_from_env() {
        unsafe {
            env::set_var("ADMIN_BACKEND_PORT", "invalid");
        }
        let error = ServerConfig::from_env().expect_err("invalid port should fail");
        assert_eq!(error.to_string(), "invalid ADMIN_BACKEND_PORT: invalid");
        unsafe {
            env::remove_var("ADMIN_BACKEND_PORT");
        }
    }
}
