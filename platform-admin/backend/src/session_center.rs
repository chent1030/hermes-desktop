use std::fmt::{Display, Formatter};

use postgres::{Client, NoTls};
use serde::Serialize;

use crate::auth::AuthPrincipal;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryTenant {
    pub id: i64,
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryActor {
    pub id: i64,
    pub username: String,
    pub display_name: String,
    pub role_code: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummaryRecord {
    pub session_id: String,
    pub tenant: SessionSummaryTenant,
    pub last_account: SessionSummaryActor,
    pub last_event_type: String,
    pub last_occurred_at: String,
    pub event_count: i64,
    pub has_failure: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionCenterError {
    InvalidRequest(String),
    Forbidden(String),
    Store(String),
}

impl Display for SessionCenterError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidRequest(message) | Self::Forbidden(message) | Self::Store(message) => {
                write!(f, "{message}")
            }
        }
    }
}

impl std::error::Error for SessionCenterError {}

#[derive(Debug)]
pub struct SessionCenterStoreError(pub String);

impl Display for SessionCenterStoreError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for SessionCenterStoreError {}

impl From<postgres::Error> for SessionCenterStoreError {
    fn from(value: postgres::Error) -> Self {
        Self(value.to_string())
    }
}

pub trait SessionCenterStore {
    fn list_sessions(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError>;
}

#[derive(Debug, Clone)]
pub struct PgSessionCenterStore {
    database_url: String,
}

impl PgSessionCenterStore {
    pub fn new(database_url: impl Into<String>) -> Self {
        Self {
            database_url: database_url.into(),
        }
    }

    fn connect(&self) -> Result<Client, SessionCenterStoreError> {
        Client::connect(&self.database_url, NoTls).map_err(Into::into)
    }
}

impl SessionCenterStore for PgSessionCenterStore {
    fn list_sessions(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError> {
        let mut client = self.connect()?;
        let rows = client.query(
            r#"
            WITH ranked AS (
                SELECT
                    e.tenant_id,
                    e.account_id,
                    e.event_type,
                    e.occurred_at,
                    e.payload ->> 'sessionId' AS session_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY e.payload ->> 'sessionId'
                        ORDER BY e.occurred_at DESC, e.id DESC
                    ) AS row_num,
                    COUNT(*) OVER (
                        PARTITION BY e.payload ->> 'sessionId'
                    ) AS event_count,
                    BOOL_OR(e.event_type = 'chat.failed') OVER (
                        PARTITION BY e.payload ->> 'sessionId'
                    ) AS has_failure
                FROM platform_audit_events e
                WHERE e.tenant_id = $1
                  AND e.event_type LIKE 'chat.%'
                  AND COALESCE(e.payload ->> 'sessionId', '') <> ''
            )
            SELECT
                r.session_id,
                r.event_type,
                to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS occurred_at,
                r.event_count,
                r.has_failure,
                t.id AS tenant_id,
                t.code AS tenant_code,
                t.name AS tenant_name,
                a.id AS account_id,
                a.username,
                a.display_name,
                a.role_code
            FROM ranked r
            INNER JOIN platform_admin_tenants t ON t.id = r.tenant_id
            INNER JOIN platform_admin_accounts a ON a.id = r.account_id
            WHERE r.row_num = 1
            ORDER BY r.occurred_at DESC, r.session_id DESC
            LIMIT $2
            "#,
            &[&tenant_id, &limit],
        )?;

        Ok(rows.into_iter().map(row_to_session_summary).collect())
    }
}

pub fn list_sessions_for_actor<S: SessionCenterStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
    requested_limit: Option<i64>,
) -> Result<Vec<SessionSummaryRecord>, SessionCenterError> {
    let limit = normalize_limit(requested_limit);

    match actor.user.role_code.as_str() {
        "super_admin" => {
            let tenant_id = requested_tenant_id.ok_or(SessionCenterError::InvalidRequest(
                "tenantId is required for session queries".to_string(),
            ))?;
            store
                .list_sessions(tenant_id, limit)
                .map_err(|error| SessionCenterError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                SessionCenterError::Forbidden(
                    "tenant admin must belong to a tenant".to_string(),
                ),
            )?;
            if let Some(requested_tenant_id) = requested_tenant_id {
                if requested_tenant_id != tenant_id {
                    return Err(SessionCenterError::Forbidden(
                        "tenant admin can only view own tenant sessions".to_string(),
                    ));
                }
            }
            store
                .list_sessions(tenant_id, limit)
                .map_err(|error| SessionCenterError::Store(error.to_string()))
        }
        _ => Err(SessionCenterError::Forbidden(
            "actor is not allowed to list sessions".to_string(),
        )),
    }
}

fn normalize_limit(requested_limit: Option<i64>) -> i64 {
    match requested_limit {
        Some(limit) if limit > 0 => limit.min(200),
        _ => 100,
    }
}

fn row_to_session_summary(row: postgres::Row) -> SessionSummaryRecord {
    SessionSummaryRecord {
        session_id: row.get("session_id"),
        tenant: SessionSummaryTenant {
            id: row.get("tenant_id"),
            code: row.get("tenant_code"),
            name: row.get("tenant_name"),
        },
        last_account: SessionSummaryActor {
            id: row.get("account_id"),
            username: row.get("username"),
            display_name: row.get("display_name"),
            role_code: row.get("role_code"),
        },
        last_event_type: row.get("event_type"),
        last_occurred_at: row.get("occurred_at"),
        event_count: row.get("event_count"),
        has_failure: row.get("has_failure"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    use crate::auth::{AuthPrincipal, AuthTenant, AuthUser};

    #[derive(Default)]
    struct MemorySessionCenterStore {
        events: Vec<SessionSummaryRecord>,
    }

    impl SessionCenterStore for MemorySessionCenterStore {
        fn list_sessions(
            &mut self,
            tenant_id: i64,
            limit: i64,
        ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError> {
            let mut grouped = BTreeMap::<String, SessionSummaryRecord>::new();

            for event in self.events.iter().filter(|item| item.tenant.id == tenant_id) {
                grouped
                    .entry(event.session_id.clone())
                    .and_modify(|current| {
                        current.event_count += event.event_count;
                        current.has_failure = current.has_failure || event.has_failure;
                        if event.last_occurred_at > current.last_occurred_at {
                            current.last_event_type = event.last_event_type.clone();
                            current.last_occurred_at = event.last_occurred_at.clone();
                            current.last_account = event.last_account.clone();
                        }
                    })
                    .or_insert_with(|| event.clone());
            }

            let mut items = grouped.into_values().collect::<Vec<_>>();
            items.sort_by(|left, right| {
                right
                    .last_occurred_at
                    .cmp(&left.last_occurred_at)
                    .then_with(|| right.session_id.cmp(&left.session_id))
            });
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

    fn sample_session_event_record(session_id: &str, event_type: &str) -> SessionSummaryRecord {
        SessionSummaryRecord {
            session_id: session_id.to_string(),
            tenant: SessionSummaryTenant {
                id: 7,
                code: "acme".to_string(),
                name: "Acme Corp".to_string(),
            },
            last_account: SessionSummaryActor {
                id: 42,
                username: "admin".to_string(),
                display_name: "ACME Admin".to_string(),
                role_code: "tenant_admin".to_string(),
            },
            last_event_type: event_type.to_string(),
            last_occurred_at: if event_type == "chat.failed" {
                "2026-04-18T12:00:01.000Z".to_string()
            } else {
                "2026-04-18T12:00:00.000Z".to_string()
            },
            event_count: 1,
            has_failure: event_type == "chat.failed",
        }
    }

    #[test]
    fn tenant_admin_can_list_own_sessions() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        store.events = vec![sample_session_event_record("session-1", "chat.completed")];

        let items = list_sessions_for_actor(&mut store, &actor, None, Some(50))
            .expect("tenant admin should read own sessions");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].session_id, "session-1");
        assert_eq!(items[0].event_count, 1);
    }

    #[test]
    fn super_admin_requires_tenant_scope_to_list_sessions() {
        let actor = sample_super_admin_principal();
        let mut store = MemorySessionCenterStore::default();

        let error = list_sessions_for_actor(&mut store, &actor, None, None)
            .expect_err("super admin must provide tenant scope");

        assert!(matches!(error, SessionCenterError::InvalidRequest(_)));
    }

    #[test]
    fn session_summary_marks_failure_when_chat_failed_exists() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        store.events = vec![
            sample_session_event_record("session-1", "chat.completed"),
            sample_session_event_record("session-1", "chat.failed"),
        ];

        let items = list_sessions_for_actor(&mut store, &actor, None, None)
            .expect("tenant admin should read own sessions");

        assert!(items[0].has_failure);
        assert_eq!(items[0].event_count, 2);
        assert_eq!(items[0].last_event_type, "chat.failed");
    }
}
