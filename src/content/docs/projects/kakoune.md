---
title: Kakoune — 选区优先的多光标终端编辑器
description: 介绍 Kakoune v2026.05.21 如何用面向选区、client-server session 和外部过滤器组合终端编辑。
来源: https://github.com/mawww/kakoune
日期: 2026-08-27
分类: 编辑器
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/mawww/kakoune
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 36ad52ebf983c1b23182caccd4f792517235b06d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2026.05.21
---

## 是什么

Kakoune 是 Maxime Coste 用 C++ 写的终端模态编辑器。日常类比：改一段字之前先用荧光笔涂出来，再决定删、改还是交给外部命令——而不是先对服务员说“删掉第二行”。

固定 lightweight tag `v2026.05.21` 只承认两套编辑模式：**normal** 操纵选区，**insertion** 往选区里打字。命令行 `:` 按 design 文档不负责改 buffer。

```bash
make
./src/kak
kak -C my-session src/main.cc
```

`-C` 从 2026.04.12 起表示 connect-or-create：session 在就连，不在就建。

## 为什么重要

不读固定 v2026.05.21 源码，旧笔记会把三件事写反或写死：

- `s` 是 split、`S` 是 select——`normal.cc` 里 `s` 是 `select_regex`，`S` 是 `split_regex`
- 只有 `-c` 能进已有 session——现在还有 `-C`，以及 `-d`/`-s` 的 headless server
- 源码“大约三万行”、编译标准就是 C++20——本文不估计行数；README 要 C++20 编译器，Makefile 默认却是 `-std=c++2b`

它影响了后来的 [[helix]]：Helix README 写明 editing model very heavily based on Kakoune。差别是 Kakoune 把 LSP、文件树和窗口管理都留给外部工具。

## 核心要点

固定 v2026.05.21 的主链可以拆成五步：

1. **CLI 先决定进程角色**：`main.cc` 解析 `-c`（连接）、`-C`（连接或创建）、`-s`（命名 session）、`-d`（headless，必须配 `-s`）、`-p`（把 stdin 当命令发给 session）。没名字时 server 用 pid 当 session。
2. **一个 Server，多个 Client**：`remote.hh` 里 `Server` 是单例；本机 Terminal UI 或 JSON UI 作为 client 连进来，共享 buffer 与撤销。窗口分屏交给 tmux / 系统窗口管理器。
3. **选区是面向的闭区间**：`Selection` 存 `anchor` 与 `cursor`，`min()`/`max()` 按坐标排序。`SelectionList` 另记 `m_main`。和 Helix 的 gap indexing 不同：这里是字符坐标上的 inclusive range。
4. **多选区是默认语法，不是插件**：`%` 选整个 buffer；`s` 在选区里留下正则命中；`S` 按正则切开；`<a-s>` 按行切开；`C` / `<a-C>` 把选区复制到后面 / 前面的行。
5. **正交组合**：`|` 把每个选区交给外部 filter 再写回。design 文档举的例子是排序应走 Unix `sort`，而不是编辑器内建。没有内置 LSP。

## 实践示例

### 案例 1：先看见范围再删除

```
3w    →  选区扩过三个词（select to next word start × 3）
d     →  删除当前选区
```

选错了按 `;` 把选区缩回 cursor（`clear_selections`），不必先 `u`。

### 案例 2：s 保留匹配，S 切开

```
%
s margin-top <ret>
c margin-block-start <esc>
```

`s` 在全 buffer 选区里留下每一处 `margin-top`。若写成 `S margin-top`，选区会在匹配处被切开，留下的是匹配之间的空隙。不要想改某一处时，用 `<a-,>` 去掉当前 main。

### 案例 3：连同一个 session，或把选区交给过滤器

```
kak -s review src/main.cc
# 另一个终端
kak -c review

# 在已有选区上
| sort <ret>
```

`-p` 适合脚本：把命令推进已有 session，自己不占 Terminal UI。

## 踩过的坑

1. **先按 `d` 再找范围**：`d` 立刻删当前选区，默认常常只是一个字符。
2. **把 Helix / 旧笔记的 `s`/`S` 语义套过来**：本版 `s` 是保留匹配，`S` 是切开。
3. **`-d` 不带 `-s`**：`run_server` 会拒绝，并提示 daemon 必须有 session 名。
4. **期待原生 Windows 构建**：README 写明依赖 Unix-like 环境，不计划 native Windows。
5. **把 README 的 C++20 和 Makefile 的 `-std=c++2b` 当成同一句话**：编译器最低线与实际默认标准不是同一个字段。

## 适用 vs 不适用场景

**适用**：

- 批量结构化改写，愿意围着多选区想步骤
- 接受“看见再动手”，并用 `|` / `%sh{}` 拼外部工具
- 远程 Linux / macOS / Cygwin 上要一个比 nano 强、又不内置 IDE 的编辑器
- 需要多个终端窗口共享同一 session（`-c` / `-C`）

**不适用**：

- 要开箱 LSP / 补全 / 调试——对照 [[helix]] 或 [[neovim]]
- 要 GUI 或原生 Windows——对照 [[zed]]；本仓明确不做 native Windows
- 团队必须统一成 Vim 动词优先键序
- 不能接受自己粘合 `kak-lsp`、窗口管理器和剪贴板脚本

## 固定版本边界

- 本文绑定 `mawww/kakoune@36ad52ebf983c1b23182caccd4f792517235b06d`，即 lightweight tag `v2026.05.21` 直接指向的提交。
- `version_notes` 第一条版本号是整数 `20260521`；CHANGELOG 同日条目包括 regex `\N` 与 `enter-user-mode` 的 `-count` / `-register`。
- README 依赖 C++20 编译器（GCC >= 10.3 或 clang >= 11）；`Makefile` 默认 `CXXFLAGS-default = -std=c++2b`。
- `-C` 属于 2026.04.12 线，不是更早 release 的行为。
- 本文未执行 `make`、未启动 session、未跑 `kak-lsp`，状态保持 `UNVERIFIED`。

## 学到什么

1. **选区面向性是多光标的前提**——anchor 与 cursor 可对调，`min`/`max` 只用于范围计算。
2. **client-server 把“窗口”从编辑器里拆出去**——session 是编辑状态，pane 是别人的事。
3. **正交的代价是集成**——`|` 很强，但 LSP、语法树、剪贴板都要自己接。
4. **同名按键不能跨编辑器照搬**——Kakoune 与 Helix 都有 `s`/`S`，语义必须回对各自 keymap。

## 应用型自测

1. `s` 在当前选区上做的是保留正则匹配，还是按匹配切开选区？
2. `kak -d` 不带 `-s` 能不能做成 headless server？
3. Kakoune 的 `Selection` 默认是左闭右开的 gap indexing，还是 inclusive 的 anchor/cursor 区间？

检查点：

1. 保留匹配（`select_regex`）；切开是 `S`。
2. 不能。源码要求 `-d` 必须带 session 名。
3. inclusive 的 `anchor` + `cursor`；gap indexing 是 Helix `Range` 的合同。

## 延伸阅读

- 设计说明：[doc/design.asciidoc](https://github.com/mawww/kakoune/blob/master/doc/design.asciidoc)
- 按键文档：[doc/pages/keys.asciidoc](https://github.com/mawww/kakoune/blob/master/doc/pages/keys.asciidoc)
- 固定源码：[mawww/kakoune](https://github.com/mawww/kakoune) —— 本文绑定提交 `36ad52ebf983c1b23182caccd4f792517235b06d`
- [[helix]] —— 继承选区优先并内置 LSP 的对照
- [kak-lsp](https://github.com/kak-lsp/kak-lsp) —— 外部 LSP 桥，不在本仓

## 关联

- [[helix]] —— 同一选区优先模型，但 LSP / Tree-sitter / picker 在核心里
- [[neovim]] —— 插件生态补齐 IDE 面的对照
- [[vim]] —— 动词优先的对照
- [[zed]] —— GUI 多光标路线
