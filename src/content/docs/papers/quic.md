---
title: QUIC UDP-Based Multiplexed Secure Transport
来源: 'RFC 9000, "QUIC: A UDP-Based Multiplexed and Secure Transport", IETF QUIC Working Group, May 2021'
---

# QUIC — 把可靠传输从内核搬到用户空间

## 一句话总结

QUIC（RFC 9000，2021 年 5 月）是 IETF QUIC 工作组发布的下一代传输层协议，由 Jana Iyengar（Fastly）和 Martin Thomson（Mozilla）主笔。它把"可靠、有序、加密、多路复用"这一整套语义从 TCP+TLS+HTTP/2 三层组合里抽出来，重组在一个跑在 UDP 之上、**完全位于用户空间**的协议里。源头是 Google 的 gQUIC（2012 年内部部署，2013 年公开），经过 6 年生产实战 + 4 年 IETF 标准化（draft-00 到 draft-34），2021 年 RFC 9000-9002 三件套定稿。

设计目标：

1. **少一个 RTT**：握手把 TLS 1.3 内嵌，连接建立 1-RTT；恢复连接 0-RTT
2. **流级多路复用**：解决 HTTP/2 over TCP 的 head-of-line blocking 问题
3. **加密整个传输**：包头大部分加密，中间盒看不见也改不了
4. **连接迁移**：用 connection ID 替代 (IP+port) 元组，移动设备切网络保持连接
5. **协议演进自由**：在用户空间，client / server 升级即可，不依赖 OS kernel
6. **抗中间盒僵化**：握手 packet 加密 + 版本协商，未来版本不会被 middlebox 卡住

它今天是 HTTP/3（RFC 9114, 2022）的默认 transport，部署面：YouTube / Cloudflare / Facebook / Akamai / Google Search / Apple Private Relay 都在跑。Cloudflare 报告 2023 年 QUIC 流量占其总流量 30%+ 并持续上升。这是 TCP 在 1981 年（RFC 793）成为互联网传输支柱后第一次被严肃挑战。

为什么要专门读 RFC 9000 而不是只用 quiche / quinn 等库？

1. QUIC 把 TCP + TLS + HTTP 三层重组，理解层次划分变化才能解释性能模型
2. 0-RTT、连接迁移、stream priority 这些 feature 的边界只有读规范才知道
3. QUIC 的拥塞控制（RFC 9002）与 TCP 形似神不同，靠库默认配不出最优
4. 在用户空间重做可靠传输有一系列工程取舍（CPU 开销 / GSO / GRO / 零拷贝），读源码前先要懂协议

本笔记按 Layer 0 速查 → 动机 → 3 个 Definition → 核心机制详解（包结构 / 握手 / 多 stream / 拥塞 / 迁移）→ 与 TCP 对比 → 与 HTTP/3 关系 → 限制 → 怀疑 → permalinks → 学到 + 关联 的顺序展开。

![QUIC 协议栈对比 vs TCP+TLS+HTTP/2](/papers/quic/01-stack-comparison.webp)

上图：左是经典四层（HTTP/2 / TLS / TCP / IP），右是 QUIC 把 TLS + 可靠性 + stream 框架揉进一层跑在 UDP 之上。这是协议工程的一次"重新分层"。

## Layer 0 — 协议档案速查

| 字段 | 值 |
|---|---|
| 协议名 | QUIC（Quick UDP Internet Connections，但 RFC 9000 不再展开缩写） |
| 标准 | RFC 9000（transport）/ RFC 9001（TLS 集成）/ RFC 9002（loss recovery + 拥塞控制） |
| 主笔 | Jana Iyengar（Fastly）+ Martin Thomson（Mozilla） |
| 工作组 | IETF QUIC Working Group |
| 发布 | 2021-05 |
| 起源 | Google QUIC（gQUIC，2012-2018 生产部署） |
| 草稿轮次 | draft-00 (2016-11) → draft-34 → RFC 9000（约 4 年标准化） |
| 底层 | UDP（IP 协议号 17） |
| 实现位置 | 用户空间（vs TCP 在 kernel） |
| 加密层 | TLS 1.3 内嵌（RFC 9001） |
| 完整握手 | 1-RTT |
| 恢复握手 | 0-RTT（基于 TLS 1.3 PSK） |
| 包结构 | Long Header（握手）+ Short Header（数据） |
| 包号 | 单调递增，每个 packet number space 独立（Initial / Handshake / Application） |
| Stream 数 | 单向 + 双向，最多 2^62 |
| Stream ID 编码 | 低 2 bit 区分发起方 + 单/双向 |
| 流量控制 | 双层（connection-level + stream-level） |
| 拥塞控制 | 默认 NewReno（RFC 9002 §7）/ 可换 BBR / CUBIC |
| 连接迁移 | Connection ID 替代 (IP+port) 元组 |
| 默认拥塞窗口 | 14600 字节（10 MSS） |
| 最大包长 | 受 PMTU 限制，典型 1200-1452 字节 |
| ACK 机制 | ACK frame 携带 ack range（vs TCP 单累积 ack） |
| 0-RTT 安全风险 | replay 攻击（应用层 idempotency 责任） |
| 主流实现 | Chromium net/quic / quiche (Cloudflare) / quinn (Rust) / msquic (Microsoft) / aioquic (Python) / lsquic (LiteSpeed) / mvfst (Meta) / picoquic |
| Linux 内核 | 6.9+ 提供部分 io_uring + UDP GSO/GRO 加速；尚无完整 kernel QUIC |
| 部署率（Cloudflare 2023） | 30%+ 流量 |
| 上层 | HTTP/3（RFC 9114, 2022）/ MASQUE / WebTransport / DNS-over-QUIC |

## Section 1 — 动机：TCP+TLS+HTTP/2 的结构性问题

要理解 QUIC，先要看它是从哪些痛点反推出来的。

### 痛点 1：握手 RTT 累积

经典 HTTPS 连接建立步骤：

```
1. TCP 三次握手     1 RTT
2. TLS 1.2 握手     2 RTT
3. HTTP request    0.5 RTT
————————————————————————
合计                3.5 RTT
```

移动网络 RTT 100-300 ms，3.5 RTT = 350-1050 ms。第一字节响应时间一半都是握手。

TLS 1.3 把握手压到 1 RTT，组合后是 2 RTT。但 TCP 三次握手仍是结构性下限。

QUIC 的解法：把 TCP 握手 + TLS 握手合二为一，第一组 packet 同时传输 TCP 等价的连接建立信息 + TLS ClientHello。1 RTT 完成所有事，warm 重连 0-RTT。

### 痛点 2：HTTP/2 over TCP 的 head-of-line blocking

HTTP/2（RFC 7540, 2015）在一个 TCP 连接上多路复用多个 stream。**应用层** stream 之间是独立的，但**传输层**只有一个 byte 流。任何一个 IP 包丢失，整个 TCP 连接的所有 stream 都要等待重传。

```
TCP byte 流: [S1][S1][S2][LOST][S3][S2][S1][S3]
                          ↑
              TCP 重传，S2 / S3 也被卡住
```

这与 HTTP/2 多路复用的初衷直接冲突。在 1% 丢包率下，HTTP/2 over TCP 实测性能可能比 HTTP/1.1 多连接还差（参考 Akamai 2017 测试）。

QUIC 的解法：把"流"概念下沉到传输层。每个 stream 独立编号，loss 只影响自己。

![QUIC stream 多路复用解决 head-of-line blocking](/papers/quic/02-stream-multiplexing.webp)

上图：上半 HTTP/2 over TCP，一个丢包让所有 stream 停摆；下半 QUIC，只有 Stream 2 等待重传，Stream 1 / 3 继续前进。

### 痛点 3：协议僵化（ossification）

TCP 在 kernel 里。kernel 升级慢，部署面广。新增 TCP option（如 Multipath TCP / TCP Fast Open）经常被中间盒丢弃 / 改写。结果：协议演进事实上停滞了 20 年。

更糟的是 ECN（Explicit Congestion Notification）这种早就标准化的功能，因为部分中间盒不识别 ECN 标志位会触发故障，长期默认关闭。

QUIC 的解法：

1. 跑在 UDP 上，中间盒只能看到 UDP datagram，无法干预内部
2. 包头大部分加密（含包号、frame 类型），中间盒连"这是什么 frame"都看不到
3. 协议在用户空间，client / server 各自升级即可

### 痛点 4：连接绑定 (IP+port) 元组

TCP 连接由 (源 IP, 源 port, 目的 IP, 目的 port) 唯一标识。手机从 WiFi 切 4G，源 IP 变，TCP 连接断。所有 socket 都要重建，重新握手，重新 TLS。

QUIC 的解法：连接由 **Connection ID** 标识。client 改 IP，只要 Connection ID 不变，server 仍能识别。配合 path validation（server 主动 ping 新地址防止 NAT spoofing），实现真正的连接迁移。

### 痛点 5：可靠性 + 加密的边界混乱

TCP 提供可靠性，TLS 提供加密。但顺序是先 TCP ack 再 TLS 解密——意味着攻击者可以构造看起来 TCP 合法但 TLS 解密失败的 packet 触发 server 状态机异常。RST 注入攻击就利用这点。

QUIC 的解法：包号本身被 TLS 保护，未通过 TLS 验证的 packet 直接丢，不进入可靠性逻辑。可靠性 + 加密原子化。

## Section 2 — 三个核心 Definition

### Definition 1：Connection ID

Connection ID 是 8-20 字节的不透明 bit 串，由握手双方各自分配（client 和 server 各持有一组）。它在所有 packet 头里出现，**取代** (IP+port) 作为连接标识。

为什么这是关键创新：

1. **支持迁移**：IP 变了，Connection ID 不变，server 用 Connection ID 查到连接状态
2. **支持负载均衡**：load balancer 用 Connection ID 路由到正确的 backend，不必看 IP
3. **抗 linkability**：server 可以下发多个 Connection ID（NEW_CONNECTION_ID frame），client 用不同 CID 发不同 path 的包，监听者无法把它们关联到同一个用户
4. **server 内部状态查找**：CID 的前几字节可以编码 server-id，CID 本身就是路由 key

挑战：CID 加密的难点。CID 在 packet 头里**不加密**（因为路由器需要它路由），所以监听者能看到。但 server 通过 NEW_CONNECTION_ID 持续轮换 CID，单个连接生命周期内可以用多个 CID，linkability 在时间维度被打散。

### Definition 2：Packet Number Space

QUIC 的包号不是单一计数器，分三个独立空间：

1. **Initial** —— 初始握手 packet，TLS ClientHello / ServerHello 走这里
2. **Handshake** —— 握手后续，TLS EncryptedExtensions / Certificate / Finished
3. **Application** —— 数据传输

每个空间各自从 0 开始递增。**为什么要分**：每个空间用不同的 TLS secret 派生加密密钥（Initial secret / Handshake secret / 1-RTT secret），重置包号后老 secret 永远不再用，简化密钥管理。

包号是**单调递增不重传**——TCP 重传同一个包用同一个 seq number，QUIC 重传必须用新包号。这避免了 retransmission ambiguity（TCP 永恒难题：收到 ack 后无法判断是 ack 原始包还是重传包，影响 RTT 测量）。

### Definition 3：Stream

Stream 是 QUIC 内的逻辑通道，独立可靠传输。属性：

| 属性 | 说明 |
|---|---|
| Stream ID | 62-bit 整数，低 2 bit 编码方向 + 发起方 |
| 单向/双向 | bit 1：0=双向，1=单向 |
| 发起方 | bit 0：0=client 发起，1=server 发起 |
| 状态机 | Open → Half-Closed (远端关) → Closed |
| 流控 | 独立的 MAX_STREAM_DATA + connection-level MAX_DATA |

Stream 之间**完全独立**。一个 stream 的字节顺序保证（in-order），跨 stream 没有顺序保证。这正是解决 HTTP/2 head-of-line blocking 的关键。

Stream 是**轻量**的——可以无限创建，server 通过 MAX_STREAMS frame 控制 client 能开的并发数。HTTP/3 一个请求一个 stream，请求完关闭，stream ID 不复用。

## Section 3 — 包结构详解

QUIC 包分两类：

### Long Header Packet

握手阶段使用，因为双方还没固定 Connection ID。结构：

```
+-+-+-+-+-+-+-+-+
|1|1|T T|R R|P P|   (Long Header flag)
+-+-+-+-+-+-+-+-+
|         Version (32 bits)             |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| DCID Len | Destination Connection ID (0..160) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| SCID Len | Source Connection ID (0..160)      |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|         Type-Specific Payload         |
```

类型 T T 编码 4 种：Initial / 0-RTT / Handshake / Retry。

Long Header 大、包含完整双方 CID、未加密 Version / CID、加密 payload。

### Short Header Packet

握手完成后用，已经协商了 destination connection ID。结构：

```
+-+-+-+-+-+-+-+-+
|0|1|S|R|R|K|P P|   (Short Header flag)
+-+-+-+-+-+-+-+-+
| Destination Connection ID (length determined by endpoint) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Packet Number (8/16/24/32 bits, header-protected) |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
| Frames (encrypted payload)                |
```

K bit 是 key phase，触发密钥更新（key rotation）；P P 是包号长度。

包内部是一系列 **frame**，frame 类型有 28 种（CRYPTO / STREAM / ACK / MAX_DATA / NEW_CONNECTION_ID / PATH_CHALLENGE / PATH_RESPONSE / CONNECTION_CLOSE / ...）。一个 packet 携带多个 frame，frame 是真正承载语义的单位。

### Header Protection

包号本身也被加密保护（"header protection"），用 AEAD key 派生的额外密钥。这意味着：

- 监听者看不到包号顺序（防止流量分析）
- 监听者看不到 short header 的 K bit（防止判断密钥轮换时机）
- 中间盒无法基于包号路由 / 重排

## Section 4 — 1-RTT 握手详解

QUIC 把 TCP-like 连接建立和 TLS 1.3 握手合并：

```
Client                                             Server
  Initial[CRYPTO: ClientHello + key_share]  ----->         (RTT 1 begin)
                              <-----  Initial[CRYPTO: ServerHello]
                              <-----  Handshake[CRYPTO: EE, Cert, CV, Fin]
                              <-----  1-RTT[STREAM: data?]
  Initial[ACK]                              ----->
  Handshake[CRYPTO: Fin]                    ----->
  1-RTT[STREAM: data]                       ----->         (RTT 1 end, first byte)
```

要点：

1. ClientHello 走 Initial packet，里面是 TLS 1.3 ClientHello（含 key_share）
2. Server ServerHello + 证书 + Finished 全部塞在一组 packet 里
3. Server 在 Finished **之后立即发** 1-RTT 数据（应用数据），client 拿到 ServerHello 解密 1-RTT key 后即可读
4. Client 端 Finished 用 Handshake 包发，应用数据用 1-RTT 包发

实际首字节延迟：client 发 Initial → server 回 Handshake + 1-RTT 数据。1 RTT 完成。

### 0-RTT 重连

如果 client 之前与 server 握过手，server 下发了 NEW_TOKEN frame 包含 PSK ticket。下次连接：

```
Client                                             Server
  Initial[CRYPTO: ClientHello + PSK]
  + 0-RTT[STREAM: data]                      ----->        (RTT 0!)
                                <-----  Initial[ACK]
                                <-----  Handshake[CRYPTO: Fin]
                                <-----  1-RTT[STREAM: data]
```

0-RTT 数据**和握手 packet 一起发**，server 用 PSK 解密。Round trip 是 0：在 client 第一次发包时数据已经在路上了。

风险：0-RTT 数据可被重放（与 TLS 1.3 0-RTT 一致）。应用层必须 idempotent。HTTP/3 规范禁止把 POST/PUT 等非幂等请求放在 0-RTT。

## Section 5 — 拥塞控制 + 丢包恢复（RFC 9002）

QUIC 的拥塞控制设计目标：与 TCP 友好（不抢带宽）+ 利用 QUIC 信息更优。

默认算法：NewReno（RFC 5681 风格），但 QUIC 提供的信号比 TCP 更丰富：

1. **每个 packet 有唯一包号**：消除 retransmission ambiguity，RTT 测量准
2. **ACK frame 携带 ACK range**：一次 ACK 可确认多个不连续 packet（vs TCP 单累积 ack + SACK option），更精确的 loss 检测
3. **Explicit ACK delay**：receiver 报告自己 delay 了多久，sender 算 RTT 时减掉
4. **PTO（Probe Timeout）取代 RTO**：探测丢包用专门的 PTO frame，不浪费包号

阈值检测丢包：QUIC 用"包号差"和"时间差"双触发。一个 packet 之后有 N 个 packet（默认 N=3）已收到 ack 但它没有，或者过了 9/8 RTT 没 ack，判定丢失。这比 TCP 的"3 dup ack"更准。

可换算法：库实现通常支持 BBR / CUBIC 切换。Cloudflare quiche 默认支持 CUBIC + BBR，msquic 默认 CUBIC。

## Section 6 — 连接迁移

场景：手机从 WiFi 切 4G。

TCP：连接断，需要重新建立 + TLS 重握手。

QUIC：

```
1. Client IP 变（A → B）
2. Client 用同一个 Connection ID 从新 IP 发 packet
3. Server 收到，发现 source IP 变了
4. Server 发 PATH_CHALLENGE frame 到新 IP（防伪造）
5. Client 用新 IP 回 PATH_RESPONSE
6. 验证通过，server 把连接的 path 切到新 IP
7. 之前的 in-flight packet 从老 path 收到的也 OK（reordering 容错）
```

整个过程没有重新握手，没有应用层重连。视频流 / 直播 / VoIP 体验改善巨大。

挑战：

- **NAT rebinding**：NAT 设备可能改写源 IP/port，server 看到的"新地址"不是 client 真实地址。Path validation 解决
- **Server 端 stateful firewall**：很多企业 firewall 看到 source IP 变直接丢包，连接迁移失败。短期内无法绕过

## Section 7 — QUIC vs TCP 对比表

| 维度 | TCP+TLS 1.3+HTTP/2 | QUIC+TLS 1.3+HTTP/3 |
|---|---|---|
| 完整握手 | 2 RTT (TCP 1 + TLS 1) | 1 RTT |
| 恢复握手 | 1 RTT | 0 RTT |
| 实现位置 | TCP 在 kernel | 用户空间 |
| 加密范围 | 应用数据 + TLS record | 应用数据 + 包头大部分 |
| 多路复用 | HTTP/2 应用层 | QUIC 传输层 |
| Head-of-line blocking | 一个 stream 卡所有 | 单 stream 独立 |
| 连接标识 | (IP+port) 四元组 | Connection ID |
| 连接迁移 | 不支持 | 支持 |
| 包号设计 | 重传同 seq | 单调递增不重传 |
| 拥塞控制 | NewReno/CUBIC/BBR (kernel) | NewReno/CUBIC/BBR (userspace) |
| ECN | 默认关 | 鼓励开 |
| 协议演进 | 受 kernel + middlebox 双重制约 | 用户空间，应用自己升级 |
| 中间盒可见 | TCP option / seq / ack 全可见 | 几乎全部加密 |
| CPU 开销 | 低（kernel 内核优化） | 较高（用户空间 + AEAD per packet） |
| 部署难点 | 几乎为零（everywhere） | UDP 在企业网偶被屏蔽 |
| 0-RTT 风险 | TLS 1.3 0-RTT replay | 同左 |

## Section 8 — 与 HTTP/3 的关系

HTTP/3（RFC 9114, 2022）= HTTP 语义 + QUIC transport。

主要变化：

1. **HEADERS frame 改用 QPACK** —— HTTP/2 用 HPACK 头压缩，但 HPACK 假定单 byte 流（依赖动态表的顺序更新）。HTTP/3 stream 独立后必须新设计 → QPACK（RFC 9204）解决 stream 间依赖
2. **不再需要 PRIORITY frame** —— HTTP/2 优先级树搞得很复杂，实际部署混乱。HTTP/3 改用 Extensible Priorities（urgency + incremental，RFC 9218）
3. **Server Push 默认关** —— HTTP/2 push 实际收益不明，HTTP/3 标准上仍保留但浏览器都关掉
4. **CONNECT-UDP / CONNECT-IP** —— HTTP/3 上跑 MASQUE，把任意 UDP/IP 隧道塞进 HTTP/3，是 Apple Private Relay 的基础

部署模式：浏览器先 TCP+TLS+HTTP/2 拉首屏，server 通过 `Alt-Svc` header 告知"我也支持 QUIC"，浏览器后台开 QUIC 连接，下次连接走 QUIC。所以 HTTP/3 部署是渐进的，不会切完全。

## Section 9 — 限制 + 部署痛点

1. **UDP 被企业 firewall 屏蔽** —— 大量企业网出于历史原因（DDoS / DNS amplification / VPN 流量）默认禁 UDP 出站。QUIC client 必须 fallback TCP+TLS。这是 QUIC 部署率上不去的最大原因
2. **用户空间性能与 kernel TCP 差距** —— 每个 packet 都要 syscall (sendmsg/recvmsg)、用户态加解密、用户态拥塞控制。Linux GSO/GRO + io_uring 能补一部分但仍未追平。Cloudflare 实测早期 QUIC server CPU 是 TCP 的 3-4 倍（quiche 优化后 2x 左右）
3. **包头加密让中间盒看不见** —— 这是设计目标但也是运维痛点：传统 TCP 网络抓包 + tcpdump + Wireshark 工作流在 QUIC 上要专门解密 tooling（导出 SSLKEYLOGFILE 等）
4. **NAT timeout 短**：UDP 在 NAT 上的 timeout 通常 30-60 秒，远短于 TCP 的小时级。QUIC 必须更频繁发 keep-alive，移动场景耗电略增
5. **连接迁移在企业 NAT 场景效果不确定** —— 企业 stateful firewall 看到 source IP 变直接丢，path validation 收不到。理论上的"无缝迁移"在公网/家庭 NAT 工作良好，企业网络打折
6. **HTTP/3 取代 HTTP/2 速度慢** —— HTTP/2 依然是大多数网站默认，浏览器对 HTTP/3 是机会主义升级。完全切换需要 5-10 年
7. **拥塞控制 CPU 成本** —— 用户空间实现拥塞控制每个 ack 都要更新窗口、计算 RTT，CPU 开销不小。kernel TCP 的 CUBIC 用 BTF/BPF 加速，QUIC 还在追
8. **0-RTT 数据 replay 攻击** —— 与 TLS 1.3 0-RTT 同样的问题。HTTP/3 规范禁非幂等请求，但应用配错就出事
9. **库生态不统一** —— quiche / quinn / msquic / aioquic / lsquic / mvfst 各有 API 风格，迁移成本高。没有 OpenSSL 那种事实标准
10. **DDoS amplification 风险** —— Initial packet 必须 padding 到 ≥ 1200 字节防 amplification，但攻击者仍可用 0-RTT 放大。RFC 9000 §8 专门讨论
11. **observability 工具链滞后** —— APM / metrics / tracing 工具对 QUIC 的支持远不如 HTTP/2。debugging 仍是 pain point
12. **kernel QUIC 缺位** —— Linux 6.9+ 才在 net/handshake 引入有限 QUIC 支持。完整的 kernel QUIC（类似 kernel TCP）还远未到位

## Section 10 — 演进 + 后续

- **RFC 9000**（2021-05）—— QUIC transport 标准
- **RFC 9001**（2021-05）—— TLS 1.3 与 QUIC 集成
- **RFC 9002**（2021-05）—— Loss recovery + 拥塞控制
- **RFC 9114**（2022-06）—— HTTP/3
- **RFC 9204**（2022-06）—— QPACK header compression
- **RFC 9218**（2022-06）—— Extensible HTTP Priorities
- **RFC 9221**（2022-03）—— Unreliable datagram extension
- **RFC 9250**（2022-05）—— DNS over QUIC
- **draft-ietf-masque-***（进行中）—— MASQUE（HTTP/3 上的隧道）
- **draft-ietf-quic-multipath**（进行中）—— 多路径 QUIC（类似 MPTCP）
- **draft-ietf-quic-ack-frequency**（进行中）—— ACK 频率优化
- **WebTransport**（W3C + IETF）—— 浏览器对 QUIC 的直接 API

未来方向：

1. **kernel QUIC offload** —— Linux 在加速 UDP GSO/GRO，未来可能完整把 QUIC 拉进 kernel
2. **多路径 QUIC** —— WiFi + 4G 同时跑，类似 MPTCP 但在用户空间
3. **后量子 QUIC** —— TLS 1.3 hybrid Kyber 自动让 QUIC 也后量子
4. **QUIC over satellite** —— Starlink / 卫星网络场景的特殊拥塞控制
5. **eBPF + QUIC** —— 用 eBPF 加速用户空间协议栈

## Section 11 — 在用户空间实现可靠传输的工程取舍

这是 QUIC 的核心争议点之一。

**优势**：

1. 协议升级解耦于 OS kernel，应用想用最新版本只需依赖更新
2. 拥塞控制可以用应用语义信息（如 stream priority）
3. 多端跨平台一致行为（kernel TCP 在 Linux / macOS / Windows / FreeBSD 实现略有差异）

**劣势**：

1. **每个 packet 一次 syscall** —— sendmsg / recvmsg 调用成本不低。Linux UDP GSO/GRO 把多 packet 合并到一次 syscall 缓解这个
2. **加解密在用户空间** —— AES-NI / VAES 硬件加速可以用，但内存拷贝多
3. **多核 scaling 难** —— 一个连接的状态在用户空间，多核分发要靠应用自己 sharding，不像 kernel TCP 有 RPS/RFS
4. **零拷贝难** —— 用户空间收到 packet 后还要解密，不能直接 splice 到磁盘 / 另一个 socket

工程进展：

- io_uring 把 syscall 批量化，sendmsg vector 一次 200+ packet
- UDP GSO（Generic Segmentation Offload）让一次 syscall 发多个 packet，kernel 拆分
- UDP GRO 让 kernel 把多个 packet 聚合后一次给用户空间
- AF_XDP 把 NIC packet 直接 mmap 到用户空间，绕过 kernel 网络栈

在这些加速下，2024 年实测 quiche / msquic 的吞吐已逼近 kernel TCP 的 70-80%，CPU 开销 1.5-2x 区间。差距还在缩小。

## 怀疑总集

> 怀疑：QUIC 跑在 UDP 上，但 UDP 在企业 firewall 经常被禁。这意味着 QUIC 部署事实上依赖 client 有 TCP fallback 路径。如果 fallback 必然存在，QUIC 真正能用上的场景只是"友好网络"——那 QUIC 解决的是真问题还是 best-case 优化？这是不是一种隐性的"网络中立性"假设崩塌？

> 怀疑：QUIC 把可靠传输放用户空间号称"摆脱 kernel 演进瓶颈"，但实测 CPU 开销 1.5-2x 于 kernel TCP。当 HTTP/3 流量从 30% 涨到 80% 时，全行业服务器电费会显著上升。Linux io_uring 部分追平，但 macOS / Windows / FreeBSD 没跟上。是不是协议演进自由的代价被低估？kernel QUIC 一旦做出来，"用户空间"的优势又消失大半？

> 怀疑：连接迁移在公网 / 家庭 NAT 工作良好，但企业 stateful firewall 看到 source IP 变就丢包，迁移失败。这意味着 QUIC 的杀手 feature"连接迁移"在企业网络打折。是不是只在"消费者移动场景"是真 feature，企业场景仍要 fallback？营销时是不是过度宣传？

> 怀疑：QUIC 包头大部分加密，监听者看不见。这是设计优点（隐私 / 抗僵化）但也是运维痛点：传统 tcpdump + Wireshark 工作流要专门导出 SSLKEYLOGFILE 才能 debug。生产事故时刻"加密换不可调试"是不是把成本转嫁给了运维团队？

> 怀疑：HTTP/3 取代 HTTP/2 走机会主义升级（Alt-Svc header）。但绝大多数网站 HTTP/2 over TCP 仍是默认。完全切换需要 5-10 年。在这期间，浏览器要同时维护 HTTP/1.1 / HTTP/2 / HTTP/3 三套实现。是不是 protocol fragmentation 的代价被埋单？

> 怀疑：0-RTT 数据 replay 攻击的应用层防御要求每个 endpoint 都正确实现 idempotency。HTTP GET 大体安全，但应用 RPC 接口（POST / RPC framework）出错率不低。"协议层把安全责任甩给应用"是 TLS 1.3 的老问题，QUIC 继承了它没解决。生产环境 0-RTT 配错出事是不是高发？

> 怀疑：QUIC 库（quiche / quinn / msquic / aioquic / lsquic / mvfst）API 风格各异，迁移成本高。没有 OpenSSL 那种事实标准。这意味着应用绑定特定库，未来更换困难。**协议标准化但实现碎片化**是不是 QUIC 生态的隐性问题？

> 怀疑：拥塞控制在用户空间实现，每个连接独立维护状态。一个 server 跑几十万 QUIC 连接，每个连接的 CUBIC / BBR 状态机都在 user heap 里。kernel TCP 有 hash-based 状态查找 + cache 友好布局。QUIC 用户空间状态是不是 cache 不友好？大规模并发下 LLC miss 显著？

## GitHub Permalinks

源码精读入口（每条都是稳定 commit hash 形式的 permalink，链接示意，未实际验证 SHA）：

- **Cloudflare quiche transport**：`https://github.com/cloudflare/quiche/blob/0.21.0/quiche/src/lib.rs`
- **Cloudflare quiche packet 处理**：`https://github.com/cloudflare/quiche/blob/0.21.0/quiche/src/packet.rs`
- **Cloudflare quiche stream**：`https://github.com/cloudflare/quiche/blob/0.21.0/quiche/src/stream/mod.rs`
- **Cloudflare quiche frame 编码**：`https://github.com/cloudflare/quiche/blob/0.21.0/quiche/src/frame.rs`
- **Cloudflare quiche 拥塞控制**：`https://github.com/cloudflare/quiche/blob/0.21.0/quiche/src/recovery/mod.rs`
- **quinn-rs connection**：`https://github.com/quinn-rs/quinn/blob/0.10.2/quinn-proto/src/connection/mod.rs`
- **quinn-rs streams**：`https://github.com/quinn-rs/quinn/blob/0.10.2/quinn-proto/src/connection/streams/mod.rs`
- **quinn-rs packet**：`https://github.com/quinn-rs/quinn/blob/0.10.2/quinn-proto/src/packet.rs`
- **aioquic 主入口**：`https://github.com/aiortc/aioquic/blob/1.2.0/src/aioquic/quic/connection.py`
- **aioquic packet builder**：`https://github.com/aiortc/aioquic/blob/1.2.0/src/aioquic/quic/packet_builder.py`
- **aioquic 拥塞控制**：`https://github.com/aiortc/aioquic/blob/1.2.0/src/aioquic/quic/congestion/__init__.py`
- **Chromium net/quic 主入口**：`https://github.com/chromium/chromium/blob/124.0.6367.207/net/quic/quic_session_pool.cc`
- **Chromium net/quic stream factory**：`https://github.com/chromium/chromium/blob/124.0.6367.207/net/quic/quic_stream_factory.h`
- **msquic core**：`https://github.com/microsoft/msquic/blob/v2.4.0/src/core/connection.c`
- **msquic stream**：`https://github.com/microsoft/msquic/blob/v2.4.0/src/core/stream.c`

精读建议：

1. 先读 quinn-rs 的 `connection/mod.rs`（Rust 类型系统让状态机表达极清晰，注释充分）
2. 对照 RFC 9000 §17 检查 packet 类型和编码
3. 然后读 Cloudflare quiche 的 `recovery/mod.rs` 看拥塞控制 + loss detection 实现
4. aioquic 是 Python 实现，慢但代码极简，适合理解整体流程
5. msquic 是 C 实现，性能优化最激进，适合学优化技巧

## 学到什么 + 关联

学到的：

1. **重新分层是协议工程的关键创新**：QUIC 把 TCP / TLS / HTTP/2 三层重组在一层，比单点优化收益大
2. **可靠传输不必在 kernel**：用户空间实现是可行的工程取舍，但需要 io_uring + GSO/GRO 等基础设施
3. **加密整个传输是抗僵化的根本**：协议演进不被中间盒卡死的唯一办法
4. **Connection ID 是连接迁移的关键抽象**：解耦 transport identity 和 network identity
5. **流概念下沉到传输层**：HTTP/2 应用层多路复用 + TCP 单 byte 流的撕裂在 QUIC 被根治
6. **包号单调递增不重传**：消除 retransmission ambiguity，RTT 测量更准
7. **0-RTT 是真实 tradeoff**：性能提升以应用层 idempotency 责任为代价
8. **协议标准化 vs 实现碎片化**：RFC 9000 一份，库 6+ 个，生态成熟还需时间
9. **协议演进受现实重力影响**：UDP 屏蔽、企业 NAT、middlebox 都是工程现实，再好的设计也得绕过
10. **观测性是新协议的隐性成本**：debugging tooling 滞后于协议发布是常态

关联：

- [[tcp]] —— QUIC 的对照组，TCP 在 kernel + 单 byte 流是 QUIC 的反面
- [[tls-1.3]] —— QUIC 内嵌 TLS 1.3 作为加密层，RFC 9001 专门规定集成方式
- [[paxos]] [[raft]] —— 共识协议假定 reliable transport，QUIC 是新一代分布式系统的传输底座
- [[bigtable]] [[spanner]] —— 大型数据库内部 RPC 未来可能用 QUIC 替代 gRPC over HTTP/2
- [[chubby]] —— ZooKeeper / Chubby 类锁服务的 client 协议在低延迟场景可受益于 QUIC 0-RTT
- [[clickhouse]] —— 跨数据中心复制流量在丢包网络下，QUIC 比 TCP 更优
- [[bert]] [[attention]] —— LLM serving API 在移动端从 4G/5G/WiFi 切换时，QUIC 连接迁移让推理流不中断

进一步阅读：

- RFC 9000 / 9001 / 9002（QUIC 三件套本体）
- RFC 9114（HTTP/3）
- "The QUIC Transport Protocol: Design and Internet-Scale Deployment"（Langley et al., SIGCOMM 2017，Google gQUIC 部署经验）
- "Same Standards, Different Decisions: A Study of QUIC and HTTP/3 Implementation Diversity"（IMC 2022 实测多个 QUIC 实现差异）
- Cloudflare blog "HTTP/3: From root to tip"（系列文章，部署视角）
- Daniel Stenberg "HTTP/3 explained" 在线书（开放手册，curl 作者维护）
- "QUIC is not Quick Enough over Fast Internet"（NSDI 2024，挑战 QUIC 在高带宽场景的性能假设）
- IETF QUIC WG mailing list archive（标准化讨论一手资料）
