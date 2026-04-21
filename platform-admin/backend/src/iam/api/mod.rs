use axum::{Json, Router, extract::State, routing::post};

use crate::{
    bootstrap::app_state::AppState,
    iam::{
        api::dto::{LoginRequest, LoginResponse, RefreshRequest},
        application::{login, refresh},
    },
    kernel::error::ApiError,
};

pub mod dto;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/login", post(login_handler))
        .route("/refresh", post(refresh_handler))
}

async fn login_handler(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let response = login::execute(state, request)
        .await
        .map_err(ApiError::from_auth_error)?;
    Ok(Json(response))
}

async fn refresh_handler(
    State(state): State<AppState>,
    Json(request): Json<RefreshRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let response = refresh::execute(state, request)
        .await
        .map_err(ApiError::from_auth_error)?;
    Ok(Json(response))
}
