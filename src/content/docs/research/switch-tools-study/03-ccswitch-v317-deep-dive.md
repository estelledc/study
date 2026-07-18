---
title: "03. CC Switch v3.17 深潜：把数据库事实投影到七类客户端"
sidebar:
  hidden: true
---
# 03. CC Switch v3.17 深潜：把数据库事实投影到七类客户端

固定版本：`f6e37ed99443890a865669e28bf1caf5e85d466d`。

## 1. 核心直觉

CC Switch 像一个“多格式通讯录 + 翻译转接台”：

- SQLite 保存 provider、MCP、Skill、设置等内部事实；
- 每个客户端只认识自己的 JSON、TOML、YAML 或 `.env`；
- 普通切换把数据库中的目标配置写到 live 文件；
- proxy 接管让客户端固定连接本地服务，provider 在服务内部热切换；
- 用户直接改 live 文件时，部分路径还会反向回填数据库。

因此这里最重要的概念是 **projection + reconciliation**：

```text
SQLite provider
  -> merge shared config
  -> project to live files
  -> client consumes

manual live edit
  -> backfill current provider
  -> update SQLite snapshot
```

## 2. 三层状态，不是一份配置

### 2.1 Provider 正文

主要 SSOT 是 `~/.cc-switch/cc-switch.db` 的 `providers` 表：

- provider id/name/type；
- `settings_config` JSON；
-排序和当前标记；
-客户端类别。

证据：

- [`database/schema.rs:25-43`](../repos/ccswitch/src-tauri/src/database/schema.rs#L25-L43)
- [`database/dao/providers.rs:20-108`](../repos/ccswitch/src-tauri/src/database/dao/providers.rs#L20-L108)
- [`provider.rs:7-44`](../repos/ccswitch/src-tauri/src/provider.rs#L7-L44)

### 2.2 当前 provider 指针

当前 provider 是刻意设计的双层状态：

1. 设备级 `~/.cc-switch/settings.json` 优先；
2. SQLite `providers.is_current` 作为 fallback 和新设备默认值。

对账规则见
[`settings.rs:932-999`](../repos/ccswitch/src-tauri/src/settings.rs#L932-L999)。

这让云同步可以同步 provider 数据，同时保留每台设备自己的当前选择；代价是每次导入、失败和迁移都要考虑两个位置是否收敛。

### 2.3 客户端 live 文件

live 文件是运行时投影：

| 客户端 | 主要目标 |
|---|---|
| Claude Code | `settings.json` |
| Codex | `auth.json`、`config.toml`、model catalog |
| Gemini CLI | `.env`、`settings.json` |
| OpenCode | `opencode.json.provider` |
| Hermes | YAML 配置 |
| Claude Desktop | 固定 CC Switch profile 与 deployment metadata |

live 文件允许用户手改，因此不是纯只读副本。系统必须明确何时反向 backfill，何时坚持数据库为准。

## 3. 普通 provider 切换的 13 步链路

### Step 1：用户点击卡片主按钮

[`ProviderActions.tsx:97-120,270-280`](../repos/ccswitch/src/components/providers/ProviderActions.tsx#L97-L120)
根据客户端模式决定“切换”还是“添加到配置”。OpenCode 的普通 provider 是累加语义，不一定存在单一 current。

### Step 2：卡片把完整 Provider 交给 hook

卡片只在前端传对象；真正跨 IPC 时不会把完整配置发送给 Rust。

### Step 3：前端做策略检查

[`useProviderActions.ts:155-263`](../repos/ccswitch/src/hooks/useProviderActions.ts#L155-L263)
判断：

- 是否需要本地 routing；
- 官方 provider 是否允许在接管模式切换；
- 当前客户端是独占还是累加；
- 特殊 OMO/OpenCode 语义。

### Step 4：React Query mutation

[`mutations.ts:263-315`](../repos/ccswitch/src/lib/query/mutations.ts#L263-L315)
负责调用、错误和缓存失效。

### Step 5：Tauri IPC 只传 app + id

[`api/providers.ts:90-92`](../repos/ccswitch/src/lib/api/providers.ts#L90-L92)：

```ts
invoke("switch_provider", { id, app: appId })
```

这很重要：Rust 以后端 SQLite 为准，前端不能携带一份可能过期或被篡改的完整 provider 配置。

### Step 6：Command 解析 AppType

[`commands/provider.rs:85-109`](../repos/ccswitch/src-tauri/src/commands/provider.rs#L85-L109)
只做边界解析，然后委托 `ProviderService::switch`。

### Step 7：Service 从 SQLite 重新加载目标

[`services/provider/mod.rs:2491-2508`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2491-L2508)
验证目标 id 属于当前 app。

### Step 8：按 app 取得锁并判断接管模式

Claude、Codex、Gemini 使用每 app 独立锁。若存在 `proxy_live_backup` 或 live 占位符，进入 hot switch；否则进入普通切换。

证据：

- [`proxy/switch_lock.rs:1-40`](../repos/ccswitch/src-tauri/src/proxy/switch_lock.rs#L1-L40)
- [`services/provider/mod.rs:2526-2589`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2526-L2589)

### Step 9：切走前回填旧 provider

[`services/provider/mod.rs:2624-2665`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2624-L2665)
读取当前 live 文件：

1. 对显式启用 shared config、且共享片段未被用户清空的 Claude/Codex provider，提取可共享字段；
2. 从 provider 快照中剥离共享字段；
3. 保存旧 provider 的最新独有配置。

Gemini 等其他客户端当前不走这条自动提取路径。这套回填使已覆盖客户端内的合法修改不会在切换时静默丢失。

### Step 10：持久化当前 provider

先写设备级 `settings.json`，再更新 SQLite current 标记：

- [`services/provider/mod.rs:2668-2675`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2668-L2675)
- [`database/dao/providers.rs:290-309`](../repos/ccswitch/src-tauri/src/database/dao/providers.rs#L290-L309)

SQLite 内部的“清旧 current + 设新 current”在一个 transaction 中。

### Step 11：合并 shared config

[`services/provider/live.rs:659-709`](../repos/ccswitch/src-tauri/src/services/provider/live.rs#L659-L709)
从 SQLite `settings` 表读取 `common_config_<app>`：

- Claude/Gemini：递归 JSON merge；
- Codex：TOML table merge；
- 冲突叶子由 shared snippet 覆盖。

### Step 12：写客户端 live 文件

[`services/provider/live.rs:997-1145`](../repos/ccswitch/src-tauri/src/services/provider/live.rs#L997-L1145)
按客户端进入不同 writer。

### Step 13：同步 MCP 并刷新前端缓存

MCP 同步失败只记录 warning，不让 provider 切换整体失败。前端使 provider、托盘和相关 live 状态缓存失效并重查。

## 4. 普通投影与 proxy 接管是两种架构

### 4.1 普通投影

```text
SQLite provider A
  -> write real endpoint/key to client live config
  -> client restart/reload
  -> request goes directly to provider A
```

特点：

- 数据面不经过 CC Switch；
- 某些客户端切换后要重启；
- 本地 proxy 停止也不影响直连；
- live 文件暴露真实 provider 配置。

### 4.2 Proxy 接管

```text
client live config
  -> fixed local proxy endpoint
  -> CC Switch chooses active provider
  -> protocol adapter/failover
  -> upstream
```

特点：

- provider 可以热切换；
- 支持请求日志、用量、故障转移和熔断器；
- 原始 live 配置先存到 `proxy_live_backup`；
- 当前 provider 改变时更新恢复备份和 proxy-safe 字段，不把真实 endpoint 写回 client；
- 停止接管时恢复原配置。

proxy service 运行在 Tauri 进程内，因此不需要像 CSSwitch 那样证明外部 gateway PID；但它仍要证明 live 文件是否由 proxy 接管，而不能只看“server 当前是否 running”。

## 5. Shared config 解决什么

假设 provider A 和 B 都需要相同的：

- hooks；
- plugins；
-主题；
-非敏感环境变量；
-通用客户端行为。

如果每个 provider 各存一份，用户在 A 中修改后切到 B 会“消失”。Shared config 把这些公共字段独立保存，再与目标 provider 合并。

安全边界：

- key、token、model、endpoint 不应进入共享片段；
- Codex `model_providers`、MCP 和 CC Switch 注入字段会被剥离；
-切走时只有部分客户端自动重新提取；
- shared merge 失败通常 warning 后继续，优先保证可切换。

实现区域：

- 合并：[`live.rs:530-687`](../repos/ccswitch/src-tauri/src/services/provider/live.rs#L530-L687)
- 提取：[`provider/mod.rs:2889-3228`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs#L2889-L3228)

## 6. 原子写不等于整体事务

### 已有保护

- JSON/TOML 使用同目录临时文件、flush、rename；Unix 可直接覆盖，Windows 会先删除旧目标再 rename，存在目标短暂缺失的窗口：
  [`config.rs:273-351`](../repos/ccswitch/src-tauri/src/config.rs#L273-L351)
- Codex 写第二个文件失败会恢复旧 `auth.json`：
  [`codex_config.rs:210-258`](../repos/ccswitch/src-tauri/src/codex_config.rs#L210-L258)
- SQLite current 标记在 transaction 中更新。
- Claude Desktop 多文件操作有 snapshot rollback。
- 接管模式把原配置放入 SQLite backup。

### 仍存在的边界

普通独占切换的调用顺序是：

```text
settings current
  -> SQLite current
  -> write live files
```

如果 live 写入失败，前两步可能已经成功。仓库测试也允许“当前 ID 已更新、live 仍旧”的状态：
[`provider_commands.rs:544-589`](../repos/ccswitch/src-tauri/tests/provider_commands.rs#L544-L589)。

这是**高置信度推导**：

- 每个写入动作可以各自原子；
- 整组动作没有统一 transaction 或 compensation coordinator；
- 因此整体仍可能部分成功；
- 成功重试、再次成功切换，或显式导入/同步后的 `sync_current_to_live` 可以恢复收敛；普通应用启动没有证明会自动修复这类分裂。

同样，Gemini 的 `.env`、`settings.json` 和认证标记是多次独立写，也没有跨文件总事务。

## 7. 客户端分叉为什么会膨胀

| 客户端 | 特殊语义 |
|---|---|
| Claude Code | `settings.json`，支持热重读；shared config 最成熟 |
| Codex | `auth.json` + TOML + model catalog；还要处理官方 OAuth 保留 |
| Gemini | `.env` + JSON；每次请求可重读部分配置 |
| OpenCode | provider 累加，不是普通独占切换 |
| OpenClaw | 有自己的 provider 和 workspace 结构 |
| Hermes | YAML、MCP、会话等独立格式 |
| Claude Desktop | 第三方 provider 主要通过本地 proxy 和专用 profile |

每增加一个客户端，至少要增加：

- 领域映射；
- live reader/writer；
- backfill 规则；
-凭证剥离；
-迁移；
-测试；
- UI 分支。

这也是 CC Switch 约 24.5 万行 Rust/TS/TSX，而 CSSwitch 约 6 万行 Rust/JS/Python 的主要原因之一。行数只说明维护面，不说明质量高低。

## 8. 安全与状态风险

### 8.1 凭证面更宽

CC Switch 的目标就是协调真实客户端状态，因此会接触：

- provider key；
- live 配置；
-部分官方 OAuth/Keychain；
-同步和备份；
-用量查询凭证。

这与 CSSwitch “第三方模式不读真实 Claude 登录”是不同威胁模型。

### 8.2 Loopback 不是统一认证

proxy 默认 `127.0.0.1`，但 listen address 可配置。通用 Claude/Codex 路由没有统一 local auth，Claude Desktop namespace 有 Bearer 校验。

因此：

- 强制 loopback 可以把风险限制在本机；
- 如果允许非 loopback，必须重新设计标准认证和访问控制；
- “本机服务”不能默认等同于“只有可信进程可调用”。

### 8.3 原子写的耐久性边界

通用 `atomic_write` 使用 flush + rename，但没有目录 `fsync`，也没有在该函数内完整拒绝 symlink。它主要防常规半写，不等同于断电级事务或路径攻击防护。

## 9. 最值得精读的六个文件

1. [`ProviderActions.tsx`](../repos/ccswitch/src/components/providers/ProviderActions.tsx)
   不同客户端的按钮语义。
2. [`useProviderActions.ts`](../repos/ccswitch/src/hooks/useProviderActions.ts)
   前端切换策略。
3. [`api/providers.ts`](../repos/ccswitch/src/lib/api/providers.ts)
   IPC 最小边界。
4. [`commands/provider.rs`](../repos/ccswitch/src-tauri/src/commands/provider.rs)
   command 到 service 的边界。
5. [`services/provider/mod.rs`](../repos/ccswitch/src-tauri/src/services/provider/mod.rs)
   切换、回填、锁和接管分叉。
6. [`services/provider/live.rs`](../repos/ccswitch/src-tauri/src/services/provider/live.rs)
   shared config 与各客户端投影。

想继续数据面，再读：

- [`proxy/providers/adapter.rs`](../repos/ccswitch/src-tauri/src/proxy/providers/adapter.rs)
- [`services/proxy.rs`](../repos/ccswitch/src-tauri/src/services/proxy.rs)
- [`proxy/server.rs`](../repos/ccswitch/src-tauri/src/proxy/server.rs)

## 10. 本轮没有证明什么

- 当前发布包与固定提交完全一致；
-所有七类客户端的最新版本都兼容；
-任一真实 OAuth、Keychain 或 provider 可用；
- proxy 在非 loopback 配置下安全；
- CI 全绿等于桌面端真实工作流已验收。

本轮也没有运行测试；相关结论来自源码和仓库现有测试定义。

## 11. 思考点

1. 为什么 IPC 只传 `app + id`，比传完整 provider JSON 更符合 SSOT？
2. 设备级 current provider 和 SQLite `is_current` 分叉时，系统应如何决定权威并证明收敛？
3. Shared config 为什么不能简单地“把两个 JSON 深合并完事”？
4. 普通切换和 proxy hot switch 的重启、恢复和可观测性有什么本质差异？
5. 开放设计题：如果要给普通切换补一个跨 settings/SQLite/live 的事务，你会怎样组合 durable journal、调用内补偿和显式 reconcile？分别覆盖哪个失败窗口？
