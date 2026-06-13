---
title: agentmemory — 给 AI 编程助手装上「跨会话长期记忆」
来源: 'https://github.com/rohitg00/agentmemory'
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
难度: 初级
provenance: pipeline-v3
---

## 是什么

agentmemory 是一个**让 AI 编程助手记住跨会话历史的持久化记忆引擎**。日常类比：你带一个新同事修代码，第一天讲了半小时鉴权用 JWT、测试在哪个目录、为什么选 jose 不选 jsonwebtoken。第二天他像失忆一样又问一遍。CLAUDE.md 这类内置记忆方案像贴在显示器边的便利贴——容量有限（约 200 行就过时），每次会话整份塞进上下文。agentmemory 则像一个**可搜索、可衰减、可跨工具共享的公司档案室**——助手干活时静默记录，新会话开始时只检索最相关的几条注入。

它基于 TypeScript + iii-engine 构建，核心是一个本地常驻进程（`npx @agentmemory/agentmemory`），用 SQLite 做存储、all-MiniLM-L6-v2 做免费本地嵌入，不需要 Postgres/Redis 等任何外部依赖。支持 Claude Code、Cursor、Codex、Aider、OpenCode 等 16+ 编程工具通过 Hooks / MCP / REST 三种方式接入同一套记忆。

一句话：**内置记忆是静态便签；agentmemory 是可搜索、可衰减、可跨 Agent 共享的记忆引擎。**

## 为什么重要

不理解 agentmemory 所解决的问题，下面这些事都没法解释：

- 为什么你用 Claude Code 改了一下午的 bug，第二天开新会话又要从头解释项目架构——因为 LLM 的上下文窗口在会话结束时**彻底清零**，没有任何持久化
- 为什么 CLAUDE.md 写了几百行后反而效果变差——全文注入会把不相关的内容也塞进上下文，挤占真正需要的 token 预算；agentmemory 按检索结果精准注入约 2000 token
- 为什么你在 Cursor 里说过"别用 jsonwebtoken 要用 jose"，换到 Claude Code 它又不知道了——不同 Agent 各有各的记忆文件，互相不通；agentmemory 一个 server 多 Agent 共享
- 为什么企业里推广 AI 编程助手阻力大——老员工知道所有坑，但 AI 不知道，每次都要人教；记忆系统让 AI 的知识随使用积累而不是归零

## 核心要点

agentmemory 的记忆机制可以拆成**三步**：

1. **捕获——干活时自动记录**：通过 Hooks 在 Agent 生命周期里安静地观察。以 Claude Code 为例，plugin 注册 12 个 hook：`SessionStart` 记项目路径、`PostToolUse` 记工具调用的输入输出、`PostToolUseFailure` 记错误上下文、`SessionEnd` 做会话摘要。类比：像行车记录仪，你正常开车，它自动录像——不需要每次说"请记住"。

2. **压缩——从原始记录里提炼事实**：原始 observation 经过 SHA-256 去重（5 分钟窗口）、隐私过滤（剥离 API Key）、LLM 压缩，变成结构化记忆。记忆分四层巩固（类比人脑）：Working（工具调用的原始观察）→ Episodic（会话级摘要："发生了什么"）→ Semantic（抽取的事实与模式："我知道什么"）→ Procedural（工作流与决策模式："怎么做"）。记忆还按艾宾浩斯曲线自动衰减——常访问的加强，陈旧的淘汰。

3. **检索——新会话只拿最相关的几条**：SessionStart 时加载项目 profile，然后走三道并行检索：BM25 做关键词精确匹配（"auth middleware" 命中对应条目）、向量嵌入做语义相似（"数据库变慢" 命中"N+1 查询修复"）、知识图谱做关联遍历（"和 JWT 相关的所有文件和决策"）。三路结果用 RRF（Reciprocal Rank Fusion, k=60）融合，且限制单次会话最多贡献 3 条——避免某次长时间 debug 会话把其他历史记忆全挤掉。

三步加起来就是**「捕获 → 压缩 → 索引 → 按需召回」**四段式闭环。

## 实践案例

### 案例 1：REST API — 手动写入与混合搜索

适合 Aider、CI 脚本或任何能发 HTTP 的 Agent。启动 server 后直接 curl：

```bash
# 启动 memory server
npx @agentmemory/agentmemory

# 写入一条长期记忆
curl -s -X POST http://localhost:3111/agentmemory/remember \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "content": "Auth uses jose JWT middleware in src/middleware/auth.ts; tests in test/auth.test.ts",
    "tags": ["auth", "decision"]
  }'

# 混合语义 + 关键词搜索（搜"token 怎么验证"能命中上面那条）
curl -s -X POST http://localhost:3111/agentmemory/smart-search \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "query": "how does token validation work",
    "limit": 5
  }'

# 新会话开始时拉取注入用上下文块
curl -s -X POST http://localhost:3111/agentmemory/context \
  -H 'Content-Type: application/json' \
  -d '{
    "project": "my-api",
    "query": "rate limiting configuration",
    "maxTokens": 2000
  }'
```

**关键点**：`smart-search` 搜"token validation"能命中"jose JWT middleware"——纯关键词 grep 做不到这种跨表述匹配。`context` 端点直接返回格式化好的注入文本，Agent 拼到 system prompt 里就能用。

### 案例 2：Python iii-sdk — 直连引擎函数

agentmemory 的核心操作也注册为 iii 函数（`mem::remember`、`mem::smart-search`、`mem::context`），任意语言装 iii-sdk 走 WebSocket 即可调用，不必为每种语言写 REST 客户端：

```python
from iii import register_worker

iii = register_worker("ws://localhost:49134")
iii.connect()

# 语义检索：等价于 REST 的 smart-search
result = iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {
        "project": "demo",
        "query": "how do tokens refresh",
        "limit": 5,
    },
})
print(result)

# 记住一条洞察
iii.trigger({
    "function_id": "mem::remember",
    "payload": {
        "project": "demo",
        "content": "Chose jose over jsonwebtoken for Edge runtime compatibility",
    },
})
```

**关键点**：Python 项目不走 REST 而是走 WebSocket RPC，延迟更低。iii-sdk 也支持 JS/Go/Rust 等多语言。

### 案例 3：Claude Code Hooks — 零手动捕获

装 plugin 后，agentmemory 注册约 12 个生命周期 hook，修 bug 的过程**本身**就变成可检索记忆：

```bash
# 一键安装 + 注册 hooks
agentmemory connect claude-code --with-hooks
```

此后每次用 Claude Code：`SessionStart` 自动拉取项目记忆注入上下文 → `PostToolUse` 自动记录你读了什么文件、跑了什么命令 → `SessionEnd` 自动生成会话摘要、抽取知识图谱节点。你不需要说"请记住"——Agent 修过的每个 bug、做过的每次决策，都会被静默压缩成可检索条目。第二天开新会话问"我们 auth 怎么做的"，Agent 直接从记忆里召回而不需要你复述。

## 踩过的坑

1. **MCP shim 只有 7 个 tool**：没起 `agentmemory` server 或 `AGENTMEMORY_URL` 没指向 `localhost:3111`，Cursor 里只看到 7 个退化工具而非完整 53 个——很多人以为"装好了"其实只装了一半。
2. **AGENTMEMORY_INJECT_CONTEXT 默认关闭**：README 宣传的"Agent 自动了解你的技术栈"需要手动设这个环境变量为 `1` 才会在会话开始时自动注入记忆——很多人装完发现 Agent 还是记不住，就是因为这个开关没开。
3. **Stop-hook 递归曾烧配额**：早期版本 Stop hook 里调用了需要 memory 的操作，形成无限递归（#149/#181），有人因此烧掉了 Claude Pro 配额——已修复，但说明 hook 链配错有资源风险。
4. **中文项目需要额外装分词库**：默认 Porter 词干提取只支持英文。中日韩文本需手动 `npm install @node-rs/jieba tiny-segmenter`，否则中文关键词检索效果打折扣。
5. **iii-engine 锁定 + 单维护者风险**：强依赖作者团队维护的 `iii-engine v0.11.x`，约 90% commits 来自一人——如果 iii-engine 停更或作者转向，整个记忆系统可能断档。

## 适用 vs 不适用场景

**适用**：

- 同一项目用多个编程 Agent（Claude Code + Cursor + Aider），希望它们共享同一套历史记忆
- 项目架构复杂、约定多，每次新会话都要解释 5 分钟以上——agentmemory 能把首次解释成本压到接近零
- 团队希望"AI 的知识随使用积累"——老员工的坑被 AI 记住后，新人用 AI 时自动获得这些经验
- 不想依赖云服务（Mem0/Letta 需要 Postgres + 向量库），希望一个 `npx` 命令就能跑

**不适用**：

- 项目极简单、约定极少（比如单文件脚本），CLAUDE.md 的 200 行已经够用——agentmemory 的启动和 hook 开销不值得
- 不愿常驻一个本地 server 进程——agentmemory 需要跑一个 daemon，占用约 100-200MB 内存
- 团队有严格的本地进程管控或安全沙箱限制——MCP/REST/WebSocket 三个端口需要放行
- 需要 Python 原生 SDK 深度集成——目前主要面向 Node/TS 生态，Python 只能走 REST 或 WebSocket RPC

## 历史小故事（可跳过）

- **2025 年中**：CNCF Ambassador / Docker Captain Rohit Ghumare 在多项目间反复给 AI 解释架构，恼火之下开始写 agentmemory——最初只是一个给 Claude Code 用的本地 JSON 文件记录器。
- **2025 年 8 月**：基于 iii-engine（同名团队维护的分布式 Agent 运行时）重写，引入 Hooks 自动捕获 + BM25 检索，在 Hacker News 上获得第一波关注。
- **2025 年底**：发布 benchmark，在 LongMemEval-S（ICLR 2025 记忆评测基准，500 道题）上宣称 R@5 达 95.2%，远超同期竞品 mem0（68.5%）和 Letta（83.2%）。GitHub stars 迅速突破 19.9k。
- **2026 年初**：支持扩到 16+ 编程工具（Claude Code / Cursor / Codex / Aider / OpenCode 等），加入知识图谱检索、四层记忆巩固和艾宾浩斯衰减——从一个"记忆插件"长成了"Agent 记忆基础设施"。

## 学到什么

1. **记忆外置是 AI Agent 从"工具"变成"同事"的关键一步**——没有跨会话记忆的 Agent 永远是第一天上班的新人；有了记忆，它才能积累经验、避免重复犯错、利用过去的决策。
2. **"捕获 → 压缩 → 索引 → 召回"四段式闭环是记忆系统的通用解法**——不仅是 agentmemory，Mem0、Letta、甚至 ChatGPT 的 memory 功能都遵循这个模式。理解了这四步，再看任何记忆系统都能快速抓住要点。
3. **混合检索比纯向量或纯关键词都强**——BM25 守住精确匹配的下限，向量嵌入覆盖语义相似的上限，知识图谱补充关联遍历。三路融合的设计比单纯依赖一种检索方式更鲁棒。
4. **自动捕获比手动记录重要得多**——如果每次都要用户说"请记住"，记忆系统就失败了。agentmemory 的设计哲学是：修 bug 的过程本身就变成记忆，不需要额外操作。

## 延伸阅读

- GitHub 仓库：[rohitg00/agentmemory](https://github.com/rohitg00/agentmemory)（README 含完整架构图、benchmark 对比和快速上手 demo）
- Benchmark 详解：[benchmark/COMPARISON.md](https://github.com/rohitg00/agentmemory/blob/main/benchmark/COMPARISON.md)（mem0 vs Letta vs agentmemory 的定量对比）
- 中文深度拆解：[让 Coding Agent 记得住：agentmemory 的长期记忆系统拆解](https://blog.csdn.net/Dong_J/article/details/161292350)
- [[mem0]] —— 竞品记忆方案，云端优先，需要 Qdrant/pgvector，适合已有向量库基础设施的团队
- [[letta]] —— 前身 MemGPT，从"有记忆的 Agent"方向切入，提供完整 Agent 运行时而非仅记忆层
- [[rag-lewis-2020]] —— RAG（检索增强生成）是 agentmemory 检索机制的理论基础：先检索再生成，精度远高于纯生成

## 关联

- [[mem0]] —— 竞品云端记忆方案，设计思路类似但部署依赖更重（需要向量数据库），适合已有基础设施的团队
- [[letta]] —— 前身 MemGPT，走"有记忆的 Agent 运行时"路线，不仅做记忆层还管 Agent 调度
- [[codegraph]] —— 代码知识图谱项目，和 agentmemory 互补：agentmemory 记"做过什么"，codegraph 补"结构是什么"
- [[claude-code]] —— agentmemory 的首要集成目标，提供 12 个生命周期 hook + 53 个 MCP tool
- [[mcp-spec]] —— MCP 协议是 agentmemory 跨 Agent 互通的关键通道，Cursor/Cline 等通过 MCP 接入同一套记忆
- [[sqlite]] —— agentmemory 的默认存储引擎，零配置、零外部依赖，是它能"一个 npx 就跑起来"的基础
- [[supermemory]] —— 另一个开源记忆项目，侧重浏览器书签和网页内容的记忆，与 agentmemory 的编程 Agent 记忆定位不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[domain-expertise-real-moat]] —— Domain expertise has always been the real moat
- [[mcp-spec]] —— MCP — 让一个 LLM 客户端能插任何外部能力的 USB 协议
- [[pi-subagents]] —— pi-subagents — 给 Pi 装一个"派活"插件
- [[rag-lewis-2020]] —— RAG (Lewis 2020) — 检索增强生成奠基
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

