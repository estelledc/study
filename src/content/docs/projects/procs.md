---
title: procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
来源: 'https://github.com/dalance/procs'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

procs 是用 **Rust 写的 ps 替代品**——一个看进程列表的命令行工具，但比 1973 年就有的 ps 多塞了三类现代信息：**端口、Docker 容器、读写吞吐**，而且**默认彩色**。

日常类比：ps 像一张黑白报表纸，每列对得不齐，重要数字混在一堆里你得用尺子比；procs 像同一张表换成了带颜色高亮的电子表格——CPU 高的标红、用户名一列染色、PID 加粗、长命令自动换行。

你装上以后输入：

```bash
procs
```

就能看到当前所有进程，**自动适配**你终端是浅色还是深色主题，每行带颜色，最后一列直接显示进程**绑了哪些 TCP/UDP 端口**。

## 为什么重要

- 不理解它，无法解释为什么"`ps aux | grep redis` 总是把 grep 自己也匹配进来"——procs 直接 `procs redis` 一步到位
- 不理解它，写不出"哪个进程占了 6379 端口"——传统答案是 `lsof -i :6379`，procs 一行 `procs --or 6379` 就有
- 不理解它，看不出 Rust 重写 coreutils 的浪潮（[[bat]] / [[ripgrep]] / [[fd]] / [[eza]]）：每个老工具都有人换底层重做一遍
- 不理解它，不知道 ps 输出格式有多差——它是 50 年前的 V4 Unix 遗产，**没人敢动**

## 核心要点

procs 比 ps 多三件事，少一件事：

1. **端口绑定**：每个进程后面跟一列"它在 listen 哪些 TCP/UDP 端口"。类比：ps 给你名片，procs 给你名片+办公室门牌号。

2. **多关键字过滤**：`procs --or 6379 5432` 同时查 Redis 和 Postgres，`--and` 是同时含两词，`--nand` 是不同时含。比 grep 拼正则清晰。

3. **树形视图**：`procs --tree` 用 PPID（父进程 ID）把所有进程拼成森林，类比家谱图——一眼看出 `zsh → nvim → rust-analyzer` 这条链。

少的一件：procs **没有交互面板**——不能像 [[htop]] 那样按 F9 杀进程、按 F7 调优先级。它定位是"只读看",要操作还是用 htop / [[btop]]。

底层实现：Linux 读 `/proc/<pid>`，macOS 调 `libproc`，FreeBSD 用 `kvm`，Windows 走 `PSAPI`。跨平台抽象一层后用同一个 TUI 渲染。

## 实践案例

### 案例 1：找出谁占了某个端口

```bash
procs --or 6379 5432 8080
```

**逐部分解释**：

- `procs` 是命令本身，单独跑 = `ps aux` 等价
- `--or 6379 5432 8080` 表示"匹配这三个数字中**任意一个**的进程"，匹配范围包括 PID、命令名、端口号
- 输出里会高亮匹配行，在 TCP 列直接看到 `:6379` `:5432` `:8080`

传统等价命令：`lsof -i :6379 -i :5432 -i :8080`，procs 把 ps + lsof 合一。

### 案例 2：树形看进程家谱

```bash
procs --tree
```

输出长这样（简化）：

```
PID    User   Command
1      root   /sbin/init
├─300  root   /usr/bin/dockerd
│  └─800  root   /containerd-shim node
├─900  jason  /bin/zsh
│  └─1100 jason  nvim
│     └─1200 jason  rust-analyzer
```

**用处**：调试"为什么我退出 nvim 后 rust-analyzer 还在跑"——树形一看就知道父子关系，对症 kill 父进程即可。

### 案例 3：当轻量 top 看 CPU

```bash
procs --watch-interval 2 --sortd cpu
```

**逐部分解释**：

- `--watch-interval 2` 每 2 秒刷新一次，类似 `top` 的实时模式
- `--sortd cpu` 按 CPU 用量**降序**（d = descending）排序

得到一个不停刷新的彩色列表，CPU 飙高的那行会一直在最上面。比 `top` 字体好看，比 [[htop]] 简单（不需要按键操作）。

## 踩过的坑

1. **macOS 看不到别人进程的细节**：普通用户跑 `procs` 只能看到自己启动的进程；要看别人（包括系统进程）必须 `sudo procs`，否则一堆字段是 `?`。

2. **Linux 读写吞吐字段需要 root**：Read/Write Throughput 列在普通用户下永远是 0——内核只允许同 UID 或 root 读 `/proc/<pid>/io`。

3. **端口列只看 listen，且非 root 时残缺**：listen 状态的端口才显示；普通用户因 procfs 权限只能看自己进程的端口。要看完整端口图，要么 `sudo procs`，要么用 `ss -tunlp`。

4. **Docker Toolbox 不支持**：旧版 macOS Docker Toolbox 走的是非 UNIX socket，procs 拿不到容器名；现代 Docker Desktop 没问题。

## 适用 vs 不适用场景

**适用**：

- 日常 "ps + grep" 的所有场景——直接换成 `procs <关键字>`
- 排查端口冲突——`procs --or <port>` 一步替代 ps + lsof 拼接
- 看进程父子关系——`--tree` 比 `pstree` 输出现代得多
- 跨平台脚本——同一份命令在 Linux / macOS / Windows 都能跑

**不适用**：

- 需要交互（kill / renice / detach）→ 用 [[htop]] 或 [[btop]]
- 需要历史 / 趋势图 → 用 [[bottom]] 或 [[glances]]
- 需要 root 才能看的全景且禁用 sudo → procs 也救不了你
- 嵌入式 / 极小镜像（procs 二进制几 MB）→ 老老实实用 busybox ps

## 历史小故事（可跳过）

- **1973 年**：ps 在 V4 Unix 第一次出现，靠遍历 `/dev/kmem` 读内核进程表，输出格式定型，**之后五十年几乎没变**
- **2008 年**：htop 出现，给了 ps 第一个真正的彩色交互替代——但 htop 是 C 写的、Linux-first
- **2018 年**：dalance 在 GitHub 开 procs 仓库，用 Rust 重写，目标"ps 该有但永远不会有的现代信息"
- **2018-2026**：procs 跟着 [[bat]] / [[ripgrep]] / [[fd]] / [[eza]] 一起，成为 "Rust 重做 coreutils" 浪潮的代表作之一，brew/cargo/winget 全平台可装

## 学到什么

1. **老工具不是不能改，是没人改**——ps 五十年没动不是因为完美，而是动它太危险（无数脚本依赖输出格式），新工具反而能放手做
2. **CLI 现代化的三板斧**：默认彩色 / 多关键字过滤 / 跨平台单二进制——procs 全占了
3. **只读 vs 交互的边界要清楚**——procs 故意不做 kill/renice，把"看"和"控"分开，比 htop 那种全包更利于组合
4. **Rust 适合写 coreutils 替代**：单二进制、跨平台、内存安全、CLI 框架（clap）成熟，重写门槛被压到很低

## 延伸阅读

- 官方 README：[procs GitHub](https://github.com/dalance/procs)（带截图，看一眼就懂彩色效果）
- 配置文档：[procs.toml 列定制](https://github.com/dalance/procs/blob/master/CONFIGURATION.md)（自己加列、改颜色）
- 对比文章：[A Rust replacement for ps](https://lwn.net/Articles/787818/)（LWN 的工具评测，谈 procs 的设计动机）
- [[htop]] —— 交互式进程查看器，procs 的"看 + 控"补集
- [[bottom]] —— Rust 写的 top 替代，画 CPU/内存图

## 关联

- [[htop]] —— 交互式 ps，可 kill/renice，procs 不做这块
- [[btop]] —— C++ 写的现代 top，画图 + 交互全有
- [[bottom]] —— 同样 Rust 写的，btm 命令，定位 top 替代
- [[glances]] —— Python 写的 top 增强版，远程监控更强
- [[eza]] —— ls 的 Rust 替代，同浪潮的兄弟项目
- [[bat]] —— cat 的 Rust 替代，加语法高亮
- [[ripgrep]] —— grep 的 Rust 替代，递归搜索神器
- [[fd]] —— find 的 Rust 替代，默认忽略 .gitignore

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[bat]] —— bat — 现代 cat 替代
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[eza]] —— eza — 现代 ls 替代（exa 的社区接管 fork）
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[htop]] —— htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
- [[lazygit]] —— lazygit — Go 写的全功能 git TUI，键盘驱动 stage / rebase / cherry-pick
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep

