---
title: "04. 跨项目比较：状态、安全、扩展性与证据"
sidebar:
  hidden: true
---
# 04. 跨项目比较：状态、安全、扩展性与证据

## 1. 结论先行

CC Switch 是**广度平台**，CSSwitch 是**深度机制**：

- 想学多客户端领域建模、配置投影、协议 adapter、MCP/Skill 统一管理，看 CC Switch。
- 想学高风险运行时的所有权证明、隔离、fail-closed 和证据分层，看 CSSwitch。

两者的安全差异首先来自威胁模型，而不是谁“更认真”：

- CC Switch 防的是多客户端、多存储、多账号之间的**状态编排事故**。
- CSSwitch 防的是第三方推理接入 Science 时的**隔离边界突破和进程误认**。

## 2. 状态与安全合同

| 合同 | CC Switch | CSSwitch | 学习结论 |
|---|---|---|---|
| Provider SSOT | SQLite `providers` | JSON profile/settings | 数据结构复杂度决定存储，不必迷信某一种数据库 |
| 当前选择 | 设备 settings 优先，SQLite fallback | `active_id` 在 config | 双层状态要有明确对账规则 |
| 外部主数据 | 会读写真实客户端 live 文件 | Science data-dir 仍归 Science | 不要把“能写”误当成“应该成为所有者” |
| 凭证存储 | provider JSON 在 SQLite，类型多、同步面广 | 0600 JSON，UI/诊断只回掩码/存在性 | 两边都不是静态加密，最小回显仍关键 |
| 原子写 | temp + flush + rename；Windows 存在先删后换窗口 | `O_EXCL` + 0600 + 文件 `sync_all` + rename + symlink 拒绝，但配置写未同步父目录 | CSSwitch 的文件与路径合同更强；两边都未达到完整目录级断电耐久 |
| 事务 | SQLite transaction + 多处局部 rollback | profile validate-before-persist + gateway 补偿 | 局部事务不能自动覆盖整个业务动作 |
| 并发 | 数据库 Mutex + per-app switch lock | 全局生命周期串行器 + generation | 并发粒度应匹配可独立的资源边界 |
| Loopback | 默认 loopback，但地址可配置；认证不统一 | 强制 loopback + path secret | loopback 与 auth 是两道不同防线 |
| 进程身份 | proxy 在 Tauri 进程内 | gateway/Science 为外部进程，强身份 | 外部进程管理必须单独建立 ownership |
| 真实账号 | 主动协调真实客户端/OAuth 状态 | 第三方模式不读真实 Claude 登录 | 这是不可互相照搬的产品边界 |
| 失败策略 | 多处 warning 后继续并自愈 | 核心身份/隔离 fail-closed，可选 Skill 降级 | 先按损失分类，再决定阻断或降级 |

关键证据入口：

- CC Switch SSOT：[`database/schema.rs`](../repos/ccswitch/src-tauri/src/database/schema.rs)
- CC Switch current 对账：[`settings.rs:930-999`](../repos/ccswitch/src-tauri/src/settings.rs#L930-L999)
- CC Switch 原子写：[`config.rs:273-351`](../repos/ccswitch/src-tauri/src/config.rs#L273-L351)
- CSSwitch 配置写：[`config.rs:269-368`](../repos/csswitch/desktop/src-tauri/src/config.rs#L269-L368)
- CSSwitch runtime 身份：[`science.rs:554-723`](../repos/csswitch/desktop/src-tauri/src/runtime/science.rs#L554-L723)
- CSSwitch 架构所有权表：[`docs/architecture/overview.md`](../repos/csswitch/docs/architecture/overview.md)

### 2.1 为什么 loopback 不等于认证

`127.0.0.1` 解决的是“网络上哪些机器能连接”，没有回答“本机哪些进程能调用”。

```text
loopback:
  remote host -> blocked
  local process -> allowed

request auth:
  local process without secret -> blocked
  authorized local process -> allowed
```

CSSwitch 同时强制 loopback 和 path secret。CC Switch 默认 loopback，但通用路由没有统一认证；一旦开放非 loopback，风险会从“本机任意进程”扩到“网络可达者”。

### 2.2 为什么 health 不等于 ownership

CC Switch 的 proxy 在当前 Tauri 进程内，可以通过 handle/shutdown channel管理，不需要外部 PID 归属。

CSSwitch 管理独立 gateway 和 Science binary，必须额外证明：

- executable；
- data-dir；
- listener PID；
- port；
- launch ID/context；
- health。

这是组件拓扑带来的差异，不是为了“多写检查”。

## 3. 扩展性：广度和深度怎样交换复杂度

### 3.1 Provider catalog

CC Switch：

- 预设分布在 Claude/Codex/Gemini 等前端配置；
- `ProviderAdapter` 统一 endpoint、auth、请求和响应转换；
-能力规则仍散落在前端、模型表和 adapter 中。

CSSwitch：

- 11 个模板由 Rust backend 作为 SSOT；
-独立 capability catalog 包含 match、status、action、reason、evidence、tests；
- rule id 会进入运行诊断；
-但 catalog 的 MCP/Skill/Science 覆盖仍不完整。

结论：CC Switch 更容易横向加 provider/client，CSSwitch 更容易回答“为什么这条规则命中、证据是什么”。

### 3.2 协议适配

CC Switch 的接口式设计：

[`proxy/providers/adapter.rs:10-57`](../repos/ccswitch/src-tauri/src/proxy/providers/adapter.rs#L10-L57)

适合多 provider、多协议横向扩展，但特殊流式、历史消息和厂商规则仍会散到多个模块。

CSSwitch 的条件分派：

[`gateway/src/server.rs:604-705`](../repos/csswitch/desktop/gateway/src/server.rs#L604-L705)

在当前五类 gateway provider 下更直观，但若扩到七类客户端和更多双向协议，主分派会先变得难维护。

### 3.3 MCP 与 Skill

CC Switch 的目标是产品平台：

- 通用 MCP SSOT；
-多客户端投影；
- Skill 仓库发现、复制/软链、备份恢复和开关；
- Prompts 跨客户端同步。

CSSwitch 的目标是窄而强的供应链路径：

-准确公开 GitHub URL 或用户 picker 选择的 archive；
- HMAC、TTL、字段白名单、内容 hash；
- staging、路径安全、原子提交；
- active org 原生绑定；
- bundle 整包确认卸载；
-不写 Science 数据库。

不能用“CSSwitch 功能少”否定它，也不能用“路径检查更严”把它当成通用 Skill Manager。

### 3.4 DTO 边界

CC Switch 有明确的：

```text
React hook
  -> TS API facade
  -> Tauri command
  -> Rust service
  -> DAO
```

优点是层次清楚，代价是 TS/Rust 手写重复，固定提交中已能观察到字段形状漂移风险。

CSSwitch 的 command 面较小，前端仍依赖手写命名约定和通用 `call()`；仓库中存在更严格的 Skill DTO 代码，但当前没有进入 command 注册，不能把“代码存在”写成“产品已接入”。

共同改进方向是生成共享 schema，而不是继续靠人工保持两种语言一致。

## 4. 测试与发布证据

### 4.1 CC Switch

自动化优势：

- Vitest + MSW + Testing Library 覆盖组件、hooks 和前端 integration；
- Rust 模块测试与 command/service 集成测试；
-临时 HOME 隔离真实用户配置；
- Linux、Windows、macOS 跑 fmt、clippy、test；
- release workflow 覆盖多架构构建、macOS 签名、公证、Gatekeeper 和 stapler。

入口：

- [`.github/workflows/ci.yml`](../repos/ccswitch/.github/workflows/ci.yml)
- [`.github/workflows/release.yml`](../repos/ccswitch/.github/workflows/release.yml)
- [`tests/`](../repos/ccswitch/tests/)
- [`src-tauri/tests/`](../repos/ccswitch/src-tauri/tests/)

剩余风险：

-固定提交没有专用协议 golden 目录；
-桌面真实交互、安装包身份和跨客户端 E2E 不会被普通单测自动证明；
-自动 release 动作多，不等于每个结论都有独立、日期化证据。

### 4.2 CSSwitch

五层门禁：

| 层 | 内容 |
|---|---|
| offline | capability、catalog、process ownership |
| loopback | Rust gateway + 本地 mock/provider matrix |
| scripts | doctor、verify-proxy、运维合同 |
| rust | desktop、gateway、skill package 的 fmt/clippy/tests |
| frontend | `main.js` Node 语法 |

它还明确区分：

- `current-env clean`
- `release-ready green`
- artifact
- acceptance 安装
- real Science/provider
-签名、公证、Gatekeeper
-公开 release 附件

入口：

- [`docs/operations/testing.md`](../repos/csswitch/docs/operations/testing.md)
- [`test/run_all.sh`](../repos/csswitch/test/run_all.sh)
- [`test/golden/`](../repos/csswitch/test/golden/)
- [`test/provider_mock_scenarios.v1.json`](../repos/csswitch/test/provider_mock_scenarios.v1.json)
- [`docs/evidence/releases/v0.6.0.md`](../repos/csswitch/docs/evidence/releases/v0.6.0.md)

优势是协议 golden、provider 场景和负面发布事实可审计。短板是固定提交没有 GitHub workflow，前端门禁也只到语法检查。

### 4.3 一个容易混淆的结论

```text
CC Switch:
  CI/平台自动化更强

CSSwitch:
  证据分层和“没有证明什么”写得更强
```

前者提高持续回归覆盖，后者提高结论诚实度。成熟工程需要两者，不应二选一。

## 5. 可以互相借鉴什么

### CC Switch 可借鉴 CSSwitch

1. 强制 loopback 或为所有本地 route 统一认证。
2. 普通文件写增加 `O_EXCL`、文件 `sync_all` 和 symlink 拒绝；两边若要求 rename 的断电耐久，都还应补父目录同步。
3. 把“健康”和“身份/所有权”拆开。
4. 为 capability 规则绑定 reason、evidence、tests 和 runtime rule id。
5. 为普通切换建立跨 settings/SQLite/live 的 journal 或补偿事务。
6. 把 artifact、installed、live、signed release 分栏记录。

### CSSwitch 可借鉴 CC Switch

1. provider 数量和关系继续增长时，引入更结构化的数据库导入/迁移校验。
2. 从全局生命周期锁逐步拆到明确资源锁，但保留跨资源事务边界。
3. 用通用 adapter interface 减少 gateway provider 条件分派。
4. 提升前端 component/hook 测试和多平台 CI。
5. 采用生成式 TS/Rust DTO，减少手写协议漂移。

### 不能照搬

1. CC Switch 读取真实 Keychain/OAuth 和接管 live 配置，不能进入 CSSwitch 第三方隔离模式。
2. CC Switch 的 SQLite 不能成为 Science 项目、组织和 Skill 的新所有者。
3. CSSwitch 全局串行器不能原样用于七类客户端，否则不相关切换会互相阻塞。
4. CSSwitch path secret 只适合强制 loopback的本地单用户服务，不能替代网络服务的标准 auth。
5. CC Switch 的“warning 后继续”不能用于 CSSwitch 的进程身份、路径所有权和真实账号边界。

## 6. 每个项目最值得带走的五个模式

### CC Switch

1. **多客户端统一领域模型**：一个 provider 概念投影到七类客户端。
2. **Backend reload by id**：IPC 只传 id，Rust 从 SSOT 重取配置。
3. **Projection + backfill**：数据库与 live 配置双向对账。
4. **ProviderAdapter**：把 endpoint/auth/transform 从代理主流程抽离。
5. **Per-app lock**：可独立资源不必全局串行。

### CSSwitch

1. **Validate before persist**：scratch gateway 先验证候选。
2. **Strong runtime identity**：health、identity、ownership 分层。
3. **Owner-aware SSOT**：CSSwitch 不成为 Science 数据库第二写者。
4. **Evidence-bearing capability catalog**：规则、原因、动作、测试一起维护。
5. **Failure containment**：核心失败、可选降级、显式授权 fail-closed 分开。

## 7. 联合源码阅读路线

1. CSSwitch [`templates.rs:1-68`](../repos/csswitch/desktop/src-tauri/src/templates.rs#L1-L68)
   看窄 provider 模板如何成为后端 SSOT。
2. CC Switch [`app_config.rs:338-390`](../repos/ccswitch/src-tauri/src/app_config.rs#L338-L390)
   看七类客户端如何进入统一模型。
3. CSSwitch [`capability_catalog.rs:63-129`](../repos/csswitch/desktop/src-tauri/src/runtime/capability_catalog.rs#L63-L129)
   看规则如何携带证据。
4. CC Switch [`adapter.rs:10-57`](../repos/ccswitch/src-tauri/src/proxy/providers/adapter.rs#L10-L57)
   看通用协议 adapter。
5. 并读两个 server 分派，比较 interface 和条件分支。
6. CC Switch `services/provider/mod.rs`，追踪普通切换。
7. CSSwitch `runtime/profile_switch.rs`，追踪候选验证与提交。
8. CC Switch `services/skill.rs`，理解多客户端 Skill 平台。
9. CSSwitch `gateway/src/skill_install.rs`，理解窄范围供应链安全。
10. 对照两边测试/发布入口，写出每个结论实际证明到哪一层。

## 8. 综合思考题

1. 如果 CC Switch 引入 CSSwitch 式 capability catalog，哪些字段应驱动运行时，哪些只能作为证据说明？
2. CSSwitch 若扩到七类客户端，模板、gateway 分派、生命周期锁、Science 专属逻辑中哪一层最先需要重构？
3. Acme 新增 capability/auth 字段时，哪些事实会在 TS、Rust、preset、adapter 中重复，怎样识别 DTO 已经发生语义漂移？
4. 协议 golden 应冻结完整报文还是关键不变量？怎样避免上游版本更新造成脆弱测试？
5. CC Switch 的普通切换发生“current 已更新、live 写失败”时，下一次启动应如何确定修复方向？
6. 一个未知进程占用了预期端口，但返回正确 `/health`，什么附加证据才足以获得停止权限？
7. 哪些失败可以安全 warning，哪些失败继续执行会突破账号、进程或文件所有权？
8. “CI 全绿”和“release 可接受”之间，哪些结论必须来自 artifact、安装副本或真实环境？

建议回答格式：

```text
我的结论：
关键不变量：
源码证据：
反例：
仍需运行验证的部分：
```
