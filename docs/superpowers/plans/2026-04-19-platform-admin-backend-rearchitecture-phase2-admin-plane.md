# Platform Admin Backend Rearchitecture Phase 2 Admin Plane Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the first tenant/account management slice into the new `admin control plane`, with an extensible `role + permission + policy` authorization backbone.

**Architecture:** Keep the new `axum + tokio + sqlx` service as the entrypoint and move tenant/account management into `admin/{api,application,domain,infrastructure}`. Authorization decisions should stop depending on scattered string checks and instead flow through a small admin-plane policy layer that can grow into richer RBAC and strategy evaluation later.

**Tech Stack:** Rust, axum, tokio, sqlx, serde, PostgreSQL.

---

## Planned File Structure

- Create: `platform-admin/backend/src/admin/application/mod.rs` — admin use-case module wiring.
- Create: `platform-admin/backend/src/admin/application/authorizer.rs` — policy-backed authorization helpers for admin use cases.
- Create: `platform-admin/backend/src/admin/application/tenants.rs` — tenant list/create/deactivate use cases.
- Create: `platform-admin/backend/src/admin/application/accounts.rs` — account list/create/deactivate use cases.
- Create: `platform-admin/backend/src/admin/domain/mod.rs` — admin domain exports.
- Create: `platform-admin/backend/src/admin/domain/actor.rs` — admin-plane actor context projected from IAM principal.
- Create: `platform-admin/backend/src/admin/domain/permission.rs` — permission point enum for tenant/account management.
- Create: `platform-admin/backend/src/admin/domain/policy.rs` — default policy and strategy extension seam.
- Create: `platform-admin/backend/src/admin/domain/tenant.rs` — tenant aggregate/value types.
- Create: `platform-admin/backend/src/admin/domain/account.rs` — account aggregate/value types and creation command validation.
- Create: `platform-admin/backend/src/admin/domain/error.rs` — typed admin domain/application errors.
- Create: `platform-admin/backend/src/admin/infrastructure/mod.rs` — infrastructure exports.
- Create: `platform-admin/backend/src/admin/infrastructure/repository.rs` — async `sqlx` repository for tenants/accounts.
- Modify: `platform-admin/backend/src/admin/api/mod.rs` — add tenant/account routes and DTO mapping.
- Modify: `platform-admin/backend/src/admin.rs` — reduce legacy module to compatibility re-exports/helpers only.
- Modify: `platform-admin/backend/src/bootstrap/router.rs` — keep `/api/admin/*` nested through the new routes.
- Modify: `platform-admin/backend/src/lib.rs` — export new admin module tree without extending old flat logic.
- Test: `platform-admin/backend/tests/admin_plane_rbac.rs` — end-to-end admin-plane RBAC contract tests through the `axum` router.
- Test: `platform-admin/backend/tests/admin_plane_deactivation.rs` — end-to-end deactivate contracts and safety rules.

### Task 1: Introduce admin-plane actor, permission, and policy skeleton

**Files:**
- Create: `platform-admin/backend/src/admin/domain/mod.rs`
- Create: `platform-admin/backend/src/admin/domain/actor.rs`
- Create: `platform-admin/backend/src/admin/domain/permission.rs`
- Create: `platform-admin/backend/src/admin/domain/policy.rs`
- Create: `platform-admin/backend/src/admin/domain/error.rs`
- Create: `platform-admin/backend/src/admin/application/mod.rs`
- Create: `platform-admin/backend/src/admin/application/authorizer.rs`

- [ ] **Step 1: Write the failing domain tests for policy decisions**

```rust
#[test]
fn tenant_admin_cannot_manage_platform_tenants() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::TenantCreate);

    assert_eq!(decision, Err(AdminError::forbidden("actor is not allowed to manage tenants")));
}

#[test]
fn tenant_admin_can_create_tenant_users_inside_own_scope() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::TenantUserCreate);

    assert!(decision.is_ok());
}
```

- [ ] **Step 2: Run the targeted test to verify the policy layer does not exist yet**

Run: `cd platform-admin/backend && cargo test tenant_admin_cannot_manage_platform_tenants -- --nocapture`
Expected: FAIL with missing `admin::domain` types or missing policy module.

- [ ] **Step 3: Implement the minimal admin authorization kernel**

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdminPermission {
    TenantList,
    TenantCreate,
    TenantDeactivate,
    AccountListAnyTenant,
    TenantAccountListSelf,
    TenantAdminCreate,
    TenantUserCreate,
    AccountDeactivate,
}

pub trait AdminPolicy {
    fn authorize(&self, actor: &AdminActor, permission: AdminPermission) -> Result<(), AdminError>;
}

#[derive(Debug, Default)]
pub struct DefaultAdminPolicy;

impl AdminPolicy for DefaultAdminPolicy {
    fn authorize(&self, actor: &AdminActor, permission: AdminPermission) -> Result<(), AdminError> {
        match (actor.role_code(), permission) {
            ("super_admin", _) => Ok(()),
            ("tenant_admin", AdminPermission::TenantUserCreate | AdminPermission::TenantAccountListSelf) => Ok(()),
            ("tenant_admin", _) => Err(AdminError::forbidden("actor is not allowed to manage tenants")),
            _ => Err(AdminError::forbidden("actor is not allowed to access admin workspace")),
        }
    }
}
```

- [ ] **Step 4: Re-run the targeted policy tests**

Run: `cd platform-admin/backend && cargo test tenant_admin_cannot_manage_platform_tenants tenant_admin_can_create_tenant_users_inside_own_scope -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit the authorization skeleton**

```bash
git add platform-admin/backend/src/admin/domain platform-admin/backend/src/admin/application
git commit -m "refactor: add admin plane authorization kernel"
```

### Task 2: Migrate tenant/account list-create flows into the new admin plane

**Files:**
- Create: `platform-admin/backend/src/admin/domain/tenant.rs`
- Create: `platform-admin/backend/src/admin/domain/account.rs`
- Create: `platform-admin/backend/src/admin/infrastructure/mod.rs`
- Create: `platform-admin/backend/src/admin/infrastructure/repository.rs`
- Create: `platform-admin/backend/src/admin/application/tenants.rs`
- Create: `platform-admin/backend/src/admin/application/accounts.rs`
- Modify: `platform-admin/backend/src/admin/api/mod.rs`
- Modify: `platform-admin/backend/src/admin.rs`
- Test: `platform-admin/backend/tests/admin_plane_rbac.rs`

- [ ] **Step 1: Write the failing router tests for tenant/account flows**

```rust
#[tokio::test]
async fn super_admin_can_create_tenant_and_list_accounts() {
    let harness = AdminHarness::seeded_super_admin().await;
    let access_token = harness.login_platform_root().await;

    let create_tenant = harness
        .post_with_bearer(
            "/api/admin/tenants",
            &access_token,
            json!({ "code": "acme", "name": "Acme" }),
        )
        .await;
    assert_eq!(create_tenant.status(), StatusCode::OK);

    let create_account = harness
        .post_with_bearer(
            "/api/admin/accounts",
            &access_token,
            json!({
                "tenantId": 1,
                "username": "alice",
                "displayName": "Alice",
                "password": "Secret123!",
                "roleCode": "tenant_admin"
            }),
        )
        .await;
    assert_eq!(create_account.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_tenant_admin_over_http() {
    let harness = AdminHarness::seeded_tenant_admin().await;
    let access_token = harness.login_tenant_admin().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/accounts",
            &access_token,
            json!({
                "username": "next-admin",
                "displayName": "Next Admin",
                "password": "Secret123!",
                "roleCode": "tenant_admin"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}
```

- [ ] **Step 2: Run the targeted integration test to verify the routes are missing**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_rbac -- --nocapture`
Expected: FAIL with `404 Not Found` or missing route handlers.

- [ ] **Step 3: Implement the minimal tenant/account repository and use cases**

```rust
pub async fn create_tenant(
    state: &AppState,
    actor: AdminActor,
    input: CreateTenantCommand,
) -> Result<TenantRecord, AdminError> {
    DefaultAdminPolicy::new().authorize(&actor, AdminPermission::TenantCreate)?;
    let mut repo = AdminRepository::from_state(state)?;
    repo.create_tenant(input).await
}

pub async fn create_account(
    state: &AppState,
    actor: AdminActor,
    input: CreateAccountCommand,
) -> Result<AccountRecord, AdminError> {
    let permission = match input.role_code.as_str() {
        "tenant_admin" => AdminPermission::TenantAdminCreate,
        _ => AdminPermission::TenantUserCreate,
    };
    DefaultAdminPolicy::new().authorize(&actor, permission)?;
    let mut repo = AdminRepository::from_state(state)?;
    repo.create_account(actor, input).await
}
```

- [ ] **Step 4: Wire the new routes through `admin/api/mod.rs` and keep DTOs scoped to the admin plane**

```rust
pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(me_handler))
        .route("/tenants", get(list_tenants_handler).post(create_tenant_handler))
        .route("/accounts", get(list_accounts_handler).post(create_account_handler))
        .route("/tenant/accounts", get(list_self_tenant_accounts_handler).post(create_self_tenant_account_handler))
}
```

- [ ] **Step 5: Re-run the RBAC integration test and then the auth/admin smoke set**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_rbac -- --nocapture && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test iam_auth_flow -- --nocapture`
Expected: PASS

- [ ] **Step 6: Commit the tenant/account list-create slice**

```bash
git add platform-admin/backend/src/admin platform-admin/backend/tests/admin_plane_rbac.rs
git commit -m "refactor: migrate admin plane tenant and account flows"
```

### Task 3: Migrate deactivate flows and safety constraints

**Files:**
- Modify: `platform-admin/backend/src/admin/application/tenants.rs`
- Modify: `platform-admin/backend/src/admin/application/accounts.rs`
- Modify: `platform-admin/backend/src/admin/infrastructure/repository.rs`
- Modify: `platform-admin/backend/src/admin/api/mod.rs`
- Test: `platform-admin/backend/tests/admin_plane_deactivation.rs`

- [ ] **Step 1: Write the failing integration tests for deactivation rules**

```rust
#[tokio::test]
async fn super_admin_cannot_deactivate_last_active_super_admin() {
    let harness = AdminHarness::seeded_super_admin().await;
    let access_token = harness.login_platform_root().await;

    let response = harness
        .post_with_bearer("/api/admin/accounts/1/deactivate", &access_token, json!({}))
        .await;

    assert_eq!(response.status(), StatusCode::CONFLICT);
}

#[tokio::test]
async fn tenant_admin_can_only_deactivate_tenant_users_inside_their_tenant() {
    let harness = AdminHarness::seeded_tenant_admin().await;
    let access_token = harness.login_tenant_admin().await;

    let response = harness
        .post_with_bearer("/api/admin/tenant/accounts/2/deactivate", &access_token, json!({}))
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the targeted test to verify the deactivate routes are missing**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_deactivation -- --nocapture`
Expected: FAIL with missing route handlers or incorrect status codes.

- [ ] **Step 3: Implement the minimal deactivate use cases and route handlers**

```rust
.route("/tenants/{tenant_id}/deactivate", post(deactivate_tenant_handler))
.route("/accounts/{account_id}/deactivate", post(deactivate_account_handler))
.route("/tenant/accounts/{account_id}/deactivate", post(deactivate_self_tenant_account_handler))
```

- [ ] **Step 4: Re-run the deactivate test suite**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_deactivation -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit the deactivate slice**

```bash
git add platform-admin/backend/src/admin platform-admin/backend/tests/admin_plane_deactivation.rs
git commit -m "refactor: migrate admin plane deactivation rules"
```

### Task 4: Fresh verification and docs touch-up

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: Document the new admin-plane route ownership and note that role checks now flow through the policy layer**
- [ ] **Step 2: Run backend formatting and lint checks**

Run: `cd platform-admin/backend && cargo fmt --check && cargo clippy --all-targets --all-features`
Expected: PASS (warnings only if already accepted in this codebase)

- [ ] **Step 3: Run backend integration verification against PostgreSQL**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test`
Expected: PASS

- [ ] **Step 4: Run repo-level regression verification**

Run: `cd /Users/chentao/project/hermes/hermes-desktop && npm run test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit docs and verification follow-up**

```bash
git add platform-admin/README.md
git commit -m "docs: describe admin plane migration slice"
```
