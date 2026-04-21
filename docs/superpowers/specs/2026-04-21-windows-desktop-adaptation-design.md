# Windows Desktop Adaptation Design

## 1. Goal

为 `hermes-desktop` 增加 `Windows x64` 内部测试版适配能力，要求在 Windows 机器上原生构建与打包，并尽量做到“安装后直接可用”。

本次目标产物为：

- `Windows x64` 安装包
- 可用于内部测试人员安装与运行
- 不要求代码签名
- 不要求正式对外发布能力

## 2. Scope

本次设计只覆盖桌面端，不包含 `platform-admin` 前后端的 Windows 部署或运维方案。

本次必须覆盖的桌面主链路包括：

- 应用安装与启动
- 登录
- 在线初始化
- 聊天
- 模型切换
- 技能展示与下载
- 审计上传
- 正常退出与再次启动

## 3. Non-Goals

本次明确不纳入首发硬要求：

- Windows 代码签名
- 自动更新上线
- 杀软误报治理
- 企业级集中部署策略
- `platform-admin` 在 Windows 上的一键部署
- `Windows arm64` 支持

## 4. Current State

当前工程已经具备跨平台 Electron 基础，但 Windows 发布链路尚未成型，主要体现在：

- 已存在 `build:win` 脚本，但缺少完整的 Windows 发布物结构设计
- 主进程仍有明显的 macOS 特化分支
- 打包后处理逻辑目前只照顾 `darwin`
- 运行时大量依赖本地路径、子进程与环境变量，Windows 风险集中在主进程与 Hermes 运行时层

## 5. Chosen Approach

采用“分层适配、逐层封口”的方案，而不是边测边补的零散修补方式。

总体拆分为四层：

1. `发布层`
   - 安装包
   - 资源布局
   - 首次启动初始化
2. `主进程层`
   - 窗口创建
   - 系统集成
   - 平台分支收口
3. `运行时层`
   - Hermes 可执行入口
   - 路径管理
   - 环境变量与子进程
4. `体验层`
   - Windows 图标、标题栏、错误提示、安装后体验

这样做的原因：

- 当前真正复杂的是运行时与打包，不是页面本身
- 若不先固定资源布局与路径策略，后续会反复返工
- 内部测试版仍然需要稳定的安装、启动与主链路体验

## 6. Packaging Strategy

### 6.1 Installer Format

首发采用两类产物：

- `NSIS installer`：提供给内部测试人员安装
- `win-unpacked`：用于调试“安装器问题”和“应用本体问题”

推荐主交付物为 `NSIS installer`。

### 6.2 Runtime Bundling

Windows 首发不依赖测试人员手动安装 Python、Git 或其他关键运行时。

安装包应尽量内置桌面端所需的最小运行时资源，至少包括：

- Electron 主程序
- Hermes 运行所需的 Python 运行时
- Hermes CLI 所需脚本、模板与必要资源

### 6.3 Runtime Layout

推荐将安装包内容拆成两类目录：

- 安装目录：只读应用程序与只读 runtime 模板
- 用户目录：可写配置、日志、缓存、运行态数据

建议的资源布局：

- `app.asar`：Electron 主程序与前端资源
- `resources/runtime/python`：Windows Python runtime
- `resources/runtime/hermes`：Hermes 所需静态资源与模板

### 6.4 First-Run Initialization

首次启动时：

1. 检查用户目录下是否已存在可写运行区
2. 若不存在，则从安装目录中的只读 runtime 模板复制到用户目录
3. 后续运行全部基于用户目录，不直接修改安装目录

这样可以避免：

- Windows 安装目录写权限问题
- 应用升级时覆盖用户运行态文件
- 配置、缓存、日志与程序文件混在一起

## 7. Main Process Design

### 7.1 Platform Adapter

将零散的 `process.platform` 分支收口为统一的 Windows 平台适配层，避免窗口、通知、图标、菜单与系统行为散落在业务代码中。

适配层至少负责：

- 窗口创建参数
- 平台图标与资源定位
- 外链打开
- 通知行为
- 菜单与单实例行为
- 未来自动更新与签名所需的 Windows 特化配置预留

### 7.2 Window Policy

首发 Windows 版优先稳定，不追求复杂的自定义无边框体验。

窗口策略：

- macOS 保留现有风格
- Windows 首发使用稳定、标准的窗口参数
- 第一阶段不引入重度透明、毛玻璃或复杂拖拽方案

### 7.3 System Integration

以下能力需要逐项验证并适配：

- `AppUserModelId`
- `Notification`
- `shell.openExternal`
- 应用退出与再次启动
- 安装后的任务栏与快捷方式体验

## 8. Path and Filesystem Design

### 8.1 Unified Path Service

Windows 版必须引入统一路径服务层，屏蔽业务代码中的平台差异。该服务至少提供：

- 安装资源目录
- 用户数据目录
- 日志目录
- Hermes 工作目录
- 临时目录

### 8.2 Path Rules

遵循以下规则：

- 业务代码不得直接手写 Windows 路径
- 业务代码不得依赖 Unix 风格目录结构
- 所有可写配置与运行态数据都落在用户目录
- 所有模板和静态只读资源都从安装目录读取

## 9. Runtime Process Design

### 9.1 Process Runner

Windows 适配的核心在运行时进程管理。应引入统一的 `process runner` 抽象，负责：

- 可执行文件定位
- 参数拼装
- 环境变量注入
- stdout/stderr 收集
- 退出码处理
- 错误翻译

### 9.2 Execution Policy

进程调用应遵循以下原则：

- 优先直接 `spawn(executable, args, { shell: false })`
- 避免依赖 shell 字符串拼接
- 所有运行入口使用“明确二进制路径 + 参数数组”模式
- 显式处理带空格路径与 `.exe` 可执行文件名

### 9.3 Error Surfacing

Windows 用户看到的错误应区分为两类：

- 本地环境问题
  - 运行时缺失
  - 资源复制失败
  - 端口占用
  - 子进程启动失败
- 平台服务问题
  - 登录失败
  - 初始化失败
  - 审计上传失败

错误提示需要能够明确区分这两类问题，减少排查成本。

## 10. UX Policy for Windows First Release

Windows 首发体验遵循“稳定优先”的原则：

- 不追求与 macOS 完全一致的视觉样式
- 保证图标、标题栏、打开速度、错误提示清晰
- 优先让测试人员能稳定安装、登录并完成主链路验证

首发重点包括：

- 安装后能直接启动
- 登录页与工作区界面可正常显示
- 子进程失败时用户能看懂原因
- 不因路径、权限或资源初始化导致白屏或静默失败

## 11. Validation Strategy

Windows 适配验收分为三层。

### 11.1 Build Validation

必须验证：

- Windows 机器上可以执行 `npm install`
- 可以执行 Electron 构建
- 可以产出 `win-unpacked`
- 可以产出 `NSIS installer`
- 安装包内包含预期 runtime 资源

### 11.2 Install Validation

必须验证：

- 干净环境下可以安装
- 首次启动不会因目录权限失败
- 首次启动会正确初始化用户运行目录
- 卸载不会误删关键用户数据
- 重装不会导致 runtime 状态损坏

### 11.3 Runtime Validation

必须验证：

- 应用能打开并显示登录页
- 登录成功
- 在线初始化成功
- 模型列表可见
- 聊天有回复
- 技能页可展示与下载
- 审计状态正常，异常时提示正确
- 退出后再次启动仍符合预期

## 12. Testing Strategy

### 12.1 Automated Tests

至少补三类测试：

- 路径解析与 runtime 定位的 Node 单测
- 平台分支逻辑单测
- 打包后资源布局检查

### 12.2 Manual QA Checklist

必须维护 Windows 手工验收清单，覆盖：

- 首次安装
- 首次启动
- 登录与聊天
- 技能下载
- 审计链路
- 卸载与重装

## 13. Delivery Phases

推荐实施顺序如下：

### Phase 1: Windows 发布结构定稿

- 明确 `electron-builder` 的 Windows 配置
- 明确 `resources/runtime` 布局
- 明确用户目录与运行目录结构

### Phase 2: 路径与运行时抽象

- 收口安装目录、用户目录、日志目录、runtime 目录
- 收口 Hermes 与其他子进程入口

### Phase 3: 主进程平台适配

- 调整窗口参数
- 处理图标、通知、菜单、外链与单实例行为
- 完成 Windows 首次启动策略接入

### Phase 4: 打包与验收

- 输出 `win-unpacked` 与 `NSIS installer`
- 补路径与资源检查测试
- 跑 Windows 手工验收清单

## 14. Success Criteria

当以下条件同时满足时，本次 Windows 首发设计视为达成：

- 可以在 Windows 机器上原生构建 `Windows x64` 内部测试包
- 安装包尽量自带必需运行时
- 测试人员安装后可直接启动并进入桌面端主链路
- 登录、初始化、聊天、技能、审计链路均可运行
- 不依赖代码签名与自动更新即可完成内部测试闭环
