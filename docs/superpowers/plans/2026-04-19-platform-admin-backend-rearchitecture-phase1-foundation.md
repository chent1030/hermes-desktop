# Platform Admin Backend Rearchitecture Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working migration slice of the platform admin backend by introducing the new `axum + tokio + sqlx` service skeleton, shared kernel, async infrastructure, and `iam` extraction while keeping the existing API surface alive.

**Architecture:** This spec spans multiple independent subsystems, so implementation is intentionally decomposed. This plan covers the first testable sub-project: replacing the hand-written HTTP entrypoint with a modular async service, extracting the shared `iam` core, and establishing route boundaries for `admin control plane` and `desktop delivery plane`. Follow-on plans should cover `admin` domain migration, `desktop` delivery migration, and audit/session projection rebuilding as separate working slices.

**Tech Stack:** Rust, axum, tokio, tower, tower-http, serde, sqlx, PostgreSQL, tracing, uuid, time, argon2.

---

## Planned File Structure

- Create: `platform-admin/backend/src/bootstrap/config.rs` — environment-driven app config, including bind address, DB URL, auth settings, and compatibility flags.
- Create: `platform-admin/backend/src/bootstrap/app_state.rs` — `AppState` container for config, db pool, clock, token service, and request-scoped dependencies.
- Create: `platform-admin/backend/src/bootstrap/router.rs` — top-level router composition, route nesting, fallback, middleware stack.
- Create: `platform-admin/backend/src/bootstrap/startup.rs` — async startup, pool init, migration execution, router boot, graceful shutdown.
- Create: `platform-admin/backend/src/kernel/error.rs` — shared application error types and HTTP-safe error envelope mapping.
- Create: `platform-admin/backend/src/kernel/result.rs` — `AppResult<T>` alias and helper conversions.
- Create: `platform-admin/backend/src/kernel/ids.rs` — newtype IDs such as `AccountId`, `TenantId`, `SessionId`, `RequestId`.
- Create: `platform-admin/backend/src/kernel/time.rs` — clock abstraction for deterministic tests.
- Create: `platform-admin/backend/src/infrastructure/db/mod.rs` — sqlx pool creation, transaction helper, health/readiness ping.
- Create: `platform-admin/backend/src/infrastructure/http/mod.rs` — request-id middleware, error response helpers, JSON body limits.
- Create: `platform-admin/backend/src/infrastructure/security/mod.rs` — argon2 password hashing and opaque token generation adapters.
- Create: `platform-admin/backend/src/iam/api/mod.rs` — auth route registration and HTTP DTO mapping.
- Create: `platform-admin/backend/src/iam/api/dto.rs` — login/refresh/me request and response DTOs for the new service.
- Create: `platform-admin/backend/src/iam/application/login.rs` — login command, use case, and transaction boundary.
- Create: `platform-admin/backend/src/iam/application/refresh.rs` — refresh command and rotation workflow.
- Create: `platform-admin/backend/src/iam/application/me.rs` — access-token authentication and principal hydration.
- Create: `platform-admin/backend/src/iam/domain/principal.rs` — `Principal`, role/scope metadata, and session-facing value objects.
- Create: `platform-admin/backend/src/iam/domain/session.rs` — `AccessToken`, `RefreshSession`, rotation state model.
- Create: `platform-admin/backend/src/iam/domain/error.rs` — typed IAM domain/application errors.
- Create: `platform-admin/backend/src/iam/infrastructure/repository.rs` — sqlx-backed account/session repository against the existing admin tables.
- Create: `platform-admin/backend/src/admin/api/mod.rs` — `admin control plane` route skeleton, initially exposing `/api/admin/me` through the new service.
- Create: `platform-admin/backend/src/desktop/api/mod.rs` — `desktop delivery plane` route skeleton with placeholder nesting for later migrations.
- Modify: `platform-admin/backend/src/lib.rs` — re-export startup entrypoints and reduce legacy logic to a compatibility seam.
- Modify: `platform-admin/backend/src/main.rs` — move to async `tokio::main` and call the new startup path.
- Modify: `platform-admin/backend/Cargo.toml` — add async web/runtime/db dependencies.
- Create: `platform-admin/backend/migrations/20260419000100_platform_admin_service_baseline.sql` — baseline migration for service metadata/outbox/idempotency scaffolding without disturbing existing business tables.
- Modify: `platform-admin/README.md` — document migration slice, new run commands, route ownership, and next slices.
- Test: `platform-admin/backend/tests/http_health.rs` — health/readiness/router smoke tests.
- Test: `platform-admin/backend/tests/http_error_envelope.rs` — request-id and structured error envelope tests.
- Test: `platform-admin/backend/tests/iam_auth_flow.rs` — login, refresh, and `/api/admin/me` compatibility tests.
- Test: `platform-admin/backend/tests/router_planes.rs` — plane nesting and fallback contract tests.

### Task 1: Stand up the async service skeleton and health/readiness routes

**Files:**
- Modify: `platform-admin/backend/Cargo.toml`
- Create: `platform-admin/backend/src/bootstrap/config.rs`
- Create: `platform-admin/backend/src/bootstrap/app_state.rs`
- Create: `platform-admin/backend/src/bootstrap/router.rs`
- Create: `platform-admin/backend/src/bootstrap/startup.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/backend/src/main.rs`
- Test: `platform-admin/backend/tests/http_health.rs`

- [ ] **Step 1: Write the failing integration test for the new router health contract**

```rust
use axum::{body::Body, http::{Request, StatusCode}};
use platform_admin_backend::bootstrap::{app_state::AppState, config::AppConfig, router::build_router};
use tower::ServiceExt;

#[tokio::test]
async fn health_and_readiness_routes_return_json() {
    let state = AppState::for_tests(AppConfig::for_tests());
    let app = build_router(state);

    let health = app
        .clone()
        .oneshot(Request::builder().uri("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(health.status(), StatusCode::OK);

    let ready = app
        .oneshot(Request::builder().uri("/api/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the targeted test to verify the async skeleton is missing**

Run: `cd platform-admin/backend && cargo test --test http_health`
Expected: FAIL with missing `bootstrap` modules and/or missing `axum`/`tokio` dependencies.

- [ ] **Step 3: Add the minimal async bootstrap path, config, and router composition**

```rust
// src/main.rs
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = platform_admin_backend::bootstrap::config::AppConfig::from_env()?;
    platform_admin_backend::bootstrap::startup::run(config).await?;
    Ok(())
}

// src/bootstrap/router.rs
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ready", get(readiness))
        .with_state(state)
}
```

- [ ] **Step 4: Re-run the targeted test and then the backend smoke suite**

Run: `cd platform-admin/backend && cargo test --test http_health && cargo test health_and_readiness_routes_return_json -- --nocapture`
Expected: PASS, with both `/api/health` and `/api/ready` returning `200 OK` JSON responses.

- [ ] **Step 5: Commit the async skeleton slice**

```bash
git add platform-admin/backend/Cargo.toml \
  platform-admin/backend/src/main.rs \
  platform-admin/backend/src/lib.rs \
  platform-admin/backend/src/bootstrap \
  platform-admin/backend/tests/http_health.rs
git commit -m "refactor: add async platform admin bootstrap skeleton"
```

### Task 2: Add shared kernel errors, request context, and structured HTTP error envelopes

**Files:**
- Create: `platform-admin/backend/src/kernel/error.rs`
- Create: `platform-admin/backend/src/kernel/result.rs`
- Create: `platform-admin/backend/src/kernel/ids.rs`
- Create: `platform-admin/backend/src/kernel/time.rs`
- Create: `platform-admin/backend/src/infrastructure/http/mod.rs`
- Modify: `platform-admin/backend/src/bootstrap/router.rs`
- Modify: `platform-admin/backend/src/bootstrap/app_state.rs`
- Test: `platform-admin/backend/tests/http_error_envelope.rs`

- [ ] **Step 1: Write the failing test for request IDs and the stable error envelope**

```rust
use axum::{body::Body, http::{Request, StatusCode}};
use serde_json::Value;
use tower::ServiceExt;

#[tokio::test]
async fn unknown_routes_return_structured_not_found_with_request_id() {
    let state = platform_admin_backend::bootstrap::app_state::AppState::for_tests(
        platform_admin_backend::bootstrap::config::AppConfig::for_tests(),
    );
    let app = platform_admin_backend::bootstrap::router::build_router(state);

    let response = app
        .oneshot(Request::builder().uri("/api/does-not-exist").body(Body::empty()).unwrap())
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    let request_id = response.headers().get("x-request-id").expect("request id header");
    let body = axum::body::to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let json: Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["code"], "route_not_found");
    assert_eq!(json["requestId"], request_id.to_str().unwrap());
}
```

- [ ] **Step 2: Run the targeted test to verify the error envelope does not exist yet**

Run: `cd platform-admin/backend && cargo test --test http_error_envelope`
Expected: FAIL with missing `x-request-id` header or JSON envelope fields.

- [ ] **Step 3: Implement kernel-level errors, request IDs, and fallback mapping**

```rust
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorEnvelope {
    pub code: &'static str,
    pub message: String,
    pub request_id: String,
    pub retryable: bool,
}

pub async fn fallback(State(state): State<AppState>, request: Request<Body>) -> impl IntoResponse {
    let request_id = request
        .extensions()
        .get::<RequestId>()
        .cloned()
        .unwrap_or_else(RequestId::new);
    ApiError::not_found("route_not_found", request_id).into_response_with_state(&state)
}
```

- [ ] **Step 4: Re-run the targeted test and confirm middleware wiring**

Run: `cd platform-admin/backend && cargo test --test http_error_envelope && cargo test unknown_routes_return_structured_not_found_with_request_id -- --nocapture`
Expected: PASS, with all non-matching routes returning the same JSON envelope shape and `x-request-id` header.

- [ ] **Step 5: Commit the kernel/error slice**

```bash
git add platform-admin/backend/src/kernel \
  platform-admin/backend/src/infrastructure/http \
  platform-admin/backend/src/bootstrap/router.rs \
  platform-admin/backend/src/bootstrap/app_state.rs \
  platform-admin/backend/tests/http_error_envelope.rs
git commit -m "refactor: add backend kernel error envelope and request context"
```

### Task 3: Add async PostgreSQL infrastructure, baseline migrations, and transaction scaffolding

**Files:**
- Create: `platform-admin/backend/src/infrastructure/db/mod.rs`
- Create: `platform-admin/backend/migrations/20260419000100_platform_admin_service_baseline.sql`
- Modify: `platform-admin/backend/src/bootstrap/config.rs`
- Modify: `platform-admin/backend/src/bootstrap/app_state.rs`
- Modify: `platform-admin/backend/src/bootstrap/startup.rs`
- Modify: `platform-admin/backend/Cargo.toml`
- Test: `platform-admin/backend/tests/http_health.rs`

- [ ] **Step 1: Extend the failing health/readiness test so readiness depends on a real pool ping**

```rust
#[tokio::test]
async fn readiness_route_checks_database_connectivity() {
    let mut config = AppConfig::for_tests();
    config.database_url = std::env::var("ADMIN_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:postgres@localhost:5432/manager_admin".to_string());
    let state = AppState::with_pool(config).await.expect("test pool");
    let app = build_router(state);

    let ready = app
        .oneshot(Request::builder().uri("/api/ready").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(ready.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the readiness test to verify pool and migration helpers are missing**

Run: `cd platform-admin/backend && cargo test readiness_route_checks_database_connectivity -- --nocapture`
Expected: FAIL with missing `sqlx` pool helpers or missing async config/state constructors.

- [ ] **Step 3: Implement `sqlx` pool setup, startup migrations, and a lightweight transaction helper**

```rust
pub async fn connect_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub async fn run(config: AppConfig) -> Result<(), StartupError> {
    let pool = connect_pool(&config.database_url).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    let state = AppState::new(config, pool);
    let app = build_router(state);
    axum::serve(tokio::net::TcpListener::bind(config.bind_addr()).await?, app).await?;
    Ok(())
}
```

- [ ] **Step 4: Re-run the health/readiness suite with the database-aware state**

Run: `cd platform-admin/backend && cargo test --test http_health -- --nocapture`
Expected: PASS locally when `ADMIN_DATABASE_URL` is reachable; if the DB is absent, the test should fail clearly with `pool timed out` or connection refused.

- [ ] **Step 5: Commit the async DB foundation**

```bash
git add platform-admin/backend/Cargo.toml \
  platform-admin/backend/src/infrastructure/db/mod.rs \
  platform-admin/backend/src/bootstrap/config.rs \
  platform-admin/backend/src/bootstrap/app_state.rs \
  platform-admin/backend/src/bootstrap/startup.rs \
  platform-admin/backend/migrations/20260419000100_platform_admin_service_baseline.sql \
  platform-admin/backend/tests/http_health.rs
git commit -m "refactor: add sqlx pool and migration startup for admin backend"
```

### Task 4: Extract the shared IAM core and migrate login/refresh/me onto the new service

**Files:**
- Create: `platform-admin/backend/src/iam/mod.rs`
- Create: `platform-admin/backend/src/iam/api/mod.rs`
- Create: `platform-admin/backend/src/iam/api/dto.rs`
- Create: `platform-admin/backend/src/iam/application/login.rs`
- Create: `platform-admin/backend/src/iam/application/refresh.rs`
- Create: `platform-admin/backend/src/iam/application/me.rs`
- Create: `platform-admin/backend/src/iam/domain/principal.rs`
- Create: `platform-admin/backend/src/iam/domain/session.rs`
- Create: `platform-admin/backend/src/iam/domain/error.rs`
- Create: `platform-admin/backend/src/iam/infrastructure/repository.rs`
- Create: `platform-admin/backend/src/infrastructure/security/mod.rs`
- Modify: `platform-admin/backend/src/bootstrap/router.rs`
- Modify: `platform-admin/backend/src/bootstrap/app_state.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/tests/iam_auth_flow.rs`

- [ ] **Step 1: Write the failing integration tests for login, refresh, and admin context lookup through the new router**

```rust
#[tokio::test]
async fn login_refresh_and_admin_me_flow_works_through_axum_router() {
    let harness = TestHarness::seeded_admin().await;

    let login = harness
        .post_json("/api/auth/login", serde_json::json!({
            "tenantCode": "",
            "username": "root",
            "password": "Secret123!"
        }))
        .await;
    assert_eq!(login.status(), StatusCode::OK);

    let body: serde_json::Value = harness.read_json(login).await;
    let access_token = body["accessToken"].as_str().unwrap().to_string();
    let refresh_token = body["refreshToken"].as_str().unwrap().to_string();

    let me = harness
        .get_with_bearer("/api/admin/me", &access_token)
        .await;
    assert_eq!(me.status(), StatusCode::OK);

    let refresh = harness
        .post_json("/api/auth/refresh", serde_json::json!({
            "refreshToken": refresh_token
        }))
        .await;
    assert_eq!(refresh.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the targeted auth test to verify IAM extraction is not wired yet**

Run: `cd platform-admin/backend && cargo test --test iam_auth_flow`
Expected: FAIL with missing `/api/auth/*` routes or missing async IAM services.

- [ ] **Step 3: Implement `iam` domain/application/infrastructure modules and route nesting against existing admin tables**

```rust
pub struct LoginCommand {
    pub tenant_code: Option<String>,
    pub username: String,
    pub password: String,
}

pub async fn login(
    repo: &impl SessionRepository,
    password_hasher: &impl PasswordHasher,
    tokens: &impl TokenService,
    cmd: LoginCommand,
) -> Result<LoginResult, IamApplicationError> {
    let principal = repo.find_principal(cmd.tenant_code.as_deref(), &cmd.username).await?
        .ok_or(IamApplicationError::InvalidCredentials)?;
    password_hasher.verify(&cmd.password, &principal.password_hash)?;
    let issued = tokens.issue_pair(principal.account_id, principal.tenant_id)?;
    repo.persist_session(&principal, &issued).await?;
    Ok(LoginResult::from(principal, issued))
}
```

- [ ] **Step 4: Re-run the auth suite and verify legacy-compatible responses**

Run: `cd platform-admin/backend && cargo test --test iam_auth_flow -- --nocapture && cargo test login_refresh_and_admin_me_flow_works_through_axum_router -- --nocapture`
Expected: PASS, with `/api/auth/login`, `/api/auth/refresh`, and `/api/admin/me` returning the same JSON contract currently consumed by the frontend.

- [ ] **Step 5: Commit the IAM extraction slice**

```bash
git add platform-admin/backend/src/iam \
  platform-admin/backend/src/infrastructure/security \
  platform-admin/backend/src/bootstrap/router.rs \
  platform-admin/backend/src/bootstrap/app_state.rs \
  platform-admin/backend/src/lib.rs \
  platform-admin/backend/tests/iam_auth_flow.rs
git commit -m "refactor: extract iam core into async admin backend"
```

### Task 5: Establish explicit admin/desktop plane route boundaries and document the next migration slices

**Files:**
- Create: `platform-admin/backend/src/admin/api/mod.rs`
- Create: `platform-admin/backend/src/desktop/api/mod.rs`
- Modify: `platform-admin/backend/src/bootstrap/router.rs`
- Modify: `platform-admin/README.md`
- Test: `platform-admin/backend/tests/router_planes.rs`

- [ ] **Step 1: Write the failing router test that asserts plane nesting and route ownership**

```rust
#[tokio::test]
async fn router_nests_admin_and_desktop_planes_under_distinct_prefixes() {
    let harness = TestHarness::seeded_admin().await;

    assert_eq!(harness.get("/api/admin/me").await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(harness.get("/api/desktop/bootstrap").await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(harness.get("/api/unknown-plane/ping").await.status(), StatusCode::NOT_FOUND);
}
```

- [ ] **Step 2: Run the router boundary test to verify the plane shells are absent**

Run: `cd platform-admin/backend && cargo test --test router_planes`
Expected: FAIL with missing `/api/desktop/*` nesting or generic fallback behaviour.

- [ ] **Step 3: Add `admin` and `desktop` API shells and mount them from the top-level router**

```rust
pub fn build_router(state: AppState) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/ready", get(readiness))
        .nest("/api/auth", iam::api::routes())
        .nest("/api/admin", admin::api::routes())
        .nest("/api/desktop", desktop::api::routes())
        .fallback(fallback)
        .with_state(state)
}
```

- [ ] **Step 4: Re-run the router test and refresh the backend docs**

Run: `cd platform-admin/backend && cargo test --test router_planes && cargo test`
Expected: PASS, with clear route ownership and a stable not-found envelope for unknown prefixes.

- [ ] **Step 5: Commit the plane-boundary slice and README updates**

```bash
git add platform-admin/backend/src/admin/api/mod.rs \
  platform-admin/backend/src/desktop/api/mod.rs \
  platform-admin/backend/src/bootstrap/router.rs \
  platform-admin/backend/tests/router_planes.rs \
  platform-admin/README.md
git commit -m "docs: document plane routing for backend rearchitecture phase 1"
```

### Task 6: Run full verification and capture the next-plan handoff

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-19-platform-admin-backend-rearchitecture-design.md`

- [ ] **Step 1: Add a short “next slices” section so future workers know the follow-on plan order**

```md
## Rearchitecture migration order

1. Phase 1 foundation and IAM extraction
2. Admin control plane domain migration
3. Desktop delivery plane migration
4. Audit event log + session projection rebuild
5. Policy expansion and ops workers
```

- [ ] **Step 2: Run the backend verification commands in sequence**

Run: `cd platform-admin/backend && cargo test --test http_health --test http_error_envelope --test iam_auth_flow --test router_planes`
Expected: PASS, with all new integration tests green.

- [ ] **Step 3: Run the backend full suite and formatting/lint checks**

Run: `cd platform-admin/backend && cargo fmt --check && cargo clippy --all-targets --all-features && cargo test`
Expected: PASS, with no formatting drift and no new clippy errors.

- [ ] **Step 4: Run repository-level verification to ensure the broader workspace still holds**

Run: `npm run test && npm run typecheck && npm run build`
Expected: PASS from the repo root, with no regressions to the desktop/frontend packages.

- [ ] **Step 5: Commit verification/docs updates and record the next-plan handoff**

```bash
git add platform-admin/README.md docs/superpowers/specs/2026-04-19-platform-admin-backend-rearchitecture-design.md
git commit -m "docs: finalize backend rearchitecture phase 1 foundation plan"
```
