use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    admin::{
        application::authorizer::authorize,
        domain::{
            actor::AdminActor,
            error::AdminError,
            model_profile::{CreateModelProfileCommand, ModelProfileRecord},
            permission::AdminPermission,
        },
        infrastructure::repository::AdminRepository,
    },
    bootstrap::app_state::AppState,
};

pub async fn list_model_profiles(
    state: &AppState,
    actor: &AdminActor,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<ModelProfileRecord>, AdminError> {
    let repo = AdminRepository::from_state(state)?;

    match actor.role_code() {
        "super_admin" => {
            authorize(actor, AdminPermission::ModelProfileListAnyTenant)?;
            if let Some(tenant_id) = requested_tenant_id {
                let tenant = repo
                    .find_tenant(tenant_id)
                    .await?
                    .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(AdminError::Conflict("tenant is inactive".to_string()));
                }
            }
            repo.list_model_profiles(requested_tenant_id).await
        }
        "tenant_admin" => {
            authorize(actor, AdminPermission::ModelProfileListSelfTenant)?;
            let tenant_id = actor
                .tenant()
                .map(|tenant| tenant.id)
                .ok_or(AdminError::forbidden(
                    "tenant admin must belong to a tenant",
                ))?;
            repo.list_model_profiles(Some(tenant_id)).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to list model profiles",
        )),
    }
}

pub async fn create_model_profile(
    state: &AppState,
    actor: &AdminActor,
    mut input: CreateModelProfileCommand,
) -> Result<ModelProfileRecord, AdminError> {
    input.validate()?;
    let repo = AdminRepository::from_state(state)?;

    match actor.role_code() {
        "super_admin" => {
            let permission = if input.tenant_id.is_some() {
                AdminPermission::ModelProfileCreateTenant
            } else {
                AdminPermission::ModelProfileCreateGlobal
            };
            authorize(actor, permission)?;

            if let Some(tenant_id) = input.tenant_id {
                let tenant = repo
                    .find_tenant(tenant_id)
                    .await?
                    .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(AdminError::Conflict("tenant is inactive".to_string()));
                }
            }

            repo.create_model_profile(next_model_profile_id(), input)
                .await
        }
        "tenant_admin" => {
            let actor_tenant_id =
                actor
                    .tenant()
                    .map(|tenant| tenant.id)
                    .ok_or(AdminError::forbidden(
                        "tenant admin must belong to a tenant",
                    ))?;
            match input.tenant_id {
                None => {
                    authorize(actor, AdminPermission::ModelProfileCreateGlobal)?;
                    unreachable!("tenant admin global model profile authorization should fail");
                }
                Some(tenant_id) if tenant_id != actor_tenant_id => {
                    return Err(AdminError::forbidden(
                        "tenant admin can only manage own tenant model profiles",
                    ));
                }
                Some(_) => {}
            }
            authorize(actor, AdminPermission::ModelProfileCreateTenant)?;
            input.tenant_id = Some(actor_tenant_id);
            repo.create_model_profile(next_model_profile_id(), input)
                .await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to create model profiles",
        )),
    }
}

pub async fn deactivate_model_profile(
    state: &AppState,
    actor: &AdminActor,
    model_id: &str,
) -> Result<(), AdminError> {
    authorize(actor, AdminPermission::ModelProfileDeactivate)?;
    let repo = AdminRepository::from_state(state)?;
    let record = repo
        .find_model_profile(model_id)
        .await?
        .ok_or(AdminError::NotFound("model profile not found".to_string()))?;

    match actor.role_code() {
        "super_admin" => repo.deactivate_model_profile(model_id).await,
        "tenant_admin" => {
            let actor_tenant_id =
                actor
                    .tenant()
                    .map(|tenant| tenant.id)
                    .ok_or(AdminError::forbidden(
                        "tenant admin must belong to a tenant",
                    ))?;
            if record.tenant.as_ref().map(|tenant| tenant.id) != Some(actor_tenant_id) {
                return Err(AdminError::forbidden(
                    "tenant admin can only manage own tenant model profiles",
                ));
            }
            repo.deactivate_model_profile(model_id).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to deactivate model profiles",
        )),
    }
}

fn next_model_profile_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch");
    format!("mdl_{}_{}", now.as_secs(), now.subsec_nanos())
}
