# Platform Admin 租户管理与后台 RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台后台补齐平台级超级管理员自动播种、租户管理、后台账号管理，以及超级管理员 / 租户管理员两套最小可用工作台。

**Architecture:** 继续复用 `platform-admin/backend` 的 Rust 最小 HTTP 服务和 PostgreSQL。后端把后台登录主体统一到平台级/租户级账号模型中，并通过 access token 查回操作者上下文做鉴权。前端在现有登录页基础上扩成角色驱动工作台：超级管理员可管理租户和租户账号，租户管理员只能管理本租户普通用户。

**Tech Stack:** Rust, PostgreSQL, serde/serde_json, React, TypeScript, Vitest.

---

### Task 1: 重整后台认证模型并补初始超级管理员播种

**Files:**
- Modify: `platform-admin/backend/src/auth.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/README.md`
- Modify: `platform-admin/.env.example`
- Test: `platform-admin/backend/src/auth.rs`
- Test: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: 写失败测试，覆盖平台级超级管理员播种和平台级登录**

```rust
#[test]
fn bootstraps_platform_super_admin_once() {
    let mut store = MemoryAuthStore::default();
    ensure_bootstrap_super_admin(&mut store, &BootstrapConfig {
        username: Some("root".to_string()),
        password: Some("Secret123!".to_string()),
        display_name: Some("Platform Root".to_string()),
    }).expect("bootstrap should succeed");

    assert_eq!(store.created_accounts.len(), 1);
    ensure_bootstrap_super_admin(&mut store, &BootstrapConfig {
        username: Some("root".to_string()),
        password: Some("Secret123!".to_string()),
        display_name: Some("Platform Root".to_string()),
    }).expect("bootstrap should stay idempotent");
    assert_eq!(store.created_accounts.len(), 1);
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test bootstrap`
Expected: FAIL，提示播种函数或平台级账号模型缺失

- [ ] **Step 3: 以最小实现补平台级/租户级统一账号模型和播种逻辑**

```rust
pub struct BootstrapConfig {
    pub username: Option<String>,
    pub password: Option<String>,
    pub display_name: Option<String>,
}

pub fn ensure_bootstrap_super_admin<S: AuthStore>(
    store: &mut S,
    config: &BootstrapConfig,
) -> Result<(), AuthError> {
    if store.has_active_super_admin()? {
        return Ok(());
    }
    let username = match config.username.as_deref() {
        Some(value) if !value.trim().is_empty() => value,
        _ => return Ok(()),
    };
    let password = match config.password.as_deref() {
        Some(value) if !value.is_empty() => value,
        _ => return Ok(()),
    };
    let display_name = config
        .display_name
        .clone()
        .unwrap_or_else(|| username.to_string());
    store.create_bootstrap_super_admin(username, &display_name, &hash_password(password))?;
    Ok(())
}
```

- [ ] **Step 4: 回跑后端定向测试确认通过**

Run: `cargo test bootstrap`
Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/backend/src/auth.rs platform-admin/backend/src/lib.rs platform-admin/.env.example platform-admin/README.md
git commit -m "feat: bootstrap platform super admin"
```

### Task 2: 落地超级管理员 / 租户管理员后端管理接口

**Files:**
- Create: `platform-admin/backend/src/admin.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/backend/src/auth.rs`
- Test: `platform-admin/backend/src/admin.rs`
- Test: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: 写失败测试，覆盖租户管理员不能创建租户管理员和超级管理员可创建租户**

```rust
#[test]
fn tenant_admin_cannot_create_tenant_admin_accounts() {
    let actor = sample_tenant_admin_principal();
    let error = create_account(
        &mut MemoryAdminStore::default(),
        &actor,
        CreateAccountInput {
            tenant_id: Some(7),
            username: "next-admin".to_string(),
            display_name: "Next Admin".to_string(),
            password: "Secret123!".to_string(),
            role_code: "tenant_admin".to_string(),
        },
    )
    .expect_err("tenant admin should be blocked");

    assert_eq!(error, AdminError::Forbidden("tenant admin cannot create tenant admin".to_string()));
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test tenant_admin_cannot_create_tenant_admin_accounts`
Expected: FAIL，提示管理接口或鉴权逻辑不存在

- [ ] **Step 3: 以最小实现补管理服务与 HTTP 路由**

```rust
match (method, normalized_path.as_str()) {
    ("GET", "/api/admin/me") => handle_admin_me(request, config),
    ("GET", "/api/admin/tenants") => handle_list_tenants(request, config),
    ("POST", "/api/admin/tenants") => handle_create_tenant(request, config),
    ("GET", "/api/admin/tenant/accounts") => handle_list_scoped_accounts(request, config),
    ("POST", "/api/admin/tenant/accounts") => handle_create_scoped_account(request, config),
    _ => not_found_response(),
}
```

- [ ] **Step 4: 跑后端全量测试确认通过**

Run: `cargo test`
Expected: PASS，CRUD 和权限测试通过，live postgres ignored 测试仍可运行

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/backend/src/admin.rs platform-admin/backend/src/auth.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add platform admin management api"
```

### Task 3: 扩展管理台为超级管理员 / 租户管理员双工作台

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `platform-admin/frontend/src/app.css`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖超级管理员工作台和租户管理员限制视图**

```tsx
it("renders a super admin workspace with tenant creation", async () => {
  render(<App />);
  // mock login returns super_admin without tenant
  expect(await screen.findByText("Platform workspace")).toBeInTheDocument();
  expect(screen.getByText("Create tenant")).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑前端定向测试确认失败**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示新工作台元素不存在

- [ ] **Step 3: 以最小实现补角色驱动工作台和表单请求**

```tsx
if (session?.user.roleCode === "super_admin") {
  return <SuperAdminWorkspace session={session} />;
}
if (session?.user.roleCode === "tenant_admin") {
  return <TenantAdminWorkspace session={session} />;
}
```

- [ ] **Step 4: 回跑前端定向测试确认通过**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx platform-admin/frontend/src/app.css src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add platform admin workspaces"
```

### Task 4: 完成 fresh verification 与真实 PostgreSQL 验证

**Files:**
- Modify: `platform-admin/README.md`

- [ ] **Step 1: 更新文档，加入 bootstrap 环境变量和管理接口说明**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`**
- [ ] **Step 4: 跑真实 PostgreSQL ignored 测试**

```bash
cd platform-admin/backend
ADMIN_DATABASE_URL=postgres://postgres:password@host:5432/manager_admin cargo test live_postgres -- --ignored
```

- [ ] **Step 5: 跑根仓库 `npm run test`、`npm run typecheck`、`npm run build`，并提交推送**

```bash
git add platform-admin/README.md
git commit -m "docs: finalize admin rbac bootstrap flow"
git push origin platform-phase2-desktop-closure
```
