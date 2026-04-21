# Platform Admin Session Center Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台管理端会话中心补齐基础筛选与简单分页，让后台可以按最近事件类型、失败标记、最近时间范围查会话，并继续向后加载更早会话。

**Architecture:** 在 `platform-admin/backend` 现有 `session_center` 聚合结果上增加查询参数与简单翻页规则；frontend 在现有 `Session center / Tenant session center` 卡片中补筛选表单、重新查询和 `Load older sessions` 逻辑，保持当前工作台结构不变，并与审计中心的筛选交互保持一致风格。

**Tech Stack:** Rust, PostgreSQL, TypeScript, React, Vitest

---

### Task 1: 扩展 backend 会话中心筛选与分页能力

**Files:**
- Modify: `platform-admin/backend/src/session_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/session_center.rs`

- [ ] **Step 1: 先写失败测试，覆盖 `lastEventType`、`hasFailure`、`beforeId` 和非法 `hasFailure`**

```rust
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

    let query = build_session_query(None, Some(true), None, None, None, None)
        .expect("query");
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

    let query = build_session_query(None, None, None, None, Some("session-2".to_string()), None)
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
```

- [ ] **Step 2: 跑后端定向测试确认红灯**

Run: `cargo test session_center::tests`
Expected: FAIL，提示 `build_session_query`、`before_id` 或筛选逻辑尚不存在

- [ ] **Step 3: 定义会话查询模型与参数解析函数**

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionQuery {
    pub last_event_type: Option<String>,
    pub has_failure: Option<bool>,
    pub last_occurred_from: Option<String>,
    pub last_occurred_to: Option<String>,
    pub before_id: Option<String>,
    pub limit: i64,
}

pub fn build_session_query(
    requested_last_event_type: Option<String>,
    requested_has_failure: Option<bool>,
    requested_last_occurred_from: Option<String>,
    requested_last_occurred_to: Option<String>,
    requested_before_id: Option<String>,
    requested_limit: Option<i64>,
) -> Result<SessionQuery, SessionCenterError> {
    Ok(SessionQuery {
        last_event_type: requested_last_event_type.filter(|value| !value.trim().is_empty()),
        has_failure: requested_has_failure,
        last_occurred_from: requested_last_occurred_from.filter(|value| !value.trim().is_empty()),
        last_occurred_to: requested_last_occurred_to.filter(|value| !value.trim().is_empty()),
        before_id: requested_before_id.filter(|value| !value.trim().is_empty()),
        limit: normalize_limit(requested_limit),
    })
}

pub fn parse_has_failure_query(
    raw: Option<String>,
) -> Result<Option<bool>, SessionCenterError> {
    match raw.as_deref() {
        None | Some("") => Ok(None),
        Some("true") => Ok(Some(true)),
        Some("false") => Ok(Some(false)),
        Some(_) => Err(SessionCenterError::InvalidRequest(
            "hasFailure must be true or false".to_string(),
        )),
    }
}
```

- [ ] **Step 4: 在内存 store 和 PostgreSQL store 上实现筛选与 `beforeId` 简单分页**

```rust
pub trait SessionCenterStore {
    fn list_sessions(
        &mut self,
        tenant_id: i64,
        query: &SessionQuery,
    ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError>;
}
```

```rust
let anchor_row = if let Some(before_id) = query.before_id.as_ref() {
    client.query_opt(
        r#"
        WITH ranked AS (
            SELECT
                e.payload ->> 'sessionId' AS session_id,
                MAX(e.occurred_at) AS last_occurred_at
            FROM platform_audit_events e
            WHERE e.tenant_id = $1
              AND e.event_type LIKE 'chat.%'
              AND COALESCE(e.payload ->> 'sessionId', '') <> ''
            GROUP BY e.payload ->> 'sessionId'
        )
        SELECT
            to_char(last_occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_occurred_at,
            session_id
        FROM ranked
        WHERE session_id = $2
        "#,
        &[&tenant_id, &before_id],
    )?
} else {
    None
};
```

```rust
AND ($2::varchar IS NULL OR summary.last_event_type = $2)
AND ($3::bool IS NULL OR summary.has_failure = $3)
AND ($4::timestamptz IS NULL OR summary.last_occurred_at >= $4::timestamptz)
AND ($5::timestamptz IS NULL OR summary.last_occurred_at <= $5::timestamptz)
AND (
  $6::timestamptz IS NULL
  OR summary.last_occurred_at < $6::timestamptz
  OR (summary.last_occurred_at = $6::timestamptz AND summary.session_id < $7)
)
```

- [ ] **Step 5: 在路由层解析 `lastEventType / hasFailure / lastOccurredFrom / lastOccurredTo / beforeId / limit`**

```rust
fn handle_list_sessions(request: &str, config: &ServerConfig) -> String {
    let tenant_id = query_param(request_path(request).unwrap_or_default(), "tenantId")
        .and_then(|value: String| value.parse::<i64>().ok());
    let last_event_type = query_param(request_path(request).unwrap_or_default(), "lastEventType");
    let has_failure = match parse_has_failure_query(
        query_param(request_path(request).unwrap_or_default(), "hasFailure"),
    ) {
        Ok(value) => value,
        Err(error) => return admin_error_response(map_session_center_to_admin_error(error)),
    };
    let last_occurred_from = query_param(request_path(request).unwrap_or_default(), "lastOccurredFrom");
    let last_occurred_to = query_param(request_path(request).unwrap_or_default(), "lastOccurredTo");
    let before_id = query_param(request_path(request).unwrap_or_default(), "beforeId");
    let limit = query_param(request_path(request).unwrap_or_default(), "limit")
        .and_then(|value: String| value.parse::<i64>().ok());
    let query = match build_session_query(
        last_event_type,
        has_failure,
        last_occurred_from,
        last_occurred_to,
        before_id,
        limit,
    ) {
        Ok(query) => query,
        Err(error) => return admin_error_response(map_session_center_to_admin_error(error)),
    };

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgSessionCenterStore::new(&config.database_url);
        list_sessions_for_actor(&mut store, &to_principal(actor), tenant_id, query)
            .map_err(map_session_center_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}
```

- [ ] **Step 6: 跑 `cargo test` 确认后端完整通过**

Run: `cargo test`
Expected: PASS，新增 `session_center` 筛选与分页测试通过，现有测试不回归

- [ ] **Step 7: 提交这一小步**

```bash
git add platform-admin/backend/src/session_center.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add session center filters"
```

### Task 2: 扩展管理端会话中心筛选 UI 与简单分页

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 先写失败测试，覆盖筛选表单和 `Load older sessions` 行为**

```tsx
fireEvent.change(screen.getByLabelText("Last event type"), {
  target: { value: "chat.failed" },
});
fireEvent.change(screen.getByLabelText("Has failure"), {
  target: { value: "true" },
});
fireEvent.change(screen.getByLabelText("Limit"), {
  target: { value: "1" },
});
fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));

expect(await screen.findByText("session-failed-1")).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Load older sessions" }));
expect(await screen.findByText("session-failed-0")).toBeInTheDocument();
```

- [ ] **Step 2: 跑平台管理端定向测试确认红灯**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示缺少会话筛选字段或 `Load older sessions` 按钮

- [ ] **Step 3: 在前端增加会话筛选状态和请求函数**

```tsx
interface SessionFilters {
  lastEventType: string;
  hasFailure: string;
  lastOccurredFrom: string;
  lastOccurredTo: string;
  limit: string;
}

const [sessionFilters, setSessionFilters] = useState<SessionFilters>({
  lastEventType: "",
  hasFailure: "",
  lastOccurredFrom: "",
  lastOccurredTo: "",
  limit: "100",
});
const [sessionHasMore, setSessionHasMore] = useState(false);
const [isLoadingSessions, setIsLoadingSessions] = useState(false);
```

```tsx
const fetchSuperAdminSessions = async (
  nextSession: LoginResponse,
  tenantId: number | null,
  filters: SessionFilters,
  beforeId?: string,
): Promise<SessionSummaryRecord[]> => {
  if (!tenantId) {
    return [];
  }
  const params = new URLSearchParams({
    tenantId: String(tenantId),
    limit: filters.limit || "100",
  });
  if (filters.lastEventType.trim()) {
    params.set("lastEventType", filters.lastEventType.trim());
  }
  if (filters.hasFailure) {
    params.set("hasFailure", filters.hasFailure);
  }
  if (filters.lastOccurredFrom) {
    params.set("lastOccurredFrom", new Date(filters.lastOccurredFrom).toISOString());
  }
  if (filters.lastOccurredTo) {
    params.set("lastOccurredTo", new Date(filters.lastOccurredTo).toISOString());
  }
  if (beforeId) {
    params.set("beforeId", beforeId);
  }
  return requestJson<SessionSummaryRecord[]>(`/api/admin/sessions?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(nextSession),
  });
};


const fetchTenantSessions = async (
  nextSession: LoginResponse,
  filters: SessionFilters,
  beforeId?: string,
): Promise<SessionSummaryRecord[]> => {
  const params = new URLSearchParams({
    limit: filters.limit || "100",
  });
  if (filters.lastEventType.trim()) {
    params.set("lastEventType", filters.lastEventType.trim());
  }
  if (filters.hasFailure) {
    params.set("hasFailure", filters.hasFailure);
  }
  if (filters.lastOccurredFrom) {
    params.set("lastOccurredFrom", new Date(filters.lastOccurredFrom).toISOString());
  }
  if (filters.lastOccurredTo) {
    params.set("lastOccurredTo", new Date(filters.lastOccurredTo).toISOString());
  }
  if (beforeId) {
    params.set("beforeId", beforeId);
  }
  return requestJson<SessionSummaryRecord[]>(`/api/admin/tenant/sessions?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(nextSession),
  });
};
```

- [ ] **Step 4: 增加 `handleApplySessionFilters` 与 `handleLoadOlderSessions`**

```tsx
const handleApplySessionFilters = async () => {
  if (!session) {
    return;
  }

  setWorkspaceError(null);
  setIsLoadingSessions(true);
  try {
    const items =
      session.user.roleCode === "super_admin"
        ? await fetchSuperAdminSessions(session, selectedTenantId, sessionFilters)
        : await fetchTenantSessions(session, sessionFilters);
    setSessions(items);
    setSessionHasMore(items.length >= Number(sessionFilters.limit || "100"));
  } catch (error) {
    setWorkspaceError(error instanceof Error ? error.message : "Load sessions failed");
  } finally {
    setIsLoadingSessions(false);
  }
};
```

```tsx
const handleLoadOlderSessions = async () => {
  if (!session || sessions.length === 0) {
    return;
  }

  const beforeId = sessions[sessions.length - 1]?.sessionId;
  if (!beforeId) {
    return;
  }

  setWorkspaceError(null);
  setIsLoadingSessions(true);
  try {
    const olderItems =
      session.user.roleCode === "super_admin"
        ? await fetchSuperAdminSessions(session, selectedTenantId, sessionFilters, beforeId)
        : await fetchTenantSessions(session, sessionFilters, beforeId);
    setSessions((current) => [...current, ...olderItems]);
    setSessionHasMore(olderItems.length >= Number(sessionFilters.limit || "100"));
  } catch (error) {
    setWorkspaceError(error instanceof Error ? error.message : "Load older sessions failed");
  } finally {
    setIsLoadingSessions(false);
  }
};
```

- [ ] **Step 5: 在两个会话中心卡片中补筛选表单与 `Load older sessions`**

```tsx
const renderSessionFilters = (): React.JSX.Element => (
  <div className="platform-admin-form">
    <label className="platform-admin-field">
      <span>Last event type</span>
      <input
        value={sessionFilters.lastEventType}
        onChange={(event) =>
          setSessionFilters((current) => ({ ...current, lastEventType: event.target.value }))
        }
      />
    </label>
    <label className="platform-admin-field">
      <span>Has failure</span>
      <select
        value={sessionFilters.hasFailure}
        onChange={(event) =>
          setSessionFilters((current) => ({ ...current, hasFailure: event.target.value }))
        }
      >
        <option value="">Any</option>
        <option value="true">Failed only</option>
        <option value="false">Without failure</option>
      </select>
    </label>
    <label className="platform-admin-field">
      <span>Last occurred from</span>
      <input
        type="datetime-local"
        value={sessionFilters.lastOccurredFrom}
        onChange={(event) =>
          setSessionFilters((current) => ({ ...current, lastOccurredFrom: event.target.value }))
        }
      />
    </label>
    <label className="platform-admin-field">
      <span>Last occurred to</span>
      <input
        type="datetime-local"
        value={sessionFilters.lastOccurredTo}
        onChange={(event) =>
          setSessionFilters((current) => ({ ...current, lastOccurredTo: event.target.value }))
        }
      />
    </label>
    <label className="platform-admin-field">
      <span>Limit</span>
      <input
        type="number"
        min="1"
        max="200"
        value={sessionFilters.limit}
        onChange={(event) =>
          setSessionFilters((current) => ({ ...current, limit: event.target.value || "100" }))
        }
      />
    </label>
    <button className="platform-admin-submit" type="button" onClick={() => void handleApplySessionFilters()}>
      Apply filters
    </button>
  </div>
);
```

- [ ] **Step 6: 跑定向测试与全量前端测试**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS，新增会话筛选与分页断言通过

Run: `npm run test`
Expected: PASS，平台管理端和桌面端现有测试不回归

- [ ] **Step 7: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add session center filtering ui"
```

### Task 3: 更新文档并完成 fresh verification

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-admin-session-center-filtering-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-admin-session-center-filtering-implementation.md`

- [ ] **Step 1: 更新 README，补会话中心筛选参数与分页说明**

```md
- `GET /api/admin/sessions?tenantId=:tenantId&limit=:limit&lastEventType=:type&hasFailure=:bool&lastOccurredFrom=:iso&lastOccurredTo=:iso&beforeId=:sessionId`：超级管理员按基础条件读取指定租户会话
- `GET /api/admin/tenant/sessions?limit=:limit&lastEventType=:type&hasFailure=:bool&lastOccurredFrom=:iso&lastOccurredTo=:iso&beforeId=:sessionId`：租户管理员按基础条件读取本租户会话

会话中心当前规则：
- 支持按 `lastEventType` 精确筛选
- 支持按 `hasFailure` 筛选失败状态
- 支持按 `lastOccurredFrom / lastOccurredTo` 做时间范围筛选
- 支持按 `beforeId` 简单向后翻页
```

- [ ] **Step 2: 跑后端测试**

Run: `cargo test`
Expected: PASS

- [ ] **Step 3: 跑平台管理端定向测试**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS

- [ ] **Step 4: 跑整仓 fresh verification**

Run: `npm run test`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: 用真实 PostgreSQL 跑 ignored live tests**

Run: `ADMIN_DATABASE_URL='postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin' cargo test -- --ignored`
Expected: PASS，live PostgreSQL 认证链路继续通过

- [ ] **Step 6: 提交并推送**

```bash
git add platform-admin/README.md docs/superpowers/specs/2026-04-18-platform-admin-session-center-filtering-design.md docs/superpowers/plans/2026-04-18-platform-admin-session-center-filtering-implementation.md
git commit -m "docs: describe session center filters"
git push origin platform-phase2-desktop-closure
```
