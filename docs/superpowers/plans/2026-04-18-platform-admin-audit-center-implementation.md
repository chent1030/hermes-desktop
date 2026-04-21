# Platform Admin Audit Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为平台管理端补齐审计中心最小可查视图，让后台能查看桌面端已上报的最近审计事件，形成“桌面上报 - 平台入库 - 管理端可查”的闭环。

**Architecture:** 在 `platform-admin/backend` 基于现有 `platform_audit_events` 新增只读查询服务模块，复用当前 actor 鉴权与租户边界；frontend 在现有管理工作台新增审计中心卡片，超级管理员按已选租户查看，租户管理员查看本租户审计。

**Tech Stack:** Rust, PostgreSQL, serde, React, TypeScript, Vitest

---

### Task 1: 补审计中心 backend 查询服务与路由

**Files:**
- Create: `platform-admin/backend/src/audit_center.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/audit_center.rs`

- [ ] **Step 1: 写失败测试，覆盖租户管理员查询与超级管理员缺少 tenantId 的场景**

```rust
#[test]
fn tenant_admin_can_list_own_audit_events() {
    let actor = sample_tenant_admin_principal();
    let mut store = MemoryAuditCenterStore::default();
    store.events = vec![sample_audit_event_record()];

    let items = list_audit_events_for_actor(&mut store, &actor, Some(7), Some(50))
        .expect("tenant admin should read own audit events");

    assert_eq!(items.len(), 1);
}
```

```rust
#[test]
fn super_admin_requires_tenant_scope_to_list_audit_events() {
    let actor = sample_super_admin_principal();
    let mut store = MemoryAuditCenterStore::default();

    let error = list_audit_events_for_actor(&mut store, &actor, None, None)
        .expect_err("super admin must provide tenant scope");

    assert!(matches!(error, AuditCenterError::InvalidRequest(_)));
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test tenant_admin_can_list_own_audit_events super_admin_requires_tenant_scope_to_list_audit_events`
Expected: FAIL，提示 `audit_center` 模块或服务不存在

- [ ] **Step 3: 实现最小查询 store / service / RBAC 校验**

```rust
pub trait AuditCenterStore {
    fn find_tenant(&mut self, tenant_id: i64) -> Result<Option<AuthTenant>, AuditCenterStoreError>;
    fn list_audit_events(
        &mut self,
        tenant_id: i64,
        limit: i64,
    ) -> Result<Vec<AuditEventRecord>, AuditCenterStoreError>;
}
```

- [ ] **Step 4: 在 `lib.rs` 接入查询路由**

```rust
(Some("GET"), "/api/admin/audit/events") => handle_list_audit_events(request, config),
(Some("GET"), "/api/admin/tenant/audit/events") => handle_list_tenant_audit_events(request, config),
```

- [ ] **Step 5: 跑 `cargo test` 确认后端通过**

Run: `cargo test`
Expected: PASS

- [ ] **Step 6: 提交这一小步**

```bash
git add platform-admin/backend/src/audit_center.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add audit center query api"
```

### Task 2: 补管理端前端审计中心卡片与测试

**Files:**
- Modify: `platform-admin/frontend/src/App.tsx`
- Modify: `src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖超级管理员与租户管理员审计卡片渲染**

```tsx
expect(screen.getByRole("heading", { name: "Audit center" })).toBeInTheDocument();
expect(screen.getByText("workspace.initialized")).toBeInTheDocument();
```

```tsx
expect(screen.getByRole("heading", { name: "Tenant audit center" })).toBeInTheDocument();
expect(screen.getByText("chat.started")).toBeInTheDocument();
```

- [ ] **Step 2: 跑前端定向测试确认失败**

Run: `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`
Expected: FAIL，提示审计中心 UI 尚未出现

- [ ] **Step 3: 在 `App.tsx` 增加审计列表状态与加载逻辑**

```tsx
const [auditEvents, setAuditEvents] = useState<AuditEventRecord[]>([]);
```

- [ ] **Step 4: 在超级管理员 / 租户管理员工作台补审计中心卡片**

```tsx
<article className="platform-admin-card platform-admin-stack-card">
  <p className="platform-admin-section-label">Audit center</p>
  <h3>Audit center</h3>
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
git commit -m "feat: add audit center workspace"
```

### Task 3: 更新文档并完成验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `docs/superpowers/specs/2026-04-18-platform-admin-audit-center-design.md`
- Modify: `docs/superpowers/plans/2026-04-18-platform-admin-audit-center-implementation.md`

- [ ] **Step 1: 更新 README，补审计中心查询接口与能力说明**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- src/renderer/src/platform-admin/PlatformAdminApp.test.tsx`**
- [ ] **Step 4: 跑 `npm run test`、`npm run typecheck`、`npm run build`**
- [ ] **Step 5: 用真实 PostgreSQL 跑 `cargo test -- --ignored`**
- [ ] **Step 6: 提交并推送**

```bash
git add platform-admin/README.md docs/superpowers/specs/2026-04-18-platform-admin-audit-center-design.md docs/superpowers/plans/2026-04-18-platform-admin-audit-center-implementation.md
git commit -m "docs: describe audit center admin flow"
git push origin platform-phase2-desktop-closure
```
