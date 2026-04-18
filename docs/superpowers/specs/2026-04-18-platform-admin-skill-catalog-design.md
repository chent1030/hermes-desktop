# Platform Admin Skill 只读清单管理设计

## 1. 背景

第二份计划已经让桌面端可以通过平台接口读取 Skill 只读清单：

- `GET /api/desktop/skills/catalog`

桌面端当前已经具备以下消费能力：

- 展示全局 Skill 与租户 Skill
- 允许用户手动下载 Skill 包
- 结合本机探测结果显示本地安装 / 已下载 / 版本漂移状态
- 不自动安装，不自动执行

但管理端仍缺少一个可维护的控制面，导致平台 Skill 清单只能靠直接写库维护，无法满足“平台统一管理全局 Skill 与租户 Skill 目录”的目标。

因此下一顺序切片聚焦一件事：**把管理端的 Skill 只读清单管理/录入补齐**。

## 2. 本次范围

本次只做以下能力：

1. 超级管理员管理全局 Skill 清单与指定租户 Skill 清单
2. 租户管理员管理本租户 Skill 清单
3. Skill 清单列表读取
4. Skill 清单录入
5. Skill 清单停用
6. 管理端最小可用 UI
7. README 与实现计划文档补齐

本次明确不做：

- Skill 包上传
- Skill 发布流
- 京东云对象存储对接
- Skill 审核流
- Skill 编辑
- Skill 物理删除
- Skill 自动同步本机安装状态

也就是说，本次只补“控制面录入与下发”，不补“资产上传与发布面”。

## 3. 角色与作用域规则

### 3.1 超级管理员

超级管理员需要同时管理两类 Skill：

- 全局 Skill：`scope = 'global'`，`tenant_id = null`
- 租户 Skill：`scope = 'tenant'`，`tenant_id = <tenant>`

超级管理员可以：

- 录入全局 Skill
- 录入指定租户 Skill
- 查看全局 Skill
- 查看指定租户 Skill
- 停用全局 Skill
- 停用指定租户 Skill

### 3.2 租户管理员

租户管理员只能管理自己租户下的 Skill 清单：

- 只能查看本租户 Skill
- 只能录入本租户 Skill
- 只能停用本租户 Skill
- 不能管理全局 Skill
- 不能管理其他租户 Skill

## 4. 数据模型与约束

继续复用现有 `platform_desktop_skill_catalog` 表。

当前字段：

- `id`
- `scope`
- `tenant_id`
- `name`
- `version`
- `description`
- `download_url`
- `is_active`

本次不扩表，直接围绕现有结构补管理逻辑。

### 4.1 录入规则

录入时至少要求：

- `name`
- `version`
- `downloadUrl`

可选字段：

- `description`
- `tenantId`（仅超级管理员录入租户 Skill 时使用）

服务端负责：

- 生成唯一 `id`
- 根据 `tenantId` 和操作者角色确定作用域
- 校验租户是否存在且激活
- 维护 RBAC 边界

### 4.2 清单约束

本次只做最小约束：

1. 全局 Skill 必须满足 `scope = 'global'` 且 `tenant_id = null`
2. 租户 Skill 必须满足 `scope = 'tenant'` 且 `tenant_id != null`
3. 停用只改 `is_active = false`
4. 列表默认展示当前作用域下全部记录，包含已停用项，方便后台核对

本次不做“同名唯一”“版本唯一”“多版本并存策略”“租户覆盖全局同名 Skill”的额外策略。

原因是桌面端当前只读展示与手动下载并不依赖这些复杂治理规则，先保持最小可用，避免把上传 / 发布语义提前做重。

## 5. 与桌面端的关系

桌面端 `GET /api/desktop/skills/catalog` 已经具备只读下发能力，本次不改下发协议，只补后台录入面。

换句话说：

- 桌面端 contract 保持不变
- 本机 Skill 探测逻辑保持不变
- 桌面端仍然只展示、不自动安装
- 下载动作继续打开 `downloadUrl`

因此，本次完成后会形成完整闭环：

1. 后台录入 Skill 清单
2. 平台下发全局 / 租户 Skill 列表
3. 桌面端展示只读列表
4. 桌面端结合本地探测显示安装状态
5. 用户手动下载 Skill 包

## 6. 后台接口设计

### 6.1 超级管理员接口

- `GET /api/admin/skills/catalog?tenantId=<id|empty>`
  - 不传 `tenantId`：读取全局 Skill 清单
  - 传 `tenantId`：读取指定租户 Skill 清单
- `POST /api/admin/skills/catalog`
- `POST /api/admin/skills/catalog/:skillId/deactivate`

### 6.2 租户管理员接口

- `GET /api/admin/tenant/skills/catalog`
- `POST /api/admin/tenant/skills/catalog`
- `POST /api/admin/tenant/skills/catalog/:skillId/deactivate`

### 6.3 返回结构

返回记录统一包含：

- `id`
- `scopeType`
- `tenant`
- `name`
- `version`
- `description`
- `downloadUrl`
- `isActive`

## 7. 管理端前端设计

### 7.1 超级管理员工作台

在超级管理员工作台新增一张 Skill 卡片：

- 标题：`Skill catalog control`
- 作用域切换：
  - `Global skills`
  - `Selected tenant skills`
- 录入表单字段：
  - `Name`
  - `Version`
  - `Description`
  - `Download URL`
- 列表显示：
  - 名称
  - 版本
  - 作用域提示
  - 停用状态
- 操作：
  - `Create skill`
  - `Deactivate skill`

默认行为：

- 未选择租户时只允许录入全局 Skill
- 选中租户后，允许在“全局 / 当前租户”之间切换

### 7.2 租户管理员工作台

租户管理员新增一张卡片：

- 标题：`Tenant skill catalog`
- 只能录入本租户 Skill
- 不显示全局切换能力

## 8. 测试策略

至少覆盖：

1. 超级管理员可以录入全局 Skill
2. 租户管理员不能录入全局 Skill
3. 超级管理员前端工作台显示 Skill 卡片
4. 租户管理员只显示租户 Skill 卡片
5. 停用 Skill 后记录仍可在后台列表中看到且状态变更
6. `cargo test`、管理端前端定向测试、全量 `npm run test` 通过

## 9. 后续演进边界

本次设计故意把“Skill 目录元数据”与“Skill 包资产发布”拆开：

- 当前切片：后台录入元数据，桌面只读消费
- 后续切片：接京东云对象存储、上传包、生成下载地址、做发布流与版本治理

这样可以先把平台控制面打稳，再逐步接资产托管能力，符合当前“先平台稳定”的优先级。
