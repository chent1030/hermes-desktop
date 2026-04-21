use axum::{
    Json, Router,
    extract::State,
    http::HeaderMap,
    routing::{get, post},
};

use crate::{
    admin::domain::error::AdminError,
    audit::{
        AuditBatchAccepted, AuditBatchInput, AuditHealthResponse, PgAuditStore,
        audit_health_for_actor, write_audit_events_for_actor,
    },
    auth::{AuthContextResponse, authenticate_access_token},
    bootstrap::app_state::AppState,
    kernel::error::ApiError,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/events:batch", post(write_events_handler))
        .route("/health", get(health_handler))
}

async fn write_events_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AuditBatchInput>,
) -> Result<Json<AuditBatchAccepted>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let database_url = state.config.database_url.clone();

    let accepted = tokio::task::spawn_blocking(move || {
        let mut store = PgAuditStore::new(database_url);
        write_audit_events_for_actor(&mut store, &principal, payload)
    })
    .await
    .expect("audit batch task join")
    .map_err(map_audit_error)?;

    Ok(Json(accepted))
}

async fn health_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuditHealthResponse>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);

    let health = tokio::task::spawn_blocking(move || audit_health_for_actor(&principal))
        .await
        .expect("audit health task join")
        .map_err(map_audit_error)?;

    Ok(Json(health))
}

async fn authenticate_request(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthContextResponse, ApiError> {
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_owned)
        .ok_or_else(ApiError::missing_authorization)?;
    let database_url = state.config.database_url.clone();

    tokio::task::spawn_blocking(move || {
        let mut store = crate::iam::infrastructure::repository::IamRepository::new(database_url);
        authenticate_access_token(store.store_mut(), &token)
    })
    .await
    .expect("audit auth task join")
    .map_err(ApiError::from_auth_error)
}

fn principal_from_context(context: &AuthContextResponse) -> crate::auth::AuthPrincipal {
    crate::auth::AuthPrincipal {
        tenant: context.tenant.clone(),
        user: context.user.clone(),
        password_hash: String::new(),
    }
}

fn map_audit_error(error: crate::audit::AuditError) -> ApiError {
    let admin_error = match error {
        crate::audit::AuditError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        crate::audit::AuditError::Forbidden(message) => AdminError::Forbidden(message),
        crate::audit::AuditError::Store(message) => AdminError::Store(message),
    };
    ApiError::from_admin_error(admin_error)
}
