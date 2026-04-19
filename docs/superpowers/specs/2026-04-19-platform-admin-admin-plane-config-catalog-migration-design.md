# Platform Admin Admin Plane Config & Catalog Migration Design

## 1. 背景

`platform-admin/backend` 已完成后端重构的前两步基础迁移：

- `axum + tokio + sqlx` 新服务骨架已建立
- `iam` 已抽到共享认证核心
- `admin control plane` 已迁入第一批租户/后台账号管理能力
- `role + permission + policy` 授权骨架已经落下

当前仍未迁入新 `admin plane` 的两块核心控制面资源是：

1. `model profiles`
2. `skill catalog`

这两块能力目前仍主要依赖旧的平铺模块：

- `platform-admin/backend/src/model_profiles.rs`
- `platform-admin/backend/src/skill_catalog.rs`

虽然现有接口可用，但它们还没有进入新的 `admin/{api,application,domain,infrastructure}` 结构，也没有复用新落下来的 admin-plane 授权骨架。这会导致：

- 新旧结构并存时间被拉长
- 管理资源的授权语义继续散落
- 后续再迁 `desktop delivery plane` 时，admin 与 desktop 的资源边界仍不够清晰

因此，这一轮目标不是新增产品能力，而是把这两类资源正式迁入新的 `admin control plane`。

## 2. 目标与非目标

### 2.1 目标

本轮目标：

1. 将 `model profiles` 迁入新 `admin plane`
2. 将 `skill catalog` 迁入新 `admin plane`
3. 统一复用 `AdminActor + Permission + Policy` 授权骨架
4. 保持现有前端管理台接口 contract 不回归
5. 保持现有 `desktop` 下发 contract 不回归
6. 为下一步拆 `desktop delivery plane` 做好清晰资源边界

### 2.2 非目标

本轮明确不做：

- 不改 `desktop` 的接口协议
- 不新增模型编辑 / Skill 编辑能力
- 不做模型密钥托管
- 不做 Skill 包上传 / 发布流
- 不做更复杂的版本治理策略
- 不做 audit / session 迁移

## 3. 方案比较

### 方案 A：模型与 Skill 一起迁入新 admin plane（采用）

做法：

- 在 `admin/domain`、`admin/application`、`admin/infrastructure` 中同时为两类资源建模
- 在 `admin/api/mod.rs` 一次性接住 model/skill 相关路由
- 旧 `src/model_profiles.rs`、`src/skill_catalog.rs` 停止继续扩张，只保留兼容过渡职责

优点：

- 两类资源的作用域模型几乎一致，可复用同一套授权和仓储边界
- 避免连续两轮做高度重复的迁移工作
- 更快形成完整的 admin-plane 资源管理模板

缺点：

- 本轮变更面比只迁一个资源稍大

### 方案 B：先迁模型，再迁 Skill

优点：

- 每轮风险更小
- 出问题时定位更窄

缺点：

- 需要重复搭建几乎相同的 admin-plane 结构
- 拉长新旧结构并存时间

结论：采用方案 A。

## 4. 设计结论

### 4.1 总体结构

本轮继续扩展新 `admin control plane`：

```text
platform-admin/backend/src/admin/
├── api/
├── application/
│   ├── accounts.rs
│   ├── tenants.rs
│   ├── model_profiles.rs   # new
│   └── skill_catalog.rs    # new
├── domain/
│   ├── actor.rs
│   ├── permission.rs
│   ├── policy.rs
│   ├── model_profile.rs    # new
│   └── skill_catalog.rs    # new
└── infrastructure/
    └── repository.rs       # extend
```

设计原则：

- `domain` 只表达资源模型、作用域规则、输入校验
- `application` 负责 use case 编排与授权调用
- `infrastructure` 负责 `sqlx` 读写
- `api` 负责 DTO 映射与 HTTP 路由

### 4.2 不再继续扩张旧模块

本轮之后：

- `platform-admin/backend/src/model_profiles.rs`
- `platform-admin/backend/src/skill_catalog.rs`

不再承接新增业务逻辑。

如需保留旧代码，应只承担以下职责：

- 兼容过渡
- 对照迁移行为
- 在完全迁移完成前临时保底

新增逻辑只进入新 `admin plane`。

## 5. 资源建模

### 5.1 Model Profile

继续复用底层表：

- `platform_desktop_model_profiles`

admin-plane 领域对象包含：

- `id`
- `scope_type`：`global | tenant`
- `tenant`
- `provider`
- `model`
- `label`
- `base_url`
- `is_default`
- `is_active`

创建命令包含：

- `tenant_id`（仅 super_admin 可显式指定）
- `provider`
- `model`
- `label`
- `base_url`
- `is_default`

规则：

1. `super_admin` 可创建全局模型或指定租户模型
2. `tenant_admin` 只能创建本租户模型
3. 同一作用域内，创建新默认模型时要清除其他激活模型的默认标记
4. 停用默认模型时不自动补默认

### 5.2 Skill Catalog

继续复用底层表：

- `platform_desktop_skill_catalog`

admin-plane 领域对象包含：

- `id`
- `scope_type`：`global | tenant`
- `tenant`
- `name`
- `version`
- `description`
- `download_url`
- `is_active`

创建命令包含：

- `tenant_id`（仅 super_admin 可显式指定）
- `name`
- `version`
- `description`
- `download_url`

规则：

1. `super_admin` 可创建全局 Skill 或指定租户 Skill
2. `tenant_admin` 只能创建本租户 Skill
3. 本轮不做同名唯一、版本覆盖、发布流治理
4. 停用只改 `is_active = false`

## 6. 授权模型

本轮继续复用已落地的 `Role + Permission + Policy`：

### 6.1 新增权限点

建议新增：

- `ModelProfileListAnyTenant`
- `ModelProfileListSelfTenant`
- `ModelProfileCreateGlobal`
- `ModelProfileCreateTenant`
- `ModelProfileDeactivate`
- `SkillCatalogListAnyTenant`
- `SkillCatalogListSelfTenant`
- `SkillCatalogCreateGlobal`
- `SkillCatalogCreateTenant`
- `SkillCatalogDeactivate`

### 6.2 判定规则

- `super_admin`
  - 全部允许
- `tenant_admin`
  - 允许本租户 list/create/deactivate
  - 拒绝任何全局资源操作
  - 拒绝其他租户资源操作
- `tenant_user`
  - 一律拒绝进入管理资源面

### 6.3 作用域落地原则

授权不只看角色，还要在 use case 层二次约束作用域：

- tenant admin 的 `tenant_id` 一律以 actor.tenant 为准
- 即使前端传了别的 `tenantId`，也必须忽略或拒绝
- 资源停用前必须确认目标资源归属是否与 actor 匹配

## 7. HTTP 路由设计

### 7.1 Model Profiles

保留现有 contract，不改前端路径：

- `GET /api/admin/model-profiles?tenantId=:tenantId`
- `POST /api/admin/model-profiles`
- `POST /api/admin/model-profiles/:modelId/deactivate`
- `GET /api/admin/tenant/model-profiles`
- `POST /api/admin/tenant/model-profiles`
- `POST /api/admin/tenant/model-profiles/:modelId/deactivate`

### 7.2 Skill Catalog

同样保留现有 contract：

- `GET /api/admin/skills/catalog?tenantId=:tenantId`
- `POST /api/admin/skills/catalog`
- `POST /api/admin/skills/catalog/:skillId/deactivate`
- `GET /api/admin/tenant/skills/catalog`
- `POST /api/admin/tenant/skills/catalog`
- `POST /api/admin/tenant/skills/catalog/:skillId/deactivate`

### 7.3 错误响应

统一走现有 `ApiError` envelope：

- `400 invalid_request`
- `403 forbidden`
- `404 not_found`
- `409 conflict`
- `500 store_error`

## 8. 与 desktop plane 的边界

本轮不迁 `desktop`，但要明确边界：

- `admin plane` 负责“原始控制面资源管理”
- `desktop plane` 负责“有效下发视图”

因此：

- `model profile` 的默认模型收敛规则仍由 desktop 视图负责
- `skill catalog` 的全局/租户下发组合逻辑仍由 desktop 视图负责
- 本轮只要求这些 contract 不回归

这样下一步拆 `desktop delivery plane` 时，可以直接把“effective config / effective catalog”迁走，而不用再返工 admin 的控制面结构。

## 9. 测试设计

### 9.1 新增测试

新增 admin-plane 级别测试：

- `platform-admin/backend/tests/admin_plane_model_profiles.rs`
- `platform-admin/backend/tests/admin_plane_skill_catalog.rs`

覆盖：

1. super admin 可创建全局 model profile
2. tenant admin 不能创建全局 model profile
3. 同作用域新默认模型会清除旧默认
4. super admin 可创建全局 skill
5. tenant admin 不能创建全局 skill
6. tenant admin 只能停用本租户资源

### 9.2 保留回归测试

继续跑：

- `cargo test`（backend）
- `npm run test`
- `npm run typecheck`
- `npm run build`

并确保：

- 现有前端工作台不回归
- 现有 desktop 接口不回归

## 10. 实施顺序

建议按这个顺序实施：

1. 先扩 `permission + policy`
2. 迁 `model profiles` 到新 admin plane
3. 迁 `skill catalog` 到新 admin plane
4. 跑 backend 全量测试
5. 跑仓库级回归验证
6. 再进入下一轮 `desktop delivery plane` 拆分

## 11. 预期结果

完成后，后端结构会进一步收敛到：

- `iam` 管认证
- `admin plane` 管租户、账号、模型、Skill 等控制面资源
- `desktop plane` 后续只负责交付视图和客户端协议

这会让下一步“先 1 再 2”里的第一个目标完整落地，并为第二步 `desktop delivery plane` 迁移腾出清晰边界。
