use platform_admin_backend::admin::domain::{
    actor::AdminActor,
    error::AdminError,
    permission::AdminPermission,
    policy::{AdminPolicy, DefaultAdminPolicy},
};
use platform_admin_backend::auth::AuthTenant;

fn tenant_fixture() -> AuthTenant {
    AuthTenant {
        id: 7,
        code: "acme".to_string(),
        name: "Acme".to_string(),
        is_active: true,
    }
}

#[test]
fn tenant_admin_cannot_manage_platform_tenants() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::TenantCreate);

    assert_eq!(
        decision,
        Err(AdminError::forbidden(
            "actor is not allowed to manage tenants"
        ))
    );
}

#[test]
fn tenant_admin_can_create_tenant_users_inside_own_scope() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::TenantUserCreate);

    assert!(decision.is_ok());
}

#[test]
fn tenant_admin_cannot_create_global_model_profiles() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::ModelProfileCreateGlobal);

    assert_eq!(
        decision,
        Err(AdminError::forbidden(
            "actor is not allowed to manage global model profiles"
        ))
    );
}

#[test]
fn tenant_admin_can_manage_self_tenant_skill_catalog() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::SkillCatalogCreateTenant);

    assert!(decision.is_ok());
}
