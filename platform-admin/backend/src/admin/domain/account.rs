use serde::{Deserialize, Serialize};

use crate::auth::AuthTenant;

use super::error::AdminError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminAccountRecord {
    pub id: i64,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAccountCommand {
    pub tenant_id: Option<i64>,
    pub username: String,
    pub display_name: String,
    pub password: String,
    pub role_code: String,
}

impl CreateAccountCommand {
    pub fn validate(&self) -> Result<(), AdminError> {
        if self.username.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "username is required".to_string(),
            ));
        }
        if self.display_name.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "displayName is required".to_string(),
            ));
        }
        if self.password.is_empty() {
            return Err(AdminError::InvalidRequest(
                "password is required".to_string(),
            ));
        }
        Ok(())
    }

    pub fn normalized_username(&self) -> &str {
        self.username.trim()
    }

    pub fn normalized_display_name(&self) -> &str {
        self.display_name.trim()
    }
}
