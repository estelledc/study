---
title: shell-gpt — 把 LLM 接进 shell 当命令行助理
来源: https://github.com/TheR1D/shell_gpt
日期: 2026-05-31
分类: AI / CLI
难度: 入门
---

## 是什么

shell-gpt（命令叫 `sgpt`）是一个**让 LLM 替你写 shell 命令的终端助理**。日常类比：以前有问题翻 man 手册、查 stackoverflow，要切窗口、复制粘贴、断思路；现在像在副驾上坐了个 senior，你说一句"把当前目录大于 100M 的文件列出来"，它直接把命令递到你手上，按回车就跑。

实际操作长这样：

```bash
sgpt 用 awk 一行命令对第二列求和              # 一次性问答
sgpt -s 把当前目录大于 100M 的文件列出来       # 生成 shell 命令并询问是否执行
sgpt -c "fizzbuzz in python" > fb.py          # 只出代码，重定向进文件
tail -n 50 a.log | sgpt 解释这段错误           # 接管标准输入
sgpt --chat debug 刚才那个栈溢出怎么修         # 多轮对话
```

它是 Python 写的，`pip install shell-gpt` 或 `pipx install shell-gpt` 一条命令到位，配置文件就一份 `~/.config/shell_gpt/.sgptrc`。

## 为什么重要

不理解 shell-gpt，下面这些事说不清：

- 为什么很多人桌面上不开 GPT 客户端，只在终端 alias 一个 `sgpt`——上下文已在 shell 里，开窗口反而绕远
- 为什么"我忘了 find / awk / sed 参数"这件事不再痛——LLM 拼命令比你查 man 快十倍
- 为什么 Ctrl+L 这个热键值得专门安装——你正在打的命令半截不会写，按一下就能让 LLM 续上
- 为什么 `-s`（shell 模式）和 `-c`（code 模式）要分开——前者要交互确认避免误删，后者要纯代码方便重定向

一句话：**把 LLM 从浏览器搬进 shell，让它和管道、重定向、回车这些 Unix 原语融为一体**。

## 核心要点

shell-gpt 的能力可以拆成 **四层**：

1. **三种输出模式**：默认是普通问答；`-s` 生成 shell 命令并要你确认 `[E]xecute / [D]escribe / [A]bort`；`-c` 只输出代码本体，专为 `> file.py` 重定向准备。
2. **角色（Roles）**：把 system prompt 命名保存。`sgpt --create-role reviewer` 创建后填一段描述，下次 `sgpt --role reviewer < diff.patch` 直接调用。文件存在 `~/.config/shell_gpt/roles/*.json`。
3. **会话（Chat / REPL）**：`--chat <name>` 给一段对话起名，多轮上下文存到磁盘；`--repl <name>` 进交互式循环。缓存默认放 `/tmp/shell_gpt/chat_cache`。
4. **集成与扩展**：`--install-integration` 给 zsh / bash 写入 Ctrl+L 钩子；`--install-functions` 启用函数调用让模型能跑本地工具；`USE_LITELLM=true` 切到 LiteLLM 后端，借此接 Ollama 等本地模型。

四层是叠加的：底下"三种输出模式"足够 80% 用户用；上面三层是给重度用户的省力工具。

## 实践案例

### 案例 1：把 -s 当 man 替代品

```bash
sgpt -s 找出最近 7 天修改过的 .log 文件并打包成 zip
# → find . -mtime -7 -name "*.log" -print0 | xargs -0 zip logs.zip
# [E]xecute, [D]escribe, [A]bort: e
```

`E` 直接跑，`D` 让它再解释一遍每个参数，`A` 放弃。这套交互防止 `rm -rf` 类生成命令一按回车就出事。

### 案例 2：-c 把 LLM 当一次性脚手架

```bash
sgpt -c 写个 Python 脚本，读 csv 第二列求和 > sum.py
python sum.py data.csv
```

`-c` 输出**没有任何解释性文字**，连 ```python 代码块标记都不带，所以可以直接 `> file.py` 写进磁盘就跑。普通问答模式不行，输出会带"以下是代码："这种废话。

### 案例 3：管道接管 stdin

```bash
journalctl -u nginx --since "1 hour ago" | sgpt 这段日志里 502 是什么原因
git diff | sgpt -r reviewer 帮我审一下
kubectl describe pod foo | sgpt 这 pod 起不来可能是哪一行的问题
```

把 LLM 当 grep / awk 一样接管道，是终端用户最大的爽点。GUI 客户端做不到——你不可能"右键复制 → 切窗口 → 粘贴 → 等回答"五步当一步用。

### 案例 4：Ctrl+L 热键续写命令

装完 `sgpt --install-integration` 之后，在 zsh 里随便敲半截：

```bash
$ docker run --rm -it _   # 光标在 _ 处，按 Ctrl+L
$ docker run --rm -it -v $(pwd):/app python:3.12-slim bash
```

它把你当前命令行整段送给 LLM，让模型补完后**替换**回命令行，光标停在结尾，你可以再编辑或直接回车。比"切到 ChatGPT 网页 → 描述意图 → 复制 → 粘贴回来"快两个数量级。

## 踩过的坑

1. **默认走 OpenAI 计费**：第一次跑 `sgpt` 必须填 `OPENAI_API_KEY`，每次调用都要钱。要免费跑得设 `USE_LITELLM=true` 再接 Ollama，但官方 README 自己写了 "not optimized for local models"，效果不如云端。

2. **-s 生成的危险命令**：模型偶尔会建议 `sudo rm -rf /var/lib/...` 这类操作。`[E]xecute` 之前**永远先按 D 看一遍解释**，养成肌肉记忆。这一坑作者在 README 也专门提示过。

3. **/tmp 重启清空**：`CHAT_CACHE_PATH` 默认在 `/tmp/shell_gpt/chat_cache`，macOS / Linux 重启后 `/tmp` 会被清。重要的多轮对话要么改这个路径到 `~/.cache/shell_gpt`，要么用 `--repl` 的同时另存日志。

4. **Ctrl+L 在 tmux 里被吞**：tmux 默认拦 Ctrl+L 当"清屏"，热键根本到不了 zsh。需要在 `~/.tmux.conf` 加 `unbind C-l` 或者把 sgpt 的热键改成别的。

5. **角色 JSON 改完不会热加载**：编辑 `~/.config/shell_gpt/roles/<name>.json` 后，已经在跑的 `--repl` 不会感知，要 `.exit` 重进。

6. **多模型支持靠 LiteLLM 转译**：和 aichat 原生支持多 client 不一样，shell-gpt 想用 Claude / Gemini 必须打开 `USE_LITELLM` 让 LiteLLM 替它转 OpenAI 协议。配置链条多一层，调试起来麻烦。

## 适用 vs 不适用场景

**适用**：

- 命令行重度用户——经常忘 `find / awk / sed / xargs` 参数的人
- 想要"半截命令补完"的人——Ctrl+L 热键是 shell-gpt 区别于其他 LLM CLI 的关键
- 一次性脚本生成 + 快速重定向（`sgpt -c ... > file.py`）
- 习惯把日志 / diff / kubectl 输出"丢给 LLM 看一眼"的人

**不适用**：

- 主要工作流在网页 / Notion——GUI 客户端体验更顺
- 需要原生多模型切换 + RAG + 本地服务端——选 aichat
- 团队共享 key + 用量看板——选 LiteLLM Proxy / OneAPI
- 想跑长链 agent 自动完成多步任务——shell-gpt function calling 偏短链

## 历史小故事（可跳过）

- **2023 年初**：作者 TheR1D 在 GPT-3.5 API 刚开放时起了 shell-gpt，最早只是个 OpenAI CLI wrapper，主打"生成 shell 命令"。
- **2023 年中**：加了 `--code`、`--chat`、`--repl`、`--install-integration`，定位从"命令生成器"扩展成"终端助理"。
- **2024 年**：加 function calling、`USE_LITELLM` 多后端、自定义 roles，star 数稳定上涨。
- **2026-05-06**：发布 v1.5.1，依然在活跃维护；和 aichat、aider、llm（simonw）一起被推荐为终端 LLM 三件套之一。

## 学到什么

1. **CLI 工具的杀手锏是管道**——能接管 stdin/stdout 的 LLM 工具比 GUI 多一个数量级的组合空间
2. **危险操作必须有 [D]escribe 这一步**——LLM 生成的命令永远要让用户先看再跑，否则迟早出事
3. **-c 和 -s 分开是好设计**——前者纯代码方便重定向，后者带交互确认避免误删，混在一起会两头不讨好
4. **Ctrl+L 是 shell-gpt 真正独门的卖点**——其他 LLM CLI 都能问答、都能管道，但只有它把"半截命令续写"做成了肌肉记忆级体验

## 延伸阅读

- 官方 README：[TheR1D/shell_gpt](https://github.com/TheR1D/shell_gpt)（5 分钟看完 examples 章节即可上手）
- 配置示例：装完后 `cat ~/.config/shell_gpt/.sgptrc` 看一遍所有可调字段
- 函数调用扩展：[TheR1D/shell_gpt 的 functions 目录](https://github.com/TheR1D/shell_gpt/tree/main/sgpt/functions)
- [[aichat]] —— 终端 LLM 客户端的另一思路：原生多 client + RAG + Server 模式
- [[ollama]] —— 配 `USE_LITELLM=true` 后最常搭的本地后端

## 关联

- [[aichat]] —— 同领域竞品；shell-gpt 偏 shell 助理，aichat 偏通用 LLM 客户端
- [[ollama]] —— 本地模型后端，需要走 LiteLLM 转译才能接进来
- [[oclif]] —— Node 阵营 CLI 框架；shell-gpt 是 Python + Typer 的极简反例

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
