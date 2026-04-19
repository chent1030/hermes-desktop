use serde::Deserialize;
use std::fmt::{Display, Formatter};
use std::{env, fs, path::Path, sync::OnceLock};

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
    ReadFile(String),
    ParseFile(String),
}

impl Display for ConfigError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidPort(value) => write!(f, "invalid ADMIN_BACKEND_PORT: {value}"),
            Self::ReadFile(message) => write!(f, "{message}"),
            Self::ParseFile(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for ConfigError {}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        Self::load_from_path(default_config_path())
    }

    pub fn from_env() -> Result<Self, ConfigError> {
        Self::load()
    }

    fn load_from_path(path: &Path) -> Result<Self, ConfigError> {
        let mut config = Self::defaults();

        if path.exists() {
            let raw = fs::read_to_string(path).map_err(|error| {
                ConfigError::ReadFile(format!(
                    "failed to read config file {}: {error}",
                    path.display()
                ))
            })?;
            let file_config: FileConfig = toml::from_str(&raw).map_err(|error| {
                ConfigError::ParseFile(format!(
                    "failed to parse config file {}: {error}",
                    path.display()
                ))
            })?;
            config.apply_file_config(file_config);
        }

        config.apply_env_overrides()?;
        Ok(config)
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

    fn defaults() -> Self {
        Self {
            host: "0.0.0.0".to_string(),
            port: 8080,
            database_url: "postgres://postgres:postgres@localhost:5432/manager_admin".to_string(),
            session_salt: "platform-admin-dev-salt".to_string(),
        }
    }

    fn apply_file_config(&mut self, file_config: FileConfig) {
        if let Some(server) = file_config.server {
            if let Some(host) = server.host {
                self.host = host;
            }
            if let Some(port) = server.port {
                self.port = port;
            }
        }

        if let Some(database) = file_config.database
            && let Some(url) = database.url
        {
            self.database_url = url;
        }

        if let Some(security) = file_config.security
            && let Some(session_salt) = security.session_salt
        {
            self.session_salt = session_salt;
        }
    }

    fn apply_env_overrides(&mut self) -> Result<(), ConfigError> {
        if let Ok(host) = env::var("ADMIN_BACKEND_HOST") {
            self.host = host;
        }
        if let Ok(value) = env::var("ADMIN_BACKEND_PORT") {
            self.port = value
                .parse::<u16>()
                .map_err(|_| ConfigError::InvalidPort(value))?;
        }
        if let Ok(database_url) = env::var("ADMIN_DATABASE_URL") {
            self.database_url = database_url;
        }
        if let Ok(session_salt) = env::var("ADMIN_SESSION_SALT") {
            self.session_salt = session_salt;
        }

        Ok(())
    }
}

#[derive(Debug, Default, Deserialize)]
struct FileConfig {
    #[serde(default)]
    server: Option<ServerFileConfig>,
    #[serde(default)]
    database: Option<DatabaseFileConfig>,
    #[serde(default)]
    security: Option<SecurityFileConfig>,
}

#[derive(Debug, Default, Deserialize)]
struct ServerFileConfig {
    #[serde(default)]
    host: Option<String>,
    #[serde(default)]
    port: Option<u16>,
}

#[derive(Debug, Default, Deserialize)]
struct DatabaseFileConfig {
    #[serde(default)]
    url: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct SecurityFileConfig {
    #[serde(default, rename = "session_salt")]
    session_salt: Option<String>,
}

fn default_config_path() -> &'static Path {
    static CONFIG_PATH: OnceLock<Box<Path>> = OnceLock::new();
    CONFIG_PATH.get_or_init(|| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config/application.toml")
            .into_boxed_path()
    })
}

#[cfg(test)]
fn env_lock() -> &'static std::sync::Mutex<()> {
    static LOCK: OnceLock<std::sync::Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn falls_back_to_defaults_when_config_file_is_missing() {
        let _guard = env_lock().lock().expect("env lock");
        clear_config_env();
        let missing = unique_temp_path("missing-config");

        let config = AppConfig::load_from_path(&missing).expect("config should load");

        assert_eq!(config, AppConfig::defaults());
    }

    #[test]
    fn loads_values_from_toml_config_file() {
        let _guard = env_lock().lock().expect("env lock");
        clear_config_env();
        let path = write_temp_config(
            r#"
[server]
host = "127.0.0.1"
port = 9090

[database]
url = "postgres://file-user:file-pass@db.example.com:5432/file_db"

[security]
session_salt = "file-salt"
"#,
        );

        let config = AppConfig::load_from_path(&path).expect("config should load");

        assert_eq!(
            config,
            AppConfig {
                host: "127.0.0.1".to_string(),
                port: 9090,
                database_url: "postgres://file-user:file-pass@db.example.com:5432/file_db"
                    .to_string(),
                session_salt: "file-salt".to_string(),
            }
        );
    }

    #[test]
    fn env_values_override_file_values() {
        let _guard = env_lock().lock().expect("env lock");
        clear_config_env();
        let path = write_temp_config(
            r#"
[server]
host = "127.0.0.1"
port = 9090

[database]
url = "postgres://file-user:file-pass@db.example.com:5432/file_db"

[security]
session_salt = "file-salt"
"#,
        );

        unsafe {
            env::set_var("ADMIN_BACKEND_HOST", "0.0.0.0");
            env::set_var("ADMIN_BACKEND_PORT", "8088");
            env::set_var(
                "ADMIN_DATABASE_URL",
                "postgres://env-user:env-pass@db.example.com:5432/env_db",
            );
            env::set_var("ADMIN_SESSION_SALT", "env-salt");
        }

        let config = AppConfig::load_from_path(&path).expect("config should load");

        assert_eq!(
            config,
            AppConfig {
                host: "0.0.0.0".to_string(),
                port: 8088,
                database_url: "postgres://env-user:env-pass@db.example.com:5432/env_db".to_string(),
                session_salt: "env-salt".to_string(),
            }
        );

        clear_config_env();
    }

    #[test]
    fn rejects_invalid_port_from_env_even_with_valid_file() {
        let _guard = env_lock().lock().expect("env lock");
        clear_config_env();
        let path = write_temp_config(
            r#"
[server]
host = "127.0.0.1"
port = 9090
"#,
        );

        unsafe {
            env::set_var("ADMIN_BACKEND_PORT", "invalid");
        }

        let error = AppConfig::load_from_path(&path).expect_err("invalid port should fail");

        assert_eq!(error.to_string(), "invalid ADMIN_BACKEND_PORT: invalid");
        clear_config_env();
    }

    fn write_temp_config(contents: &str) -> std::path::PathBuf {
        let path = unique_temp_path("app-config");
        fs::write(&path, contents).expect("temp config should be written");
        path
    }

    fn unique_temp_path(prefix: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        env::temp_dir().join(format!("{prefix}-{nanos}.toml"))
    }

    fn clear_config_env() {
        unsafe {
            env::remove_var("ADMIN_BACKEND_HOST");
            env::remove_var("ADMIN_BACKEND_PORT");
            env::remove_var("ADMIN_DATABASE_URL");
            env::remove_var("ADMIN_SESSION_SALT");
        }
    }
}
