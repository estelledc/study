---
title: Context Mode — 守护 AI 编码代理「记忆」的中间件
来源: https://github.com/mksglu/context-mode
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

## 日常类比：塞满的笔记本

想象你有一个实习生（AI 编码代理），他面前只摊开了一本笔记本——这笔记本的每页空间就是 **context window（上下文窗口）**。

每次实习生用工具读到文件、跑终端命令、抓取网页，工具的 **原始输出** 都会直接写进这本笔记。跑 30 分钟后，笔记里一半的空间都被 `npm test` 的输出、Playwright 的截图描述、GitHub issue 的正文占满了——真正重要的"我在改哪个文件""刚才你让我做什么"反而被挤出去了。更糟的是，当笔记本写满、AI 决定"把前面的对话压缩一下腾空间"时，它会 **忘记自己正在改什么**，就像人撕掉了笔记本的前半页。

**Context Mode 就是一套给这本笔记本装上"外部存储 + 书签"的系统。** 它把工具产生的大量原始数据从笔记本里拎出去，存到磁盘上的数据库里；AI 要做回顾时，只查"书签"（关键词搜索），把最需要的内容誊抄回来——笔记本空间从 315 KB 降到 5.4 KB，**节省了 98%**。

官方仓库：[mksglu/context-mode](https://github.com/mksglu/context-mode)（17.3k+ star），开源 ELv2 协议。

---

## 它解决什么问题

AI 编码代理（Claude Code、Cursor、VS Code Copilot 等）在长时间工作中会遇到 **context 耗尽**：

1. **工具输出占领上下文**：一个 Playwright 页面快照 56 KB，20 个 GitHub issue 59 KB，一条访问日志 45 KB。30 分钟后 40% 的上下文就消失了。
2. **对话压缩导致遗忘**：当代理为腾出空间而压缩（compact）对话时，它会忘记正在编辑哪些文件、哪些任务进行中。
3. **LLM 被当"数据处理器"而非"代码生成器"**：为了统计 50 个文件里的函数数量，代理需要逐个读取全部文件（700 KB），而不是一行脚本题目就解决了。

Context Mode 从三个方向解决这些问题。

---

## 核心概念拆解

### 1. Context Saving（上下文沙箱）

这是最核心的机制。Context Mode 作为一个 **MCP Server**（Model Context Protocol 服务器），在代理和工具之间架了一层"拦截器"。

**类比**：就像银行保险柜。你把贵重物品（工具原始输出）放进保险柜（磁盘数据库），手里只留一张小纸条（引用 ID）。需要时去保险柜取，不需要时纸条本身几乎不占空间。

**具体行为**：
- 当代理执行 Bash、Read、WebFetch 等会产生大量输出的工具时，Context Mode 在后台拦截结果
- 原始数据写入本地 SQLite 数据库（不进入对话上下文）
- 代理的对话窗口里只保留一条简短的引用标记
- 效果：315 KB → 5.4 KB（98% 节省）

### 2. Session Continuity（会话连续性）

每次对话结束后，Context Mode 把 **所有关键操作** 记录到 SQLite 里：文件编辑、git 操作、任务状态、用户决策、错误信息。

当新会话启动、或旧对话被压缩后，代理可以通过 **FTS5 全文搜索 + BM25 算法** 精确检索出上次做到哪了，而不是盲目地重新翻代码。

**类比**：就像看电视剧——上一集结束时的"上集回顾"帮你无缝衔接，而不需要你重看整部剧。

### 3. Think in Code（用代码思考）

这是一个范式转换的理念：**LLM 应该写代码来做分析，而不是把数据全部塞进上下文来计算。**

**类比**：与其手动翻 50 本书数页数，不如写一行 Python 脚本让电脑帮你数——你只需要看输出数字，不需要看到 50 本书的全文。

---

## 代码示例

### 示例 1：用 `ctx_execute` 替代多次文件读取

**没有 Context Mode 的做法**（暴力逐个读取）：

```javascript
// 代理需要逐个 Read 50 个 .ts 文件
// 总消耗 ≈ 700 KB 的上下文

Read("src/file1.ts")    // ~14 KB
Read("src/file2.ts")    // ~14 KB
Read("src/file3.ts")    // ~14 KB
// ... 重复 50 次
// 输出总计 700 KB，context window 被塞满
```

**用 Context Mode 的做法**（只跑一个脚本，结果只占 3.6 KB）：

```javascript
// ctx_execute 在沙箱环境里运行脚本
// 原始数据不入上下文，只返回结果
ctx_execute("javascript", `
  const fs = require('fs');
  const path = require('path');
  const files = fs.readdirSync('src')
    .filter(f => f.endsWith('.ts'));
  files.forEach(f => {
    const lines = fs.readFileSync(path.join('src', f), 'utf8')
      .split('\\n').length;
    console.log(f + ': ' + lines + ' lines');
  });
`);

// 输出只有精简的结果，约 3.6 KB：
// auth.ts: 342 lines
// user.ts: 128 lines
// ...
```

对比：**47 次 Read 操作 → 1 次 ctx_execute 调用，上下文消耗从 700 KB 降到 3.6 KB，约 200 倍节省。**

### 示例 2：用 `ctx_index` + `ctx_search` 实现知识库检索

**场景**：你需要在一个大型项目里找到所有包含"用户认证"的文件。没有 Context Mode 时，代理需要 `grep` 全部文件，输出可能几十 KB。

```javascript
// 第一步：把项目文件索引到 FTS5 数据库（一次性操作）
ctx_index("src", { recursive: true });

// 第二步：之后每次搜索只返回相关片段
ctx_search("用户认证 密码");

// FTS5 返回精准匹配的文件路径和行内容
// 而不是把整个项目的 grep 结果塞进上下文
```

**类比**：`ctx_index` 就像给图书馆编目录卡片，`ctx_search` 就是查目录——你得到的是精准的书籍定位，而不是把整个图书馆的书架描述搬回家。

### 示例 3：查看上下文节省统计

```javascript
// 随时查看当前会话的上下文节省情况
ctx_stats();

// 输出示例：
// ┌──────────────────────────────────────────┐
// │ Session Savings                          │
// ├──────────────────────────────────────────┤
// │ Bash:     342 KB saved (97% reduction)  │
// │ Read:      89 KB saved (95% reduction)  │
// │ WebFetch: 120 KB saved (99% reduction)  │
// ├──────────────────────────────────────────┤
// │ Total saved: 551 KB of context window   │
// │ Efficiency:  89%                        │
// └──────────────────────────────────────────┘
```

---

## 支持的平台

Context Mode 目前支持 **16 个平台**，分为几种安装模式：

| 平台 | 安装方式 | 路由方式 |
|------|----------|----------|
| **Claude Code** | `/plugin marketplace` 一键安装 | 自动（Hook 注入） |
| **Gemini CLI** | `npm install -g` + 配置 hooks | 自动（Hook 注入） |
| **VS Code Copilot** | `mcp.json` + hooks.json | 自动（Hook 注入） |
| **Cursor** | 本地文件夹 / 未来 Marketplace | 半自动（Rules 文件） |
| **OpenCode** | `plugin: ["context-mode"]` | 自动（TypeScript 插件） |
| **Codex CLI** | Marketplace 插件 | 自动（Hook 注入） |

核心工具共 **11 个**，分为两类：

- **6 个沙箱工具**：`ctx_execute`、`ctx_execute_file`、`ctx_batch_execute`、`ctx_index`、`ctx_search`、`ctx_fetch_and_index`
- **5 个元工具**：`ctx_stats`（统计）、`ctx_doctor`（诊断）、`ctx_upgrade`（升级）、`ctx_purge`（清除）、`ctx_insight`（个人分析面板）

---

## 为什么值得关注

1. **解决的是 AI 编程的"隐形瓶颈"**：大多数教程关注 LLM 模型本身，但上下文窗口耗尽这个工程问题同样致命——模型再聪明，context 满了也会"失忆"。
2. **98% 的节省数据很震撼**：这不是理论优化，是真实可量化的效果。
3. **不改变你的工作流**：它是 MCP 服务器，装上去就工作，不需要改代码、不改模型、不改使用习惯。
4. **跨平台生态建设**：从 Claude Code 到 Codex 到 Cursor，覆盖面极广，是 MCP 生态里最有野心的基础设施之一。

---

## 思考题

Context Mode 选择把工具输出"偷偷"移到沙箱里，而不在每次调用前征求你的同意——你觉得这种设计在便利性和透明度之间平衡得怎么样？有没有你可能担心的地方？
