use serde::{Deserialize, Serialize};

use crate::auth::AuthTenant;

use super::error::AdminError;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileRecord {
    pub id: String,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub provider: String,
    pub model: String,
    pub label: String,
    pub base_url: String,
    pub is_default: bool,
    pub is_active: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateModelProfileCommand {
    pub tenant_id: Option<i64>,
    pub provider: String,
    pub model: String,
    pub label: String,
    pub base_url: String,
    pub is_default: bool,
}

impl CreateModelProfileCommand {
    pub fn validate(&self) -> Result<(), AdminError> {
        if self.provider.trim().is_empty() {
            return Err(AdminError::InvalidRequest(
                "provider is required".to_string(),
            ));
        }
        if self.model.trim().is_empty() {
            return Err(AdminError::InvalidRequest("model is required".to_string()));
        }
        if self.label.trim().is_empty() {
            return Err(AdminError::InvalidRequest("label is required".to_string()));
        }

        Ok(())
    }

    pub fn normalized_provider(&self) -> &str {
        self.provider.trim()
    }

    pub fn normalized_model(&self) -> &str {
        self.model.trim()
    }

    pub fn normalized_label(&self) -> &str {
        self.label.trim()
    }

    pub fn normalized_base_url(&self) -> &str {
        self.base_url.trim()
    }
}
