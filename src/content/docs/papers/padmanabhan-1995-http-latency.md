---
title: Padmanabhan-Mogul 1995 — 把 HTTP 三种提速方案放一起跑，看谁真的快
来源: 'Venkata N. Padmanabhan, Jeffrey C. Mogul, "Improving HTTP Latency", Computer Networks and ISDN Systems Vol.28, Dec 1995（同名早期版 WWW 1994 大会）'
日期: 2026-06-01
分类: 网络协议
难度: 入门
---

## 是什么

Padmanabhan-Mogul 1995 是一篇**对照实验报告**。它把三种"让 HTTP 变快"的候选方案放进同一条真实网络链路，**用秒表掐时间**，然后告诉你哪种最值。

三个候选方案：

1. **持久连接**（persistent connection / keep-alive）：一根 TCP 不要用一次就关，让多个 HTTP 请求轮流用
2. **pipelining**（流水线）：客户端不等上个响应回来就连发下一个请求，服务端按顺序回
3. **T/TCP**（Transactional TCP, RFC 1644）：把 TCP 三次握手和首个数据包合并成一次发出去

日常类比：你点 11 杯奶茶。
- 原 HTTP/1.0 = 每点一杯都重新排队、付款、领单、回家放下、再回来排队。
- 持久连接 = 排一次队，11 杯一杯杯点完再走。
- pipelining = 排一次队，**11 杯一口气全报给店员**，店员按你说的顺序做。
- T/TCP = 让"排队 + 报单"合并成一个动作，但你还是得 11 次。

论文的贡献不是"想出"这些方案（其他人提过），而是**在跨美国的真实链路把它们一起跑一遍**，给出可比较的数字。

## 为什么重要

不读这篇，就解释不通：

- 为什么 HTTP/1.1（1997, RFC 2068）默认开 keep-alive，但 pipelining 一直是"可选"——本文实测里 pipelining 最快，但浏览器后来发现部署很难
- 为什么 HTTP/2（2015）出来后，浏览器还是默认对每个网站开 6 条连接——历史习惯加 pipelining 队头阻塞的阴影
- 为什么 HTTP/3 / QUIC 的 0-RTT 握手能成立——它走的是 T/TCP 那条思路，但用 UDP 重写避开了 TCP 的历史包袱
- 为什么今天 TCP Fast Open（RFC 7413, 2014）能把首请求 RTT 砍到 0——它就是 T/TCP 的精神继承者

这是 Web 性能领域**第一次用对照实验定性能**的论文。

## 核心要点

### 实验装置（关键，决定结论可不可信）

- **客户端**：Stanford 大学
- **服务端**：DEC WRL（西部研究实验室，加州 Palo Alto）
- **链路**：跨美国广域网，几十毫秒 RTT
- **被测对象**：典型 Web 页面（一个 HTML + 多个内联图片，比如 10 张图）

### 四种方案的"账单"对比

| 方案 | TCP 握手次数 | slow start 次数 | 每对象额外 RTT |
|------|-------------|----------------|---------------|
| HTTP/1.0 一请求一连接 | N（对象数） | N | 1 |
| 持久连接 keep-alive | 1 | 1 | 1（必须等响应） |
| 持久 + pipelining | 1 | 1 | 0（请求并发发） |
| T/TCP | 0（合并到首包） | N（仍然每对象重置） | 0 |

### 核心结论

1. **pipelining + 持久连接合用，相对原 HTTP/1.0 多对象页面延迟砍 2 倍以上**
2. **T/TCP 对单对象有改善，但多对象场景反而比 pipelining 慢**——因为 slow start 还是按对象重置
3. **持久连接单独用就有大幅改善**，pipelining 是锦上添花

这三条结论后来直接进了 RFC 2068（HTTP/1.1, 1997）：默认 keep-alive，可选 pipelining。

## 实践案例

### 案例 1：算一下为什么 pipelining 这么猛

设 RTT = 100ms，10 张图，每张 50ms 传输。

**HTTP/1.0**：每对象 (1 RTT 握手 + 1 RTT 请求-响应 + 50ms 传输) = 250ms × 10 = **2500ms**

**持久连接**：1 RTT 握手 + 10 × (1 RTT 请求-响应 + 50ms) = 100 + 1500 = **1600ms**

**持久 + pipelining**：1 RTT 握手 + 1 RTT 首请求 + 10 × 50ms = 100 + 100 + 500 = **700ms**

省下来的不是带宽——是**等空气来回的时间**。这就是 RTT 税。

### 案例 2：T/TCP 为什么不如想象中好

T/TCP 把 SYN 和数据合并发，单对象**省掉那 1 个 RTT 握手时间**。但论文实测里：

- 对**单文件**下载，T/TCP 比 HTTP/1.0 快一些
- 对**多对象**页面（10 张图），T/TCP 还是要建 10 次连接，**每次 slow start 都从 cwnd=1-2 重启**——传输阶段反而比"持久连接 + 大窗口"慢

教训：协议优化要看场景。Web 不是单事务，是"几十个小对象一起拉"，所以 T/TCP 对 Web 来说**修错了地方**。

### 案例 3：今天浏览器在做什么

打开 Chrome DevTools 看 Network 面板：

- HTTP/1.1 网站：通常每域名 6 条 TCP 连接并行（绕开 pipelining 队头阻塞）
- HTTP/2 网站：1 条 TCP 连接，所有请求多路复用（pipelining 思想 + 流并发）
- HTTP/3 网站：基于 UDP/QUIC，0-RTT 握手（T/TCP 思想 + 无 TCP 历史包袱）

每一条都能在本文里找到原型。

## 踩过的坑

1. **pipelining 队头阻塞**：第一个响应慢，后面所有请求**排队等**。本文用静态资源测得很顺，但真实网站常有动态接口慢，导致 pipelining 反而拖累——这就是浏览器 20 年不敢默认开 pipelining 的原因
2. **广域链路才显效**：本文 Stanford 到 DEC 跨美国，RTT 大，持久连接收益巨大。**局域网内 RTT 接近 0，几乎看不出差距**——别拿本文结论套局域网部署
3. **T/TCP 安全洞**：它简化握手的代价是**容易被伪造源地址攻击**，最终被 IETF 弃用。TCP Fast Open（2014）用 cookie 机制重做，才解决
4. **没考虑 HTTPS**：本文 1995 年，TLS 还在 SSL 时代。今天每条新连接还要叠 TLS 握手（再 1-2 个 RTT），持久连接的价值比本文测得的**更高**

## 适用 vs 不适用场景

**今天还有用的洞察**：

- 任何 RTT 敏感的协议设计——把"次数"当一等公民
- 任何"小对象多次请求"的场景——HTTP API 调用 / RPC / gRPC，都该考虑连接复用
- 设计新协议时，**对照实验** + **真实链路** > 纯理论分析

**不适用**：

- 大文件单次下载（瓶颈是带宽不是 RTT，本文优化无感）
- 局域网内服务调用（RTT 太低，省不出多少）
- 实时双向通信（WebSocket / WebTransport 走的是另一套，不是 HTTP 的 request-response 模型）

## 历史小故事（可跳过）

- **1990 年**：Tim Berners-Lee 给 HTTP/0.9 设计"一请求一连接"——简单到能在一周写完，那时 Web 才几个站
- **1994 年**：Web 爆发，浏览器加载页面要拉几十个对象，TCP 握手风暴让服务器瘫痪
- **1994-10**：本文早期版在 WWW 1994 大会发表（Chicago），同会议第一次有人提"keep-alive 该是默认"
- **1995-12**：完整版发表在 Computer Networks
- **1997-01**：RFC 2068 HTTP/1.1 把本文结论制度化
- **2015-05**：HTTP/2（RFC 7540）把 pipelining 升级成多路复用
- **2022-06**：HTTP/3（RFC 9114）把 T/TCP 思路用 QUIC 复活

每一步隔 5-15 年，都能在本文里找到种子。

## 学到什么

1. **协议优化的关键单位是 RTT 不是字节**——这个观念至今管所有网络系统设计
2. **对照实验 > 理论分析**：T/TCP 论文里看着很美，实测对 Web 不如 pipelining——一跑就见真章
3. **修错地方比不修更糟**：T/TCP 修了握手却没修 slow start，对 Web 多对象场景几乎没用
4. **方案的死活不只看性能**：pipelining 性能最好，但因队头阻塞 + 部署难，30 年没普及；持久连接简单稳，反而成事实标准

## 延伸阅读

- 同期姊妹篇：[[mogul-1995-persistent-http]] — Mogul 单作的立论报告，本文是它的实测搭档
- HTTP/2 是本文 pipelining 思想的成熟体：[[http-2]]
- Web 架构的整体设计哲学：[[fielding-rest-2000]]
- 把"近用户"作为另一条优化路径：[[akamai-2002]]
- RFC 2068 HTTP/1.1（IETF 官方文档）：[https://www.rfc-editor.org/rfc/rfc2068](https://www.rfc-editor.org/rfc/rfc2068)
- TCP Fast Open RFC 7413（2014，T/TCP 的精神继承者）：[https://www.rfc-editor.org/rfc/rfc7413](https://www.rfc-editor.org/rfc/rfc7413)

## 关联

- [[mogul-1995-persistent-http]] — 同年姊妹篇，立论 + 实测互补
- [[http-2]] — pipelining 升级成多路复用
- [[fielding-rest-2000]] — Web 架构宪法，本文是它"性能层"的注脚
- [[akamai-2002]] — 另一条思路：与其改协议不如把内容搬近用户

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[krishnamurthy-1999-http11]] —— Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"

