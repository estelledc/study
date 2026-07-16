# 01. 领域广度地图：从改配置到本地控制面

## 1. 用“铁路调度”建立直觉

把 AI 客户端想成火车，把模型 provider 想成不同目的地：

- **配置切换器**负责改道岔：下一班车启动时走哪条轨道。
- **本地 gateway**是中转站：火车始终开到同一个站，再由站内实时分流。
- **控制面**是调度中心：保存线路、切换规则、健康状态、故障转移和成本。
- **宿主 runtime bridge**不只调度，还管理车站本身什么时候启动、使用哪套隔离设施。

类比的边界是：真实系统还涉及凭证、协议格式、进程身份和持久化，一次错误切换可能不是“走错路”，而是覆盖登录态或用户配置。

## 2. 四类产品层

| 层级 | 核心动作 | 生效时机 | 代表项目 | 主要风险 |
|---|---|---|---|---|
| Profile launcher | 为一次启动注入环境变量或参数 | 新进程启动 | Clother | 启动参数与 session 不兼容 |
| Config control plane | 把选中配置投影到多个客户端文件 | 客户端重读配置 | CC Switch、Codex Mate | 数据库与 live 文件失配 |
| Local gateway/router | 客户端固定连本地端点，由 gateway 实时路由 | 可热切换 | Claude Code Router、CLIProxyAPI、CC Switch proxy | 协议转换、认证、故障转移 |
| Host runtime bridge | 管理 gateway，同时选择、隔离、启动并证明宿主进程身份 | runtime 生命周期 | CSSwitch | 真实账号边界、误认进程、半启动 |

这些层可以组合。CC Switch 同时覆盖第二、三层；CSSwitch 同时覆盖第三、四层。

## 3. 这个领域真正解决的九个问题

### 3.1 配置建模

不同客户端读取 JSON、TOML、YAML、`.env`，字段语义也不同。系统必须先把“provider”抽象成自己的领域模型，再生成客户端需要的格式。

关键词：

- **Provider profile**：一套 endpoint、key、model 和行为选项。
- **Projection**：把内部模型写成外部客户端文件。
- **Backfill**：从 live 文件反向读回用户手工修改。

### 3.2 Source of truth

必须明确哪个状态说了算：

- CC Switch 的 provider 正文主要在 SQLite。
- CSSwitch 的 profile 在自身 JSON，但 Science 项目、组织和 Skill 仍由 Science data-dir 拥有。

如果两个存储都能被写，却没有优先级和 reconcile（对账）规则，切换迟早会漂移。

### 3.3 切换原子性

“切换”通常包含：

1. 校验目标配置。
2. 保存当前状态。
3. 更新当前 provider 指针。
4. 写一个或多个 live 文件。
5. 重启或热更新运行时。
6. 失败时回滚。

单文件 `temp + rename` 只覆盖第 4 步中的一个文件，不自动覆盖整个序列。

### 3.4 协议适配

客户端可能说 Anthropic Messages，provider 只懂 OpenAI Chat 或 Responses。gateway 需要转换：

- 请求消息与工具定义；
- 流式 SSE 事件；
- tool call / tool result；
- thinking / reasoning；
- 模型目录和错误结构。

转换不是简单字段改名。工具调用顺序、流式增量和 provider 特例都会改变语义。

### 3.5 运行时所有权

控制外部进程时必须区分：

- 端口活着；
- 端口上的服务健康；
- 服务由当前程序启动；
- 服务对应预期 executable、data-dir 和本轮 launch。

CSSwitch 在这条轴上明显比普通配置切换器更深。

### 3.6 凭证与账号边界

provider key、OAuth、官方账号登录态不是一类东西。系统要回答：

- key 存哪里，权限是什么；
- 日志和 UI 返回什么；
- 是否读取 Keychain 或真实 HOME；
- 切第三方 provider 时是否覆盖官方登录；
- 本地服务是否有请求认证。

### 3.7 扩展管理

MCP、Prompts、Skills 也会遇到相同问题：内部 SSOT、外部投影、跨客户端同步、名称冲突、路径安全、卸载恢复。

### 3.8 可观测性

至少要能区分：

- 当前配置选中了谁；
- live 文件实际指向谁；
- gateway 实际把请求发给谁；
- 当前进程是不是受管实例；
- 失败发生在验证、持久化、启动、协议还是上游。

### 3.9 证据层级

测试通过的含义必须分层：

```text
source/unit
  -> loopback contract
  -> built artifact
  -> installed copy
  -> real runtime/provider
  -> signed/notarized public release
```

前一层不能自动替代后一层。

## 4. 两个主项目的位置

| 维度 | CSSwitch | CC Switch |
|---|---|---|
| 首要对象 | Claude Science | 七类 AI 编程客户端 |
| 控制面宽度 | 窄 | 宽 |
| runtime 深度 | 深：启动、复用、停止 Science | 中：代理主要在 Tauri 进程内 |
| 数据面 | Rust gateway | 直写配置或内置 proxy |
| 内部 SSOT | JSON profile/settings | SQLite provider/settings |
| live 状态 | 隔离 HOME + Science data-dir | 各客户端真实配置目录 |
| 最强能力 | 进程身份、隔离、fail-closed | 多客户端建模、协议和扩展广度 |
| 主要代价 | 控制流和安全合同复杂 | 兼容矩阵、迁移和状态对账复杂 |

## 5. 邻近项目速览

以下是 2026-07-16 通过 GitHub 公开搜索和仓库 README 得到的领域样本，不代表推荐安装。

| 项目 | 定位 | 与本研究的关系 |
|---|---|---|
| `jolehuit/clother` | 通过 `clother-*` launcher 为 Claude Code 选择 provider | 展示最小 profile launcher 可以有多轻 |
| `SakuraByteCore/codexmate` | CLI + Web UI，本地管理多 Agent 配置、会话、Skill 和任务 | 与 CC Switch 同属多客户端控制面，但产品更早期 |
| `musistudio/claude-code-router` | 稳定本地 endpoint + provider/model/routing/tool/account 控制面 | 更偏 gateway 与运行时路由策略 |
| `router-for-me/CLIProxyAPI` | 多协议、多 OAuth 账号的 API gateway 和 SDK | 更偏纯数据面与账号池 |
| `farion1231/cc-switch` | 配置投影、proxy、MCP/Skill/会话的一体化桌面控制面 | 本轮广度主样本 |
| `SuperJJ007/CSSwitch` | Claude Science 专用 gateway 与隔离 runtime bridge | 本轮深度主样本 |

公开快照：

- CC Switch：MIT，仓库创建于 2025-08，2026-07-16 查询约 117k stars。
- CSSwitch：MIT，仓库创建于 2026-07，2026-07-16 查询约 368 stars。

Stars 只能说明关注度，不能证明安全、兼容性或当前 artifact 质量。

## 6. 选型时先问什么

1. 只想让**下一次启动**使用另一套变量，还是需要**运行中热切换**？
2. 只管理一个客户端，还是必须统一多个 JSON/TOML/YAML 格式？
3. 是否要转换协议、工具调用和流式事件？
4. 是否会读取或改写官方 OAuth/Keychain/真实账号状态？
5. 是进程内服务，还是要管理外部 binary、端口和 data-dir？
6. 失败时必须整体回滚，还是允许部分成功后自愈？
7. 本地端口只绑定 loopback 是否足够，是否还需要认证？
8. 你需要的是源码测试通过，还是安装包、真机和发布附件证据？

## 7. 本章思考点

1. 为什么“修改客户端配置”和“让客户端永远连本地 gateway”会产生不同的重启要求？
2. 哪些场景只需要 profile launcher，不值得引入 SQLite、代理和桌面 UI？
3. Provider、MCP 和 Skill 为什么都会重复出现 SSOT、live 投影和回填问题？哪些状态仍必须由目标客户端拥有？
4. CSSwitch 为什么应被归为 host runtime bridge，而不只是 Anthropic API proxy？
