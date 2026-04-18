use std::env;
use std::fmt::{Display, Formatter};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};

pub const SERVICE_NAME: &str = "platform-admin-backend";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
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

        Ok(Self {
            host,
            port,
            database_url,
        })
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

pub fn health_payload_json() -> String {
    format!(r#"{{"status":"ok","service":"{}"}}"#, SERVICE_NAME)
}

pub fn handle_health_request(request: &str) -> String {
    let body = if request.starts_with("GET /api/health ") {
        health_payload_json()
    } else {
        r#"{"status":"not_found"}"#.to_string()
    };

    let status_line = if request.starts_with("GET /api/health ") {
        "HTTP/1.1 200 OK"
    } else {
        "HTTP/1.1 404 Not Found"
    };

    format!(
        "{status_line}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    )
}

pub fn handle_client(stream: &mut TcpStream) -> std::io::Result<()> {
    let mut buffer = [0_u8; 2048];
    let bytes_read = stream.read(&mut buffer)?;
    let request = String::from_utf8_lossy(&buffer[..bytes_read]).into_owned();
    let response = handle_health_request(&request);
    stream.write_all(response.as_bytes())?;
    stream.flush()?;
    Ok(())
}

pub fn run_server(config: &ServerConfig) -> std::io::Result<()> {
    let listener = TcpListener::bind(config.bind_addr())?;
    println!(
        "{SERVICE_NAME} listening on {} (database configured: {})",
        config.bind_addr(),
        !config.database_url.is_empty()
    );

    for stream in listener.incoming() {
        let mut stream = stream?;
        handle_client(&mut stream)?;
    }

    Ok(())
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
