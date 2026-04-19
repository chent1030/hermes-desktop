use axum::{extract::State, routing::get, Json, Router};
use serde::Serialize;

use crate::{bootstrap::app_state::AppState, SERVICE_NAME};

#[derive(Debug, Serialize)]
struct StatusPayload<'a> {
    status: &'a str,
    service: &'a str,
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ready", get(readiness))
        .with_state(state)
}

async fn health(State(_state): State<AppState>) -> Json<StatusPayload<'static>> {
    Json(StatusPayload {
        status: "ok",
        service: SERVICE_NAME,
    })
}

async fn readiness(State(_state): State<AppState>) -> Json<StatusPayload<'static>> {
    Json(StatusPayload {
        status: "ok",
        service: SERVICE_NAME,
    })
}
