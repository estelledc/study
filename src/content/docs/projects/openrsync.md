---
title: Openrsync — OpenBSD 团队的 rsync 实现
来源: https://github.com/kristapsdz/openrsync
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 是什么

**Openrsync** 是 OpenBSD 开发者 Kristaps Dzonsons 用 C 写的 **rsync 协议实现**，自 OpenBSD 6.5 起进入系统基座。它和 Samba 维护的 GPL 版 [[rsync]] 说同一种「方言」——**协议版本 27**——但许可证是 **ISC（BSD 风格）**，代码体量约一万行，安全模型围绕 OpenBSD 的 `pledge(2)` 与 `unveil(2)` 设计。

日常类比：

- 经典 **rsync** 像一辆功能齐全的搬家卡车：能挂拖车、能越野、能跑长途，选项面板密密麻麻， GPLv3 许可证也意味着「整车设计图」必须按 GPL 规则分享。
- **Openrsync** 像同一城市公交系统采购的**合规中巴**：只跑固定线路（常用同步场景），车门和窗户在出厂时就焊死了能开多大（沙箱限制文件系统访问），司机能按的按钮更少，但**审计员一眼能看完整车 wiring**。

最小可用同步：

```bash
# 把本地 src/ 推到远程 backup/，保留时间戳以便下次增量
openrsync -rt ./src/ user@host:backup/
```

远程拉取到本机：

```bash
openrsync -rt user@host:src/bar user@host:src/baz ./dest/
```

注意：Openrsync **只支持 rsync 命令行的一个子集**；和上游 rsync 混用时，应选两边都认识的 flag（见 `openrsync(1)`）。

## 为什么重要

不理解 Openrsync，下面几件事很难讲清楚：

- 为什么 OpenBSD 敢把 rsync **从 ports 换成自带实现**——基座工具要可审计、许可证要宽松、攻击面要可控
- 为什么 RPKI 验证器 **rpki-client** 会顺带资助 Openrsync——运营商要从公网拉路由证书快照，需要可信任的增量同步通道
- 为什么说「rsync 算法」和「rsync 这个程序」是两回事——算法是 Tridgell 的滚动校验块论文；Openrsync 是**另一份独立实现**，用事件循环替代了 GPL 版的 generator 子进程
- 为什么在 Linux 上很多人仍装 Samba rsync，而在 OpenBSD 上默认就是 `openrsync`——**生态选择 ≠ 协议垄断**

## 核心要点

### 1. 角色：Sender 与 Receiver

一次同步永远是一个 **Sender（发送方，管源文件）** 和一个 **Receiver（接收方，管目标目录）** 配对：

| 命令形态 | 客户端角色 | 远端 `--server` 角色 |
|----------|------------|----------------------|
| `openrsync local/ host:dest/` | Sender，推数据 | Receiver |
| `openrsync host:src/ local/` | Receiver，拉数据 | Sender |

规则：**源和目标不能同时是 remote**——不能 `hostA:foo hostB:bar` 直连双远端（GPL rsync 也这样限制）。

### 2. 会话拓扑：Client / Server 进程

你敲的那条 `openrsync` 是 **client**。若路径里带 `host:`，client 会通过 **SSH**（默认 `-e ssh`）在远端拉起 **server**：

```text
openrsync -rt ./src/ user@host:backup/
        │
        ├─ client（本机）：读本地 src，当 sender
        └─ ssh 远端执行：openrsync --server --sender . backup/
                              └─ server（远端）：当 receiver
```

若走 **rsync 守护进程**，URL 形如 `rsync://host/module/path` 或 `host::module/path`，握手阶段走 **rsyncd(5)** 文本协议，再进入 **rsync(5)** 二进制协议。

### 3. 文件列表与块交换（Block exchange）

算法主干（Andrew Tridgell & Paul Mackerras 的 rsync 论文）：

1. **Sender 生成文件列表**（路径、模式、mtime 等元数据），双方按路径字典序排序，之后可用下标指代文件。
2. **Receiver 遍历列表**，对每个文件决定要不要更新：
   - **符号链接 / 目录**：多半靠元数据直接建好，不向 sender 要块。
   - **普通文件**：若大小 + mtime 已一致（除非 `-I` 忽略时间），跳过。
3. 需要更新时，Receiver 把文件切成固定大小的 **block**（块大小 ≈ `ceil(sqrt(filesize))`，最小 700 字节，再向上取 8 的倍数），对每块算 **快哈希（Adler-32 型，4 字节）** 和 **慢哈希（MD4，16 字节）**，发给 Sender。
4. Sender 在源文件上滑动窗口匹配这些哈希；匹配到的块只发「块编号」，匹配不到的间隙发**原始字节流**。
5. Receiver 按指令拼出目标文件，最后双方做 **整文件 MD4** 校验。

这就是「只传 diff」的魔法：**广域网上传的是块索引 + 少量新字节**，不是整文件重传。

### 4. Openrsync 相对 GPL rsync 的架构差异

| 维度 | GPL rsync | Openrsync |
|------|-----------|-----------|
| Receiver 内部 | receiver + **独立 generator 子进程**（`fork`） | **单进程 + 事件循环** |
| 并发模型 | 多进程管道 | uploader / downloader 协程式状态机 |
| 安全 | 依赖部署习惯 | **pledge** 限制 syscall，**unveil** 限制可见目录树 |
| 协议文档 | 社区 wiki / 源码 | 自带 **rsync(5)**、**rsyncd(5)** man 页 |

Receiver 同时要 **上传块哈希** 和 **接收写入数据**，Openrsync 在 `uploader.c` / `downloader.c` 里用事件循环交错处理，避免 GPL 版那种「一个进程专门生成请求、另一个专门写盘」的 fork 模型。

### 5. 协议与数据格式要点

- 二进制帧：**小端序**。
- 多路复用：传输包外再套一层 **multiplexing envelope**（见 `rsync(5)`）。
- 校验和类型：**long（慢）**、**short（快）**、**whole-file** 三种。
- 服务端模式用 `arc4random` 播种 MD4，而不是 `time()`，降低可预测性。

## 实践案例

### 案例 1：日常备份（archive 语义）

`-a` 等价于 `-Dgloprt`：递归、符号链接、权限、时间戳等一起带上，适合镜像一台开发机的主目录子树：

```bash
#  dry-run 先看会传什么
openrsync -anv ~/Projects/ user@backup.internal:archive/Projects/

# 确认无误后正式同步
openrsync -av --delete ~/Projects/ user@backup.internal:archive/Projects/
```

**逐 flag 解释**：

- `-a` / `--archive`：常用「整包归档」 shorthand
- `-n`：不写字节，只打印计划（和 GPL rsync 一样）
- `-v`：verbosity；多叠几次能看到每个文件的块级细节
- `--delete`：目标有、源没有的条目删掉——**镜像语义**，用前务必想清楚

### 案例 2：与上游 rsync 互通（显式指定远端程序）

远端默认 PATH 里若是 `rsync` 而不是 `openrsync`，本机 Openrsync 可以强制远端也跑 Openrsync：

```bash
openrsync -rt --rsync-path=openrsync ./build/ user@host:/var/www/release/
```

反过来的场景——本机只有 Openrsync，对端是经典 rsync 守护进程：

```bash
openrsync -rt --port=873 rsync://mirror.example.com/module/path/ ./local-mirror/
```

**互通铁律**：只用 **两边 man 页都列出** 的选项；Openrsync 不支持 `--compress`、`-z` 等 GPL 版大量扩展 flag。

### 案例 3：rsyncd 握手在干什么（读懂协议层）

连接 `rsync://host/module` 时，先走一段 **明文行协议**（`rsyncd(5)`），再切到二进制 `rsync(5)`。客户端大致发送：

```text
module_name\n
@RSYNCD: 27\n
--server\n
--sender\n
-r\n
-t\n
.\n
path1\n
path2\n
\n
```

服务端回 `@RSYNCD: OK` 并给出 checksum seed 后，**multiplexing 开启**，后续就是块交换。Openrsync 把这套写进 man 页，对想写「自己的 rsync 客户端」的人很友好。

### 案例 4：排除规则与体积门槛

```bash
openrsync -rt \
  --exclude='*.o' \
  --exclude='.git/' \
  --max-size=100m \
  ./artifact/ user@host:incoming/
```

`--exclude-from=file` 可维护复杂规则；`--min-size` / `--max-size` 支持 `scan_scaled(3)` 风格后缀（如 `10M`）。

## 踩过的坑

1. **选项超集幻觉**：习惯了 `rsync -avz --progress` 的人，在 Openrsync 上会直接报错或静默缺功能。**先查 `openrsync(1)`**，不要肌肉记忆 GPL 版。

2. **时间戳与二次同步**：man 页示例反复强调加 `-t`：若目标 mtime 变成「同步时刻」，下次会把**同一文件**再算一遍块哈希。备份脚本里 `-t` 几乎是默认项。

3. **`--delete` 方向搞反**：它是「让目标像源」，不是「让源像目标」。对 `openrsync src/ dest/` 而言，删的是 **dest 里多出来的**，不是 src。

4. **双远端不支持**：`hostA:foo hostB:bar` 不行；要中转只能 `openrsync A:foo /tmp/stage && openrsync /tmp/stage B:bar`。

5. **权限与 `-o` / `-g`**：保留属主要 root；Openrsync 用名称映射 UID/GID，跨系统用户名不一致时加 `--numeric-ids`。

6. **安全移植到 Linux**：官方立场是 **pledge/unveil 不可随意阉割**；在非 OpenBSD 上编译能跑，但网络对端写入文件系统时，sandbox 行为取决于移植层——**公网暴露 rsyncd 要格外小心**。

7. **退出码 2**：表示对端协议版本**比本机旧**，不是普通 I/O 错误。

## 适用 vs 不适用场景

**适用**：

- OpenBSD / 注重许可证纯净的 BSD 系环境做增量备份
- 需要和 **rsync 3.1.x / 协议 27** 对端互通的常规文件同步
- 学习 rsync 协议本身（配合 `rsync(5)` 读源码）
- RPKI、镜像站等「可预测子集」的拉取同步

**不适用**：

- 依赖 GPL rsync 独有特性（压缩传输、大量 legacy 选项、`--link-dest` 硬链接农场等）的复杂流水线
- 需要「源和目标同时在不同远程主机」的双跳直连
- Windows 原生环境（无官方支持；WSL/SSH 另论）
- 把 rsync 当实时双向同步引擎——它是**批量单向对齐**工具，不是 Dropbox

## 历史

- **2018–2019**：Kristaps Dzonsons 为 **rpki-client** 项目开发 Openrsync，资助方包括 NetNod、IIS.SE、SUNET、6connect
- **2019 年 4 月**：随 **OpenBSD 6.5** 进入发行版，成为基座工具
- **此后**：上游开发迁至 OpenBSD CVS；GitHub 仓库 `kristapsdz/openrsync` 保留**可移植胶水**（oconfigure），补丁发 `tech@openbsd.org`
- **协议**：锁定 **rsync protocol 27**（与 rsync 3.1.3 测试互通）
- **移植**：Linux（glibc/musl）、FreeBSD、NetBSD、macOS、OmniOS 等可通过 CI 构建，但**官方只背书 OpenBSD 安全路径**

## 学到什么

1. **协议与实现解耦**——学会 rsync 算法，不等于只会敲 `rsync` 命令；Openrsync 证明同一协议可以有更小、更可审计的实现。
2. **安全要进架构，不是事后打补丁**——`pledge` / `unveil` 在接收网络数据写盘前就把能力收窄，比「跑在 Docker 里就算安全」更底层。
3. **事件循环可以替代多进程**——GPL rsync 的 generator 子进程是历史设计；Openrsync 用 uploader/downloader 状态机达到同样协议行为。
4. **许可证也是工程决策**——ISC 基座 + 一万行 C，对 BSD 生态比「GPL 工具链里塞一个 GPLv3 二进制」更干净。
5. **子集兼容是刻意选择**——少 flag 不是偷懒，而是降低测试矩阵和攻击面；和上游互通时要**自觉降级选项**。

## 关联

- [[rsync]] —— GPL 参考实现，功能超集
- [[openssh]] / SSH —— 默认传输通道（`-e ssh`）
- [[ansible]] —— 常用 `synchronize` 模块封装 rsync；在 OpenBSD 控制节点可改用 openrsync
- [[zfs]] —— 快照 + send/receive 是另一路增量复制；与 rsync 块算法互补
- [[rpki-client]] —— Openrsync 的原始资助场景之一

## 延伸阅读

- [openrsync(1) — OpenBSD Manual](https://man.openbsd.org/openrsync.1) — 命令行与示例的权威入口
- [rsync(5) / rsyncd(5) — OpenBSD Manual](https://man.openbsd.org/rsync.5) — 自包含的协议说明，适合实现第三方客户端
- [kristapsdz/openrsync — GitHub](https://github.com/kristapsdz/openrsync) — 可移植构建与架构 README
- [The rsync algorithm (tech report)](https://rsync.samba.org/tech_report/) — 块交换算法原始论文
- Andrew Tridgell PhD thesis — *Efficient Algorithms for Sorting and Synchronization* — 更完整的理论背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
