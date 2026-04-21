# Platform Admin 模型配置管理设计

## 1. 背景

第二份计划已经把桌面执行端真实下发接口接通，包括：

- `GET /api/desktop/bootstrap`
- `GET /api/desktop/model-profiles`
- `GET /api/desktop/skills/catalog`
- `POST /api/audit/events:batch`

其中模型下发已经依赖 `platform_desktop_model_profiles` 表，但管理端还没有对应的录入与维护能力。这会导致桌面端真实链路虽然存在，却只能靠手工写库维持模型配置，不满足“平台统一管理模型配置”的目标。

因此下一顺序切片只做一件事：**把管理端模型配置管理补齐**。

## 2. 本次范围

本次仅纳入以下能力：

1. 超级管理员管理全局模型与租户模型
2. 租户管理员管理本租户模型
3. 模型列表读取
4. 模型创建
5. 模型停用
6. 默认模型标记与作用域内唯一默认约束
7. 管理端最小可用 UI

本次明确不做：

- 模型密钥单独加密管理界面
- 模型编辑
- 模型物理删除
- 模型批量导入
- 模型分组、标签、版本治理

## 3. 角色与作用域规则

### 3.1 超级管理员

超级管理员需要同时看到两类模型：

- 全局模型：`tenant_id = null`
- 指定租户模型：`tenant_id = <tenant>`

超级管理员可以：

- 创建全局模型
- 创建指定租户模型
- 停用全局模型
- 停用指定租户模型

### 3.2 租户管理员

租户管理员只能管理自己租户下的模型：

- 只能读取本租户模型
- 只能创建本租户模型
- 只能停用本租户模型
- 不能操作全局模型

## 4. 数据模型规则

继续复用现有 `platform_desktop_model_profiles` 表，字段语义如下：

- `id`：模型配置唯一标识
- `tenant_id`：为空表示全局模型，不为空表示租户模型
- `provider`
- `model`
- `label`
- `base_url`
- `is_default`
- `is_active`

新增管理侧约束：

1. 同一作用域内最多只允许一个激活状态的默认模型
   - 全局作用域：`tenant_id = null`
   - 租户作用域：按 `tenant_id` 隔离
2. 停用默认模型时不自动补默认
3. 创建新默认模型时，自动把同作用域其他激活模型的 `is_default` 置为 `false`

## 5. 桌面执行端兼容规则

桌面执行端当前会读取：

- 全局模型
- 当前租户模型

为了避免“全局默认 + 租户默认”同时存在时桌面端看到两个默认值，本次补充以下收敛规则：

1. 如果当前租户存在激活的租户默认模型，则桌面端返回结果中只保留该租户默认模型的 `isDefault = true`
2. 若当前租户没有租户默认模型，则回落到全局默认模型
3. 因此桌面执行端收到的有效模型列表中，最多只会有一个默认模型

这条规则只影响桌面执行端返回视图，不改变库里的“每个作用域一套默认”的管理语义。

## 6. 后台接口设计

### 6.1 超级管理员接口

- `GET /api/admin/model-profiles?tenantId=<id|empty>`
  - 不传 `tenantId`：读取全局模型
  - 传 `tenantId`：读取指定租户模型
- `POST /api/admin/model-profiles`
- `POST /api/admin/model-profiles/:modelId/deactivate`

### 6.2 租户管理员接口

- `GET /api/admin/tenant/model-profiles`
- `POST /api/admin/tenant/model-profiles`
- `POST /api/admin/tenant/model-profiles/:modelId/deactivate`

### 6.3 输入输出约束

创建输入最小字段：

- `provider`
- `model`
- `label`
- `baseUrl`
- `isDefault`
- `tenantId`（仅超级管理员可传）

服务端负责：

- 生成 `id`
- 校验作用域权限
- 维护默认模型唯一性

返回记录包含：

- `id`
- `scopeType`
- `tenant`
- `provider`
- `model`
- `label`
- `baseUrl`
- `isDefault`
- `isActive`

## 7. 管理端前端设计

### 7.1 超级管理员工作台

超级管理员工作台新增第三块卡片：

- 标题：`Model profile control`
- 能力：
  - 切换当前管理作用域
    - `Global models`
    - `Selected tenant models`
  - 创建模型配置
  - 展示当前作用域模型列表
  - 停用模型

默认行为：

- 若未选租户，则只能管理全局模型
- 若已选租户，可在“全局 / 当前租户”之间切换

### 7.2 租户管理员工作台

租户管理员工作台新增模型卡片：

- 标题：`Tenant model profiles`
- 只能创建本租户模型
- 不显示全局模型切换能力

## 8. 测试策略

至少覆盖：

1. 超级管理员可以创建全局默认模型
2. 租户管理员不能创建全局模型
3. 新默认模型会清除同作用域旧默认标记
4. 超级管理员前端工作台显示模型管理卡片
5. 租户管理员前端工作台只显示租户模型管理
6. 桌面执行端在全局默认与租户默认并存时只返回一个默认模型

## 9. 结论

这一切片的目标不是把配置中心一次做满，而是先把“桌面端真实模型下发”背后的控制面补齐，形成：

- 后台可维护
- 桌面可读取
- 默认规则可解释
- RBAC 边界清晰

这能为下一顺序切片的 Skill 清单管理提供同样的落地模板。
