---
title: broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
来源: 'https://github.com/Canop/broot'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

broot 是 Rust 写的**交互式目录浏览器**：把 `tree` 命令的"一次性把整棵树打印出来"升级成一个会响应键盘、边输边过滤、还能直接跳过去的小窗口。日常类比：像把一张静态地图换成手机导航——你输什么它高亮什么，剩下的折叠起来不挡视线。

你打开终端，敲 `br`，屏幕上是当前目录的一棵树。开始打字 `read`：所有不含 read 的目录立刻收起来，只剩下带匹配的路径，下面写着 "_unlisted_ 23 files"，告诉你被折叠了多少。回车进入子目录，alt+enter 退出 broot 时把 shell 的当前目录切到那里。

它一个 binary 同时替了 `tree`、`ls`、`du -sh`、`cd` 四件事，是终端常用工具里少见的"组合升级"。

## 为什么重要

不理解 broot，下面这些场景都会回到旧办法：

- 在大仓库里找一个文件路径，`tree` 一打刷屏 200 行，肉眼根本看不过来
- 想知道哪个子目录最占空间——要敲 `du -sh */ | sort -h` 拼命令
- 找代码时切目录靠 `cd ../../foo/bar`，每次都要先 `ls` 看一眼有没有
- `.gitignore` 里的 `node_modules` 想临时看一眼，又不想改配置

## 核心要点

broot 的设计可以拆成 **三个动作**：

1. **模糊收缩**：你输入的每个字符，broot 立刻把不匹配的子树折叠成 `_unlisted_`。类比：搜索引擎的"自动联想"实时收窄候选，但保留树形上下文不打散。

2. **大小占比可视化**（`-s` 模式）：每个目录右边画一条横向 bar，长度对应它占父目录空间的比例。类比：像超市价签上的"每 100g 多少卡"，一眼看出谁是大头。

3. **动作动词**（用 `:` 触发）：选中文件后输 `:rm`、`:mv`、`:cp` 直接执行，不用退出去敲命令。类比：游戏里的快捷动作槽，把"选目标 → 执行"压在一个面板里。

三件事共享一棵活的树视图，这就是 broot 与 tree / ranger / fzf 的核心差别。

## 实践案例

### 案例 1：找占空间最大的目录（whale spotting）

家目录磁盘满了，想找哪个文件夹最大：

```bash
br -s ~
```

`-s` 是 size 模式。打开后右侧每个目录都有一条横条：

```
~/Downloads          ████████████████ 12 GB
~/Library/Caches     ██████████ 7.4 GB
~/.cache             ██ 1.2 GB
```

按方向键选中 `Downloads`，回车进入看里面具体哪些文件大。一分钟内定位到要删的目标，比 `du -sh ~/* | sort -h` 直观很多。

### 案例 2：fuzzy 跳目录（替代 cd）

在 monorepo 根目录，想跳到 `packages/web/src/components`：

```bash
br
# 输入 webcomp（不用按顺序，broot fuzzy 匹配）
# 树自动收缩到只剩匹配的路径
# alt+enter
```

退出 broot 后 shell 当前目录就在那里。比 `cd packages/web/src/components` 短，还不用记完整路径。前提是装了 `br` shell 函数（cargo install 之后跑一次 `broot --install`）。

**对比 `cd` + `ls`**：传统流程是 `cd packages/`、`ls`、`cd web/`、`ls`、`cd src/components`，每一跳都要看一眼有没有目标。broot 把这五步压成一次输入。

### 案例 3：看 git 改了哪些文件

仓库里改了一堆文件，想边看树边知道每个文件的 git 状态：

```bash
br -g
```

`-g` 模式给每个文件加状态列：`M`（modified）、`A`（added）、`?`（untracked）。比 `git status` 多了树形上下文——你能看到改动集中在哪个子目录。

## 踩过的坑

1. **`_unlisted_` 不是错误**：第一次看到这行字以为出问题了——它是被折叠的剩余条目数，提醒你"这里还有 23 个没显示"，是 broot 设计的一部分。

2. **默认隐藏 `.gitignore` 文件**：找 `node_modules` 半天找不到，要按 `Alt+I` 临时打开 gitignored 文件显示；隐藏文件用 `Alt+H`。

3. **回车不是 cd**：选中目录按回车是"展开/进入子树"，**不退出**；要 cd 必须 `Alt+Enter`。新手常按错以为 broot 卡住了。

4. **`broot` 命令本身不带 cd 能力**：必须用 `br` 这个 shell 函数（包装了 broot 输出 + cd），第一次安装后要跑 `broot --install` 把 `br` 注入到 shell rc。

## 适用 vs 不适用场景

**适用**：

- 终端工作流：经常切目录、找文件、看大小、看 git 状态的人
- 大仓库浏览：monorepo / 数据目录 / 系统盘清理
- 替代 `tree` + `du -sh` + `cd` 三件套，不想记一堆别名
- 需要在保留树形上下文的同时做文件操作（mv / rm / cp）

**不适用**：

- 纯 GUI 用户：直接用 Finder / Files / VS Code 资源管理器
- 需要批量脚本化的场景：`find`、`fd`、`rg` 才有 piping 能力
- 远程服务器无 Rust 环境：装不了，回退到 `tree` + `ls` 即可
- 嵌入式终端 / 受限 shell：broot 依赖一定的 TUI 渲染能力

## 历史小故事（可跳过）

- **2019 年**：Canop（独立开发者）开始用 Rust 写 broot，灵感是对 `tree` 输出过长 + `ranger` 学习曲线陡的双重不满
- **2020 年**：1.0 发布，加入 fuzzy filter 和 `_unlisted_` 折叠机制
- **2021 年**：加入 git status 集成 + size mode（whale spotting）
- **2023 年**：加入预览面板，可以在第二列直接看文件内容、图片缩略图
- **2026 年**：仍是单人维护，11k stars，是 Rust 终端工具复兴里的代表作之一

这条线和 [[ripgrep]] / [[bat]] / [[eza]] / [[dust]] / [[zoxide]] / [[fzf]] 一起组成了 2018-2024 年的"Rust 重写 GNU 工具"运动，broot 是其中少数加了 TUI 交互的。

## 学到什么

1. **交互 > 一次性输出**：tree 把所有信息打印出来，broot 让你"打字筛选"，本质是把信息压缩交给用户的输入而不是预设过滤
2. **保留上下文是 UX 关键**：fzf 也能 fuzzy，但 fzf 把树打散成一列；broot 保留树形结构是它真正的差异化
3. **一个 binary 替多个工具**是终端复兴的核心模式（bat/eza/dust/zoxide/broot 都在做这件事）
4. **shell 集成不是免费的**：broot 必须装 `br` 函数包装才能 cd，这是 TUI 程序的通用难题——子进程改不了父 shell 的 cwd
5. **可发现的快捷键 > 强记**：broot 不要求你一次记完所有 Alt 组合，状态栏会随场景提示当前能用的动作

## 延伸阅读

- 官方文档：[dystroy.org/broot](https://dystroy.org/broot/)（含完整快捷键和配置；从 first launch 一节读起）
- 配置文件路径：`~/.config/broot/conf.toml`，可改默认 mode、主题色、verbs 自定义动作
- 视频教程：[Broot — A new way to see and navigate directory trees](https://www.youtube.com/results?search_query=broot+rust+tutorial)（YouTube 多个 5 分钟入门）
- GitHub README：[Canop/broot](https://github.com/Canop/broot)（含 gif 动图和 cargo install 一行命令）
- [[fzf]] —— 模糊匹配引擎的鼻祖，broot 借鉴了它的输入即过滤
- [[zoxide]] —— 另一个"少打字 cd"思路：靠访问历史而非交互树
- [[eza]] —— 同为 Rust 替代品，对应的是 `ls` 而不是 `tree`

## 关联

- [[fzf]] —— 模糊匹配的祖师爷，broot 在树形结构上重做了一遍
- [[zoxide]] —— "智能 cd" 的另一种解法（频次代替模糊）
- [[eza]] —— Rust 终端复兴里的 `ls` 替代，与 broot 同一波
- [[ripgrep]] —— Rust 终端工具复兴的引爆点，broot 受它影响
- [[bat]] —— `cat` 的 Rust 替代，可被 broot 调用做文件预览
- [[dust]] —— `du` 的 Rust 替代，专做大小可视化（broot 的 `-s` 模式做了类似事）
- [[lsd]] —— 另一个 `ls` 替代，与 eza 同期；说明 Rust 把所有 GNU 工具都重做了一遍

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[fzf]] —— fzf — 命令行模糊查找
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[lsd]] —— lsd — 现代 ls 替代（LSDeluxe，主题化 + 图标，不押 git）
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
- [[xplr]] —— xplr — 用 Lua 当配置语言的可 hack 终端文件管理器
- [[yazi]] —— yazi — Rust 写的异步 TUI 文件管理器，终端里直接看图
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

