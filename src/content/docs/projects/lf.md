---
title: lf — 终端里像 vim 一样翻文件
来源: 'https://github.com/gokcehan/lf'
日期: 2026-05-31
分类: cli
难度: 初级
---

## 是什么

lf 是一个**跑在终端里的文件管理器**，键位和 vim 一样（hjkl 上下左右），但操作的是文件夹和文件，不是文本。日常类比：像 macOS 的 Finder 或 Windows 的资源管理器，只是它没有图形界面，全靠键盘。

启动起来长这样：

```
~/code                                    
> dotfiles/    ┃ README.md                
  notes/       ┃ docs/                    
  scripts/     ┃ src/                     
  README.md    ┃ package.json             
```

左边一列当前目录，右边是光标所在那个文件/目录的预览。按 `j` 往下、`l` 进入子目录、`h` 回上层、`q` 退出。

它是 Go 写的，编出来就一个几 MB 的二进制文件，没有任何 Python / Ruby 依赖。这是它和老牌 ranger（Python 写的）最大的差别——启动快得多。

## 为什么重要

不用 lf 这类工具，你在终端里管理文件会出现这些情况：

- 找一个深目录里的文件，要 `ls` 三四次才能看到，路径还得手敲
- 想把 5 个文件批量重命名 / 移动，要写 for 循环或开图形界面
- 想"边浏览边预览"图片或代码，没有现成办法
- 想 cd 到刚才看到的那个目录，路径已经忘了

lf 把这些痛点压在一个二进制里——而且**完全键盘操作**，不离开终端。

## 核心要点

lf 的设计可以浓缩成 **三条**：

1. **vi 键位 + server-client 架构**：操作和 vim 几乎一致，省学习成本。多个 lf 实例之间共享 selection 状态（背后有个 server）。类比：vim 的 buffer，多个窗口看的是同一份数据。

2. **不内置任何外部能搞的事**：lf 不带编辑器、不带分页器、不带文件操作命令。要看大文件？调 `less`。要编辑？调 `$EDITOR`。要预览图片？调 `chafa` 或 `kitty icat`。这叫**Unix 哲学的现代复刻**——只做"导航 + 调度"。

3. **lfrc 配置即程序**：`~/.config/lf/lfrc` 里你写 `cmd` 和 `map`，本质是把 shell 命令绑到键上。lf 自己不解释逻辑，全转给 shell。类比：i3 / sway 的配置文件，每行都是一条 hook。

## 实践案例

### 案例 1：让 lf 退出时把 shell 带到当前目录

默认 `q` 退出后，shell 还在你启动 lf 时的目录——这是 Unix 进程模型决定的（子进程改不了父进程的 cwd）。lf 提供 lfcd 包装脚本绕过这一点：

```bash
# ~/.zshrc 或 ~/.bashrc
LFCD="$HOME/.config/lf/lfcd.sh"
[ -f "$LFCD" ] && source "$LFCD"
bindkey -s '^O' 'lfcd\n'   # Ctrl-O 打开 lf
```

原理：lfcd 启动时记下"最后停留目录"到临时文件，shell wrapper 退出后读这个文件再 cd 过去。**这是新手最大的踩坑点**。

### 案例 2：自定义 open 命令——按文件类型分发

```text
# ~/.config/lf/lfrc
cmd open ${{
    case $(file --mime-type -Lb $f) in
        text/*)  $EDITOR $fx ;;
        image/*) chafa $f && read ;;
        video/*) mpv $f ;;
        application/pdf) zathura $f & ;;
        *) xdg-open $f ;;
    esac
}}
```

按 `l`（或 enter）lf 会调 `open`，这段脚本用 `file` 探测 MIME 类型，分别调对的工具。`$f` 是当前光标文件，`$fx` 是当前选中（多选）的所有文件。

### 案例 3：批量解压 / 一键打包

```text
# ~/.config/lf/lfrc
cmd extract ${{
    case $f in
        *.tar.gz)  tar xzvf $f ;;
        *.tar.bz2) tar xjvf $f ;;
        *.zip)     unzip $f ;;
        *.rar)     unrar x $f ;;
    esac
}}
map x extract
```

按 `x` 解压光标下文件，省得记 tar 一堆参数。配 `cmd archive` 同理可以反向打包选中文件。

## 踩过的坑

1. **退出后 shell 不跟着走**：必须装 lfcd 包装脚本，光装 lf 二进制没用——很多人卸载就是因为这个体验差。

2. **图片预览需要终端支持协议**：`chafa` 用 ANSI 块字符（任何终端都行）；`kitty icat` 只在 kitty 里能用；`ueberzug` 需要 X11。WSL / macOS 默认终端预览不了图片，要换 wezterm / kitty。

3. **selection（空格）和 marks（mX）是两套**：空格切换"选中"用于批量操作；`m` 加字母（如 `ma`）记录跳点，后面 `'a` 跳回去。批量复制只看 selection，新手常以为 marks 也算上。

4. **cmd 里 `$f` vs `$fs` vs `$fx`**：`$f` 是光标当前一个，`$fs` 是 selection 列表，`$fx` 是"selection 优先，没选才用光标"。写删除命令用错变量会一次删错一批文件。

## 适用 vs 不适用场景

**适用**：
- 终端常驻党（vim / tmux / zsh 全家桶用户）
- 远程 SSH 上没图形界面要管文件
- 想在 shell 工作流里加一层"可视目录浏览"
- 自己愿意写 lfrc 定制（不写也能用，但写完才好用）

**不适用**：
- 需要图形界面拖拽文件（用 Finder / Nautilus）
- 需要内置编辑器或分页器（lf 故意不带）
- Windows 原生（lf 在 WSL 下能跑，但路径处理偶尔诡异）
- 不愿配置——lf 默认配置很简陋，不写 lfrc 体验差

## 历史小故事（可跳过）

- **2016 年**：Gokcehan 开始用 Go 重写 ranger 的体验。动机：ranger 启动慢（Python 冷启动 ~200ms），而文件管理器最常见的操作是"开一下、跳一下、关掉"，启动慢就难受。
- **2018-2020**：sixel / kitty graphics 协议普及，lf 加 cleaner 钩子让预览图片成为可能。
- **2022-2024**：server-client 架构稳定，多窗口共享 selection 落地。
- **2026-02**：仍在发版，9.3k stars，社区活跃。MIT 协议。

## 学到什么

1. **"启动快"是文件管理器的核心 UX**——选 Go 而不是 Python 不是技术品味，是性能必需
2. **不做的功能比做的功能更重要**——lf 不带编辑器，让你接 vim / nvim，反而让定制空间更大
3. **配置即程序**：lfrc 每行都是 shell 命令，学一次就解锁所有 Unix 工具的组合能力
4. **server-client 架构在 TUI 也有用**——不止数据库才需要

## 延伸阅读

- 仓库主页：[gokcehan/lf](https://github.com/gokcehan/lf)
- 官方 wiki Tutorial：[lf wiki](https://github.com/gokcehan/lf/wiki/Tutorial)（key 设计 + selection 解释）
- 示例 lfrc：[etc/lfrc.example](https://github.com/gokcehan/lf/blob/master/etc/lfrc.example)（一份开箱可用的配置）
- 同类对比：ranger（Python 元老）/ nnn（C 极简）/ vifm（vim-like 双栏）
- 视频：YouTube 搜 "lf file manager tour" 有 10 分钟入门

## 关联

- [[fzf]] —— 模糊搜索，配 lfrc 里 `cmd fzf_jump` 可以用 fzf 跳目录
- [[ripgrep]] —— 快速文本搜索，lf 里绑 `cmd grep` 调 rg 比 grep 快得多
- [[neovim]] —— lf 默认 `$EDITOR` 调 nvim，是最常见的搭档
- [[tmux]] —— 分屏跑 lf + 终端，是无图形界面的工作方式
- [[starship]] —— 美化 shell 提示符，lf 退出后 cd 落地处看着舒服
- [[go-language]] —— lf 用 Go 写，启动快、单二进制是 Go 的卖点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器
