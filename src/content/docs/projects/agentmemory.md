---
title: "agentmemory — 让 AI 编码代理拥有持久记忆的引擎"
来源: https://github.com/rohitg00/agentmemory
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 一、从"每次重来"说起

你有没有过这种经历：今天花半小时让 Claude Code 搭好了一个 JWT 认证模块，明天想让 agent 加个限流功能，结果它又问你一遍——"你的认证放在哪？用的什么库？"

这是因为大多数 AI 编码代理（Claude Code、Cursor、Codex CLI 等）在每次会话开始时都是"失忆"的。它们自带的记忆机制（比如 `CLAUDE.md` 或 `.cursorrules`）最多只能写两百行，而且不会自动更新。

agentmemory 做的事情很简单：它在后台默默运行，记录你每一次编码对话中 agent 做了什么，然后把这些信息压缩成可搜索的结构化记忆。下次会话开始时，agent 自动获取相关上下文，不需要你重新解释。

核心思路类比：把它想象成一个项目的"第二大脑"。你不需要把整本手册塞给 agent，它只需要知道最相关的那几页。

## 二、核心概念

### 2.1 记忆管道（Memory Pipeline）

agentmemory 的工作流程可以分成三个阶段：

1. **捕获**：通过 hooks（钩子）自动记录 agent 的每一次操作——用户说了什么、调了什么工具、读写了什么文件
2. **压缩**：把原始记录压缩成结构化的事实、概念和叙事，生成向量嵌入并索引
3. **注入**：下次会话开始时，根据当前任务语义搜索相关记忆，只把最相关的部分注入到对话上下文中

### 2.2 四层记忆巩固

受人类记忆机制启发，agentmemory 把记忆分为四个层级：

| 层级 | 内容 | 人类类比 |
|------|------|----------|
| Working（工作记忆） | 原始观察记录 | 短期记忆 |
| Episodic（情景记忆） | 压缩后的会话摘要 | "发生了什么" |
| Semantic（语义记忆） | 提取的事实和模式 | "我知道什么" |
| Procedural（程序记忆） | 工作流和决策模式 | "怎么做" |

记忆会随时间衰减（遵循艾宾浩斯曲线），频繁访问的记忆会加强，过时的记忆会被自动淘汰。

### 2.3 三重检索

搜索不是简单的关键词匹配，而是三路融合：

- **BM25**：关键词匹配，带同义词扩展
- **向量**：语义相似度（余弦距离）
- **知识图谱**：通过实体匹配进行图谱遍历

三路结果用 RRF（Reciprocal Rank Fusion，倒数排名融合）算法合并，每个会话最多取 3 条结果。

## 三、代码示例

### 示例 1：安装与启动

最简单的用法就是一行命令：

```bash
# 全局安装
npm install -g @agentmemory/agentmemory

# 启动记忆服务器（默认监听端口 3111）
agentmemory

# 或者用 npx 临时运行（不需要安装）
npx @agentmemory/agentmemory
```

启动后，打开 `http://localhost:3113` 可以看到实时的记忆构建界面。

### 示例 2：连接 Claude Code

安装好服务器后，把 agentmemory 接入 Claude Code：

```bash
# 方法一：使用内置插件（推荐，自动注册 12 个 hooks + 15 个 skills）
/plugin marketplace add rohitg00/agentmemory
/plugin install agentmemory

# 方法二：手动配置 MCP（适合不需要 hooks 的场景）
# 在 ~/.claude.json 的 mcpServers 中添加：
{
  "mcpServers": {
    "agentmemory": {
      "command": "npx",
      "args": ["-y", "@agentmemory/mcp"],
      "env": {
        "AGENTMEMORY_URL": "http://localhost:3111"
      }
    }
  }
}
```

接入之后，agentmemory 会自动捕获 Claude Code 的 12 个生命周期事件（SessionStart、UserPromptSubmit、PreToolUse、PostToolUse 等），全程零手动操作。

### 示例 3：使用 Python SDK 调用记忆搜索

agentmemory 的核心操作注册为 iii 函数，任何有 iii SDK 的语言都可以直接调用：

```python
from iii import register_worker

# 连接到本地 agentmemory 服务器
iii = register_worker("ws://localhost:49134")
iii.connect()

# 执行语义搜索
result = iii.trigger({
    "function_id": "mem::smart-search",
    "payload": {
        "project": "my-project",
        "query": "how do tokens refresh"
    },
})

print(result)
# 返回与"token 刷新"相关的结构化记忆片段
```

支持的 SDK：
- Python: `pip install iii-sdk`
- Rust: `cargo add iii-sdk`
- Node: `npm install iii-sdk`

### 示例 4：REST API 直接调用

即使没有 iii 运行时，也可以通过 REST API 访问：

```bash
# 智能搜索
curl -X POST http://localhost:3111/agentmemory/smart-search \
  -H "Content-Type: application/json" \
  -d '{"query": "auth middleware", "project": "demo"}'

# 手动保存一条记忆
curl -X POST http://localhost:3111/agentmemory/save \
  -H "Content-Type: application/json" \
  -d '{
    "project": "demo",
    "content": "用户偏好使用 jose 而非 jsonwebtoken，因为需要 Edge 兼容性"
  }'
```

## 四、关键特性一览

**自动捕获**：12 个 hooks 覆盖完整的会话生命周期，零手动配置。每次工具调用、文件访问、错误信息都会被记录。

**隐私保护**：存储前自动过滤 API 密钥、密码等敏感信息，还支持 `<private>` 标签标记的内容不会被记录。

**自我修复**：内置熔断器、提供者降级链和健康监控。如果某个嵌入模型不可用，会自动切换到下一个备选。

**记忆治理**：支持 TTL 过期自动淘汰、矛盾检测、重要性淘汰。记忆不是无限增长的。

**跨代理共享**：通过 MCP 协议和 REST API，多个不同的编码代理可以共享同一份记忆。一个服务器，所有代理通用。

**实时可视化**：端口 3113 上的 Web 界面可以实时查看记忆构建过程，还有会话回放功能，支持播放/暂停、速度调节（0.5x-4x）。

## 五、基准测试亮点

agentmemory 在公开基准 LongMemEval-S（500 个问题）上取得了：

- **R@5 = 95.2%**（检索 Top5 中包含正确答案的概率）
- **R@10 = 98.6%**
- **MRR = 88.2%**（平均倒数排名的均值）

作为对比，纯 BM25 回退方案的 R@5 只有 86.2%。

在 Token 节省方面，相比每次都粘贴完整上下文（每年 1950 万 Token），agentmemory 每年只需约 17 万 Token，节省约 92%，年成本约 10 美元。如果使用本地嵌入模型（如 `all-MiniLM-L6-v2`），成本可以降到 0。

## 六、生态定位

agentmemory 对标的项目包括 mem0、Letta/MemGPT、Khoj 等。它的差异化在于：

- **零外部依赖**：只用 SQLite + iii-engine，不需要 Qdrant、Postgres 等额外数据库
- **无框架锁定**：支持任何 MCP 客户端，不限于特定 AI 代理
- **开箱即用的集成**：支持 30+ 种编码代理（Claude Code、Cursor、Codex CLI、Gemini CLI、OpenCode 等），每种都有对应的安装指南

## 七、总结

agentmemory 解决的是一个朴素但重要的问题：AI 编码代理不该每次会话都从零开始。它通过自动捕获、智能压缩、语义检索三个环节，让 agent 像有一个不断成长的项目知识库一样工作。

对于正在使用 AI 编码代理的人来说，这可能是目前最成熟的持久记忆解决方案之一。它的零外部依赖设计和广泛的代理兼容性，让它既适合个人开发者快速上手，也适合团队部署共享记忆。

如果你想深入了解，推荐阅读项目中的 `benchmark/` 目录下的基准报告，以及 `docs/recipes/pairings.md` 中关于与其他知识图谱工具配合使用的配方。
