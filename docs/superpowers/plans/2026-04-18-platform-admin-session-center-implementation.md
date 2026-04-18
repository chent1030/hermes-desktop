# Platform Admin Session Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台链路补齐最小会话主键贯通，并在管理端提供按租户查看最近会话的只读会话中心。

**Architecture:** 先在桌面端聊天审计里补齐 `sessionId` 透传规则，确保恢复已有会话时 `chat.started` 和 `chat.failed` 也能稳定归属到已有会话；平台后端继续复用 `platform_audit_events` 做按 `payload.sessionId` 的最小聚合，不引入新会话表；前端在现有平台工作台中并列增加 `Session center` 卡片，维持当前大工作台结构不变。

**Tech Stack:** TypeScript, Electron, React, Rust, PostgreSQL, Vitest

---

### Task 1: 补齐桌面端聊天审计的会话主键透传

**Files:**
- Modify: `src/main/hermes.ts`
- Test: `tests/hermes-platform-audit.test.ts`

- [ ] **Step 1: 先写失败测试，锁定恢复已有会话时 `chat.started` 和 `chat.failed` 必须带 `sessionId`**

```ts
it("adds sessionId to chat lifecycle audit events when resuming an existing session", async () => {
  httpGet.mockImplementation((_url, _options, callback) => {
    const response = new EventEmitter() as EventEmitter & {
      resume: () => void;
      statusCode: number;
    };
    response.statusCode = 500;
    response.resume = vi.fn();
    callback(response);
    return createRequestHandle();
  });

  const hermes = await import("../src/main/hermes");
  const errorPromise = new Promise<string>((resolve) => {
    void hermes.sendMessage(
      "resume failed",
      {
        onChunk: vi.fn(),
        onDone: vi.fn(),
        onError: resolve,
      },
      "default",
      "session-existing",
    );
  });

  await expect(errorPromise).resolves.toBeTruthy();

  expect(enqueueAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "chat.started",
      payload: expect.objectContaining({
        sessionId: "session-existing",
        resumeSessionId: "session-existing",
      }),
    }),
  );

  expect(enqueueAuditEvent).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "chat.failed",
      payload: expect.objectContaining({
        sessionId: "session-existing",
        resumeSessionId: "session-existing",
      }),
    }),
  );
});
```

- [ ] **Step 2: 跑定向测试确认红灯**

Run: `npm run test -- tests/hermes-platform-audit.test.ts`
Expected: FAIL，提示 `chat.started` 或 `chat.failed` 的 payload 中缺少 `sessionId`

- [ ] **Step 3: 在 `ChatAuditContext` 和聊天生命周期事件里做最小实现**

```ts
interface ChatAuditContext {
  messageLength: number;
  profile?: string;
  resumeSessionId?: string;
  sessionId?: string;
}

function recordChatStarted(context: ChatAuditContext): void {
  flushChatAuditEvent("chat.started", {
    messageLength: context.messageLength,
    sessionId: context.resumeSessionId || context.sessionId || null,
    profile: context.profile || null,
    resumeSessionId: context.resumeSessionId || null,
  });
}

function recordChatFailed(
  context: ChatAuditContext & {
    error: string;
    sessionId?: string;
  },
): void {
  flushChatAuditEvent("chat.failed", {
    error: context.error,
    sessionId: context.sessionId || context.resumeSessionId || null,
    profile: context.profile || null,
    resumeSessionId: context.resumeSessionId || null,
  });
  markAuditFailure(context.error);
}
```

- [ ] **Step 4: 保持成功链路兼容，确认新建成功会话仍从真实 `sessionId` 上报**

```ts
function recordChatCompleted(
  context: ChatAuditContext & { sessionId?: string },
): void {
  flushChatAuditEvent("chat.completed", {
    sessionId: context.sessionId || context.resumeSessionId || null,
    profile: context.profile || null,
    resumeSessionId: context.resumeSessionId || null,
  });
}
```

- [ ] **Step 5: 跑桌面端定向测试确认绿灯**

Run: `npm run test -- tests/hermes-platform-audit.test.ts`
Expected: PASS，现有聊天审计生命周期测试继续通过，并新增断言通过

- [ ] **Step 6: 提交这一小步**

```bash
git add src/main/hermes.ts tests/hermes-platform-audit.test.ts
git commit -m "feat: align chat audit session ids"
```

### Task 2: 新增平台会话中心后端查询服务与接口

**Files:**
- Create: `platform-admin/backend/src/session_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/session_center.rs`

- [ ] **Step 1: 先写失败测试，锁定会话聚合、租户边界和缺少 `tenantId` 的行为**

```rust
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
}
```

- [ ] **Step 2: 跑后端定向测试确认红灯**

Run: `cargo test session_center::tests`
Expected: FAIL，提示 `session_center` 模块或相关类型/函数不存在

- [ ] **Step 3: 新建 `session_center.rs`，定义最小会话汇总模型和查询抽象**

```rust
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

pub trait SessionCenterStore {
    fn list_sessions(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<SessionSummaryRecord>, SessionCenterStoreError>;
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
                "tenantId is required for super admin session queries".to_string(),
            ))?;
            store
                .list_sessions(tenant_id, limit)
                .map_err(|error| SessionCenterError::Store(error.to_string()))
        }
        "tenant_admin" => {
            let tenant_id = actor.tenant.as_ref().ok_or(SessionCenterError::Forbidden(
                "tenant admin missing tenant scope".to_string(),
            ))?.id;
            store
                .list_sessions(tenant_id, limit)
                .map_err(|error| SessionCenterError::Store(error.to_string()))
        }
        _ => Err(SessionCenterError::Forbidden(
            "actor is not allowed to list sessions".to_string(),
        )),
    }
}
```

- [ ] **Step 4: 用 PostgreSQL 查询按 `payload.sessionId` 聚合最近会话**

```rust
let rows = client.query(
    "
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
            COUNT(*) OVER (PARTITION BY e.payload ->> 'sessionId') AS event_count,
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
        r.occurred_at,
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
    ",
    &[&tenant_id, &limit],
)?;
```

- [ ] **Step 5: 在 HTTP 路由层接入两个只读接口**

```rust
pub mod session_center;

use session_center::{
    SessionCenterError, PgSessionCenterStore, list_sessions_for_actor,
};

(Some("GET"), "/api/admin/sessions") => handle_list_sessions(request, config),
(Some("GET"), "/api/admin/tenant/sessions") => {
    handle_list_tenant_sessions(request, config)
}
```

```rust
fn handle_list_sessions(request: &str, config: &ServerConfig) -> String {
    let tenant_id = query_param(request_path(request).unwrap_or_default(), "tenantId")
        .and_then(|value: String| value.parse::<i64>().ok());
    let limit = query_param(request_path(request).unwrap_or_default(), "limit")
        .and_then(|value: String| value.parse::<i64>().ok());

    match authenticate_request(request, config).and_then(|actor| {
        let mut store = PgSessionCenterStore::new(&config.database_url);
        list_sessions_for_actor(&mut store, &to_principal(actor), tenant_id, limit)
            .map_err(map_session_center_to_admin_error)
    }) {
        Ok(payload) => json_response("HTTP/1.1 200 OK", &serialize_json(&payload)),
        Err(error) => admin_error_response(error),
    }
}
```

- [ ] **Step 6: 跑 `cargo test` 确认后端完整通过**

Run: `cargo test`
Expected: PASS，新增 `session_center` 测试通过，既有 `audit_center` 与 `auth` 测试不回归

- [ ] **Step 7: 提交这一小步**

```bash
git add platform-admin/backend/src/session_center.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add session center query api"
```

### Task 3: 在管理端工作台增加会话中心最小只读卡片

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 先写失败测试，锁定超级管理员和租户管理员都能看到会话中心卡片**

```tsx
expect(
  await screen.findByRole("heading", { name: "Session center" }),
).toBeInTheDocument();
expect(screen.getByText("session-1")).toBeInTheDocument();
expect(screen.getByText("chat.completed")).toBeInTheDocument();
expect(screen.getByText("2 events")).toBeInTheDocument();
```

```tsx
expect(
  await screen.findByRole("heading", { name: "Tenant session center" }),
).toBeInTheDocument();
expect(screen.getByText("Failed")).toBeInTheDocument();
```

- [ ] **Step 2: 跑平台管理端定向测试确认红灯**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示会话中心标题或会话列表项不存在

- [ ] **Step 3: 在前端增加会话类型、状态和请求函数**

```tsx
interface SessionSummaryRecord {
  sessionId: string;
  tenant: SessionTenant;
  lastAccount: AuditActorRecord;
  lastEventType: string;
  lastOccurredAt: string;
  eventCount: number;
  hasFailure: boolean;
}

const [sessions, setSessions] = useState<SessionSummaryRecord[]>([]);

const fetchSuperAdminSessions = async (
  nextSession: LoginResponse,
  tenantId: number | null,
): Promise<SessionSummaryRecord[]> => {
  if (!tenantId) {
    return [];
  }
  return requestJson<SessionSummaryRecord[]>(
    `/api/admin/sessions?tenantId=${tenantId}&limit=100`,
    {
      method: "GET",
      headers: authHeaders(nextSession),
    },
  );
};
```

- [ ] **Step 4: 把会话列表接到现有工作区加载流程**

```tsx
const [nextModels, nextSkills, nextAuditEvents, nextSessions] = await Promise.all([
  fetchSuperAdminModelProfiles(nextSession, nextModelScope, nextSelectedTenantId),
  fetchSuperAdminSkillCatalog(nextSession, nextSkillScope, nextSelectedTenantId),
  fetchSuperAdminAuditEvents(nextSession, nextSelectedTenantId, auditFilters),
  fetchSuperAdminSessions(nextSession, nextSelectedTenantId),
]);
setSessions(nextSessions);
```

```tsx
const [tenantAccounts, tenantModels, tenantSkills, tenantAuditEvents, tenantSessions] =
  await Promise.all([
    requestJson<AdminAccountRecord[]>("/api/admin/tenant/accounts", {
      method: "GET",
      headers: authHeaders(nextSession),
    }),
    requestJson<ModelProfileRecord[]>("/api/admin/tenant/model-profiles", {
      method: "GET",
      headers: authHeaders(nextSession),
    }),
    requestJson<SkillCatalogRecord[]>("/api/admin/tenant/skills/catalog", {
      method: "GET",
      headers: authHeaders(nextSession),
    }),
    fetchTenantAuditEvents(nextSession, auditFilters),
    requestJson<SessionSummaryRecord[]>("/api/admin/tenant/sessions?limit=100", {
      method: "GET",
      headers: authHeaders(nextSession),
    }),
  ]);
setSessions(tenantSessions);
```

- [ ] **Step 5: 增加最小会话卡片渲染函数并接入两个工作台**

```tsx
const renderSessionSummary = (item: SessionSummaryRecord): React.JSX.Element => (
  <div key={item.sessionId} className="platform-admin-list-item is-static">
    <span>{item.sessionId}</span>
    <span>{item.lastEventType}</span>
    <span>{item.lastAccount.displayName}</span>
    <span>{new Date(item.lastOccurredAt).toLocaleString()}</span>
    <span>{`${item.eventCount} events`}</span>
    {item.hasFailure ? <span>Failed</span> : null}
  </div>
);
```

```tsx
<article className="platform-admin-card platform-admin-stack-card">
  <p className="platform-admin-section-label">Session center</p>
  <h3>Session center</h3>
  {!selectedTenantId ? (
    <p className="platform-admin-panel-note">
      Select a tenant to inspect runtime sessions.
    </p>
  ) : null}
  <div className="platform-admin-list">
    {sessions.map((item) => renderSessionSummary(item))}
  </div>
</article>
```

- [ ] **Step 6: 跑定向测试与全量前端测试**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS，新增会话中心断言通过

Run: `npm run test`
Expected: PASS，平台管理端与桌面端现有测试不回归

- [ ] **Step 7: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add session center workspace"
```

### Task 4: 更新文档并完成 fresh verification

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-admin-session-center-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-admin-session-center-implementation.md`

- [ ] **Step 1: 更新 README，补充会话中心接口与当前边界说明**

```md
- `GET /api/admin/sessions?tenantId=:tenantId&limit=:limit`：超级管理员读取指定租户最近会话
- `GET /api/admin/tenant/sessions?limit=:limit`：租户管理员读取本租户最近会话

会话中心当前规则：
- 继续复用 `platform_audit_events`
- 只聚合 `chat.*` 且 `payload.sessionId` 非空的事件
- 首版只做最近会话列表，不做详情页、导出和复杂筛选
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
git add platform-admin/README.md docs/superpowers/specs/2026-04-18-platform-admin-session-center-design.md docs/superpowers/plans/2026-04-18-platform-admin-session-center-implementation.md
git commit -m "docs: describe session center flow"
git push origin platform-phase2-desktop-closure
```
