---
title: Kakoune — 多光标优先模态编辑器
来源: 'https://github.com/mawww/kakoune'
日期: 2026-06-24
分类: 编辑器
难度: 初级
---

## 是什么

Kakoune（发音 ka-KOO-neh）是 Maxime Coste 在 2011 年开始写的终端模态编辑器。它用 C++ 实现，代码量控制在约 3 万行，保持了极小的核心。它的核心理念只有一句话：**先选中，再操作**。这跟 Vim 的"先说动词再说名词"恰好反过来。

日常类比：

> 想象你面前有一段文字要改。Vim 的做法像"对服务员说：帮我删掉第二行"——你得先说动作（删除）再说对象（第二行）。Kakoune 的做法像"你先用荧光笔把第二行涂黄，然后再决定是删除还是复制"——先看见选了什么，再决定怎么做。

这个"选择 → 操作"的顺序让每一步都可视化预览，减少了 Vim 里"脑内模拟结果"的认知负担。

启动后界面长这样（光标选中了 `hello` 一词，状态栏告诉你当前选区长度）：

```
src/main.py                        1 sel  [NOR]
  1  def greet():
  2>     msg = "hello"
              ^^^^^        ← 这五个字符被高亮
  3      print(msg)
```

任何时候你都能直观地看到"当前选了什么"，这是 Kakoune 体验的核心。

## 为什么重要

Kakoune 对整个编辑器社区产生了三个实质影响：

1. **多光标成为一等公民**——不是作为插件加上去的，而是整套按键体系围绕多选区设计。你按 `%` 全选、按 `s` 在选区内用正则拆出子选区、按 `&` 对齐，整个流程不需要插件。

2. **启发了 Helix**——后来的 [Helix](/projects/helix) 编辑器明确说自己的键绑定参考了 Kakoune 的"选区优先"模型，加上 Rust 重写和内置 LSP。

3. **证明了"正交组合"的 Unix 哲学可以用在编辑器上**——Kakoune 不做 LSP、不做文件树、不做内置终端。它只做文本编辑，把其余能力交给外部工具组合。

此外它还影响了更广泛的"模态编辑"讨论——很多 [Neovim](/projects/neovim) 用户看到 Kakoune 后给自己的 Vim 配置加了 `vim-visual-multi` 等多光标插件，说明"先选后做"这个思路有普遍价值。

## 核心要点

**选区是一切操作的前提。** Kakoune 的命令格式永远是"先移动/选中 → 再操作"。在 Vim 里你写 `d3w`（删三个词），在 Kakoune 里你按 `3w`（移动三个词，高亮变黄）→ 看到对不对 → 再按 `d` 删除。如果选错了，按 `;` 可以把选区缩回到光标位置重新开始，不需要撤销。

**多光标三件套：** `s`（split，用正则拆选区）、`S`（select，保留匹配的子选区）、`<a-s>`（按行拆选区）。用这三个键能覆盖绝大多数批量编辑场景。还有 `C` 向下复制光标、`<a-C>` 向上复制光标，类似 VS Code 的 `Ctrl+D` 多光标。

**客户端-服务器架构：** 一个 `kak` 进程是 server，每个窗口是 client。你可以在多个终端面板连同一个 session，共享 buffer 和撤销历史。这比 Vim 的 `--servername` 更自然。用 `kak -c <session>` 就能连入一个已存在的编辑会话。

**配置语言不是 VimScript 也不是 Lua：** Kakoune 用自己的一套类 shell 脚本语法（kakscript），语法极简但功能够用。核心配置文件是 `~/.config/kak/kakrc`。

**钩子（hook）驱动自动化：** 你可以注册 hook 在特定事件触发时执行命令，比如 `hook global BufCreate .*\.py %{ set buffer filetype python }`——打开 `.py` 文件自动设语言类型。

## 实践案例

场景一：把一段 CSS 里所有 `margin-top: Xpx;` 改成 `margin-block-start: Xpx;`。

```
# 1. 选中整个文件
%
# 2. 用正则在选区里拆出所有 margin-top
s margin-top <ret>
# 3. 此时每个匹配都是独立光标，直接输入替换文本
c margin-block-start <esc>
```

三步完成。不需要 `:%s/old/new/g` 这种正则替换命令——你直接"看见"每一处匹配被选中，然后用 `c`（change）覆写。如果有一处不想改，先按 `<a-,>` 取消当前那一个光标再操作。

场景二：给 Python 函数的每个参数加上类型注解 `: str`。

```
# 光标在 def foo(a, b, c): 行
# 1. 选中括号内内容
f( <a-i>(
# 2. 按逗号拆成多光标
s [^,]+ <ret>
# 3. 选区会自动 trim 空格后选中每个参数名
# 4. 跳到每个参数末尾，追加 : str
<a-l> a: str <esc>
```

场景三：删除文件中所有空行。

```
%            # 全选
s ^\n <ret>  # 用正则拆出空行
d            # 删除
```

这些例子的共同模式是：**选区 → 细化 → 操作**。一旦你内化了这个三步节奏，复杂编辑也只是把中间"细化"一步做得更精确而已。

## 踩过的坑

**坑 1：习惯 Vim 顺序来按键。** 新手最常做的错误是先按 `d` 再选范围——结果删掉了当前选区（默认是当前字符）。解决办法是死记"先选后做"，前几天可以在状态栏看选区范围确认。大约两三天肌肉记忆就能切过来。

**坑 2：插件生态比 Neovim 小很多。** Kakoune 没有 LSP 内置，需要外部工具 `kak-lsp`（一个第三方桥接）。配置比较手动，文档也不如 nvim-lspconfig 丰富。如果你的工作强依赖补全和跳转，需要提前评估配置成本。

**坑 3：kakscript 字符串转义让人困惑。** 百分号 `%` 开头的字符串有多种定界符（`%{}`、`%[]`、`%""`），嵌套时容易搞错。建议先用 `%sh{}` 把复杂逻辑交给 shell 脚本，避免在 kakscript 里写长逻辑。

**坑 4：剪贴板集成需要手动配。** Kakoune 不像 Neovim 有 `+` 寄存器直连系统剪贴板。通常的做法是用 `%sh{ xclip }` 或 `pbcopy/pbpaste` 包一层，写在自定义命令里。

## 适用场景

**适合：**

- 大量结构化文本的批量编辑（多光标的杀手级场景）
- 喜欢"看见再动手"的工作流，讨厌 Vim 操作后才发现改错了要 `u` 撤销
- 习惯 Unix 管道思维，愿意用 `tmux` + 外部工具拼出 IDE 功能
- 想在远程服务器上有一个比 `nano` 强大但比 Neovim 配置少的编辑器
- 经常做 code review 时临时改多处格式问题

**不适合：**

- 需要开箱即用的 LSP/补全/调试集成——选 [Helix](/projects/helix) 或 [Neovim](/projects/neovim) 更省心
- 图形界面偏好者——[Zed](/projects/zed) 或 [Lapce](/projects/lapce) 更合适
- 插件生态深度依赖者——Neovim 的 Lua 生态在数量和维护活跃度上远超 Kakoune
- 团队统一工具链要求高——Kakoune 用户基数小，遇到问题能互助的人少

## 学到什么

最关键的认知转变是：**可视化反馈在编辑过程中不是奢侈品，而是减少错误的基础设施。** Kakoune 让你在按下破坏性操作键之前就能看到"我选了什么"，这个设计哲学不仅适用于编辑器，也适用于 CLI 工具设计（比如 `rm` 加 `--dry-run`、`git rebase` 加 `--interactive`）。

第二个收获：正交设计的代价是集成成本。Kakoune 故意不做 LSP、不做 tree-sitter，结果是用户需要自己粘合 `kak-lsp` + `tree-sitter-kak` + `tmux`。这是 Unix 哲学的经典 trade-off：组合灵活但首次配置成本高。

第三个收获：好的抽象一旦被验证就会被借鉴。Kakoune 的"选区优先"模型被 Helix 直接继承，也被 VS Code、Sublime Text 的多光标功能间接验证——说明这是一个跨编辑器的通用 UX 洞察。

## 历史小故事

Maxime Coste 最初是一个 Vim 重度用户，但他对两件事越来越不满：一是 Vim 的"动词+名词"顺序让他经常猜错范围不得不 `u` 撤销；二是 VimScript 作为配置语言过于复杂且性能差。2011 年他决定从零写一个编辑器来验证"如果反转操作顺序会怎样"。

他在 IRC 频道 `#kakoune` 上公开开发，早期只有几个人用。但随着 2018 年 Helix 项目启动时公开致谢 Kakoune 的设计，更多人开始关注这个"小众但有启发性"的编辑器。截至 2025 年 GitHub 上有 ~10k star，不算大众但社区活跃度稳定。

有趣的是 Kakoune 这个名字来自法语，没有特别的技术含义——Coste 说他只是想要一个好搜索的独特名字。

## 延伸阅读

- [Kakoune 官方按键文档](https://github.com/mawww/kakoune/blob/master/doc/pages/keys.asciidoc) — 所有按键的速查表
- [kak-lsp](https://github.com/kak-lsp/kak-lsp) — LSP 客户端桥接，补全/跳转/诊断
- [Kakoune 社区 Wiki](https://github.com/mawww/kakoune/wiki) — 插件列表、配色方案、配置技巧
- [Why Kakoune](https://kakoune.org/why-kakoune/why-kakoune.html) — 作者解释设计哲学的文章

## 关联

- [Helix](/projects/helix) — 继承了 Kakoune 的选区优先模型，用 Rust 重写并内置 LSP
- [Neovim](/projects/neovim) — Vim 的现代分支，通过 Lua 生态弥补了 Vim 的扩展性短板
- [Zed](/projects/zed) — GUI 编辑器，同样强调多光标但走图形界面路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lite-xl]] —— Lite-XL — 不到 3MB 的编辑器也能扩展出花样
- [[micro]] —— micro — 终端里像 VS Code 一样顺手的纯 Go 编辑器

