---
title: "05. Grok Build：Session Actor 纵向集成"
sidebar:
  hidden: true
---
# 05. Grok Build：Session Actor 纵向集成

## 一句话定位

Grok Build 像一座全天运行的调度中心：一个 `SessionActor` 同时接收用户 prompt、模型切换、MCP 事件、记忆定时器、后台任务完成和 UI 命令；真正的 Agent turn 是它启动的一项异步任务。

固定快照：`xai-org/grok-build@b189869`。

## 公开仓库边界

README 明确说明：

- 这是 `grok` CLI/TUI 与 agent runtime 的 Rust 源码；
- 从 SpaceXAI monorepo 定期同步；
- 不接受外部 PR；
- 根 `Cargo.toml` 是生成文件；
- 构建应优先指定 crate，不默认跑整个 workspace。

因此本章可以证明公开快照中的控制流，不能证明线上服务、未同步内部代码或所有部署配置。

## 产品入口

`xai-grok-pager-bin/src/main.rs` 是 composition root。它可以分流到：

- 全屏 TUI；
- headless；
- stdio Agent Client Protocol；
- leader；
- serve；
- workspace/session/plugin/MCP 等管理命令。

源码中的关键调用：

- `run_stdio_agent`
- `run_headless`
- `run_leader`

见 `xai-grok-pager-bin/src/main.rs:1159-1244`。

这说明 Grok Build 不是只有 TUI，核心 shell/runtime 可以被脚本、编辑器和其他进程复用。

## Crate 地图

| crate | 职责 | 类比 |
|---|---|---|
| `xai-grok-pager-bin` | 组合根与模式分流 | 总开关 |
| `xai-grok-pager` | 全屏 TUI | 控制台 |
| `xai-grok-shell` | session、agent、leader、headless、ACP | 调度中心 |
| `xai-grok-agent` | Agent 定义、prompt、tool bridge、plugins | 岗位配置器 |
| `xai-grok-sampler` | provider 请求、流收集、重试 | 通信站 |
| `xai-grok-tools` | 读写、bash、search、MCP、task 等工具 | 施工队 |
| `xai-grok-workspace` | 文件系统、VCS、执行、checkpoint | 工地环境 |
| `xai-chat-state` | conversation 与请求构建 | 活动档案 |
| `xai-grok-memory` | 长期 memory | 经验库 |

仓库中还能看到 Codex/OpenCode 工具实现的端口与第三方声明。这说明工具层在吸收不同 harness 的交互习惯，而不是只维护一套固定参数形状。

## 为什么用 Actor

### 核心循环

`run_session()` 使用 `tokio::select!`，同时监听：

- idle memory flush；
- dream check；
- model switch；
- chat state event；
- session notification；
- prompt task completion；
- session command。

源码：`xai-grok-shell/src/session/acp_session_impl/run_loop.rs:33-221`。

### Actor 的直觉

把一个 session 想成只允许一个值班员修改主档案：

- 其他模块可以发消息；
- 值班员按顺序处理；
- 长耗时工作另开 task；
- task 完成后再把结果送回 mailbox。

这减少了“多个异步回调同时改 session state”的共享可变状态竞态。

### Prompt 如何进入

收到 `SessionCommand::Prompt` 后：

1. 等待 prefix 准备好；
2. 标记是否是 synthetic prompt；
3. 更新用户输入 generation；
4. 调 `queue_input()`；
5. `send_now` 时可取消当前 turn；
6. `maybe_start_running_task()`。

源码：`run_loop.rs:281-304`。

mailbox 主循环不直接 await 完整模型运行，因此仍能响应取消、状态查询和其他事件。

## 一次 Agent turn

核心循环在：

`xai-grok-shell/src/session/acp_session_impl/turn.rs:1710-2305`

可以压缩成：

```text
prepare tool definitions

loop:
    drain interjections
    inject skill / monitor / memory / MCP reminders
    maybe compact
    resolve effective tools
    build request from chat state
    sample model

    record stream + usage + assistant items

    if no tool calls:
        maybe todo-gate continue
        maybe late-interjection continue
        validate structured output
        complete

    maybe intercept StructuredOutput
    execute tool batch
    handle permission/hook/cancel/follow-up
    enforce max turns
    maybe compact
```

## 工具定义不是静态列表

turn 开始时调用 `prepare_tool_definitions_timed()`：

- blocking MCP 策略下，首次 prompt 前等待 MCP 初始化；
- progressive 策略下，不阻塞；
- 从 Agent tool bridge 获取 built-in definitions；
- 根据 plan mode 过滤工具；
- 后端原生 web search 开启时移除本地同名工具；
- structured output 需要时临时追加合成工具。

源码：

- `sampler_turn.rs:111-152`
- `turn.rs:1732-1851`

这说明工具 schema 是 turn-scoped 产物，不是进程启动时生成一次就永久不变。

## 模型请求

`chat_state_handle.build_request()` 负责从当前 conversation state 组装请求，然后附加：

- session id；
- turn index；
- agent id；
- deployment id；
- native JSON schema；
- hosted tools。

源码：`turn.rs:1852-1895`。

`run_turn_via_sampler()`：

1. 刷新 turn-scoped sampler config；
2. 通过 `SamplerHandle::submit_and_collect()` 交给 sampler actor；
3. 等待 stream-drain barrier；
4. 返回 response 或恢复动作。

源码：`sampler_turn.rs:848-914`。

## 为什么 sampler 也是 actor

模型连接涉及：

- 认证刷新；
- endpoint 与 header；
- stream；
- retry；
- HTTP/WebSocket 状态；
- metrics；
- 配置热更新。

把它独立为 actor，可以让 SessionActor 不直接拥有每个传输细节，也能在 model/config 变化时推送新配置。

## 恢复动作不是错误

sampler 失败可以转成：

- `CompactAndResubmit`
- `RefreshAuthAndResubmit`

外层 turn loop 收到后 `continue`，见 `turn.rs:1915-1959`。

这两种结果是状态转换，不是 terminal error：

- 上下文太大，先缩短再重试；
- session token 失效，刷新后按有界 backoff 重试。

把它们直接抛成错误会让上层误判“任务结束”。

## 工具循环

模型响应中的 tool calls 会：

1. 记录名字和 MCP metadata；
2. 转成统一 `ToolCallResponse`；
3. 发出 phase change；
4. 调 `execute_tool_calls()`；
5. 根据结果决定 cancel、follow-up 或继续。

源码：`turn.rs:2229-2287`。

### 权限拒绝

工具批次可以返回：

- `PermissionReject`：结束当前 turn，标记 permission rejected；
- `Cancelled`：结束当前 turn；
- `HookDenied`：按 hook 语义处理；
- `FollowupMessage`：写成新的 user turn 后继续。

权限不是工具内部随意打印一个字符串，而是 Agent loop 可识别的控制结果。

## 同文件并发锁

`lock_path_for_args()` 会从不同工具参数形状中提取：

- `file_path`
- `path`
- `target_file`

同一路径的调用共享 mutex，按模型顺序执行；不同路径仍可并发。

源码：`tool_dispatch.rs:40-58`。

### 为什么比整批串行好

- 两个独立 read/search 不必互相等待；
- 不同文件的编辑可并行；
- 同文件写入避免最后完成者覆盖前一个结果；
- 不要求所有工具都知道全局调度规则。

代价是参数规范必须能可靠提取资源 identity。未知或嵌套路径仍可能逃过锁，因此它不是事务系统。

## Todo gate

模型没有工具调用时，Grok Build 仍可能不结束：

1. 收集 todo 状态；
2. 若存在 pending 或没有 backing task 的 in-progress；
3. 在上限内注入 reminder；
4. 回到 sampling loop；
5. 达到上限后才把控制权交给用户。

源码：`turn.rs:2112-2163`。

它解决“模型口头结束，但结构化工作状态仍未完成”的一致性问题。

风险也很明确：如果 todo 不准确，gate 会推动无意义 continuation，所以实现设置 `max_fires_per_prompt`。

## Structured output gate

当 provider 支持原生 schema，直接把 JSON schema 放进 request。

不支持时：

- 临时广告一个 `StructuredOutput` 工具；
- 提示模型最后只调用一次；
- 校验 JSON；
- 不符合时把错误作为 tool result 回给模型；
- 最多重试 3 次。

源码：`turn.rs:3-20,1773-1797,2198-2227`。

这是把“输出格式要求”从软提示提升为 runtime 验证循环。

## 权限模型

Grok Build 的权限面包括：

- Agent definition 的 tools allowlist / denylist；
- session-level tool clamp；
- tool approvals；
- plan mode 工具过滤；
- folder trust；
- yolo/auto mode；
- sandbox；
- managed requirements。

`xai-grok-agent/src/builder.rs` 在构建 Agent 时会计算有效 toolset，并对：

- subagent 是否启用；
- AskUser 是否启用；
- hosted tool；
- Agent 自身 allowlist；
- session allow/deny；
- plugin/compat tool names；

做交集与映射。

源码集中在 `xai-grok-agent/src/builder.rs:764-1193`。

### 一个重要原则

有效工具集合不是多个 allowlist 的并集，而通常是层层收紧后的交集。否则子 Agent 自己限制了能力，session 配置却可能再次扩大。

## Subagent

Grok Build 原生支持：

- built-in `general-purpose`、`explore`、`plan`；
- plugin/user-defined Agent；
- foreground/background；
- resume；
- parent/owner session；
- tool allowlist；
- usage 归并；
- worktree/隔离相关机制。

Agent builder 会：

- 动态生成 Task tool 描述；
- 只列本次有效的 subagent；
- 给 child session 限制可见工具；
- 防止递归能力无条件扩张。

这已经是一个 session graph，而不是单纯函数递归。

## MCP

MCP 有两个初始化策略：

| 模式 | 行为 | 取舍 |
|---|---|---|
| blocking | 首次 prompt 前等全部初始化 | 工具列表稳定，但首 token 更慢 |
| progressive | 不阻塞 | 启动快，但后续需要提醒/更新模型可用工具 |

SessionActor 还运行 MCP liveness dispatcher，并可按配置自动重启，见 `run_loop.rs:91-139`。

## Memory

Grok Build 把 memory 与 transcript 分开：

- 空闲一段时间可 flush；
- session end 可保存摘要；
- memory 文件可重新索引与 embedding；
- subagent 可以跳过主 session 的某些保存流程；
- first turn 可注入 memory reminder；
- compaction recovery 也能查 memory。

源码线索：

- `run_loop.rs:153-179,239-260`
- `turn.rs:1805-1814`
- `session/memory/`

这不是只在 prompt 里放一个 `MEMORY.md`，而是有独立生命周期和 telemetry 的子系统。

## Persistence

会话相关目录包含：

- `session/storage/jsonl`
- `chat_persistence`
- `persistence`
- `replay_events`
- `updates`
- `summary`
- `fork`
- `rewind`

Actor 的 UI 更新还经过 replay buffer，可以合并流式 chunk 后再发出，见 `run_loop.rs:43-60,198-205`。

这说明持久化、模型 history 和 UI 更新流是相关但不同的三条通道。

## 设计优点

1. SessionActor 统一管理大量异步事件。
2. prompt loop 有明确的恢复、todo、structured output 和 interjection gate。
3. MCP、memory、hooks、subagent、background task 深度集成。
4. 工具并发能按资源 identity 精细串行化。
5. telemetry 和 usage ledger 深入每个阶段。

## 设计代价

1. 公开快照仍然很大，控制流横跨多个 crate 和模块。
2. `turn.rs` 单文件超过 2,000 行，产品机制容易互相影响。
3. actor、多个后台 task、replay buffer 和状态 handle 增加时序理解难度。
4. 大量 feature/config 组合需要高强度集成测试。
5. 与 xAI backend、认证和产品协议耦合较深。

## 初学者容易看错

### 把 `run_session()` 当 Agent loop

它是 session mailbox；模型-工具循环在 `turn.rs`。

### 把 memory 当 chat history

chat state 记录当前会话；memory 是异步 flush、可索引、跨会话复用的另一层。

### 把 tool allowlist 当唯一权限

实际还叠加 session clamp、approval、plan mode、sandbox 和 managed config。

## 推荐精读顺序

1. `run_loop.rs:281-304`：prompt 如何进入 actor。
2. `turn.rs:1799-2305`：完整模型-工具循环。
3. `sampler_turn.rs:848-914`：一次模型请求及恢复。
4. `tool_dispatch.rs:40-58`：同文件并发控制。
5. `xai-grok-agent/src/builder.rs:764-1193`：有效工具集如何构建。

## 思考点

1. 为什么 `run_session()` 不直接 await 完整 prompt turn？
2. blocking MCP 与 progressive MCP 分别把复杂度放在哪一端？
3. Todo gate 为什么必须有触发上限？
4. 同文件 mutex 能防哪些竞态，又防不了哪些竞态？
