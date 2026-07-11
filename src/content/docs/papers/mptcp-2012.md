---
title: MPTCP — 让手机同时用 Wi-Fi 和 4G 传数据
来源: 'Raiciu et al., "How Hard Can It Be? Designing and Implementing a Deployable Multipath TCP", NSDI 2012'
日期: 2026-06-24
分类: 网络协议
难度: 中级
---

## 是什么

想象你家里有两条宽带——一条电信、一条联通。普通 TCP 只能挑一条用，另一条闲着。
MPTCP（Multipath TCP）的做法是：一个下载任务同时走两条线，速度叠加，某条断了也不影响。

这正是你每天在用的技术——iPhone 上问 Siri 一个问题，iOS 先用 Wi-Fi 发请求，
同时在 4G 上悄悄建一条备用通道。Wi-Fi 一卡，4G 瞬间接上，你感觉不到任何中断。

技术上一句话：MPTCP 是 TCP 的多路径扩展（RFC 6824 / RFC 8684），
在一个 TCP 连接里开多条"子流"（subflow），每条子流走不同网络接口，
共同传输同一个应用的数据。对应用来说还是一个普通 socket，完全透明。

这篇 NSDI 2012 论文回答的核心工程问题是：**在充满中间盒（防火墙、NAT、负载均衡器）
的真实互联网上，怎么设计并实现一个真的能部署出去的多路径 TCP**。

## 为什么重要

- 论文中实现的 Linux 内核 MPTCP 后来成为 Apple iOS 7（2013）Siri 的传输层基础，
  是多路径传输首次在消费级产品上大规模落地。
- 系统总结了"中间盒兼容性"这个传输层协议演进的核心障碍——
  中间盒会丢 TCP option、改序列号、拆握手，MPTCP 的每个设计都在和它们做妥协。
- 强调"耦合拥塞控制"：多条子流共同竞争带宽时不能比单路径 TCP 更贪心，
  这一公平性约束写入了 RFC 6356（与 Wischik 等 NSDI 2011 工作一脉相承）。
- 实验在真实网络（Amazon EC2 跨数据中心）上做而非模拟，
  为后续多路径协议研究树立了评估标准。

## 核心要点

**连接建立：** 第一条子流用正常 TCP 三次握手，SYN 里带 `MP_CAPABLE` 选项（告诉对端「我懂多路径」）。
中间盒把选项剥掉？没关系，退化成普通 TCP。双方各生成 64 位 key；用 key 的哈希得到 **token**（像连接门牌号）。
加第二条子流时在另一个网卡再握一次手，SYN 带 `MP_JOIN` + token；再用 **HMAC**（带密钥的完整性校验，防别人伪造第二条路）认证。

**数据传输：** 两层序列号——每条子流有独立 TCP 序列号（让防火墙以为这是普通 TCP）；
MPTCP 再在 option 里加 **DSN**（Data Sequence Number，整条连接的全局字节序号）。
接收端按 DSN 跨子流拼回原数据：子流层面伪装，连接层面还原顺序。

**拥塞控制：** 若两条子流各自跑 **CUBIC**（常见 TCP 拥塞算法），在共享瓶颈上会像「开了两个 TCP」一样多抢带宽。
**耦合拥塞控制**把各子流的 **cwnd**（拥塞窗口，一次能在途的数据量）增长绑在一起，总增速不超过单路径公平份额。
每收到 ACK，增长量大致是 `min(alpha * bytes_acked / cwnd_total, bytes_acked / cwnd_i)`；**alpha** 按各子流 RTT 动态算，用来压住「多路径更贪心」。

## 与 SCTP CMT 的对比

[[sctp-multipath-2006]] 的 CMT 和 MPTCP 解决同一个问题，走了不同路线：

**协议基础：** CMT 基于 SCTP（协议号 132），MPTCP 基于 TCP（协议号 6）。
NAT 认识 TCP 不认识 SCTP；防火墙放行 TCP 拦截未知协议。
CMT 技术更干净但部署不了，MPTCP 技术更脏但能用。

**序列号：** CMT 一层 TSN 所有路径共享，跨路径乱序时误判丢包要靠 SFR 修补。
MPTCP 两层序列号天然避免跨路径误判。

**拥塞控制：** CMT 的 CUC 只解决各路径 cwnd 正常增长，不考虑公平性。
MPTCP 耦合控制从设计起就把"不比单路径更贪心"作为硬约束。

**结局：** CMT 留在学术和电信专网，MPTCP 进了 Linux/iOS/Android。
教训：**协议的部署能力和技术优劣同等重要**。

## 实践案例

### 案例 1：应用侧几乎无感（伪代码）

```c
// 内核已启用 MPTCP 时，对应用仍是普通流式 socket
int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
connect(fd, server, addrlen);
send(fd, req, len, 0);  // 内核可在 Wi-Fi / 蜂窝子流间调度
```

**逐部分解释**：

- 应用不写「开两条 TCP」；多路径在传输层完成
- 服务端也要支持 MPTCP，否则握手后静默降为普通 TCP
- 这对应论文强调的可部署性：不改应用也能受益

### 案例 2：Siri 式 handover

iOS 7 起 Siri 走 MPTCP：Wi-Fi 主子流 + 蜂窝备用。从客厅走进电梯 Wi-Fi 消失，毫秒级切到 4G，连接不断。这是 **handover**——不求带宽相加，只求无缝切换。后来 Maps、Music 也启用。

### 案例 3：数据中心带宽聚合

论文在 EC2 跨可用区实验：两条子流走不同路径，吞吐可接近带宽之和。胖树里 MPTCP 与 ECMP 互补——ECMP 按流分路，MPTCP 在单连接内按子流/包利用多路径。韩国 KT GiGA Path（2015）则把 Wi-Fi+LTE 聚合做成消费级商用。

## 踩过的坑

**中间盒改序列号：** 防火墙做 sequence number randomization，
子流序列号被改但 DSN 映射按原始值算，接收端对不上。
解决：option 里显式携带子流序列号到 DSN 的映射，改写后仍可正确重组。

**TCP option 空间只有 40 字节：** DSN 映射、子流管理、地址通告都要塞进去。
被迫 DSN 只传低 32 位靠推断高位，ACK 也截断。压缩导致实现复杂度暴增。

**接收缓冲区阻塞：** 和 CMT 一样——快路径数据先到但 DSN 要求按序交付，
慢路径前序数据没到就卡住，缓冲区满后整个连接停顿。
论文通过动态调整缓冲区大小和调度策略缓解，但承认仍是主要瓶颈。

**NAT 让地址通告失效：** ADD_ADDR 里的 IP 经过 NAT 变了，
解决方案：接收端以实际收到包的源地址为准，忽略 option 里可能过时的地址。

**防火墙剥 option：** MP_CAPABLE 被静默删除，对端看到普通 SYN。
策略：优雅降级为普通 TCP，应用照常工作。
整体原则：**能用多路径就用，不能用就退化，绝不让连接失败**。

## 适用 vs 不适用场景

**适用：** 移动设备 Wi-Fi + 蜂窝无缝切换（Apple/三星已验证）；
数据中心多网卡大文件传输（带宽聚合）；
高可靠场景如金融交易、远程医疗（多路径冗余）。

**不适用：** 路径共享瓶颈链路（两个 Wi-Fi 走同一上行）带宽不叠加反增开销；
延迟敏感场景（游戏、VoIP）跨路径重组引入抖动；
短连接（DNS、REST API）生命周期太短协商开销回不了本；
服务端不支持时退化为普通 TCP，多路径白设置。

## 历史小故事

2009 年 IETF 成立 MPTCP 工作组时，多路径传输已研究近十年但没有一个部署到公网。
Raiciu（UCL）和 Paasch（UCLouvain）团队决定"先写代码再写 RFC"——
在 Linux 内核实现完整协议栈，拿着实现去测各种中间盒会怎么破坏它。
每发现一种中间盒行为就回去改设计。标题"How Hard Can It Be?"带着自嘲——
光中间盒兼容性就迫使他们改了十几次握手设计。

2013 年 Apple Siri 团队找上门，iOS 7 搭载了移植版 MPTCP，
成为首个消费级大规模部署。2020 年 Linux 5.6 将 MPTCP 合入主线内核。

## 学到什么

- "可部署性"是传输层协议的第一约束。中间盒比想象中多得多、行为比想象中离谱得多。
  设计必须从"假设中间盒会搞破坏"出发。
- 两层序列号（子流级 + 连接级）是"多路径看起来像一个连接"的核心抽象。
  对外伪装成普通 TCP 骗过中间盒，对内用 DSN 还原全局顺序。
- 耦合拥塞控制解决的是社会问题而非技术问题——
  MPTCP 比 TCP 更贪心，运营商就会封杀它，部署就做不下去。
- 优雅降级是工业级协议的基本素养：能用多路径就用，不能用就退化，
  永远保证"至少和不用 MPTCP 一样好"。

## 延伸阅读

- RFC 6824 / RFC 8684：MPTCP 协议标准 v0 和 v1
- RFC 6356：耦合拥塞控制正式规范
- Paasch et al., "Exploring Mobile/WiFi Handover with Multipath TCP", CellNet 2012
- Linux 内核 MPTCP 文档 (docs.kernel.org/networking/mptcp.html)
- Wischik et al., "Design, Implementation and Evaluation of Congestion Control for MPTCP",
  NSDI 2011：与 [[sctp-multipath-2006]] 的 CUC 算法对照理解

## 关联

- [[sctp-multipath-2006]] — MPTCP 的学术前身，CMT 经验直接影响 MPTCP 设计
- [tcp](/study/papers/tcp) — MPTCP 是 TCP 的扩展，序列号/ACK/拥塞控制是前提
- [quic](/study/papers/quic) — QUIC 多路径扩展面临类似挑战，在用户空间实现避开中间盒
- [jacobson-1988](/study/papers/jacobson-1988) — MPTCP 子流拥塞控制的基础算法
- [bbr-2017](/study/papers/bbr-2017) — 基于带宽估计的拥塞控制，与耦合控制对比
- [ron-2001](/study/papers/ron-2001) — 应用层多路径方案，与传输层方案形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[sctp-multipath-2006]] —— SCTP 多路径并发传输 — 在 MPTCP 之前，用多宿主实现多链路同时发数据
