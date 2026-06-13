---
title: MCP Is Dead? — 2026 年协议存废之争零基础笔记
来源: 'Quandri Engineering「MCP is dead」(2026); Charles Chen「MCP is Dead; Long Live MCP!」(2026); Anthropic「Code execution with MCP」; MCP Blog「2026-07-28 Release Candidate」(2026); Hacker News / DEV Community 社区讨论'
日期: 2026-06-13
子分类: Web 后端
分类: 后端 API
provenance: pipeline-v3
---

## 从日常类比开始：万能转接头 vs 自带螺丝刀

想象你租了一间**共享厨房**（LLM 的 context window，也就是模型一次能「看见」的桌面）。

- **MCP** 像店家发给你的一盒**标准化转接头**：USB-C 转 HDMI、转以太网、转 DisplayPort……规格统一，任何带 MCP 口的「智能灶」（Claude Code、Cursor、OpenCode）都能插。但盒子一打开，**说明书和接口图**就占满了半张桌子——你还没开始做饭，桌面已经满了。
- **CLI**（`gh`、`curl`、`psql`）像你自己带来的**螺丝刀和扳手**：模型在训练数据里早就见过 `man curl`，不占额外「菜单位」，在终端里一行命令就能干活，出了错你还能在同一行复现。
- **Skills**（按需加载的技能包）像**按需借菜谱**：平时不占桌面，只有说「我要做 Linear 那道菜」时，图书管理员才递来那一页步骤。

2026 年初，Quandri Engineering 实测：连接 Linear、Notion、Slack、Postgres 四个 MCP 服务器、共 77 个工具定义，**仅 schema 就吃掉约 21,077 tokens**——在 200K 窗口里约 **10.5%**。同期 Hacker News 热帖「MCP is dead; long live MCP」拿到数百赞，Perplexity 也因 MCP 工具定义占用过高上下文而转向其他集成方式。于是「MCP 已死，CLI 当立」成了开发者圈的流行叙事。

**但「MCP 死了」和「把 MCP 当万能锤子乱用」是两件不同的事。** 这篇笔记帮你零基础理清：争论在吵什么、数据说了什么、协议在怎么改、以及个人与团队各自该怎么选。

---

## 辩论地图：三派声音

| 立场 | 代表观点 | 典型场景 |
|------|----------|----------|
| **MCP 已过时** | 上下文膨胀、进程层延迟、调试困难；CLI/Skills 更省 token | 个人编码 Agent、高频脚本化操作 |
| **MCP 没死，是用法错了** | 不应把整 API 暴露成 40+ 个常驻工具；应 deferred loading + code execution | 仍在演进中的 Agent 工程 |
| **MCP 是企业刚需** | 远程 HTTP MCP + OAuth + 审计 + OpenTelemetry；CLI 无法集中治理 | 多团队、异构客户端、合规环境 |

Charles Chen（2026）指出：社区常把 **stdio 本地 MCP** 和 **Streamable HTTP 远程 MCP** 混为一谈——前者像给本机进程套壳，CLI 往往更轻；后者才是组织级「工具总线」，价值不在省几个 token，而在**谁授权、谁审计、谁升级 schema**。

---

## 反方论据：为什么有人说 MCP「该死」

### 1. 上下文窗口被工具定义占满（Context Bloat）

Quandri 的测量（2026，Claude Code 环境）：

| MCP Server | 工具数 | 估算 Tokens |
|------------|--------|-------------|
| Linear | 42 | ~12,807 |
| Notion | 14 | ~4,039 |
| Slack | 12 | ~3,792 |
| Postgres | 9 | ~438 |
| **合计** | **77** | **~21,077** |

餐厅类比再贴切一点：你只想查一张 Linear 工单，却必须先摊开 42 本 Linear「菜单」；其中 `linear/save_issue` 单个 schema 就约 619 tokens。查一次 issue，MCP 路径约 **12,957 tokens**（含常驻定义），而等价 `curl` GraphQL 约 **200 tokens**——Quandri 估算 **~65×** 差距（单次查询场景）。

### 2. 可靠性与延迟

- 每个 MCP 服务器常是**独立子进程**（Node/Python），启动失败、中途崩溃、重复 OAuth 都见过。
- 基准测试（Jira MCP vs 直连 REST）：单次调用 MCP 约 **3× 慢**，含冷启动首调约 **9.4× 慢**——多一层 JSON-RPC + 进程边界。
- Claude Code 对 MCP 响应有约 **25,000 tokens 截断**，大结果只能看到 `...[truncated]`。

### 3. 与现有 CLI/API 功能重叠

| 维度 | CLI / 直连 API | MCP |
|------|----------------|-----|
| 人机同接口 | 人类与 Agent 同一命令 | 主要在 Agent 对话内 |
| 可组合性 | `pipe`、`jq`、脚本 | 受服务器返回格式约束 |
| 调试 | 终端复现 | 往往绑在会话里 |
| 预训练知识 | man page、Stack Overflow | 需额外 tool schema |

Eric Holmes 等文章标题直球：**「MCP is dead. Long live the CLI.»** Google Workspace CLI 曾带 MCP 后又移除，也被解读为「大厂转向 CLI 扩展（如 Gemini CLI Extensions）」——尽管 Google Cloud 仍在推进 MCP 相关能力，叙事冲突加剧了「协议已死」的印象。

---

## 正方与演进：为什么「MCP is dead」是标题党

### 1. 生态数据并未崩塌

Better Questions（2026）汇总：MCP SDK **月下载量超 9700 万**；注册服务器 **1.7 万+**；Anthropic、OpenAI、Linux Foundation 等仍在投入。Perplexity **一家**弃用 MCP，不等于协议退场——更像 **Gartner  hype cycle** 从「期望峰值」滑入「幻灭低谷」（Tyk Learning Center, 2026）。

### 2. 问题被归因到「 eager loading」，协议在修

**Tool Search / Deferred Loading**（Claude Code 已 rollout）：连接时只列出工具**名称**，真正调用前才加载完整 schema，Quandri 后续更新称上下文膨胀「** largely addressed**」，token 可降 **85%+**。

**Code execution with MCP**（Anthropic）：不把 77 个工具 schema 全塞进 prompt，而是把 MCP 暴露为**代码 API**，模型写脚本按需 `import` 工具模块。官方示例：某工作流从 **~150,000 tokens 降至 ~2,000 tokens**（约 98.7%）——**协议层仍是 MCP**，变的是**呈现给模型的方式**。

### 3. 企业场景：CLI 省 token，但省不了治理

远程 MCP over HTTP 提供：

- 集中 **OAuth 2.1** 与 scope 撤销
- **OpenTelemetry** 与调用审计
- 服务端更新 tool schema，**多客户端同步**，无需每人 `git pull` CLI 插件

Victorino Group / Chen 的论点：争论表面是 MCP vs CLI，实质是 **个体速度 vs 组织控制面**。

### 4. 2026-07-28 规范 Release Candidate

MCP 官方博客（2026-05-21）宣布迄今最大修订：

- 传输层趋向 **无状态 HTTP**（移除 sticky session、`initialize` 握手改为 `_meta` 携带版本信息）
- **Extensions 框架**：Tasks、MCP Apps 等能力可独立演进
- 功能 **deprecation 窗口**（约 12 个月）与一致性测试套件

这是在回应「难部署、难水平扩展、难调试」——不是写讣告，是在**补基础设施课**。

---

## 核心概念（零基础速查）

### Model Context Protocol（MCP）

Anthropic 2024 年底开源、现由 Linux Foundation 托管的 **JSON-RPC 2.0** 协议，让 **Host（IDE/Chat）— Client — Server** 三方标准化交换 **Tools / Resources / Prompts**。详见本站 [[mcp-spec]] 笔记。

### Context Bloat（上下文膨胀）

客户端在会话开始时把 `tools/list` 返回的**全部** name + description + JSON Schema 注入 system prompt。工具越多，**还没用户输入就先占满窗口**。

### Deferred Loading（延迟加载）

仅暴露工具目录；模型选定工具后再 fetch schema。对抗 bloat 的**客户端策略**，不改变 MCP wire format。

### Code Execution Mode（代码执行模式）

模型生成 Python/TS 等代码调用 MCP 封装，而非逐步 `tools/call` JSON。减少中间结果过模型的次数，Anthropic 仍视为 MCP 生态的一部分。

### Skills Pattern

把「如何调 Linear API」写成**按需加载**的 markdown/指令包（如 Claude Skills），内含 curl 示例。与 MCP 竞争的是**加载策略**，不是互斥——Quandri 实际 **Bash + Skills + MCP 混用**。

### stdio vs Streamable HTTP

- **stdio**：本机子进程，零网络，适合个人；与 CLI 对比时常显「重」。
- **Streamable HTTP**：远程、OAuth、多租户——「MCP 是企业工具总线」的主战场。

---

## 代码示例 1：同一任务 — CLI 路径（~200 tokens 量级）

查 Linear 工单 `ISSUE-123`，Quandri 推荐的 CLI-first 写法：

```bash
# 环境变量存放 token，避免写进 prompt 明文
export LINEAR_TOKEN="lin_api_xxxxxxxx"

curl -s \
  -H "Authorization: Bearer $LINEAR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ issue(id: \"ISSUE-123\") { title state { name } assignee { name } } }"}' \
  https://api.linear.app/graphql \
  | jq '{title: .data.issue.title, state: .data.issue.state.name, assignee: .data.issue.assignee.name}'
```

Agent 在 Bash 工具里执行上述命令：**无需** 预加载 42 个 Linear MCP 工具定义。代价：权限边界靠 shell 环境与你自己的规范；生产库上要自己防 `DROP TABLE`。

---

## 代码示例 2：MCP 路径 — 配置 + JSON-RPC 调用

Claude Desktop / Cursor 类客户端的 MCP 配置（stdio 本地服务器）：

```json
{
  "mcpServers": {
    "linear": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-linear"],
      "env": {
        "LINEAR_API_KEY": "lin_api_xxxxxxxx"
      }
    }
  }
}
```

连接后客户端发送 JSON-RPC（简化）：

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"example-host","version":"1.0.0"}}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_issue","arguments":{"id":"ISSUE-123"}}}
```

**差异**：在 deferred loading 之前，host 往往已在 prompt 里嵌入 `tools/list` 的完整 42 工具 schema（~12,807 tokens）。MCP 换来的是**结构化参数校验**、服务器侧只读策略、以及**换 Host 不必重写集成**。

---

## 代码示例 3：Skills 模式 — 按需加载的「轻量菜单」

Quandri 式 Linear Skill（仅在触发「查 Linear」时注入上下文）：

```markdown
# Linear Issue Lookup Skill

- API: https://api.linear.app/graphql
- Auth: Bearer $LINEAR_API_KEY
- Get issue:
  curl -s -H "Authorization: Bearer $LINEAR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"query":"{ issue(id: \"ISSUE-ID\") { title state { name } } }"}' \
    https://api.linear.app/graphql
- Parse with jq; never print raw API keys in chat logs.
```

这是 **「MCP is dead」叙事里 CLI 派的工程化落地**：不是否定结构化工具，而是拒绝 **always-on 的 77 工具 billboard**。

---

## 代码示例 4：TypeScript — 最小 MCP Server（理解协议在干什么）

用官方 SDK 暴露一个只读工具（个人学习/原型；生产请加鉴权与输入校验）：

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "demo-readonly", version: "1.0.0" });

server.tool(
  "get_issue_title",
  "Fetch Linear issue title by id (read-only demo)",
  { id: z.string().describe("Linear issue id, e.g. ENG-123") },
  async ({ id }) => {
    // 生产环境：在 server 内持 token，勿把 secret 返回给模型
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LINEAR_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `{ issue(id: "${id}") { title } }`,
      }),
    });
    const json = await res.json();
    return {
      content: [{ type: "text", text: json.data?.issue?.title ?? "not found" }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

**要点**：Server 端集中 credential；Host 只看见 tool schema。组织可以把此服务部署为 **HTTP MCP + OAuth**，同一实现服务 Cursor 与内部 Chat —— 这是 CLI 难以「一次编写、处处审计」的部分。

---

## 决策框架：什么时候仍用 MCP，什么时候 CLI/Skills 更好

| 场景 | 更倾向 | 理由 |
|------|--------|------|
| 本机 `gh`/`psql` 已认证 | **CLI / Bash** | 零 schema tax，调试透明 |
| 无 CLI 的 SaaS（部分协作工具） | **MCP 或官方 API Skill** | 没有更好的标准口 |
| 生产数据库、需只读/审计 | **MCP Server 网关** | 服务端拦截危险 SQL |
| 多客户端共享同一工具策略 | **HTTP MCP** | 集中 auth + schema 版本 |
| 个人编码 Agent 日常自动化 | **Skills + CLI 混合** | Quandri 实测省 ~21K tokens |
| 跨公司工具 marketplace | **MCP** | 互操作是协议存在理由 |

**不要二选一宗教战争**：Better Questions 总结，Cloudflare / Pydantic / Zapcode 等团队收敛于 **「保留 MCP 作 schema 与发现层， invocation 方式再演进」** —— 换的是调用约定，不是删掉协议。

---

## 安全提醒：RCE 与「死不死」无关

2026 年多个安全分析指出：**实现不当的 MCP Server 可能带来任意命令执行（RCE）**——工具描述不可信、过度权限、prompt injection 触发危险 `tools/call`。这证明 MCP 需要**企业级硬化**（网关、沙箱、最小权限），但不能直接推出「协议已死」；类似「SQL 注入」不会让我们宣布 SQL 死亡。

---

## 与「USB-C 类比」的修正

2024–2025 年 MCP 被营销成 **「AI 的 USB-C」**；2026 年的修正版类比：

- **USB-C 仍然正确**：统一插头形状（schema、auth、discovery）。
- **需要补充**：你不该把**整台五金店**的 SKU 清单贴在桌布上（77 tools eager load）；USB-C 也没规定你必须同时插入所有设备。
- **CLI 像专用线**：只有一台显示器时，HDMI 线往往比 USB-C 坞更省事——**场景决定接口**，不是协议淘汰赛。

---

## 时间线（便于建立直觉）

| 时间 | 事件 |
|------|------|
| 2024-11 | Anthropic 发布 MCP |
| 2025 中 | 「USB-C for AI」叙事峰值；大量 SaaS 上架 MCP badge |
| 2026-03 | Quandri「MCP is dead」；HN 热议；Perplexity 调整集成策略 |
| 2026 Q1–Q2 | Tool Search / deferred loading；Code execution with MCP 文章 |
| 2026-05 | MCP `2026-07-28` Release Candidate（无状态 HTTP 等） |
| 2026 展望 | 企业网关、token 优化、Extensions 成熟 — **采纳期而非葬礼** |

---

## 小结：MCP 死了吗？

**短答：没有。** 更准确的说法：

1. **死的是「lazy MCP」**——把整 API 拆成几十个常驻工具、默认 eager load 的做法；社区 backlash 是在杀这种用法，Quandri 与 Hjarni 等文均持此观点。
2. **CLI 赢了个人效率战**——在终端里已认证的开发者工作流，Bash 往往更省 token、更快、更好调试。
3. **MCP 仍在赢互操作与治理战**——远程部署、OAuth、审计、多 Host 共享；协议还在通过 stateless HTTP、deferred loading、code mode 解决 2025 年的痛点。
4. **聪明团队混合用**——CLI 跑高频路径，Skills 包工作流，MCP 接无 CLI 或需集中策略的系统。

若你零基础只记一句：**「MCP is dead」是 headline；真正结束的是「连接一切、一次加载全部工具」的时代，而不是 JSON-RPC 那根线本身。**

---

## 延伸阅读

- 协议本体：本站 [[mcp-spec]]
- Quandri Engineering — [MCP is dead](https://www.quandri.io/engineering-blog/mcp-is-dead)（含测量方法与 Skills 实践）
- Charles Chen — [MCP is Dead; Long Live MCP!](https://chrlschn.dev/blog/2026/03/mcp-is-dead-long-live-mcp/)（stdio vs HTTP 分野）
- MCP 官方 — [2026-07-28 Release Candidate](https://blog.modelcontextprotocol.io/posts/2026-07-28-release-candidate/)
- Anthropic — Code execution with MCP（上下文优化模式）
- Hacker News — [MCP is dead; long live MCP](https://news.ycombinator.com/item?id=47380270)
