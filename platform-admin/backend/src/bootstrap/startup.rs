use std::fmt::{Display, Formatter};

use tokio::net::TcpListener;

use crate::bootstrap::{app_state::AppState, config::AppConfig, router::build_router};

#[derive(Debug)]
pub enum StartupError {
    Io(std::io::Error),
}

impl Display for StartupError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(f, "{error}"),
        }
    }
}

impl std::error::Error for StartupError {}

impl From<std::io::Error> for StartupError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

pub async fn run(config: AppConfig) -> Result<(), StartupError> {
    let listener = TcpListener::bind(config.bind_addr()).await?;
    let app = build_router(AppState::new(config));
    axum::serve(listener, app).await?;
    Ok(())
}
