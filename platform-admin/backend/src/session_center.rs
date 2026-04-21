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
    pub tool_run_count: i64,
    pub last_tool_label: Option<String>,
    pub last_tool_source: Option<String>,
    pub has_tool_failure: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionQuery {
    pub last_event_type: Option<String>,
    pub has_failure: Option<bool>,
    pub last_occurred_from: Option<String>,
    pub last_occurred_to: Option<String>,
    pub before_id: Option<String>,
    pub limit: i64,
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
        query: &SessionQuery,
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
        query: &SessionQuery,
    ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError> {
        let mut client = self.connect()?;
        let anchor_last_occurred_at = if let Some(before_id) = query.before_id.as_ref() {
            let row = client.query_opt(
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
                ),
                summary AS (
                    SELECT
                        r.session_id,
                        r.event_type AS last_event_type,
                        r.occurred_at AS last_occurred_at,
                        r.has_failure
                    FROM ranked r
                    WHERE r.row_num = 1
                )
                SELECT
                    to_char(
                        summary.last_occurred_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                    ) AS last_occurred_at
                FROM summary
                WHERE ($2::varchar IS NULL OR summary.last_event_type = $2)
                  AND ($3::bool IS NULL OR summary.has_failure = $3)
                  AND ($4::text::timestamptz IS NULL OR summary.last_occurred_at >= $4::text::timestamptz)
                  AND ($5::text::timestamptz IS NULL OR summary.last_occurred_at <= $5::text::timestamptz)
                  AND summary.session_id = $6
                "#,
                &[
                    &tenant_id,
                    &query.last_event_type,
                    &query.has_failure,
                    &query.last_occurred_from,
                    &query.last_occurred_to,
                    &before_id,
                ],
            )?;
            Some(
                row.ok_or_else(|| SessionCenterStoreError("invalid beforeId".to_string()))?
                    .get::<_, String>("last_occurred_at"),
            )
        } else {
            None
        };

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
            ),
            tool_ranked AS (
                SELECT
                    e.payload ->> 'sessionId' AS session_id,
                    e.event_type,
                    e.occurred_at,
                    COALESCE(
                        NULLIF(e.payload ->> 'lastLabel', ''),
                        NULLIF(e.payload ->> 'label', '')
                    ) AS tool_label,
                    NULLIF(e.payload ->> 'source', '') AS tool_source,
                    ROW_NUMBER() OVER (
                        PARTITION BY e.payload ->> 'sessionId'
                        ORDER BY e.occurred_at DESC, e.id DESC
                    ) AS row_num
                FROM platform_audit_events e
                WHERE e.tenant_id = $1
                  AND e.event_type LIKE 'run.tool.%'
                  AND COALESCE(e.payload ->> 'sessionId', '') <> ''
            ),
            tool_summary AS (
                SELECT
                    session_id,
                    COUNT(*) FILTER (WHERE event_type = 'run.tool.started') AS tool_run_count,
                    BOOL_OR(event_type = 'run.tool.failed') AS has_tool_failure,
                    MAX(CASE WHEN row_num = 1 THEN tool_label END) AS last_tool_label,
                    MAX(CASE WHEN row_num = 1 THEN tool_source END) AS last_tool_source
                FROM tool_ranked
                GROUP BY session_id
            ),
            summary AS (
                SELECT
                    r.session_id,
                    r.event_type AS last_event_type,
                    r.occurred_at AS last_occurred_at,
                    r.event_count,
                    r.has_failure,
                    t.id AS tenant_id,
                    t.code AS tenant_code,
                    t.name AS tenant_name,
                    a.id AS account_id,
                    a.username,
                    a.display_name,
                    a.role_code,
                    COALESCE(ts.tool_run_count, 0) AS tool_run_count,
                    ts.last_tool_label,
                    ts.last_tool_source,
                    COALESCE(ts.has_tool_failure, FALSE) AS has_tool_failure
                FROM ranked r
                INNER JOIN platform_admin_tenants t ON t.id = r.tenant_id
                INNER JOIN platform_admin_accounts a ON a.id = r.account_id
                LEFT JOIN tool_summary ts ON ts.session_id = r.session_id
                WHERE r.row_num = 1
            )
            SELECT
                summary.session_id,
                summary.last_event_type,
                to_char(
                    summary.last_occurred_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                ) AS last_occurred_at,
                summary.event_count,
                summary.has_failure,
                summary.tenant_id,
                summary.tenant_code,
                summary.tenant_name,
                summary.account_id,
                summary.username,
                summary.display_name,
                summary.role_code,
                summary.tool_run_count,
                summary.last_tool_label,
                summary.last_tool_source,
                summary.has_tool_failure
            FROM summary
            WHERE ($2::varchar IS NULL OR summary.last_event_type = $2)
              AND ($3::bool IS NULL OR summary.has_failure = $3)
              AND ($4::text::timestamptz IS NULL OR summary.last_occurred_at >= $4::text::timestamptz)
              AND ($5::text::timestamptz IS NULL OR summary.last_occurred_at <= $5::text::timestamptz)
              AND (
                  $6::text::timestamptz IS NULL
                  OR summary.last_occurred_at < $6::text::timestamptz
                  OR (
                      summary.last_occurred_at = $6::text::timestamptz
                      AND summary.session_id < $7
                  )
              )
            ORDER BY summary.last_occurred_at DESC, summary.session_id DESC
            LIMIT $8
            "#,
            &[
                &tenant_id,
                &query.last_event_type,
                &query.has_failure,
                &query.last_occurred_from,
                &query.last_occurred_to,
                &anchor_last_occurred_at,
                &query.before_id,
                &query.limit,
            ],
        )?;

        Ok(rows.into_iter().map(row_to_session_summary).collect())
    }
}

pub fn list_sessions_for_actor<S: SessionCenterStore>(
    store: &mut S,
    actor: &AuthPrincipal,
    requested_tenant_id: Option<i64>,
    query: SessionQuery,
) -> Result<Vec<SessionSummaryRecord>, SessionCenterError> {
    match actor.user.role_code.as_str() {
        "super_admin" => {
            let tenant_id = requested_tenant_id.ok_or(SessionCenterError::InvalidRequest(
                "tenantId is required for session queries".to_string(),
            ))?;
            store
                .list_sessions(tenant_id, &query)
                .map_err(map_store_read_error)
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().map(|tenant| tenant.id).ok_or(
                SessionCenterError::Forbidden("tenant admin must belong to a tenant".to_string()),
            )?;
            if let Some(requested_tenant_id) = requested_tenant_id {
                if requested_tenant_id != tenant_id {
                    return Err(SessionCenterError::Forbidden(
                        "tenant admin can only view own tenant sessions".to_string(),
                    ));
                }
            }
            store
                .list_sessions(tenant_id, &query)
                .map_err(map_store_read_error)
        }
        _ => Err(SessionCenterError::Forbidden(
            "actor is not allowed to list sessions".to_string(),
        )),
    }
}

pub fn build_session_query(
    requested_last_event_type: Option<String>,
    requested_has_failure: Option<bool>,
    requested_last_occurred_from: Option<String>,
    requested_last_occurred_to: Option<String>,
    requested_before_id: Option<String>,
    requested_limit: Option<i64>,
) -> Result<SessionQuery, SessionCenterError> {
    let last_occurred_from = requested_last_occurred_from.filter(|value| !value.trim().is_empty());
    let last_occurred_to = requested_last_occurred_to.filter(|value| !value.trim().is_empty());

    if let Some(value) = last_occurred_from.as_ref() {
        if !looks_like_iso_timestamp(value) {
            return Err(SessionCenterError::InvalidRequest(
                "lastOccurredFrom must be an ISO-8601 timestamp".to_string(),
            ));
        }
    }

    if let Some(value) = last_occurred_to.as_ref() {
        if !looks_like_iso_timestamp(value) {
            return Err(SessionCenterError::InvalidRequest(
                "lastOccurredTo must be an ISO-8601 timestamp".to_string(),
            ));
        }
    }

    Ok(SessionQuery {
        last_event_type: requested_last_event_type.filter(|value| !value.trim().is_empty()),
        has_failure: requested_has_failure,
        last_occurred_from,
        last_occurred_to,
        before_id: requested_before_id.filter(|value| !value.trim().is_empty()),
        limit: normalize_limit(requested_limit),
    })
}

pub fn parse_has_failure_query(raw: Option<String>) -> Result<Option<bool>, SessionCenterError> {
    match raw.as_deref() {
        None | Some("") => Ok(None),
        Some("true") => Ok(Some(true)),
        Some("false") => Ok(Some(false)),
        Some(_) => Err(SessionCenterError::InvalidRequest(
            "hasFailure must be true or false".to_string(),
        )),
    }
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
    let has_date = value.as_bytes().get(4) == Some(&b'-') && value.as_bytes().get(7) == Some(&b'-');
    let has_time = value.contains('T') && value.contains(':');
    let suffix_after_date = value.get(10..).unwrap_or_default();
    let suffix_after_time = value.get(11..).unwrap_or_default();
    let has_timezone =
        value.ends_with('Z') || suffix_after_date.contains('+') || suffix_after_time.contains('-');
    has_date && has_time && has_timezone
}

fn map_store_read_error(error: SessionCenterStoreError) -> SessionCenterError {
    let message = error.to_string();
    if message == "invalid beforeId" {
        SessionCenterError::InvalidRequest(
            "beforeId does not match current session result set".to_string(),
        )
    } else if message.contains("invalid input syntax")
        && (message.contains("timestamp") || message.contains("date/time"))
    {
        SessionCenterError::InvalidRequest("invalid time range format".to_string())
    } else {
        SessionCenterError::Store(message)
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
        last_event_type: row.get("last_event_type"),
        last_occurred_at: row.get("last_occurred_at"),
        event_count: row.get("event_count"),
        has_failure: row.get("has_failure"),
        tool_run_count: row.get("tool_run_count"),
        last_tool_label: row.get("last_tool_label"),
        last_tool_source: row.get("last_tool_source"),
        has_tool_failure: row.get("has_tool_failure"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;

    use crate::audit::{
        AuditBatchInput, AuditEventInput, PgAuditStore, write_audit_events_for_actor,
    };
    use crate::auth::{AuthPrincipal, AuthTenant, AuthUser};
    use crate::live_test_support::{
        acquire_live_postgres_guard, ensure_live_platform_schema, live_database_url, live_unique,
        seed_live_tenant_admin,
    };

    #[derive(Default)]
    struct MemorySessionCenterStore {
        events: Vec<SessionSummaryRecord>,
    }

    impl SessionCenterStore for MemorySessionCenterStore {
        fn list_sessions(
            &mut self,
            tenant_id: i64,
            query: &SessionQuery,
        ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError> {
            let mut grouped = BTreeMap::<String, SessionSummaryRecord>::new();

            for event in self
                .events
                .iter()
                .filter(|item| item.tenant.id == tenant_id)
            {
                grouped
                    .entry(event.session_id.clone())
                    .and_modify(|current| {
                        current.event_count += event.event_count;
                        current.has_failure = current.has_failure || event.has_failure;
                        current.tool_run_count += event.tool_run_count;
                        current.has_tool_failure =
                            current.has_tool_failure || event.has_tool_failure;
                        if current.last_tool_label.is_none() {
                            current.last_tool_label = event.last_tool_label.clone();
                        }
                        if current.last_tool_source.is_none() {
                            current.last_tool_source = event.last_tool_source.clone();
                        }
                        if event.last_occurred_at > current.last_occurred_at {
                            current.last_event_type = event.last_event_type.clone();
                            current.last_occurred_at = event.last_occurred_at.clone();
                            current.last_account = event.last_account.clone();
                            current.last_tool_label = event.last_tool_label.clone();
                            current.last_tool_source = event.last_tool_source.clone();
                        }
                    })
                    .or_insert_with(|| event.clone());
            }

            let mut items = grouped.into_values().collect::<Vec<_>>();
            items.retain(|item| {
                query
                    .last_event_type
                    .as_ref()
                    .is_none_or(|value| item.last_event_type == *value)
            });
            items.retain(|item| {
                query
                    .has_failure
                    .is_none_or(|value| item.has_failure == value)
            });
            items.retain(|item| {
                query
                    .last_occurred_from
                    .as_ref()
                    .is_none_or(|value| item.last_occurred_at >= *value)
            });
            items.retain(|item| {
                query
                    .last_occurred_to
                    .as_ref()
                    .is_none_or(|value| item.last_occurred_at <= *value)
            });
            items.sort_by(|left, right| {
                right
                    .last_occurred_at
                    .cmp(&left.last_occurred_at)
                    .then_with(|| right.session_id.cmp(&left.session_id))
            });

            if let Some(before_id) = query.before_id.as_ref() {
                let anchor = items
                    .iter()
                    .find(|item| item.session_id == *before_id)
                    .cloned()
                    .ok_or_else(|| SessionCenterStoreError("invalid beforeId".to_string()))?;
                items.retain(|item| {
                    item.last_occurred_at < anchor.last_occurred_at
                        || (item.last_occurred_at == anchor.last_occurred_at
                            && item.session_id < anchor.session_id)
                });
            }

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
            tool_run_count: 0,
            last_tool_label: None,
            last_tool_source: None,
            has_tool_failure: false,
        }
    }

    #[test]
    fn tenant_admin_can_list_own_sessions() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        store.events = vec![sample_session_event_record("session-1", "chat.completed")];

        let items = list_sessions_for_actor(
            &mut store,
            &actor,
            None,
            build_session_query(None, None, None, None, None, Some(50)).expect("query"),
        )
        .expect("tenant admin should read own sessions");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].session_id, "session-1");
        assert_eq!(items[0].event_count, 1);
    }

    #[test]
    fn super_admin_requires_tenant_scope_to_list_sessions() {
        let actor = sample_super_admin_principal();
        let mut store = MemorySessionCenterStore::default();

        let error = list_sessions_for_actor(
            &mut store,
            &actor,
            None,
            build_session_query(None, None, None, None, None, None).expect("query"),
        )
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

        let items = list_sessions_for_actor(
            &mut store,
            &actor,
            None,
            build_session_query(None, None, None, None, None, None).expect("query"),
        )
        .expect("tenant admin should read own sessions");

        assert!(items[0].has_failure);
        assert_eq!(items[0].event_count, 2);
        assert_eq!(items[0].last_event_type, "chat.failed");
    }

    #[test]
    fn session_summary_keeps_tool_run_signals() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        let mut item = sample_session_event_record("session-1", "chat.completed");
        item.tool_run_count = 2;
        item.last_tool_label = Some("search_web".to_string());
        item.last_tool_source = Some("api".to_string());
        item.has_tool_failure = true;
        store.events = vec![item];

        let items = list_sessions_for_actor(
            &mut store,
            &actor,
            None,
            build_session_query(None, None, None, None, None, None).expect("query"),
        )
        .expect("tenant admin should read session tool signals");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].tool_run_count, 2);
        assert_eq!(items[0].last_tool_label.as_deref(), Some("search_web"));
        assert_eq!(items[0].last_tool_source.as_deref(), Some("api"));
        assert!(items[0].has_tool_failure);
    }

    #[test]
    fn filters_sessions_by_last_event_type() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        let mut completed = sample_session_event_record("session-1", "chat.completed");
        completed.last_occurred_at = "2026-04-18T12:00:00.000Z".to_string();
        let mut failed = sample_session_event_record("session-2", "chat.failed");
        failed.last_occurred_at = "2026-04-18T12:01:00.000Z".to_string();
        store.events = vec![completed, failed];

        let query = build_session_query(
            Some("chat.failed".to_string()),
            None,
            None,
            None,
            None,
            None,
        )
        .expect("query");

        let items = list_sessions_for_actor(&mut store, &actor, None, query)
            .expect("tenant admin should filter sessions");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].session_id, "session-2");
    }

    #[test]
    fn filters_sessions_by_has_failure() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        let ok = sample_session_event_record("session-1", "chat.completed");
        let failed = sample_session_event_record("session-2", "chat.failed");
        store.events = vec![ok, failed];

        let query = build_session_query(None, Some(true), None, None, None, None).expect("query");
        let items = list_sessions_for_actor(&mut store, &actor, None, query)
            .expect("tenant admin should filter failed sessions");

        assert_eq!(items.len(), 1);
        assert!(items[0].has_failure);
    }

    #[test]
    fn paginates_sessions_by_before_id() {
        let actor = sample_tenant_admin_principal();
        let mut store = MemorySessionCenterStore::default();
        let mut newest = sample_session_event_record("session-2", "chat.completed");
        newest.last_occurred_at = "2026-04-18T12:01:00.000Z".to_string();
        let mut older = sample_session_event_record("session-1", "chat.completed");
        older.last_occurred_at = "2026-04-18T12:00:00.000Z".to_string();
        store.events = vec![newest, older];

        let query =
            build_session_query(None, None, None, None, Some("session-2".to_string()), None)
                .expect("query");
        let items = list_sessions_for_actor(&mut store, &actor, None, query)
            .expect("tenant admin should paginate sessions");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].session_id, "session-1");
    }

    #[test]
    fn rejects_invalid_has_failure_format() {
        let error = parse_has_failure_query(Some("maybe".to_string()))
            .expect_err("invalid bool should be rejected");

        assert!(matches!(error, SessionCenterError::InvalidRequest(_)));
    }

    #[test]
    fn rejects_invalid_last_occurred_from_format() {
        let error =
            build_session_query(None, None, Some("not-a-time".to_string()), None, None, None)
                .expect_err("invalid time should be rejected");

        assert!(matches!(error, SessionCenterError::InvalidRequest(_)));
    }

    #[test]
    #[ignore = "requires ADMIN_DATABASE_URL to reach a live PostgreSQL instance"]
    fn lists_live_sessions_grouped_by_session_id() {
        let _guard = acquire_live_postgres_guard();
        let database_url = live_database_url();
        ensure_live_platform_schema(&database_url);

        let unique = live_unique("session-center");
        let actor = seed_live_tenant_admin(
            &database_url,
            &format!("tenant-{unique}"),
            &format!("tenant_admin_{unique}"),
            "Stage2!Pass123",
        );
        let session_id = format!("session-{unique}");

        write_audit_events_for_actor(
            &mut PgAuditStore::new(&database_url),
            &actor,
            AuditBatchInput {
                events: vec![
                    AuditEventInput {
                        event_type: "chat.completed".to_string(),
                        payload: serde_json::json!({ "sessionId": session_id.clone() }),
                        occurred_at: Some("2026-04-18T12:00:00Z".to_string()),
                    },
                    AuditEventInput {
                        event_type: "chat.failed".to_string(),
                        payload: serde_json::json!({ "sessionId": session_id.clone() }),
                        occurred_at: Some("2026-04-18T12:00:01Z".to_string()),
                    },
                ],
            },
        )
        .expect("session audit events should be written");

        let items = list_sessions_for_actor(
            &mut PgSessionCenterStore::new(&database_url),
            &actor,
            None,
            build_session_query(
                Some("chat.failed".to_string()),
                Some(true),
                None,
                None,
                None,
                Some(50),
            )
            .expect("query"),
        )
        .expect("sessions should be listed");

        let session = items
            .iter()
            .find(|item| item.session_id == session_id)
            .expect("live session should be returned");

        assert_eq!(session.last_event_type, "chat.failed");
        assert_eq!(session.event_count, 2);
        assert!(session.has_failure);
    }
}
