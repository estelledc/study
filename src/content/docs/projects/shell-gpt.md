---
title: shell-gpt — 把 LLM 接进 shell 当命令行助理
来源: https://github.com/TheR1D/shell_gpt
日期: 2026-05-31
分类: AI / CLI
难度: 入门
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/TheR1D/shell_gpt
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: dee88ff87bb93899971a3ca1361ad74678e4a94f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.5.1
---

## 是什么

shell-gpt（命令叫 `sgpt`）是一个**让 LLM 替你写 shell 命令的终端助理**。日常类比：以前有问题翻 man 手册、查搜索引擎，要切窗口、复制粘贴、断思路；现在像在副驾上坐了个 senior，你说一句“把当前目录大于 100M 的文件列出来”，它把命令递到你手上，确认后再跑。

实际操作长这样：

```bash
sgpt 用 awk 一行命令对第二列求和              # 一次性问答
sgpt -s 把当前目录大于 100M 的文件列出来       # 生成 shell 命令并询问怎么处理
sgpt -c "fizzbuzz in python" > fb.py          # 只出代码，重定向进文件
tail -n 50 a.log | sgpt 解释这段错误           # 接管标准输入
sgpt --chat debug 刚才那个栈溢出怎么修         # 多轮对话
```

它是 Python 写的，`pip install shell-gpt` 一条命令到位；固定 1.5.1 的默认模型是 `gpt-5.4-mini`，配置在 `~/.config/shell_gpt/.sgptrc`。

## 为什么重要

不理解 shell-gpt 的设计，下面这些事说不清：

- 为什么“LLM 生成的命令”不能直接跑——`-s` 模式的确认交互是这类工具的安全底线，值得抄
- 为什么 `-s`（shell 模式）和 `-c`（code 模式）要分开——前者要交互确认避免误删，后者要纯代码方便重定向
- 为什么“半截命令补完”值得专门装一个热键——正在打的命令不会写，按一下让 LLM 原位续上
- 为什么同类工具都长出 roles / chat / repl 三件套——prompt 复用、多轮上下文、交互循环是终端助理的公共骨架

## 核心要点

固定 1.5.1 的能力可以拆成四层：

1. **三种输出模式**：默认普通问答；`-s/--shell` 生成命令后进入确认交互 **[E]xecute, [M]odify, [D]escribe, [A]bort**（还接受兼容旧版的 `y`）——`M` 让你在原命令上就地编辑再跑；未显式选择时默认 Abort，除非配置 `DEFAULT_EXECUTE_SHELL_CMD=true`。`-c/--code` 只输出代码本体，专为 `> file.py` 重定向准备。

2. **角色（Roles）**：`--create-role` 建、`--role` 用、`--list-roles` 看。存储是 `~/.config/shell_gpt/roles/<name>.json`；内置四个默认角色（default / shell / describe_shell / code），`-s`、`-c` 本质就是切到对应内置角色。

3. **会话（Chat / REPL）**：`--chat <name>` 给对话命名、多轮上下文存盘；`--repl <name>` 进交互循环。缓存默认在 `<系统临时目录>/chat_cache`——重启即清，重要对话别只放这。

4. **集成与扩展**：`--install-integration` 往 bash/zsh 写热键钩子（绑定 **Ctrl+L**）：把当前命令行整段送给 `sgpt --shell --no-interaction`，用补全结果原位替换；`--install-functions` 安装默认函数集启用 function calling（路径由 `OPENAI_FUNCTIONS_PATH` 配置）；`USE_LITELLM=true` 切 LiteLLM 后端以接 Ollama 等本地模型。

## 实践示例

### 案例 1：把 -s 当 man 替代品

```bash
sgpt -s 找出最近 7 天修改过的 .log 文件并打包成 zip
# → find . -mtime -7 -name "*.log" -print0 | xargs -0 zip logs.zip
# [E]xecute, [M]odify, [D]escribe, [A]bort: d
```

`E` 直接跑，`M` 就地改（比如把 zip 换成 tar），`D` 让它逐参数解释，`A` 放弃。默认回车是 Abort——安全方向的默认值，防止 `rm -rf` 类命令一按回车就出事。

### 案例 2：-c 把 LLM 当一次性脚手架

```bash
sgpt -c 写个 Python 脚本，读 csv 第二列求和 > sum.py
python sum.py data.csv
```

`-c` 输出没有解释性文字，可以直接重定向进文件就跑。普通问答模式做不到——输出会带说明文字和代码块标记。

### 案例 3：管道接管 stdin

```bash
journalctl -u nginx --since "1 hour ago" | sgpt 这段日志里 502 是什么原因
git diff | sgpt --role reviewer 帮我审一下
```

把 LLM 当 grep / awk 一样接管道，是终端用户最大的爽点；`--role reviewer` 用的是你在 roles 目录里沉淀过的 prompt。

### 案例 4：Ctrl+L 热键续写命令

装完 `sgpt --install-integration` 之后，在 zsh 里敲半截命令按 Ctrl+L：

```bash
$ docker run --rm -it _   # 光标在 _ 处，按 Ctrl+L
$ docker run --rm -it -v $(pwd):/app python:3.12-slim bash
```

集成脚本把整段命令行经 `sgpt --shell --no-interaction` 补全后**替换**回命令行，光标停在结尾，可再编辑或直接回车。

## 踩过的坑

1. **默认云端计费**：默认走 OpenAI API（默认模型 `gpt-5.4-mini`），每次调用都要钱。想免费跑本地模型得 `USE_LITELLM=true` 接 Ollama，但 README 原话是 "not optimized for local models and may not work as expected"——预期要放低。

2. **危险命令永远先 D 后 E**：模型可能建议破坏性操作。1.5.1 的默认选项已经是 Abort（除非你显式配置 `DEFAULT_EXECUTE_SHELL_CMD=true`），但看一遍解释再执行仍是肌肉记忆级的好习惯。

3. **chat 缓存在临时目录**：`CHAT_CACHE_PATH` 默认是 `<系统临时目录>/chat_cache`，系统清理临时目录就没了。重要多轮对话改这个配置到持久路径。

4. **Ctrl+L 会覆盖 clear-screen**：集成脚本绑定的就是 Ctrl+L——这个键在 bash/zsh 默认是清屏。装完集成后清屏习惯得改（或自己改绑其他键）；键位冲突来自 shell 绑定本身，不是终端复用器。

5. **角色 JSON 改完不热加载**：编辑 `roles/<name>.json` 后，跑着的 `--repl` 不感知，要退出重进。

6. **多模型靠 LiteLLM 转译**：和 aichat 原生多 client 不同，shell-gpt 想用 OpenAI 之外的模型要 `USE_LITELLM=true` 走转译层，配置链条多一层。

## 适用 vs 不适用场景

**适用**：

- 命令行重度用户——经常忘 `find / awk / sed / xargs` 参数的人
- 想要“半截命令补完”的人——Ctrl+L 集成是 shell-gpt 的招牌能力
- 一次性脚本生成 + 快速重定向（`sgpt -c ... > file.py`）
- 习惯把日志 / diff / kubectl 输出“丢给 LLM 看一眼”的人

**不适用**：

- 需要原生多模型切换 + RAG + 本地服务端——选 [[aichat]]
- 团队共享 key + 用量看板——选专职网关（LiteLLM Proxy 等）
- 主力用本地模型——官方明说未为本地模型优化
- 想跑长链 agent 自动完成多步任务——function calling 偏单步工具调用

## 固定版本边界

- 本文绑定 `TheR1D/shell_gpt@dee88ff8...`，即 release tag `1.5.1`；`sgpt/__version__.py` 与 PyPI `shell-gpt` 最新版本一致。
- 默认配置：`DEFAULT_MODEL=gpt-5.4-mini`、`CHAT_CACHE_PATH=<tmp>/chat_cache`、`ROLE_STORAGE_PATH=<config>/roles`、`USE_LITELLM=false`、未确认时的 `-s` 默认选项为 Abort。
- 确认交互为 E/M/D/A 四选项（含兼容旧版的 `y`）；shell 集成绑定 Ctrl+L（bash `bind -x`、zsh `bindkey ^l`）。
- 本文未安装运行 sgpt、未调用任何 LLM API、未验证补全质量或本地模型表现，状态保持 `UNVERIFIED`。

## 学到什么

1. **CLI 工具的杀手锏是管道**——能接管 stdin/stdout 的 LLM 工具比 GUI 多一个数量级的组合空间
2. **危险操作的默认值要朝安全倾斜**——默认 Abort + 显式配置才放开自动执行，这个取向值得所有“LLM 生成命令”类工具抄
3. **-c 和 -s 分开是好设计**——纯代码输出与交互确认是两种合同，混在一起两头不讨好
4. **“原位替换命令行”是集成的正确形态**——不打断输入流的 Ctrl+L 钩子，比切窗口粘贴少两次上下文切换

## 应用型自测

1. 固定 1.5.1 里，`sgpt -s` 的确认交互有哪几个选项，回车默认选哪个？
2. 多轮对话的缓存默认放在哪，有什么后果？
3. 装完 `--install-integration` 后，zsh 里的 Ctrl+L 发生了什么变化？

检查点：

1. [E]xecute / [M]odify / [D]escribe / [A]bort（另接受旧版 `y`）；默认 Abort，除非配置 `DEFAULT_EXECUTE_SHELL_CMD=true`。
2. `<系统临时目录>/chat_cache`；临时目录被清就丢，重要对话要改 `CHAT_CACHE_PATH` 到持久路径。
3. 被重绑为“把当前命令行送给 sgpt 补全并原位替换”，覆盖了默认的清屏功能。

## 延伸阅读

- 官方 README：[TheR1D/shell_gpt](https://github.com/TheR1D/shell_gpt) —— 本文绑定提交 `dee88ff87bb93899971a3ca1361ad74678e4a94f`
- 本地模型指南：仓库 wiki 的 Ollama 页（官方注明未为本地模型优化）
- [[aichat]] —— 终端 LLM 客户端的另一思路：原生多 client + RAG + Server 模式
- [[ollama]] —— 配 `USE_LITELLM=true` 后最常搭的本地后端

## 关联

- [[aichat]] —— 同领域竞品；shell-gpt 偏 shell 助理，aichat 偏通用 LLM 工作台
- [[ollama]] —— 本地模型后端，需走 LiteLLM 转译接入
- [[oclif]] —— Node 阵营 CLI 框架；shell-gpt 是 Python + Typer 的对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aider]] —— Aider — 终端 AI 结对编程 CLI
