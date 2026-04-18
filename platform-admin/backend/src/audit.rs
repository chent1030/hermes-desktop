use std::fmt::{Display, Formatter};

use postgres::{Client, NoTls};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::auth::{AuthPrincipal, AuthTenant};

pub const AUDIT_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS platform_audit_events (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL REFERENCES platform_admin_tenants(id) ON DELETE CASCADE,
    account_id BIGINT NOT NULL REFERENCES platform_admin_accounts(id) ON DELETE CASCADE,
    event_type VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"#;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventInput {
    #[serde(rename = "type")]
    pub event_type: String,
    pub payload: Value,
    pub occurred_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct AuditBatchInput {
    pub events: Vec<AuditEventInput>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AuditBatchAccepted {
    pub accepted: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AuditHealthResponse {
    pub status: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuditError {
    InvalidRequest(String),
    Forbidden(String),
    Store(String),
}

impl Display for AuditError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message)
            | Self::Forbidden(message)
            | Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AuditError {}

#[derive(Debug)]
pub struct AuditStoreError(pub String);

impl Display for AuditStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for AuditStoreError {}

impl From<postgres::Error> for AuditStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait AuditStore {
    fn append_events(
        &mut self,
        tenant_id: i64,
        account_id: i64,
        events: &[AuditEventInput],
    ) -> Result<usize, AuditStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgAuditStore {
    database_url: String,
}

impl PgAuditStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    pub fn ensure_schema(&self) -> Result<(), AuditStoreError> {
        let mut client = self.connect()?;
        client.batch_execute(AUDIT_SCHEMA_SQL)?;
        Ok(())
    }

    fn connect(&self) -> Result<Client, AuditStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl AuditStore for PgAuditStore {
    fn append_events(
        &mut self,
        tenant_id: i64,
        account_id: i64,
        events: &[AuditEventInput],
    ) -> Result<usize, AuditStoreError> {
        let mut client = self.connect()?;
        for event in events {
            let payload = serde_json::to_string(&event.payload)
                .map_err(|error| AuditStoreError(error.to_string()))?;
            client.execute(
                "
                INSERT INTO platform_audit_events (
                    tenant_id,
                    account_id,
                    event_type,
                    payload,
                    occurred_at
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4::jsonb,
                    COALESCE($5::timestamptz, NOW())
                )
                ",
                &[
                    &tenant_id,
                    &account_id,
                    &event.event_type,
                    &payload,
                    &event.occurred_at,
                ],
            )?;
        }
        Ok(events.len())
    }
}

pub fn write_audit_events_for_actor<S: AuditStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    input: AuditBatchInput,
) -> Result<AuditBatchAccepted, AuditError> {
    let tenant = tenant_context(actor)?;
    let accepted = store
        .append_events(tenant.id, actor.user.id, &input.events)
        .map_err(|error| AuditError::Store(error.to_string()))?;
    Ok(AuditBatchAccepted { accepted })
}

pub fn audit_health_for_actor(actor: &AuthPrincipal) -> Result<AuditHealthResponse, AuditError> {
    let _tenant = tenant_context(actor)?;
    Ok(AuditHealthResponse {
        status: "ok".to_string(),
    })
}

fn tenant_context(actor: &AuthPrincipal) -> Result<&AuthTenant, AuditError> {
    match (actor.user.scope_type.as_str(), actor.tenant.as_ref()) {
        ("tenant", Some(tenant)) => Ok(tenant),
        _ => Err(AuditError::Forbidden(
            "desktop audit requires a tenant-scoped actor".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::{AuthPrincipal, AuthTenant, AuthUser};

    #[derive(Default)]
    struct MemoryAuditStore {
        writes: Vec<(i64, i64, Vec<AuditEventInput>)>,
    }

    impl AuditStore for MemoryAuditStore {
        fn append_events(
            &mut self,
            tenant_id: i64,
            account_id: i64,
            events: &[AuditEventInput],
        ) -> Result<usize, AuditStoreError> {
            self.writes.push((tenant_id, account_id, events.to_vec()));
            Ok(events.len())
        }
    }

    fn sample_tenant_admin_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: Some(AuthTenant {
                id: 7,
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
                is_active: true,
            }),
            user: AuthUser {
                id: 42,
                username: "admin".to_string(),
                display_name: "ACME Admin".to_string(),
                role_code: "tenant_admin".to_string(),
                scope_type: "tenant".to_string(),
                is_active: true,
            },
            password_hash: String::new(),
        }
    }

    #[test]
    fn accepts_audit_batches_for_authenticated_actor() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditStore::default();
        let accepted = write_audit_events_for_actor(
            &mut store,
            &actor,
            AuditBatchInput {
                events: vec![AuditEventInput {
                    event_type: "chat.started".to_string(),
                    payload: serde_json::json!({ "sessionId": "s1" }),
                    occurred_at: Some("2026-04-18T12:00:00Z".to_string()),
                }],
            },
        )
        .expect("audit should be accepted");

        assert_eq!(accepted.accepted, 1);
    }
}
