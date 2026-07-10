---
title: Doom Emacs — 启动不到一秒的模块化 Emacs 配置
来源: 'https://github.com/doomemacs/doomemacs'
日期: 2026-06-24
分类: 编辑器
难度: 初级
---

## 是什么

想象你买了一辆性能车（Emacs），引擎很猛但出厂时没有方向盘套、没有导航、座椅也不舒服——你得自己一个零件一个零件地装。Doom Emacs 就是一家改装店帮你把全车装好交付：座椅调好、导航装好、赛道模式调好、钥匙一拧就走。你拿到手能直接开，但如果哪天想换方向盘套的颜色，仍然可以自己动手——因为底下还是那辆原装车。

技术上说，Doom Emacs 是一个**Emacs 配置框架**：它不修改 Emacs 源码，而是在用户配置层用 Emacs Lisp 做了大量优化和预设。它把几百个社区包组织成约 150 个"模块"，用声明式的方式让你在一个文件里勾选想要的功能。启动时间被压到 1 秒以内（原版 Emacs 不优化通常 3-5 秒），同时默认启用 Evil Mode——即 Vim 的全套按键操作。

GitHub 约 22k stars，作者 Henrik Lissner（网名 hlissner），2016 年开始开发。

## 为什么重要

- 为什么有人说"Emacs 上手太难"但又有人说"我第一天就能用"——后者大概率用的是 Doom
- 为什么 Vim 用户能无缝切到 Emacs——Doom 默认用 Evil Mode 让你 `hjkl` 移动、`dd` 删行、`:wq` 保存退出，和 Vim 一模一样
- 为什么 [[spacemacs]] 和 Doom 经常被放在一起比较——它们解决同一个问题（Emacs 开箱难用），但架构哲学不同
- 为什么有人说"配置 Emacs 就是一种编程"——Doom 用三个文件（`init.el`、`config.el`、`packages.el`）把复杂度分层，让"配置"变成"勾选 + 微调"而不是"从零写一千行 Lisp"

## 核心要点

Doom 的设计围绕**三个原则**：

**1. 性能第一。** 原版 Emacs 启动慢的根因是加载时机太早——很多包你打开编辑器时根本不需要，但它们在 `init.el` 里被同步加载了。Doom 做了三件事：延迟加载（autoload）——函数只在第一次调用时才加载对应的包；字节编译——把 `.el` 编译成更快的 `.elc`；垃圾回收阈值调整——启动期间临时把 GC 阈值拉到极大值，避免频繁暂停。

**2. 模块化声明式配置。** 用户在 `init.el` 里用 `(doom! ...)` 宏声明想启用哪些模块。每个模块是一个目录，包含 `config.el`（配置）、`packages.el`（依赖声明）、`autoload/`（延迟加载函数）。你想要 Python 开发环境？加一行 `(python +lsp)`。想要 Org Mode？加 `(org +roam +journal)`。不想要就注释掉——不会加载一行多余代码。

**3. Vim 键位是默认公民。** Doom 的按键体系建立在 `SPC`（Space）作为 leader key 之上——按空格弹出命令菜单，再按一个字母选分类（`SPC f` = 文件操作，`SPC b` = Buffer 操作，`SPC g` = Git 操作）。这套设计借鉴了 [[spacemacs]]，但 Doom 的实现更轻量。

用户配置拆成三个文件，各管一件事：

**`~/.config/doom/init.el`（或 `~/.doom.d/init.el`）** —— 模块开关，只做"选什么"：

```elisp
(doom! :completion
       (vertico +icons)        ; 模糊搜索
       :editor
       evil                     ; Vim 模拟
       :lang
       (python +lsp +pyright)
       (org +roam +journal)
       (rust +lsp))
```

**`config.el`** —— 个人偏好（主题、字体、目录）；**`packages.el`** —— 额外包。改完 `init.el` / `packages.el` 后跑 `doom sync` 才会装包、重编译。

## 实践案例

### 案例 1：从安装到第一次使用

```bash
# 前置：装好 Emacs 29+、Git、ripgrep
git clone --depth 1 https://github.com/doomemacs/doomemacs ~/.config/emacs
~/.config/emacs/bin/doom install
```

`doom install` 会问你几个问题（要不要 Evil Mode、要不要默认配置），然后自动拉包、编译。整个过程 2-5 分钟。装完后打开 Emacs，你会看到一个暗色主题、带 dashboard 的现代界面——不像原版 Emacs 那个 2003 年的工具栏。

### 案例 2：日常操作（Vim 用户视角）

跟做一条最短路径：打开文件 → 改一行 → 保存。

1. `SPC f f` 模糊搜文件（类似 VS Code `Ctrl+P`），回车打开
2. 按 `i` 进入插入模式，改文字；`Esc` 回 Normal
3. `:w` 保存（或 `SPC f s`）；要退出用 `:q`

其余按键与 Vim 一致：`dd` 删行、`yy` 复制、`/keyword` 搜索。Doom 在 Vim 之上加了 `SPC` leader：

- `SPC b b` — 切换 Buffer
- `SPC s p` — 项目内全文搜索（ripgrep）
- `SPC g g` — 打开 Magit（Git 界面）
- `SPC w v` — 垂直分屏

### 案例 3：模块的加减法

假设你不做 Python 开发但要写 Go：

1. 打开 `~/.doom.d/init.el`
2. 注释掉 `python` 那行，取消注释 `(go +lsp)`
3. 终端跑 `doom sync`
4. 重启 Emacs——Go 的 LSP、格式化、测试集成全到位

整个过程不超过 1 分钟。这就是模块化的好处：你不需要知道底层配了哪些包、用了什么 hook——模块作者已经把最佳实践封装好了。

## 踩过的坑

1. **`doom sync` 忘了跑**：改了 `init.el` 或 `packages.el` 后必须跑 `doom sync`。很多新手改完配置重启 Emacs 发现没变化，就是忘了这步。`config.el` 的改动不需要 sync（重启即可），但前两个文件必须。

2. **和原版 Emacs 教程冲突**：网上搜到的 Emacs 配置片段经常和 Doom 不兼容。比如 `(use-package ...)` 在 Doom 里不能直接用——Doom 用自己的 `(after! ...)` 宏代替。新手经常抄了别人的配置粘进 `config.el` 然后报错。原则：Doom 生态内找答案，优先查 Doom 文档和 Doom Discord。

3. **升级偶尔会炸**：`doom upgrade` 拉最新代码，偶尔会因为上游包 breaking change 导致启动失败。安全做法是升级前先 `doom sync` 确认当前能跑，升级后看报错日志 `*Messages*` buffer，实在修不了就 `git checkout` 退回。

4. **配置目录搞混**：老教程写 `~/.doom.d/`，新安装默认常是 `~/.config/doom/`。改错目录等于白改；以 `doom doctor` 打印的路径为准。

## 适用 vs 不适用场景

**适用**：

- 你是 Vim 用户但想要 Emacs 的 Org Mode / Magit / Lisp 环境——Doom 让你几乎不用改肌肉记忆
- 你想用 Emacs 但没时间从零配置——约 150 个模块，勾选后 20 分钟能搭出可用环境
- 你想要极快的启动速度——优化后冷启动通常 < 1 秒（未优化原版常见 3–5 秒）
- 你喜欢声明式配置而非命令式——"勾选模块"比"手动 require + hook + keybind"简单十倍

**不适用**：

- 你想深度理解 Emacs 内部机制——Doom 封装了太多细节，初学 Emacs Lisp 建议先用原版 [[emacs]] 从空配置开始
- 你完全不用终端和键盘驱动工作流——[[vscode]] 的鼠标 + GUI 体验更友好
- 你需要极度稳定、不更新的环境——Doom 是活跃开发中的框架，上游变动偶尔引入 breaking change
- 你不喜欢 Vim 按键又不想花时间学——虽然 Doom 支持 Emacs 原版按键（关掉 Evil），但整套 leader key 体系就不那么顺手了

## 历史小故事（可跳过）

- **2016 年**：Henrik Lissner 开始写 Doom，最初只是他的个人 Emacs 配置。
- **2018 年**：star 数破万，从个人配置变成社区项目，Discord 服务器建立。
- **2020 年**：Doom 在 Reddit 和 YouTube 上大量曝光，成为 Emacs 新用户首选入口。
- **2023 年**：迁移到 Emacs 29 native-comp，启动速度再次提升。

## 学到什么

1. **"预配置发行版"降低的不只是门槛，还有决策疲劳**：原版 Emacs 有 5000+ 个包，"选哪个补全框架""用哪个主题""Git 界面装什么"每个都是决策。Doom 的模块系统把这些决策打包成社区最佳实践——你只需要说"要"或"不要"。

2. **延迟加载是性能优化的核武器**：Doom 的启动速度靠的不是"少装包"，而是"装了但不立刻加载"。同样的 100 个包，eager-load 要 5 秒，autoload 只要 0.5 秒。这个道理在前端（动态 import）、后端（懒初始化）一样适用。

3. **声明式 > 命令式（在配置场景里）**：`(python +lsp)` 一行 vs 手动写 20 行 `use-package` + hook + keybind。声明式把"做什么"和"怎么做"分离——你说意图，框架负责实现。

4. **框架终究是别人的代码**：Doom 封装得再好，出了 bug 你还是得读 Emacs Lisp 源码。框架帮你跑起来，但长期使用需要逐渐理解底层——这不是 Doom 的缺点，是所有框架的本质。

## 延伸阅读

- 官方文档：[Doom Emacs Docs](https://docs.doomemacs.org/latest/)（模块列表、配置指南）
- 入门视频：[Doom Emacs Getting Started (DistroTube)](https://www.youtube.com/watch?v=rCMh7srOqvw)
- [[emacs]] —— Doom 的底座，理解 Emacs 才能深度定制 Doom
- [[spacemacs]] —— 同类产品，layer 系统 vs Doom 的 module 系统
- [[vim]] —— Doom 的按键体系来源

## 关联

- [[emacs]] —— Doom 是 Emacs 的"改装版"，所有 Emacs Lisp API 在 Doom 里照样能用
- [[spacemacs]] —— 另一个 Emacs 发行版，更重量级但开箱即用程度相近；Doom 追求更快更轻
- [[vim]] —— Doom 默认用 Evil Mode 复刻 Vim 全套按键，Vim 用户迁移成本几乎为零
- [[vscode]] —— 如果只想"开箱就写代码"且不需要 Emacs 生态的深度定制能力，VS Code 是更简单的选择
- [[atom]] —— 已停维的编辑器，和 Doom 一样追求"hackable"但走了 Web 技术栈（Electron）
- [[textmate]] —— macOS 上的先驱编辑器，影响了 VS Code 和 Sublime 的 bundle/snippet 概念

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[atom]] —— Atom — Web 技术做桌面编辑器的先驱
- [[emacs]] —— GNU Emacs — 一个伪装成编辑器的 Lisp 操作系统
- [[lunarvim]] —— LunarVim — 开箱即用的 Neovim IDE 发行版
- [[nvchad]] —— NvChad — 极致美观的 Neovim 配置
- [[spacemacs]] —— Spacemacs — 让 Vim 党和 Emacs 党握手的编辑器配置
- [[textmate]] —— TextMate — macOS 上定义 bundle 宏系统的编辑器
- [[vim]] —— Vim — 键盘上弹钢琴的编辑器
- [[vscode]] —— VS Code — 把编辑/调试/扩展捏成一个跨平台壳

