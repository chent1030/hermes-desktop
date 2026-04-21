use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::HeaderMap,
    routing::get,
};
use serde::Deserialize;

use crate::{
    admin::{
        application::{accounts, model_profiles, skill_catalog, tenants},
        domain::{
            account::{AdminAccountRecord, CreateAccountCommand},
            actor::AdminActor,
            model_profile::{CreateModelProfileCommand, ModelProfileRecord},
            skill_catalog::{CreateSkillCatalogCommand, SkillCatalogRecord},
            tenant::{CreateTenantCommand, TenantRecord},
        },
    },
    audit_center::{
        AuditCenterError, AuditEventRecord, PgAuditCenterStore, build_audit_event_query,
        list_audit_events_for_actor,
    },
    auth::{AuthContextResponse, authenticate_access_token},
    bootstrap::app_state::AppState,
    iam::application::me,
    kernel::error::ApiError,
    session_center::{
        PgSessionCenterStore, SessionCenterError, SessionSummaryRecord, build_session_query,
        list_sessions_for_actor, parse_has_failure_query,
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AccountsQuery {
    tenant_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelProfilesQuery {
    tenant_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillCatalogQuery {
    tenant_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuditEventsQuery {
    tenant_id: Option<i64>,
    event_family: Option<String>,
    event_type: Option<String>,
    event_prefix: Option<String>,
    occurred_from: Option<String>,
    occurred_to: Option<String>,
    account_query: Option<String>,
    payload_query: Option<String>,
    before_id: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionsQuery {
    tenant_id: Option<i64>,
    last_event_type: Option<String>,
    has_failure: Option<String>,
    last_occurred_from: Option<String>,
    last_occurred_to: Option<String>,
    before_id: Option<String>,
    limit: Option<i64>,
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
        .route(
            "/model-profiles",
            get(list_model_profiles_handler).post(create_model_profile_handler),
        )
        .route(
            "/model-profiles/{model_id}/deactivate",
            axum::routing::post(deactivate_model_profile_handler),
        )
        .route(
            "/tenant/model-profiles",
            get(list_self_tenant_model_profiles_handler)
                .post(create_self_tenant_model_profile_handler),
        )
        .route(
            "/tenant/model-profiles/{model_id}/deactivate",
            axum::routing::post(deactivate_self_tenant_model_profile_handler),
        )
        .route("/audit/events", get(list_audit_events_handler))
        .route("/sessions", get(list_sessions_handler))
        .route(
            "/tenant/audit/events",
            get(list_self_tenant_audit_events_handler),
        )
        .route("/tenant/sessions", get(list_self_tenant_sessions_handler))
        .route(
            "/skills/catalog",
            get(list_skill_catalog_handler).post(create_skill_catalog_handler),
        )
        .route(
            "/skills/catalog/{skill_id}/deactivate",
            axum::routing::post(deactivate_skill_catalog_handler),
        )
        .route(
            "/tenant/skills/catalog",
            get(list_self_tenant_skill_catalog_handler)
                .post(create_self_tenant_skill_catalog_handler),
        )
        .route(
            "/tenant/skills/catalog/{skill_id}/deactivate",
            axum::routing::post(deactivate_self_tenant_skill_catalog_handler),
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

async fn list_model_profiles_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ModelProfilesQuery>,
) -> Result<Json<Vec<ModelProfileRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let profiles = model_profiles::list_model_profiles(&state, &actor, query.tenant_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(profiles))
}

async fn create_model_profile_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateModelProfileCommand>,
) -> Result<Json<ModelProfileRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let profile = model_profiles::create_model_profile(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(profile))
}

async fn list_self_tenant_model_profiles_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<ModelProfileRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let profiles = model_profiles::list_model_profiles(&state, &actor, None)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(profiles))
}

async fn list_audit_events_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditEventsQuery>,
) -> Result<Json<Vec<AuditEventRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let audit_query = build_audit_event_query(
        query.event_family,
        query.event_type,
        query.event_prefix,
        query.occurred_from,
        query.occurred_to,
        query.account_query,
        query.payload_query,
        query.before_id,
        query.limit,
    )
    .map_err(map_audit_center_error)?;

    let database_url = state.config.database_url.clone();
    let requested_tenant_id = query.tenant_id;
    let events = tokio::task::spawn_blocking(move || {
        let mut store = PgAuditCenterStore::new(database_url);
        list_audit_events_for_actor(&mut store, &principal, requested_tenant_id, audit_query)
    })
    .await
    .expect("audit list task join")
    .map_err(map_audit_center_error)?;

    Ok(Json(events))
}

async fn list_self_tenant_audit_events_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<AuditEventsQuery>,
) -> Result<Json<Vec<AuditEventRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let audit_query = build_audit_event_query(
        query.event_family,
        query.event_type,
        query.event_prefix,
        query.occurred_from,
        query.occurred_to,
        query.account_query,
        query.payload_query,
        query.before_id,
        query.limit,
    )
    .map_err(map_audit_center_error)?;

    let database_url = state.config.database_url.clone();
    let events = tokio::task::spawn_blocking(move || {
        let mut store = PgAuditCenterStore::new(database_url);
        list_audit_events_for_actor(&mut store, &principal, None, audit_query)
    })
    .await
    .expect("tenant audit list task join")
    .map_err(map_audit_center_error)?;

    Ok(Json(events))
}

async fn list_sessions_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SessionsQuery>,
) -> Result<Json<Vec<SessionSummaryRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let has_failure =
        parse_has_failure_query(query.has_failure).map_err(map_session_center_error)?;
    let session_query = build_session_query(
        query.last_event_type,
        has_failure,
        query.last_occurred_from,
        query.last_occurred_to,
        query.before_id,
        query.limit,
    )
    .map_err(map_session_center_error)?;

    let database_url = state.config.database_url.clone();
    let requested_tenant_id = query.tenant_id;
    let sessions = tokio::task::spawn_blocking(move || {
        let mut store = PgSessionCenterStore::new(database_url);
        list_sessions_for_actor(&mut store, &principal, requested_tenant_id, session_query)
    })
    .await
    .expect("session list task join")
    .map_err(map_session_center_error)?;

    Ok(Json(sessions))
}

async fn list_self_tenant_sessions_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SessionsQuery>,
) -> Result<Json<Vec<SessionSummaryRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let principal = principal_from_context(&context);
    let has_failure =
        parse_has_failure_query(query.has_failure).map_err(map_session_center_error)?;
    let session_query = build_session_query(
        query.last_event_type,
        has_failure,
        query.last_occurred_from,
        query.last_occurred_to,
        query.before_id,
        query.limit,
    )
    .map_err(map_session_center_error)?;

    let database_url = state.config.database_url.clone();
    let sessions = tokio::task::spawn_blocking(move || {
        let mut store = PgSessionCenterStore::new(database_url);
        list_sessions_for_actor(&mut store, &principal, None, session_query)
    })
    .await
    .expect("tenant session list task join")
    .map_err(map_session_center_error)?;

    Ok(Json(sessions))
}

async fn create_self_tenant_model_profile_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateModelProfileCommand>,
) -> Result<Json<ModelProfileRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let profile = model_profiles::create_model_profile(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(profile))
}

async fn list_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<SkillCatalogQuery>,
) -> Result<Json<Vec<SkillCatalogRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let skills = skill_catalog::list_skill_catalog(&state, &actor, query.tenant_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(skills))
}

async fn create_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSkillCatalogCommand>,
) -> Result<Json<SkillCatalogRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let skill = skill_catalog::create_skill_catalog_item(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(skill))
}

async fn list_self_tenant_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Vec<SkillCatalogRecord>>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let skills = skill_catalog::list_skill_catalog(&state, &actor, None)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(skills))
}

async fn create_self_tenant_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<CreateSkillCatalogCommand>,
) -> Result<Json<SkillCatalogRecord>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    let skill = skill_catalog::create_skill_catalog_item(&state, &actor, payload)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(skill))
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

async fn deactivate_model_profile_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    model_profiles::deactivate_model_profile(&state, &actor, &model_id)
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

async fn deactivate_self_tenant_model_profile_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(model_id): Path<String>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    model_profiles::deactivate_model_profile(&state, &actor, &model_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(ActionStatus { status: "ok" }))
}

async fn deactivate_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(skill_id): Path<String>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    skill_catalog::deactivate_skill_catalog_item(&state, &actor, &skill_id)
        .await
        .map_err(ApiError::from_admin_error)?;
    Ok(Json(ActionStatus { status: "ok" }))
}

async fn deactivate_self_tenant_skill_catalog_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(skill_id): Path<String>,
) -> Result<Json<ActionStatus>, ApiError> {
    let context = authenticate_request(&state, &headers).await?;
    let actor = AdminActor::from_context(&context);
    skill_catalog::deactivate_skill_catalog_item(&state, &actor, &skill_id)
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

fn principal_from_context(context: &AuthContextResponse) -> crate::auth::AuthPrincipal {
    crate::auth::AuthPrincipal {
        tenant: context.tenant.clone(),
        user: context.user.clone(),
        password_hash: String::new(),
    }
}

fn map_audit_center_error(error: AuditCenterError) -> ApiError {
    use crate::admin::domain::error::AdminError;

    let admin_error = match error {
        AuditCenterError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        AuditCenterError::Forbidden(message) => AdminError::Forbidden(message),
        AuditCenterError::Conflict(message) => AdminError::Conflict(message),
        AuditCenterError::NotFound(message) => AdminError::NotFound(message),
        AuditCenterError::Store(message) => AdminError::Store(message),
    };
    ApiError::from_admin_error(admin_error)
}

fn map_session_center_error(error: SessionCenterError) -> ApiError {
    use crate::admin::domain::error::AdminError;

    let admin_error = match error {
        SessionCenterError::InvalidRequest(message) => AdminError::InvalidRequest(message),
        SessionCenterError::Forbidden(message) => AdminError::Forbidden(message),
        SessionCenterError::Store(message) => AdminError::Store(message),
    };
    ApiError::from_admin_error(admin_error)
}
