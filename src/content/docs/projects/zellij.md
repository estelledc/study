---
title: Zellij — Rust 写的现代终端复用器，开箱即用还能写 WebAssembly 插件
来源: https://github.com/zellij-org/zellij
日期: 2026-05-31
分类: 命令行基础设施
难度: 入门
---

## 是什么

Zellij 是一个 **terminal multiplexer**（终端多路复用器），和 tmux / GNU screen 是同一类工具。日常类比：你的终端窗口本来只能开一个工作台，Zellij 给你装上一个机柜——同一个窗口里能塞下多个会话，每个会话能切成多个标签页，每个标签页还能上下左右分屏。

它和 tmux 解决同一个问题，但选了不同的"风味"：

- 用 Rust 写的（tmux 是 C）
- **打开就能用**——屏幕底部一直显示快捷键提示栏，不用背 prefix key
- **WebAssembly 插件系统**——任何能编译到 wasm 的语言都能写插件
- 支持**浮动面板**和**堆叠面板**这两种 tmux 没有的布局

一句话：tmux 的现代继任者候选之一，主打"少配置就好用"。

## 为什么重要

不用 multiplexer 的人会被这些事卡住：

- SSH 跑长任务必须挂着不能关电脑
- 本地写代码不停 `Cmd+T` 开新终端，鼠标点来点去
- 想给同事看一段 log 只能截图

tmux 自 2007 年起近 20 年生态扎实，但有学习门槛——必须读 `man tmux`、改 `.tmux.conf`、装 tpm 插件管理器。Zellij 把"开箱体验"作为头等公民：

- 第一次启动就能用，底部提示栏教你怎么操作
- 配置文件用 KDL 语法（一种现代化的层级配置格式）
- 插件不再是 shell 脚本拼出来的——是真正的 wasm 二进制

## 核心要点

Zellij 的世界由三层嵌套组成，从大到小：

1. **session（会话）**：一整套工作区，可以 detach（脱离）和 attach（重连）
2. **tab（标签）**：会话里的 tab，类比浏览器多 tab
3. **pane（面板）**：tab 内的分屏块

特色概念：

- **floating pane**：悬浮在其他面板上方的临时窗口，按一下快捷键就出现，再按一下就藏起来。日常类比：像 macOS 的 Spotlight 弹窗
- **stacked pane**：多个面板堆叠在同一区域，只显示当前层，类比一摞窗口卡片
- **layout**：用 KDL 文件描述"开几个 tab、每个 tab 怎么分屏、跑什么命令"——一键还原工作区
- **plugin**：跑在 wasm 沙箱里的小程序，可以写状态栏、文件树、Git 集成

底层架构和 tmux 一样是 **server-client**：第一次敲 `zellij` 起一个后台进程（daemon），后续终端通过 socket 连过去。所以关终端不会杀掉会话。

## 实践案例

### 案例 1：第一次启动就能用

```bash
brew install zellij     # 或 cargo install zellij
zellij                  # 直接进
```

底部提示栏会列出模式入口（默认大致是）：

```
Ctrl + <g> LOCK  <p> PANE  <t> TAB  <s> SCROLL  <o> SESSION  …
```

不用背——按 `Ctrl-p` 进 pane 模式，里面会再弹一层提示告诉你怎么分屏；`Ctrl-o` 进 session 模式（detach 在这里）。

### 案例 2：远程跑训练不怕断网

```bash
ssh you@remote-gpu-box
zellij --session train
python train.py        # 跑起来
# 按 Ctrl-o（进 Session）再按 d —— detach
exit                   # 关 SSH
```

第二天回来：

```bash
ssh you@remote-gpu-box
zellij attach train    # 屏幕还原
```

### 案例 3：用 layout 一键开发环境

`~/.config/zellij/layouts/dev.kdl`：

```kdl
layout {
    tab name="code" {
        pane command="nvim"
        pane split_direction="vertical" {
            pane command="cargo" { args "watch" "-x" "test"; }
            pane
        }
    }
    tab name="logs" {
        pane command="tail" { args "-f" "app.log"; }
    }
}
```

**逐部分解释**：`tab` 是标签页；`pane command=...` 启动时跑的命令；`args` 是命令参数；`split_direction="vertical"` 表示左右分屏；空 `pane` 是留给你敲命令的空白终端。启动：`zellij --layout dev`。

## 配置文件

`~/.config/zellij/config.kdl` 例子：

```kdl
// 鼠标支持（点 pane 切换、滚轮滚屏）
mouse_mode true

// 主题
theme "catppuccin-mocha"

// 默认 shell
default_shell "fish"

// 关闭底部提示栏（熟练后想要更多屏幕空间）
default_mode "locked"
```

KDL 语法：层级用大括号，属性用空格分隔，注释用 `//`。比 YAML 严格、比 JSON 友好。

## 踩过的坑

1. **快捷键和 shell 撞**：默认 `Ctrl-q` 和 `Ctrl-g` 等组合在 readline 里有别的含义。改 `keybinds` 段或者用 lock mode 临时让 zellij 让出键盘

2. **插件生态小**：tmux 有 tpm 几百个插件，Zellij 才几十个能用的。需要的插件可能要自己写

3. **嵌套 zellij**：本地 zellij + SSH 后又开远程 zellij，快捷键全撞。约定远程改 prefix 或用 lock mode

4. **KDL 学习成本**：和 YAML/TOML 都不一样，第一次配会找文档。但学完之后比 tmux 的 DSL 好读

5. **资源占用**：daemon + wasm runtime 常比 tmux 多占几十 MB 内存，老机器或内存紧张时更明显

## 适用 vs 不适用场景

**适用**：

- 想要 terminal multiplex 但不愿花一周配 tmux 的新人
- 写插件需要类型安全和现代语言（Rust / Go / TypeScript 编到 wasm）
- 团队共用配置——KDL 文件比 tmux DSL 更易读
- 喜欢看到提示栏、不想背快捷键

**不适用**：

- 老服务器只能装 apt 包但 Zellij 没进发行版默认仓库
- 已经把 tmux 配置打磨多年，迁移成本高
- 极简主义者——想要更小二进制 + 更低常驻内存（tmux 更适合）
- 需要 GUI 拖拽分屏——终端模拟器（WezTerm / Kitty）更顺手

## 替代品对比

- **tmux**：近 20 年老牌，生态最大，配置门槛也最高。远程长任务首选
- **GNU screen**：1987 年起，仍能用。语法老、社区萎缩
- **WezTerm / Kitty**：终端模拟器内置 multiplex，但**不能 detach**——关了就没
- **dvtm + abduco**：极简风格，分别处理 multiplex 和 detach

经验法则：第一次接触 multiplexer 选 Zellij；远程重度使用选 tmux；只想本地分屏选终端模拟器自带的。

## 学到什么

1. **开箱即用 vs 极致可定制**是工具设计的两条路。tmux 选了第二条近 20 年，Zellij 在第一条上挑战它
2. **WebAssembly 当插件运行时**是新趋势——沙箱安全、跨语言、可分发。Zellij 是较早把 wasm 插件做成卖点的 multiplexer 之一
3. **底部提示栏**是降低学习曲线的小但关键的设计——把"必须背"变成"看着抄"
4. **配置即代码**：KDL 布局文件让"我每天的工作环境"变成可版本控制的文本

## 历史小故事（可跳过）

- **2020 年**：Aram Drevekenin（GitHub 用户名 imsnif）启动 Zellij 项目，最初叫 `mosaic`
- **2021 年**：改名 Zellij（摩洛哥传统几何拼贴艺术），表达"把屏幕拼成图案"的意象
- **2022 年**：v0.20 引入 wasm 插件系统，把 WebAssembly 做成 multiplexer 插件卖点之一
- **2023-2026**：陆续加入 floating pane、stacked pane、web-client、multiplayer 模式
- **现在**：34k+ GitHub star，v0.44 还没到 1.0，但日常使用已稳定

## 延伸阅读

- 官方仓库：[zellij-org/zellij](https://github.com/zellij-org/zellij)
- 官网：[zellij.dev](https://zellij.dev/)（带交互式 demo）
- 插件开发指南：[Plugin SDK](https://zellij.dev/documentation/plugins.html)
- KDL 语法：[kdl.dev](https://kdl.dev/)
- [[tmux]] —— Zellij 的对照组，近 20 年老牌
- [[nushell]] —— 同样用 Rust 重写老工具的代表

## 关联

- [[tmux]] —— 同类工具，对照学习能很快理解 multiplex 概念
- [[nushell]] —— Rust 重写老工具的另一个例子（shell 那边）
- [[wasmtime]] —— Zellij 插件用的 wasm runtime
- [[wezterm]] —— 终端模拟器内置分屏，但不能像 Zellij 那样 detach
- [[kitty]] —— 另一款带 multiplex 能力的 GPU 终端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
