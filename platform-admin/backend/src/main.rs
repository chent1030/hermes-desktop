use platform_admin_backend::bootstrap::{config::AppConfig, startup};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = AppConfig::load()?;
    startup::run(config).await?;
    Ok(())
}
