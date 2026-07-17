# 03. Hermes Agent 深度解析

## 1. 定位与快照

- 上游：`NousResearch/hermes-agent`
- 本地：`projects/hermes-agent/`
- commit：`336620447422d4e037b6c746bc688c95f6476216`
- 版本：`0.18.2`
- 主语言：Python，另含 TypeScript/JavaScript 的 TUI、Web 和 Desktop。
- 许可证：MIT。
- 入口：
  - `hermes` / `hermes_cli.main:main`：产品 CLI；
  - `run_agent.py`：Agent runtime；
  - `gateway/run.py`：多渠道 daemon；
  - `cron/`：定时任务；
  - `apps/`、`web/`、`ui-tui/`：用户界面。

一句话架构：

> Python Agent loop 是执行中心，gateway 是长期消息与会话外壳，
> MemoryProvider、ContextEngine、Plugin、Skill 和 Toolset 通过多组接口
> 挂入；CLI/TUI/Web/消息平台共享同一套 runtime。

## 2. 总体结构

```text
CLI / TUI / Web / Telegram / Discord / Slack / WhatsApp / ...
                           |
                    Gateway / SessionStore
                           |
                    AIAgent.run_conversation
                           |
             build prompt + memory prefetch + tools
                           |
                      provider adapter
                           |
                  assistant text / tool_calls
                           |
               segmented tool executor + hooks
                           |
      terminal / files / browser / web / memory / skills / cron
                           |
           SessionDB + MemoryProvider + trajectory + delivery
                           |
             background memory / skill review + curator
```

## 3. Agent loop

### 3.1 入口与主循环

`run_agent.py:395` 的 `AIAgent` 是聚合对象，`run_agent.py:5917` 的
`run_conversation()` 已变成薄转发层，真实循环在
`agent/conversation_loop.py:537`。

循环条件在 `agent/conversation_loop.py:657`：

- 未超过 `max_iterations`；
- iteration budget 仍有余额；
- 或仍有一次 budget grace call。

一次循环大致经历：

1. 修复和裁剪历史消息。
2. MemoryProvider prefetch。
3. 构造 system prompt、tools 和 provider payload。
4. 调用当前 provider adapter。
5. 处理流式 text、reasoning 和 tool call delta。
6. 如果有工具：
   - 记录 assistant tool-call message；
   - 执行工具；
   - 写回 tool result；
   - 继续下一次模型调用。
7. 如果是最终文本：
   - 验证中断、截断、空回复和 provider 特殊格式；
   - 持久化；
   - 同步外部 memory；
   - 决定是否触发 background review。

### 3.2 Provider 适配

Hermes 没把“OpenAI-compatible”误当成所有模型都完全兼容。`agent/`
下有多种专用适配：

- `anthropic_adapter.py`
- `codex_responses_adapter.py`
- `gemini_native_adapter.py`
- `bedrock_adapter.py`
- `copilot_acp_client.py`
- `chat_completion_helpers.py`

适配层处理：

- role/tool-call 方言；
- reasoning 内容回放；
- thinking block；
- provider-specific prompt caching；
- 流式 tool arguments；
- tool id 合法性；
- Responses API 与 Chat Completions 差异；
- credential refresh；
- fallback model。

这是大型 Agent 工程的重要现实：工具协议“看起来统一”，但严格 provider
会因为一个缺失 `name`、孤立 tool result 或非法 tool id 拒绝整个请求。

### 3.3 工具并发与顺序

`run_agent.py:5753` 先调用 `_plan_tool_batch_segments`：

- 独立、只读或路径不冲突的调用可以并发；
- 有共享状态或副作用的调用保持串行；
- 混合批次按 segment 执行。

真实实现位于 `agent/tool_executor.py`：

- concurrent：线程池，上限 8；
- sequential：逐个执行；
- segmented：并行段与串行段混合；
- 每次工具进展后增量 flush SessionDB；
- 中断时为未执行工具补 cancelled result，保持 transcript 合法；
- 大工具结果按 context window 预算裁剪或落盘；
- 每次调用触发 middleware、pre/post hook 和 observability。

这一设计比“所有 tool call 一律 `Promise.all`”更可靠，因为文件写入、
消息发送、memory 更新、cron 和 delegate 都可能有顺序语义。

## 4. Prompt 与 Context

`AIAgent._build_system_prompt_parts()` 在 `run_agent.py:3754`，系统上下文
来自多类输入：

- 核心行为说明；
- model/provider 专用指引；
- workspace `AGENTS.md` 等 context files；
- identity/personality；
- tool 描述和 toolset；
- Skill 索引或预加载 Skill；
- MemoryProvider 静态块；
- 本轮 prefetch 的 memory context；
- gateway 的来源、用户、聊天与平台信息；
- todo、goal、时间和环境信息。

Context 压力由以下机制共同处理：

- tool result budget；
- conversation compression；
- provider context length；
- memory prefetch 限额；
- Skill 渐进披露；
- Tool Search 延迟加载；
- 图像降采样和超大 data URL 物化；
- prompt cache 稳定前缀。

核心经验：

> Context engineering 不是“塞更多”，而是维护稳定前缀、动态尾部、
> 引用边界和可预测的丢弃顺序。

## 5. Session 与 Gateway

### 5.1 会话键

`gateway/session.py:893` 的 `build_session_key()` 是多平台会话路由的
源真相。键考虑：

- profile；
- platform；
- DM / group / channel；
- chat id；
- thread id；
- participant id；
- group/thread 是否按用户隔离。

这避免 Telegram 群、Discord thread、WhatsApp DM 等不同身份语义被
压成一个 session。

### 5.2 持久化

`SessionStore` 从 `gateway/session.py:1010` 开始：

- SQLite `state.db` 是主源；
- `sessions.json` 是兼容镜像；
- transcript 和 routing metadata 分离；
- 启动时修复 stale session mapping；
- 压缩后沿 conversation lineage 找 canonical tip；
- 单个 routing key 使用 single-flight 创建，避免并发重复 session；
- restart 可标记 `resume_pending`，而不是一律开新会话。

### 5.3 Gateway 职责

Gateway 不只是消息转发，还负责：

- platform registry 与 adapter 生命周期；
- pairing / authorization / slash access；
- profile routing；
- cached Agent；
- session expiry；
- message delivery；
- streaming event；
- restart、drain、stuck loop 和 shutdown forensics；
- cron ticker；
- 多平台 home channel；
- 媒体、语音和富文本。

Hermes 与 OpenClaw 的差异：

- Hermes：`AIAgent` 是明显执行中心，gateway 包住它；
- OpenClaw：长期 Gateway 是系统控制平面，runtime 是被调度组件。

## 6. Tool 与 Toolset

Hermes 的工具不是一个平面列表：

- `model_tools.py`：模型可见定义与 dispatch；
- `toolsets.py`：基础、组合和场景 toolset；
- `tools/registry.py`：注册表；
- `agent/tool_dispatch_helpers.py`：副作用、批次和结果格式；
- `plugins/`：插件动态注册工具；
- `mcp_serve.py` / MCP 配置：外部工具服务器；
- `agent/transports/hermes_tools_mcp_server.py`：反向暴露工具。

优点：

- 可以给 subagent 或 cron 限定 tool surface；
- Tool Search 只解包当前 session 被授权的 deferrable tool；
- 组合 toolset 复用定义；
- provider 特定 schema 可统一转换。

代价：

- 定义、注册、选择、dispatch、hook 和显示分散在多个模块；
- 同名工具、内建工具、MCP 工具和 memory plugin 工具要去重；
- runtime 的合法 tool surface 很难仅看一个文件得知。

## 7. Skill 系统

### 7.1 表示与发现

`agent/skill_utils.py` 与 `agent/skill_commands.py` 处理：

- YAML frontmatter；
- platform/environment 条件；
- 外部 skill directory；
- disabled skill；
- 命名空间；
- slash command；
- stacked Skill；
- bundle；
- config variable；
- supporting `scripts/references/assets/templates`。

Skill 的基础加载流程：

```text
scan metadata
  -> offer name + description
  -> explicit / automatic selection
  -> skill_view reads body and linked files
  -> inject as an invocation message
  -> task executes
```

`agent/skill_preprocessing.py` 还支持：

- `${HERMES_SKILL_DIR}`、`${HERMES_SESSION_ID}`；
- 可选 `!` 反引号 inline shell 展开；
- 超时和输出上限。

inline shell 默认关闭是合理的，因为 Skill 本身就是供应链边界。

### 7.2 Background review

`agent/background_review.py` 在正常 turn 后 fork 一个隔离 review Agent：

- 只允许 memory / skill 工具；
- `skip_memory=True`，不初始化外部 memory provider；
- 不把 review prompt 写进用户真实 session；
- 复用父 Agent 的内建 memory/skill store；
- 根据对话判断是否新增/更新 Memory 或 Skill。

触发信号包括：

- 用户偏好与 correction；
- 非平凡任务和试错；
- 已有 Skill 不完整；
- 可复用流程；
- background review interval。

### 7.3 Curator

`agent/curator.py` 负责 Skill 库增长后的维护：

- usage 生命周期；
- active / stale / archived；
- pin；
- backup；
- merge / umbrella consolidation；
- archive 与 restore；
- cron Skill 引用重写；
- run report。

关键边界：

- 首次运行延迟一个周期；
- consolidation 默认关闭；
- dry-run 可预览；
- 外部 Skill 视为只读；
- 删除实为可恢复 archive；
- LLM consolidation 前创建 snapshot。

这是 Hermes 相比只会追加 Skill 的项目更成熟之处，但仍缺少统一的
跨任务效用 benchmark。

## 8. Memory 系统

### 8.1 内建与外部记忆

Hermes 同时有：

- SessionDB：消息、工具、usage、routing；
- 内建 `MEMORY.md` / `USER.md` 风格记忆；
- `MemoryProvider` 插件：Honcho、Hindsight、Mem0、Supermemory、
  OpenViking、Mnemosyne 等；
- session search：跨历史对话；
- context engine：压缩与检索。

这些不是一回事：

- session 是原始证据；
- memory 是提炼后的长期信息；
- Skill 是程序性方法；
- context engine 决定本轮能看到什么。

### 8.2 MemoryProvider 生命周期

`agent/memory_provider.py:43` 定义接口：

- `initialize`
- `system_prompt_block`
- `prefetch`
- `queue_prefetch`
- `sync_turn`
- `get_tool_schemas`
- `handle_tool_call`
- `on_turn_start`
- `on_session_end`
- `on_session_switch`
- `on_pre_compress`
- `on_delegation`
- `on_memory_write`
- `backup_paths`
- `shutdown`

`MemoryManager` 限制同时只有一个外部 provider，理由是：

- 避免 tool schema 膨胀；
- 避免多个后端冲突写入；
- 生命周期更清晰。

它用 `<memory-context>` fence 注入 recall，并在流式输出中 scrub fence，
避免内部 memory context 泄漏到用户界面。

### 8.3 写入边界

完成 turn 后，`AIAgent._sync_external_memory_for_turn()` 位于
`run_agent.py:3447`：

- 使用原始用户消息和最终回复；
- 不把注入后的 Skill 内容当用户事实；
- 后台同步失败不打断主回复；
- queue 下一轮 prefetch。

正确点是把 memory backend 视为 best-effort 辅助层，不能让记忆故障
摧毁前台对话。

## 9. Cron 与长期运行

`cron/__init__.py` 明确：gateway 每 60 秒 tick scheduler，job 在隔离
session 中运行。

`cron/jobs.py` 提供：

- cron expression；
- interval；
- one-shot；
- output 文件；
- origin delivery；
- per-job model/provider；
- script -> Agent；
- no-agent script；
- context_from 任务链；
- workdir；
- skill 列表；
- repeat、pause、resume、trigger、remove；
- cross-process file lock；
- heartbeat 与 success epoch；
- crash catch-up 和 stale claim 处理。

安全细节：

- `workdir` 必须绝对路径；
- job id 不能逃逸 output dir；
- gateway lifecycle 命令被 `lifecycle_guard.py` 阻止，避免 Agent 创建
  一个反复重启自身 gateway 的 cron loop；
- profile 的 cron 存储跟随 profile-specific `HERMES_HOME`。

## 10. 子 Agent 与并行

Hermes 的 `delegate_task`：

- 父 Agent 立即得到 task handle；
- 子 Agent 有自己的 session/context；
- 可限制 toolset；
- 有并发子节点上限；
- 同一批多个 delegate call 会被截断到上限；
- parent MemoryProvider 可以接收 delegation 结果；
- dynamic workflow 可把多步 pipeline 移到脚本/RPC，降低主上下文成本。

风险：

- 并行不是免费，子 Agent 会复制 system/tool context；
- 结果 synthesis 仍由父 Agent 承担；
- 权限如果只继承而不衰减，会扩大攻击面；
- 长任务必须有 durable checkpoint，否则进程重启后只剩不完整 session。

## 11. 安全模型

Hermes 主线已有：

- command approval 与危险命令模式；
- tool allow/deny；
- workspace/path safety；
- DM pairing 与 gateway authorization；
- profile/session 隔离；
- credential redaction；
- URL safety 与 SSRF 防护；
- local/Docker/SSH/Singularity/Modal/Daytona terminal backend；
- security-guidance plugin；
- tool loop guardrail；
- hook payload 敏感字段清理。

`agent/tool_guardrails.py` 的 loop guard 默认：

- 重复失败先 warning；
- hard stop 需显式开启；
- read-only 相同结果重复会被识别为无进展；
- mutating tool 不用结果相同判断，避免误判合法副作用。

不足：

- 主线默认不是“每次工具都在强隔离沙箱”；
- regex/approval 不是 capability security；
- 模型通常仍在调用时接触凭证；
- Memory/Skill 的长期写入会扩大 prompt injection 持久化风险；
- 第三方 Skill 和 Plugin 的治理仍依赖用户审查。

## 12. 自我改进的真实边界

### 已实现

- turn 后 background memory/Skill review；
- memory provider 跨会话写入和 recall；
- Skill create / patch；
- curator 的 archive、merge、pin、restore 和 report；
- session insights 与 trajectory；
- 单独官方仓的 Skill GEPA 优化；
- 轨迹压缩和训练数据导出。

### 部分实现

- Skill 的长期效用评测；
- background review 的 admission quality；
- 基于真实失败的自动 Skill regression；
- 不同 provider / model 间 Skill transfer；
- 安全审查和 provenance 的统一格式。

### 尚不能据此宣称

- Agent 会稳定地越用越强；
- 自动写入的每个 Skill 都提高任务成功率；
- 记忆不会污染未来行为；
- 工具描述、system prompt 和核心代码已自动进化；
- 模型参数会自动训练并安全上线。

## 13. 代码组织评价

### 优点

- 功能边界基本可识别：`agent/`、`gateway/`、`cron/`、`plugins/`、
  `providers/`、`tools/`、`skills/`。
- 关键系统有大量 failure-path 注释和 regression test。
- provider、memory、context、gateway、cron 的生产问题被显式编码。
- 文件级持久化、SQLite 和 Markdown 使状态可审计。

### 结构债务

- `run_agent.py`、`cli.py`、`hermes_state.py` 仍然很大。
- 一些实现从大文件抽出后保留 forwarder，形成双层导航成本。
- Python、Web、TUI、Desktop、gateway 和插件构成多语言 monorepo。
- 同一概念可能同时存在 legacy、新接口和兼容路径。
- 功能增长使配置项、环境变量和 provider 特例数量很高。

## 14. 值得复用的模式

1. MemoryProvider 生命周期接口。
2. side-effect-aware 工具分段并发。
3. 每次工具进展后增量持久化。
4. Skill 渐进披露与外部所有权边界。
5. background review 的 session/provider 隔离。
6. curator 的 snapshot、archive、restore 和 dry-run。
7. gateway session key 的单一源真相。
8. cron 生命周期命令守卫。
9. 内部 memory context 的 fence + streaming scrubber。
10. 把 provider 方言适配集中到 adapter，而不是散在业务工具里。

## 15. 主要思考点

- Background review 的写入应否默认直接进入正式 Skill 库？
- 一个 Skill 至少需要哪些测试和来源才能被自动接纳？
- 外部 MemoryProvider 只能选一个，是否会限制组合式记忆？
- Gateway 与 Agent loop 分离到什么程度最合适？
- Hermes 是否应该像 IronClaw 一样把凭证注入移到模型不可见边界？
- Skill curator 的目标应是减少数量，还是最大化任务效用？
- 哪些失败应该进入 memory，哪些应该进入 problem/telemetry，哪些应该丢弃？
