---
title: AIChat — 终端里的多模型 LLM 客户端
来源: https://github.com/sigoden/aichat
日期: 2026-05-31
分类: AI / CLI
难度: 入门
---

## 是什么

AIChat 是一个**装在终端里的"万能 LLM 遥控器"**。日常类比：以前你家电视、空调、机顶盒各有一个遥控器，桌上摆三个；后来出来一个学习型遥控器，按一下就能切。AIChat 之于 LLM 就是这个学习型遥控器——OpenAI、Claude、Gemini、本地 Ollama，全用同一条命令调。

实际操作长这样：

```bash
aichat 一行 awk 怎么按列求和              # 一次性问答
aichat                                       # 进 REPL 交互
aichat -r coder 这段 Rust 怎么改更短      # 用预设角色
aichat --rag notes 我去年记过 HM 是什么  # 对一个目录做检索
aichat --serve                               # 起本地 OpenAI 兼容服务
```

它本身是 Rust 写的单 binary，`brew install aichat` 或 `cargo install aichat` 一条命令到位，启动 10 ms 级，可以直接 alias 进 `.zshrc`。

## 为什么重要

不理解 AIChat，下面这些事说不清：

- 为什么很多人桌面上没装一堆 GPT 客户端，只在终端 alias 一个 `ai`——上下文都在 shell 里，开窗口反而绕远
- 为什么"今天用 Claude，明天换 Gemini"对老用户不痛——配置全在一份 yaml，模型字段改一行就完事
- 为什么 Cursor / Continue 这些 IDE 插件可以直连"任何模型"——背后常常是 AIChat / LiteLLM 之类的 OpenAI 兼容网关在转
- 为什么"贴一段日志让 LLM 解释"在终端就能做——AIChat 直接接管标准输入：`tail -n 50 a.log | aichat 解释这段错`

一句话：**把每个 LLM 厂商各自一套 SDK 的混乱，移到了一份 yaml 里**。

## 核心要点

AIChat 的能力可以拆成 **四层**：

1. **统一客户端**：`config.yaml` 里登记多个 client，每个 client 有 api_key + 一组 models。切模型只是 `aichat -m claude:claude-3-5-sonnet`。
2. **Roles（角色）**：把 system prompt + 模型 + 温度命名保存。比如建一个 `coder` 角色专门做代码审查，下次直接 `aichat -r coder`，不必每次粘贴 prompt。
3. **Sessions（会话）**：多轮对话存到磁盘，命名后可跨终端恢复。`aichat -s debug-mod` 进入名为 debug-mod 的长对话，关电脑明天接着聊。
4. **RAG + Function Calling（高级）**：`--rag` 把一个文件夹自动做 embedding 检索；装上 `llm-functions` 仓库后可让模型调本地工具（跑 shell、搜网、读写文件）。

四层是叠加的：底下"统一客户端"足够 80% 用户用；上面三层是给重度用户的省力工具。

## 实践案例

### 案例 1：alias 进 zshrc，把它当 Unix 工具用

```bash
alias ai=aichat
echo "select * from users where id=1" | ai 这条 SQL 在 PostgreSQL 慢可能因为什么
```

把 LLM 当 grep / awk 一样接管道，是终端用户最大的爽点。GUI 客户端做不到——你不可能"右键复制 → 切窗口 → 粘贴 → 等回答"五步当一步用。

### 案例 2：Roles 替你保存"prompt 工程"成果

调过几天 prompt 调出一个能干活的版本，与其反复粘贴，不如：

```yaml
# ~/.config/aichat/roles.yaml
- name: code-reviewer
  prompt: |
    You are a senior reviewer. Focus on bugs and unclear naming. Output bullets.
  model: anthropic:claude-3-5-sonnet
  temperature: 0.2
```

之后 `aichat -r code-reviewer < diff.patch`，prompt 工程结果固化成了一条命令。

### 案例 3：Server 模式当本地 LLM 网关

```bash
aichat --serve 8080
```

它会在 `localhost:8080/v1/chat/completions` 暴露一个 **OpenAI 协议**接口，背后路由到你 yaml 里配的所有真实模型。Cursor、Continue、curl、OpenAI SDK 都能直连，等于一个轻量版 LiteLLM Proxy。

### 案例 4：用 RAG 把笔记目录变成可问答的知识库

```bash
aichat --rag mynotes
> 添加目录 ~/notes
> 提问：去年我记过 Hindley-Milner 是怎么解释的？
```

第一次会扫目录、做 embedding、存索引；之后每次开 `--rag mynotes` 直接进检索状态。对个人笔记（几百到几千篇 markdown）够用；底层用 hnsw 做近似最近邻。

## 踩过的坑

1. **Sessions / Roles 是明文存盘**：`~/.config/aichat/` 下整个目录别 commit 进 git，里面的对话日志可能含 token、内部链接。建议加进 `.gitignore`，或者把目录设到加密盘。

2. **RAG 名字打错就重建索引**：`aichat --rag notes` 和 `aichat --rag note` 是两份索引；如果你目录大，第二次会把 embedding 重做一次。第一次建 RAG 前先确认名字。

3. **Function calling 不是开箱即用**：你需要再 clone `sigoden/llm-functions`，配 PATH，AIChat 才能找到工具。官方 README 把这一步藏在二级文档里，新人容易以为坏了。

4. **Alt+e shell 集成被 tmux 吞**：`aichat -e '把超过 100M 的文件列出来'` 把自然语言转成 shell 命令，但 tmux 默认会吃掉 Alt 键。需要在 `~/.tmux.conf` 加一行 `set -g xterm-keys on`。

5. **多模型 token 计费靠各家自己**：AIChat 不做用量聚合，要看花了多少钱得回各厂商控制台。需要看板就用 LiteLLM Proxy。

6. **配置变更不会热加载**：改完 `config.yaml` 后正在跑的 REPL 不会感知，要 `.exit` 重进。Server 模式同样要重启进程。

## 适用 vs 不适用场景

**适用**：

- 主要在终端工作的开发者——上下文已经在 shell 里
- 想"一份配置打通所有模型"的人——尤其同时用云 API + 本地 Ollama
- 想把 prompt 沉淀成可复用命令的人（Roles）
- 想要一个轻量本地网关给 IDE 插件用的人（Server 模式）

**不适用**：

- 主要工作流在网页/Notion——GUI 客户端体验更顺
- 团队共享配置——AIChat 是单机工具，多人共享 key 应该用 LiteLLM Proxy / OneAPI
- 要做大规模 RAG（几十万文档）——内置 RAG 是给"个人笔记级"的，工业级要专门的向量库
- 想要"自动 agent 跑长任务"——AIChat 的 function calling 偏短链；长链 agent 看 LangChain / autogen

## 历史小故事（可跳过）

- **2023 年初**：作者 sigoden（也写过 dufs、argc）用 Rust 起了 AIChat，最早只是个 OpenAI CLI wrapper。
- **2023 年末**：加了 Roles + Sessions，开始向"提示词工程工具"的方向走。
- **2024 年**：加 Function Calling、RAG、Server 模式，成为终端 LLM 客户端里功能最齐的之一，star 数飞涨。
- **2025 年起**：基本和"本地 LLM 三件套（Ollama 跑模型 + AIChat 当客户端 + LiteLLM 当网关）"被一起推荐。

## 学到什么

1. **CLI 工具的杀手锏是管道**——能接管 stdin/stdout 的 LLM 工具，比 GUI 多一个数量级的组合空间
2. **配置即接口**：把"切模型/切 prompt/切上下文"全压成 yaml 字段，用户的认知负担最低
3. **Roles + Sessions 是 prompt 工程的归宿**——调好的 prompt 不应该躺在剪贴板，应该有命名、能 git 管
4. **单 binary > 装一堆依赖**：Rust 工具链在 LLM 客户端这一格已经形成事实优势（aichat / sniffnet / fnm / ripgrep）

## 延伸阅读

- 官方 README：[sigoden/aichat](https://github.com/sigoden/aichat)（5 分钟扫一遍 examples 章节即可）
- 函数调用扩展仓库：[sigoden/llm-functions](https://github.com/sigoden/llm-functions)
- 配置示例文件夹：repo 里 `config.example.yaml` 看一遍就懂所有可配置项
- [[ollama]] —— AIChat 最常搭配的本地后端
- [[litellm-proxy]] —— 团队级网关；AIChat 是个人级网关

## 关联

- [[ollama]] —— 本地模型后端，AIChat 通过 client: ollama 连它
- [[litellm-proxy]] —— 团队/服务端网关，AIChat 是单机版本的同类
- [[oclif]] —— Node 阵营 CLI 框架；AIChat 是 Rust 阵营的极简反例（不用框架，直接 clap）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[opencode]] —— OpenCode — 终端里的开源 AI 编程助手
- [[shell-gpt]] —— shell-gpt — 把 LLM 接进 shell 当命令行助理
