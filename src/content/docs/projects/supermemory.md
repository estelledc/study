---
title: Supermemory — AI 的记忆层
来源: https://github.com/supermemoryai/supermemory
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 是什么

Supermemory 是 2025 年上线的 **AI 记忆和上下文引擎**——让 AI 记住你。

日常类比：你跟朋友聊天，聊过的事情下次还能接着说。但大多数 AI 工具像金鱼，每次对话都是"第一次见面"。Supermemory 就是给 AI 装一个外置大脑——你告诉它你的偏好、项目、过去的讨论，下次对话时 AI 自动调取这些记忆，好像从未忘记。

它同时提供三种产品形态：
- **云端 API**：一个调用搞定记忆、用户画像、RAG 文档搜索
- **桌面 App**（app.supermemory.ai）：零代码，给 Claude / Cursor 等 AI 工具装记忆插件
- **本地版**（Supermemory Local）：一条命令跑在自己机器上，支持 Ollama 离线运行

GitHub 26.9k star，在 LongMemEval、LoCoMo、ConvoMem 三大 AI 记忆基准测试全部排名第一。

## 核心概念

### 1. Memory Engine — 从对话中提取事实

AI 不会自动"学会"你的偏好。Supermemory 有一个专门的 **Memory Engine**，它会监控你和 AI 的对话，自动提取有用的事实（"我喜欢 TypeScript"、"我在做权限迁移"），存进你的个人记忆库。

关键是它懂**时间**和**矛盾**：你说"我搬去了旧金山"，它会自动更新之前存的"你住在纽约"。过期的临时信息（"我明天要考试"）会自动遗忘。

### 2. User Profiles — 用户画像，一次调用 ~50ms

传统做法：你需要知道问什么，然后去搜索记忆。Supermemory 反过来——它**持续维护一个用户画像**，分两部分：

- **static（静态）**：长期不变的事实——"高级工程师"、"用 Vim"、"偏好深色模式"
- **dynamic（动态）**：近期上下文——"正在做认证迁移"、"正在调试限流问题"

一次 `client.profile()` 调用就能拿到两者，~50ms 延迟，直接注入到 AI 的系统提示词里，你的 AI 瞬间知道"你是谁"。

### 3. Hybrid Search — RAG + 记忆合二为一

RAG（检索增强生成）检索的是文档片段——无状态的，所有人查出来结果一样。记忆检索的是**关于你的事实**——个性化的。

Supermemory 把两者合并了：搜一句话，同时返回知识库文档 + 你的个人偏好。

### 4. Connectors — 自动同步外部数据

Google Drive、Gmail、Notion、OneDrive、GitHub，通过 webhook 实时同步。文档自动处理、分块、变得可搜索。你不需要自己搭管道。

## 代码示例

### 示例 1：用 npm 包存储记忆 + 获取用户画像

```typescript
import Supermemory from "supermemory";

const client = new Supermemory();

// 存一条信息——Supermemory 会自动从中提取记忆
await client.add({
  content: "User loves TypeScript and prefers functional patterns",
  containerTag: "user_123",
});

// 一次调用：拿到用户画像 + 相关记忆
const { profile, searchResults } = await client.profile({
  containerTag: "user_123",
  q: "What programming style does the user prefer?",
});

// profile.static  → ["Loves TypeScript", "Prefers functional patterns"]
// profile.dynamic → ["Working on API integration"]
// searchResults   → 按相似度排序的记忆结果
```

核心细节：`containerTag` 是项目隔离标签，相当于"文件夹"，把不同场景的记忆分开。你一个人可以有多套 profile。

### 示例 2：混合搜索 + 本地部署

```typescript
// 云端版搜索：同时检索知识库文档和个人记忆
const results = await client.search.memories({
  q: "how do I deploy?",
  containerTag: "user_123",
  searchMode: "hybrid",   // 默认值，RAG + Memory 合在一起
});

// 仅搜索个人记忆
const memories = await client.search.memories({
  q: "user preferences",
  containerTag: "user_123",
  searchMode: "memories",
});
```

本地部署只需改一个 `baseURL`：

```typescript
const client = new Supermemory({
  apiKey: "sm_...",
  baseURL: "http://localhost:6767", // 本地版监听这个端口
});
```

本地版启动方式（一条命令）：

```bash
curl -fsSL https://supermemory.ai/install | bash
npx supermemory local
supermemory-server
```

首次启动会自动设置内嵌的图引擎、本地嵌入模型和你的凭证，然后打印一个 API key。

## 集成方式一览

Supermemory 提供多种接入路径，从"零代码"到"深度集成"都有：

### 路径 A：MCP 协议（最轻量）

在 Claude Code、Cursor、VS Code 的 MCP 配置里加一行：

```json
{
  "mcpServers": {
    "supermemory": {
      "url": "https://mcp.supermemory.ai/mcp"
    }
  }
}
```

装好后 AI 获得三个工具：
- `memory` — 保存/遗忘信息
- `recall` — 按查询搜索记忆
- `context` — 注入完整用户画像到对话开头（在 Cursor/Claude Code 里输入 `/context` 触发）

### 路径 B：框架集成插件

```typescript
// Vercel AI SDK
import { withSupermemory } from "@supermemory/tools/ai-sdk";
const model = withSupermemory(openai("gpt-4o"), {
  containerTag: "user_123",
  customId: "conv-1",
});
```

支持：Vercel AI SDK、LangChain、LangGraph、OpenAI Agents SDK、Mastra、Agno、n8n 等。

### 路径 C：Python SDK

```python
from supermemory import Supermemory

client = Supermemory()

client.add(
    content="User loves TypeScript and prefers functional patterns",
    container_tag="user_123"
)
result = client.profile(container_tag="user_123", q="programming style")

print(result.profile.static)   # 长期事实
print(result.profile.dynamic)  # 近期上下文
```

## 踩过的坑

- **容器标签管理**：`containerTag` 用多了会混乱——建议一开始就定好命名规范（比如 `user_{id}` 或 `project_{name}`），否则不同项目的记忆会串
- **本地版的模型选择**：首次启动有交互式向导选模型，但 Ollama 的模型质量和记忆提取准确率差距很大。`gpt-oss:20b` 是官方推荐底线，太小的模型提取质量不够
- **API 费用**：云端版免费额度有限，超出后按 token 计费。大量对话或长上下文场景下费用不低——跑本地版能省但牺牲了易用性
- **多模型一致性**：本地版支持任意 OpenAI 兼容端点，但不同模型对"什么该记/什么该忘"的判断差异很大。同一套对话用 Claude 提取的和用 GPT 提取的，记忆内容可能不同
- **Connectors 的配置复杂度**：Notion / Google Drive connector 需要 OAuth 授权和 webhook 配置，对新手来说比用 SDK 难得多

## 适用 vs 不适用场景

**适用**：
- 给 AI 助手/agent 加持久记忆，让它跨会话"认识你"
- 需要用户画像的 AI SaaS 产品（一个 API 调用拿到静态 + 动态 profile）
- RAG 文档搜索 + 个人偏好合并的场景
- 想完全本地化运行的团队（一条命令 + Ollama）

**不适用**：
- 只需要简单文档检索（纯 RAG）→ 直接用向量数据库更轻
- 没有"记住用户"需求的工具 → 多此一举
- 需要自建记忆引擎又不想付费 → Mem0 / Zep 等开源替代
- 超大规模用户（百万级 DAU）→ 自建分布式方案可能更经济

## 技术栈速查

| 层 | 技术 |
|---|---|
| 语言 | TypeScript 65.9%, Python 5.8% |
| 后端 | Remix + Cloudflare Workers |
| 数据库 | Postgres + Cloudflare KV |
| ORM | Drizzle ORM |
| 构建 | Turborepo + Bun |
| UI | Vite + Tailwind CSS |
| 本地版 | 单二进制文件，内嵌图引擎 |

## 学到什么

- **记忆 ≠ RAG**：RAG 是"查文档"，记忆是"记住关于你的事"。Supermemory 把两者合在一起，才是完整的 AI 上下文层
- **用户画像的价值**：不需要每次搜索，系统持续维护 profile 注入到 system prompt，是 50ms 延迟就能获得的"AI 认识你"的体验
- **自动遗忘很重要**：大多数 AI 记忆系统只存不删，Supermemory 的时间感知 + 矛盾消解 + 自动过期是实际可用性的关键
- **一条 baseURL 切换云/本地**：云端和本地共享同一个 API 设计，开发时本地跑，上线切云端，迁移成本为零

## 延伸阅读

- 官方文档：[supermemory.ai/docs](https://supermemory.ai/docs)
- Quickstart：[Quickstart](https://supermemory.ai/docs/quickstart)
- 自托管指南：[Self-hosting](https://supermemory.ai/docs/self-hosting/overview)
- 记忆 vs RAG 详解：[Memory vs RAG](https://supermemory.ai/docs/concepts/memory-vs-rag)
- MemoryBench 基准测试框架：[MemoryBench](https://supermemory.ai/docs/memorybench/overview)
- MCP 文档：[Supermemory MCP](https://supermemory.ai/docs/supermemory-mcp/mcp)

## 关联

- [[memgraph]] — 同样是"记忆"相关项目，但图数据库方向的持久化存储
- [[lancedb]] — 向量数据库，做 RAG 的底层存储层
- [[chroma]] — 轻量级嵌入向量数据库，适合简单 RAG 场景
- [[mem0]] — 另一个 AI 记忆层项目，开源可 self-host
- [[zep]] — 开源 AI 记忆和上下文存储，定位类似
