# Platform Admin Skill Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台管理端补齐 Skill 只读清单管理/录入能力，让后台可以维护全局与租户 Skill 元数据，并继续复用现有桌面端只读下发链路。

**Architecture:** 继续沿用 `platform_desktop_skill_catalog` 作为统一数据源，在 backend 新增独立的 Skill catalog 管理服务模块，通过 actor + tenant scope 做 RBAC 控制；frontend 在现有工作台中新增 Skill 管理卡片，与模型配置工作台保持一致的交互结构。

**Tech Stack:** Rust, PostgreSQL, serde, React, TypeScript, Vitest

---

### Task 1: 补 Skill catalog backend 服务与测试

**Files:**
- Create: `platform-admin/backend/src/skill_catalog.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/skill_catalog.rs`

- [ ] **Step 1: 写失败测试，覆盖超级管理员录入全局 Skill 与租户管理员越权录入**

```rust
#[test]
fn super_admin_can_create_global_skill_catalog_item() {
    let actor = sample_super_admin_principal();
    let mut store = MemorySkillCatalogStore::default();

    let created = create_skill_catalog_item_for_actor(
        &mut store,
        &actor,
        CreateSkillCatalogItemInput {
            tenant_id: None,
            name: "Code Review".to_string(),
            version: "1.0.0".to_string(),
            description: "Review code".to_string(),
            download_url: "https://example.com/skills/code-review.zip".to_string(),
        },
    )
    .expect("super admin should create global skill");

    assert_eq!(created.scope_type, "global");
    assert_eq!(created.name, "Code Review");
}
```

```rust
#[test]
fn tenant_admin_cannot_create_global_skill_catalog_item() {
    let actor = sample_tenant_admin_principal();
    let mut store = MemorySkillCatalogStore::default();

    let error = create_skill_catalog_item_for_actor(
        &mut store,
        &actor,
        CreateSkillCatalogItemInput {
            tenant_id: None,
            name: "Global OCR".to_string(),
            version: "1.0.0".to_string(),
            description: "OCR".to_string(),
            download_url: "https://example.com/skills/ocr.zip".to_string(),
        },
    )
    .expect_err("tenant admin must not create global skill");

    assert!(matches!(error, SkillCatalogError::Forbidden(_)));
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test super_admin_can_create_global_skill_catalog_item tenant_admin_cannot_create_global_skill_catalog_item`
Expected: FAIL，提示 `skill_catalog` 模块或对应服务不存在

- [ ] **Step 3: 实现最小 Skill catalog store / service / RBAC 校验**

```rust
pub trait SkillCatalogStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, SkillCatalogStoreError>;
    fn list_skill_catalog(
        &mut self,
        tenant_id: Option<i64>,
    ) -> Result<Vec<SkillCatalogRecord>, SkillCatalogStoreError>;
    fn create_skill_catalog_item(
        &mut self,
        id: &str,
        tenant_id: Option<i64>,
        name: &str,
        version: &str,
        description: &str,
        download_url: &str,
    ) -> Result<SkillCatalogRecord, SkillCatalogStoreError>;
    fn find_skill_catalog_item(
        &mut self,
        id: &str,
    ) -> Result<Option<SkillCatalogRecord>, SkillCatalogStoreError>;
    fn deactivate_skill_catalog_item(&mut self, id: &str) -> Result<(), SkillCatalogStoreError>;
}
```

- [ ] **Step 4: 在 `lib.rs` 接入 Skill catalog HTTP 路由**

```rust
(Some("GET"), "/api/admin/skills/catalog") => handle_list_skill_catalog(request, config),
(Some("POST"), "/api/admin/skills/catalog") => handle_create_skill_catalog(request, config),
(Some("GET"), "/api/admin/tenant/skills/catalog") => handle_list_skill_catalog(request, config),
(Some("POST"), "/api/admin/tenant/skills/catalog") => handle_create_skill_catalog(request, config),
(Some("POST"), _) if normalized_path.starts_with("/api/admin/skills/catalog/") && normalized_path.ends_with("/deactivate") => {
    handle_deactivate_skill_catalog(request, config, &normalized_path)
}
```

- [ ] **Step 5: 跑 `cargo test` 确认后端通过**

Run: `cargo test`
Expected: PASS，包含既有 auth / admin / desktop / model profiles 测试

- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/backend/src/skill_catalog.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add skill catalog admin service"
```

### Task 2: 补管理端前端 Skill catalog 工作台与测试

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖超级管理员与租户管理员 Skill 卡片渲染**

```tsx
expect(
  screen.getByRole("heading", { name: "Skill catalog control" }),
).toBeInTheDocument();
expect(screen.getByText("Code Review")).toBeInTheDocument();
```

```tsx
expect(
  screen.getByRole("heading", { name: "Tenant skill catalog" }),
).toBeInTheDocument();
expect(screen.queryByText("Global skills")).not.toBeInTheDocument();
```

- [ ] **Step 2: 跑前端定向测试确认失败**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示 Skill 工作台 UI 尚未出现

- [ ] **Step 3: 在 `App.tsx` 增加 Skill catalog 状态、加载、录入、停用逻辑**

```tsx
const [skillCatalog, setSkillCatalog] = useState<SkillCatalogRecord[]>([]);
const [skillScope, setSkillScope] = useState<"global" | "tenant">("global");
const [skillForm, setSkillForm] = useState({
  name: "",
  version: "",
  description: "",
  downloadUrl: "",
});
```

- [ ] **Step 4: 在超级管理员 / 租户管理员工作台补 Skill catalog 卡片**

```tsx
<article className="platform-admin-card platform-admin-stack-card">
  <p className="platform-admin-section-label">Skill Hub</p>
  <h3>Skill catalog control</h3>
</article>
```

- [ ] **Step 5: 跑定向测试与全量前端测试**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: PASS

Run: `npm run test`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/frontend/src/App.tsx src/renderer/src/platform-admin/PlatformAdminApp.test.tsx
git commit -m "feat: add skill catalog admin workspace"
```

### Task 3: 更新文档并完成真实验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-admin-skill-catalog-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-admin-skill-catalog-implementation.md`

- [ ] **Step 1: 更新 README，补 Skill catalog 管理能力与接口说明**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`**
- [ ] **Step 4: 跑 `npm run test`、`npm run typecheck`、`npm run build`**
- [ ] **Step 5: 用真实 PostgreSQL 跑 `cargo test -- --ignored`**
- [ ] **Step 6: 提交并推送**

```bash
git add platform-admin/README.md docs/superpowers/specs/2026-04-18-platform-admin-skill-catalog-design.md docs/superpowers/plans/2026-04-18-platform-admin-skill-catalog-implementation.md
git commit -m "docs: describe skill catalog admin flow"
git push origin platform-phase2-desktop-closure
```
