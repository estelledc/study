---
title: fzf — 命令行模糊查找
来源: https://github.com/junegunn/fzf
日期: 2026-05-29
分类: CLI
难度: 中级
---

## 是什么

fzf 是 Junegunn Choi 在 2013 年开源的**通用模糊查找器**（第一版用 Ruby，2015 年左右用 Go 重写）——任何能往终端打字打数据的命令，都能被它接进来做模糊筛选。

日常类比：VS Code 的 `Cmd+P` 让你打几个字母就跳到对应文件；fzf 是 Linux 终端的通用 `Cmd+P`——文件、命令历史、git 分支、Kubernetes namespace 全都能筛。

最小例子：

```bash
ls | fzf
```

终端会全屏显示当前目录文件，你打 "rea" 就能定位到 `README.md`，回车选中。

## 为什么重要

一旦把 fzf 接进 shell，下面这些日常动作都会从"翻找几秒"压到"打 3 个字符"：

- **终端 reverse search**：原本 `Ctrl+R` 一按要回忆完整字符串顺序；接上 fzf 之后能模糊搜，输 `git push` 不连贯也能命中
- **切目录 / 选文件**：`cd $(find . -type d | fzf)` 一行替代手写路径
- **切 git 分支**：`git checkout $(git branch | fzf)`，再也不背分支名
- **选 kubectl namespace**：`kubectl config use-context $(kubectl config get-contexts -o name | fzf)`

更深层的影响：

1. **几行 shell 集成**就接上 zsh / bash / fish，门槛极低
2. **启发了一整代 IDE 风格的终端 UI**——neovim 的 telescope、vim 的 fzf.vim、tmux 的 tmux-fzf 都是它的孩子
3. **单 binary 无依赖**——下载一个文件就能跑，符合 Unix 工具的审美

## 核心要点

fzf 一共做对了三件事：

### 1. Fuzzy matching

输入 "vim init" 就能匹配 `~/.config/nvim/init.lua`——空格分隔的多个子串都要出现，但不要求连续、不要求顺序严格。这种容错让"我大概记得"也能用。

### 2. Stdin friendly

fzf 不绑定任何数据源。任何命令的标准输出都能 pipe 进来：

```bash
history | fzf            # 模糊搜历史
docker ps | fzf          # 模糊选容器
brew list | fzf          # 模糊选已装包
```

这种"对接万物"的设计让它的应用场景几乎无限。

### 3. Preview window

按 `?` 或在启动时加 `--preview` 参数，fzf 右半屏显示当前选中项的内容：

```bash
find . -type f | fzf --preview 'cat {}'
```

边搜边看，再也不用"选错一个再退回来"。

## 实践案例

### 案例 1：替换 Ctrl+R 历史搜索

zsh 装好 fzf 后默认绑了 `Ctrl+R`：

```bash
# .zshrc
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh
```

之后按 `Ctrl+R` 不再是顺序回忆，而是弹出全屏 fzf，输任意子串都能跳到对应历史命令。一旦用上，旧的 reverse search 就回不去了。

### 案例 2：交互式选 git 分支

写一个函数放进 `.zshrc`：

```bash
fbr() {
  local branch
  branch=$(git branch --all | grep -v HEAD | fzf | sed 's#remotes/[^/]*/##')
  git checkout "$branch"
}
```

之后输 `fbr`，模糊选完直接切。比敲 `git checkout feature/xxxxxx-2026-05-...` 快十倍。

### 案例 3：与 ripgrep 配合做项目内搜索

```bash
rg --files | fzf --preview 'bat --color=always {}'
```

`rg --files` 列出所有被 git 跟踪的文件（已经过滤了 `.gitignore`），fzf 模糊筛，bat 高亮预览。这套是很多人替代 IDE 文件搜索的标配。

## 踩过的坑

1. **shell 集成方式各不一样**：bash / zsh / fish 三套接法不同；想要"补全也能模糊"还得装 [fzf-tab](https://github.com/Aloxaf/fzf-tab)（zsh 专用）
2. **Preview 窗口大文件慢**：直接 `cat` 一个 10MB 日志会卡住，习惯加 `head -200` 或 `bat --line-range :200`
3. **默认搜索器是 find，慢**：项目根目录下要搜大量文件时，把 `FZF_DEFAULT_COMMAND` 改成 `rg --files` 或 `fd --type f`，速度立即提一个数量级
4. **键绑定冲突**：vim 里的 `Ctrl+R` 是宏重放、tmux 里 `Ctrl+R` 默认无意义但有人改过；fzf 的 `Ctrl+R` 接管会让肌肉记忆暂时打架
5. **终端不支持 truecolor 时颜色失真**：在老 SSH session 或 Linux tty 里启用 `--color=16` 退化方案

## 适用 vs 不适用场景

**适用**：

- 任何"从一个列表里挑一个"的交互——文件、分支、容器、历史命令
- 想给 shell / vim / tmux 添加 IDE 风格的快速跳转
- 命令输出量大但只想筛少量结果的场景（结合 preview 边看边选）

**不适用**：

- 完全不会停下来交互的脚本——fzf 需要 TTY，CI / cron 用不了
- 数据需要复杂结构化筛选（写 SQL 比写 fzf 表达式合适）
- 大数据量精确匹配——fzf 的算法是模糊评分，量大时候不如 grep 直接

## 历史小故事

- **2013 年**：Junegunn Choi 第一版用 Ruby 写，在 GitHub 开源；当年还没有"模糊查找"这个习惯
- **2015 年**：用 Go 重写，性能拉起来；加上 zsh widgets，成为终端用户安装清单的常客
- **2019 年**：v0.20 加 `--preview`，从此可以"边搜边看"，热度翻一倍
- **2024 年**：v0.45 加 multi-line 模式，能一次显示带换行的结果（比如 commit message 全文）

到现在 GitHub star 已 80k+；虽有 peco / skim 等同类工具，fzf 仍是终端模糊查找的主流默认。Junegunn Choi 长期维护，是单人开源工具的代表案例之一。

## 学到什么

1. **数据源解耦**——fzf 不关心数据从哪来，只负责筛选 UI；这种"做好一件事"的 Unix 哲学让它能粘合所有 CLI
2. **shell 集成 = 杠杆**——10 行 widget 把全终端体验抬起来；不要小看 `.zshrc` 里那几行 source
3. **模糊匹配 + preview 是黄金组合**——前者降低记忆负担，后者降低误选成本，两者一起改变交互
4. **单人长期维护可以做出广泛影响的工具**——fzf、jq、ripgrep 都是这个模式

## 延伸阅读

- 项目主页：[junegunn/fzf](https://github.com/junegunn/fzf)
- 进阶配置：[fzf wiki — Examples](https://github.com/junegunn/fzf/wiki/Examples)（一堆现成函数可抄）
- 视频教程：[DistroTube — fzf in 100 seconds 风格的入门](https://www.youtube.com/results?search_query=fzf+tutorial)
- [[ripgrep]] —— 配合 `rg --files` 做项目内文件查找
- [[fd]] —— 比 find 更快的查找器，也常被设为 `FZF_DEFAULT_COMMAND`

## 关联

- [[ripgrep]] —— 高速文本搜索，常作为 fzf 的数据源
- [[fd]] —— 用户友好的 find 替代品，给 fzf 喂文件列表
- [[bat]] —— 带语法高亮的 cat，做 fzf preview 的标配
- [[tmux]] —— 终端复用器，搭配 fzf 选 session / window 体验更顺
- [[neovim]] —— telescope.nvim 是 fzf 思路在 neovim 里的再实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astronvim]] —— AstroNvim — 社区驱动的 Neovim 配置
- [[bat]] —— bat — 现代 cat 替代
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[delta]] —— delta — git diff 的语法高亮分页器
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fx]] —— fx — JSON 的交互式查看器（jq 的 TUI 表亲）
- [[gitui]] —— gitui — Rust 写的 git TUI，libgit2 直连让启动比 lazygit 快一个量级
- [[gum]] —— gum — 把 TUI 组件搬进 shell 脚本
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[jq]] —— jq — JSON 的 sed/awk
- [[lazydocker]] —— lazydocker — Go 写的 Docker TUI，五面板看容器 / 镜像 / 网络 / 卷
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[lazyvim]] —— LazyVim — lazy.nvim 驱动的 Neovim 发行版
- [[lf]] —— lf — 终端里像 vim 一样翻文件
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[miller]] —— Miller (mlr) — 懂 CSV/JSON 表头的 awk
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[neovim]] —— Neovim — Lua 可扩展 vim 现代分叉
- [[nnn]] —— nnn — 50KB 内存就能跑的极简终端文件管理器
- [[nvchad]] —— NvChad — 极致美观的 Neovim 配置
- [[ranger]] —— ranger — Python 写的 vim 风格三栏文件管理器
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[tig]] —— tig — 老牌 ncurses git 浏览器，把 log/blame/diff 玩到骨子里
- [[tmux]] —— tmux — 一个终端窗口里跑多个会话还能脱离重连
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
- [[vim]] —— Vim — 键盘上弹钢琴的编辑器
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
- [[yazi]] —— yazi — Rust 写的异步 TUI 文件管理器，终端里直接看图
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

