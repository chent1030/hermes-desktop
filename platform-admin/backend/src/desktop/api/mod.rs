use axum::{Json, Router, extract::Request, response::IntoResponse, routing::get};

use crate::{bootstrap::app_state::AppState, kernel::error::ApiError};

pub fn routes() -> Router<AppState> {
    Router::new().route("/bootstrap", get(bootstrap_handler))
}

async fn bootstrap_handler(request: Request) -> Result<impl IntoResponse, ApiError> {
    let _token = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(ApiError::missing_authorization)?;
    Ok(Json(serde_json::json!({ "status": "not_implemented" })))
}
