---
title: ranger — Python 写的 vim 风格三栏文件管理器
来源: https://github.com/ranger/ranger
日期: 2026-05-31
分类: CLI
难度: 中级
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

ranger 和 [[fzf]] / [[fd]] / [[bat]] 这些 Rust CLI 不同——它不追"快"，它追"在终端里把 GUI 的视觉模型搬过来"。同代竞品：[[lf]]（Go 写的简化版）、[[nnn]]（C 极简版）、[[yazi]]（Rust 现代版）。ranger 是这条赛道的"老祖宗"。

## 核心要点

ranger 的设计可以拆成 **三个支柱**：

1. **Miller columns 三栏布局**：这种"父-当前-预览"三列视图最早是 NeXTSTEP 1986 年提出的，后来被 macOS Finder 列视图继承。ranger 把它原样搬进终端，光标动一下三栏全部刷新——视觉模型即心智模型。

2. **rifle 文件打开器**：按 `l`（或回车）想打开文件，ranger 去查 `rifle.conf`：".pdf 用 zathura"、".jpg 用 feh"、"shebang 是 python 的脚本用 python 跑"。这套规则文件就是 rifle，相当于"终端版 Finder 的默认打开方式"。

3. **scope.sh 预览脚本**：右栏预览不是内建的，而是调外部 shell 脚本 `scope.sh`，按扩展名分发——文本走 `highlight`、图片走 `w3mimgdisplay` 或 iTerm2 inline image、视频走 `ffmpegthumbnailer` 抽帧。改 scope.sh 就能加任何预览格式。

进阶常用按键：`yy` / `dd` / `pp` 复制剪切粘贴；`:bulkrename` 批量改名；`S` 在当前目录开 shell；`gh` / `gd` 跳到 home / Downloads。

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

**逐部分解释**：

1. `mktemp` 造一个临时文件，ranger 退出时把"最后停留的目录"写进去
2. `--choosedir="$tmp"` 告诉 ranger：按 `q` 退出时把当前路径写到这个文件
3. 读出路径后，若与 `$PWD` 不同就 `cd` 过去；`Ctrl+O` 绑定成快捷键

按 `Ctrl+O` 进 ranger，移到目标目录后按 `q`，shell 自动 `cd`——比 [[fzf]]+[[zoxide]] 更直观。

### 案例 2：批量重命名一堆截图

```text
打开目录 → 按 V 进多选 → jk 勾选所有 .png → :bulkrename → 编辑器里替换 → 保存退出
```

**逐部分解释**：

1. `V` 进入 visual 多选，`j`/`k` 移动并勾选文件
2. `:bulkrename` 把选中文件名一行一个写进 `$EDITOR`
3. 在 vim 里执行 `:%s/IMG_/screenshot-/g`，保存退出后 ranger 自动 `mv`

比 GUI 的"重命名向导"灵活：正则、列编辑、外部脚本都能用。

### 案例 3：用 commands.py 加自定义动作

```python
from ranger.api.commands import Command
import subprocess

class git_status(Command):
    def execute(self):
        subprocess.run(['git', 'status'], cwd=self.fm.thisdir.path)
        self.fm.notify('git status done')
```

存到 `~/.config/ranger/commands.py` 后输入 `:git_status` 即可。`self.fm.thisdir.path` 是当前栏目录；这种"配置即代码"是 [[lf]] / [[nnn]] 做不到的——它们只能调外部脚本，没有 Python 内嵌运行时。

## 踩过的坑

1. **图片预览要折腾终端**：默认用 `w3mimgdisplay`，iTerm2 / kitty / WezTerm 各有内联协议。rc.conf 里要 `set preview_images_method iterm2`（或 kitty / sixel），不然只看到乱码。

2. **scope.sh 默认预览很弱**：不装 `highlight` / `bat` / `atool` / `mediainfo` / `ffmpegthumbnailer`，预览栏只有 `file` 命令输出。第一次用要花半小时补工具链——这是 ranger 的"配置税"。

3. **Python 启动慢**：启动约 200~500ms（Python import），快盘也救不了。只想 cd 一下，[[fzf]] + [[zoxide]] < 50ms。追极致性能换 [[yazi]] 或 [[lf]]。

4. **配置文件版本兼容**：1.9.x 改了几个键位默认值，老 rc.conf 会报 `unknown command`。大版本升级要重新 `ranger --copy-config=rc` 再合并。

## 适用 vs 不适用场景

**适用**：

- vim 用户在终端找文件、看目录树
- ssh 上远程服务器要管理文件、看日志（也可 `sshfs` 挂载后再开 ranger）
- 批量重命名、批量移动（`:bulkrename` / `V` 多选）
- 想把 cd 升级成"图形化目录浏览"

**不适用**：

- 极致启动速度——换 [[yazi]] / [[lf]] / [[nnn]]
- 不熟悉 vim 键位的人——学习曲线陡，不如装 GUI
- Windows 终端——PowerShell / cmd 下 curses 兼容差，WSL 里能用
- 需要复杂图形预览（缩略图墙、文件夹封面）——TUI 极限就在这里

## 历史小故事（可跳过）

- **2009 年**：Roman Zimbelmann 公开 ranger，README 写灵感来自 vifm 和 Midnight Commander
- **2013 年**：v1.6 引入 rifle，把"用什么程序打开"从内置硬编码改成可配置规则文件
- **2016 年**：v1.8.0 加 iTerm2 inline image 协议支持，图片预览从"只能 w3m"扩到主流终端
- **2020 年前后**：原作者基本停止活跃维护，社区 PR 仍在合并
- **2022 年起**：[[yazi]] / [[lf]] / broot 开始抢市场，但 ranger 因 Python 可改 `commands.py`，仍是 DIY 玩家最爱

ranger 的成功不是"终端文件管理器第一个"——vifm 和 Midnight Commander 都更早。它走对的是"把 NeXTSTEP/Finder 列视图搬进终端"：三栏比双栏直觉得多，光标一动右边就预览。

## 学到什么

1. **视觉模型可以跨平台搬**：1986 年的 NeXTSTEP Miller columns，2009 年搬进终端依然好用。好的视觉抽象有 30 年生命周期。
2. **vim 键位是终端的通用语**：写 TUI 默认 vim 风格，用户群自动覆盖一半开发者。这是 ranger / [[lazygit]] / k9s 的共同选择。
3. **配置即扩展**：rifle.conf / scope.sh / commands.py 都是文本文件，改完直接生效。Python 的好处是 commands.py 可塞任意逻辑。
4. **不追性能也能活**：启动比 lf 慢约一个数量级，但生态成熟（rifle 规则、scope 脚本、社区 commands），用户不愿换。生态护城河比性能护城河深。

## 延伸阅读

- 仓库 README：[github.com/ranger/ranger](https://github.com/ranger/ranger)
- Wiki 自定义命令：[github.com/ranger/ranger/wiki/Custom-Commands](https://github.com/ranger/ranger/wiki/Custom-Commands)
- [[yazi]] —— Rust 写的现代竞品，对照看设计取舍
- [[lf]] —— Go 写的 ranger 简化版，启动更快、扩展靠外部脚本

## 关联

- [[fzf]] —— 模糊搜索文件路径；和 ranger 互补，前者快定位、后者慢浏览
- [[fd]] —— 快速找文件名；ranger 内部搜索是简单遍历，大目录下不如 `fd`
- [[bat]] —— 带语法高亮的 cat；可替换 scope.sh 里的 `highlight` 做文本预览
- [[zoxide]] —— 智能 cd；和案例 1 的 ranger-cd 是两条不同路线
- [[yazi]] —— Rust 现代三栏文件管理器，ranger 的性能向后继
- [[lf]] —— Go 简化版 ranger，配置更轻、扩展模型不同
- [[lazygit]] —— 同样 vim 键位的 TUI，说明"终端通用语"策略

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
