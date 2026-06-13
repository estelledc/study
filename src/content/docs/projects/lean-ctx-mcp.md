---
title: LeanCTX — AI Agent 的认知上下文层
来源: https://github.com/yvgude/lean-ctx
日期: 2026-06-13
分类: CLI
子分类: 开发者工具
provenance: pipeline-v3
---

# LeanCTX — AI Agent 的认知上下文层

## 一个日常类比

想象你在一家图书馆里帮朋友找书。

没有 LeanCTX 的时候，你每次朋友问"那本书写了什么"，你都重新跑回书架把整本书抄下来。朋友问三次，你就抄了三次。你的笔记本（AI 的 context window）很快就满了。

有了 LeanCTX，就像图书馆给你发了一张智能索引卡：第一次你抄完书的内容后，卡片上记下"这本书已经抄过了"。下次朋友再问，你只需要翻一下卡片，写上"跟上次一样，没变"——只花几秒，而不是重新抄一遍。而且你还记得上次朋友让你找的是"关于数据库的书"，所以这次你直接告诉他上次提到的那本《PostgreSQL 实战》。

LeanCTX 做的事情就是这件事：让 AI Agent 不再反复读取同样的文件，不再浪费宝贵的上下文空间，还能记住之前的对话内容。

---

## 它是什么

LeanCTX（全称 Lean Context）是一个运行在你本地机器上的 Rust 二进制程序，放在 AI 编程工具（如 Cursor、Claude Code、Copilot 等）和你的代码之间。它负责四件事：

1. **压缩（Compression）** — 自动压缩文件读取和命令行输出，减少 60-90% 的 token 消耗
2. **路由（Routing）** — 根据文件类型和查询意图，智能选择最合适的读取深度
3. **记忆（Memory）** — 跨会话保存任务、事实和决策，不会每次新开聊天就"失忆"
4. **验证（Verification）** — 实时仪表盘展示你省了多少 token，以及预算控制

目前提供了 **76 个 MCP 工具**，支持 **30+ 种 AI 编程工具**。

---

## 核心概念一：压缩读取（Read Modes）

AI 工具每次读取文件都会消耗 token。LeanCTX 提供了 10 种读取模式，每种适合不同场景。

比如一个 66 行的 Rust 文件：

- **full 模式**：读取全部 66 行原文（消耗 ~2000 token）
- **map 模式**：只读取导入语句和函数签名（消耗 ~50 token）
- **signatures 模式**：只读取函数签名列表（消耗 ~30 token）
- **缓存重读**：如果文件没变，第二次读取只需 ~13 token

关键数字：第一次读取可能消耗 2000 token，但缓存后的重读只需要 13 token。

### 代码示例一：安装与基本使用

```bash
# 第一步：安装 LeanCTX（任选一种方式）
curl -fsSL https://leanctx.com/install.sh | sh

# 第二步：连接你的 AI 工具（自动检测 Cursor / Claude Code / Copilot 等）
lean-ctx onboard

# 第三步：验证安装
lean-ctx doctor

# 第四步：开始使用。在 AI 工具中正常写代码，LeanCTX 自动在背后工作
# 查看节省了多少 token：
lean-ctx gain
```

安装完成后不需要任何配置改动。你照常使用 AI 编程工具，LeanCTX 通过 MCP 协议自动拦截文件读取和命令执行，进行压缩和缓存。

---

## 核心概念二：Shell 输出压缩

除了读取文件，AI Agent 还会经常执行命令行（如 `git status`、`cargo test`）。这些命令的输出通常很冗长，一条命令就可能消耗几百甚至上千 token。

LeanCTX 内置了 95+ 种命令行输出压缩模式，自动识别并压缩 git、npm、cargo、docker、kubectl 等常见命令的输出。

比如 `git status` 原始输出约 800 token，经过 LeanCTX 压缩后只需约 120 token。

### 代码示例二：文件读取与 Shell 压缩的实际操作

```bash
# --- 文件读取：用 map 模式只看 API 表面 ---
# 这个命令读取 src/server.rs，只返回导入和函数签名
# 而不是整份文件内容
lean-ctx read src/server.rs -m map

# 输出示例：
# server.rs [342L]
#   deps: super::middleware::auth, super::routes::health
#   API:
#     fn ⊛ start_server(host:s, port:u16) @L45-120
#     fn ⊛ register_routes(router:Router) @L122-280
#     fn health_check() @L282-290

# --- Shell 压缩：自动压缩 git 命令输出 ---
# 加上 -c 参数，LeanCTX 会自动压缩命令输出
lean-ctx -c "git status"

# 如果要看原始输出（不压缩），加 --raw
lean-ctx -c "git status" --raw

# --- 查看实时节省数据 ---
# --live 参数会持续更新显示当前节省了多少 token
lean-ctx gain --live
```

---

## 核心概念三：持久记忆（Session Memory）

普通的 AI 对话中，每次开启新聊天，AI 就"忘记"之前的一切。LeanCTX 提供了一个知识图谱和会话记忆系统，让 AI 可以跨会话记住：

- 你正在做什么任务
- 你做过的技术决策
- 项目中的重要事实

```bash
# 查看项目的任务概览
lean-ctx overview

# 回忆之前记住的关于"认证"的事实
lean-ctx knowledge recall "auth"
```

这意味着你可以今天让 AI 帮你搭建认证模块，明天开一个新的聊天窗口，AI 仍然知道认证模块的存在和实现细节。

---

## 核心概念四：属性图（Property Graph）

LeanCTX 在后台构建了一个代码的属性图，记录了文件之间的导入关系、函数调用关系、导出关系等。通过这个图，它可以：

- 分析某个函数被哪些地方引用（影响范围分析）
- 找到相关的文件
- 提供更智能的搜索结果

```bash
# 查看 auth.rs 被修改后会影响哪些文件
lean-ctx graph impact src/auth.rs

# 扫描代码中的异味（code smell）热点
lean-ctx smells scan
```

---

## 架构图解

```
┌─────────────────────────────────────────────────────────┐
│                   你的 AI 编程工具                        │
│         (Cursor / Claude Code / Copilot / ...)          │
└──────────────────────┬──────────────────────────────────┘
                       │ MCP 协议 + Shell 命令
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   LeanCTX (Rust 二进制)                  │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ 压缩引擎  │  │ 路由决策  │  │ 会话记忆  │  │ 属性图  │ │
│  │          │  │          │  │          │  │        │ │
│  │ 10种模式  │  │ 自动选择  │  │ 跨会话    │  │ 代码依赖│ │
│  │ ~13tok   │  │ 意图识别  │  │ 知识图谱  │  │ 影响分析│ │
│  │ 缓存命中  │  │ 自适应    │  │ 结构化恢复│  │ 语义搜索│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│                                                         │
│  76 个 MCP 工具 │ 56 种 Shell 压缩模式 │ 80+ CLI 命令    │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
     你的代码库    命令行输出    知识存储
```

---

## 为什么要关注这个技术

对于 AI 辅助编程来说，最大的瓶颈之一是 **context window 有限且昂贵**。每次 AI 读取文件、执行命令，都在消耗这个有限的资源。

LeanCTX 解决的核心问题是：**如何让 AI 用更少的 token 做更多的事。**

它的价值体现在：

| 场景 | 没有 LeanCTX | 有 LeanCTX |
|------|-------------|-----------|
| 重复读取同一个文件 | ~2000 token/次 | ~13 token/次 |
| `git status` 输出 | ~800 token | ~120 token |
| 跨会话记忆 | 每次新聊天从头开始 | 记住任务和决策 |
| 使用情况可见性 | 完全不可见 | 实时仪表盘 |

对于一个每天使用 AI 编程的人来说，这直接意味着更低的 API 成本和更长的有效对话轮次。

---

## 下一步探索方向

如果你想深入学习，建议按以下顺序：

1. **官方文档**：https://leanctx.com/docs/getting-started — 从零开始的完整指南
2. **每日使用手册**：docs/reference/02-daily-use.md — 最常用的命令和工具
3. **记忆与知识系统**：docs/reference/03-memory-and-knowledge.md — 理解跨会话记忆
4. **代码智能**：docs/reference/04-code-intelligence.md — 属性图和影响分析
5. **全部 76 个 MCP 工具参考**：docs/reference/appendix-mcp-tools.md

---

## 小结

LeanCTX 本质上是一个"上下文管理层"，它在 AI 工具和代码之间充当智能代理。通过压缩、缓存、记忆和图分析，它让 AI Agent 不再浪费宝贵的上下文空间在重复读取和冗长输出上。

对于任何频繁使用 AI 编程工具的人来说，这是一个值得了解的基础设施层。它不需要你改变编程习惯，安装后就能自动工作。
