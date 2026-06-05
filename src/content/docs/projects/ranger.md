---
title: ranger — Python 写的 vim 风格三栏文件管理器
来源: https://github.com/ranger/ranger
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 中级
provenance: pipeline-v3
---

## 是什么

`ranger` 是 Roman Zimbelmann 在 2009 年用 Python 写的命令行文件管理器。它在终端里铺出三栏画面：左边是父目录、中间是当前目录、右边是预览。光标用 vim 的 `hjkl` 在文件树里走，`:` 进命令模式，`/` 搜索文件名。

日常类比：

> macOS Finder 的"列视图"（左到右一列列展开目录），把它搬进终端，再换上 vim 的键位，就是 `ranger`。

最直观的画面：

```
~/code              configs/         rc.conf
  configs/      >   docs/        >   colorscheme default
  docs/             scripts/         set preview_images true
  scripts/          README.md        ...
```

光标停在中间栏的 `docs/`，右边自动 `cd docs/ && ls` 给你看里面是什么；按右方向键就走进去，按左方向键就退一格。

## 为什么重要

不熟悉 `ranger`，下面这些场景每天都要付学费：

- **在终端里 cd 来 cd 去**：每次找一个文件都要 `ls`、记住名字、`cd`、再 `ls`，三栏视图把这套循环变成一次性看见
- **GUI 文件管理器没法 ssh 远程用**：服务器上没 Finder / Explorer，但 ranger 一条命令就跑起来
- **批量改文件**：在 GUI 里改 50 个文件名要点 50 次，ranger 配合 `:bulkrename` 把 50 个名字丢进编辑器一次改完
- **vim 用户的肌肉记忆迁移**：会 vim 的人零成本上手 ranger，学习曲线几乎没有

ranger 和 [[fzf]] / [[fd]] / [[bat]] 这些 Rust CLI 不同——它不追"快"，它追"在终端里把 GUI 的视觉模型搬过来"。同代竞品：lf（Go 写的简化版）、nnn（C 极简版）、Yazi（Rust 现代版）。ranger 是这条赛道的"老祖宗"。

## 核心要点

ranger 的设计可以拆成 **三个支柱**：

1. **Miller columns 三栏布局**：这种"父-当前-预览"三列视图最早是 NeXTSTEP 1986 年提出的，乔布斯团队设计，后来被 macOS Finder 列视图继承。ranger 把它原样搬进终端，光标动一下三栏全部刷新——视觉模型即心智模型。

2. **rifle 文件打开器**：按 `l`（或回车）想打开文件，ranger 不知道用什么程序——它去查 `rifle.conf`：".pdf 用 zathura"、".jpg 用 feh"、"shebang 是 python 的脚本用 python 跑"。这套规则文件就是 rifle，相当于"终端版 Finder 的默认打开方式"。

3. **scope.sh 预览脚本**：右栏的预览不是 ranger 内建的，而是调一个外部 shell 脚本 `scope.sh`，它根据扩展名分发——文本走 `highlight`（语法高亮）、图片走 `w3mimgdisplay` 或 iTerm2 inline image、视频走 `ffmpegthumbnailer` 抽帧。改 scope.sh 就能加任何你想要的预览格式。

进阶常用按键：

- `yy` / `dd` / `pp`：vim 风格复制 / 剪切 / 粘贴文件
- `:bulkrename`：选中多个文件后调起编辑器批量改名
- `S`：在当前目录打开 shell（退出 shell 回到 ranger）
- `gh` / `gn` / `gd`：跳到 home / new tab / Downloads（可在 rc.conf 自定义）

## 实践案例

### 案例 1：把 ranger 当 cd 增强用

最常见的用法不是"管理文件"而是"找路径"。在 zsh 加一个函数：

```bash
function ranger-cd {
  local tmp="$(mktemp)"
  ranger --choosedir="$tmp" "$@"
  local dir="$(cat "$tmp")"
  rm -f "$tmp"
  [ -n "$dir" ] && [ "$dir" != "$PWD" ] && cd "$dir"
}
bindkey -s '^O' 'ranger-cd\n'
```

按 `Ctrl+O` 进 ranger，光标移到目标目录后按 `q` 退出，shell 自动 `cd` 过去。这个用法把 ranger 变成"图形化版的 cd"，比 [[fzf]]+`zoxide` 直观得多。

### 案例 2：批量重命名一堆截图

```text
打开目录 → 按 V 进多选模式 → 用 jk 选中所有 .png → 按 :bulkrename
```

ranger 把选中的文件名一行一个写进 `$EDITOR`，你在 vim 里用 `:%s/IMG_/screenshot-/g` 整体替换，保存退出，ranger 自动 `mv` 到位。比 GUI 文件管理器的"重命名向导"灵活 10 倍。

### 案例 3：sshfs 远程目录浏览

```bash
sshfs user@server:/var/log /mnt/server-log
ranger /mnt/server-log
```

把远程服务器目录挂成本地路径，ranger 直接当本地目录浏览。配合 scope.sh 预览，可以在本地终端里翻服务器日志、图片、配置，省去反复 `scp` 下载。

### 案例 4：用 commands.py 加自定义动作

ranger 的 `commands.py` 里可以直接写 Python 类来扩展冒号命令。例如加一个"在当前目录用 git status 看变更"：

```python
from ranger.api.commands import Command
import subprocess

class git_status(Command):
    def execute(self):
        subprocess.run(['git', 'status'], cwd=self.fm.thisdir.path)
        self.fm.notify('git status done')
```

存到 `~/.config/ranger/commands.py` 后输入 `:git_status` 就能调起来。这种"配置即代码"的可扩展性是 lf / nnn 做不到的——它们只能调外部脚本，没有 Python 内嵌运行时。

## 踩过的坑

1. **图片预览要折腾终端**：ranger 默认用 `w3mimgdisplay`，但 iTerm2 / kitty / WezTerm 各有自己的内联图片协议。在 rc.conf 里要手工 `set preview_images_method iterm2`（或 kitty / sixel）才能正确显示，不然只看到一堆乱码。

2. **scope.sh 默认预览很弱**：不装 `highlight` / `bat` / `atool` / `mediainfo` / `ffmpegthumbnailer` 一堆外部工具，预览栏只有"file 命令的输出"。第一次用要花半小时把工具链补齐——这是 ranger 的"配置税"。

3. **Python 启动慢**：ranger 启动要 200~500ms（Python import 时间），快盘也救不了。如果你只是想 cd 一下，[[fzf]] + zoxide 那条路 < 50ms。要追极致性能换 Yazi（Rust 写的）或 lf（Go 写的）。

4. **配置文件版本兼容**：ranger 1.9.x 改了几个键位默认值，老 rc.conf 复制过来会报"unknown command"。每次大版本升级要重新 `ranger --copy-config=rc` 生成新模板再合并。

## 适用 vs 不适用场景

**适用**：

- vim 用户在终端找文件、看目录树
- ssh 上远程服务器要管理文件、看日志
- 批量重命名、批量移动（`:bulkrename` / `V` 多选）
- 想把 cd 升级成"图形化目录浏览"

**不适用**：

- 极致启动速度——换 Yazi / lf / nnn
- 不熟悉 vim 键位的人——学习曲线陡，不如装个 GUI
- Windows 终端——ranger 在 PowerShell / cmd 下基本跑不起来（curses 兼容差），WSL 里能用
- 需要复杂图形预览（缩略图墙、文件夹封面）——TUI 极限就在这里，要换 GUI 文件管理器

## 历史小故事

- **2009 年**：Roman Zimbelmann 公开 ranger v1.0，README 直接写"灵感来自 vifm 和 Midnight Commander"
- **2013 年**：v1.6 引入 rifle，把"用什么程序打开"从内置硬编码改成可配置规则文件
- **2017 年**：v1.8 加 iTerm2 inline image 协议支持，图片预览从"只能 w3m"扩到主流终端
- **2020 年**：作者基本停止活跃维护，社区 PR 仍在合并
- **2022 年起**：Yazi（Rust）/ lf（Go）/ broot（Rust）开始抢市场，但 ranger 因为 Python 写的、改 commands.py 即可定制，仍是"DIY 玩家的最爱"

ranger 的成功不是"终端文件管理器第一个"——vifm（Vim 风格）和 Midnight Commander（双栏）都更早。它的成功是"把 NeXTSTEP/Finder 的列视图搬进终端"这一步走对了。三栏视图比双栏直觉得多，光标一动右边就预览，这是 GUI 用户最熟悉的视觉模型。

## 学到什么

1. **视觉模型可以跨平台搬**：1986 年的 NeXTSTEP Miller columns，2009 年搬进终端依然好用。好的视觉抽象有 30 年生命周期。
2. **vim 键位是终端的通用语**：写 TUI 默认 vim 风格，用户群自动覆盖一半开发者。这是 ranger / lazygit / lazydocker / k9s 的共同选择。
3. **配置即扩展**：rifle.conf / scope.sh / commands.py 都是文本文件，用户改完直接生效。Python 写的好处是 commands.py 里可以塞任意逻辑，不像 lf 只能调外部脚本。
4. **不追性能也能活**：ranger 启动比 lf 慢 10 倍，但因为生态成熟（rifle 规则、scope 预览脚本、社区 commands.py 模板），用户不愿换。生态护城河比性能护城河深。

## 延伸阅读

- 仓库 README：[github.com/ranger/ranger](https://github.com/ranger/ranger)
- Wiki 配置示例：[github.com/ranger/ranger/wiki/Custom-Commands](https://github.com/ranger/ranger/wiki/Custom-Commands)（commands.py 怎么写）
- Yazi 项目：[github.com/sxyazi/yazi](https://github.com/sxyazi/yazi)（Rust 写的现代竞品，可以对照看设计取舍）

## 关联

- [[fzf]] —— 模糊搜索文件路径；和 ranger 互补，前者快定位、后者慢浏览
- [[fd]] —— 快速找文件名；ranger 内部的搜索用的是简单遍历，大目录下不如 `fd` 快
- [[bat]] —— 带语法高亮的 cat；可以替换 scope.sh 里的 `highlight` 做更漂亮的文本预览
