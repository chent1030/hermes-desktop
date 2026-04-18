use platform_admin_backend::{run_server, ServerConfig};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = ServerConfig::from_env()?;
    run_server(&config)?;
    Ok(())
}
