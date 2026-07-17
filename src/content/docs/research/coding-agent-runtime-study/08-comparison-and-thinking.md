# 08. 横向比较、设计选择与思考题

## 先给总判断

五个项目没有一条单一进化路线。它们分别优化不同约束：

- **Codex**：多客户端共用一个强线程内核。
- **Gemini CLI**：模型流、政策与工具调度清晰分层。
- **Grok Build**：在一个 session actor 中纵向集成大量长期能力。
- **OpenCode**：用事件溯源提高多产品面、多 provider 的恢复一致性。
- **Pi**：保持最小循环透明，把工作流选择留给用户。

“最佳架构”取决于你最怕哪一种失败。

## 总比较表

| 维度 | Codex | Gemini CLI | Grok Build | OpenCode | Pi |
|---|---|---|---|---|---|
| 主语言 | Rust | TypeScript | Rust | TypeScript/Bun | TypeScript |
| 中心抽象 | Thread + Session | Client + Turn + Scheduler | SessionActor | Session aggregate + events | Agent loop + AgentSession |
| 主要产品面 | CLI/TUI/App/IDE/server | CLI/TUI/A2A/IDE companion | TUI/headless/ACP/leader | CLI/TUI/Desktop/Web/server/SDK | CLI/TUI/print/RPC/SDK |
| 循环可读性 | 中低 | 中 | 低 | V2 中，成熟路径低 | 高 |
| Provider 范围 | Responses 生态 + Bedrock/本地/自定义 | Gemini 为主 | xAI/BYOK/兼容 backend 为主 | 很广 | 很广 |
| 工具调度 | ToolRouter + runtime | Scheduler 状态机 | session tool loop | ToolRegistry + events | 直接函数 + hook |
| 权限 | approval + permission profile + sandbox | PolicyEngine + confirmation + sandbox | allow/deny + approval + plan/sandbox/managed | Permission event + saved rules | 无内置统一 permission |
| 并发粒度 | registry/tool runtime | Scheduler call state | 同文件锁，其余并发 | tool fibers 并发、event 串行 | 批次并/串 |
| 运行中输入 | pending input queue | injection/session | interjection/queue | durable steer | steering |
| 后续输入 | task queue | 新 prompt/session | pending input | durable queue | follow-up |
| 持久化 | rollout + thread store + state DB | chat/session checkpoint | chat state + JSONL + updates | SQLite events + projections | JSONL session tree |
| 压缩 | pre/mid/fallback | context manager/compression | preflight/two-pass/memory recovery | evented compaction | summary + recent branch |
| 子 Agent | extension/session graph | AgentTool local/remote/session | built-in/plugin/background/resume | agent/subagent session | 不内置，扩展实现 |
| MCP | 内建 | 内建 | 内建，blocking/progressive | 内建 | 不内置，扩展实现 |
| 插件风险 | 受 runtime 契约约束 | extension/agent/MCP | 深度 plugin/hook | server + TUI plugin | extension 同进程全权限 |
| 最适合学习 | 请求快照与线程恢复 | 工具政策状态机 | actor 化产品 runtime | event sourcing 迁移 | Agent loop 本体 |

## 同一问题的五种回答

### 问题一：模型请求工具后怎么办

#### Codex

Response item → `ToolRouter.build_tool_call()` → `ToolCallRuntime` → registry dispatch。

优点：请求 context 与工具 runtime 对齐。

代价：跨层多。

#### Gemini CLI

`Turn` 只产出 `ToolCallRequest` → `Scheduler` 状态机结算。

优点：stream parsing 与政策可独立测试。

代价：需要维护两套对象间的事件合同。

#### Grok Build

Session prompt loop 解析 tool calls → permission/hooks → 并发执行 → chat state → resample。

优点：产品 gate 可以直接影响 turn。

代价：turn 文件承载机制多。

#### OpenCode V2

tool call 先成为 durable event → 获取 assistant identity → tool fiber 执行 → tool result event。

优点：崩溃恢复和 replay 边界强。

代价：每次副作用都要参与事件事务与投影。

#### Pi

校验参数 → before hook → `tool.execute()` → after hook → tool result message。

优点：透明、易嵌入。

代价：持久化与政策可靠性由产品层/扩展承担。

### 问题二：用户运行中又发消息怎么办

| 项目 | 当前 run 内纠偏 | 当前 run 后追加 |
|---|---|---|
| Codex | pending input queue | task 外层再检查队列 |
| Gemini CLI | injection/session input | 下一 prompt |
| Grok Build | interjection/send-now | pending input |
| OpenCode | durable `steer` | durable `queue` |
| Pi | steering | follow-up |

共同原则：必须明确“新消息在哪个模型边界获得控制权”，不能只保存成数组。

### 问题三：怎样防止危险工具

```text
能力不可见
  < runtime deny
  < 人工确认
  < OS/容器/VM 硬隔离
```

这不是严格的单向强弱关系，而是不同职责：

- 能力不可见减少模型提出动作的概率；
- deny 在 runtime 拒绝动作；
- 确认把决策交给人；
- sandbox 限制真实副作用上限。

最完整的系统会组合，而不是选择一个替代其他全部。

### 问题四：上下文太长怎么办

| 项目 | 主要策略 | 原始历史 |
|---|---|---|
| Codex | pre/mid turn compact，world state reinjection | rollout/thread store 保留 |
| Gemini CLI | context manager 或 chat compression | session/checkpoint 保留 |
| Grok Build | preflight/two-pass compact + memory recovery | chat/session storage 保留 |
| OpenCode | summary + recent，事件记录 started/ended | event/history 保留 |
| Pi | compaction entry + recent branch | JSONL 树保留 |

共同原则：

> 活动上下文可以有损，审计历史不能因此被删除。

### 问题五：如何扩展

| 扩展方式 | 典型作用 | 风险 |
|---|---|---|
| Tool registration | 新能力 | 参数与副作用 |
| Skill/prompt | 新 SOP | prompt injection / 过期规则 |
| MCP | 跨进程工具协议 | 服务信任、schema、认证 |
| Plugin/extension | 改 provider/runtime/UI | 同进程代码执行与生命周期 |
| Subagent | 隔离上下文与能力 | 委派遗漏、成本、递归、验收 |

Pi 把多数能力交给 extension；Codex/Grok/OpenCode 把更多扩展点纳入中心 runtime；Gemini CLI 同时有 MCP、agents 和 extensions。

## 六个可复用设计模式

### 1. Request Snapshot

**解决：** 模型看到的配置与工具执行时配置不一致。

**代表：** Codex `StepContext`；OpenCode tool registration identity。

**适合：** cwd、权限、工具或模型可在运行中变化的系统。

### 2. Model Stream 与 Tool Settlement 分离

**解决：** provider event parsing 与本地工具政策互相污染。

**代表：** Gemini `Turn` + `Scheduler`；OpenCode LLMEvent publisher + ToolRegistry。

**适合：** 有 UI 中间态、确认和多种工具来源的系统。

### 3. 双层输入循环

**解决：** 运行中纠偏和任务后追加无法区分。

**代表：** Pi steering/follow-up；OpenCode steer/queue。

**适合：** 长任务、流式 UI、用户可中途输入。

### 4. Event-first Side Effect

**解决：** 进程在工具执行后、结果落盘前崩溃，无法知道副作用是否发生。

**代表：** OpenCode V2。

**适合：** 多客户端、远程执行、强恢复要求。

**代价：** 事件、投影、幂等与 settlement 复杂。

### 5. Resource-aware Concurrency

**解决：** 全并行会冲突，全串行又浪费时间。

**代表：** Grok Build 同文件锁。

**适合：** 工具参数能提取明确资源 identity 的系统。

### 6. Durable History + Lossy Active Context

**解决：** 长对话既要可恢复，又不能每轮把全部历史发给模型。

**代表：** 五个项目共同采用。

**适合：** 所有长期 Agent。

## 如何选择架构

### 你在写教学 Demo

选择 Pi 风格：

- 一个清晰 Agent loop；
- 内存 history；
- 少量工具；
- 事件回调；
- 先不做分布式持久化。

但必须明确 demo 不提供硬 sandbox 和崩溃恢复。

### 你在写单用户本地 CLI

可以采用：

- Pi 的 loop；
- Gemini 的 Scheduler/Policy 分层；
- JSONL append-only session；
- 外部容器 sandbox。

这是复杂度与可靠性的平衡点。

### 你在写 Desktop + IDE + CLI 共用后端

更接近 Codex：

- thread/session 作为统一内核；
- typed protocol；
- request snapshot；
- rollout/thread store；
- client 只消费事件。

### 你在写多租户、可远程恢复的平台

更接近 OpenCode V2 的方向：

- durable input admission；
- event sequence；
- execution ownership；
- idempotent tool settlement；
- projections；
- permission request 事件。

### 你要集成大量长期异步能力

可参考 Grok Build：

- Session actor；
- mailbox；
- background tasks；
- liveness；
- memory timer；
- replay buffer；
- resource-aware tool locks。

不要一开始就复制完整复杂度；只有真实并发事件足够多时 actor 才值得。

## 质量判断清单

看到一个新的 coding-agent 项目时，不要先问“支持多少模型”，先检查：

1. **输入**
   - 运行中输入怎样处理？
   - 是否区分 steer 与 queue？
   - 重复提交是否幂等？

2. **上下文**
   - system、project rules、history、tools 怎样装配？
   - 是否有请求级一致性？
   - compaction 是否保留原历史？

3. **工具**
   - schema、policy、execution 是否分层？
   - 参数是否校验？
   - 工具结果顺序是否稳定？
   - pending 工具在取消后怎样结算？

4. **权限**
   - 默认 allow、ask 还是 deny？
   - parser 失败怎么办？
   - approval 与 sandbox 是否区分？
   - plugin 是否拥有宿主全部权限？

5. **持久化**
   - 原始事件、当前状态、UI event 是否混在一起？
   - 崩溃发生在工具执行中间时如何恢复？
   - resume/fork 是否有稳定 identity？

6. **终止**
   - 模型无工具后还检查什么？
   - 是否有循环上限、step 上限、stop hook？
   - 后台任务是阻塞 turn 还是独立存活？

7. **验证**
   - 是否有 integration/e2e，而不只是工具单测？
   - 是否测试取消、权限拒绝、重复调用、压缩后恢复？

## 思考题

下面问题都能仅凭本材料回答，不需要额外搜索。

### 基础题

1. Turn、Agent run、Session 三者的生命周期分别是什么？
2. 为什么“模型看到了工具”不等于“工具能真实执行”？
3. steering 与 follow-up/queue 的差异是什么？
4. 为什么 compaction summary 不能替代 transcript？

### 控制流题

5. Pi 和 OpenCode V2 都使用双层循环，它们最大的工程差异是什么？
6. Codex 为什么要在每个 sampling step 捕获 `StepContext`？
7. Gemini CLI 为什么让 `Turn` 产出 ToolCallRequest，而不是直接执行？
8. Grok Build 的 Todo gate 为什么发生在“没有 tool call”之后？

### 并发与一致性题

9. Pi 的“整批并/串”和 Grok Build 的“同文件锁”各适合什么工具集合？
10. OpenCode 为什么要让 event publish 串行，而工具 fiber 可以并行？
11. 工具已经真实执行，但进程在结果落盘前崩溃，五种架构里哪一种最直接地为此建模？

### 安全题

12. Pi 的 project trust、tool allowlist、container sandbox 分别防什么？
13. Gemini PolicyEngine 在 shell parser 失败时为什么不能沿用 allow？
14. Codex 的 approval policy 与 sandbox policy 为什么必须分开？
15. 第三方 extension/plugin 比普通 Skill 多了什么风险？

### 架构选择题

16. 如果只做一个 500 行教学项目，你会从哪个项目借鉴，明确不实现哪些能力？
17. 如果要支持 CLI、IDE、Desktop 共用 session，为什么 Codex 风格比直接复用 Pi `Agent` 更合适？
18. 如果系统必须跨进程恢复工具执行，为什么要引入 event sequence、idempotency 和 settlement？
19. Session actor 在什么情况下减少复杂度，在什么情况下只是增加样板？
20. 多 provider 支持为什么不只是增加一个 `baseURL` 配置？

## 回答线索

| 题号 | 主要章节 |
|---|---|
| 1-4 | [领域地图](01-field-map.md) |
| 5 | [核心循环](02-core-loop-deep-dive.md)、[Pi](07-pi.md)、[OpenCode](06-opencode.md) |
| 6 | [Codex](03-codex.md) |
| 7、13 | [Gemini CLI](04-gemini-cli.md) |
| 8、9、19 | [Grok Build](05-grok-build.md) |
| 10、11、18 | [OpenCode](06-opencode.md) |
| 12 | [Pi](07-pi.md) |
| 14 | [Codex](03-codex.md) |
| 15 | 五个项目的扩展与安全段 |
| 16-20 | 本章“如何选择架构”与各项目“设计代价” |

## 第一轮后的精读建议（历史入口）

本节保留第一轮结束时的源码定位记录，不再作为默认阅读路线。先按[最终接班页](00-final-reader-map.md)定位具体问题，只有需要核对实现细节时才使用以下入口。

按学习收益排序：

1. **Pi `agent-loop.ts:155-275`**

   目标：能手画双层循环，并解释每个退出条件。

2. **Gemini `scheduler.ts:300` 之后的状态转换**

   目标：理解 validate、policy、confirm、execute 的顺序。

3. **Codex `turn.rs:226-430`**

   目标：理解 pending input、auto compact 与 stop hook 如何共同决定 continuation。

4. **OpenCode `runner/llm.ts:173-405`**

   目标：理解 event-first 工具结算和输入 promotion。

5. **Grok Build `turn.rs:1799-2305`**

   目标：找出 memory、MCP、Todo gate、structured output 和 tool loop 的边界。

需要精读时建议从与当前问题最接近的项目开始，每次只读 30-50 行并回答 2-3 个问题，不要一次把五个大文件逐行展开。

关于失败恢复和扩展边界的后续研究已完成，继续阅读：

- [最终接班页：当前阅读路线与问题路由](00-final-reader-map.md)
- [Round 2：失败、取消与恢复状态机](09-round2-reliability-failure-state-machine.md)
- [Round 2：可靠性源码追踪卡](10-round2-source-trace-cards.md)
- [Round 3：扩展、子 Agent 与能力边界](11-round3-extension-subagent-capability-map.md)
- [Round 3：参考架构与进阶思考](12-round3-reference-architecture-and-thinking.md)
