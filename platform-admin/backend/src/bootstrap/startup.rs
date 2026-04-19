use std::fmt::{Display, Formatter};

use tokio::net::TcpListener;

use crate::{
    bootstrap::{app_state::AppState, config::AppConfig, router::build_router},
    infrastructure::db::connect_pool,
};

#[derive(Debug)]
pub enum StartupError {
    Io(std::io::Error),
    Sqlx(sqlx::Error),
    Migrate(sqlx::migrate::MigrateError),
}

impl Display for StartupError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
            Self::Sqlx(error) => write!(f, "{error}"),
            Self::Migrate(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for StartupError {}

impl From<std::io::Error> for StartupError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<sqlx::Error> for StartupError {
    fn from(value: sqlx::Error) -> Self {
        Self::Sqlx(value)
    }
}

impl From<sqlx::migrate::MigrateError> for StartupError {
    fn from(value: sqlx::migrate::MigrateError) -> Self {
        Self::Migrate(value)
    }
}

pub async fn run(config: AppConfig) -> Result<(), StartupError> {
    let pool = connect_pool(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    let listener = TcpListener::bind(config.bind_addr()).await?;
    let app = build_router(AppState::new_with_pool(config, pool));
    axum::serve(listener, app).await?;
    Ok(())
}
