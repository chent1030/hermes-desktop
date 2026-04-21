use crate::auth::{AuthContextResponse, AuthPrincipal, AuthTenant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AdminRole {
    SuperAdmin,
    TenantAdmin,
    TenantUser,
    Unknown(String),
}

impl AdminRole {
    pub fn as_str(&self) -> &str {
        match self {
            Self::SuperAdmin => "super_admin",
            Self::TenantAdmin => "tenant_admin",
            Self::TenantUser => "tenant_user",
            Self::Unknown(value) => value.as_str(),
        }
    }
}

impl From<&str> for AdminRole {
    fn from(value: &str) -> Self {
        match value {
            "super_admin" => Self::SuperAdmin,
            "tenant_admin" => Self::TenantAdmin,
            "tenant_user" => Self::TenantUser,
            other => Self::Unknown(other.to_string()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AdminActor {
    role: AdminRole,
    tenant: Option<AuthTenant>,
}

impl AdminActor {
    pub fn super_admin() -> Self {
        Self {
            role: AdminRole::SuperAdmin,
            tenant: None,
        }
    }

    pub fn tenant_admin(tenant: AuthTenant) -> Self {
        Self {
            role: AdminRole::TenantAdmin,
            tenant: Some(tenant),
        }
    }

    pub fn tenant_user(tenant: AuthTenant) -> Self {
        Self {
            role: AdminRole::TenantUser,
            tenant: Some(tenant),
        }
    }

    pub fn from_principal(principal: &AuthPrincipal) -> Self {
        Self {
            role: AdminRole::from(principal.user.role_code.as_str()),
            tenant: principal.tenant.clone(),
        }
    }

    pub fn from_context(context: &AuthContextResponse) -> Self {
        Self {
            role: AdminRole::from(context.user.role_code.as_str()),
            tenant: context.tenant.clone(),
        }
    }

    pub fn role(&self) -> &AdminRole {
        &self.role
    }

    pub fn role_code(&self) -> &str {
        self.role.as_str()
    }

    pub fn tenant(&self) -> Option<&AuthTenant> {
        self.tenant.as_ref()
    }
}
