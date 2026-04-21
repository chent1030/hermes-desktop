# Platform Phase 2 Desktop Delivery API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为桌面端第二份计划补齐真实平台执行端接口，包括在线初始化数据下发、模型配置下发、Skill 只读清单下发，以及基础审计接收/健康状态接口。

**Architecture:** 在 `platform-admin/backend` 内新增面向桌面执行端的独立模块，继续复用当前认证上下文，通过 access token 解析租户/账号后返回收敛视图。执行端接口与后台管理接口分层，避免把管理实体直接暴露给桌面端；审计接口先落最小可用内存外观与数据库持久化表，保证桌面端真实链路可联调。

**Tech Stack:** Rust, PostgreSQL, serde/serde_json, current std-first HTTP routing.

---

### Task 1: 为桌面执行端补初始化、模型、Skill 下发接口

**Files:**
- Create: `platform-admin/backend/src/desktop.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Test: `platform-admin/backend/src/desktop.rs`
- Test: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: 写失败测试，覆盖租户账号读取 bootstrap / model profiles / skill catalog**

```rust
#[test]
fn tenant_actor_receives_bootstrap_models_and_skill_catalog() {
    let actor = sample_tenant_admin_principal();
    let mut store = MemoryDesktopStore::default();
    store.models = vec![DesktopModelProfile {
        id: "model-default".to_string(),
        provider: "openai".to_string(),
        model: "gpt-5.4".to_string(),
        label: "GPT-5.4".to_string(),
        base_url: "https://api.openai.com/v1".to_string(),
        is_default: true,
    }];
    store.skills = vec![DesktopSkillCatalogItem {
        id: "skill-global-1".to_string(),
        scope: "global".to_string(),
        name: "Image OCR".to_string(),
        version: "1.0.0".to_string(),
        description: "OCR skill".to_string(),
        download_url: "https://example.com/ocr.zip".to_string(),
    }];

    let bootstrap = desktop_bootstrap_for_actor(&mut store, &actor).expect("bootstrap");
    let models = desktop_model_profiles_for_actor(&mut store, &actor).expect("models");
    let skills = desktop_skill_catalog_for_actor(&mut store, &actor).expect("skills");

    assert_eq!(bootstrap.tenant.code, "acme");
    assert_eq!(models.items.len(), 1);
    assert_eq!(skills.items.len(), 1);
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test tenant_actor_receives_bootstrap_models_and_skill_catalog`
Expected: FAIL，提示桌面执行端模块或 API 缺失

- [ ] **Step 3: 以最小实现补桌面执行端服务与路由**

```rust
match (method, normalized_path.as_str()) {
    (Some("GET"), "/api/desktop/bootstrap") => handle_desktop_bootstrap(request, config),
    (Some("GET"), "/api/desktop/model-profiles") => handle_desktop_model_profiles(request, config),
    (Some("GET"), "/api/desktop/skills/catalog") => handle_desktop_skill_catalog(request, config),
    _ => { /* existing routes */ }
}
```

- [ ] **Step 4: 跑后端全量测试确认通过**

Run: `cargo test`
Expected: PASS，desktop 模块测试与既有 auth/admin 测试全部通过

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/backend/src/desktop.rs platform-admin/backend/src/lib.rs
git commit -m "feat: add desktop delivery api"
```

### Task 2: 补最小审计接收与健康状态接口

**Files:**
- Create: `platform-admin/backend/src/audit.rs`
- Modify: `platform-admin/backend/src/lib.rs`
- Modify: `platform-admin/backend/src/auth.rs`
- Test: `platform-admin/backend/src/audit.rs`
- Test: `platform-admin/backend/src/lib.rs`

- [ ] **Step 1: 写失败测试，覆盖审计事件批量写入和健康状态读取**

```rust
#[test]
fn accepts_audit_batches_for_authenticated_actor() {
    let actor = sample_tenant_admin_principal();
    let mut store = MemoryAuditStore::default();
    let accepted = write_audit_events_for_actor(
        &mut store,
        &actor,
        AuditBatchInput {
            events: vec![AuditEventInput {
                event_type: "chat.started".to_string(),
                payload: serde_json::json!({ "sessionId": "s1" }),
            }],
        },
    )
    .expect("audit should be accepted");

    assert_eq!(accepted.accepted, 1);
}
```

- [ ] **Step 2: 跑后端定向测试确认失败**

Run: `cargo test accepts_audit_batches_for_authenticated_actor`
Expected: FAIL，提示审计服务或接口不存在

- [ ] **Step 3: 以最小实现补审计表、写入服务和 HTTP 路由**

```rust
match (method, normalized_path.as_str()) {
    (Some("POST"), "/api/audit/events:batch") => handle_audit_batch(request, config),
    (Some("GET"), "/api/audit/health") => handle_audit_health(request, config),
    _ => { /* existing routes */ }
}
```

- [ ] **Step 4: 跑后端全量测试确认通过**

Run: `cargo test`
Expected: PASS，审计测试与既有测试全部通过

- [ ] **Step 5: 提交这一小步**

```bash
git add platform-admin/backend/src/audit.rs platform-admin/backend/src/lib.rs platform-admin/backend/src/auth.rs
git commit -m "feat: add desktop audit api"
```

### Task 3: 补文档并做真实联调验证

**Files:**
- Modify: `platform-admin/README.md`
- Modify: `platform-admin/.env.example`

- [ ] **Step 1: 更新文档，加入桌面执行端接口说明与联调方式**
- [ ] **Step 2: 跑 `cargo test`**
- [ ] **Step 3: 跑 `npm run test -- tests/platform-runtime.test.ts src/renderer/src/platform/PlatformProvider.test.tsx`**
- [ ] **Step 4: 用真实 PostgreSQL 跑 `cargo test -- --ignored`**
- [ ] **Step 5: 提交并推送**

```bash
git add platform-admin/README.md platform-admin/.env.example
git commit -m "docs: describe desktop delivery api"
git push origin platform-phase2-desktop-closure
```
