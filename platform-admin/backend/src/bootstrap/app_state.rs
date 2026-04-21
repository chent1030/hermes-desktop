use super::config::AppConfig;
use crate::infrastructure::db::connect_pool;
use sqlx::PgPool;

#[derive(Debug, Clone)]
pub struct AppState {
    pub config: AppConfig,
    pub pool: Option<PgPool>,
}

impl AppState {
    pub fn new(config: AppConfig) -> Self {
        Self { config, pool: None }
    }

    pub fn new_with_pool(config: AppConfig, pool: PgPool) -> Self {
        Self {
            config,
            pool: Some(pool),
        }
    }

    pub fn for_tests(config: AppConfig) -> Self {
        Self::new(config)
    }

    pub async fn with_pool(config: AppConfig) -> Result<Self, sqlx::Error> {
        let pool = connect_pool(&config.database_url).await?;
        Ok(Self::new_with_pool(config, pool))
    }
}
