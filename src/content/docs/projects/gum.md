---
title: gum — 把 TUI 组件搬进 shell 脚本
来源: charmbracelet/gum v0.17.0
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 入门
provenance: pipeline-v3
---

## 是什么

gum 是一个**让 shell 脚本不写一行 Go 也能拥有漂亮交互界面**的命令行工具。日常类比：以前你想在脚本里弹个"确认/取消"框，只能 `read -p` 一行黑底白字；gum 把"按钮、输入框、菜单、加载圈"这些 TUI 组件做成了**一个个命令**，你像调用 `grep` 一样调用它们。

举个例子，传统 shell 里问用户"删不删"：

```bash
read -p "Delete? [y/n] " ans
[[ $ans == y ]] && rm file
```

换成 gum：

```bash
gum confirm "Delete?" && rm file
```

弹出来的是带方向键、有颜色高亮的真正交互框。

## 为什么重要

不理解 gum，下面这些事都没法解释：

- 为什么近两年 GitHub 上那么多 dotfiles / 安装脚本突然变好看了——很多就是 gum
- 为什么 Charm 生态（bubbletea / lipgloss / glow / vhs）能打通"Go 库"和"shell 用户"两个圈子
- 为什么写 `git commit` 包装脚本不再需要 200 行 Go——一行 gum choose 就够

它把"TUI 必须写程序"这个门槛降到**会写 if 就行**。

## 核心要点

gum 的设计可以拆成 **三层**：

1. **底层是 bubbletea**：Charm 出的 Go TUI 框架，仿 Elm 架构（Model / Update / View）。原本要你写 Go。
2. **中层是 bubbles + lipgloss**：bubbletea 的现成组件库 + 样式库。仍然要写 Go。
3. **顶层是 gum**：把 bubbles 的每个组件包成一个 CLI 子命令——`gum choose` / `gum input` / `gum spin`。**这一层让 shell 用户终于能用上 TUI**。

13 个核心子命令分四类：

- 选择类：`choose`（菜单）/ `filter`（带搜索的菜单，像 fzf）
- 输入类：`input`（单行）/ `write`（多行）/ `confirm`（是非）/ `file`（文件选择器）
- 展示类：`spin`（加载圈）/ `pager`（分页阅读器）/ `table`（表格）
- 格式类：`style`（包样式）/ `format`（markdown / template）/ `join` / `log`

## 实践案例

### 案例 1：交互式 git commit

```bash
TYPE=$(gum choose "fix" "feat" "docs" "refactor")
SCOPE=$(gum input --placeholder "scope")
SUMMARY=$(gum input --placeholder "summary")
gum confirm "Commit?" && git commit -m "$TYPE($SCOPE): $SUMMARY"
```

四行 shell，得到一个**带菜单 + 输入框 + 确认**的提交工具。等价 Go 程序大约 150 行。

### 案例 2：filter 替代 fzf

```bash
git branch | cut -c 3- | gum filter | xargs git checkout
```

把当前分支列表喂给 `gum filter`，它弹一个带搜索的菜单，回车输出选中的分支名，再交给 `git checkout`。

### 案例 3：spin 跑长命令

```bash
gum spin --title "Building..." -- npm run build
```

`--` 后面是真正要执行的命令。spin 会显示动画，命令结束后动画消失，**命令本身的输出不会被吃掉**——这点很关键，错误信息照样能看见。

### 案例 4：style 给输出包样式

```bash
gum style \
  --foreground "#FF6B6B" --border double --padding "1 2" \
  "Build succeeded"
```

输出是带颜色、双线边框、内边距的标题块。本质是把 lipgloss 的 API 翻译成 flag。

## 踩过的坑

1. **filter 必须从 stdin 读输入**：直接 `gum filter` 会卡住等输入。必须 `cmd | gum filter` 或 `gum filter < file`。

2. **spin 的 `--` 不能漏**：`gum spin --title X sleep 5` 会被当成 gum 自己的 flag；正确写法是 `gum spin --title X -- sleep 5`。

3. **stdout vs stderr 要分清**：gum 把 UI 画到 stderr，把"选中结果"写到 stdout。所以 `result=$(gum choose a b)` 拿到的是结果，UI 不会进 `$result`。但 `gum choose a b > log` 会丢掉结果——别这么写。

4. **没有配置文件**：gum 不读 `~/.gumrc` 或类似文件。所有配置走 `GUM_*` 环境变量或 flag。想全局换主题就 `export GUM_INPUT_CURSOR_FOREGROUND="#FF6B6B"`。

5. **窄终端会截断**：默认组件按 80 列设计，SSH 进窄窗口会有 UI 错位。`--width` flag 可手动指定。

## 适用 vs 不适用场景

**适用**：

- 写 dotfiles / 安装脚本 / CI 触发脚本，需要交互又不想离开 shell
- 替换老旧的 `dialog` / `whiptail`（颜值代差）
- 给已有 CLI 包一层友好交互，比如 git / kubectl / docker 的 wrapper

**不适用**：

- 需要复杂多面板布局（gum 一次只渲染一个组件）→ 直接写 bubbletea
- 需要持续运行的 TUI 应用（gum 是一次性进程）→ bubbletea / textual
- 输出要被严格管道处理且不能有 ANSI（CI 环境）→ 用 `--no-color` 或换 plain CLI
- Windows 老 cmd 终端（需要支持 ANSI 的终端，PowerShell 7+ / Windows Terminal 可以）

## 历史小故事（可跳过）

- **2020 年**：Charm 公司由 Christian Rocha 在 NYC 创立，开源 bubbletea。
- **2022 年**：发布 gum，第一版只有 6 个子命令。当时定位是"Charm 生态的入门玩具"。
- **2023-2025 年**：逐步吸纳 huh（表单）的能力，扩充到 13 个子命令；星标从 6k 涨到 23k。
- **2025-09**：v0.17.0 加入 `--timeout`、改进 `filter` 模糊匹配、表格支持流式输入。

Charm 生态的玩法是：底层框架（bubbletea）+ 组件库（bubbles）+ 样式库（lipgloss）+ CLI 包装（gum），上层应用（glow 看 markdown / vhs 录终端 GIF）。

## 学到什么

1. **CLI 包装库的价值**：把"框架级 API"包成"shell 子命令"，把用户群从程序员扩到所有写脚本的人
2. **stdout / stderr 分离**是 Unix 哲学的硬约束——UI 走 stderr，数据走 stdout，管道才不打架
3. **配置走环境变量** vs **配置走文件**：env 变量适合 CLI 工具（无状态、组合方便）；rc 文件适合长期守护进程
4. **小而美的子命令**：每个子命令做一件事，靠管道拼装，比一个巨型 TUI 更接近 Unix 传统

## 延伸阅读

- 仓库主页：[charmbracelet/gum](https://github.com/charmbracelet/gum)（README 自带 GIF 演示，30 秒看懂）
- bubbletea：[charmbracelet/bubbletea](https://github.com/charmbracelet/bubbletea)（gum 的底层框架）
- lipgloss：[charmbracelet/lipgloss](https://github.com/charmbracelet/lipgloss)（样式 DSL）
- 进阶表单：[charmbracelet/huh](https://github.com/charmbracelet/huh)（gum 的表单子命令背后是它）

## 关联

- [[bubbletea]] —— gum 的底层 TUI 框架（Elm 架构 Go 版）
- [[lipgloss]] —— gum style 的样式后端
- [[glow]] —— Charm 生态的 markdown 终端渲染器
- [[vhs]] —— Charm 生态的终端录屏工具，给 gum 脚本做演示 GIF
- [[fzf]] —— gum filter 的灵感来源，模糊筛选标准
- [[starship]] —— 同类"让 shell 变好看"的工具，但目标是 prompt
- [[fish-shell]] —— 自带交互菜单的 shell，gum 是给 bash/zsh 补这块短板
- [[dialog-whiptail]] —— gum 的"前辈"，1990 年代风格的终端对话框工具
