use axum::{Json, Router, extract::State, http::HeaderMap, routing::get};

use crate::{
    auth::{AuthContextResponse, authenticate_access_token},
    bootstrap::app_state::AppState,
    desktop::{
        DesktopBootstrapResponse, DesktopModelProfilesResponse, DesktopSkillCatalogResponse,
        PgDesktopStore, desktop_bootstrap_for_actor, desktop_model_profiles_for_actor,
        desktop_skill_catalog_for_actor,
    },
    kernel::error::ApiError,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/bootstrap", get(bootstrap_handler))
        .route("/model-profiles", get(model_profiles_handler))
        .route("/skills/catalog", get(skill_catalog_handler))
}

async fn bootstrap_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DesktopBootstrapResponse>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let database_url = state.config.database_url.clone();

    let payload = tokio::task::spawn_blocking(move || {
        let mut store = PgDesktopStore::new(database_url);
        desktop_bootstrap_for_actor(&mut store, &principal)
    })
    .await
    .expect("desktop bootstrap task join")
    .map_err(map_desktop_error)?;

    Ok(Json(payload))
}

async fn model_profiles_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DesktopModelProfilesResponse>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let database_url = state.config.database_url.clone();

    let payload = tokio::task::spawn_blocking(move || {
        let mut store = PgDesktopStore::new(database_url);
        desktop_model_profiles_for_actor(&mut store, &principal)
    })
    .await
    .expect("desktop model profile task join")
    .map_err(map_desktop_error)?;

    Ok(Json(payload))
}

async fn skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DesktopSkillCatalogResponse>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let database_url = state.config.database_url.clone();

    let payload = tokio::task::spawn_blocking(move || {
        let mut store = PgDesktopStore::new(database_url);
        desktop_skill_catalog_for_actor(&mut store, &principal)
    })
    .await
    .expect("desktop skill catalog task join")
    .map_err(map_desktop_error)?;

    Ok(Json(payload))
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
    .expect("desktop auth task join")
    .map_err(ApiError::from_auth_error)
}

fn principal_from_context(context: &AuthContextResponse) -> crate::auth::AuthPrincipal {
    crate::auth::AuthPrincipal {
        tenant: context.tenant.clone(),
        user: context.user.clone(),
        password_hash: String::new(),
    }
}

fn map_desktop_error(error: crate::desktop::DesktopError) -> ApiError {
    use crate::admin::domain::error::AdminError;

    let admin_error = match error {
        crate::desktop::DesktopError::Forbidden(message) => AdminError::Forbidden(message),
        crate::desktop::DesktopError::Store(message) => AdminError::Store(message),
    };
    ApiError::from_admin_error(admin_error)
}
