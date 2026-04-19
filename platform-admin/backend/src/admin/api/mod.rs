use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::get,
};
use serde::Deserialize;

use crate::{
    admin::{
        application::{accounts, tenants},
        domain::{
            account::{AdminAccountRecord, CreateAccountCommand},
            actor::AdminActor,
            tenant::{CreateTenantCommand, TenantRecord},
        },
    },
    auth::{AuthContextResponse, authenticate_access_token},
    bootstrap::app_state::AppState,
    iam::application::me,
    kernel::error::ApiError,
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountsQuery {
    tenant_id: Option<i64>,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ActionStatus {
    status: &'static str,
}

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(me_handler))
        .route(
            "/tenants",
            get(list_tenants_handler).post(create_tenant_handler),
        )
        .route(
            "/tenants/{tenant_id}/deactivate",
            axum::routing::post(deactivate_tenant_handler),
        )
        .route(
            "/accounts",
            get(list_accounts_handler).post(create_account_handler),
        )
        .route(
            "/accounts/{account_id}/deactivate",
            axum::routing::post(deactivate_account_handler),
        )
        .route(
            "/tenant/accounts",
            get(list_self_tenant_accounts_handler).post(create_self_tenant_account_handler),
        )
        .route(
            "/tenant/accounts/{account_id}/deactivate",
            axum::routing::post(deactivate_self_tenant_account_handler),
        )
}

async fn me_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AuthContextResponse>, ApiError> {
    let token = bearer_token(&headers)?;
    let response = me::execute(state, token)
        .await
        .map_err(ApiError::from_auth_error)?;
    Ok(Json(response))
}

async fn list_tenants_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<TenantRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let tenants = tenants::list_tenants(&state, &actor)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(tenants))
}

async fn create_tenant_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateTenantCommand>,
) -> Result<Json<TenantRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let tenant = tenants::create_tenant(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(tenant))
}

async fn list_accounts_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AccountsQuery>,
) -> Result<Json<Vec<AdminAccountRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let accounts = accounts::list_accounts(&state, &actor, query.tenant_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(accounts))
}

async fn create_account_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateAccountCommand>,
) -> Result<Json<AdminAccountRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let account = accounts::create_account(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(account))
}

async fn list_self_tenant_accounts_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<AdminAccountRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let accounts = accounts::list_accounts(&state, &actor, None)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(accounts))
}

async fn create_self_tenant_account_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateAccountCommand>,
) -> Result<Json<AdminAccountRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let account = accounts::create_account(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(account))
}

async fn deactivate_tenant_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(tenant_id): Path<i64>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    tenants::deactivate_tenant(&state, &actor, tenant_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(ActionStatus { status: "ok" }))
}

async fn deactivate_account_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(account_id): Path<i64>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    accounts::deactivate_account(&state, &actor, account_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(ActionStatus { status: "ok" }))
}

async fn deactivate_self_tenant_account_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(account_id): Path<i64>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    accounts::deactivate_account(&state, &actor, account_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(ActionStatus { status: "ok" }))
}

fn bearer_token(headers: &HeaderMap) -> Result<String, ApiError> {
    headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_owned)
        .ok_or_else(ApiError::missing_authorization)
}

async fn authenticate_request(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<AuthContextResponse, ApiError> {
    let token = bearer_token(headers)?;
    let database_url = state.config.database_url.clone();

    tokio::task::spawn_blocking(move || {
        let mut store = crate::iam::infrastructure::repository::IamRepository::new(database_url);
        authenticate_access_token(store.store_mut(), &token)
    })
    .await
    .expect("admin auth task join")
    .map_err(ApiError::from_auth_error)
}
