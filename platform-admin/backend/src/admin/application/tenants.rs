use crate::{
    admin::{
        application::authorizer::authorize,
        domain::{
            actor::AdminActor,
            error::AdminError,
            permission::AdminPermission,
            tenant::{CreateTenantCommand, TenantRecord},
        },
        infrastructure::repository::AdminRepository,
    },
    bootstrap::app_state::AppState,
};

pub async fn list_tenants(
    state: &AppState,
    actor: &AdminActor,
) -> Result<Vec<TenantRecord>, AdminError> {
    authorize(actor, AdminPermission::TenantList)?;
    AdminRepository::from_state(state)?.list_tenants().await
}

pub async fn create_tenant(
    state: &AppState,
    actor: &AdminActor,
    input: CreateTenantCommand,
) -> Result<TenantRecord, AdminError> {
    authorize(actor, AdminPermission::TenantCreate)?;
    input.validate()?;
    AdminRepository::from_state(state)?
        .create_tenant(input)
        .await
}

pub async fn deactivate_tenant(
    state: &AppState,
    actor: &AdminActor,
    tenant_id: i64,
) -> Result<(), AdminError> {
    authorize(actor, AdminPermission::TenantDeactivate)?;
    let repo = AdminRepository::from_state(state)?;
    let tenant = repo
        .find_tenant(tenant_id)
        .await?
        .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
    if !tenant.is_active {
        return Ok(());
    }
    repo.deactivate_tenant(tenant_id).await
}
