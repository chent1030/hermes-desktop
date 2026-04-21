use crate::{
    admin::{
        application::authorizer::authorize,
        domain::{
            account::{AdminAccountRecord, CreateAccountCommand},
            actor::AdminActor,
            error::AdminError,
            permission::AdminPermission,
        },
        infrastructure::repository::AdminRepository,
    },
    bootstrap::app_state::AppState,
};

pub async fn list_accounts(
    state: &AppState,
    actor: &AdminActor,
    requested_tenant_id: Option<i64>,
) -> Result<Vec<AdminAccountRecord>, AdminError> {
    let repo = AdminRepository::from_state(state)?;
    match actor.role_code() {
        "super_admin" => {
            authorize(actor, AdminPermission::AccountListAnyTenant)?;
            repo.list_accounts(requested_tenant_id).await
        }
        "tenant_admin" => {
            authorize(actor, AdminPermission::TenantAccountListSelf)?;
            repo.list_accounts(actor.tenant().map(|tenant| tenant.id))
                .await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to list admin accounts",
        )),
    }
}

pub async fn create_account(
    state: &AppState,
    actor: &AdminActor,
    mut input: CreateAccountCommand,
) -> Result<AdminAccountRecord, AdminError> {
    input.validate()?;
    let repo = AdminRepository::from_state(state)?;

    match actor.role_code() {
        "super_admin" => {
            let permission = match input.role_code.as_str() {
                "tenant_admin" => AdminPermission::TenantAdminCreate,
                "tenant_user" => AdminPermission::TenantUserCreate,
                _ => {
                    return Err(AdminError::InvalidRequest(
                        "roleCode must be tenant_admin or tenant_user".to_string(),
                    ));
                }
            };
            authorize(actor, permission)?;
            let tenant_id = input.tenant_id.ok_or(AdminError::InvalidRequest(
                "tenantId is required".to_string(),
            ))?;
            let tenant = repo
                .find_tenant(tenant_id)
                .await?
                .ok_or(AdminError::NotFound("tenant not found".to_string()))?;
            if !tenant.is_active {
                return Err(AdminError::Conflict("tenant is inactive".to_string()));
            }
            repo.create_account("tenant", Some(tenant_id), input).await
        }
        "tenant_admin" => {
            authorize(actor, AdminPermission::TenantUserCreate)?;
            if input.role_code != "tenant_user" {
                return Err(AdminError::forbidden(
                    "tenant admin cannot create tenant admin",
                ));
            }
            let tenant_id = actor
                .tenant()
                .map(|tenant| tenant.id)
                .ok_or(AdminError::forbidden(
                    "tenant admin must belong to a tenant",
                ))?;
            input.tenant_id = Some(tenant_id);
            repo.create_account("tenant", Some(tenant_id), input).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to create accounts",
        )),
    }
}

pub async fn deactivate_account(
    state: &AppState,
    actor: &AdminActor,
    account_id: i64,
) -> Result<(), AdminError> {
    authorize(actor, AdminPermission::AccountDeactivate)?;
    let repo = AdminRepository::from_state(state)?;
    let account = repo
        .find_account(account_id)
        .await?
        .ok_or(AdminError::NotFound("account not found".to_string()))?;

    match actor.role_code() {
        "super_admin" => {
            if account.role_code == "super_admin" && account.is_active {
                let active_count = repo.count_active_platform_super_admin().await?;
                ensure_super_admin_deactivation_allowed(&account, active_count)?;
            }
            repo.deactivate_account(account_id).await
        }
        "tenant_admin" => {
            let actor_tenant_id =
                actor
                    .tenant()
                    .map(|tenant| tenant.id)
                    .ok_or(AdminError::forbidden(
                        "tenant admin must belong to a tenant",
                    ))?;
            if account.role_code != "tenant_user" {
                return Err(AdminError::forbidden(
                    "tenant admin can only deactivate tenant users",
                ));
            }
            if account.tenant.as_ref().map(|tenant| tenant.id) != Some(actor_tenant_id) {
                return Err(AdminError::forbidden(
                    "tenant admin cannot manage accounts from other tenants",
                ));
            }
            repo.deactivate_account(account_id).await
        }
        _ => Err(AdminError::forbidden(
            "actor is not allowed to deactivate accounts",
        )),
    }
}

fn ensure_super_admin_deactivation_allowed(
    account: &AdminAccountRecord,
    active_count: i64,
) -> Result<(), AdminError> {
    if account.role_code == "super_admin" && account.is_active && active_count <= 1 {
        return Err(AdminError::Conflict(
            "cannot deactivate the last active super admin".to_string(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn platform_super_admin_account() -> AdminAccountRecord {
        AdminAccountRecord {
            id: 1,
            scope_type: "platform".to_string(),
            tenant: None,
            username: "root".to_string(),
            display_name: "Platform Root".to_string(),
            role_code: "super_admin".to_string(),
            is_active: true,
        }
    }

    #[test]
    fn blocks_last_active_super_admin_deactivation() {
        let error = ensure_super_admin_deactivation_allowed(&platform_super_admin_account(), 1)
            .expect_err("last active super admin should be protected");

        assert_eq!(
            error,
            AdminError::Conflict("cannot deactivate the last active super admin".to_string())
        );
    }

    #[test]
    fn allows_super_admin_deactivation_when_another_active_super_admin_exists() {
        let result = ensure_super_admin_deactivation_allowed(&platform_super_admin_account(), 2);

        assert!(result.is_ok());
    }
}
