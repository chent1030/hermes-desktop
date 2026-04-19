use super::{actor::AdminActor, error::AdminError, permission::AdminPermission};

pub trait AdminPolicy {
    fn authorize(&self, actor: &AdminActor, permission: AdminPermission) -> Result<(), AdminError>;
}

pub trait PolicyExtension: Send + Sync {
    fn authorize(
        &self,
        actor: &AdminActor,
        permission: AdminPermission,
    ) -> Option<Result<(), AdminError>>;
}

#[derive(Default)]
pub struct DefaultAdminPolicy {
    extensions: Vec<Box<dyn PolicyExtension>>,
}

impl DefaultAdminPolicy {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_extension(mut self, extension: Box<dyn PolicyExtension>) -> Self {
        self.extensions.push(extension);
        self
    }

    fn authorize_builtin(
        &self,
        actor: &AdminActor,
        permission: AdminPermission,
    ) -> Result<(), AdminError> {
        match (actor.role_code(), permission) {
            ("super_admin", _) => Ok(()),
            (
                "tenant_admin",
                AdminPermission::TenantAccountListSelf
                | AdminPermission::TenantUserCreate
                | AdminPermission::AccountDeactivate,
            ) => Ok(()),
            ("tenant_admin", _) => Err(AdminError::forbidden(
                "actor is not allowed to manage tenants",
            )),
            _ => Err(AdminError::forbidden(
                "actor is not allowed to access admin workspace",
            )),
        }
    }
}

impl AdminPolicy for DefaultAdminPolicy {
    fn authorize(&self, actor: &AdminActor, permission: AdminPermission) -> Result<(), AdminError> {
        for extension in &self.extensions {
            if let Some(decision) = extension.authorize(actor, permission) {
                return decision;
            }
        }

        self.authorize_builtin(actor, permission)
    }
}
