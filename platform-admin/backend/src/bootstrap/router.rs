use axum::{
    body::Body,
    extract::State,
    http::Request,
    middleware,
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::Serialize;

use crate::{
    bootstrap::app_state::AppState,
    infrastructure::http::request_id_middleware,
    kernel::{error::ApiError, ids::RequestId},
    SERVICE_NAME,
};

#[derive(Debug, Serialize)]
struct StatusPayload<'a> {
    status: &'a str,
    service: &'a str,
}

pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ready", get(readiness))
        .fallback(fallback)
        .layer(middleware::from_fn(request_id_middleware))
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

async fn fallback(request: Request<Body>) -> impl IntoResponse {
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .cloned()
        .unwrap_or_else(RequestId::new);
    ApiError::not_found("route_not_found", request_id)
}
