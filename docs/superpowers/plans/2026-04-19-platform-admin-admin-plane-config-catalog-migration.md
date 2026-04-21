# Platform Admin Admin Plane Config & Catalog Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `model profiles` and `skill catalog` management into the new `admin control plane` while keeping the current admin and desktop HTTP contracts stable.

**Architecture:** Extend the existing `admin/{api,application,domain,infrastructure}` slice so models and skills use the same `AdminActor + Permission + Policy` authorization flow as tenant/account management. Keep `desktop` behavior unchanged for this slice; only prove it does not regress by running existing desktop-facing tests after the admin-plane migration lands.

**Tech Stack:** Rust, axum, tokio, sqlx, serde, PostgreSQL.

---

## Planned File Structure

- Modify: `platform-admin/backend/src/admin/domain/permission.rs` — add model-profile and skill-catalog permission points.
- Modify: `platform-admin/backend/src/admin/domain/policy.rs` — authorize super-admin vs tenant-admin access for model/skill resources.
- Create: `platform-admin/backend/src/admin/domain/model_profile.rs` — model profile record and create command validation.
- Create: `platform-admin/backend/src/admin/domain/skill_catalog.rs` — skill catalog record and create command validation.
- Modify: `platform-admin/backend/src/admin/domain/mod.rs` — export new domain modules.
- Create: `platform-admin/backend/src/admin/application/model_profiles.rs` — model profile list/create/deactivate use cases.
- Create: `platform-admin/backend/src/admin/application/skill_catalog.rs` — skill catalog list/create/deactivate use cases.
- Modify: `platform-admin/backend/src/admin/application/mod.rs` — export the new use-case modules.
- Modify: `platform-admin/backend/src/admin/infrastructure/repository.rs` — add async sqlx queries for models and skills.
- Modify: `platform-admin/backend/src/admin/api/mod.rs` — add admin-plane model/skill HTTP routes and DTO wiring.
- Modify: `platform-admin/backend/src/kernel/error.rs` — reuse `ApiError::from_admin_error` for new handlers without introducing new envelopes.
- Test: `platform-admin/backend/tests/admin_plane_model_profiles.rs` — end-to-end model profile admin-plane RBAC tests.
- Test: `platform-admin/backend/tests/admin_plane_skill_catalog.rs` — end-to-end skill catalog admin-plane RBAC tests.
- Modify: `platform-admin/README.md` — document that model/skill control routes are now owned by the admin plane.

### Task 1: Extend admin-plane permission and policy coverage for models and skills

**Files:**
- Modify: `platform-admin/backend/src/admin/domain/permission.rs`
- Modify: `platform-admin/backend/src/admin/domain/policy.rs`

- [ ] **Step 1: Write the failing policy tests for model/skill permissions**

```rust
#[test]
fn tenant_admin_cannot_create_global_model_profiles() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    let decision = policy.authorize(&actor, AdminPermission::ModelProfileCreateGlobal);

    assert_eq!(
        decision,
        Err(AdminError::forbidden(
            "actor is not allowed to manage global model profiles",
        )),
    );
}

#[test]
fn tenant_admin_can_manage_self_tenant_skill_catalog() {
    let actor = AdminActor::tenant_admin(tenant_fixture());
    let policy = DefaultAdminPolicy::new();

    assert!(policy
        .authorize(&actor, AdminPermission::SkillCatalogCreateTenant)
        .is_ok());
}
```

- [ ] **Step 2: Run the targeted tests to verify the new permission points do not exist yet**

Run: `cd platform-admin/backend && cargo test tenant_admin_cannot_create_global_model_profiles -- --nocapture`
Expected: FAIL with missing `AdminPermission::ModelProfileCreateGlobal` or missing policy branch.

- [ ] **Step 3: Add the minimal permission points and policy branches**

```rust
pub enum AdminPermission {
    TenantList,
    TenantCreate,
    TenantDeactivate,
    AccountListAnyTenant,
    TenantAccountListSelf,
    TenantAdminCreate,
    TenantUserCreate,
    AccountDeactivate,
    ModelProfileListAnyTenant,
    ModelProfileListSelfTenant,
    ModelProfileCreateGlobal,
    ModelProfileCreateTenant,
    ModelProfileDeactivate,
    SkillCatalogListAnyTenant,
    SkillCatalogListSelfTenant,
    SkillCatalogCreateGlobal,
    SkillCatalogCreateTenant,
    SkillCatalogDeactivate,
}
```

```rust
("tenant_admin", AdminPermission::ModelProfileListSelfTenant
    | AdminPermission::ModelProfileCreateTenant
    | AdminPermission::ModelProfileDeactivate
    | AdminPermission::SkillCatalogListSelfTenant
    | AdminPermission::SkillCatalogCreateTenant
    | AdminPermission::SkillCatalogDeactivate
    | AdminPermission::TenantAccountListSelf
    | AdminPermission::TenantUserCreate
    | AdminPermission::AccountDeactivate) => Ok(()),
("tenant_admin", AdminPermission::ModelProfileCreateGlobal) => Err(AdminError::forbidden(
    "actor is not allowed to manage global model profiles",
)),
("tenant_admin", AdminPermission::SkillCatalogCreateGlobal) => Err(AdminError::forbidden(
    "actor is not allowed to manage global skill catalog",
)),
```

- [ ] **Step 4: Re-run the targeted policy tests**

Run: `cd platform-admin/backend && cargo test tenant_admin_cannot_create_global_model_profiles -- --nocapture && cargo test tenant_admin_can_manage_self_tenant_skill_catalog -- --nocapture`
Expected: PASS

- [ ] **Step 5: Commit the policy expansion**

```bash
git add platform-admin/backend/src/admin/domain/permission.rs platform-admin/backend/src/admin/domain/policy.rs
git commit -m "refactor: extend admin plane permissions for models and skills"
```

### Task 2: Migrate model profiles into the admin plane

**Files:**
- Create: `platform-admin/backend/src/admin/domain/model_profile.rs`
- Create: `platform-admin/backend/src/admin/application/model_profiles.rs`
- Modify: `platform-admin/backend/src/admin/domain/mod.rs`
- Modify: `platform-admin/backend/src/admin/application/mod.rs`
- Modify: `platform-admin/backend/src/admin/infrastructure/repository.rs`
- Modify: `platform-admin/backend/src/admin/api/mod.rs`
- Test: `platform-admin/backend/tests/admin_plane_model_profiles.rs`

- [ ] **Step 1: Write the failing integration tests for model-profile routes**

```rust
#[tokio::test]
async fn super_admin_can_create_global_default_model_profile_over_http() {
    let harness = ModelProfileHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": "gpt-5.4",
                "label": "GPT-5.4",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_global_model_profile_over_http() {
    let harness = ModelProfileHarness::seeded_tenant_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": "gpt-5.4-mini",
                "label": "GPT-5.4 Mini",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn creating_new_default_model_clears_previous_default_in_same_scope() {
    let harness = ModelProfileHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": "gpt-4.1",
                "label": "GPT-4.1",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    harness
        .post_with_bearer(
            "/api/admin/model-profiles",
            &access_token,
            json!({
                "tenantId": null,
                "provider": "openai",
                "model": "gpt-5.4",
                "label": "GPT-5.4",
                "baseUrl": "https://api.openai.com/v1",
                "isDefault": true
            }),
        )
        .await;

    let list = harness
        .get_with_bearer("/api/admin/model-profiles", &access_token)
        .await;
    let payload = harness.read_json(list).await;
    let defaults = payload
        .as_array()
        .unwrap()
        .iter()
        .filter(|item| item["isDefault"] == json!(true))
        .count();

    assert_eq!(defaults, 1);
}
```

- [ ] **Step 2: Run the targeted model-profile integration suite to verify the new routes are missing**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_model_profiles -- --nocapture`
Expected: FAIL with `404 Not Found` or missing route handlers.

- [ ] **Step 3: Add the minimal domain types and validation**

```rust
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
```

- [ ] **Step 4: Implement repository support for model-profile list/create/find/deactivate**

```rust
pub async fn create_model_profile(
    &self,
    scope_tenant_id: Option<i64>,
    input: CreateModelProfileCommand,
) -> Result<ModelProfileRecord, AdminError> {
    let id = format!(
        "mdl-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock should be monotonic enough for ids")
            .as_millis()
    );

    if input.is_default {
        sqlx::query(
            r#"
            UPDATE platform_desktop_model_profiles
            SET is_default = FALSE, updated_at = NOW()
            WHERE (($1::bigint IS NULL AND tenant_id IS NULL) OR tenant_id = $1)
              AND is_active = TRUE
            "#,
        )
        .bind(scope_tenant_id)
        .execute(&self.pool)
        .await
        .map_err(map_sqlx_error)?;
    }

    // insert row, then reload by id
}
```

- [ ] **Step 5: Implement model-profile use cases and HTTP routes**

```rust
.route(
    "/model-profiles",
    get(list_model_profiles_handler).post(create_model_profile_handler),
)
.route(
    "/model-profiles/{model_id}/deactivate",
    post(deactivate_model_profile_handler),
)
.route(
    "/tenant/model-profiles",
    get(list_self_tenant_model_profiles_handler).post(create_self_tenant_model_profile_handler),
)
.route(
    "/tenant/model-profiles/{model_id}/deactivate",
    post(deactivate_self_tenant_model_profile_handler),
)
```

- [ ] **Step 6: Re-run the targeted model-profile integration suite and desktop regression smoke**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_model_profiles -- --nocapture && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test desktop -- --nocapture`
Expected: PASS

- [ ] **Step 7: Commit the model-profile migration slice**

```bash
git add platform-admin/backend/src/admin platform-admin/backend/tests/admin_plane_model_profiles.rs
git commit -m "refactor: migrate admin plane model profiles"
```

### Task 3: Migrate skill catalog into the admin plane

**Files:**
- Create: `platform-admin/backend/src/admin/domain/skill_catalog.rs`
- Create: `platform-admin/backend/src/admin/application/skill_catalog.rs`
- Modify: `platform-admin/backend/src/admin/domain/mod.rs`
- Modify: `platform-admin/backend/src/admin/application/mod.rs`
- Modify: `platform-admin/backend/src/admin/infrastructure/repository.rs`
- Modify: `platform-admin/backend/src/admin/api/mod.rs`
- Test: `platform-admin/backend/tests/admin_plane_skill_catalog.rs`

- [ ] **Step 1: Write the failing integration tests for skill-catalog routes**

```rust
#[tokio::test]
async fn super_admin_can_create_global_skill_catalog_item_over_http() {
    let harness = SkillCatalogHarness::seeded_super_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/skills/catalog",
            &access_token,
            json!({
                "tenantId": null,
                "name": "Code Review",
                "version": "1.0.0",
                "description": "Review code",
                "downloadUrl": "https://example.com/code-review.zip"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}

#[tokio::test]
async fn tenant_admin_cannot_create_global_skill_catalog_item_over_http() {
    let harness = SkillCatalogHarness::seeded_tenant_admin().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            "/api/admin/tenant/skills/catalog",
            &access_token,
            json!({
                "tenantId": null,
                "name": "Global OCR",
                "version": "1.0.0",
                "description": "OCR",
                "downloadUrl": "https://example.com/ocr.zip"
            }),
        )
        .await;

    assert_eq!(response.status(), StatusCode::FORBIDDEN);
}

#[tokio::test]
async fn tenant_admin_can_only_deactivate_skill_catalog_items_inside_their_tenant() {
    let harness = SkillCatalogHarness::seeded_tenant_admin_with_tenant_skill().await;
    let access_token = harness.login().await;

    let response = harness
        .post_with_bearer(
            &format!("/api/admin/tenant/skills/catalog/{}/deactivate", harness.skill_id()),
            &access_token,
            json!({}),
        )
        .await;

    assert_eq!(response.status(), StatusCode::OK);
}
```

- [ ] **Step 2: Run the targeted skill-catalog integration suite to verify the new routes are missing**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_skill_catalog -- --nocapture`
Expected: FAIL with `404 Not Found` or missing route handlers.

- [ ] **Step 3: Add the minimal domain types and validation**

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillCatalogRecord {
    pub id: String,
    pub scope_type: String,
    pub tenant: Option<AuthTenant>,
    pub name: String,
    pub version: String,
    pub description: String,
    pub download_url: String,
    pub is_active: bool,
}
```

- [ ] **Step 4: Implement repository support for skill-catalog list/create/find/deactivate**

```rust
pub async fn create_skill_catalog_item(
    &self,
    scope_tenant_id: Option<i64>,
    input: CreateSkillCatalogCommand,
) -> Result<SkillCatalogRecord, AdminError> {
    let scope = if scope_tenant_id.is_some() { "tenant" } else { "global" };
    // insert row into platform_desktop_skill_catalog and reload by id
}
```

- [ ] **Step 5: Implement skill-catalog use cases and HTTP routes**

```rust
.route(
    "/skills/catalog",
    get(list_skill_catalog_handler).post(create_skill_catalog_handler),
)
.route(
    "/skills/catalog/{skill_id}/deactivate",
    post(deactivate_skill_catalog_handler),
)
.route(
    "/tenant/skills/catalog",
    get(list_self_tenant_skill_catalog_handler).post(create_self_tenant_skill_catalog_handler),
)
.route(
    "/tenant/skills/catalog/{skill_id}/deactivate",
    post(deactivate_self_tenant_skill_catalog_handler),
)
```

- [ ] **Step 6: Re-run the targeted skill-catalog integration suite and backend auth/admin smoke set**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test admin_plane_skill_catalog -- --nocapture && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test --test iam_auth_flow -- --nocapture`
Expected: PASS

- [ ] **Step 7: Commit the skill-catalog migration slice**

```bash
git add platform-admin/backend/src/admin platform-admin/backend/tests/admin_plane_skill_catalog.rs
git commit -m "refactor: migrate admin plane skill catalog"
```

### Task 4: Fresh verification and route-ownership docs

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: Update `platform-admin/README.md` so it states that tenant/account/model/skill control routes now belong to `admin control plane`**
- [ ] **Step 2: Run backend format and lint verification**

Run: `cd platform-admin/backend && cargo fmt --check && cargo clippy --all-targets --all-features`
Expected: PASS (warnings only if already accepted elsewhere in the crate)

- [ ] **Step 3: Run full backend verification against PostgreSQL**

Run: `cd platform-admin/backend && ADMIN_DATABASE_URL=postgres://postgres:NewPass_123456@223.109.49.36:5432/manager_admin cargo test`
Expected: PASS

- [ ] **Step 4: Run repo-level regression verification**

Run: `cd /Users/chentao/project/hermes/hermes-desktop && npm run test && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 5: Commit the docs and verification follow-up**

```bash
git add platform-admin/README.md
git commit -m "docs: describe admin plane model and skill migration"
```
