---
title: QUIC — 把可靠传输从内核搬到用户空间
来源: 'Iyengar & Thomson, "QUIC: A UDP-Based Multiplexed and Secure Transport", RFC 9000, IETF 2021'
日期: 2026-05-30
分类: 计算机网络
难度: 中级
---

## 是什么

QUIC 是一套**让网页加载更快、手机切网络不断连**的传输协议。日常类比：你以前打长途电话，挂了重拨要重新报姓名、确认身份、说明事由——QUIC 像是"换张 SIM 卡，电话不挂，对面还认识你"。

它本来是 Google 内部 2012 年的实验，后来 IETF 接手做标准化，2021 年 5 月发布 RFC 9000 / 9001 / 9002 三件套。今天访问 YouTube / Cloudflare / Facebook，浏览器和服务器之间走的多半就是 QUIC——但你看不见，因为它"假装自己是 UDP"在跑。

技术上一句话：QUIC 把 TCP + TLS 加密 + HTTP/2 多路复用这三层，**重组成一层跑在 UDP 之上的协议**，并且整个实现完全在用户空间（不在操作系统内核里）。

为什么必须重新发明？因为 TCP 在内核里、改不动；中间盒（防火墙、NAT、加速器）会拦截不认识的 TCP option，让协议演进事实上停滞了 20 年。QUIC 跑在 UDP 上，包头大部分加密，中间盒看不懂也改不了——这才能在用户空间自由迭代。

## 为什么重要

不理解 QUIC，下面这些事都没法解释：

- 为什么 Chrome 第二次访问 YouTube 比第一次快很多——QUIC 的 0-RTT 重连
- 为什么手机从 WiFi 切到 4G，B 站直播不卡顿不重新缓冲——QUIC 连接迁移
- 为什么 HTTP/3（RFC 9114）必须基于 QUIC 而不是 TCP——TCP 的几个结构性问题没法在 TCP 里修
- 为什么过去 20 年 TCP 几乎没大改过——内核 + 中间盒双重制约，QUIC 跳出去才能演进

## 核心要点

QUIC 的设计可以拆成**三个关键决定**：

1. **把 TLS 握手揉进连接握手**：经典 HTTPS 是 TCP 三次握手 + TLS 握手，至少 2 RTT；QUIC 第一组 packet 同时带 TLS ClientHello，1 RTT 就建好。重连用 PSK 票据，0 RTT 直接发数据。类比：进门和验身份证合并成一步。

2. **流（stream）下沉到传输层**：HTTP/2 把多个请求挤进一个 TCP 连接，但 TCP 只看到字节流——一个包丢了所有请求都卡。QUIC 让每个请求是独立 stream，丢包只影响自己。类比：一栋楼里每户独立水管，一户漏水别户照常用。

3. **Connection ID 替代 (IP+port) 元组**：TCP 连接绑死在四元组上，IP 一变连接就断。QUIC 用一个独立 ID 标识连接，IP 怎么变都认得。类比：你换手机号，朋友通讯录里"老王"还是同一个人。

这三个决定背后还有一个共同思路：**包号单调递增不重传**。TCP 重传同一个包用同一个 seq number，导致收 ack 时分不清是原始包还是重传包；QUIC 重传必须用新包号，RTT 测量天然准确，拥塞控制能用更精细信号（loss range / delay）做决策。

## 实践案例

### 案例 1：浏览器走 HTTP/3 拉首页

```bash
curl --http3 -v https://cloudflare.com/
```

观察握手：

- 第一次访问：1 RTT 建连，server 在握手最后一步立即开始发数据
- 第二次访问：0 RTT，client 第一个包就带应用数据
- server 通过 `Alt-Svc: h3=":443"` header 告诉浏览器"我也支持 HTTP/3"，浏览器后台升级

这是 HTTP/3 在公网最常见的部署模式：渐进式升级，先走 TCP+TLS，下次走 QUIC。

### 案例 2：手机切网络的连接迁移

场景：在咖啡馆 WiFi 看视频，走出门切到 4G。

- TCP：源 IP 变（10.0.0.5 → 39.144.x.x），TCP 四元组变了，连接断，视频卡住重连
- QUIC：Connection ID 不变，client 用同一个 CID 从新 IP 发包；server 发 `PATH_CHALLENGE` 验证新地址不是伪造，client 回 `PATH_RESPONSE`，连接路径切换完成。视频不间断

代码层面：用 `quiche` / `quinn` 这类库时，迁移是自动的；你只需要在 client 配置里允许 path migration。

### 案例 3：流级多路复用对抗丢包

```python
# 用 aioquic 同时开 3 个 stream 并行下载
async with connect("server", 443) as conn:
    s1 = conn.create_stream()  # 下载 a.html
    s2 = conn.create_stream()  # 下载 b.css
    s3 = conn.create_stream()  # 下载 c.js
    # 模拟 1% 丢包：只影响命中的那个 stream
```

如果 stream 1 的某个包丢了，stream 2 和 3 的数据照常处理。HTTP/2 over TCP 同样场景下三个全卡——这是 QUIC 解决的"传输层 head-of-line blocking"问题。

实测在 1% 丢包率的网络下，HTTP/2 over TCP 的吞吐可能比 HTTP/1.1 多连接还差（Akamai 2017 测试），而 QUIC 仍能维持高效并发。

## 踩过的坑

1. **UDP 被企业 firewall 屏蔽**：很多公司网络出于安全考虑默认禁 UDP 出站，QUIC 必须 fallback 到 TCP+TLS。这是 QUIC 部署率上不去的最大原因。

2. **用户空间性能不如内核 TCP**：每个 packet 都要 syscall + 用户态加解密，早期 CPU 是 TCP 的 3-4 倍；用 io_uring + UDP GSO/GRO 优化后还有 1.5-2 倍开销。

3. **0-RTT 数据可被重放**：与 TLS 1.3 0-RTT 一样的问题。HTTP/3 规范禁止把 POST/PUT 等非幂等请求放 0-RTT，但应用配错就可能重复扣款。

4. **debug 工具链滞后**：包头大部分加密，传统 tcpdump + Wireshark 工作流必须导出 `SSLKEYLOGFILE` 才能看到内部结构，运维成本上升。

此外，连接迁移在企业 stateful firewall 下经常失败（防火墙看到源 IP 变直接丢包），所以"无缝迁移"的承诺在公网友好，企业内网打折。

## 适用 vs 不适用场景

**适用**：

- 移动端网页 / App（频繁切网络场景）
- 高延迟跨地域链路（0-RTT + 1-RTT 节省明显）
- 需要多路并发的 HTTP/3 服务（YouTube / 直播 / API gateway）
- CDN 边缘节点（Cloudflare / Akamai 全量上）

**不适用**：

- 企业内网（UDP 常被屏蔽）
- 超高吞吐 server-to-server（kernel TCP + DPDK 仍领先）
- 极端嵌入式 / IoT（用户空间加解密 CPU 吃不消）
- 必须穿越遗留中间盒的场景（NAT 老设备识别不了 QUIC）

## 历史小故事（可跳过）

- **1981 年**：Postel 发布 RFC 793，TCP 定稿，成为互联网传输支柱
- **2012 年**：Google 内部上线 gQUIC，YouTube 首先试点
- **2016 年**：IETF QUIC 工作组成立，draft-00 公开
- **2018 年**：Google 把 gQUIC 正式分叉给 IETF 标准化
- **2021 年 5 月**：RFC 9000 / 9001 / 9002 三件套定稿
- **2022 年 6 月**：RFC 9114 HTTP/3 发布，QUIC 成为 HTTP 默认 transport
- **2023 年**：Cloudflare 报告 QUIC 流量占其总流量 30%+ 并持续上升

QUIC 是 TCP 在 1981 年成为互联网传输支柱后第一次被严肃挑战。有意思的是，它没有"取代" TCP——浏览器仍同时维护 HTTP/1.1 / HTTP/2 / HTTP/3 三套实现，QUIC 走机会主义升级（Alt-Svc）。完全切换可能要 5-10 年甚至更久。

## 学到什么

1. **重新分层是协议工程的关键创新**：QUIC 把 TCP / TLS / HTTP/2 三层重组在一层，比单点优化收益大
2. **可靠传输不必在内核**：用户空间实现是可行的工程取舍，前提是有 io_uring + GSO/GRO 等基础设施配合
3. **加密整个传输是抗僵化的根本**：协议演进不被中间盒卡死的唯一办法是让中间盒"看不懂"
4. **Connection ID 解耦了"连接身份"和"网络身份"**：是连接迁移的关键抽象
5. **包号单调递增不重传**：消除 retransmission ambiguity，让 RTT 测量与拥塞控制都更精确
6. **协议标准化 vs 实现碎片化**：RFC 9000 一份，库 6+ 个（quiche / quinn / msquic / aioquic / lsquic / mvfst），生态成熟还需时间

## 延伸阅读

- 视频：[Cloudflare — HTTP/3 Explained](https://www.youtube.com/watch?v=qpAtcgcqJto)（30 分钟讲清 QUIC + HTTP/3 关系）
- 在线书：[Daniel Stenberg — HTTP/3 Explained](https://http3-explained.haxx.se/)（curl 作者维护，开放手册）
- 论文 PDF：[Langley et al., "The QUIC Transport Protocol", SIGCOMM 2017](https://research.google/pubs/the-quic-transport-protocol-design-and-internet-scale-deployment/)（Google gQUIC 部署经验）
- RFC：[RFC 9000](https://www.rfc-editor.org/rfc/rfc9000.html) / [9001](https://www.rfc-editor.org/rfc/rfc9001.html) / [9002](https://www.rfc-editor.org/rfc/rfc9002.html)（QUIC 三件套）
- 论文：["QUIC is not Quick Enough over Fast Internet", NSDI 2024](https://www.usenix.org/conference/nsdi24)（挑战 QUIC 在高带宽场景的性能）

## 关联

- [[tls-1-3]] —— QUIC 内嵌 TLS 1.3 作为加密层，RFC 9001 专门规定集成方式
- [[http-2]] —— QUIC 想解决的痛点很多来自 HTTP/2 over TCP 的结构性问题
- [[tcp]] —— QUIC 的对照组，TCP 在内核 + 单字节流是 QUIC 的反面
- [[io-uring]] —— 让 QUIC 用户空间实现批量化 syscall，缩小与内核 TCP 的性能差距
- [[bigtable-2006]] —— 大型分布式数据库未来可能用 QUIC 替代 gRPC over HTTP/2
- [[paxos]] —— 共识协议假定 reliable transport，QUIC 是新一代分布式系统的传输底座
- [[bert]] —— LLM serving 在移动端切网络时，QUIC 连接迁移让推理流不中断

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aes]] —— AES Rijndael 对称分组密码
- [[attention]] —— Attention Is All You Need
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[bigtable-2006]] —— Bigtable 2006 — Google 把行级随机读写做到 PB 级的存储系统
- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[gcc-webrtc-2016]] —— GCC (WebRTC) — 让视频通话不卡的拥塞控制算法
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[ice-rfc-5245]] —— ICE (RFC 5245) — 让两台藏在 NAT 后面的设备找到彼此
- [[io-uring]] —— io_uring — Linux 让 N 次 IO 摊销到 1 次 syscall
- [[jacobson-1988]] —— Jacobson 1988 — 让互联网不再被自己塞死
- [[paxos]] —— Paxos — 分布式共识算法
- [[raft]] —— Raft — 易理解的共识算法
- [[rtp-rfc-1889]] —— RTP RFC 1889 — 让 UDP 也能跑实时音视频
- [[salsify-2018]] —— Salsify — 让编码器和传输层一起商量怎么发视频
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tls-1.3]] —— TLS 1.3 — 把 HTTPS 握手砍到一个来回

