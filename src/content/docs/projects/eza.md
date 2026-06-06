---
title: eza — 现代 ls 替代（exa 的社区接管 fork）
来源: 'https://github.com/eza-community/eza'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

eza 是 **2022 年社区接管 exa（原作者停止维护后另起的 fork）写的现代 ls 替代**——同样 Rust 单二进制，把"ls 输出黑白一锅粥"变成"带颜色 + git 状态 + 树视图 + 图标"的现代终端体验。

日常类比：

- **ls 是手抄目录清单**——文件名一行一个，黑白，没有任何上下文
- **eza 是带图标和便签的彩色目录牌**——同一个文件夹，图标提示文件类型，颜色区分文件 vs 目录 vs 可执行，旁边还贴张小纸条写"这文件被 git 改过"

你在终端 `ls -l` 看一片单色文字；换成 `eza -l --git --icons`，瞬间得到 VS Code 文件树 + git 状态 + 文件大小都能看清——而且**还在终端里没切走**。

```bash
# 装好后最小试用
brew install eza
eza -l --git --icons   # long 视图 + git 列 + 图标
```

## 为什么重要

不只是"把 ls 涂上颜色"，它改变了终端浏览目录的体验：

- **git 状态零成本可见**——文件改没改、staged 没 staged，左侧 gutter 直接告诉你，不用跑 `git status`
- **tree 命令被吞掉了**——`eza -T` 等于 `tree`，统一在 ls 替代里，省一个命令
- **icons + 颜色双重视觉编码**——文件类型扫一眼就分清楚，新人在大项目里不再"看不到森林"
- **它和 [[bat]] / [[fd]] / [[ripgrep]] 是同代产品**——Rust 现代 CLI 套件的"ls 那块拼图"，dotfiles 高频组合

## 核心要点

eza 的设计可以拆成 **3 件事**：

1. **一次扫描多种视图**：`eza` 一次跑就把 stat / 扩展属性 / git status 都拿了，再用同一份元数据渲染 grid（默认）、long（`-l`）、tree（`-T`）。换视图不需要重读磁盘。

2. **git 集成 = 多一列**：`--git` 在 long 视图加一列符号——`-N` 新文件、`-M` 修改、`II` 已 ignore、`--` 干净。和 [[bat]] 的 gutter 是同一思路：把 git 状态融进基础工具。

3. **icons 和 hyperlinks 是 Nerd Font 时代的红利**：`--icons` 用 Unicode 私有区图标（需要 Nerd Font 字体）；`--hyperlink` 输出 OSC 8 转义序列，现代终端（iTerm2 / WezTerm / Kitty）能 cmd+click 直接跳到文件。这两个 flag 是 ls 永远不会有的体验。

三件事合起来，eza 的定位是"基础命令 + 现代终端能力的桥"——它没发明新交互，只是把 git / 图标 / 超链接这些已经存在的能力，塞进每天敲几十次的 `ls` 里。

## 实践案例

### 案例 1：日常 ll 别名

```bash
alias ll='eza -lh --git --icons --group-directories-first'
alias la='eza -lah --git --icons'   # 带隐藏文件
alias lt='eza -T --git-ignore --level=2'  # 树视图
```

`-lh` 是 long + 人类可读大小（`1.2K` 而不是 `1234`）；`--git` 加一列 git 状态；`--icons` 加文件图标；`--group-directories-first` 把目录排前面（dotfiles 高频条目）。日常 `ll` 一打就是带上下文的目录视图，`la` 看隐藏文件，`lt` 看树形——三条 alias 就把 ls / tree 都换掉了。

### 案例 2：替代 tree 命令

```bash
eza -T --level=3 --git-ignore
```

`-T` 树视图，`--level=3` 只展开 3 层（避免在 monorepo 里展成 10 屏），`--git-ignore` 自动跳过 `.gitignore` 里的目录（`node_modules` / `dist` / `target` 直接消失）。比 `tree` 命令多了"识别 git ignore"这一步——大项目里救命。

输出长这样（截取前几行）：

```
src
├── content
│   ├── docs
│   └── styles
└── components
    └── Button.tsx
```

颜色 + icons 加持下，一眼就看清结构，不用再 `tree -I 'node_modules|dist'` 手动写 ignore。

### 案例 3：配 fzf 做项目跳转预览

```bash
fzf --preview 'eza -T --color=always --level=2 {}'
```

打开 fzf 选目录，右侧实时预览这个目录的 2 层树形结构。`--color=always` 强制输出 ANSI 色码（fzf 接收得了），不加的话预览是黑白的，看着废。和 [[bat]] 当文件预览一样的套路，eza 负责目录维度。

## 踩过的坑

1. **`alias ls=eza` 让脚本炸**——`ls` 在 shell 脚本里被当默认调用，eza 输出格式（颜色码 / icons）会让 `ls foo | wc -l` 这种解析挂掉。**正确做法**：alias 只在 interactive shell 设（`if [[ $- == *i* ]]`），或者用 `ll` 这种新别名，留 `ls` 给脚本。

2. **icons 显示成方框 / 问号**——Nerd Font 没装，终端字体没图标。先装 [Nerd Fonts](https://www.nerdfonts.com/)（推荐 JetBrainsMono Nerd Font），iTerm/Terminal.app 切字体，再用 `--icons`。这一步是 100% 新人会卡的地方。

3. **`--git` 在大仓库慢**——eza 要逐文件查 git 状态，10k+ 文件的 monorepo 一次列目录能慢到 1-2 秒。用 `--git-ignore` 先过滤一批，或干脆**别在 monorepo 根目录加 `--git`**，进到子目录再开。

4. **macOS brew 和 Linux apt 版本经常错位**——某些较新 flag（`--hyperlink` / `--no-quotes`）老版本没有，跨机器跑 dotfiles 之前先 `eza --version` 比对。Debian apt 包名是 `eza`，但稳定通道版本通常落后半年。

## 适用 vs 不适用场景

**适用**：

- 日常浏览代码仓库 / 项目目录——颜色 + git + icons 大幅降低认知负担
- 配合 [[fzf]] / [[bat]] / [[ripgrep]] 做交互式工具链——eza 提供"目录维度的彩色预览"
- dotfiles 高频别名（`ll` / `tree`）——一行 alias 升级整个终端体验
- 跨平台需要统一行为——eza 在 macOS / Linux / Windows 表现一致，比系统自带 ls 好
- 教学场景给新人看目录结构——图标 + 颜色比纯文本对零基础友好得多

**不适用**：

- shell 脚本 / 自动化场景——保留系统 ls，输出格式稳定
- 极简环境（Alpine 容器、busybox 系统）——eza 二进制 ~5 MB，没必要
- 终端字体不支持 Nerd Font——icons 退化成方框，体验崩
- 需要 POSIX 严格兼容的脚本——eza 的 flag 体系是自己的（`-T` / `--git`），和 ls 不完全对应

## 历史小故事（可跳过）

- **2014 年**：Benjamin Sago 用 Rust 写出 exa（ogham/exa），是 Rust CLI 现代化套件的早期成员，和 fd / bat / ripgrep 同期
- **2021 年**：exa 作者宣布"只做维护、不再加新功能"，PR 队列开始堆积（当时已经堆到 100+ 个未合并）
- **2022 年 8 月**：社区另起 fork，命名 eza（"exa" 把 x 换成 z），由 cafkafk 等人主导，半年内合掉 exa 积压的 50+ PR、修了著名的 "Grid Bug"
- **2023–2024 年**：brew / arch AUR / nixpkgs 全线把 exa 替换成 eza 作为推荐包，exa 进入 "deprecated" 状态
- **2025 年起**：eza 进入稳定期，新功能放缓，主要做 SELinux / hyperlink / theme.yml 等长尾完善

eza 是开源项目"原作者不维护 → 社区 fork → fork 反超原作"的标准模板——和 [[fzf]] 衍生的 sk、Webpack 衍生的 Rspack 故事相似。

## 学到什么

1. **小工具 fork 也能反超原作**——只要原作 PR 堆 1 年，社区 fork 的"愿意 review + 合 PR"本身就是稀缺资源；eza 半年就做到了 exa 三年没做的事
2. **Rust CLI 套件的护城河是单二进制**——brew install 一行，不依赖运行时，这是 eza/bat/fd/ripgrep 共同的传播加速器
3. **基础命令加 git 上下文是当代趋势**——bat 加 gutter、eza 加 git 列、delta 接管 git diff——"工具知道你在 git 仓库里"成了默认期待
4. **Nerd Font 是终端体验升级的隐藏前置**——大量现代 CLI 工具的"漂亮版本"都依赖 Nerd Font，这一步装好之后，整套生态才打开

## 延伸阅读

- 官方 README：[github.com/eza-community/eza](https://github.com/eza-community/eza)（含安装指南、flag 对照表）
- Nerd Fonts 安装：[nerdfonts.com](https://www.nerdfonts.com/)（不装这个 `--icons` 就废了）
- 社区 fork 缘起：[eza vs exa: Why we forked](https://github.com/eza-community/eza/blob/main/README.md)（README 里有一段说明）
- 配 fzf 工作流：[junegunn/fzf wiki — Examples](https://github.com/junegunn/fzf/wiki/Examples)（搜 `tree` 看预览配置）
- theme.yml 自定义颜色：[eza docs/theming](https://github.com/eza-community/eza/blob/main/docs/themes.md)（想脱离默认主题再看）

## 关联

- [[bat]] —— 现代 cat 替代；和 eza 是同一脉，把 git 状态融进基础命令
- [[fd]] —— 现代 find 替代；David Peter 写的，和 eza 常一起出现在 dotfiles
- [[ripgrep]] —— 现代 grep 替代；Rust CLI 套件的"搜索那块"
- [[fzf]] —— 命令行模糊查找；和 eza 配合做交互式目录预览
- [[claude-code]] —— 终端 AI 助手；和 eza/bat 同属"终端体验现代化"工具链不同层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[fzf]] —— fzf — 命令行模糊查找
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

