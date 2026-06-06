---
title: duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
来源: 'https://github.com/muesli/duf'
日期: 2026-05-30
子分类: 命令行工具
分类: CLI
难度: 初级
provenance: pipeline-v3
---

## 是什么

duf 是 **muesli 用 Go 写的 df 替代品**——在终端敲一下就出一张**彩色表格**，把磁盘按"本地盘 / 网络盘 / 特殊盘"自动分块，每块都对齐列、用颜色高亮使用率，并默认把 `tmpfs` / `devfs` 之类没人想看的伪文件系统藏起来。

日常类比：

- **df 是一份手写报表**——每列都对不齐，把家用硬盘和 docker 临时挂载点全堆在一起，你得用尺子比着读
- **duf 是同一份报表换成 Excel**——分了 sheet（local / network / special），每行染了颜色，使用率超 90% 的那行直接标红

跑起来一行：

```bash
duf
```

终端就出三张表：本地盘一张、网络盘一张、特殊盘一张，每张表都自带边框和颜色，使用率列会按 0-50% / 50-90% / 90-100% 染绿黄红。

## 为什么重要

- 不理解它，无法解释为什么 `df -h` 输出里总混着一堆 `tmpfs` / `devtmpfs` / `overlay`——这是 Linux 内核暴露给 `/proc/mounts` 的伪挂载，POSIX 时代根本没考虑过过滤
- 不理解它，分不清 [[duf]] 和 `ncdu` / `dust` 三者：duf 看**挂载点**占用、ncdu / dust 看**目录递归**占用，问题域完全不同
- 不理解它，看不出 procs / btop / glances / bandwhich / duf 这一波系统工具的共同套路：**单二进制 + 跨平台 + 表格 / 仪表盘 + 默认彩色 + 不依赖 root 之外的服务**
- 不理解它，调试 "为什么 df 显示 100% 但实际只用了 60%"（Linux 文件系统保留块）时只能瞎查——duf 把 reserved 字段单独列出来

## 核心要点

duf 一句话：**调系统 syscall 拿挂载列表 + 按 fs 类型分组 + 用 go-pretty 渲染彩色表格**。三步拆开：

1. **拿挂载列表**：每个平台走不同 syscall——Linux 读 `/proc/mounts`、macOS 调 `getmntinfo()`、Windows 调 `GetLogicalDrives()` + `GetVolumeInformation()`，BSD 也有自己的接口。这部分被 `golang.org/x/sys` 封装抹平。
2. **按 fs 类型分组**：拿到的每条挂载有 `Fstype` 字段（`ext4` / `apfs` / `nfs` / `tmpfs` ...）。duf 内部维护一张白名单：`local`（ext4 / xfs / apfs / ntfs / btrfs ...）/ `network`（nfs / smb / cifs ...）/ `fuse` / `special`（tmpfs / devfs / overlay ...）。默认只显示前两类，`--all` 才全显。
3. **渲染彩色表格**：用 [`go-pretty`](https://github.com/jedib0t/go-pretty) 这个库画表格——它已经处理了"列宽自适应 / 边框 Unicode 字符 / 颜色码"，duf 只需要喂行数据。颜色靠 [`termenv`](https://github.com/muesli/termenv) 检测终端是 truecolor / 256 色 / 单色。

整个二进制约 **5 MB**，无运行时依赖，brew / apt / pacman 一键装。

## 实践案例

### 案例 1：日常看本地盘

```bash
duf
```

输出（简化）：

```
╭─────────────────────────────────────────────────────────────╮
│ 2 local devices                                             │
├──────────┬──────┬──────┬──────┬───────────────────┬─────────┤
│ MOUNTED  │ SIZE │ USED │ AVAIL│ USE%              │ TYPE    │
├──────────┼──────┼──────┼──────┼───────────────────┼─────────┤
│ /        │ 460G │ 312G │ 148G │ [#######....] 67% │ apfs    │
│ /System  │ 460G │ 11G  │ 449G │ [#..........]  2% │ apfs    │
╰──────────┴──────┴──────┴──────┴───────────────────┴─────────╯
```

注意 USE% 列那条进度条是 ASCII 画的，颜色随百分比变化——67% 黄、92% 红、12% 绿。

### 案例 2：脚本里要 JSON

```bash
duf --json | jq '.[] | select(.type=="local") | {mp:.mount_point, used:.used}'
```

`--json` 输出每个挂载的所有字段（驼峰命名），适合 pipe 给监控脚本。注意字段是 `mountPoint` / `used` / `total` / `type`，不是 snake_case，jq 用错会拿 null。

### 案例 3：只看网络盘

```bash
duf --only network
```

排查 NFS / SMB 是否挂掉时省得自己写 `mount | grep nfs`。

### 案例 4：和同类工具的位置感

| 工具 | 看的是什么 | 替代了谁 | 同生态 |
|------|------------|----------|--------|
| [[duf]] | 挂载点 / 设备占用 | df | go-pretty 表格 |
| dust | 目录递归大小 | ncdu | Rust 系 |
| [[procs]] | 进程列表 | ps | Rust 系 |
| [[btop]] | CPU/内存/磁盘 IO 实时仪表盘 | top / htop | C++ 自绘 TUI |
| [[glances]] | 全维度系统监控 + Web | top + iftop + iostat | Python plugin |
| [[bandwhich]] | 按进程实时带宽 | nethogs / iftop | Rust 系 |

duf 在这张图里是**磁盘静态视角**——只回答"现在每个挂载点用了多少"，不画曲线、不实时刷。

## 踩过的坑

1. **macOS firmlinks 显示成多条**：从 macOS Catalina 起 `/` 和 `/System/Volumes/Data` 是同一份 APFS 数据但挂两次，duf 默认会列两行，需要 `--hide-fs apfs --only local` 之类的组合或干脆 `--hide-mp /System/Volumes/Data`
2. **Linux 容器里挂载点污染**：`docker exec` 进去跑 duf 会看到宿主机一堆 overlay 临时挂载，加 `--only local` 也没用——根因是容器内 `/proc/mounts` 把外面也暴露了，需要 `--hide-mp /var/lib/docker/*`
3. **Windows 网络盘断线卡住**：`GetVolumeInformation()` 调用对断开的 `Z:\` 会等几秒超时，duf 没有并发去查每个盘——表现是程序"卡住"几秒。社区有 issue 但没修
4. **JSON 字段是驼峰不是 snake_case**：`--json` 输出 `mountPoint` 而不是 `mount_point`，写 jq 脚本时容易 typo 拿到 null
5. **看到 100% 但还能写**：Linux ext4 默认给 root 留 5% reserved blocks，df / duf 都把这部分算进 used——`tune2fs -m 0` 可以释放，duf 的 `Used` 列对应的也只是"表面占用"

## 适用 vs 不适用场景

**适用**：

- 日常看 "现在哪个盘快满了"——彩色 + 自动分组省心
- 写运维脚本要 JSON 拿磁盘元数据（`--json`）
- 跨平台脚本（macOS / Linux / Windows 都装一个 duf 而不是处理 df 三种参数语法）
- 排查容器 / 多挂载点环境哪个 mount 异常

**不适用**：

- 看某个目录用了多少（用 `dust` / `ncdu`）
- 实时监控磁盘 IO 速率（用 [[btop]] / `iotop`）
- 分析"哪个文件最大"——duf 不递归
- 极简服务器没装彩色终端 / 没字体——`duf --style unicode` 也可能糊；这种环境直接 `df -h` 更稳

## 历史小故事（可跳过）

- **2020-09**：muesli（Christian Muehlhaeuser，charm.sh 项目核心作者之一）受不了 `df -h` 输出全是黑白挤一堆，业余开了 duf 仓库，第一版只有 ~600 行 Go
- **2021**：加入 `--json` / `--hide` / `--only` / `--output` 等过滤，被 Hacker News 推上热门
- **2022**：stars 破万，进入 r/commandline 年度推荐
- **2023**：Homebrew core / Debian sid / Arch community 主仓收录，成为 macOS / Linux 默认可装
- **2024 起**：维护节奏放缓，进入 stable 状态——磁盘列表这事变化少，不需要持续迭代

## 学到什么

1. **POSIX 时代的工具默认输出风格已经过时**——df / ps / top 都是 1970-80 年代为电传打字机设计的，2020 年代把它们换成彩色对齐表格几乎是必然
2. **Go 写跨平台 CLI 的天花板很高**：单二进制 + 自带跨平台 syscall 封装（`golang.org/x/sys`），加上 termenv / go-pretty 这些库，十几 KB 代码就能做出 brew / apt 都收的工具
3. **"分组 + 默认隐藏"是好 UX 的本质**——df 把所有挂载塞一起是因为 1979 年没人想到会有 docker / tmpfs；duf 默认隐藏伪挂载等于在做信息过滤
4. **过滤参数比看似花哨的功能更重要**：`--only` / `--hide` / `--hide-fs` / `--hide-mp` 四个维度的组合让 duf 在容器 / NFS / firmlink 等真实场景能用

## 延伸阅读

- 仓库 README：[muesli/duf](https://github.com/muesli/duf) — 截图很多，10 分钟看完
- charm.sh 系列：[termenv](https://github.com/muesli/termenv) / [lipgloss](https://github.com/charmbracelet/lipgloss) —— Go 终端样式生态全家桶
- 表格库：[go-pretty](https://github.com/jedib0t/go-pretty) —— duf 表格的渲染引擎
- 对比阅读：`man df` —— 看 50 年前的输出风格，体会 duf 改了什么

## 关联

- [[procs]] —— ps 替代（Rust），同样是"老 CLI 加彩色表格"的现代化思路
- [[btop]] —— top 替代（C++），把仪表盘做到极致；duf 是它的"磁盘静态版"
- [[glances]] —— Python 全维度监控，也包含磁盘但更重；duf 是单点轻量版
- [[bandwhich]] —— 网络流量按进程分析（Rust）；和 duf 拼成"系统资源 CLI 四件套"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[dua-cli]] —— dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
- [[glances]] —— Glances — Python 写的全栈系统监控（终端 + Web + REST + 远程）
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[procs]] —— procs — ps 的现代替代，彩色 + 树视图 + 多列搜索

