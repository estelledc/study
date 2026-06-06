---
title: tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
来源: https://github.com/jonas/tig
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

tig 是 **Jonas Fonseca 2006 年开始用 C 写的 ncurses 文本界面 git 浏览器**。它和 [[gitui]] / [[lazygit]] 都属于"git TUI"这个大类，但定位明显不同——tig 不想做"在终端里完整管理 git 操作"，它只盯三件事：**看 log、查 blame、读 diff**。剩下的 commit / push / rebase 这些"写"动作，它默认让你回 git CLI 自己去干。

日常类比：

- **lazygit / gitui 是终端里的图形客户端**——能看也能改，菜单铺满整屏
- **tig 是 git 的高级 less**——只读为主，但读得又快又顺手，键位和 vim/less 几乎一样

数据上看：截至 2026-05，13.2k stars、2900+ commits、最新版本 2.6.0（2025-09）。代码库里 C 占 82%、Shell 占 15%，全部跑在 ncurses 上。装上 git 和 ncurses 之后 `make && make install` 就能用。

## 为什么重要

不理解 tig 的设计取舍，下面这些事都没法解释：

- 为什么一个 2006 年的项目到 2026 年还在更新——因为它做的事很窄、底层 API 很稳，**没什么需要追的潮流**
- 为什么"只读 git TUI"是个长期有市场的品类——`git log --oneline` 看几屏没问题，看几千个 commit 就需要分页 + 跳转 + 搜索
- 为什么 tig 用 C + ncurses 而不是 Rust + ratatui——历史包袱是一面，**ncurses 这个 30 年老库本身够用且无依赖**也是一面
- 为什么它的 blame 视图体验比 `git blame` 原生命令好那么多——因为它能上下移动光标、按 P 跳到该行的"前一次修改"、按回车直接看那个 commit

## 核心要点

tig 的设计可以拆成 **4 件事**：

1. **复用 git porcelain 的输出**：tig 不调 libgit2、不读 .git 内部，它是真的 fork 一个 `git log --pretty=raw` 然后把输出解析成内部数据结构。这个设计和 [[lazygit]] 同源，慢是慢点，但**永远不会跟不上 git 主仓的功能**——sparse-checkout / LFS / partial clone 出来什么 tig 自动支持。

2. **四个核心视图**：main（log 列表）/ diff（一个 commit 的修改）/ blame（按行追溯作者）/ status（当前工作区改动）。每个视图都是一屏，键盘 hjkl 移动，回车展开下一层。多视图用 `|` 风格的水平分屏并存。

3. **键位贴 vim/less**：`j/k` 上下、`/` 搜索、`n/N` 跳搜索结果、`q` 退出、`:` 进命令模式跑 git。学过 vim 的人零成本上手——这是 tig 区别于 [[gitui]] / [[lazygit]] 那种"自创键位表"工具的关键体验。

4. **pager 模式当 less 替代品**：`git show HEAD | tig` 可以把任意 git 命令的输出喂给 tig 当分页器，diff 高亮 + 上下文跳转都比 less 强。这是它最被低估的用法，很多人配 `git config core.pager tig` 当默认 pager 用。

## 实践案例

### 案例 1：在 30 万 commit 的仓库里找一行代码什么时候改的

```bash
cd ~/code/some-big-repo
tig blame src/parser.c
# 光标移到那一行（j/k），按 Enter → 直接展开引入这次改动的 commit
# 在 commit 视图里再按 P → 跳到这一行的"上一次"修改
# 一直按 P 可以追溯到这一行的最初出生
```

**逐部分解释**：

- `tig blame` 接管整个屏幕，左边是作者+commit hash，右边是源代码
- `P`（大写 P）是 tig 独有的"parent blame"——`git blame` 命令行版做不到这一步
- 整个流程不离开 tig，回 git CLI 干这件事要敲 4-5 个 `git log -L:func:file`，效率差一大截

### 案例 2：当 git 默认 pager

```bash
git config --global core.pager tig
# 之后 git log / git show / git diff 都自动用 tig 显示
git log
# tig 接管，可以按 j/k 滚动、按回车展开 commit、按 / 搜索
# 按 q 退出回到 shell
```

这一步把 tig 从"独立工具"变成"git 命令的副驾驶"，没改你任何 git 习惯，但每次输出 > 一屏时自动得到分页 + 跳转能力。

### 案例 3：tig 看不了的事

```bash
tig
# 想 commit → 不行，按 c 没反应
# 想 push → 不行，没绑这个键
# 想 rebase --interactive → 不行
# 想改 git config → 不行
```

这些 **写操作 tig 默认不做**。设计哲学就是"读归我、写回 git CLI 你自己来"。想要在终端里也能做写操作，去看 [[lazygit]] / [[gitui]]。

### 案例 4：和 fzf / delta 串起来

```bash
# 在 tig 命令模式按 ! 调外部命令
:!git log --oneline | fzf
# 选一个 commit hash，再用 tig show <hash> 看完整 diff
# 或在 ~/.tigrc 里把 :!delta 绑成键位，让 diff 视图直接走 delta 渲染
```

tig 的扩展不是插件系统，是 **`.tigrc` 里 `bind` 一行映射 + `!` 调外部命令**。简陋但够用。

## 踩过的坑

1. **macOS 系统自带的 ncurses 太旧**：`brew install tig` 装的是绑了 brew ncurses 的版本没问题；自己 `make` 的话默认链系统 ncurses，颜色和 256 色 theme 显示会出问题。修法是 `./configure --with-ncursesw` 显式指定 wide ncurses。

2. **大仓首次进 main 视图慢**：tig 启动时会跑一次 `git log` 把全部 commit 加载，30 万 commit 仓库要等 5-10 秒。后续翻页因为已经在内存里所以很快。lazygit / gitui 是异步加载，体验上没这个停顿。

3. **blame 视图的 P 在 merge commit 上行为奇怪**：tig 的 parent blame 在线性历史里很顺手，遇到 merge commit 它跳到 first-parent 那条线，可能漏掉真正引入修改的另一条分支。要在 `.tigrc` 里 `set blame-options = --first-parent` 或者改 `--all` 看你想要哪种语义。

4. **搜索是按"显示文本"匹配不是按 commit 内容**：`/` 在 main 视图里搜的是当前屏幕上看到的字（hash 前 7 位、作者名、commit 标题首行），不是搜 commit 完整 message 或 diff 内容。要搜 message 得用 `:` 进命令模式跑 `git log --grep`。

5. **没有跨平台 GUI fallback**：纯 ncurses 意味着 Windows 原生不支持，要走 WSL 或 Cygwin。这点 [[gitui]] / [[lazygit]] 都比 tig 强（Windows 原生支持）。

## 适用 vs 不适用场景

**适用**：

- 远程 SSH 到生产机查 git 历史——tig 只要有 git + ncurses 就跑，不需要装 Rust/Go runtime
- 想把 git 默认 pager 升级——`core.pager tig` 一行配置全 git 命令受益
- 重度 blame 用户——`P` 键追溯链路是别的工具学不来的
- 喜欢 vim/less 键位、不想再学一套 lazygit/gitui 的快捷键
- C / 老 Unix 风格洁癖——tig 没有任何运行时依赖，只链 ncurses + git

**不适用**：

- 想要终端里完整管 git（commit / rebase / branch 切换）——tig 不做写，去 [[lazygit]] / [[gitui]]
- Windows 原生用户（不上 WSL）——ncurses 路径行不通
- 大仓库要求秒开——首屏构建 commit list 没法异步
- 团队里很多新人——tig 的视图切换逻辑（main/diff/blame 之间用回车展开）需要适应期，不如 lazygit 的菜单直观
- 想要鼠标操作或 GUI——tig 完全键盘驱动

## 历史小故事（可跳过）

- **2006 年**：Jonas Fonseca 在 Linux 内核邮件列表里嫌 `git log` 翻页不顺手，写了第一版 tig 当个人工具发出来。那个时代 git 本身才出来一年（2005 年 4 月发布），周边生态几乎空白
- **2008–2012**：tig 成为 git 用户在终端浏览历史的事实标准之一，被 Debian / Ubuntu / Homebrew 收录到主仓库。同期 SmartGit / SourceTree 等 GUI 工具也在崛起，但终端用户群一直没流失
- **2013–2020**：维护频率降下来，每年 1-2 个小版本，主要修 bug 和兼容新 git 命令。这段时间也是 lazygit（2018）/ gitui（2020）这些"新世代"git TUI 出现的窗口
- **2021–2025**：Jonas 仍在维护，2.6.0 在 2025 年 9 月发，加了对 git 2.43+ 新输出格式的兼容。13k stars、活跃 issue tracker——一个 19 年项目能保持这种健康度，证明它选的需求是真长期需求

## 学到什么

1. **"只读"是一个独立的产品定位**——tig 不和 lazygit/gitui 争"在终端里干完所有 git 操作"的赛道，它只把"看历史"这一件事做到极致。这种**主动收窄范围**的产品决策，是它能维护 19 年的根本原因
2. **复用 git porcelain 输出 vs 直接读 .git 内部**——和 [[gitui]] 选 libgit2 直读相比，tig 选了 fork 子进程的"老办法"，但换来的是**永远跟得上 git 主仓功能**。每种路线都有理由
3. **键位复用 vim/less 是隐藏的产品力**——同样是 TUI，让用户"零迁移成本"上手的工具远比"自创一套漂亮键位"的工具长寿。Vim 用户来 tig 几乎不用看 help
4. **C + ncurses 在 2026 年依然是合理选择**——不是所有工具都要追 Rust。tig 这种**逻辑简单、依赖稳定、长期不重构**的工具，老技术栈反而更省事

## 延伸阅读

- 项目主页：[jonas/tig](https://github.com/jonas/tig)（README 简短，重点看 manual）
- 官方文档：[jonas.github.io/tig/doc/manual.html](https://jonas.github.io/tig/doc/manual.html)（所有视图 + 键位 + tigrc 配置）
- ncurses 入门：[NCURSES Programming HOWTO](https://tldp.org/HOWTO/NCURSES-Programming-HOWTO/)（想自己写终端工具的起点）
- [[gitui]] —— 同品类 Rust 实现，对照阅读
- [[lazygit]] —— 同品类 Go 实现，更全功能但更重

## 关联

- [[gitui]] —— 同品类对照，Rust + libgit2 vs C + git 子进程的两条工程路线
- [[lazygit]] —— Go 写的全功能 git TUI，比 tig 多写操作但启动更慢
- [[delta]] —— diff 渲染端的 Rust 工具，可作为 tig 的外部 diff viewer
- [[fzf]] —— 通过 `:!fzf` 在 tig 里嵌入模糊搜索
- [[ripgrep]] —— 同样的"专注一件事 + 不追潮流"工程哲学，但是搜索方向
