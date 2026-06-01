---
title: TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
来源: 'Jon Postel (ed.), "Transmission Control Protocol", RFC 793, DARPA, Sep 1981'
日期: 2026-05-30
分类: 网络
难度: 中级
---

## 是什么

TCP（Transmission Control Protocol）是 1981 年 Jon Postel 在 RFC 793 里定下的传输层协议——**在底层那种"丢就丢了、乱就乱了"的 IP 包投递之上，给应用看一条按字节顺序、不丢、不重的连续水管**。

日常类比：寄快递。底层 IP 像一群骑手，每人随手抓个包裹就上路，到了不到、顺序对不对，没人保证。TCP 是寄件平台：给每个包贴序号、记一份回执、收件人按序号摆好、丢了就重发，最后把一堆零碎包裹拼回成你寄出去的那本书。

你写：

```python
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.connect(('example.com', 80))
sock.sendall(b'GET / HTTP/1.0\r\n\r\n')
data = sock.recv(4096)
```

应用看到的是 `sendall` / `recv` 这种"流"接口，底下三次握手、序号、ACK、重传、窗口、拥塞控制全是 TCP 在替你扛。

## 为什么重要

不理解 TCP，下面这些事都没法解释：

- 为什么 HTTPS、SSH、邮件、几乎所有数据库连接都是先 connect 再说话，但底层只是收发 IP 包
- 为什么短连接服务压上量后 `netstat` 里全是 TIME_WAIT，端口都用不出来
- 为什么 HTTP/3 要重新基于 UDP 造一份 QUIC——TCP 哪里挡了路
- 为什么 WiFi 信号差时网页慢，并不是带宽不够，是 TCP 把无线丢包当成了拥塞

## 核心要点

TCP 把"reliable byte stream"拆成 **三件事**：

1. **先打招呼再说话（三次握手）**：双方互发 SYN / SYN-ACK / ACK，把彼此的初始序号告诉对方。类比：两个对讲机先各自喊一句"听得到吗"，确认对面在线再开始说正事。

2. **每个字节都有编号 + 回执（seq + ACK）**：发出去的每个字节都带 32-bit 序号，收到的一方回 ACK 说"我下次想要从这个序号开始"。类比：你寄 100 页手稿，每页编号；收件人按页摆好，缺哪页喊你重寄。

3. **看对方脸色发包（窗口 + 拥塞控制）**：接收方在 ACK 里告诉你 receive window（我 buffer 还能装多少），网络再额外推 cwnd（congestion window，我估计路上能承受多少），实际能发的是两者取小。类比：你给朋友倒酒，要看他杯子还剩多少（rwnd），也要看桌面平不平稳（cwnd），不能只盯一个。

三件事合起来，就是 OS 内核里那条所有应用都共用的"水管"。重传、超时（RTO）、状态机的 11 个状态，都是这三件事在不同失败场景下的具体动作。

## 实践案例

### 案例 1：用抓包工具看三次握手

跑一行 `curl http://example.com`，同时 `tcpdump -i any -n port 80`，能看到三条包：

```
A > B  Flags [S],  seq 1000               # client SYN
B > A  Flags [S.], seq 5000, ack 1001     # server SYN-ACK
A > B  Flags [.],  ack 5001               # client ACK
```

**逐条解释**：

- `[S]` 是 SYN 标志，client 把自己的初始序号 `1000` 抛过去
- `[S.]` 是 SYN+ACK，server 给自己一个初始序号 `5000`，同时 `ack 1001` 表示"我收到了你的 1000，下次给我 1001"
- 第三条 client 回 `ack 5001`，到这里两边都确认"对方在线 + 序号已对齐"，连接 ESTABLISHED

为什么不是两次？两次时 server 收到一条迟到的旧 SYN，也会傻乎乎建好连接、白白占资源。三次让 client 有机会确认这条 SYN 是不是自己刚发的。

抓包还能看到 SYN 包里 `mss 1460`、`wscale 7` 这种 options——这是 TCP 在握手时顺便协商最大段大小和窗口缩放因子，等会儿正式发数据就不用再聊。

### 案例 2：流控怎么防止接收方被打爆

服务端故意慢慢 read，客户端会经历：

```python
# 接收方
sock.recv(1)            # 每秒只读 1 字节
# 发送方
sock.sendall(b'x' * 10_000_000)   # 发 10MB
```

抓包能看到接收方 ACK 里的 `win=65535` 一路缩小到 `win=0`。一旦 `win=0`，发送方暂停，进入 persist timer——每隔一段时间发 1 字节探测包，等接收方 ACK 报新的窗口。**没流控的话**：发送方继续猛塞，接收方 buffer 溢出丢包，反而要重传，更慢。

### 案例 3：TIME_WAIT 把端口耗光怎么办

老式压测脚本每条请求开一个新连接，几分钟后 `netstat -an | grep TIME_WAIT | wc -l` 能跑到几万：

```bash
$ ss -s
TCP:  ... timewait 28341 ...
$ python pressure.py
OSError: [Errno 99] Cannot assign requested address
```

每个 TIME_WAIT 占住一个 (IP, port) 元组约 60 秒，本地临时端口（默认 32768-60999）一会儿就用完。**修法**：客户端用连接池复用、或服务端开 SO_REUSEADDR + 调小 `tcp_fin_timeout`、根本解法是 HTTP keep-alive 让一条连接跑很多请求。

## 踩过的坑

1. **CLOSE_WAIT 堆积 ≠ TIME_WAIT 堆积**：前者是"对方已发 FIN，应用没调 close()"——bug 在自己代码里；后者是"主动关闭方等 2*MSL"——属于协议本意，调参数就行。两者排错路径完全不同。
2. **高 QPS 短连接 TIME_WAIT 端口耗尽**：每条新连接消耗一个临时端口 60 秒，量大时端口分配失败。先上连接池或长连接，调 `tcp_tw_reuse` 是次选。
3. **把无线丢包当拥塞**：经典 TCP 默认 `loss == congestion`，于是降速。WiFi/5G 干扰丢包不是拥塞，BBR 不靠丢包改靠带宽 + RTT 估计部分修了这条假设。
4. **HTTP/2 over TCP 的 head-of-line blocking**：多路复用在 HTTP 层，但底层只有一条 TCP，单 segment 丢失阻塞所有 stream——HTTP/3 改用 QUIC 才在 transport 层把 stream 拆开。

## 适用 vs 不适用场景

**适用**：

- 需要按序、不丢、双向的字节流：HTTP/1.1、HTTPS、SSH、SMTP、IMAP、几乎所有数据库连接
- 内部 RPC、消息队列拉取、长连接推送（多数 WebSocket 落在 TCP 上）
- 跨多种中间盒的场景——TCP 是 NAT / 防火墙最熟悉的协议，最不容易被拦

**不适用**：

- 极低延迟容忍少量丢包：实时音视频、在线游戏，往往直接用 UDP（QUIC / WebRTC / 自研协议）
- 一发一收的小请求：DNS 查询、NTP 时间同步，三次握手开销大于 payload
- 需要原生多流不阻塞：HTTP/3 选 QUIC，把可靠性搬到 userspace

## 历史小故事（可跳过）

- **1974 年**：Cerf 和 Kahn 在 IEEE Trans. Comm. 发 'A Protocol for Packet Network Intercommunication'，提出 TCP 原型，那时 TCP 还包揽 IP 的活
- **1978 年**：TCP 与 IP 拆成两层——上层做 reliable，下层做"尽力而为"投递，hourglass 模型雏形
- **1981 年 9 月**：Jon Postel 把 TCP 正式定稿成 RFC 793，工业界开始照它实现
- **1988 年**：Van Jacobson 在 SIGCOMM 论文里加上拥塞控制三件套（slow start / congestion avoidance / fast retransmit），把那年崩溃的 ARPANET 拉回来
- **2008 / 2016 / 2022**：CUBIC 进 Linux 默认、Google 推 BBR、HTTP/3 把 QUIC 推上主流——TCP 第一次被严肃挑战，但仍是数据库 / SSH / 内部 RPC 主场

## 学到什么

1. **end-to-end 原则**：可靠性放在两端做，不要求中间路由 stateful——这是互联网能扩到全球的底层假设
2. **hourglass 模型**：IP 是细腰，上下都可以多样；TCP / UDP 共生让"可靠"和"低延迟"各取所需
3. **协议演进受向后兼容拉扯**：拥塞控制 30 多年从 Tahoe 一路改到 BBR，还得在老 middlebox 面前装作自己没变
4. **抽象的代价是看不见**：sendall / recv 干净，但 TIME_WAIT、HoL、握手 RTT 都会在压测时跳出来要账，性能问题往往是"抽象漏出来"的瞬间

## 延伸阅读

- 书：Stevens《TCP/IP Illustrated, Vol.1》——把每个字段抓包讲一遍的经典，工程师必读
- 论文：[Van Jacobson, Congestion Avoidance and Control, SIGCOMM 1988](https://ee.lbl.gov/papers/congavoid.pdf)（拥塞控制起源，被引上万）
- 标准：[RFC 9293](https://www.rfc-editor.org/rfc/rfc9293)（2022 把 TCP 散落在多个 RFC 的修订重整成一份）
- 视频：[Computerphile — TCP Congestion Control](https://www.youtube.com/watch?v=TWzvXaxR6us)（25 分钟把 slow start 与 CUBIC 讲完）
- [[quic]] —— TCP 的现代替代品，HTTP/3 底层
- [[http2]] —— 暴露 TCP HoL blocking 限制的应用层多路复用

## 关联

- [[quic]] —— 把可靠传输从 kernel 搬到 userspace 的 TCP 替代品
- [[http2]] —— 多路复用揭露 TCP head-of-line blocking 的限制
- [[paxos]] —— 共识算法默认底下有 reliable transport，多半就是 TCP
- [[raft]] —— Raft 论文的 RPC 通道默认 TCP，不再操心丢包
- [[kafka]] —— broker 与 consumer 的长连接全部走 TCP，靠 keep-alive 避免握手成本
- [[lamport-1978]] —— 逻辑时钟在分布式系统里的地位，与 TCP 序号给"先后"的角色相通

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aave-v3]] —— Aave V3 — 借贷协议旗舰
- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[akamai-2010]] —— Akamai 2010 — 从内容分发网络长成全球应用平台
- [[b4-2013]] —— B4 — Google 用 SDN 把跨数据中心 WAN 利用率拉到 95%+
- [[bbr-2017]] —— BBR 2017 — 用瓶颈带宽和最小 RTT 替代丢包当拥塞信号
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[compound-v3]] —— Compound III (Comet) — 单抵押借贷重构
- [[coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[cubic-2008]] —— CUBIC 2008 — Linux 默认拥塞控制，三次曲线把千兆带宽喂饱
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[ebpf]] —— eBPF — 用户写小程序，内核证明安全后再跑
- [[gao-2001-as-relations]] —— Gao 2001 — 用算法猜出互联网上 AS 之间谁给谁付钱
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[jacobson-1988]] —— Jacobson 1988 — 让互联网不再被自己塞死
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[mahajan-2002-bgp-misconfig]] —— Mahajan 2002 — 三周看互联网，1% 的路由更新是手滑
- [[metcalfe-boggs-1976]] —— Metcalfe-Boggs 1976 — 一根线上几百台电脑怎么不打架
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[mockapetris-1988-dns]] —— Mockapetris 1988 DNS — 设计者亲口讲为什么 DNS 长这样
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"
- [[paxos]] —— Paxos — 分布式共识算法
- [[phoenix]] —— Phoenix — Elixir/OTP 上的实时 web 框架
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[raft]] —— Raft — 易理解的共识算法
- [[red-1993]] —— RED — 让路由器在队列还没塞满时就提前丢包
- [[rtp-rfc-1889]] —— RTP RFC 1889 — 让 UDP 也能跑实时音视频
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[tcp-vegas-1995]] —— TCP Vegas 1995 — 不等丢包，靠 RTT 早一步看见拥塞
- [[tls-1.3]] —— TLS 1.3 — 把 HTTPS 握手砍到一个来回
- [[uniswap-v3]] —— Uniswap V3 — 集中流动性 AMM 核心合约
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统
- [[zephyr]] —— Zephyr — 一份代码树跑遍所有嵌入式芯片的开源 RTOS

