---
title: lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
来源: 'https://github.com/jesseduffield/lazygit'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

lazygit 是 **Jesse Duffield 用 Go 写的 git 终端图形界面客户端**，把 git 的常用操作（add / commit / branch / rebase / stash / cherry-pick）全塞进一个**五面板一屏的 TUI**——每个面板对应一种 git 概念，单键就能在面板间跳，按几下就完成原本要敲十几条 git 命令的事。它和 [[btop]] 同样走"多面板 TUI"路线，但场景完全不同：btop 看系统资源，lazygit 看 git 状态。

日常类比：

- **git CLI 是手写订单**——每次都要写全（`git checkout -b feature/x && git add file && git commit -m "..."`），啰嗦但精确
- **lazygit 是点单 App**——菜单都在屏幕上，按字母/方向键选，常用操作一两键就成

启动后默认五面板：**Status**（仓库状态）/ **Files**（暂存区）/ **Branches**（分支列表）/ **Commits**（提交历史）/ **Stash**（stash 栈）。Tab 在面板间切，hjkl 在面板内移光标，每个面板有自己的快捷键提示条——你不需要记 git 命令，只需要记几个单字母。

## 为什么重要

git CLI 的痛点积累 15 年没人系统解决，lazygit 是第一个把这些痛点全打包修了的 TUI：

- **interactive rebase 可视化**——`git rebase -i HEAD~5` 弹个 vim 让你改 pick/squash/edit，错一字就崩；lazygit 在 Commits 面板按 `s/f/r/d` 单键改写，回车确认前都能反悔
- **行级 stage**——`git add -p` 一段一段问 y/n 太烦；lazygit 进文件后按 space 选行/选块，所见即所得
- **cherry-pick 多选**——CLI 要敲一串 hash；lazygit 在 commits 上按 `c` 标记一批，切分支按 `v` 粘贴
- **stash 列表化**——`git stash list` 只是文字；lazygit 让 stash 变成可点击列表

很多人装 lazygit 不是为了酷，而是**因为它把 git 学习曲线砍掉一半**——新人不用先学 30 个 git 子命令，看屏幕提示就能干活。

## 核心要点

lazygit 的设计可以拆成 **4 件事**：

1. **gocui TUI 框架**：作者自己写的 Go 版 ncurses 替代（也开源），负责画面板边框、捕获键盘、渲染文字。和 [[btop]] 用的 C++ ncurses 不一回事但效果类似。

2. **直接调 git 子进程**：lazygit 自己不实现 git 协议，每个操作都 fork 一个 `git` 进程跑——看 Files 面板就是 `git status --porcelain`，按 `c` 提交就是 `git commit -m`。**好处**：和 git 行为完全一致，git 升级不用动 lazygit；**代价**：大仓库下每次刷新都要等 git status 跑完。

3. **YAML 配置 + 自定义命令**：`~/.config/lazygit/config.yml` 改键位、改颜色、加 `customCommands`——你可以绑一个键跑任意 shell，比如把 `git push --force-with-lease` 绑到 `P`。配置和 [[btop]] 的 `btop.conf` / [[fzf]] 的 dotfiles 一样，能进团队 dotfiles 共享。

4. **和外部工具协作**：diff 用环境变量 `GIT_PAGER=delta` 接 [[delta]] 拿语法高亮；分支搜索内置 fuzzy filter（思想和 [[fzf]] 一样）；GitHub PR 集成靠调 `gh` CLI。lazygit 自己只画 UI，脏活包给生态。

## 实践案例

### 案例 1：把 5 个 WIP commit 合成 1 个干净 commit

```bash
lazygit
# 切到 Commits 面板（按 4），光标移到最早那个要改的 commit
# 按 e 进 interactive rebase 模式，光标变成箭头
# 在要 squash 的 commit 上按 s（squash 进上一个）
# 在要改 message 的 commit 上按 r（reword）
# 按 m 选 continue，结束 rebase
```

原来 `git rebase -i HEAD~5` 要在 vim 里手改 pick 为 squash/reword、保存、再处理冲突；lazygit 这一套**全图形化**，每一步都看得见，错了 `Esc` 撤销。

### 案例 2：同一文件只 commit 一部分修改

```bash
lazygit
# 在 Files 面板（按 2）选中改过的文件，按 Enter 进入
# 进入后看到完整 diff，光标变成行选择器
# space 选当前行进暂存；按 v 进入块选择，可整段标
# 按 c 提交，弹出 message 框，写完按 Enter
```

比 `git add -p` 高效一个量级——不是一段一段问你 y/n，而是**所见即所得地框选**。review 自己代码顺手分 commit 时是杀手锏。

### 案例 3：把配置塞进 dotfiles 并加自定义命令

```yaml
# ~/.config/lazygit/config.yml
gui:
  theme:
    activeBorderColor: ['cyan', 'bold']
  showRandomTip: false
customCommands:
  - key: 'P'
    command: 'git push --force-with-lease'
    context: 'global'
    description: 'Safe force push'
```

提交进 dotfiles 后新机器克隆就有同样布局和自定义键，团队风格统一——和 [[btop]] / [[procs]] / [[glances]] 走的是同一套 dotfiles 思路。

## 踩过的坑

1. **Windows cmd.exe 渲染崩**：边框断成乱码、颜色丢失——不是 lazygit bug 是老 cmd.exe 不支持 256 色和 Unicode 边框。装 Windows Terminal / WezTerm / Alacritty 任一现代终端立刻好

2. **大仓库（kernel / Chromium 级）启动 5 秒以上**：每次刷新都跑 `git status` 拿全文件状态——root cause 是 git 自己慢，不是 lazygit。临时方案：config.yml 里 `refresher.refreshInterval: 60` 拉长刷新间隔；终极方案：换更小的仓库

3. **rebase 中途 lazygit 崩了，仓库卡在 rebase-merge 状态**：再开 lazygit 会显示 "Rebase in progress"，按 `m` 选 abort 或 continue；命令行也能 `git rebase --abort` 回滚

4. **diff 没语法高亮**：lazygit 默认不带；配 [[delta]]（`git config --global core.pager delta`）后 lazygit 自动跟随，diff 立刻有 syntax + line number

5. **键位和 vim/tmux prefix 冲突**：进 lazygit 后 hjkl 是面板内移动，如果 tmux prefix 也在 lazygit 里被占用，可以在 config.yml `keybinding` 段重映射

## 适用 vs 不适用场景

**适用**：

- 日常 git 操作 —— commit / push / pull / branch 切换比 CLI 快一倍
- interactive rebase —— 把脏 commit 合成干净的
- 行级 / 块级 stage —— 同一文件分多个 commit
- cherry-pick / stash 管理 —— 列表化操作比 CLI 直观
- 团队 dotfiles 默认装一份 —— 配置可分享，新人上手快

**不适用**：

- 脚本化 / CI 流水线 —— TUI 没 batch 模式；用 git 原生 CLI 或 [[gh]]
- 纯 git log 浏览（不写）—— tig 更轻更专注于只读历史
- ssh 进入老 vt100 哑终端 —— 渲染崩；用 git CLI
- 巨型 monorepo（10 万文件级）—— git status 本身慢，lazygit 跟着慢；用 watchman + git 命令

## 历史小故事（可跳过）

- **2018 年**：Jesse Duffield（澳大利亚开发者）因受够 git CLI 啰嗦，用 Go 写第一版 lazygit，同时造了底层 TUI 框架 gocui
- **2019 年**：第一年涨到 1 万 star，证明 git TUI 是真有市场
- **2021 年**：加 interactive rebase 可视化——这是破圈关键特性，Hacker News 和 r/programming 都炸过
- **2023 年 v0.40**：重写交互层，加 worktree 面板，支持 git worktree 工作流
- **2024-2025**：增加 GitHub PR / issue 集成（调 `gh` CLI），53k+ star，是 GitHub 上最受欢迎的 git TUI
- **特别之处**：作者还顺手写了 lazydocker / lazynpm / lazycli 一整套 lazy* 工具，"懒人 TUI" 自成流派

## 学到什么

1. **TUI 不是炫技，是降低学习曲线**——lazygit 没替代 git，只是把 git 命令翻译成可见菜单；新人不用记 30 条命令
2. **不重新发明轮子，调子进程**——lazygit 不实现 git 协议，每次操作都 fork `git`；和 git 行为永远一致，是工程上聪明的偷懒
3. **YAML 配置 + customCommands 是开放式扩展**——和 [[btop]] / [[fzf]] 一样，配置进 dotfiles，团队风格统一
4. **多面板布局是 TUI 流派的共同语言**——[[btop]] 五面板看资源，lazygit 五面板看 git，[[glances]] 一屏看全栈；都是"密度第一"的设计哲学
5. **作者愿意一个人造一整套基础设施**——gocui（TUI 框架）+ lazygit / lazydocker / lazynpm，少有的"全栈造轮子"耐心

## 延伸阅读

- 官方 README：[github.com/jesseduffield/lazygit](https://github.com/jesseduffield/lazygit)（含 GIF 演示和键位速查）
- 官方教程视频：作者自己录的 5 分钟入门，搜 "lazygit tutorial Jesse Duffield"
- gocui 项目：[github.com/jesseduffield/gocui](https://github.com/jesseduffield/gocui)（lazygit 底层 TUI 框架）
- 同类对比：搜 "lazygit vs gitui vs tig"——结论通常是 lazygit 功能最全，gitui 最快，tig 最轻

## 关联

- [[btop]] —— 同走"多面板 TUI"路线，但看系统资源不看 git
- [[glances]] —— 同属"现代 TUI 重做传统 CLI"流派
- [[procs]] —— 同属"彩色 + 树视图 + 现代化"思路（procs 替代 ps，lazygit 替代 git CLI 部分操作）
- [[fzf]] —— lazygit 内置 fuzzy filter 思路与之同源；二者都常进 dotfiles
- [[bat]] —— 终端体验现代化的另一支；和 lazygit 一起常被推荐"git workflow 必装"
- [[zoxide]] —— 同样靠"装一行回不去"建立黏性
- [[broot]] —— 文件树 TUI，和 lazygit 同走"ncurses + 多面板"路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[fzf]] —— fzf — 命令行模糊查找
- [[gitui]] —— gitui — Rust 写的 git TUI，libgit2 直连让启动比 lazygit 快一个量级
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[neovim]] —— Neovim — Lua 可扩展 vim 现代分叉
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[tig]] —— tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

