---
title: 'gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI'
来源: 'https://github.com/dundee/gdu'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

gdu 是 **Daniel Milde（dundee）用 Go 写的 `du` 替代品**——把"递归算目录大小"这件事改成**多 goroutine 并发**跑，针对 SSD 优化；扫完直接弹一个 tcell 渲染的 TUI，键盘上下钻目录、按 `d` 删大文件、按 `o` 导出和 ncdu 兼容的 JSON 快照。整个程序编出来是**一个静态二进制**，扔到任何 Linux 服务器都能跑，不依赖 glibc 版本、不要 ncurses 库。

日常类比：

- **GNU `du -sh *` 是一个老员工拎秒表从第一个抽屉量到最后一个抽屉**——CPU 8 核它只用 1 核，SSD 的并行 IO 完全浪费
- **gdu 是 8 个员工带着无线对讲机同时开工**——每个抽屉派一个 goroutine，量完汇总；Go runtime 内置的调度器替你管线程池
- **导出 JSON 的特殊本事**：gdu 量完后能把"家具地图"写成一张和 ncdu 一模一样的纸，所以你可以**用 gdu 在 SSD 服务器上飞快扫，再用 ncdu 在本地慢慢翻**——两个工具在数据格式上握手了

跑起来一行：

```bash
gdu /var          # 进 TUI 扫 /var
gdu -n /var       # 不进 TUI，只打印 top-level 大小（脚本友好）
gdu -o scan.json /var   # 扫完导出 ncdu 兼容 JSON
```

## 为什么重要

- 不理解它，"服务器磁盘满"事故只能用 `du -sh /* | sort -h` 单线程死等，16 核机器它只用 1 核——**gdu 在 SSD 上能直接快 5-10 倍**
- 不理解它，分不清 [[ncdu]] / [[dua-cli]] / gdu / [[duf]] 这一组工具到底各管什么——它们看起来都是"彩色 TUI"，但**问题域和优势完全不同**（下文展开）
- 不理解它，错过 Go 在系统工具里的一个典型范式：**单静态二进制 + goroutine 调度器**让"并发遍历目录"几乎不用写线程代码——和 Rust 的 jwalk + rayon 思路一致但门槛更低

## 核心要点

gdu 的工作流可以拆成 **三步**：

1. **并发扫描**：默认按 GOMAXPROCS 派 goroutine，每个子目录一个任务；用 `os.Lstat` 读元数据，结果留内存。SSD 上几乎线性扩展；HDD 反而被随机寻道拖慢，要加 `--sequential` 退化成单线程。

2. **聚合 + 排序**：扫完后按 `(dev, inode)` 去重硬链接（和 du/ncdu/dua 一致），按字节降序。可选 `-a / --apparent-size` 切成"逻辑大小"（每个硬链接都算一次）。

3. **TUI 或一次性打印**：默认进入 tcell + 自己实现的渲染层（vim 键位 `hjkl`、`d` 删、`r` 重扫、`o` 导出 JSON、`q` 退出）；`-n` 跳过 TUI 直接打印当前层（脚本/CI 友好）。

整个交互过程**不再访问磁盘**——只用第一步存在内存里的快照。这一点和 ncdu/dua 一致，但 gdu 把"导出兼容快照"和"持久化到数据库"两件事做到了别人没做的程度。

## 实践案例

### 案例 1：服务器磁盘满，5 秒定位 + 远程协作

```bash
ssh prod-host
sudo gdu -o /tmp/scan.json -x /
scp prod-host:/tmp/scan.json .
ncdu -f scan.json    # 本地用 ncdu 打开 gdu 的导出
```

`-o` 的输出格式**就是 ncdu 自己的 JSON schema**，所以你可以扫描走 gdu（快），分析走 ncdu（30 年生态、UI 顺手）。这是 gdu 比 dua-cli 多出来的能力——dua 没有离线导出。

### 案例 2：本地清 node_modules

```bash
cd ~/code
gdu
```

进 TUI 后按 `→` 钻到某项目，看到 `node_modules 1.2G` `target 4G` `.next 800M`，按 `d` 一个个删（gdu 的 `d` 是直接 unlink，不进 Trash，**按错没救**）。和 dua 的 `d → Trash` + `Ctrl+D → permanent` 两段式不同，gdu 走 ncdu 路线，单段直删。

### 案例 3：CI 把目录大小当 metrics

```bash
gdu -n -o sizes.json --no-progress ~/code/myrepo
jq '.[1] | .[1:] | map({name:.name, size:.asize})' sizes.json
```

`-n` 跳 TUI、`--no-progress` 关进度条；输出兼容 ncdu schema，CI 解析后跟昨天 diff，构建产物突增就报警。dua 的 `--format=json-lines` 只是同问题的另一种 schema。

### 案例 4：钻进 zip/tar 看内层

```bash
gdu --archive-browsing /backups
```

进 TUI 后看到 `archive.tar.gz 800M`，按 `→` 直接进**压缩包内部**当目录看——这是 ncdu/dua 都没做的事，对运维清备份特别顺手。

### 案例 5：用 SQLite 持久化大目录扫描

```bash
gdu --db scan.sqlite /data              # 扩展名决定引擎：.sqlite → SQLite
gdu -r --db scan.sqlite                 # -r/--read-from-storage：下次直接读，不重扫
# BadgerDB 写法：gdu --db scan.badger /data
```

千万级文件扫一次几分钟，`--db` 按扩展名把结果落到 SQLite（`*.sqlite`）或 BadgerDB（`*.badger`），下次用 `-r` 跳过扫描直接渲染 TUI——ncdu/dua 都没有这种"持久化分析快照"的能力。注意不要写成随意的 `.db`：官方靠后缀选存储引擎。

## 踩过的坑

1. **`d` 是真删（直接 unlink），不进 Trash**——和 ncdu 一致、和 dua 不同。生产服务器按之前先 `q` 退出，用 `rm` 显式删更安全。

2. **NFS / SMB / 慢盘上并发反而慢**——网络 stat 瓶颈是 RTT 不是 CPU，多 goroutine 只增加锁竞争。务必加 `--sequential`，或者直接换 ncdu。

3. **超大目录（千万级文件）内存吃紧**——和 dua 一样把整棵树留内存。对策：用 `--db` 落 SQLite 不全留内存；或者分子目录扫。

4. **`-x` 和 `--no-cross` 是同一件事**——别两个都加。和 ncdu/dua 的 `-x` 语义一致：不跨挂载点，避免把 `/proc` `/sys` 也扫进来。

5. **Go runtime 冷启动比 C 慢**——小目录（< 10k 文件）你感觉不到 gdu 的优势，反而 ncdu 跑得更快。gdu 真正发力是在百万级文件 + 多核 SSD。

6. **`-o` 输出可被 ncdu 读但不完全等价**——某些边缘元数据（`hlnkc`、错误标志）的兼容性是 best-effort，重要审计场景以 ncdu 原生扫描为准。

## 适用 vs 不适用场景

**适用**：

- 多核 + SSD 服务器/笔记本上的磁盘清理（速度比 ncdu 高一个量级）
- 需要"扫描在远端、分析在本地"的运维场景（`gdu -o` + `ncdu -f`）
- CI 里把目录大小当 metrics 上报（`-n` + `-o`）
- 千万级文件需要持久化快照（`--db`）

**不适用**：

- 看挂载点占用（`/` `/data` 多大）→ 用 [[duf]]，那是 `df` 替代
- NFS / SMB / 慢盘 → 并发优势消失，用 [[ncdu]] 单线程
- macOS 用户想要"删错能从废纸篓拖回来"→ 用 [[dua-cli]] 的 `d → Trash`
- 看实时系统状态（CPU/内存/进程）→ 用 [[btop]]，不是磁盘工具

## 它和 ncdu / dua-cli / duf 的边界

| 工具 | 语言 | 并发 | 离线导出 | Trash 安全网 | 持久化 DB |
|------|------|------|----------|--------------|-----------|
| **gdu** | Go | 是 | 是（ncdu 兼容） | 否 | 是（SQLite/BadgerDB） |
| [[ncdu]] | C/Zig | 否 | 是（自家 JSON） | 否 | 否 |
| [[dua-cli]] | Rust | 是（jwalk+rayon） | 否 | 是 | 否 |
| [[duf]] | Go | N/A | 否 | N/A | N/A |

记一句话：**gdu = 并发扫 + ncdu 兼容快照 + 可选 SQLite 持久化**，是 ncdu 的"工程加强版"，dua 的"运维兼容版"。三者并存而不替代。

## 学到什么

1. **Go 的"并发零门槛 + 单静态二进制"组合**让系统工具的部署成本几乎为零——这是 gdu 在 ncdu/dua 之外能拿 4k stars 的关键
2. **数据格式兼容是工具协作的最高诚意**——gdu `-o` 输出能被 ncdu `-f` 读，让两个工具在同一条运维链路上分工
3. **持久化快照（`--db`）开了一扇新窗**——磁盘分析不再是"一次性扫描"，可以变成"持续追踪 + diff"
4. **工具的边界很重要**：gdu / ncdu / dua-cli / duf 看起来都是"彩色 TUI"，混用会让你抓错维度

## 延伸阅读

- 仓库：[github.com/dundee/gdu](https://github.com/dundee/gdu)（README 含 hyperfine 基准对比）
- 作者博客：[dundee.github.io/gdu](https://dundee.github.io/gdu/)（设计 rationale）
- man page：`man gdu`（完整 flag 列表）
- 替代品：[[ncdu]]（C/Zig 单线程稳）/ [[dua-cli]]（Rust 并发 + Trash）/ [dust](https://github.com/bootandy/dust)（Rust 命令行树状）

## 关联

- [[ncdu]] —— C/Zig 单线程版本，gdu 的直接前辈；gdu 的 `-o` JSON 格式来自这里
- [[dua-cli]] —— Rust 并发版本，gdu 的同代竞品；并发思路一致，差在 Trash 与离线导出
- [[duf]] —— df 的彩色表格替代，看挂载点；和 gdu 互补（盘 vs 树）
- [[ripgrep]] —— 同样是"重写老 Unix 工具加并发"的代表作，但走 Rust 路线
- [[fd-find]] —— Rust 系统工具典范，和 gdu 在并发遍历目录的设计上同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[btop]] —— btop — bashtop 三代 C++ 版，五面板一屏的彩色资源监控器
- [[dua-cli]] —— dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[ncdu]] —— ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep

