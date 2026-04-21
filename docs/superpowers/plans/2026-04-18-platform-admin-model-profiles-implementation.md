# Platform Admin Model Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理端补齐模型配置管理，使后台可以管理全局模型与租户模型，并让桌面执行端继续消费统一模型下发视图。

**Architecture:** 继续复用 `platform_desktop_model_profiles` 作为模型配置主表，在 `platform-admin/backend` 增加模型配置管理服务与接口；`desktop` 执行端接口负责把全局默认与租户默认收敛成唯一默认。前端在现有双工作台上新增模型配置卡片，超级管理员可切换全局/租户模型，租户管理员只管理本租户模型。

**Tech Stack:** Rust, PostgreSQL, React, TypeScript, Vitest.

---

### Task 1: 落地后台模型配置管理服务与接口

**Files:**
- Create: `platform-admin/backend/src/model_profiles.rs`
- Modify: `platform-admin/backend/src/desktop.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/model_profiles.rs`
- Test: `platform-admin/backend/src/desktop.rs`

- [ ] **Step 1: 写失败测试，覆盖超级管理员创建全局默认模型与租户管理员禁止创建全局模型**

```rust
#[test]
fn super_admin_can_create_global_default_model_profile() {
    let actor = sample_super_admin_principal();
    let mut store = MemoryModelProfileStore::default();

    let created = create_model_profile_for_actor(
        &mut store,
        &actor,
        CreateModelProfileInput {
            tenant_id: None,
            provider: "openai".to_string(),
            model: "gpt-5.4".to_string(),
            label: "GPT-5.4".to_string(),
            base_url: "https://api.openai.com/v1".to_string(),
            is_default: true,
        },
    )
    .expect("super admin should create global model");

    assert_eq!(created.scope_type, "global");
    assert!(created.is_default);
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test super_admin_can_create_global_default_model_profile`
Expected: FAIL，提示模型配置管理模块不存在

- [ ] **Step 3: 以最小实现补模型配置管理服务与路由**

```rust
match (method, normalized_path.as_str()) {
    (Some("GET"), "/api/admin/model-profiles") => handle_list_model_profiles(request, config),
    (Some("POST"), "/api/admin/model-profiles") => handle_create_model_profile(request, config),
    (Some("GET"), "/api/admin/tenant/model-profiles") => handle_list_tenant_model_profiles(request, config),
    (Some("POST"), "/api/admin/tenant/model-profiles") => handle_create_tenant_model_profile(request, config),
    _ => { /* existing routes */ }
}
```

- [ ] **Step 4: 补桌面执行端默认模型收敛规则并回跑测试**

Run: `cargo test desktop`
Expected: PASS，租户默认优先于全局默认

- [ ] **Step 5: 跑后端全量测试确认通过**

Run: `cargo test`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/backend/src/model_profiles.rs platform-admin/backend/src/desktop.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add model profile management api"
```

### Task 2: 扩展管理端前端模型配置卡片

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `platform-admin/frontend/src/app.css`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖超级管理员和租户管理员模型配置视图**

```tsx
it("renders model profile control for the super admin workspace", async () => {
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Model profile control" })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑前端定向测试确认失败**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示模型配置卡片不存在

- [ ] **Step 3: 以最小实现补模型卡片、列表与创建/停用请求**

```tsx
{session?.user.roleCode === "super_admin" ? (
  <ModelProfilesCard scope="super-admin" />
) : (
  <ModelProfilesCard scope="tenant-admin" />
)}
```

- [ ] **Step 4: 回跑前端定向测试确认通过**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx platform-admin/frontend/src/app.css src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add admin model profile workspace"
```

### Task 3: 补文档并做 fresh verification

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `platform-admin/.env.example`

- [ ] **Step 1: 更新文档，加入模型配置管理接口与表说明**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`**
- [ ] **Step 4: 跑 `npm run test`、`npm run typecheck`、`npm run build`**
- [ ] **Step 5: 跑真实 PostgreSQL ignored 测试**
- [ ] **Step 6: 提交并推送**

```bash
git add platform-admin/README.md platform-admin/.env.example
git commit -m "docs: add model profile management notes"
git push origin platform-phase2-desktop-closure
```
