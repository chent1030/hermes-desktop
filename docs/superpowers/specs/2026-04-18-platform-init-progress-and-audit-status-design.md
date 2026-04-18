# Platform Init Progress And Audit Status Design

## 1. 背景

桌面端第二阶段已经具备：

- 租户登录
- 在线初始化
- 平台模型与 Skill 清单下发
- 审计上传与本地缓冲

但当前仍有两个直接影响生产可用性的反馈缺口：

1. 初始化页只能在失败后展示错误，无法持续告诉用户当前执行到了哪一段
2. 设置页中的审计状态仍然偏“总状态”，不能明确区分：
   - 是本地事件正在缓冲
   - 还是平台审计服务当前不可达

为保证“必须联网、必须在线初始化、允许缓冲但持续告警”的第二阶段闭环体验，本次需要把这两块反馈补完整。

## 2. 目标

本次设计同时覆盖两个能力：

1. 初始化阶段进度可视化
2. 设置页区分本地缓冲状态与平台审计服务状态

约束如下：

- 继续沿用当前平台化主状态机，不新增新的大状态
- 不引入重型事件总线
- 不改变现有登录、初始化、审计上传主路径
- 优先保证状态真实，不做“猜测式”前端进度

## 3. 方案比较

### 3.1 初始化进度

#### 方案 1：主进程持有真实初始化阶段，渲染层轮询读取（采用）

- `main` 进程在真实执行 `bootstrap -> models -> skills` 时更新当前阶段
- `renderer` 初始化页轮询主进程当前阶段并展示 4 段式进度

优点：

- 进度与真实执行顺序一致
- 网络慢、后端慢、局部失败时不会误导用户
- 后续要补初始化耗时、失败统计也容易扩展

缺点：

- 需要新增一个很小的初始化状态共享面

#### 方案 2：渲染层本地推演阶段（不采用）

- 登录后前端自己切阶段

不采用原因：

- 状态不真实
- 慢请求和失败请求下容易造成错误引导

#### 方案 3：主进程事件推送阶段（不采用）

- `main` 主动向 `renderer` 推送初始化阶段变更

不采用原因：

- 当前这一步改造过重
- 相比轮询没有明显收益

### 3.2 设置页审计状态

#### 方案 A：一个总状态 + 两个子状态（采用）

设置页展示：

- 总状态
- 本地缓冲状态
- 平台审计服务状态

采用原因：

- 用户能直接分辨问题落点
- 改动面可控
- 不影响既有横幅与工作区主视图逻辑

#### 方案 B：只保留总状态，通过文案隐含区分（不采用）

不采用原因：

- 信息过于压缩
- 不利于排障

#### 方案 C：总状态 + 彩色告警卡片（本次不采用）

不采用原因：

- 展示层改动偏大
- 当前阶段更应优先保证状态清晰，而不是强化视觉层

## 4. 初始化进度设计

### 4.1 4 段式进度

用户已确认采用 4 段式初始化进度：

1. 登录完成
2. 平台上下文
3. 模型配置
4. Skill 清单

说明：

- “登录完成”代表已经拿到 access token / refresh token
- “平台上下文”对应 `bootstrap`
- “模型配置”对应平台模型拉取与默认模型校验
- “Skill 清单”对应平台 Skill 清单拉取

### 4.2 内部状态模型

新增一个主进程初始化状态对象：

```ts
interface WorkspaceInitStatus {
  phase:
    | "idle"
    | "login-complete"
    | "bootstrap"
    | "models"
    | "skills"
    | "completed"
    | "failed";
  lastError: string | null;
}
```

规则：

- `idle`：尚未开始
- `login-complete`：登录成功，尚未开始在线初始化
- `bootstrap`：正在拉取平台上下文
- `models`：正在拉取模型并校验默认模型
- `skills`：正在拉取 Skill 清单
- `completed`：初始化完成
- `failed`：初始化失败

### 4.3 阶段推进规则

主进程真实执行顺序如下：

1. 登录成功后置为 `login-complete`
2. 开始拉 `bootstrap` 前置为 `bootstrap`
3. `bootstrap` 成功后置为 `models`
4. 模型拉取成功且默认模型校验通过后置为 `skills`
5. Skill 清单成功后置为 `completed`
6. 任一阶段失败：
   - 置为 `failed`
   - 写入 `lastError`
   - 保留失败前正在执行的阶段，供前端显示“失败发生在哪一段”

### 4.4 初始化页展示规则

初始化页显示 4 段式进度，每段具备三种语义：

- 未开始
- 进行中
- 已完成

失败时：

- 进度停留在失败阶段
- 继续显示现有的“分层错误提示 + 原始错误”
- 分层错误提示仍基于错误文本做最小分类，但若能读到主进程当前阶段，应优先以阶段为准

### 4.5 与当前错误提示的关系

当前已经存在：

- 平台上下文错误提示
- 模型配置错误提示
- Skill 清单错误提示
- 通用初始化错误提示

本次不会替换这套提示，只是在其上补一个更稳定的“阶段可视化”。

## 5. 审计状态拆分设计

### 5.1 现有问题

当前 `AuditStatus` 主要表达总状态，不足以区分：

- 本地队列是否正在缓冲或积压
- 平台 `/api/audit/health` 是否可达

### 5.2 新的数据模型

在现有总状态上补两个子状态：

```ts
type AuditHealth = "healthy" | "degraded" | "buffering" | "reauth-required";

interface AuditStatus {
  health: AuditHealth;
  localHealth: AuditHealth;
  remoteHealth: AuditHealth;
  queuedEvents: number;
  droppedEvents: number;
  lastError: string | null;
}
```

含义：

- `health`：最终聚合给工作区和横幅的总状态
- `localHealth`：本地队列/补传状态
- `remoteHealth`：平台审计服务探测状态

### 5.3 聚合规则

聚合优先级如下：

1. 若 `localHealth` 或 `remoteHealth` 任一为 `reauth-required`，则 `health = reauth-required`
2. 否则若 `localHealth = buffering`，则 `health = buffering`
3. 否则若 `localHealth` 或 `remoteHealth` 任一为 `degraded`，则 `health = degraded`
4. 否则 `health = healthy`

这样可以保证：

- 登录失效优先级最高
- 本地正在积压待补传时，优先显示“缓冲中”
- 远端不可达但本地尚未积压时，显示“已降级”

### 5.4 远端健康探测规则

主进程在获取工作区审计状态时：

1. 先读取本地状态
2. 再请求 `/api/audit/health`
3. 合并为完整 `AuditStatus`

远端规则：

- 请求成功：`remoteHealth = healthy`
- 请求返回 `401/403`：`remoteHealth = reauth-required`
- 其他失败：`remoteHealth = degraded`

本地规则保持不变：

- 本地队列正常：`localHealth = healthy`
- 本地上传失败但可继续缓冲：`localHealth = buffering`
- 本地登录失效：`localHealth = reauth-required`

## 6. 设置页展示设计

设置页中审计状态区域改为三层：

1. 总状态
2. 本地缓冲状态
3. 平台审计服务状态

推荐文案：

- 总状态：正常 / 已降级 / 缓冲中 / 需要重新登录
- 本地缓冲状态：正常 / 缓冲中 / 需要重新登录
- 平台审计服务状态：正常 / 不可达 / 需要重新登录

继续保留：

- `queuedEvents`
- `droppedEvents`
- `lastError`

这样设置页既能表达业务结论，也能表达原因分层。

## 7. 数据流

### 7.1 初始化进度流

1. 登录成功
2. 主进程将初始化状态置为 `login-complete`
3. 渲染层进入 `initializing`
4. 主进程执行 `bootstrap -> models -> skills`
5. 每进入新阶段即更新共享初始化状态
6. 渲染层轮询读取当前初始化状态并更新 UI
7. 成功进入工作区或失败停留初始化页

### 7.2 审计状态流

1. 渲染层继续通过既有 `getAuditStatus()` 轮询
2. 主进程读取本地审计状态
3. 主进程探测远端 `/api/audit/health`
4. 主进程返回总状态 + 子状态
5. 设置页与工作区根据总状态展示，设置页额外显示子状态

## 8. 错误处理

### 8.1 初始化阶段

- 若阶段状态读取失败，不阻断初始化主流程
- 初始化页可回退到仅显示当前主标题与错误提示
- 真实初始化失败仍以 `initializeWorkspace()` 返回错误为准

### 8.2 审计状态

- 远端探测失败不应阻断聊天
- 远端 `401/403` 仍然要把状态提升为 `reauth-required`
- 本地 `buffering` 时不能因为远端也失败就降成更低优先级的 `degraded`

## 9. 测试策略

至少覆盖以下测试：

### 9.1 运行时测试

- 初始化阶段按 `login-complete -> bootstrap -> models -> skills -> completed` 推进
- `bootstrap` 失败时，阶段停留在平台上下文
- `models` 失败时，阶段停留在模型配置
- `skills` 失败时，阶段停留在 Skill 清单
- 远端审计 `503` 时：
  - `remoteHealth = degraded`
  - 总状态按规则聚合
- 本地 `buffering` + 远端 `degraded` 时：
  - 总状态仍为 `buffering`

### 9.2 渲染层测试

- 初始化页能显示 4 段式进度
- 初始化失败时能正确高亮失败阶段
- 设置页能同时显示总状态、本地缓冲状态、平台审计服务状态
- 中英文文案都能正确渲染

## 10. 范围外

本次明确不做：

- 初始化进度动画
- 初始化耗时统计
- 审计健康历史趋势图
- 审计多维监控面板
- 服务端返回更细粒度健康结构
