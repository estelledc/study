---
title: ncdu — du 的交互式 TUI，扫一次就能在终端里上下键钻目录删大文件
来源: 'https://github.com/rofl0r/ncdu'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

ncdu 是 **Yorhel 用 C + ncurses 写的 `du` 替代品**——跑一次先把目标目录扫完，然后在终端里弹出一张可上下/左右键操作的表格：每行是一个子目录，按大小排好序，按回车钻进去看子目录内部，按 `d` 当场删除选中项，按 `q` 退出。

日常类比：

- **`du -sh *` 是把房间所有抽屉的总重量打印一张纸**——你看到客厅 50G，但要找出是哪个抽屉的什么东西占的，只能再敲一次 `du -sh 客厅/*`，敲到天荒地老
- **ncdu 是一个会扫描整套房子的机器人**——它扫完后给你一个可点击的房子地图，你点客厅 → 它打开客厅那一层，再点书柜 → 打开书柜那一层，看到一本 30G 的"假书"，按 `d` 当场扔掉

跑起来一行：

```bash
ncdu /var
```

终端切换到 ncurses 全屏模式，几秒到几十秒后给出一张交互表，从大到小排好。

## 为什么重要

- 不理解它，"服务器磁盘满了"这种事故只能靠 `du -sh /* 2>/dev/null | sort -h` 一层层手动钻，5 分钟的事拖成半小时
- 不理解它，分不清 [[duf]] / ncdu / [[btop]] / [[glances]] 这一组系统工具到底各管什么——它们看起来都是"彩色终端 TUI"，但**问题域完全不同**（下文展开）
- 不理解它，看不到一种 Unix 老派工具的设计套路：**一次性扫描 + 离线快照 + 纯键盘操作**，不依赖任何后台服务，连 root 都不用（只要能 `read` 目标目录）

## 核心要点

ncdu 的工作流可以拆成 **三步**：

1. **扫描**：递归 `stat()` 每一个文件/目录，记下大小、inode（用来识别硬链接，硬链接只算一次实际占用）。这一步等同 `du` 内部做的事，但结果**留在内存**而不是直接打印走人。

2. **ncurses 表格**：把内存里那棵目录树渲染成可滚动表格——当前层显示子项，按大小降序，列出 `[字节数] [路径]`，左侧用条形显示占比。键盘 `↑↓` 移动光标，`→` 或 Enter 进子目录，`←` 或 `<` 回上层。

3. **就地操作**：`d` 删除当前选中项（先弹确认）、`r` 重新扫描当前目录、`g` 切换显示模式（百分比/图形条/绝对值）、`?` 看快捷键、`q` 退出。

整个交互过程**不再访问磁盘**——只用第一步存在内存里的快照。这是 ncdu 比反复 `du -sh` 快的关键。

## 实践案例

### 案例 1：服务器磁盘满了，定位罪魁

```bash
ssh prod-host
sudo ncdu -x /
```

`-x` 表示"不要跨文件系统"，避免把 `/proc` `/sys` `/dev` 等伪挂载也扫进来（那是 [[duf]] 的活）。几秒后看到 `/var 60G`，按 → 钻进去，看到 `/var/log 45G`，再钻，发现 `nginx/access.log.1 40G` 没轮转——按 `d` 删掉，按 `q` 出来。事故 3 分钟内闭环。

### 案例 2：扫完拷回本地翻

```bash
# 服务器上扫完导出（zlib 压缩 JSON，几 MB）
ncdu -o /tmp/scan.json -x /

# 拷回本地
scp prod-host:/tmp/scan.json .

# 离线打开
ncdu -f scan.json
```

服务器只承担扫描那几秒，分析在本地慢慢看，不占线上 SSH 会话——这是 ncdu 的离线模式，运维场景特别好用。

### 案例 3：跳过 .git / node_modules

```bash
ncdu --exclude '.git' --exclude 'node_modules' ~/code
```

不然你看到的 90% 都是 git 对象和 npm 缓存，真正想找的"那个忘记删的 50G 视频文件"反而被淹没。也可以把规则写到文件里复用：

```bash
cat > ~/.ncdu-exclude <<'EOF'
.git
node_modules
.next
target
__pycache__
EOF

ncdu --exclude-from ~/.ncdu-exclude ~/code
```

### 案例 4：Docker host 磁盘满了

```bash
sudo ncdu -x /var/lib/docker
```

最常见的是 `overlay2/` 下某个停掉但没清理的容器层、或者 `volumes/` 下某个挂载卷写爆了。ncdu 一进去就一目了然，比 `docker system df` 看得更细——后者只到镜像/容器/卷的总量，ncdu 能直接钻到具体文件。

## 踩过的坑

1. **`d` 真删，没有回收站**——按错没救。安全做法：先 `q` 退出，用 `rm` 命令显式删；或者只用 ncdu 定位、用 shell 删除。

2. **超大目录扫得慢**——千万级文件的目录树会卡几分钟。对策：`-x` 限制单文件系统、`--exclude` 跳过常见垃圾、关键时刻用 `-o` 导出后台扫。

3. **NFS / SMB 挂载会卡死**——网络 stat 一个文件几十毫秒，乘以百万就是几小时。务必加 `-x` 把网络挂载隔离掉。

4. **硬链接只算一次实际占用**——和 `du` 默认行为一致。如果你想看"显示大小"（即每个硬链接都重复算一遍），按 `a` 切到 apparent size 模式。

5. **rofl0r fork vs Yorhel 原版**——5k stars 的 rofl0r/ncdu 是社区维护 fork，主要修构建/打包问题；功能上和原版 dev.yorhel.nl/ncdu 几乎一样，brew/apt 装哪个都行。

6. **首次扫描时不要按键**——扫描中按 `q` 会退出但不保留任何结果，按其他键可能触发未实现的状态。等到底部状态栏显示 `Done.` 再操作。

## 适用 vs 不适用场景

**适用**：

- 磁盘空间事故应急定位（"哪个目录吃了 50G"）
- 笔记本/服务器日常清理（缓存、日志、构建产物）
- 离线分析远程主机扫描结果（`-o` 导出 + `-f` 离线打开）

**不适用**：

- 看挂载点占用（`/` 多大、`/data` 多大）→ 用 [[duf]]，那是 `df` 替代
- 看实时系统状态（CPU/内存/进程/网络）→ 用 [[btop]] 或 [[glances]]，那是仪表盘类工具
- 持续监控磁盘增长趋势 → 需要 Prometheus + node_exporter，ncdu 是**一次性快照**
- GUI 用户 → macOS 用 GrandPerspective、Windows 用 WinDirStat，可视化更直观

## 它和 duf / btop / glances 的边界

| 工具 | 问题域 | 数据源 | 交互模型 |
|------|--------|--------|----------|
| [[duf]] | 挂载点占用（df 替代） | `/proc/mounts` + `statvfs` | 一次打印彩色表格，看完就走 |
| **ncdu** | 目录递归占用（du 替代） | 递归 `stat()` | 一次扫描 + 持续 TUI 钻树 |
| [[btop]] | CPU/内存/进程/网络实时 | `/proc` 高频轮询 | 持续刷新仪表盘 |
| [[glances]] | 多机系统资源汇总 | psutil + 可选 web/REST | 持续刷新 + 客户端服务端模式 |

记住四个字就行：**duf 看盘、ncdu 看树、btop 看快、glances 看群**。

## 学到什么

1. **一次扫描 + 内存快照 + TUI 操作** 是经典 Unix 工具的高效模式——比"每次都重新跑命令"快几十倍
2. **离线模式**（`-o` / `-f`）让 ncdu 适合远程运维：扫描在被检方、分析在审计方
3. **C + ncurses + 单二进制**：1990 年代的技术栈到今天还能拿 5k stars，因为它解决的"磁盘满了找罪魁"问题 30 年没变
4. **工具的边界很重要**：duf / ncdu / btop / glances 看起来都像"彩色 TUI"，混用会让你抓错维度

## 延伸阅读

- 官网：[dev.yorhel.nl/ncdu](https://dev.yorhel.nl/ncdu)（含 v1/v2 版本说明、changelog）
- rofl0r fork：[github.com/rofl0r/ncdu](https://github.com/rofl0r/ncdu)（5k stars，社区维护）
- man page：`man ncdu`（快捷键全列表）
- 替代品：[gdu](https://github.com/dundee/gdu)（Go 写、并发扫描更快）/ [dust](https://github.com/bootandy/dust)（Rust 写、纯命令行非 TUI）

## 关联

- [[duf]] —— df 的彩色表格替代，看挂载点占用；和 ncdu 互补（盘 vs 树）
- [[btop]] —— 系统资源实时仪表盘；和 ncdu 是"实时刷新 vs 一次性快照"两种 TUI 模式
- [[glances]] —— 多机系统监控；和 ncdu 是"持续看群体 vs 单次找单点"
- [[ripgrep]] —— 同样是"重写一个老 Unix 工具，加上现代默认值"的代表作
- [[fzf]] —— 同样是"键盘驱动的 TUI"，但 fzf 是过滤、ncdu 是钻树

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dua-cli]] —— dua-cli — Rust 写的并发 du 替代，按 i 进交互模式当场把大文件扔进废纸篓
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[gdu]] —— gdu — Go 写的并发 du 替代，单二进制扔到服务器扫满盘几秒钟出 TUI
