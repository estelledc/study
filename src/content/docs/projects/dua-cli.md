---
title: dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
来源: 'https://github.com/Byron/dua-cli'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

dua-cli 是 **Byron 用 Rust 写的 `du` 替代品**——把"递归算目录大小"这件事改成**多核并发**跑，扫得比 GNU du 快几倍；再附送一个交互式 TUI（`dua i`），可以在终端里上下键钻目录、标记多个文件、一键扔进系统废纸篓（删错能从 Trash 还原）。

日常类比：

- **GNU `du -sh *` 是一个老员工拎着秒表，从第一个抽屉量到最后一个抽屉，一个一个量**——CPU 8 核它只用 1 核
- **dua 是 8 个员工同时开工**——每个抽屉派一个，量完汇总；并发让多核 SSD 不再被单线程瓶颈拖死
- **`dua i` 是这 8 个员工量完后给你一张可点击的家具地图**——你点客厅 → 点书柜 → 看到 30G 的"假书"，按 `d` 把它扔到废纸篓，按错了从废纸篓拖回来

跑起来一行：

```bash
dua            # 当前目录子项大小排序
dua i /var     # 进交互模式扫 /var
```

## 为什么重要

- 不理解它，磁盘满事故只能用 `du -sh /* | sort -h` 单线程死等，机器 16 核它只用 1 核——**dua 在多核 SSD 上能直接快 5-10 倍**
- 不理解它，分不清 [[ncdu]] / dua / [[duf]] / [[btop]] 这一组 TUI 工具到底各管什么——它们看起来都是"彩色终端 TUI"，但**问题域完全不同**（下文展开）
- 不理解它，错过 Rust 在系统工具里的一个典型范式：**用 jwalk + rayon 把"目录遍历"这种 IO 密集任务并发化**，老 C 工具几乎没人重做这一步

## 核心要点

dua 的工作流可以拆成 **三步**：

1. **并发扫描**：用 `jwalk` crate（基于 `rayon` 的工作窃取线程池）递归走目录树，每个子目录派一个任务；`statx`/`fstatat` 直接读元数据，结果留在内存。多核 + SSD 时几乎线性扩展。

2. **聚合 + 排序**：扫完后按 `(dev, inode)` 去重硬链接（和 du/ncdu 一致），按字节降序排好。可选 `--apparent-size` 切到"逻辑大小"（每个硬链接都算一次）。

3. **TUI 或一次性打印**：默认打印当前层（类似 `du -sh *`）；`dua i` 进入 ratatui + crossterm 渲染的交互界面，vim 键位（hjkl/g/G），`d` 标记+移到 Trash，`Ctrl+D` 永久删除，`q` 退出。

整个交互过程**不再访问磁盘**——只用第一步存在内存里的快照。这一点和 ncdu 一样，但 dua 把第一步的速度榨干了。

## 实践案例

### 案例 1：服务器磁盘满，5 秒定位

```bash
ssh prod-host
sudo dua i /
```

8 核机器扫 `/` 几秒到几十秒（同样磁盘 ncdu 单线程要等几分钟）。看到 `/var/log/nginx/access.log.1 40G`，按 `d` 加到删除集，按 `Ctrl+D` 永久删（生产环境 `~/.Trash` 通常没配，按 `d` 也会回退到永久删）。事故 1 分钟闭环。

### 案例 2：本地清 node_modules

```bash
cd ~/code
dua i
```

进 TUI 后按 `→` 钻到某项目，看到 `node_modules 1.2G` `.next 800M` `target 4G`——挨个标记 `d`，回根目录确认全选，按 `Ctrl+D` 一次清空。比 `find . -name node_modules -exec rm -rf {} +` 安全得多，因为删之前你能看见每一项。

### 案例 3：JSON 输出接 CI

```bash
dua --format=json-lines ~/code/myrepo > sizes.jsonl
```

每行一个 JSON 对象（路径 + 大小）。CI 把这个跟昨天的 `sizes.jsonl` diff，构建产物突增就报警——`dua` 单纯当 du 用，不进 TUI 也很顺手。

### 案例 4：和 ncdu 数据共用

```bash
# dua 算总大小，速度优先
dua /var

# ncdu 离线扫描（dua 没有 -o 导出），运维场景仍用 ncdu
ncdu -o /tmp/scan.json /var
```

dua 不支持 `-o` 离线导出快照，所以"扫描在被检方、分析在审计方"这种场景仍要回 ncdu。两者并存而不替代。

## 踩过的坑

1. **`d` 是移到 Trash，`Ctrl+D` 是永久删除**——生产环境通常没 `~/.Trash`，`d` 会自动 fallback 到永久删除。按之前看清下方状态栏。

2. **NFS / SMB 网络挂载并发反而慢**——网络 stat 的瓶颈是 RTT 不是 CPU，多线程只会增加锁竞争。这种盘老老实实用 ncdu 单线程。

3. **没有离线快照模式**——`Ctrl+C` 中断后什么都不留。需要"远程扫完拷回本地分析"用 ncdu 的 `-o`/`-f`。

4. **默认硬链接去重**——和 du/ncdu 一致。想看每个硬链接都算一次，加 `--apparent-size`（占用变大是正常的）。

5. **Windows 下 Trash 不稳**——某些版本退化为永久删，重要文件先备份。

6. **超大目录（>千万文件）内存吃紧**——dua 把整棵树留内存，不像 du 流式打印。这种规模考虑分目录扫。

## 适用 vs 不适用场景

**适用**：

- 多核 + SSD 机器上的磁盘清理（速度比 ncdu 高一个量级）
- 笔记本清缓存（node_modules / target / .venv / __pycache__）
- CI 里把仓库子目录大小当 metrics 上报（`--format=json-lines`）
- macOS 用户日常清理（`d` 进废纸篓比 ncdu 的 `d` 直接 unlink 安全）

**不适用**：

- 看挂载点占用（`/` 多大、`/data` 多大）→ 用 [[duf]]，那是 `df` 替代
- 看实时系统状态（CPU/内存/进程/网络）→ 用 [[btop]]，那是仪表盘
- 远程扫完拷回本地离线分析 → 用 [[ncdu]] 的 `-o`/`-f`，dua 没有这功能
- NFS / SMB / 慢盘 → 并发优势消失，用 ncdu

## 它和 ncdu / duf / btop 的边界

| 工具 | 问题域 | 数据源 | 速度模型 |
|------|--------|--------|----------|
| **dua-cli** | 目录递归占用（du 替代） | 并发 `statx` + jwalk | 多核线性扩展 |
| [[ncdu]] | 目录递归占用（du 替代） | 单线程递归 `stat` | 单核 IO bound |
| [[duf]] | 挂载点占用（df 替代） | `/proc/mounts` + `statvfs` | 一次打印 |
| [[btop]] | CPU/内存/进程/网络实时 | `/proc` 高频轮询 | 持续刷新 |

记四个字：**dua 看树（快）、ncdu 看树（稳）、duf 看盘、btop 看快**。dua 和 ncdu 是"同问题域不同实现"，前者赢在并发与 Trash，后者赢在离线快照与 30 年生态。

## 历史小故事（可跳过）

- **2018 年前后**：Sebastian Thiel（Byron）用 Rust 写 dua-cli，核心引擎拆成同作者的 `jwalk`（基于 rayon 的并发目录遍历）。
- **动机**：GNU `du` 单线程扫大盘太慢；ncdu 交互好但扫描同样单核。目标是"扫得快 + 能进 TUI 删"。
- **之后**：TUI 从早期自研迁到 ratatui；`--format=json-lines` 让它也能当 CI metrics 工具，不只是交互清理器。

## 学到什么

1. **老 Unix 工具加并发就是新工具**——`du` 1971 年至今几乎没动过，dua 只是把"递归 stat"这一步派给线程池就重新拿了 4k stars
2. **jwalk + rayon 是 Rust 系统工具的标准并发栈**——同样套路也用在 ripgrep / fd / sd 等工具里
3. **删除操作要给安全网**——`d → Trash` + `Ctrl+D → permanent` 的两段式比 ncdu 单 `d` 直接 unlink 更友好
4. **工具的边界很重要**：dua / ncdu / duf / btop 看起来都是"彩色 TUI"，混用会让你抓错维度

## 延伸阅读

- 仓库：[github.com/Byron/dua-cli](https://github.com/Byron/dua-cli)（README 含基准对比图）
- crate：[crates.io/crates/dua-cli](https://crates.io/crates/dua-cli)
- 并发遍历库：[github.com/Byron/jwalk](https://github.com/Byron/jwalk)（同作者，dua 的核心引擎）
- 替代品：[gdu](https://github.com/dundee/gdu)（Go 写、并发 TUI，dua 的直接竞品）/ [dust](https://github.com/bootandy/dust)（Rust 写、纯命令行树状输出）

## 关联

- [[ncdu]] —— C + ncurses 单线程版本，dua 的直接前辈；并发 vs 离线快照各有所长
- [[duf]] —— df 的彩色表格替代，看挂载点；和 dua 互补（盘 vs 树）
- [[btop]] —— 系统资源实时仪表盘；和 dua 是"持续刷新 vs 一次性快照"两种 TUI 模式
- [[ripgrep]] —— 同样是"重写老 Unix 工具加现代默认值 + 并发"的代表作
- [[fd-find]] —— sharkdp 的 Rust `find` 替代；和 dua 同属「老 Unix 工具 + 并发重写」范式，但作者不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep

