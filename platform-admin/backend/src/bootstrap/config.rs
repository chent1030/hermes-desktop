use std::env;
use std::fmt::{Display, Formatter};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppConfig {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub session_salt: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
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

impl AppConfig {
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

    pub fn for_tests() -> Self {
        Self {
            host: "127.0.0.1".to_string(),
            port: 0,
            database_url: "postgres://postgres:postgres@localhost:5432/manager_admin".to_string(),
            session_salt: "platform-admin-test-salt".to_string(),
        }
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
