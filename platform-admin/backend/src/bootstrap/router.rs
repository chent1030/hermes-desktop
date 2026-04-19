use axum::{
    Json, Router, body::Body, extract::State, http::Request, middleware, response::IntoResponse,
    routing::get,
};
use serde::Serialize;
use tower_http::cors::{Any, CorsLayer};

use crate::{
    SERVICE_NAME, admin,
    bootstrap::app_state::AppState,
    desktop, iam,
    infrastructure::db::readiness_check,
    infrastructure::http::request_id_middleware,
    kernel::{error::ApiError, ids::RequestId},
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
        .nest("/api/auth", iam::api::routes())
        .nest("/api/admin", admin::api::routes())
        .nest("/api/desktop", desktop::api::routes())
        .fallback(fallback)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::OPTIONS,
                ])
                .allow_headers([
                    axum::http::header::CONTENT_TYPE,
                    axum::http::header::AUTHORIZATION,
                ]),
        )
        .layer(middleware::from_fn(request_id_middleware))
        .with_state(state)
}

async fn health(State(_state): State<AppState>) -> Json<StatusPayload<'static>> {
    Json(StatusPayload {
        status: "ok",
        service: SERVICE_NAME,
    })
}

async fn readiness(State(state): State<AppState>) -> impl IntoResponse {
    if let Some(pool) = state.pool.as_ref() {
        if readiness_check(pool).await.is_err() {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(StatusPayload {
                    status: "degraded",
                    service: SERVICE_NAME,
                }),
            )
                .into_response();
        }
    }

    Json(StatusPayload {
        status: "ok",
        service: SERVICE_NAME,
    })
    .into_response()
}

async fn fallback(request: Request<Body>) -> impl IntoResponse {
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .cloned()
        .unwrap_or_else(RequestId::new);
    ApiError::not_found("route_not_found", request_id)
}
