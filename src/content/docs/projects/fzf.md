---
title: fzf — 保序模糊匹配的通用命令行筛选器
description: 把任意一行一项的列表收成保序模糊匹配、扩展搜索语法和内置 walker。
来源: https://github.com/junegunn/fzf
日期: 2026-08-27
分类: CLI
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/junegunn/fzf
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 15f64c492a08f0840b81540c7d1de35737448086
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.74.3
---

## 是什么

fzf 是一个通用的命令行模糊查找器：不绑定数据源，只负责从一行一项的列表里做交互筛选。日常类比：编辑器的快速打开框，但输入可以是任何命令的标准输出。

```bash
ls | fzf
fzf --preview 'cat {}'
fzf -f 'readme'
```

固定 0.74.3 在 stdin 不是 TTY 时读管道；stdin 是 TTY 且未设 `FZF_DEFAULT_COMMAND` 时，用内置 `fastwalk` walker 列文件，而不是 fork `find`。

## 为什么重要

不读固定源码，旧笔记会把三件事说错：

- 说模糊匹配“不要求顺序”——V2 不允许漏字符或乱序，只允许模式字符之间有间隙
- 说默认搜索器是 `find`——未设环境变量时走 `charlievieth/fastwalk`
- 说没有 TTY 就不能用——`--filter`/`-f` 只打印匹配、不进 TUI

它把“列候选”和“挑一个”拆开，所以能接 git 分支、历史、kubectl context，也能接 [[fd]] / [[ripgrep]] 的文件列表。

## 核心要点

固定 0.74.3 的主链是：

1. **读入**：`Reader.ReadSource` 优先管道；否则跑 `$FZF_DEFAULT_COMMAND`；再否则 `readFiles`。内置 walker 默认 `file,follow,hidden`，跳过名为 `.git`、`node_modules` 的目录。

2. **扩展搜索默认开启**：空格拆成多个 term-set，**之间是 AND**；单独的 `|` 把后项留在同一 set 里做 OR。`'wild` 精确包含，`^` 前缀，`$` 后缀，`!` 取反。

3. **模糊算法默认 V2**：修改过的 Smith-Waterman，模式字符必须按顺序全部出现。打分偏好词界 / camelCase，间隙有罚分。只要速度、不要最优分，才用 `--algo=v1`。

4. **事件环**：Reader 发出读入事件，Terminal 发出查询变更，Matcher 并行扫 chunk，再把排序后的 merger 交给 TUI。`--preview` 对当前项再起一个外部进程。

5. **壳层集成是打印脚本，不是隐式安装**：`--bash` / `--zsh` / `--fish` / `--nushell` 打出 embed 的 key-binding 与 completion。README 写明 shell 集成**不读** `FZF_DEFAULT_COMMAND`，文件列表走 `FZF_CTRL_T_COMMAND` 等专用变量。

## 实践示例

### 案例 1：管道进来，模糊按序匹配

```bash
git branch --all | fzf
```

输入 `mai` 能命中 `main`，因为 `m`、`a`、`i` 按顺序出现。输入 `iam` 对 `main` 不会按“字母袋”匹配。

### 案例 2：扩展语法做 AND / OR

```bash
fzf
# 查询：^src .rs$ | .go$
```

这是“以 `src` 开头，并且以 `.rs` 或 `.go` 结尾”。空格是 AND，`|` 是同一组里的 OR。

### 案例 3：预览与非交互过滤

```bash
fd -t f | fzf --preview 'bat --color=always {}'
printf 'alpha\nbeta\ngamma\n' | fzf --filter 'a'
```

`--preview` 对当前项起外部命令。`--filter` 走无 TUI 路径，适合脚本；本页未实际执行这些命令。

## 踩过的坑

1. **以为空格分隔的词可以乱序**：每个 fuzzy term 内部仍保序；乱序要拆成多个 term，且它们是 AND，不是“任意排列”。

2. **把 `~/.fzf.zsh` 当成唯一接法**：0.74.3 也可以 `eval "$(fzf --zsh)"`。安装包有没有写这个文件，源码并不保证。

3. **给 shell 集成设了 `FZF_DEFAULT_COMMAND` 却不见效**：CTRL-T / ALT-C / 路径补全走另一组变量和函数。

4. **默认 walker 会跟符号链接、也看隐藏文件**：这和 [[fd]] 的默认相反。要尊重 `.gitignore`，应自己把 `FZF_DEFAULT_COMMAND` 设成 `fd --type f` 或 `rg --files`。

5. **把 README 的“百万条毫秒级”当成本轮测量**：本文未跑 matcher benchmark。

## 适用 vs 不适用场景

**适用**：

- 从任意一行一项的列表里交互挑一条或几条
- 给 shell / Vim 加快速跳转，并接受专用集成变量
- 用 `--filter` 在脚本里做同一套评分，但不打开 TUI

**不适用**：

- 需要复杂结构化查询（SQL、JSON path）
- 默认就要跳过 ignore 与隐藏项——应改用 [[fd]] 当数据源
- 把模糊匹配理解成“字母出现即可、顺序无所谓”
- 本轮未验证的大规模性能结论

## 固定版本边界

- 本文绑定 `junegunn/fzf@15f64c492a08f0840b81540c7d1de35737448086`，annotated tag `v0.74.3` 剥皮到该提交（tag 对象 `47c40063c5353814088296ef78b05aa004d0e1f3`）。
- `main.go` 内嵌 `version = "0.74"`、`revision = "devel"`，与 tag 名 `0.74.3` 不是同一字符串。
- `go.mod` 要求 `go 1.23.0`；walker 依赖 `github.com/charlievieth/fastwalk v1.0.14`。
- 本文未编译、未跑测试、未打开 TUI，状态保持 `UNVERIFIED`。

## 学到什么

1. **模糊不等于乱序**——V2 只在保序前提下找最高分间隙。
2. **数据源和筛选器要拆开**——stdin、环境变量命令、内置 walker 是三条读入路径。
3. **扩展语法把 UI 查询收成小型 DSL**——空格 AND、`|` OR、前缀符号改匹配类型。
4. **交互与非交互是同一套 Matcher**——`--filter` 只是关掉 Terminal。

## 应用型自测

1. stdin 是 TTY 且未设 `FZF_DEFAULT_COMMAND` 时，0.74.3 默认 fork `find` 吗？
2. 模糊查询 `iam` 会不会按“字母袋”命中 `main`？
3. 没有 TTY 时，还有没有不打开界面的匹配出口？

检查点：

1. 不会。走内置 `fastwalk` walker，默认 `file,follow,hidden`。
2. 不会。模式字符必须按顺序出现。
3. 有。`--filter`/`-f` 打印匹配后退出。

## 延伸阅读

- 项目主页：[junegunn/fzf](https://github.com/junegunn/fzf)
- 固定源码：`junegunn/fzf` 提交 `15f64c492a08f0840b81540c7d1de35737448086`
- 进阶：[ADVANCE.md](https://github.com/junegunn/fzf/blob/master/ADVANCED.md)（以固定提交为准，不把 master 当本页证据）
- [[fd]] —— 更适合当默认文件列表
- [[ripgrep]] —— `rg --files` 也常被用来喂 fzf

## 关联

- [[fd]] —— 默认尊重 ignore 的文件名查找
- [[ripgrep]] —— 内容搜索，或 `rg --files` 列文件
- [[bat]] —— preview 高亮
- [[tmux]] —— 可与 fzf 互选 session / window
- [[neovim]] —— telescope 是同类交互在编辑器里的再实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
