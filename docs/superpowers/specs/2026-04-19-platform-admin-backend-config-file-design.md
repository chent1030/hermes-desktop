# Platform Admin Backend Config File Design

## Goal

让 `platform-admin/backend` 支持从单个配置文件读取核心启动配置，并保留 `ADMIN_*` 环境变量覆盖能力。

## Scope

本次仅覆盖当前已存在的四个启动配置项：

- `server.host`
- `server.port`
- `database.url`
- `security.session_salt`

不引入多环境配置体系，不引入复杂配置中心。

## Chosen Approach

采用 `TOML` 单文件配置 + 环境变量覆盖：

1. 默认读取 `platform-admin/backend/config/application.toml`
2. 若文件不存在，则回退到当前内置默认值
3. 若存在 `ADMIN_*` 环境变量，则覆盖文件中的对应配置

## Config Shape

```toml
[server]
host = "0.0.0.0"
port = 8080

[database]
url = "postgres://postgres:postgres@localhost:5432/manager_admin"

[security]
session_salt = "platform-admin-dev-salt"
```

## Implementation Notes

- `AppConfig::from_env()` 调整为统一加载入口，内部按“默认值 -> 配置文件 -> 环境变量”顺序合并
- 增加 `toml` 依赖，使用 `serde` 反序列化配置文件
- 为测试提供可注入的文件路径加载函数，避免测试依赖真实工作目录
- 新增：
  - `platform-admin/backend/config/application.toml`
  - `platform-admin/backend/config/application.example.toml`
- 更新 `platform-admin/README.md` 说明配置文件使用方式

## Validation

需要覆盖以下测试：

1. 读取不存在配置文件时回退默认值
2. 能从 `application.toml` 正确加载配置
3. 环境变量能覆盖文件中的值
4. 非法端口仍返回明确错误

