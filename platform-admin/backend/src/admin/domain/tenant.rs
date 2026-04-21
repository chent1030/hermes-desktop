use serde::{Deserialize, Serialize};

use super::error::AdminError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TenantRecord {
    pub id: i64,
    pub code: String,
    pub name: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTenantCommand {
    pub code: String,
    pub name: String,
}

impl CreateTenantCommand {
    pub fn validate(&self) -> Result<(), AdminError> {
        if self.code.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "tenant code is required".to_string(),
            ));
        }
        if self.name.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "tenant name is required".to_string(),
            ));
        }
        Ok(())
    }

    pub fn normalized_code(&self) -> &str {
        self.code.trim()
    }

    pub fn normalized_name(&self) -> &str {
        self.name.trim()
    }
}
