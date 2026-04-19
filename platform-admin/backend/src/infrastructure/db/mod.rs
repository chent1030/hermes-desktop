use sqlx::{Executor, PgPool, postgres::PgPoolOptions};

pub async fn connect_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub async fn readiness_check(pool: &PgPool) -> Result<(), sqlx::Error> {
    pool.execute("select 1").await.map(|_| ())
}
