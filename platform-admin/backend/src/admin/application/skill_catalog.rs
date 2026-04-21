use std::time::{SystemTime, UNIX_EPOCH};

use crate::{
    admin::{
        application::authorizer::authorize,
        domain::{
            actor::AdminActor,
            error::AdminError,
            permission::AdminPermission,
            skill_catalog::{CreateSkillCatalogCommand, SkillCatalogRecord},
        },
        infrastructure::repository::AdminRepository,
    },
    bootstrap::app_state::AppState,
};

pub async fn list_skill_catalog(
    state: &AppState,
    actor: &AdminActor,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<SkillCatalogRecord>, AdminError> {
    let repo = AdminRepository::from_state(state)?;

    match actor.role_code() {
        "super_admin" => {
            authorize(actor, AdminPermission::SkillCatalogListAnyTenant)?;
            if let Some(tenant_id) = requested_tenant_id {
                let tenant = repo
                    .find_tenant(tenant_id)
                    .await?
                    .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
                if !tenant.is_active {
                    return Err(AdminError::Conflict("tenant is inactive".to_string()));
                }
            }
            repo.list_skill_catalog(requested_tenant_id).await
        }
        "tenant_admin" => {
            authorize(actor, AdminPermission::SkillCatalogListSelfTenant)?;
            let tenant_id = actor
                .tenant()
                .map(|tenant| tenant.id)
                .ok_or(AdminError::forbidden(
                    "tenant admin must belong to a tenant",
                ))?;
            repo.list_skill_catalog(Some(tenant_id)).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to list skill catalog",
        )),
    }
}

pub async fn create_skill_catalog_item(
    state: &AppState,
    actor: &AdminActor,
    mut input: CreateSkillCatalogCommand,
) -> Result<SkillCatalogRecord, AdminError> {
    input.validate()?;
    let repo = AdminRepository::from_state(state)?;

    match actor.role_code() {
        "super_admin" => {
            let permission = if input.tenant_id.is_some() {
                AdminPermission::SkillCatalogCreateTenant
            } else {
                AdminPermission::SkillCatalogCreateGlobal
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

            repo.create_skill_catalog_item(next_skill_catalog_id(), input)
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
                    authorize(actor, AdminPermission::SkillCatalogCreateGlobal)?;
                    unreachable!("tenant admin global skill catalog authorization should fail");
                }
                Some(tenant_id) if tenant_id != actor_tenant_id => {
                    return Err(AdminError::forbidden(
                        "tenant admin can only manage own tenant skill catalog",
                    ));
                }
                Some(_) => {}
            }
            authorize(actor, AdminPermission::SkillCatalogCreateTenant)?;
            input.tenant_id = Some(actor_tenant_id);
            repo.create_skill_catalog_item(next_skill_catalog_id(), input)
                .await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to create skill catalog",
        )),
    }
}

pub async fn deactivate_skill_catalog_item(
    state: &AppState,
    actor: &AdminActor,
    skill_id: &str,
) -> Result<(), AdminError> {
    authorize(actor, AdminPermission::SkillCatalogDeactivate)?;
    let repo = AdminRepository::from_state(state)?;
    let record = repo
        .find_skill_catalog_item(skill_id)
        .await?
        .ok_or(AdminError::NotFound(
            "skill catalog item not found".to_string(),
        ))?;

    match actor.role_code() {
        "super_admin" => repo.deactivate_skill_catalog_item(skill_id).await,
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
                    "tenant admin can only manage own tenant skill catalog",
                ));
            }
            repo.deactivate_skill_catalog_item(skill_id).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to deactivate skill catalog",
        )),
    }
}

fn next_skill_catalog_id() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time should be after unix epoch");
    format!("skl_{}_{}", now.as_secs(), now.subsec_nanos())
}
