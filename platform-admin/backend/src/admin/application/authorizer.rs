use crate::admin::domain::{
    actor::AdminActor,
    error::AdminError,
    permission::AdminPermission,
    policy::{AdminPolicy, DefaultAdminPolicy},
};

pub fn authorize(actor: &AdminActor, permission: AdminPermission) -> Result<(), AdminError> {
    DefaultAdminPolicy::new().authorize(actor, permission)
}
