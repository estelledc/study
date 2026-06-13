---
title: tmux — 一个终端窗口里跑多个会话还能脱离重连
来源: https://github.com/tmux/tmux
日期: 2026-05-31
子分类: DevOps 与运维
分类: 基础设施
难度: 入门
provenance: pipeline-v3
---

## 是什么

tmux 是一个 **terminal multiplexer**（终端多路复用器）。日常类比：你的终端窗口本来只能开一个"工作台"，tmux 给你装了一个"机柜"——同一个窗口里能塞下多个会话，每个会话又能切成多个窗口，每个窗口还能上下左右分屏。

最关键的能力叫 **detach**（脱离）：

- 你在 SSH 连到远程机器跑了一个 30 分钟的训练
- 网断了 / 你合上笔电 / 终端被你关了
- **训练不会停**——下次你 SSH 回去，敲一句 `tmux attach`，屏幕长得和你离开时一模一样

没有 tmux 的时候，关终端 = 进程被杀 = 半小时白跑。

## 为什么重要

不用 tmux 的人会被这些事卡：

- SSH 跑长任务必须挂着不能关电脑
- 本地写代码要不停 `Cmd+T` 开新终端，鼠标点来点去
- 想给同事看一段 log，只能截图发过去
- 重启 shell 之后所有半成品命令历史全没了

tmux 把"会话状态"从"终端窗口"里剥离出来。窗口可以关，会话还在 daemon 里活着。

## 核心要点

tmux 的世界由三层嵌套组成，从大到小：

1. **session（会话）**：一整套工作区，名字自取（`work` / `paper` / `debug`）。可以 detach 和 attach
2. **window（窗口）**：会话里的 tab，类比浏览器多 tab
3. **pane（面板）**：window 内的分屏块，左右上下随便切

所有命令都靠一个 **prefix key** 引导，默认是 `Ctrl-b`。意思是"接下来这个键是 tmux 命令，不是给 shell 的"。比如 `Ctrl-b d` 是 detach，`Ctrl-b c` 是新建 window。

底层架构是 **server-client**：第一次敲 `tmux` 时它在后台起一个 daemon（服务器进程），后续所有终端通过 Unix socket 连过去。这就是为什么关终端会话还在——daemon 没死。

## 实践案例

### 案例 1：远程跑训练不怕断网

```bash
ssh you@remote-gpu-box
tmux new -s train
python train.py    # 跑起来
# 按 Ctrl-b 然后按 d —— detach，回到普通 SSH
exit               # 关 SSH 也行
```

第二天回来：

```bash
ssh you@remote-gpu-box
tmux attach -t train   # 屏幕还原，训练日志继续刷
```

### 案例 2：本地一个终端 = 三块屏

```
+-------------------+-------------------+
|                   |   server log      |
|   nvim 编辑器      +-------------------+
|                   |   python REPL     |
+-------------------+-------------------+
```

操作：

- `Ctrl-b %` 左右切一刀 → 出现右半屏
- `Ctrl-b "` 把右半屏上下再切一刀 → 三块
- `Ctrl-b 方向键` 在 pane 之间跳

### 案例 3：结对编程共享会话

A 同学起会话：`tmux new -s pair`
B 同学 SSH 到同一台机器：`tmux attach -t pair`

两人看同一块屏幕，谁敲键盘对方都看得到。比屏幕分享省带宽。

## 配置文件

`~/.tmux.conf` 是 tmux 的"个性化清单"。常见前几行：

```bash
# 把 prefix 从 Ctrl-b 改成更顺手的 Ctrl-a
unbind C-b
set -g prefix C-a

# 鼠标支持（点 pane 切换、滚轮滚屏）
set -g mouse on

# 窗口编号从 1 开始（默认从 0，离 1 键太远）
set -g base-index 1
```

进阶用户装 **tpm**（tmux plugin manager），一行 `set -g @plugin "x/y"` 装主题和插件。

## 踩过的坑

1. **prefix key 冲突**：默认 `Ctrl-b` 在 emacs / readline 里是"光标左移"。改成 `Ctrl-a` 又和 readline 的"行首"撞。妥协：改 `Ctrl-Space`

2. **复制粘贴不对**：tmux 的 copy mode（`Ctrl-b [`）默认走 tmux 内部缓冲区，和系统剪贴板没打通。macOS 上要装 `reattach-to-user-namespace`，或者用 `set -g set-clipboard on` 走 OSC 52 转义

3. **嵌套 tmux**：本地 tmux + SSH 后又开远程 tmux，prefix key 撞车——按 `Ctrl-b` 远程吃了，本地没反应。约定：远程 tmux 改一个不同的 prefix

4. **窗口编号乱**：开关 window 久了编号断断续续。`Ctrl-b :movew -r` 一次性整理顺序

## 适用 vs 不适用场景

**适用**：

- SSH 远程开发、跑长任务
- 本地一个窗口分屏多任务
- 想把"开发环境布局"脚本化（用 tmuxinator / tmuxp 一键还原会话）

**不适用**：

- 只用 GUI IDE 的人——VS Code 自带终端 + 远程开发，多数场景够用
- 想要鼠标拖拽分屏 / 标签—— iTerm2 / WezTerm 这类终端模拟器更顺手
- 需要图形输出——tmux 是纯 TTY，跑不了图

## 替代品对比

- **GNU screen**：tmux 前辈，1987 年起，仍能用。配置语法老、社区萎缩
- **Zellij**：Rust 写的现代替代，开箱即用、有图形 UI 提示。学习曲线低但生态小
- **WezTerm / Kitty**：终端模拟器内置 multiplex 能力，但不能 detach（关了就没）

经验法则：远程 + 长任务 → tmux；纯本地 + 想配置少 → Zellij；不在乎 detach → 终端模拟器自带的就行。

## 学到什么

1. **session 和窗口分离**是 Unix 的老智慧——daemon + socket，进程生命周期不绑死在终端上
2. **prefix key 模式**和 vim 的 leader key 一个套路，用一个键打开"命令命名空间"
3. **配置即布局**：`.tmux.conf` + tmuxinator 让"我每天的工作环境"变成可版本控制的文本

## 历史小故事（可跳过）

- **2007 年**：OpenBSD 开发者 Nicholas Marriott 看不下去 GNU screen 的代码风格，从零写 tmux。第一版只有几千行 C
- **2009 年**：tmux 进 OpenBSD base 系统，正式取代 screen 成为默认 multiplexer
- **2012-2020**：陆续加入 256 色、真彩色、鼠标支持、CJK 宽字符渲染。一路兼容到现在
- **现在**：约 7 万行 C 代码，36k GitHub star，每个 Linux 发行版都打包

设计取舍上 tmux 故意保持小而无依赖——只要有 libevent 和 ncurses 就能编。这也是它能进 OpenBSD base 的原因。

## 延伸阅读

- 官方仓库：[tmux/tmux](https://github.com/tmux/tmux)（C 源码 + man page）
- 入门书：[tmux 2: Productive Mouse-Free Development](https://pragprog.com/titles/bhtmux2/tmux-2/)（Pragmatic Bookshelf）
- 速查：[tmux cheatsheet](https://tmuxcheatsheet.com/)
- [[zsh]] —— 配 tmux 用的 shell
- [[fzf]] —— 在 tmux pane 里模糊搜索很爽
- [[ripgrep]] —— pane 里的搜索利器
