---
title: AIChat — 终端里的多模型 LLM 客户端
来源: https://github.com/sigoden/aichat
日期: 2026-05-31
分类: AI / CLI
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/sigoden/aichat
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 430416d914896c3534c04b84c0226910c64e3e66
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.30.0
---

## 是什么

AIChat 是一个**装在终端里的“万能 LLM 遥控器”**。日常类比：以前你家电视、空调、机顶盒各有一个遥控器，桌上摆三个；后来出来一个学习型遥控器，按一下就能切。AIChat 之于 LLM 就是这个学习型遥控器——OpenAI、Claude、Gemini、本地 Ollama，全用同一条命令调。

实际操作长这样：

```bash
aichat 一行 awk 怎么按列求和              # 一次性问答
aichat                                     # 进 REPL 交互
aichat -r coder 这段 Rust 怎么改更短       # 用预设角色
aichat --rag notes 我去年记的 HM 是什么    # 对一个目录做检索问答
aichat --serve                             # 起本地 OpenAI 兼容服务
```

它是 Rust 写的单 binary，固定 v0.30.0 的一等能力还包括 `-a` agents、`--macro` 宏、`-f` 直接喂文件/目录/URL——不止是聊天客户端，更像一个终端 LLM 工作台。

## 为什么重要

不理解 AIChat 这类工具，下面这些事说不清：

- 为什么很多人桌面上没装一堆 GPT 客户端，只在终端 alias 一个 `ai`——上下文都在 shell 里，开窗口反而绕远
- 为什么“今天用 Claude，明天换 Gemini”对老用户不痛——client 全登记在一份 yaml 里，`-m` 换个名字就完事
- 为什么一个单机 CLI 能给 IDE 插件当后端——`--serve` 暴露 OpenAI 兼容接口，把多家真实模型统一成一个本地网关
- 为什么“贴一段日志让 LLM 解释”在终端一步完成——它直接接管标准输入：`tail -n 50 a.log | aichat 解释这段错`

## 核心要点

固定 v0.30.0 的能力可以拆成四层：

1. **统一客户端**：注册表原生支持 8 种 client 类型（openai、openai-compatible、claude、gemini、cohere、azure-openai、vertexai、bedrock），另内置 18 个 OpenAI 兼容预设 provider（groq、deepseek、openrouter、mistral 等）。Ollama 就走 `openai-compatible` client。切模型只是 `aichat -m <client>:<model>`。

2. **Roles 与 Sessions**：role 把 system prompt 命名保存——存储形态是 `roles/<name>.md` 单文件（不是 yaml 列表）；session（`-s`）把多轮对话存盘、跨终端恢复，另有 `--empty-session` / `--save-session` 控制生命周期。

3. **Agents / RAG / Macros（重度层）**：`-a` 启动带工具与变量的 agent；`--rag` 对目录建混合检索索引（依赖 `hnsw_rs` 向量近邻 + `bm25` 关键词）；`--macro` 把一串交互固化成宏。function calling 依赖外部仓库 `sigoden/llm-functions` 提供工具集。

4. **Server 模式**：`--serve [地址]` 同时暴露 `/v1/chat/completions`、`/v1/embeddings`、`/v1/rerank` 三个 API 和两个内嵌 Web 页面——LLM Playground（`/playground`）与多模型对比的 Arena（`/arena`）。

四层叠加：底下“统一客户端”足够多数用户用；上面三层是给重度用户的省力工具。

## 实践示例

### 案例 1：alias 进 zshrc，把它当 Unix 工具用

```bash
alias ai=aichat
echo "select * from users where id=1" | ai 这条 SQL 在 PostgreSQL 慢可能因为什么
ai -f ./src/main.rs -f https://example.com/spec.md 对照规范审查这个文件
```

**逐部分**：stdin 不是终端时自动读入管道内容；`-f` 可以混合本地文件、目录与 URL 一起作为上下文。把 LLM 当 grep / awk 一样接管道，是终端用户最大的爽点。

### 案例 2：Role 替你保存 prompt 工程成果

```bash
aichat -r coder 这段 diff 有什么问题 < diff.patch
```

role 存在配置目录的 `roles/coder.md`——一个 Markdown 文件承载一个角色的 system prompt（可带元数据）。调好的 prompt 不再躺在剪贴板里，而是有名字、能进 git 的文件。

### 案例 3：Server 模式当本地 LLM 网关

```bash
aichat --serve 127.0.0.1:8000
```

之后 OpenAI SDK、curl、IDE 插件都能直连 `http://127.0.0.1:8000/v1/chat/completions`，背后路由到 yaml 里配的任何真实模型；`/playground` 给你一个网页调试台，`/arena?num=2` 可以让两个模型对同一问题竞答。等于一个个人版模型网关。

### 案例 4：RAG 把笔记目录变成可问答知识库

```bash
aichat --rag mynotes
```

第一次会引导添加文档来源并建索引；之后同名进入即恢复。检索是向量（hnsw）+ 关键词（bm25）双路混合；文档变更后用 `--rebuild-rag` 同步。个人笔记规模够用，工业级向量库不是它的目标。

## 踩过的坑

1. **Sessions / Roles 是明文存盘**：配置目录下的对话与角色文件可能含敏感上下文，别 commit 进公开 git，也别放共享盘。

2. **RAG 名字打错就新建索引**：`--rag notes` 和 `--rag note` 是两份独立索引，目录大时第二次会重做 embedding。建前先确认名字，改了文档记得 `--rebuild-rag`。

3. **Function calling 不开箱**：需要单独 clone 配置 `sigoden/llm-functions` 工具仓，aichat 本体只带调用协议。新人常以为“装完就能用工具”。

4. **Alt+E 集成依赖终端键位透传**：官方 shell 集成把 zsh 的 `\ee`（Alt+E）绑成“把当前命令行交给 aichat 改写”。部分终端/多路复用器默认不透传 Alt 组合键，需要按各自文档开启（如 tmux 的 `xterm-keys`）。

5. **多模型计费各家自理**：AIChat 不做用量聚合，花了多少钱要回各厂商控制台看；要统一看板得在前面加专职网关。

6. **release 与主分支有距离**：绑定的 v0.30.0 之后主分支仍在演进；对照网上教程时先核对版本，旗标语义以 `aichat --help` 为准。

## 适用 vs 不适用场景

**适用**：

- 主要在终端工作的开发者——上下文已经在 shell 里
- 想“一份配置打通所有模型”的人——同时用云 API + 本地 Ollama
- 想把 prompt 沉淀成可复用命令的人（roles/*.md + sessions）
- 想要一个轻量本地网关 + Playground/Arena 调试台的人（`--serve`）

**不适用**：

- 主要工作流在网页/Notion——GUI 客户端体验更顺
- 团队共享 key 与用量看板——单机工具不做聚合，用专职网关
- 大规模 RAG（几十万文档）——内置索引面向个人笔记级
- 要长链全自动 agent——`-a` agents 偏工具调用编排，复杂多 agent 系统看专门框架

## 固定版本边界

- 本文绑定 `sigoden/aichat@430416d9...`，即 release tag `v0.30.0`，`Cargo.toml` 版本一致；tag 之后主分支仍有提交，本文不描述其变化。
- client 注册表：8 种原生类型 + 18 个 OpenAI 兼容预设 provider；Ollama 经 `openai-compatible` 接入（`config.example.yaml` 有示例）。
- `--serve` 端点：`/v1/chat/completions`、`/v1/embeddings`、`/v1/rerank`、`/playground`、`/arena`。
- roles 存储为 `roles/<name>.md` 单文件；RAG 依赖 `hnsw_rs 0.3.0` + `bm25 2.0.1`；function calling 依赖外部 `sigoden/llm-functions`。
- 本文未安装运行 aichat、未调用任何模型 API、未测启动时间或检索质量，状态保持 `UNVERIFIED`。

## 学到什么

1. **CLI 工具的杀手锏是管道**——能接管 stdin/stdout 的 LLM 工具，比 GUI 多一个数量级的组合空间
2. **配置即接口**——把“切模型/切 prompt/切上下文”压成 yaml 字段与命名文件，认知负担最低
3. **“个人网关”是被低估的形态**——`--serve` 让一个单机 CLI 变成本地统一模型入口，Playground/Arena 顺手解决调试
4. **工具集外置是聪明的边界**——function calling 的工具仓独立成 repo，CLI 本体只承诺协议，两边可以各自演进

## 应用型自测

1. 固定 v0.30.0 里，自定义 role 存成什么形态？
2. `aichat --serve` 除了 chat completions 还暴露哪些能力？
3. 想让 aichat 连本地 Ollama，应该配哪种 client 类型？

检查点：

1. 配置目录下 `roles/<name>.md` 单文件，一个文件一个角色；不是集中式 roles.yaml。
2. `/v1/embeddings`、`/v1/rerank` 两个 API，加 `/playground` 与 `/arena` 两个内嵌 Web 页面。
3. `openai-compatible`（指向 Ollama 的 OpenAI 兼容端点）；示例见仓库 `config.example.yaml`。

## 延伸阅读

- 官方 README：[sigoden/aichat](https://github.com/sigoden/aichat) —— 本文绑定提交 `430416d914896c3534c04b84c0226910c64e3e66`
- 函数调用扩展仓库：[sigoden/llm-functions](https://github.com/sigoden/llm-functions)
- 配置示例：repo 里 `config.example.yaml` 看一遍就懂所有可配置项
- [[ollama]] —— AIChat 最常搭配的本地后端
- [[shell-gpt]] —— 同领域对照：shell 命令助理路线

## 关联

- [[ollama]] —— 本地模型后端，AIChat 经 openai-compatible client 连它
- [[shell-gpt]] —— 同领域竞品；shell-gpt 偏 shell 助理，AIChat 偏通用 LLM 工作台
- [[litellm-proxy]] —— 团队/服务端网关，AIChat 的 `--serve` 是单机版同类
- [[oclif]] —— Node 阵营 CLI 框架；AIChat 是 Rust 阵营的对照（clap 直写）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[opencode]] —— OpenCode — 终端里的开源 AI 编程助手
- [[shell-gpt]] —— shell-gpt — 把 LLM 接进 shell 当命令行助理
