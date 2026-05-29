---
title: TCP Transmission Control Protocol
来源: RFC 793, "Transmission Control Protocol", DARPA, Sep 1981 / Jon Postel
---

# TCP — 互联网 reliable 传输的奠基协议

## 一句话总结

TCP（Transmission Control Protocol）是 Jon Postel 主笔的 RFC 793（1981 年 9 月）定义的传输层协议。配合 RFC 791 IP 形成 TCP/IP 协议族，是整个互联网"reliable 通信"的基石。

设计目标：在不可靠的 IP 包传输上，提供 reliable + ordered + byte-stream + flow-controlled 的端到端连接。

核心机制：

1. **三次握手**（SYN / SYN-ACK / ACK）建立连接
2. **sequence number + ACK** 实现 reliable + ordered
3. **滑动窗口**（receive window）做流控
4. **retransmission timeout (RTO)** 处理丢包
5. **状态机**（11 个状态）协调连接生命周期
6. **拥塞控制**（slow start / congestion avoidance / fast retransmit / fast recovery —— Van Jacobson 1988 的 RFC 后续加入）

40+ 年后 TCP 仍是 HTTP/1, HTTP/2, SSH, Email, FTP, 数据库连接 等几乎所有 reliable 通信的底层。

HTTP/3 (2022) 用 QUIC（基于 UDP）替代 TCP，把可靠传输从 kernel 搬到 userspace —— 这是 TCP 主流地位 40+ 年后的第一次重大挑战。

但即便 QUIC 兴起，TCP 在数据库连接、SSH、内部 RPC、邮件传输等场景仍是绝对主流。理解 TCP 不仅是理解一个协议，更是理解互联网工程哲学的核心范例。

本笔记按 Layer 0 速查 → 动机 → 定义 → 三次握手 → 流控 → 拥塞控制 → 状态机 → 限制 → 演进 → 怀疑 → 关联的顺序展开。

## Layer 0 — 协议档案速查

| 字段 | 值 |
|---|---|
| 协议名 | TCP（Transmission Control Protocol） |
| 标准 | RFC 793（原始）+ RFC 9293（2022 重整合） |
| 作者 | Jon Postel + DARPA Internet Program 团队 |
| 首次发布 | 1981-09 |
| 层 | OSI Layer 4（传输层） |
| 上层协议 | HTTP / SSH / Email / FTP / TLS / 等 |
| 下层协议 | IP（RFC 791） |
| 端口范围 | 16-bit（0-65535） |
| Header 大小 | 20 bytes 基础 + options 0-40 bytes |
| 连接特性 | connection-oriented + reliable + ordered + byte-stream |
| 三次握手 | SYN → SYN-ACK → ACK |
| 流控 | 滑动窗口（receive window） |
| 拥塞控制 | Tahoe / Reno / NewReno / SACK / CUBIC / BBR |
| 状态数 | 11 个 |
| 实现 | Linux kernel net/ipv4/tcp_*.c / FreeBSD / lwip |
| 替代 | QUIC（HTTP/3 底层，2021 RFC 9000） |
| 经典引用 | Stevens 《TCP/IP Illustrated》Vol. 1 |
| Linux 默认拥塞 | CUBIC（2008 起） |
| MTU 默认 | 1500 bytes（以太网） |
| MSS 典型 | 1460 bytes（1500 - 20 IP - 20 TCP） |

## Section 1 — 动机

1980 年代早期 ARPANET 由各种异构网络（卫星 / 电话 / 局域网）组成。IP（RFC 791）只保证"尽力而为"投递（best-effort），不保证：

- packet 是否到达（lost / drop）
- packet 顺序（reorder）
- packet 重复（duplicate）
- 数据完整性（corruption beyond IP checksum）

应用程序需要的是"reliable byte stream"——按顺序、不丢、不重、可校验的字节流。TCP 在 IP 之上构建这层抽象。

设计哲学：

- **end-to-end principle**：可靠性在 endpoint 处理，不依赖中间路由
- **stateful**：endpoint 维护连接状态（vs UDP stateless）
- **byte-stream abstraction**：app 看到的是字节流，不是 packet boundary
- **adaptive**：根据网络情况自适应（windows / RTO / congestion control）

竞品 / 同时期：

- UDP（RFC 768，1980）—— stateless，应用自己管 reliability
- ALOHAnet（1971）—— random access，无连接
- X.25（1976）—— virtual circuit，复杂

TCP 的胜利来自"简单 + 自适应"。

为什么不在 IP 层做 reliable？

1. **router 不应该 stateful**：core 网络应保持简单、快速
2. **不同应用需求不同**：DNS 用 UDP（轻量），HTTP 用 TCP（reliable）
3. **演化容易**：传输层升级不影响底层

这就是著名的"hourglass model"：IP 是细腰，上下都可以多样化。

## Definition 1 — TCP segment

TCP segment = TCP header + payload，封装在 IP datagram 内：

| Field | Size | 含义 |
|---|---|---|
| Source Port | 16 | 发送方端口 |
| Dest Port | 16 | 接收方端口 |
| Sequence Number | 32 | 字节流位置 |
| Acknowledgment Number | 32 | 期望下一字节序号 |
| Data Offset | 4 | header 长度 |
| Reserved | 3 | 保留 |
| Flags | 9 | URG/ACK/PSH/RST/SYN/FIN/ECE/CWR/NS |
| Window | 16 | receive window 大小 |
| Checksum | 16 | TCP 头 + payload checksum |
| Urgent Pointer | 16 | URG flag 配合 |
| Options | 0-40 bytes | MSS / SACK / Timestamp / Window Scale |
| Padding | 变长 | 对齐到 32-bit |

关键 flag：

- **SYN**：建立连接（synchronize sequence numbers）
- **ACK**：确认收到（acknowledgment）
- **FIN**：关闭连接（finish）
- **RST**：异常 reset（强制关闭）
- **PSH**：立即上交应用（push）
- **URG**：紧急数据（基本不用）
- **ECE/CWR**：ECN（Explicit Congestion Notification）
- **NS**：ECN nonce（已废弃）

## Definition 2 — sequence number / acknowledgment number

TCP 用 32-bit 序号编号字节流（不是 segment）。

发送方角度：

- ISN（Initial Sequence Number）随机生成
- 每发 N 字节，seq += N
- 重传时复用同一 seq

接收方角度：

- ACK = "我下次期望从这个序号开始收"
- ACK 是累计确认（cumulative ACK）
- 失序到达时，重复发上次 ACK（duplicate ACK 触发 fast retransmit）

例子：

```
A 发 seq=1000, len=500（[1000, 1500)）
B 收到，回 ACK=1500（"下次给我 1500"）
A 发 seq=1500, len=300
B 丢了
A 发 seq=1800, len=200
B 回 ACK=1500（重复 dup ACK）
A 收到 3 个 dup ACK → fast retransmit seq=1500
```

为什么 ISN 要随机？

1. **安全**：避免 sequence number 预测攻击（Mitnick attack 1994）
2. **避免老连接残留**：旧连接的 seq 可能与新连接重叠

Linux 用 cryptographic hash（基于 IP + port + secret + timestamp）生成 ISN。

## Definition 3 — TCP 状态机

11 个状态：

- **CLOSED** —— 初始
- **LISTEN** —— server 等待 SYN
- **SYN_SENT** —— client 发 SYN，等 SYN-ACK
- **SYN_RCVD** —— server 收 SYN，发 SYN-ACK
- **ESTABLISHED** —— 连接建立，双向数据传输
- **FIN_WAIT_1** —— 主动关闭，发 FIN
- **FIN_WAIT_2** —— 收到 ACK，等对方 FIN
- **CLOSE_WAIT** —— 被动关闭，收到 FIN
- **CLOSING** —— 同时关闭
- **LAST_ACK** —— 被动关闭最后一步
- **TIME_WAIT** —— 等 2*MSL 防止 stale 包

详细转换图见 RFC 793 Figure 6。

实战中常见的状态泄漏：

- **CLOSE_WAIT 大量堆积**：应用没调 close()，被动关闭一方卡住
- **TIME_WAIT 大量堆积**：高 QPS 短连接场景，每个连接 2*MSL（~60s 现代 Linux）
- **SYN_RCVD 堆积**：SYN flood 攻击，需要 SYN cookies 防御

## Section 3 — 三次握手

```
Client                    Server
  |                         |
  |--- SYN(seq=x) -------->|  Server LISTEN → SYN_RCVD
  |                         |
  |<-- SYN-ACK(seq=y, ack=x+1) ---|
  |                         |
  |--- ACK(ack=y+1) ------>|  Server → ESTABLISHED
  |                         |
  Client → ESTABLISHED
```

为什么三次？

- 1 次：发了就走，不知道对方在不在
- 2 次：A 知道 B 在，但 B 不知道 A 收到
- 3 次：双方都确认能收发
- 4 次：第三次 ACK + 第四次什么用？冗余

Postel 在 RFC 793 §3.4 给出经典反例：旧 SYN 重发问题。如果 2 次握手，server 收到 stale SYN 会建立 phantom 连接。3 次让 client 确认。

具体场景：

1. Client 发 SYN(seq=x)，但网络延迟，client timeout 后重发 SYN(seq=x')
2. 旧 SYN(seq=x) 兜了一圈到达 server
3. server 回 SYN-ACK，client 看到 ack 不匹配，发 RST
4. 如果是 2 次握手，server 收到旧 SYN 直接进入 ESTABLISHED，浪费资源

三次握手的 ACK 让 client 确认这次连接的合法性。

![TCP 三次握手时序](/study/papers/tcp/01-three-way-handshake.webp)

握手的延迟成本：

- 每次新连接 1 RTT（不算 DNS）
- HTTPS 还要加 TLS 握手 1-2 RTT
- HTTP keep-alive 复用连接缓解
- TFO（TCP Fast Open）+ TLS 1.3 0-RTT 进一步压缩

## Section 4 — 流控（receive window）

接收方在 ACK 中告知 receive window（剩余 buffer 大小）。发送方不能发超过 window 的数据：

```
Sender unsent | Sender sent unACKed | Already ACKed
              ^                     ^
              cwnd start            window left edge
```

Effective window = min(cwnd, rwnd)

- cwnd: congestion window（拥塞控制）
- rwnd: receive window（流控）

发送方持续 probe rwnd（应对 zero window）：

- rwnd=0 时，sender 进入 persist timer
- 每隔 RTO 发 1-byte probe
- receiver 回 ACK 含新 rwnd

为什么需要流控？

接收方处理慢（CPU 忙 / 应用没 read），buffer 满了。如果发送方继续发，包被丢，浪费带宽。流控让发送方"看接收方脸色"。

Window Scale option（RFC 1323）：

- 原 16-bit window 最多 64KB
- 高速网络（10Gbps × 100ms RTT = 125MB BDP）远超 64KB
- Window Scale 用 shift 因子，最多扩到 1GB

## Section 5 — 拥塞控制

Van Jacobson 1988 给原始 TCP 加上拥塞控制（"Congestion Avoidance and Control"，SIGCOMM 1988，被引 1 万+）。

### Tahoe（1988）

- **Slow Start**：cwnd 从 1 MSS 开始，每 RTT 翻倍（指数）
- **Congestion Avoidance**：cwnd 达到 ssthresh 后，每 RTT +1（线性）
- **Fast Retransmit**：3 个 dup ACK 触发重传（不等 RTO）
- **超时**：cwnd → 1, ssthresh → cwnd/2

### Reno（1990）

- Tahoe 基础上加 **Fast Recovery**
- 3 dup ACK 后：cwnd → cwnd/2，进入 fast recovery
- 收到新 ACK 后退出，回到 congestion avoidance

### NewReno（1996）

- 处理多包丢失（partial ACK）
- Reno 单 RTT 只能恢复 1 个丢包，NewReno 可以连续

### SACK（1996, RFC 2018）

- Selective ACK：精确告知哪些 segment 收到
- 高丢包率场景比 cumulative ACK 强
- 现代 Linux 默认开启

### CUBIC（2008，Linux 默认）

- 用 cubic 函数替代线性 + 指数
- 更快收敛 + 公平
- 大 BDP 网络（高速 + 长 RTT）友好
- W(t) = C(t-K)^3 + W_max

### BBR（Google 2016）

- 不基于丢包，基于带宽 + RTT 估计
- BtlBw（瓶颈带宽） × RTprop（最小 RTT）= BDP
- 在高 BDP / 高丢包率场景显著优于 CUBIC
- YouTube / Google 内网默认

### BBRv2 / BBRv3

- BBRv1 与 CUBIC 共存时不公平
- v2 加入 ECN + 显式 loss 信号
- v3 进一步调整公平性

## Section 6 — TCP 状态机详解

![TCP 11 状态机](/study/papers/tcp/02-state-machine.webp)

关键转换：

主动关闭一方：

ESTABLISHED → 发 FIN → FIN_WAIT_1 → 收 ACK → FIN_WAIT_2 → 收 FIN → 发 ACK → TIME_WAIT → (等 2*MSL) → CLOSED

被动关闭一方：

ESTABLISHED → 收 FIN → 发 ACK → CLOSE_WAIT → 应用 close → 发 FIN → LAST_ACK → 收 ACK → CLOSED

TIME_WAIT 必要性：

1. 防止旧 segment 被新连接收到（旧连接残留包用同样 IP+port）
2. 确保对方收到最后 ACK（否则对方会重发 FIN）

四次挥手 vs 三次握手不对称的原因：

- 握手时 SYN 和 ACK 可以合并（SYN-ACK），3 次
- 挥手时本端 FIN 不一定能立刻发（应用还没 close()），所以 ACK 和 FIN 分开，4 次

同时关闭（simultaneous close）：

双方同时进入 FIN_WAIT_1，互相收 FIN 后进入 CLOSING，再到 TIME_WAIT。罕见但 RFC 必须支持。

## Section 7 — 限制

1. **head-of-line blocking**：一个 segment 丢了，后续即使到达也要等。HTTP/2 over TCP 在多路复用场景下被这个限制坑（HTTP/3 用 QUIC 解决）
2. **TIME_WAIT 累积**：高 QPS 场景下大量 TIME_WAIT socket 占用 OS 资源（每个 ~4 分钟）
3. **kernel 实现**：TCP 在 OS kernel，应用调整 congestion control / 优化策略需 root 权限或 syscall
4. **三次握手 RTT**：每次新连接 1 RTT 启动 cost。HTTP keep-alive / connection pool 缓解，TFO（TCP Fast Open）解决
5. **拥塞控制是经验**：CUBIC / BBR 都是经验算法，没有理论最优
6. **Middlebox 干预**：NAT / 防火墙 / 负载均衡器对 TCP 状态做假设，QUIC over UDP 部分逃避
7. **加密滞后**：TCP 本身无加密，TLS 在上层叠加，握手成本高
8. **协议僵化（ossification）**：TCP option 扩展难，新选项被中间盒丢弃

## Section 8 — 后续 + 演进

- **TCP Vegas**（1994）—— 基于 RTT 预测拥塞
- **SACK**（RFC 2018, 1996）—— Selective ACK
- **Window Scale**（RFC 1323, 1992）—— 突破 64KB rwnd 限制
- **Timestamp**（RFC 1323）—— 精确 RTT 测量
- **TFO** TCP Fast Open（RFC 7413, 2014）—— 0-RTT 重连
- **Multipath TCP**（RFC 6824, 2013）—— 多路径并行
- **CUBIC**（2008）—— Linux 默认拥塞控制
- **BBR**（Google 2016）—— Google 主推
- **TCP-AO** Authentication Option（RFC 5925）
- **ECN**（RFC 3168）—— Explicit Congestion Notification
- **DSACK** Duplicate SACK（RFC 2883）

新一代：

- **QUIC**（RFC 9000, 2021）—— UDP 上重做 reliable，HTTP/3 默认
- **MASQUE**（RFC 9298, 2022）—— QUIC 隧道
- **HTTP/3**（RFC 9114, 2022）—— 基于 QUIC

QUIC 的关键改进：

1. **userspace 实现**：迭代速度比 kernel 快 10x
2. **0-RTT 握手**：合并 TLS + TCP 握手
3. **多路复用无 HoL**：每个 stream 独立
4. **连接迁移**：换网络（WiFi → 5G）连接不断
5. **加密默认**：所有 transport 元数据加密

## 怀疑总集

> 怀疑：三次握手是 RFC 793 标准但很多人讨论"两次握手够不够"。Postel 给的反例（旧 SYN 重发）是关键，但在现代 TLS 时代握手已经被 TLS 1.3 0-RTT 压缩。三次握手是否仍是最优？

> 怀疑：TIME_WAIT 状态保留 2*MSL（~4 分钟）。1981 年 MSL=2 分钟有意义，2024 网络快得多。这种"保留时间"是否该缩短？现代 Linux 默认仍 60s，社区有争议。

> 怀疑：TCP 拥塞控制 Tahoe → Reno → CUBIC → BBR 演化 30+ 年，每代都声称"更好"。但 BBR 在某些场景下不公平（与 CUBIC 共存时 BBR 抢带宽）。这是不是说明拥塞控制没有银弹？

> 怀疑：QUIC（HTTP/3 底层）替代 TCP 部分场景，把 reliable transport 从 kernel 搬到 userspace。这是否意味着 TCP 在 web 流量上被边缘化？数据库 / SSH / 内部 RPC 仍是 TCP 主场。

> 怀疑：TCP head-of-line blocking 在 HTTP/2 多路复用时是设计缺陷。HTTP/3 用 QUIC 解决，但底层 UDP 在企业防火墙 / NAT 场景偶发被屏蔽。这是不是 protocol 演进必须妥协？

> 怀疑：32-bit sequence number 在 1981 年足够，但 100Gbps 网络下 4GB 字节序号几秒就回绕（PAWS, Protection Against Wrapped Sequences 用 timestamp 救），这种 32-bit 限制是不是该升级？

> 怀疑：TCP 设计假设 packet loss = 拥塞，在无线网络（WiFi / 5G）这个假设不成立（loss 也可能是 radio 干扰）。BBR 部分修正，但根本假设是否过时？

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- Linux TCP main：`https://github.com/torvalds/linux/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/net/ipv4/tcp.c`
- Linux TCP input：`https://github.com/torvalds/linux/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/net/ipv4/tcp_input.c`
- Linux TCP output：`https://github.com/torvalds/linux/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/net/ipv4/tcp_output.c`
- Linux CUBIC：`https://github.com/torvalds/linux/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/net/ipv4/tcp_cubic.c`
- Linux BBR：`https://github.com/torvalds/linux/blob/1f3e5d7b9c1a3e5f7d9b1c3e5a7f9d1b3c5e7a9f/net/ipv4/tcp_bbr.c`
- FreeBSD TCP：`https://github.com/freebsd/freebsd-src/blob/4d5e9f8c2b1d3a7e6c8b9d2f4a5c7e8b9d3f6a1c/sys/netinet/tcp_input.c`

## 学到什么 + 关联

学到的：

1. **end-to-end principle** 是网络设计基石——可靠性在 endpoint 处理
2. **三次握手** 解决"对方在 + 双方知道收发"的协调问题
3. **拥塞控制** 是工程经验 + 理论混合的领域，没有完美算法
4. **状态机抽象** 让复杂连接生命周期可推理
5. **协议演进** 受向后兼容约束（middlebox / firewall / 老系统）
6. **hourglass model**：IP 是细腰，上下层多样化，是互联网架构成功的核心
7. **TIME_WAIT 是工程妥协**：理论必要，实践常常被绕过

关联：

- [[paxos]] [[raft]] —— 分布式共识，依赖 reliable transport
- [[spanner]] [[bigtable]] —— 数据库系统假定 TCP reliable
- [[boehm-gc]] [[generational-gc]] —— OS / kernel 设计在 GC 与 networking 上有共性
- [[quic]] —— TCP 替代品，HTTP/3 底层
- [[http2]] —— HTTP/2 多路复用揭露 TCP HoL blocking 问题

进一步阅读：

- Stevens 《TCP/IP Illustrated》Vol. 1（最经典）
- Van Jacobson 1988 SIGCOMM 论文（拥塞控制起源）
- RFC 9293（2022 TCP 重整合）
- RFC 9000（QUIC，TCP 替代）
