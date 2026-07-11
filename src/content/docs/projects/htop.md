---
title: htop — top 的彩色交互替代（鼠标点选 / 树视图 / 过滤）
来源: https://github.com/htop-dev/htop
日期: 2026-05-30
分类: CLI
难度: 入门
---

## 是什么

htop 是 **2004 年 Hisham Muhammad 用 C + ncurses 写的交互式进程监控器**，给终端里那条又老又僵的 `top` 命令换了一身衣服——彩色表头、可上下左右滚动、可鼠标点选、可切树形进程视图、可按 `/` 搜索按 `\` 过滤。

日常类比：

- **`top` 是一张定死大小的报表**——超出屏幕的命令行直接被截掉，要按 PID 操作就得自己记数字
- **htop 是一张能滚能点能筛的电子表**——长命令行往右拉就能看完，想杀进程在它身上按 F9 选信号就行，不用记 PID

打开 htop 你看到：上面三条彩色 CPU/MEM/SWAP 仪表盘，下面是按列排好的进程表，最底下一排 `F1 Help / F2 Setup / F3 Search / F6 SortBy / F9 Kill / F10 Quit`。整个体验更像 90 年代 DOS 蓝屏管理器，而不是 Unix 命令行。

## 为什么重要

不只是"top 的彩色版"，它改变了运维和开发查进程的工作流：

- **可视化层级关系**——按 `t` 切树视图，立刻看清"这个 node 进程是哪个 systemd unit 拉起来的"，比 `ps -ef --forest` 直观一个量级
- **不用记 PID 操作**——杀进程、改 nice 值、改 IO priority 都靠方向键选中 + F-key，零经验运维也能用
- **配置可保存可分享**——所有显示的列、颜色、Meter 都写在 `~/.config/htop/htoprc`，团队里能直接拷贝
- **现代字段跟得上**——cgroup v2 / pressure stall / 容器名列在 2020 后社区接管时陆续加入，看 K8s pod 也用得动
- **传播极广**——多数 Linux 发行版 `apt install htop` 一行装好；macOS `brew install htop`；轻量到嵌入式都能跑

很多开发的第一个 "比命令行更好用的命令行工具" 就是 htop——和 [[bat]]、[[fzf]] 是同一类"终端体验现代化"工具的不同分支。

## 核心要点

htop 的设计可以拆成 **4 件事**：

1. **TUI 渲染**：基于 ncurses 把进程表画成彩色表格——CPU/MEM 仪表盘用条形图，进程行按字段着色（root 进程亮红、自己进程亮绿、内核线程灰），鼠标点列头能切排序。色板可以在 Setup 里换主题。

2. **平台抽象层**：核心只管 UI，进程数据从 `pl/`（platform layer）读——Linux 走 `/proc`、macOS 走 `task_for_pid`、FreeBSD 走 sysctl。跨平台骨架在 **v2.0（约 2016）** 就有了；2020 社区接管后继续打磨这层抽象并补现代字段，而不是从零发明多平台。

3. **三件交互利器**：
   - 搜索 `/keyword`：高亮匹配进程，按 n 跳下一个
   - 过滤 `\keyword`：只显示匹配的进程，其他全藏起来
   - 树视图 `t`：把 `ppid` 关系画成缩进树，看清谁是谁的父进程

4. **可点击的批量操作**：空格选中多个进程，再 F9 一次性发信号；F7/F8 改 nice 值；F4 反向过滤；这些操作过去只能 `ps` + `xargs` + `kill` 拼出来，现在按几下方向键就完成。

## 实践案例

### 案例 1：找占内存最多的进程

```bash
htop
# 按 F6（或鼠标点 MEM% 列头）→ 选 PERCENT_MEM → 回车
```

进程表立刻按内存占比降序排，最上面就是吃内存大户。比 `ps aux | sort -k4 -nr | head` 直观——而且能继续按 F9 直接杀掉它。

### 案例 2：在 systemd 服务的子进程里找问题

```bash
htop -t        # 启动直接进树视图
# 或运行后按 t
```

得到缩进的进程树：`systemd → docker → containerd-shim → node`。某个 Node 服务卡住时，能立刻看出"它不是孤儿，是被 docker 拉起来的"——决定是去杀进程还是 `docker restart`。

### 案例 3：配出自己想看的列

```bash
htop  # 按 F2 进 Setup → Columns
# 加: IO_READ_RATE / IO_WRITE_RATE / CGROUP / OOM
# 退出会写到 ~/.config/htop/htoprc
```

加上 IO 速率列就能直接看哪个进程在写盘；加上 CGROUP 列就能看每个 K8s pod 对应的进程组。配置文件可以提交到 dotfiles，新机器一拷就用。

### 案例 4：给 CPU 仪表盘换显示风格

`F2 Setup → Meters` 把默认的"每核一条"改成"全核合一"或"图形条"。屏幕窄的时候省一半空间；屏幕宽的时候每核一条更清楚哪个核被吃满。Meter 可以叠 LoadAverage / Uptime / Battery / Hostname，把 htop 当一个临时仪表板用。

## 踩过的坑

1. **macOS 上看不到别人的进程**：默认非 root 进程列表不全，要 `sudo htop`。Apple Silicon 上还要给 htop 二进制 codesign 加 `task_for_pid` 权限——`brew install htop` 装出来的版本通常已经签好，自己编译的要手动签。否则启动后只看到自己 shell 进程，以为 htop 挂了。

2. **F-key 被 tmux / iTerm 截走**：按 F9 杀进程毫无反应——是 tmux 的 `bind-key` 把 F-key 抢走了。要么 `unbind -n F9`，要么直接用字母快捷键（`k` = kill）。这套字母键和 F-key 一一对应，记一次就行。tmux 用户基本要靠字母键过日子。

3. **过滤把父进程挡了，子树也消失**：`\nginx` 想看 nginx 进程组，但树视图下父进程不匹配过滤词时整个分支会被隐藏——结果 worker 进程看不见。**正确做法**：搜索 `/` 高亮即可，或者过滤完关掉树视图，或者把过滤词改成更宽的根名。

4. **CPU% 单核 vs 全核读数歧义**：24 核机器上一个吃满单核的进程显示 `CPU% = 100`（单核满）还是 `CPU% = 4.2`（全核占比）？取决于 Setup 里 "Count CPUs from 0/1" 和 "Detailed CPU time" 的设置，老版本默认单核 100，新版本默认全核——读数前先确认，不然性能分析容易差一个数量级。

5. **htoprc 里 Meter 顺序写反**：手改配置时容易把 left_meters / right_meters 的索引数和实际数量对不上，启动直接 segfault。**正确做法**：用 F2 Setup 改完退出由 htop 自己写文件，别手工凑。

## 历史小故事（可跳过）

- **2004**：巴西开发者 Hisham Muhammad 在攻读计算机硕士期间写出 htop 第一版，C + ncurses，最初只支持 Linux。当时设计目标就是一句话："给 top 加上鼠标和树视图"
- **2006–2016**：Hisham 个人维护多年；**v2.0（约 2016）已跨平台**（Linux / macOS / FreeBSD / OpenBSD 等），平台差异靠各 OS 后端读进程信息
- **2019**：Hisham 维护放缓，原仓库后来 archived；2020 社区在 GitHub 组织 `htop-dev/htop` 下接手。这次交接没有撕裂——Hisham 公开背书新组织，用户基本无缝过渡
- **2020 v3.0**：社区版第一个大版本——继续打磨平台抽象层，补上 cgroup v2 / Linux pressure stall 等现代字段，而不是"第一次支持多平台"
- **2022 v3.2**：动态 Meter（按需加载）/ 增强 ZFS ARC 显示 / 修了一堆 macOS 信号处理 bug
- **2024 v3.3**：渐进改进期，加入容器化字段、改善 macOS 上的稳定性

htop 走的不是 [[ripgrep]] / [[bat]] 那种 "Rust 重写一遍" 的路线——它**还是 C**，还是 ncurses，靠的是社区维护把现代字段一点点加进去。在"换语言"和"换维护方"之间，它选了后者，并且至今稳定。

## 适用 vs 不适用场景

**适用**：

- 终端里看进程、查内存 / CPU 占用、杀失控进程——比 `top` 学习成本低
- 教新人查问题——按 F1 帮助 + F-key 提示，不用先讲一堆命令行选项
- dotfiles 里默认装上——配置文件可分享，团队风格统一
- 树视图调试父子进程关系——比 `pstree` + `ps` 组合更直观
- SSH 进生产机做临时排查——一条 `htop` 命令就能开工，不需要事先部署任何 agent

**不适用**：

- 需要程序化采集指标 → 用 `top -b -n 1` 批处理模式或直接读 `/proc`
- 远程上千台机器统一监控 → 用 Prometheus node-exporter + Grafana，不要 SSH 进去开 htop
- 需要历史趋势 / 容量规划 → htop 只看实时一秒一秒，没历史，用 atop / sar / Prometheus
- 容器内部诊断（distroless 镜像） → 没 ncurses 库装不进去，临时 `kubectl debug` 也不一定有；用 `crictl ps` / `docker top` 代替
- 想看 GPU / 网络 / 磁盘 IO 全景 → htop 只关注进程层，要看其他维度用 nvtop / iftop / iotop

## 学到什么

1. **TUI 是被低估的中间层**——比纯命令行直观、比 GUI 轻量；htop 证明 ncurses 这种"老技术"在合适场景仍然能打。同样的格局后来被 lazygit / k9s 复用
2. **平台抽象比 UI 更难维护**——htop 早期只支持 Linux，v2.0 起才跨平台；社区接管后继续在 `/proc` vs Mach API vs sysctl 这些差异上花力气，底层接口决定了多平台代码量
3. **可保存的配置就是用户黏性**——`~/.config/htop/htoprc` 让用户用一次就回不去；同样的设计在 [[fzf]]、[[zoxide]] 里也成立
4. **维护权交接要趁早讲清楚**——Hisham 2019 公开宣布交接、archived 老仓库、社区 fork 起新组织——这个流程让 htop 没断档；很多项目就是因为没安排好接手而死掉
5. **"够好用就先停"是最强壁垒**——htop 没去重写成 Rust，没追时髦做 GPU 渲染，靠的就是"装一行命令、按 F1 就懂、F-key 二十年没变"；后来者 btop / glances 功能更花，但替代不了 htop 的位置

## 延伸阅读

- 官方 README：[github.com/htop-dev/htop](https://github.com/htop-dev/htop)（含截图、F-key 速查、Setup 字段说明）
- 维基入门：[Arch Wiki — htop](https://wiki.archlinux.org/title/Htop)（中文翻译质量也不错，按字母快捷键全表）
- 进阶配置：搜 "htoprc dotfiles" 看别人的 columns / Meter 怎么配，比看官方文档直观
- 同类对比：搜 "btop vs htop"——btop 用 C++ 重写、加图形化磁盘 / 网络面板，但启动慢、占内存大；htop 仍是"开箱即用"的最优解
- 源码漫谈：htop 仓库的 `pl/` 目录值得一看，里面是对 6+ 平台进程接口的封装，对学跨平台 C 项目结构很有帮助

## 关联

- [[bat]] —— "彩色 cat 替代"；和 htop 同属 "终端体验现代化" 工具集，但走 Rust 重写路线
- [[fzf]] —— 命令行模糊查找；htop 没内置 fzf，但很多人 alias `htop` 后用 fzf 选要 attach 的进程组
- [[broot]] —— 把 `tree` 命令升级成交互式 TUI；和 htop 同样用 ncurses 思路做"目录版进程监控器"
- [[ripgrep]] —— Rust 写的现代 grep；与 htop 是同一类"老命令重做" 但实现策略不同（重写 vs 续写）
- [[dust]] —— `du` 的可视化替代；和 htop 同属"把数字表换成视觉条形图"的设计哲学
- [[fd]] —— `find` 替代；与 htop 同属"老命令配新交互"流派
- [[zoxide]] —— 智能 `cd`；同样靠"配置可分享、装一行回不去"建立黏性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bat]] —— bat — 现代 cat 替代
- [[bottom]] —— bottom — Rust 写的跨平台终端进程监控（widget 自由拼）
- [[broot]] —— broot — 把 tree 命令升级成会过滤、能 cd、显大小、看 git 的交互树
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[dust]] —— dust — du 的可视化替代，按目录大小排树状条形图
- [[fzf]] —— fzf — 命令行模糊查找
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[zoxide]] —— zoxide — 学会你常去哪的智能 cd

