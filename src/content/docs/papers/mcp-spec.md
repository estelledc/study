---
title: MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
来源: Model Context Protocol Specification, modelcontextprotocol.io（2024-11 初版，2025-06-18 最新稳定版）
日期: 2026-05-31
子分类: AI 工程
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

**MCP**（Model Context Protocol，模型上下文协议）是一份让 LLM 客户端（Claude Desktop / Cursor / Zed 等）和外部能力提供方（数据库 / 文件系统 / Git / 第三方 API）说同一种话的规范。

日常类比：USB-C。在 USB-C 出现之前，每个外设有自己的接口——苹果一种、安卓一种、相机一种。USB-C 出现后，**一根线接所有设备**。MCP 想做的就是 LLM 世界的 USB-C：一个服务端写一次，所有兼容的客户端都能用。

技术定义：MCP 在 **JSON-RPC 2.0** 之上，定义了三类原语（Tools / Resources / Prompts）和两种传输方式（stdio / Streamable HTTP），客户端和服务端通过 `initialize` 握手协商能力，之后按需调用。

## 为什么重要

不理解 MCP，下面这些事都没法解释：

- 为什么 Claude Desktop 装一个"MCP 服务器"就能直接读你的本地 Postgres，不用你写胶水代码
- 为什么 Cursor / Zed / Windsurf 能复用同一个 GitHub MCP 服务端，每家不用重写一遍
- 为什么本项目的 ADR-5 要在 stdio 和 Streamable HTTP 之间二选一——这不是实现细节，是协议层的边界
- 为什么 2025-03-26 之后所有远程 MCP 服务都强制 OAuth 2.1——安全模型变了

## 核心要点

MCP 由 **三层** 组成，由下往上：

1. **传输层**：怎么把字节从客户端送到服务端。规范定义两种：
   - **stdio**：客户端 fork 一个子进程当服务端，通过标准输入输出读写 JSON-RPC 消息。零网络、零鉴权、只能同机。
   - **Streamable HTTP**：服务端暴露一个 `/mcp` 端点，客户端 POST 请求；服务端可以选择直接回 JSON 或升级成 SSE 流式响应。可以跨机，必须配 OAuth 2.1。

2. **协议层**：JSON-RPC 2.0 + 一套约定的方法名。`initialize` 握手交换版本和 capabilities；之后按命名空间走——`tools/list` `tools/call` `resources/read` `prompts/get` 等。

3. **原语层**：服务端能提供给客户端的三种东西：
   - **Tools**（工具）：模型可以调用的函数，比如"查数据库"。模型决定调不调。
   - **Resources**（资源）：用 URI 标识的可读数据，比如 `file:///path/to/log`。客户端决定读不读。
   - **Prompts**（提示模板）：用户可以触发的模板，比如"总结这个 PR"。用户决定用不用。

三方各管一段：模型管 Tools 何时调，客户端管 Resources 何时读，用户管 Prompts 何时点。这种"谁触发"分得很清，是 MCP 设计上的关键决定——不让模型乱读资源，也不让客户端替模型决定调谁。

补充一个第四类原语 **Sampling**：服务端可以反过来请求客户端用 LLM 生成内容（比如让服务端的 agent 借客户端的模型推理）。这是双向通信，2025-06-18 版才稳定。

## 实践案例

### 案例 1：stdio 传输的握手过程

Claude Desktop 配一个本地 MCP 服务器，启动时 fork 子进程，stdin/stdout 交换 JSON-RPC：

```
客户端 → 服务端：{"jsonrpc":"2.0","id":1,"method":"initialize",
   "params":{"protocolVersion":"2025-06-18","capabilities":{...}}}
服务端 → 客户端：{"jsonrpc":"2.0","id":1,"result":
   {"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":true}}}}
客户端 → 服务端：{"jsonrpc":"2.0","method":"notifications/initialized"}
```

之后客户端发 `tools/list` 拿到工具列表，模型决定调用哪个时再发 `tools/call`。

### 案例 2：list_changed 通知怎么用

服务端如果在 `initialize` 时声明了 `tools.listChanged: true`，就承诺：当工具列表发生变化（新增 / 删除 / 改签名）时，主动推一条通知：

```
服务端 → 客户端：{"jsonrpc":"2.0","method":"notifications/tools/list_changed"}
```

客户端收到后重新发一次 `tools/list` 拉最新列表。`resources/list_changed` 和 `prompts/list_changed` 同理。

为什么需要这个？因为 LLM 的 system prompt 里嵌入的工具描述是"快照"，列表变了不刷模型就调不到新工具。

### 案例 3：Streamable HTTP 的 OAuth 2.1 流程

远程 MCP 服务必须用 OAuth 2.1（RFC 9700 草案）。完整流程：

1. 客户端访问 `/mcp`，服务端返回 `WWW-Authenticate` 头指向授权服务器
2. 客户端读 protected resource metadata（RFC 9728）拿到授权服务器地址
3. 走 OAuth 2.1 授权码 + PKCE 流程，拿到 access token
4. 之后每个 `/mcp` 请求带 `Authorization: Bearer <token>`

强制 PKCE、禁用隐式流、支持 RFC 7591 dynamic client registration（客户端可以自动注册，不用人工申 client_id）。

为什么不直接 API key？因为 MCP 设计的目标是"用户授权一次，多客户端共享"，API key 模式做不到细粒度授权和撤销。OAuth 把"谁能访问"、"能访问多久"、"能访问哪些 scope"分开管。

## 踩过的坑

1. **stdio 和 Streamable HTTP 不可互换**：stdio 假设单客户端、零鉴权、同机；Streamable HTTP 假设多客户端、有鉴权、可能跨机。换传输层等于换安全模型，不能"先 stdio 跑通再换 HTTP"。

2. **list_changed 不声明就别推**：如果 `initialize` 时没在 capabilities 里声明 `listChanged: true`，服务端推 `notifications/.../list_changed` 客户端会忽略。这是 capability negotiation 的硬约束。

3. **2024-11-05 和 2025-03-26 不兼容**：旧版用 HTTP+SSE 双端点（`/sse` + `/messages`），新版统一到单 `/mcp` 端点。客户端必须看 `protocolVersion` 决定走哪条路。

4. **OAuth 2.1 不是 OAuth 2.0**：2.1 是 IETF 草案（RFC 9700），强制 PKCE、删了隐式流和密码流。直接复用旧的 OAuth 2.0 库可能不合规。

5. **Tools 描述就是 prompt**：`tools/list` 返回的 description 字段会被客户端拼进系统提示词。写得不好，模型就调不对。这一层看似是"协议"，实则是"prompt engineering"。

6. **stdio 服务端别往 stdout 打 log**：stdio 传输用 stdout 走 JSON-RPC，任何非协议输出会让客户端解析报错。要 log 必须打到 stderr。这是新手最常见的踩坑点。

## 适用 vs 不适用场景

**适用**：

- 想让一个 LLM 客户端接多个数据源 / 工具，且不想为每家写胶水
- 多个 LLM 客户端要共享同一套工具（比如团队的内部知识库）
- 需要把"工具发现"和"工具调用"解耦——模型运行时才知道有哪些工具

**不适用**：

- 单一 LLM 应用 + 单一固定工具集 → 直接写 function calling 更轻
- 需要工具之间相互编排（A 工具的输出喂给 B 工具）→ MCP 不管这个，要靠上层 agent 框架
- 工具调用延迟敏感（< 10ms）→ JSON-RPC 序列化 + 进程边界开销不可忽略
- 数据流量大（> 100MB 单次响应）→ MCP 没原生流式分块，得自己拆 resource 或在 Tool 里返回 URL
- 需要双向实时通信（如订阅事件流）→ MCP 的 notifications 设计是单向，反向通信要走 elicitation/sampling

## 历史小故事（可跳过）

- **2024-11-25**：Anthropic 开源 MCP，发布 0.1 版规范 + Python/TS SDK + 几个参考服务端（filesystem / git / postgres）。当时只有 stdio 和 HTTP+SSE 两种传输。
- **2025-03-26**：发布 2025-03-26 版规范，用 Streamable HTTP 取代 HTTP+SSE，引入 OAuth 2.1。这是一次破坏性升级，旧客户端不能直接连新服务端。
- **2025-06-18**：当前稳定版，强化 elicitation（服务端反向问客户端）和结构化输出（tool 返回值带 schema）。
- **类比**：MCP 之于 LLM 客户端，约等于 **LSP（Language Server Protocol）之于编辑器**。LSP 让 VSCode / Vim / Emacs 共享同一套语言能力，MCP 让 Claude Desktop / Cursor / Zed 共享同一套外部能力。两者都是 JSON-RPC + capability negotiation + 三大客户端原语。

## 学到什么

1. **协议先于实现**：先定 schema 和 capability，再写 SDK。一旦 schema 稳了，新加客户端 / 服务端都是机械工作。
2. **传输层和原语层要分开看**：stdio 和 Streamable HTTP 是同一套 JSON-RPC 消息，只是字节怎么走不同。换传输不换协议。
3. **list_changed 是状态同步的最小契约**：不是"服务端推全量"，是"服务端通知 + 客户端按需拉"。这种 push-then-pull 模式在分布式系统里很常见。
4. **远程协议必须捆绑鉴权**：stdio 没鉴权是因为同机进程边界本身是隔离；Streamable HTTP 必须 OAuth 2.1 是因为跨机后没有任何隐含信任。
5. **能力声明是双向契约**：`initialize` 不是单向"服务端报家底"，是双方都报。客户端也得说"我支持 sampling 吗"、"我能展示 progress 吗"，服务端才知道能不能用这些功能。

## 延伸阅读

- 规范主页：[modelcontextprotocol.io/specification](https://modelcontextprotocol.io/specification)（含完整 JSON Schema）
- 入门视频：[Anthropic — Building MCP Servers](https://modelcontextprotocol.io/quickstart)（30 分钟从零写一个 MCP 服务端）
- 参考实现：[github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)（filesystem / git / postgres / brave-search 等）
- 类比 LSP：[Microsoft Language Server Protocol](https://microsoft.github.io/language-server-protocol/)（MCP 的设计灵感来源，看一遍能理解 capability negotiation 的来龙去脉）
- OAuth 2.1 草案：[draft-ietf-oauth-v2-1](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1-13)（远程 MCP 鉴权所遵循的标准）
- [[anthropic-prompt-caching]] —— 同源 Anthropic 工程文档，配 MCP 用能省 token
- [[rest-fielding-2000]] —— REST 是 MCP 之前的"客户端-服务端"协议宪法

## 关联

- [[rest-fielding-2000]] —— REST 给 Web 定接口规范，MCP 给 LLM 客户端定接口规范
- [[anthropic-prompt-caching]] —— MCP 服务端工具描述长，配 prompt cache 减少重复 token
- [[anthropic-circuits]] —— Anthropic 工程团队同源产物，反映其"先开放规范后社区扩散"的做法
- [[autogen]] —— Agent 编排框架，常用 MCP 作工具接入层，互为补位

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[anthropic-circuits]] —— Anthropic Circuits — 把 Transformer 当电路逆向
- [[anthropic-prompt-caching]] —— Anthropic Prompt Caching — 让长 prompt 只算一次，后续只付 10%
- [[language-server-protocol-spec]] —— Language Server Protocol — 让编辑器共享同一套「语言大脑」的 USB 协议
- [[mcp-is-dead-debate]] —— MCP Is Dead? — 2026 年协议存废之争零基础笔记
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法

