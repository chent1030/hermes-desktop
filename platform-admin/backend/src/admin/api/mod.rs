use axum::{
    Router,
    extract::{Request, State},
    response::Json,
    routing::get,
};

use crate::{bootstrap::app_state::AppState, iam::application::me, kernel::error::ApiError};

pub fn routes() -> Router<AppState> {
    Router::new().route("/me", get(me_handler))
}

async fn me_handler(
    State(state): State<AppState>,
    request: Request,
) -> Result<Json<crate::auth::AuthContextResponse>, ApiError> {
    let token = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(ApiError::missing_authorization)?;
    let response = me::execute(state, token.to_string())
        .await
        .map_err(ApiError::from_auth_error)?;
    Ok(Json(response))
}
