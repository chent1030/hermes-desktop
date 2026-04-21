use serde::{Deserialize, Serialize};

use crate::auth::AuthTenant;

use super::error::AdminError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogRecord {
    pub id: String,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSkillCatalogCommand {
    pub tenant_id: Option<i64>,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
}

impl CreateSkillCatalogCommand {
    pub fn validate(&self) -> Result<(), AdminError> {
        if self.name.trim().is_empty() {
            return Err(AdminError::InvalidRequest("name is required".to_string()));
        }
        if self.version.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "version is required".to_string(),
            ));
        }
        if self.download_url.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "downloadUrl is required".to_string(),
            ));
        }

        Ok(())
    }

    pub fn normalized_name(&self) -> &str {
        self.name.trim()
    }

    pub fn normalized_version(&self) -> &str {
        self.version.trim()
    }

    pub fn normalized_description(&self) -> &str {
        self.description.trim()
    }

    pub fn normalized_download_url(&self) -> &str {
        self.download_url.trim()
    }
}
