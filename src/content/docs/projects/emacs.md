---
title: GNU Emacs — Lisp 自文档编辑器
来源: 'Richard Stallman, GNU Emacs, GNU Project, 1985–至今, https://www.gnu.org/software/emacs/'
日期: 2026-06-06
分类: CLI
子分类: 编辑器与 IDE
难度: 中级
---

## 是什么

GNU Emacs 是一个**以 Emacs Lisp 解释器为心脏的可编程文本编辑器**。日常类比：把它想象成一台装满了各种功能机器的车间——你不仅能用机器，还能在不停工的情况下把机器拆开重造，甚至新造一台机器放进来。

你打开 Emacs，默认就有文本编辑、文件浏览（Dired）、邮件客户端（Gnus）、日历、IRC、计算器……但这些都只是用 Emacs Lisp 写的「插件」——它们本身不是 Emacs，Emacs 是那个运行所有这些的 Lisp 运行时。

更关键的是：任何你正在用的功能，你都可以在**运行时**打开其源代码、修改它、立刻生效，不用重启，不用重新编译。这叫做「自文档、自修改（self-documenting, self-modifying）」，是 Emacs 区别于所有其他编辑器的核心哲学。

```elisp
;; 运行时直接求值：M-x eval-expression，或在任意 buffer 里 C-x C-e
(message "Hello, Emacs! 当前 buffer 是 %s" (buffer-name))
;; 回显区出现：Hello, Emacs! 当前 buffer 是 *scratch*
```

## 为什么重要

不理解 Emacs，下面这些问题都难以解释清楚：

- 为什么现代编辑器的"插件 API"概念（VS Code、Neovim lua config）本质上都是向 Emacs 的 major/minor mode 系统致敬
- 为什么 org-mode 能在 2023 年仍被 Jupyter Notebook 的用户羡慕——可执行文档的概念 1990 年代就在 Emacs 里跑了
- 为什么 Lisp 方言（Scheme、Clojure）的开发者偏爱 Emacs：REPL 驱动开发（REPL-Driven Development，即在编辑器里直接把代码发给解释器执行）在 Emacs 里有 SLIME（Common Lisp）/ CIDER（Clojure）这套成熟的第三方包支持
- 为什么 macOS 终端里 `C-a`（行首）、`C-e`（行尾）、`C-k`（删除到行尾）可用——这些是 Readline 从 Emacs 借走的

## 核心要点

Emacs 的架构可以拆成三个核心概念：

1. **Buffer/Window/Frame 三层模型**：Emacs 把所有东西都抽象成「buffer（缓冲区）」——文件、目录、Shell 输出、网页、进程输入输出，全是 buffer。Window 是显示 buffer 的矩形区域，Frame 是操作系统窗口。类比：buffer 是文档，window 是桌面上摆开的书，frame 是书桌本身。一个 buffer 可以被多个 window 同时显示，frame 可以有多个。这个模型让「在一个窗口里看源码，另一个窗口看测试输出」变成零配置的事。

2. **Major Mode / Minor Mode 双层模式系统**：每个 buffer 有一个 Major Mode（决定核心行为，比如 `python-mode` 给 Python 文件提供高亮、缩进、REPL 集成），同时可叠加多个 Minor Mode（细粒度开关，比如 `flycheck-mode` 开启实时语法检查、`company-mode` 开启自动补全）。类比：Major Mode 是职业（厨师/程序员/教师），Minor Mode 是技能（会驾车、会外语）——职业唯一，技能可叠加。

3. **Emacs Lisp 可编程内核**：所有用户可见的功能都是 Emacs Lisp 函数，每个函数都有内联文档（`C-h f <函数名>` 即可查看）。你不只是「使用」这些函数，你可以重定义它们。类比：不是开一辆你不能修的车，而是开一辆图纸和零件都在副驾座上的车。自 Emacs 28 起，Lisp 代码通过 `libgccjit` 原生编译，性能大幅提升。

## 实践案例

### 案例 1：Org-mode 做每日任务管理与文学编程

Org-mode 是 Emacs 内置的结构化文本系统，一个 `.org` 文件可以同时包含 TODO 列表、代码块和 LaTeX 公式：

```org
* 今日任务
** TODO 阅读 LSP 协议规范
   DEADLINE: <2026-06-07>
** DONE 配置 eglot
   CLOSED: [2026-06-06]

* 笔记：Python 快速排序

#+begin_src python :results output
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left  = [x for x in arr if x < pivot]
    mid   = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + mid + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))
#+end_src

#+RESULTS:
: [1, 1, 2, 3, 6, 8, 10]
```

光标在代码块上，按 `C-c C-c`，Emacs 调用 Python 解释器执行，结果直接插入文档。导出时（`C-c C-e h h`）生成 HTML，代码和结果一同展示。Jupyter 的核心理念就是这个——区别是 Emacs org-mode 由 Carsten Dominik 在 2003 年首发，比 Jupyter（2014 年）早了十年，且完全键盘驱动。

- `* / **` 是 Org 标题层级，`TODO`/`DONE` 是状态关键字，`DEADLINE:` 自动进入日历视图
- `#+begin_src python :results output` 是 Babel 代码块声明——`C-c C-c` 直接在编辑器里运行这段 Python
- `#+RESULTS:` 是 Emacs 自动写入的执行结果，每次重跑会覆盖更新
- 同一个文件可以混合 Python/Shell/SQL 代码块，并互相传递变量（`var` 参数），这就是「文学编程」

### 案例 2：Magit 作为完整 Git 工作流界面

Magit 是 Emacs 最著名的插件，把 Git 操作变成一个交互式状态机：

```
M-x magit-status   ;; 打开当前 repo 的 Magit 状态 buffer

=== Untracked Files ===================
  src/new-feature.py

=== Unstaged Changes ==================
modified   README.md

按 s → 暂存选中文件
按 c c → 弹出 commit 编辑 buffer，写 commit message，C-c C-c 提交
按 P p → push 到 remote
按 l l → 打开 log，交互式 rebase 按 r i
```

**逐部分解释**：

- 整个界面是一个普通 Emacs buffer，所有 Emacs 命令（搜索、复制、undo）照常工作
- 每个 Git 操作都有对应的单键快捷键，按 `?` 弹出当前上下文的完整帮助
- diff 高亮、hunk 级别的暂存（只暂存文件的部分修改）、交互式 rebase 全在同一个界面里完成
- Magit 被许多用户认为是比 `git` CLI 更直观的 Git 界面，即使他们不用 Emacs 做其他事

### 案例 3：Emacs Lisp 脚本批处理文件

Emacs 支持 `--batch --script` 模式，可以当脚本语言用：

```bash
#!/usr/bin/emacs --script
;; rename-prefix.el：把当前目录所有 .txt 文件加上日期前缀

(let ((date (format-time-string "%Y%m%d")))
  (dolist (file (directory-files "." nil "\\.txt$"))
    (rename-file file (concat date "-" file))
    (message "Renamed: %s → %s-%s" file date file)))
```

```bash
chmod +x rename-prefix.el
./rename-prefix.el
# 输出：Renamed: notes.txt → 20260606-notes.txt
```

**逐部分解释**：

- `#!/usr/bin/emacs --script` 是 shebang，让脚本直接可执行
- `format-time-string`、`directory-files`、`rename-file` 都是 Emacs Lisp 内置函数，文档用 `C-h f` 随时查
- `--batch` 模式下 Emacs 不显示 GUI，不加载用户 `init.el`，只执行脚本逻辑
- 适合正则替换、格式转换、批量文件操作——比 Python 多了完整的 Emacs 文本处理 API

## 踩过的坑

1. **初始键位陡峭**：`C-x C-c`（退出）、`C-x C-s`（保存）、`M-x`（运行命令）组合键密集，前两周容易频繁误触——先跑 `M-x help-with-tutorial` 完成内置 30 分钟教程，再上手正式使用。

2. **init.el 配置膨胀**：多年积累的配置文件容易变成几千行「谁也看不懂」的 Lisp——推荐从第一天开始用 `use-package` 声明式管理每个包的配置，用 `straight.el` 或 `elpaca` 锁定包版本，保持配置可重现。

3. **启动速度慢**：几十个插件全量 `require` 导致冷启动需要数秒——用 `emacs --daemon` 在后台常驻一个 Emacs 进程，之后用 `emacsclient -c` 瞬间打开新 frame，彻底规避冷启动问题。

4. **Evil 模式键位冲突**：引入 Vim 仿真层（`evil-mode`）后，部分 Evil 键位（如 `C-u`）会覆盖 Emacs 原生命令，同时存在两套思维模型容易让新手陷入混乱——决定引入 Evil 前，先用原生 Emacs 键位至少一个月，建立肌肉记忆后再叠加。

## 适用 vs 不适用场景

**适用**：

- 需要高度定制化工作流——Emacs Lisp 可以把编辑器变成任何东西
- 长期写作 + 代码混合任务（Org-mode 文学编程、科研笔记、论文写作）
- 需要把多个工具（Git、Shell、REPL、邮件）整合进同一个界面
- 喜欢理解并控制工具内部实现的开发者

**不适用**：

- 需要快速上手、零配置即用（推荐 VS Code 或 JetBrains 系列）
- 团队协作中需要统一 IDE 配置（Emacs 高度个人化，团队配置难以同步）
- 主要做移动端开发（Android Studio / Xcode 有大量 GUI 专属工具）
- 只需要轻量级文件编辑，不需要「操作系统级」功能

## 历史小故事（可跳过）

- **1976 年**：David Moon 和 Guy Steele 为 TECO 编辑器写了一套宏集，命名为 EMACS（Editing MACroS）——这是 Emacs 名字的起源。
- **1984 年**：Richard Stallman 启动 GNU Project，GNU Emacs 是第一个立项的软件。他从 Gosling Emacs 出发重写，把 Mocklisp 解释器换成了真正的 Lisp 解释器，导致几乎所有代码被重写。
- **1985 年 3 月 20 日**：GNU Emacs v13（第一个公开版本）发布，同时也是 GNU Project 第一个正式发布的程序。
- **1999 年**：Emacs 开放了公共开发邮件列表，从「大教堂」模式转向更开放的社区协作，被 Eric Raymond 在《大教堂与集市》中作为案例引用。
- **2022 年（Emacs 28.1）**：引入通过 `libgccjit` 的原生编译（Native Compilation），Emacs Lisp 执行速度大幅提升。
- **2023 年（Emacs 29.1）**：内置 LSP 客户端 Eglot、内置 `use-package`、集成 Tree-sitter 语法高亮——把近十年社区最流行的三个插件全部官方化。

## 学到什么

1. **「可编程」比「功能丰富」更持久**：Emacs 40 年屹立不倒，不是因为内置功能最多，而是因为它的 Lisp 运行时让社区可以自己添加任何功能
2. **自文档是软件工程的一个设计原则**：Emacs 的每个函数都内联文档、每个快捷键都可以自省——这让用户永远不需要离开编辑器去查文档
3. **哲学选择决定产品形态**：Emacs 选择了「一个 Lisp 运行时 + 薄文本层」，Vim 选择了「模式化击键效率」——两者都没有错，它们服务不同的用户心智模型
4. **守护进程模式是长寿软件的通用解法**：`--daemon` + `emacsclient` 的架构让 Emacs 的启动开销从「每次打开都付」变成「只付一次」，值得借鉴到其他工具设计

## 延伸阅读

- 官方文档：[GNU Emacs Manual](https://www.gnu.org/software/emacs/manual/html_node/emacs/index.html)（内置 `C-h i` 也可访问，完整参考手册）
- 入门视频：[System Crafters — Emacs From Scratch](https://www.youtube.com/playlist?list=PLEoMzSkcN8oPH1au7H6B7bqlokmFmL7xa)（从零开始配置 Emacs 的系列视频）
- 社区配置：[Doom Emacs](https://github.com/doomemacs/doomemacs)（预配置好的 Emacs 框架，适合想直接上手的新用户）
- 深度书籍：[Learning GNU Emacs, 3rd Edition](https://www.oreilly.com/library/view/learning-gnu-emacs/0596006489/)（O'Reilly 出版，系统覆盖 Emacs Lisp 与配置）
- [[vim]] —— 同时代的「模式编辑」流派，Emacs 与 Vim 的设计哲学互为镜像
- [[neovim]] —— Vim 的现代分支，借鉴了部分 Emacs 的可扩展思路（Lua 脚本 + LSP）

## 关联

- [[vim]] —— 同属「程序员必知编辑器」，击键效率极高，与 Emacs 的「Lisp 运行时」路线形成对比
- [[neovim]] —— Vim 的现代化重写，引入 Lua 脚本层、Tree-sitter、内置 LSP——与 Emacs 29 几乎同步的特性演进
- [[monaco-editor]] —— VS Code 的编辑器内核，代表「浏览器原生、零配置」路线，与 Emacs 「高配置、Lisp 元编程」路线相对

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[geany]] —— Geany — GTK 轻量 IDE
- [[monaco-editor]] —— monaco-editor — 把 VSCode 编辑器搬进浏览器的 SDK
- [[spacemacs]] —— Spacemacs — Space 键统一 Vim 与 Emacs
- [[textmate]] —— TextMate — macOS 经典编辑器，语法格式影响了所有人
- [[vim]] —— Vim — 模态编辑器之父

