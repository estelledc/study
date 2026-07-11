---
title: nnn — 50KB 内存就能跑的极简终端文件管理器
来源: 'https://github.com/jarun/nnn'
日期: 2026-05-31
分类: cli
难度: 初级
---

## 是什么

nnn（读作 "n cubed"，n³）是一个**在终端里浏览和管理文件**的小程序。日常类比：像 macOS 的 Finder、Windows 的资源管理器，但**只在黑底白字的终端窗口里**跑，没有鼠标，全靠键盘。

你打开它，看到的就是一列文件名：

```
~/projects
> nnn/
  ranger/
  notes.md
  build.sh
```

按 `j` 往下走、按 `k` 往上、按 `回车` 进目录，按 `q` 退出。不用学新东西，就是把图形界面换成**键盘 + 文字**。

它的卖点写在标题里——**整个程序加起来不到 100KB，跑起来只占 50KB 左右内存**。同类的 ranger（Python 写的）光启动就吃 30MB+。在 GitHub 上拿了 19k 颗星。

## 为什么重要

不理解 nnn，下面这些事都没法解释：

- 为什么 2026 年还有人用 C + ncurses 这种 1980 年代技术写新工具——因为换来 startup 快 100 倍
- 为什么"极简"在终端工具圈是一个独立流派——和 fzf / ripgrep / bat 一脉相承，"做一件事做到极致"
- 为什么 SSH 进远程服务器的人都会装它——ranger 装不上 / 跑不动的环境（树莓派、路由器、容器），nnn 几乎一定能跑
- 为什么"插件 = bash 脚本"是一种聪明的偷懒——不自建插件语言，复用 shell 已有的几十年生态

## 核心要点

nnn 的设计可以拆成 **三件事**：

1. **不缓存任何东西**：每次 `cd` 进新目录都重新 `readdir + stat` 一遍。类比：每次开冰箱都重新看一眼里面有什么，不靠记忆。听起来浪费，但因为只读元数据（不读文件内容），快到察觉不到——而且永远不会显示过期信息。

2. **4 个 context = 4 个隐形 tab**：按数字键 `1/2/3/4` 切换，每个 context 记一份独立的 cwd 和选中状态。类比：同时开 4 个终端窗口，但只占一个屏幕，用数字键瞬切。

3. **无配置文件**：所有行为通过环境变量调（`NNN_OPTS`、`NNN_PLUG`、`NNN_BMS`）。类比：不像 vim 要你写一个 .vimrc，nnn 让你在 shell 启动文件里写两行 export 就够了。

三件事加起来叫"nnn 哲学"：**少存东西、少配置、快**。

## 实践案例

### 案例 1：装上就能用

```bash
# macOS
brew install nnn
# Ubuntu / Debian
sudo apt install nnn
# Arch
sudo pacman -S nnn

nnn               # 直接打开当前目录
```

第一次按 `?` 看快捷键。常用的就这几个：`j/k` 上下，`h/l` 进出目录，`回车` 打开文件（用系统默认程序），`q` 退。和 vim 一致。

### 案例 2：把 cd 替换成 nnn

很多人最常做的事是"找到一个目录然后 cd 过去"。官方做法是设 `NNN_TMPFILE`，退出时 nnn 往里写一行 `cd '路径'`，再 `source` 进当前 shell：

```bash
# 加到 ~/.zshrc 或 ~/.bashrc
n() {
    [ -n "$NNN_TMPFILE" ] && return
    export NNN_TMPFILE="${XDG_CONFIG_HOME:-$HOME/.config}/nnn/.lastd"
    nnn -dH "$@"
    if [ -f "$NNN_TMPFILE" ]; then
        . "$NNN_TMPFILE"
        rm -f "$NNN_TMPFILE"
    fi
}
```

之后在终端输 `n`，文件列表弹出来；按 `q` 退出时，**当前 shell 的工作目录就跳到你最后停的地方**。

这一招让 nnn 从"独立程序"变成"shell 的延伸"。第一次用会觉得"原来 cd 可以这样"。

### 案例 3：插件就是 shell 脚本

nnn 不自己实现"用 fzf 跳目录"或"git 状态"。它定义一个**协议**：

- nnn 把"当前选中的文件路径"写到一个 FIFO（命名管道）
- 你的脚本从 FIFO 读路径，做想做的事

比如官方仓库 `nnn-plugins` 里的 `fzcd` 就是 7 行 bash：

```bash
#!/usr/bin/env sh
sel="$(find . -type d 2>/dev/null | fzf)"
[ -n "$sel" ] && printf "%s" "0c$sel" > "$NNN_PIPE"
```

绑定到一个键（`NNN_PLUG='f:fzcd'`），按下就触发。**整个插件系统的全部代码，就是一个 FIFO 和一个环境变量**。

## 踩过的坑

1. **没图片预览**：nnn 主程序不带，要装 `nnn-plugins` 里的 `preview-tui`，还要在终端层面装 `ueberzug` 或 kitty 的 icat 协议。比 ranger 折腾。

2. **快捷键全靠记**：屏幕上不会显示帮助栏（为了省空间），新手要不停按 `?` 查表。建议先用 `nnn -H`（hidden 模式开 + 帮助常驻几秒）。

3. **macOS 上的 trash 不是回收站**：删除默认是真删除（`rm`）。要回收站行为得装 `trash-cli` 并设 `NNN_TRASH=1`。第一次 `D` 删错了找不回来正常。

4. **Windows 不行**：必须 WSL / Cygwin。原生 Windows Terminal 跑不起来——它依赖 POSIX 系统调用。

## 适用 vs 不适用场景

**适用**：
- SSH 进远程服务器/容器/树莓派浏览文件
- 习惯键盘流的人替代图形文件管理器
- 想做"用 fzf 跳目录"这种**临时小工具**——nnn 提供脚手架
- 极低配置环境（路由器、嵌入式设备）需要 TUI 文件管理器

**不适用**：
- 需要图形预览大量图片/视频（用 ranger + ueberzug 折腾少）
- Windows 原生用户（除非你已用 WSL）
- 团队需要"开箱即用 + 配置丰富"——这类用 [yazi](https://github.com/sxyazi/yazi) 或 ranger
- 完全没用过 vim 风格按键的新人——学习曲线陡

## 历史小故事（可跳过）

- **2014 年**：作者 Arun Prakash Jana 在印度，因为不满 ranger 启动慢，用 C 写了一版叫 `noice` 的极简版本（fork 自更早的 noice 项目）。
- **2017 年**：项目改名 nnn，加入 4-context 和插件系统。这一年 GitHub 星数破 1000。
- **2020 年**：v3 重写了一次内部状态机，引入 FIFO 插件协议——这个设计现在被 lf、yazi 抄走了。
- **2026 年**：作者基本不加新功能了，专注 bug fix。"代码已经够简单，再加东西就违反初衷"。

之后 12 年，nnn 是"极简 TUI"流派的代表样本，常被拿来和 ranger / lf / yazi 横向对比。

## 学到什么

1. **少做事 = 快**：nnn 不缓存目录、不画 UI 边框、不读文件内容做预览，换来启动 < 10ms
2. **复用比自建好**：插件 = bash 脚本，不发明新插件语言；用户把已有 shell 知识直接搬过来
3. **环境变量当配置**：不写配置文件解析器，省 200 行代码 + 用户少学一套语法
4. **C 在 2026 年仍然合理**：不是怀旧，是"内存极小 + 启动极快 + 无依赖部署"的硬约束最适合 C

## 延伸阅读

- 官方 GitHub：[jarun/nnn](https://github.com/jarun/nnn)（README 自带演示 GIF，不用看视频）
- 插件仓库：[nnn-plugins](https://github.com/jarun/nnn/tree/master/plugins)（80+ 个 shell 脚本，挑两个看就懂协议）
- 同类对比：[yazi](https://github.com/sxyazi/yazi)（Rust 写的现代版，配置丰富但启动慢 5 倍）
- 同类对比：[ranger](https://github.com/ranger/ranger)（Python，老牌，功能多体感重）
- [[fzf]] —— 模糊查找器，和 nnn 黄金搭档
- [[ripgrep]] —— 快速文本搜索，和 nnn 在工作流里互补

## 关联

- [[fzf]] —— nnn 插件最常调用的外部工具，`fzcd` / `fzopen` 全靠它
- [[ripgrep]] —— 在 nnn 里用 `!` 进 shell 后常用 rg 找内容
- [[tmux]] —— 把 nnn + shell + 编辑器拼成一个 SSH 工作台的胶水
- [[neovim]] —— nnn 选好文件按 `e` 默认调它打开，是 vim 流终端的两腿

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
