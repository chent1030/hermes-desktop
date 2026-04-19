#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminPermission {
    TenantList,
    TenantCreate,
    TenantDeactivate,
    AccountListAnyTenant,
    TenantAccountListSelf,
    TenantAdminCreate,
    TenantUserCreate,
    AccountDeactivate,
}
