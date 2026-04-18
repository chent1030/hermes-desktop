use std::fmt::{Display, Formatter};

use postgres::{Client, NoTls};
use serde::Serialize;
use serde_json::Value;

use crate::auth::{AuthPrincipal, AuthTenant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEventRecord {
    pub id: i64,
    pub tenant: AuthTenant,
    pub account: AuditActorRecord,
    pub event_type: String,
    pub payload: Value,
    pub occurred_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditActorRecord {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuditCenterError {
    InvalidRequest(String),
    Forbidden(String),
    Conflict(String),
    NotFound(String),
    Store(String),
}

impl Display for AuditCenterError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message)
            | Self::Forbidden(message)
            | Self::Conflict(message)
            | Self::NotFound(message)
            | Self::Store(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for AuditCenterError {}

#[derive(Debug)]
pub struct AuditCenterStoreError(pub String);

impl Display for AuditCenterStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for AuditCenterStoreError {}

impl From<postgres::Error> for AuditCenterStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait AuditCenterStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, AuditCenterStoreError>;
    fn list_audit_events(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<AuditEventRecord>, AuditCenterStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgAuditCenterStore {
    database_url: String,
}

impl PgAuditCenterStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    fn connect(&self) -> Result<Client, AuditCenterStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl AuditCenterStore for PgAuditCenterStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, AuditCenterStoreError> {
        let mut client = self.connect()?;
        let row = client.query_opt(
            "
            SELECT id, code, name, is_active
            FROM platform_admin_tenants
            WHERE id = $1
            ",
            &[&tenant_id],
        )?;
        Ok(row.map(|row| AuthTenant {
            id: row.get("id"),
            code: row.get("code"),
            name: row.get("name"),
            is_active: row.get("is_active"),
        }))
    }

    fn list_audit_events(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<AuditEventRecord>, AuditCenterStoreError> {
        let mut client = self.connect()?;
        let rows = client.query(
            "
            SELECT
                e.id,
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                t.is_active AS tenant_is_active,
                a.id AS account_id,
                a.username,
                a.display_name,
                a.role_code,
                e.event_type,
                e.payload::text AS payload_text,
                to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS occurred_at,
                to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at
            FROM platform_audit_events e
            INNER JOIN platform_admin_tenants t ON t.id = e.tenant_id
            INNER JOIN platform_admin_accounts a ON a.id = e.account_id
            WHERE e.tenant_id = $1
            ORDER BY e.occurred_at DESC, e.id DESC
            LIMIT $2
            ",
            &[&tenant_id, &limit],
        )?;

        Ok(rows.into_iter().map(row_to_audit_event).collect())
    }
}

pub fn list_audit_events_for_actor<S: AuditCenterStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
    requested_limit: Option<i64>,
) -> Result<Vec<AuditEventRecord>, AuditCenterError> {
    let limit = normalize_limit(requested_limit);

    match actor.user.role_code.as_str() {
        "super_admin" => {
            let tenant_id = requested_tenant_id.ok_or(AuditCenterError::InvalidRequest(
                "tenantId is required for audit queries".to_string(),
            ))?;
            let tenant = store
                .find_tenant(tenant_id)
                .map_err(|error| AuditCenterError::Store(error.to_string()))?
                .ok_or(AuditCenterError::NotFound("tenant not found".to_string()))?;
            if !tenant.is_active {
                return Err(AuditCenterError::Conflict("tenant is inactive".to_string()));
            }
            store
                .list_audit_events(tenant_id, limit)
                .map_err(|error| AuditCenterError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                AuditCenterError::Forbidden(
                    "tenant admin must belong to a tenant".to_string(),
                ),
            )?;
            if let Some(requested_tenant_id) = requested_tenant_id {
                if requested_tenant_id != tenant_id {
                    return Err(AuditCenterError::Forbidden(
                        "tenant admin can only view own tenant audit events".to_string(),
                    ));
                }
            }
            store
                .list_audit_events(tenant_id, limit)
                .map_err(|error| AuditCenterError::Store(error.to_string()))
        }
        _ => Err(AuditCenterError::Forbidden(
            "actor is not allowed to list audit events".to_string(),
        )),
    }
}

fn normalize_limit(requested_limit: Option<i64>) -> i64 {
    match requested_limit {
        Some(limit) if limit > 0 => limit.min(200),
        _ => 100,
    }
}

fn row_to_audit_event(row: postgres::Row) -> AuditEventRecord {
    let payload_text: String = row.get("payload_text");

    AuditEventRecord {
        id: row.get("id"),
        tenant: AuthTenant {
            id: row.get("tenant_id"),
            code: row.get("tenant_code"),
            name: row.get("tenant_name"),
            is_active: row.get("tenant_is_active"),
        },
        account: AuditActorRecord {
            id: row.get("account_id"),
            username: row.get("username"),
            display_name: row.get("display_name"),
            role_code: row.get("role_code"),
        },
        event_type: row.get("event_type"),
        payload: serde_json::from_str(&payload_text)
            .unwrap_or_else(|_| Value::String(payload_text.clone())),
        occurred_at: row.get("occurred_at"),
        created_at: row.get("created_at"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::AuthUser;

    #[derive(Default)]
    struct MemoryAuditCenterStore {
        tenants: Vec<AuthTenant>,
        events: Vec<AuditEventRecord>,
    }

    impl AuditCenterStore for MemoryAuditCenterStore {
        fn find_tenant(
            &mut self,
            tenant_id: i64,
        ) -> Result<Option<AuthTenant>, AuditCenterStoreError> {
            Ok(self
                .tenants
                .iter()
                .find(|tenant| tenant.id == tenant_id)
                .cloned())
        }

        fn list_audit_events(
            &mut self,
            tenant_id: i64,
            limit: i64,
        ) -> Result<Vec<AuditEventRecord>, AuditCenterStoreError> {
            let mut items = self
                .events
                .iter()
                .filter(|event| event.tenant.id == tenant_id)
                .cloned()
                .collect::<Vec<_>>();
            items.truncate(limit as usize);
            Ok(items)
        }
    }

    fn sample_super_admin_principal() -> AuthPrincipal {
        AuthPrincipal {
            tenant: None,
            user: AuthUser {
                id: 1,
                username: "root".to_string(),
                display_name: "Platform Root".to_string(),
                role_code: "super_admin".to_string(),
                scope_type: "platform".to_string(),
                is_active: true,
            },
            password_hash: String::new(),
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

    fn sample_audit_event_record() -> AuditEventRecord {
        AuditEventRecord {
            id: 11,
            tenant: AuthTenant {
                id: 7,
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
                is_active: true,
            },
            account: AuditActorRecord {
                id: 42,
                username: "admin".to_string(),
                display_name: "ACME Admin".to_string(),
                role_code: "tenant_admin".to_string(),
            },
            event_type: "workspace.initialized".to_string(),
            payload: serde_json::json!({ "modelCount": 2 }),
            occurred_at: "2026-04-18T12:00:00.000Z".to_string(),
            created_at: "2026-04-18T12:00:01.000Z".to_string(),
        }
    }

    #[test]
    fn tenant_admin_can_list_own_audit_events() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        store.events = vec![sample_audit_event_record()];

        let items = list_audit_events_for_actor(&mut store, &actor, Some(7), Some(50))
            .expect("tenant admin should read own audit events");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].event_type, "workspace.initialized");
    }

    #[test]
    fn super_admin_requires_tenant_scope_to_list_audit_events() {
        let actor = sample_super_admin_principal();
        let mut store = MemoryAuditCenterStore::default();

        let error = list_audit_events_for_actor(&mut store, &actor, None, None)
            .expect_err("super admin must provide tenant scope");

        assert!(matches!(error, AuditCenterError::InvalidRequest(_)));
    }
}
