---
title: bandwhich — 按进程实时显示带宽占用的跨平台 TUI
来源: 'https://github.com/imsnif/bandwhich'
日期: 2026-05-30
分类: cli
难度: 初级
---

## 是什么

bandwhich 是 **imsnif 用 Rust 写的实时带宽监视器**——打开它，终端里立刻出来三张表：**哪个进程在占网、每条连接走了多少字节、对方 IP 是谁**。日常类比：传统命令 `ifconfig` / `ip -s link` 只告诉你"这张网卡总共进出多少 MB"，像电表只显示家庭总用电；bandwhich 是给你一份**实时的分户账单**——精确到每个进程、每条连接、每个对端。

跑起来一行：

```bash
sudo bandwhich
```

终端就分成三格滚动：上格是按进程聚合的速率（pid + 命令名 + 上下行 KB/s），中格是每条 TCP/UDP 连接的明细，下格是按远端 IP 聚合的速率。Ctrl-C 退出。

## 为什么重要

- 不理解它，回答不了"哪个进程在偷流量"——传统 `nethogs` 只能在 Linux 跑，macOS 用户没替代品
- 不理解它，分不清 `iftop`（按连接） / `nethogs`（按进程） / `vnstat`（按时间累计）三者定位的差别
- 不理解它，看不出 [[procs]] / [[btop]] / [[bandwhich]] 这一波 Rust 系统工具的共同套路：**单二进制 + 跨平台 + TUI 渲染 + 不依赖 root 之外的服务**
- 不理解它，调试容器 / VPN 异常流量时只能瞎猜——它能直接定位到 PID

## 核心要点

bandwhich 一句话：**抓包看 IP 头 + 查 socket 表反推 PID + 实时聚合三个维度**。三步拆开：

1. **抓包**：用 `libpnet` 在数据链路层开 raw socket，读每张网卡进出的 IP 包头（不读 payload）。类比：在小区门口设一个登记员，每辆车进出都记车牌（IP）、时间、车主（端口），但不查后备箱。

2. **反查 PID**：拿到 `(本地 IP, 本地端口, 远端 IP, 远端端口)` 四元组后，去问操作系统"这个端口属于哪个进程"——Linux 读 `/proc/net/tcp` + `/proc/<pid>/fd`，macOS 调 `libproc`，Windows 走 `GetExtendedTcpTable`。

3. **聚合 + 渲染**：每秒把抓到的字节数按 PID / 连接 / 远端 IP 三种 key 各做一次累加，然后用 `ratatui` 画三张表。

底层抓包必须 raw socket，所以**没 root 直接拒绝启动**——这是和 [[procs]] / [[btop]] 最大的差别（后两者只读 procfs，普通用户也能跑）。

## 实践案例

### 案例 1：找出谁在偷上行流量

```bash
sudo bandwhich --interface en0
```

**逐部分解释**：

- `sudo` 因为要 raw socket
- `--interface en0` 指定网卡。macOS 上 Wi-Fi 通常是 `en0`，有线是 `en1`；Linux 一般 `eth0` / `wlan0`；不传时 bandwhich 会自己挑默认路由那张
- 进程表里**上行 KB/s** 一列高的就是上传嫌疑——常见是云盘客户端、备份进程、被注入的恶意 npm 脚本

对照传统命令：`nethogs en0` 也行但只在 Linux；`iftop -i en0` 跨平台但**不显示 PID**——bandwhich 是少数同时给 PID + 跨平台的工具。

### 案例 2：把当前占用打印到日志（脚本友好）

```bash
sudo bandwhich --raw --no-resolve > traffic.log
```

**逐部分解释**：

- `--raw` 关掉 TUI，按行输出文本，方便 `grep` / `awk`
- `--no-resolve` 关掉远端 IP 的反向 DNS 查询——DNS 慢的时候 TUI 会卡几秒，关掉就实时
- 重定向到文件，留作事后分析

输出一行长这样（简化）：

```
process: chrome  up: 12.3 KBps  down: 1.2 MBps  conns: 14
```

适合丢给 `awk '$3>5000'` 找出阈值告警。

### 案例 3：累计模式看一段时间总量

```bash
sudo bandwhich --total-utilization
```

短选项 `-t`。**默认模式**显示**当前每秒**速率（瞬时）；加 `-t` 改成**累计字节数**，从启动到现在每个进程总共上下行了多少。类比：默认是车速表，`-t` 是里程表。

排查"过去 5 分钟到底谁吃了 1 GB"时用 `-t` 跑 5 分钟再 Ctrl-C 看终态最方便。

## 踩过的坑

1. **没 root 直接报错**：`Error: Insufficient permissions to listen on network interface(s)`。Linux 上更优雅的解法是给二进制加能力位：`sudo setcap cap_net_raw,cap_net_admin=eip $(which bandwhich)`，之后普通用户就能直接跑——这比每次 sudo 安全。

2. **Windows 不开箱即用**：必须先装 Npcap 驱动（WinPcap 的现代分支），否则 raw socket 拿不到包。装完重启电脑，bandwhich 才能跑。

3. **VPN / Docker 网卡要显式指定**：默认网卡通常是物理网卡，VPN（utun*）、Docker（docker0、br-*）走的是虚拟网卡——bandwhich 看不到这些流量。要监这些，加 `-i utun0` 或 `-i docker0`。

4. **DNS 反查会卡 UI**：默认开反查把远端 IP 翻译成域名（更可读），但卡住时整个 TUI 不响应。加 `--no-resolve` 立刻流畅。

5. **不是 Wireshark**：bandwhich 只看 IP 头的字节计数，**不解析 payload**——加密流量里访问了哪个 SNI、HTTP 路径是什么，它一概看不见。要做包内容分析，请用 Wireshark / tcpdump。

## 适用 vs 不适用场景

**适用**：

- macOS 用户找 nethogs 替代——bandwhich 是为数不多 macOS 跑得动的"按进程显示带宽"工具
- 排查"哪个进程在偷流量"——CPU 占用低但网速被吃满时
- 容器 / VPN 调试——给 `-i` 指定虚拟网卡，立刻定位异常 PID
- 跨平台脚本/教程——同一条命令在 Linux / macOS / Windows 都能跑

**不适用**：

- 历史趋势 / 月度流量统计 → 用 `vnstat`（按时间累计、出图、轻量后台守护）
- 包内容分析 / 抓 HTTP 请求 → 用 Wireshark / mitmproxy
- 多机集群网络监控 → 用 [[glances]] 的远程模式或 ntopng
- 嵌入式无 root 环境 → bandwhich 必须 raw socket，进不去

## 历史小故事（可跳过）

- **2014 年**：nethogs 流行起来，但作者只维护 Linux 版本，macOS 用户长期缺少同等的按进程带宽工具。
- **2019 年**：imsnif（Aram Drevekenin，后来也创建了终端复用器 Zellij）开 bandwhich 仓库，目标是做一个 "nethogs 该有的跨平台版"。
- **2020 年**：项目补上 Windows 支持，靠 Npcap 驱动绕过原生 raw socket 限制。
- **2023 年前后**：Rust TUI 生态从 tui-rs 转向 ratatui，bandwhich 这类三表界面也受益于社区继续维护底层组件。
- **2024-2026**：跟 [[procs]] / [[btop]] / [[bottom]] 一起进入 "Rust 系统工具栈" 标配，brew / cargo / winget 全平台可装，GitHub star 量级已过万。

## 学到什么

1. **抓包 + 反查 PID** 是按进程显示带宽的标准套路，没有捷径——所有同类工具底层都这样
2. **跨平台 = 三套抽象**：Linux 读 procfs / macOS 调 libproc / Windows 走 PSAPI；上层 TUI 共用一套——这和 [[procs]] 的实现哲学完全一致
3. **TUI 工具的可脚本化**：默认是给人看的彩表，但加 `--raw` 就退化成行式输出，能被 grep/awk 吃。这个"双模式"模式是现代 CLI 标配
4. **能力位（capabilities）替代 sudo**：Linux 上 `setcap cap_net_raw=eip` 比每次 sudo 安全得多，但鲜有人知

## 延伸阅读

- 官方 README：[bandwhich GitHub](https://github.com/imsnif/bandwhich)（带动图，看一眼三表布局）
- LWN 评测：[bandwhich: see what is using your bandwidth](https://lwn.net/Articles/810843/)（讲 raw socket + PID 反查的实现细节）
- nethogs 对比：[nethogs vs bandwhich](https://github.com/raboof/nethogs)（老哥仍在维护，Linux 限定）
- [[procs]] —— 同一个 Rust 系统工具浪潮的兄弟，看进程而不是带宽
- [[btop]] —— 把网络面板嵌进五合一仪表盘的另一种思路

## 关联

- [[procs]] —— ps 的 Rust 替代，看进程；bandwhich 看进程的网络流量，定位互补
- [[btop]] —— 五面板仪表盘，自带网络速率图但不到进程粒度
- [[glances]] —— Python 全栈监控，远程 / Web / REST 强，但带宽细节不如 bandwhich
- [[bottom]] —— Rust top 替代，画 CPU/内存/网络曲线，进程级带宽要靠它的 network 面板
- [[ripgrep]] —— 同浪潮的 Rust CLI，搜文件而非看进程
- [[bat]] —— cat 的 Rust 替代，浪潮兄弟项目

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bandwhich]] —— bandwhich — 按进程实时显示带宽占用的跨平台 TUI
- [[duf]] —— duf — df 的彩色表格替代，按设备分组自动忽略伪文件系统
- [[ratatui]] —— ratatui — Rust 的立即模式 TUI 库，tui-rs 弃坑后社区接住
