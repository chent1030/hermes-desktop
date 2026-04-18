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
    pub event_family: String,
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
pub struct AuditEventQuery {
    pub event_family: Option<AuditEventFamily>,
    pub event_type: Option<String>,
    pub event_prefix: Option<String>,
    pub occurred_from: Option<String>,
    pub occurred_to: Option<String>,
    pub account_query: Option<String>,
    pub payload_query: Option<String>,
    pub before_id: Option<i64>,
    pub limit: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuditEventFamily {
    Run,
    Chat,
    Auth,
    Workspace,
    Other,
}

impl AuditEventFamily {
    fn from_query_value(value: &str) -> Option<Self> {
        match value {
            "run" => Some(Self::Run),
            "chat" => Some(Self::Chat),
            "auth" => Some(Self::Auth),
            "workspace" => Some(Self::Workspace),
            "other" => Some(Self::Other),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Run => "run",
            Self::Chat => "chat",
            Self::Auth => "auth",
            Self::Workspace => "workspace",
            Self::Other => "other",
        }
    }

    #[cfg(test)]
    fn matches_event_type(self, event_type: &str) -> bool {
        match self {
            Self::Run => event_type.starts_with("run."),
            Self::Chat => event_type.starts_with("chat."),
            Self::Auth => event_type.starts_with("auth."),
            Self::Workspace => event_type.starts_with("workspace."),
            Self::Other => {
                !event_type.starts_with("run.")
                    && !event_type.starts_with("chat.")
                    && !event_type.starts_with("auth.")
                    && !event_type.starts_with("workspace.")
            }
        }
    }
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
        query: &AuditEventQuery,
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
        query: &AuditEventQuery,
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
                CASE
                    WHEN e.event_type LIKE 'run.%' THEN 'run'
                    WHEN e.event_type LIKE 'chat.%' THEN 'chat'
                    WHEN e.event_type LIKE 'auth.%' THEN 'auth'
                    WHEN e.event_type LIKE 'workspace.%' THEN 'workspace'
                    ELSE 'other'
                END AS event_family,
                e.event_type,
                e.payload::text AS payload_text,
                to_char(e.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS occurred_at,
                to_char(e.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at
            FROM platform_audit_events e
            INNER JOIN platform_admin_tenants t ON t.id = e.tenant_id
            INNER JOIN platform_admin_accounts a ON a.id = e.account_id
            WHERE e.tenant_id = $1
              AND (
                    $2::varchar IS NULL
                    OR CASE
                        WHEN e.event_type LIKE 'run.%' THEN 'run'
                        WHEN e.event_type LIKE 'chat.%' THEN 'chat'
                        WHEN e.event_type LIKE 'auth.%' THEN 'auth'
                        WHEN e.event_type LIKE 'workspace.%' THEN 'workspace'
                        ELSE 'other'
                    END = $2
              )
              AND ($3::varchar IS NULL OR e.event_type = $3)
              AND ($4::varchar IS NULL OR e.event_type LIKE ($4 || '%'))
              AND ($5::text::timestamptz IS NULL OR e.occurred_at >= $5::text::timestamptz)
              AND ($6::text::timestamptz IS NULL OR e.occurred_at <= $6::text::timestamptz)
              AND (
                    $7::varchar IS NULL
                    OR a.username ILIKE ('%' || $7 || '%')
                    OR a.display_name ILIKE ('%' || $7 || '%')
              )
              AND ($8::varchar IS NULL OR e.payload::text ILIKE ('%' || $8 || '%'))
              AND ($9::bigint IS NULL OR e.id < $9)
            ORDER BY e.occurred_at DESC, e.id DESC
            LIMIT $10
            ",
            &[
                &tenant_id,
                &query.event_family.as_ref().map(|family| family.as_str()),
                &query.event_type,
                &query.event_prefix,
                &query.occurred_from,
                &query.occurred_to,
                &query.account_query,
                &query.payload_query,
                &query.before_id,
                &query.limit,
            ],
        )?;

        Ok(rows.into_iter().map(row_to_audit_event).collect())
    }
}

pub fn list_audit_events_for_actor<S: AuditCenterStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
    query: AuditEventQuery,
) -> Result<Vec<AuditEventRecord>, AuditCenterError> {
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
                .list_audit_events(tenant_id, &query)
                .map_err(map_store_read_error)
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
                .list_audit_events(tenant_id, &query)
                .map_err(map_store_read_error)
        }
        _ => Err(AuditCenterError::Forbidden(
            "actor is not allowed to list audit events".to_string(),
        )),
    }
}

pub fn build_audit_event_query(
    requested_event_family: Option<String>,
    requested_event_type: Option<String>,
    requested_event_prefix: Option<String>,
    requested_occurred_from: Option<String>,
    requested_occurred_to: Option<String>,
    requested_account_query: Option<String>,
    requested_payload_query: Option<String>,
    requested_before_id: Option<i64>,
    requested_limit: Option<i64>,
) -> Result<AuditEventQuery, AuditCenterError> {
    let event_family = requested_event_family
        .filter(|value| !value.trim().is_empty())
        .map(|value| {
            AuditEventFamily::from_query_value(value.trim()).ok_or(
                AuditCenterError::InvalidRequest(
                    "eventFamily must be one of run, chat, auth, workspace, other"
                        .to_string(),
                ),
            )
        })
        .transpose()?;
    let occurred_from = requested_occurred_from.filter(|value| !value.trim().is_empty());
    let occurred_to = requested_occurred_to.filter(|value| !value.trim().is_empty());

    if let Some(value) = occurred_from.as_ref() {
        if !looks_like_iso_timestamp(value) {
            return Err(AuditCenterError::InvalidRequest(
                "occurredFrom must be an ISO-8601 timestamp".to_string(),
            ));
        }
    }

    if let Some(value) = occurred_to.as_ref() {
        if !looks_like_iso_timestamp(value) {
            return Err(AuditCenterError::InvalidRequest(
                "occurredTo must be an ISO-8601 timestamp".to_string(),
            ));
        }
    }

    Ok(AuditEventQuery {
        event_family,
        event_type: requested_event_type.filter(|value| !value.trim().is_empty()),
        event_prefix: requested_event_prefix.filter(|value| !value.trim().is_empty()),
        occurred_from,
        occurred_to,
        account_query: requested_account_query.filter(|value| !value.trim().is_empty()),
        payload_query: requested_payload_query.filter(|value| !value.trim().is_empty()),
        before_id: requested_before_id,
        limit: normalize_limit(requested_limit),
    })
}

fn normalize_limit(requested_limit: Option<i64>) -> i64 {
    match requested_limit {
        Some(limit) if limit > 0 => limit.min(200),
        _ => 100,
    }
}

fn looks_like_iso_timestamp(value: &str) -> bool {
    if value.len() < 20 {
        return false;
    }
    let has_date = value.len() >= 20
        && value.as_bytes().get(4) == Some(&b'-')
        && value.as_bytes().get(7) == Some(&b'-');
    let has_time = value.contains('T') && value.contains(':');
    let suffix_after_date = value.get(10..).unwrap_or_default();
    let suffix_after_time = value.get(11..).unwrap_or_default();
    let has_timezone = value.ends_with('Z')
        || suffix_after_date.contains('+')
        || suffix_after_time.contains('-');
    has_date && has_time && has_timezone
}

fn map_store_read_error(error: AuditCenterStoreError) -> AuditCenterError {
    let message = error.to_string();
    if message.contains("invalid input syntax")
        && (message.contains("timestamp") || message.contains("date/time"))
    {
        AuditCenterError::InvalidRequest("invalid time range format".to_string())
    } else {
        AuditCenterError::Store(message)
    }
}

#[cfg(test)]
fn contains_ignore_case(haystack: &str, needle: &str) -> bool {
    haystack.to_lowercase().contains(&needle.to_lowercase())
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
        event_family: row.get("event_family"),
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
    use crate::audit::{AuditBatchInput, AuditEventInput, PgAuditStore, write_audit_events_for_actor};
    use crate::auth::AuthUser;
    use crate::live_test_support::{
        acquire_live_postgres_guard, ensure_live_platform_schema, live_database_url, live_unique,
        seed_live_tenant_admin,
    };

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
            query: &AuditEventQuery,
        ) -> Result<Vec<AuditEventRecord>, AuditCenterStoreError> {
            let mut items = self
                .events
                .iter()
                .filter(|event| event.tenant.id == tenant_id)
                .filter(|event| {
                    query
                        .event_family
                        .as_ref()
                        .is_none_or(|value| value.matches_event_type(&event.event_type))
                })
                .filter(|event| {
                    query
                        .event_type
                        .as_ref()
                        .is_none_or(|value| event.event_type == *value)
                })
                .filter(|event| {
                    query
                        .event_prefix
                        .as_ref()
                        .is_none_or(|value| event.event_type.starts_with(value))
                })
                .filter(|event| {
                    query
                        .before_id
                        .is_none_or(|value| event.id < value)
                })
                .filter(|event| {
                    query
                        .occurred_from
                        .as_ref()
                        .is_none_or(|value| event.occurred_at >= *value)
                })
                .filter(|event| {
                    query
                        .occurred_to
                        .as_ref()
                        .is_none_or(|value| event.occurred_at <= *value)
                })
                .filter(|event| {
                    query.account_query.as_ref().is_none_or(|value| {
                        contains_ignore_case(&event.account.username, value)
                            || contains_ignore_case(&event.account.display_name, value)
                    })
                })
                .filter(|event| {
                    query.payload_query.as_ref().is_none_or(|value| {
                        contains_ignore_case(&event.payload.to_string(), value)
                    })
                })
                .cloned()
                .collect::<Vec<_>>();
            items.truncate(query.limit as usize);
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
            event_family: "workspace".to_string(),
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

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(None, None, None, None, None, None, None, None, Some(50))
                .expect("query"),
        )
        .expect("tenant admin should read own audit events");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].event_type, "workspace.initialized");
    }

    #[test]
    fn super_admin_requires_tenant_scope_to_list_audit_events() {
        let actor = sample_super_admin_principal();
        let mut store = MemoryAuditCenterStore::default();

        let error = list_audit_events_for_actor(
            &mut store,
            &actor,
            None,
            build_audit_event_query(None, None, None, None, None, None, None, None, None)
                .expect("query"),
        )
        .expect_err("super admin must provide tenant scope");

        assert!(matches!(error, AuditCenterError::InvalidRequest(_)));
    }

    #[test]
    fn filters_audit_events_by_event_type() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut other = sample_audit_event_record();
        other.id = 12;
        other.event_type = "chat.started".to_string();
        store.events = vec![sample_audit_event_record(), other];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(
                None,
                Some("chat.started".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .expect("query"),
        )
        .expect("tenant admin should filter audit events");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].event_type, "chat.started");
    }

    #[test]
    fn filters_audit_events_by_event_prefix() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut model_event = sample_audit_event_record();
        model_event.id = 12;
        model_event.event_type = "run.model.selected".to_string();
        model_event.event_family = "run".to_string();
        let mut chat_event = sample_audit_event_record();
        chat_event.id = 13;
        chat_event.event_type = "chat.started".to_string();
        chat_event.event_family = "chat".to_string();
        store.events = vec![model_event, chat_event];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(
                Some("run".to_string()),
                None,
                Some("run.".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .expect("query"),
        )
        .expect("tenant admin should filter audit events by prefix");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].event_type, "run.model.selected");
    }

    #[test]
    fn filters_audit_events_by_event_family() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut run_event = sample_audit_event_record();
        run_event.id = 12;
        run_event.event_type = "run.tool.failed".to_string();
        run_event.event_family = "run".to_string();
        let mut other_event = sample_audit_event_record();
        other_event.id = 13;
        other_event.event_type = "system.heartbeat".to_string();
        other_event.event_family = "other".to_string();
        store.events = vec![run_event, other_event];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(
                Some("other".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .expect("query"),
        )
        .expect("tenant admin should filter audit events by family");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].event_type, "system.heartbeat");
        assert_eq!(items[0].event_family, "other");
    }

    #[test]
    fn filters_audit_events_by_account_query() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut other = sample_audit_event_record();
        other.id = 12;
        other.account.username = "bob".to_string();
        other.account.display_name = "Bob".to_string();
        store.events = vec![sample_audit_event_record(), other];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(
                None,
                None,
                None,
                None,
                None,
                Some("acme".to_string()),
                None,
                None,
                None,
            )
            .expect("query"),
        )
        .expect("tenant admin should filter audit events by account");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].account.username, "admin");
    }

    #[test]
    fn filters_audit_events_by_payload_query() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut other = sample_audit_event_record();
        other.id = 12;
        other.payload = serde_json::json!({ "marker": "needle" });
        store.events = vec![sample_audit_event_record(), other];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(
                None,
                None,
                None,
                None,
                None,
                None,
                Some("needle".to_string()),
                None,
                None,
            )
            .expect("query"),
        )
        .expect("tenant admin should filter audit events by payload text");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, 12);
    }

    #[test]
    fn paginates_audit_events_by_before_id() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemoryAuditCenterStore::default();
        let mut older = sample_audit_event_record();
        older.id = 9;
        older.occurred_at = "2026-04-18T11:00:00.000Z".to_string();
        let mut newest = sample_audit_event_record();
        newest.id = 11;
        newest.occurred_at = "2026-04-18T12:00:00.000Z".to_string();
        store.events = vec![newest, older];

        let items = list_audit_events_for_actor(
            &mut store,
            &actor,
            Some(7),
            build_audit_event_query(None, None, None, None, None, None, None, Some(11), None)
                .expect("query"),
        )
        .expect("tenant admin should paginate audit events");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].id, 9);
    }

    #[test]
    fn rejects_invalid_occurred_from_format() {
        let error = build_audit_event_query(
            None,
            None,
            None,
            Some("not-a-time".to_string()),
            None,
            None,
            None,
            None,
            None,
        )
        .expect_err("invalid time should be rejected");

        assert!(matches!(error, AuditCenterError::InvalidRequest(_)));
    }

    #[test]
    fn rejects_unknown_event_family_filter() {
        let error = build_audit_event_query(
            Some("custom".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect_err("unknown event family should be rejected");

        assert!(matches!(error, AuditCenterError::InvalidRequest(_)));
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn lists_live_audit_events_for_tenant_actor() {
        let _guard = acquire_live_postgres_guard();
        let database_url = live_database_url();
        ensure_live_platform_schema(&database_url);

        let unique = live_unique("audit-center");
        let actor = seed_live_tenant_admin(
            &database_url,
            &format!("tenant-{unique}"),
            &format!("tenant_admin_{unique}"),
            "Stage2!Pass123",
        );
        let tenant_id = actor.tenant.as_ref().expect("tenant should exist").id;
        let marker = format!("marker-{unique}");

        write_audit_events_for_actor(
            &mut PgAuditStore::new(&database_url),
            &actor,
            AuditBatchInput {
                events: vec![AuditEventInput {
                    event_type: "workspace.initialized".to_string(),
                    payload: serde_json::json!({ "marker": marker.clone() }),
                    occurred_at: Some("2026-04-18T12:00:00Z".to_string()),
                }],
            },
        )
        .expect("audit event should be written");

        let items = list_audit_events_for_actor(
            &mut PgAuditCenterStore::new(&database_url),
            &actor,
            Some(tenant_id),
            build_audit_event_query(
                None,
                Some("workspace.initialized".to_string()),
                None,
                None,
                None,
                None,
                None,
                None,
                Some(50),
            )
            .expect("query"),
        )
        .expect("audit events should be listed");

        let event = items
            .iter()
            .find(|item| item.payload.get("marker") == Some(&serde_json::json!(marker)))
            .expect("live audit event should be returned");

        assert_eq!(event.event_type, "workspace.initialized");
        assert_eq!(event.tenant.id, tenant_id);
    }
}
