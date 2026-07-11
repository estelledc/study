---
title: Padmanabhan-Mogul 1995 — 用秒表证明：持久连接 + 流水线能砍掉 HTTP 延迟
来源: 'Venkata N. Padmanabhan, Jeffrey C. Mogul, "Improving HTTP Latency", Computer Networks and ISDN Systems Vol.28, Dec 1995（同名早期版 WWW 1994 大会）'
日期: 2026-06-01
分类: 网络协议
难度: 入门
---

## 是什么

Padmanabhan-Mogul 1995 是一篇**对照实验报告**。它改 Mosaic 客户端和 NCSA httpd，在真实链路上**用秒表掐时间**，比较三种加载方式谁更快：

1. **旧 HTTP**（一请求一 TCP 连接）
2. **持久连接**（keep-alive / long-lived）：一根 TCP 复用多次请求
3. **持久连接 + pipelining**（流水线）：请求连发，不必等上一个响应回来

日常类比：你点 11 杯奶茶。
- 旧 HTTP = 每点一杯都重新排队、付款、领单。
- 持久连接 = 排一次队，11 杯一杯杯点完再走。
- pipelining = 排一次队，**11 杯一口气全报给店员**，店员按顺序做。

同期还有人提 **T/TCP**（把握手和首包合并），但**本文秒表里没有跑它**；姊妹篇 Mogul 1995 从部署角度讨论过。本文贡献是：在跨美广域链路上把前三种跑出可比较的数字。

## 为什么重要

不读这篇，就解释不通：

- 为什么 HTTP/1.1（1997, RFC 2068）默认持久连接，pipelining 却只是可选——本文测出流水线最快，后来浏览器因队头阻塞不敢默认开
- 为什么浏览器对 HTTP/1.1 站点常开约 6 条并行连接——用多连接绕开单连接流水线的队头阻塞
- 为什么 HTTP/2（2015）用一条连接上的多路复用——把「少握手 + 并发请求」做对
- 为什么 HTTP/3 / QUIC 的 0-RTT、TCP Fast Open（RFC 7413）能成立——它们接的是「砍握手 RTT」那条线，不是本文实测的主方案

这是 Web 性能里**较早用实现 + 对照测量**给 HTTP 改法拍板的论文之一。

## 核心要点

### 实验装置（关键）

- **作者**：Padmanabhan（UC Berkeley）、Mogul（DEC WRL）
- **实现**：改 Mosaic V2.4 客户端 + NCSA httpd V1.3，跑在 DECstation / ULTRIX 上
- **链路**：局域网 Ethernet（RTT 近 0）对照跨美 T1（最佳 RTT 约 **70ms**）
- **被测**：一个 HTML + 多张内联图（图数、图大小可变）

### 三种方案的「RTT 账单」

| 方案 | TCP 握手次数 | 每对象额外等待 |
|------|-------------|----------------|
| 旧 HTTP 一请求一连接 | N（对象数） | 1 RTT（再加握手） |
| 持久连接 | 1 | 1 RTT（等响应再发下一请求） |
| 持久 + pipelining | 1 | ≈0（请求可连发） |

### 核心结论

1. **远程小图场景**：持久 + pipelining 相对旧协议，延迟常**砍一半以上**（文中 remote、约中位图大小）
2. **收益大头来自 pipelining**；单开持久连接也有帮助，但不如合用
3. **图越大、传输越占主导**，相对收益变小——优化的是 RTT 税，不是带宽

## 实践案例

### 案例 1：算一下为什么 pipelining 这么猛

设 RTT = 100ms，10 张图，每张 50ms 传输。

**旧 HTTP**：每对象 (1 RTT 握手 + 1 RTT 请求-响应 + 50ms) = 250ms × 10 = **2500ms**

**持久连接**：1 RTT 握手 + 10 × (1 RTT + 50ms) = 100 + 1500 = **1600ms**

**持久 + pipelining**：1 RTT 握手 + 1 RTT 首请求 + 10 × 50ms ≈ **700ms**

省下来的不是带宽——是**等空气来回的时间**（RTT 税）。

### 案例 2：用 curl 看「连接有没有被复用」

```bash
# -v 看握手；两次请求若复用，第二次不应再完整三次握手
curl -v -o /dev/null https://example.com/ 2>&1 | grep -E 'Connected|HTTP/'
curl -v -o /dev/null https://example.com/ 2>&1 | grep -E 'Connected|HTTP/'
```

**逐部分解释**：HTTP/1.1 默认倾向复用；若每次都看到新的 `Connected to ...`，说明连接没留下来。今天叠了 TLS，**每条新连接更贵**，持久连接比 1995 年更值。

### 案例 3：今天浏览器在做什么

打开 Chrome DevTools → Network：

- HTTP/1.1：常每域名约 6 条 TCP 并行（绕开 pipelining 队头阻塞）
- HTTP/2：1 条 TCP，流级多路复用（流水线思想的成熟版）
- HTTP/3：QUIC/UDP，可 0-RTT（砍握手，另一条进化线）

## 踩过的坑

1. **pipelining 队头阻塞**：第一个响应慢，后面全堵——本文静态资源测得顺，真实动态接口常拖累，浏览器长期不敢默认开
2. **广域收益更大**：约 70ms RTT 时砍半很明显；局域网 RTT 近 0 时，**单开持久连接**原文大约只省 5–15%，流水线仍有帮助，但别把广域结论原样套进机房内网
3. **T/TCP 不是银弹**：它能省握手，却不解决多对象 slow-start/连接风暴；且早期设计有源地址伪造风险，后被弃用，精神由 TCP Fast Open 等继承
4. **没测 HTTPS**：1995 年还在 SSL 早期；今天新连接常再叠 1–2 个 TLS RTT，复用连接更重要

## 适用 vs 不适用场景

**今天还有用的洞察**：

- 任何 RTT 敏感设计——把「往返次数」当一等公民（对照文中约 70ms 广域量级）
- 「很多小对象」场景——页面资源、HTTP API、RPC，优先连接复用
- 改协议前先做**对照实验 + 真实链路**，别只靠纸面 RTT 计数

**不适用**：

- 大文件单次下载（瓶颈是带宽，RTT 优化感弱；原文大图相对收益明显变小）
- 机房内近零 RTT 调用（省不出多少握手时间）
- 实时双向通道（WebSocket / WebTransport 不是「请求-响应拉一堆小对象」模型）

## 历史小故事（可跳过）

- **1990**：HTTP/0.9「一请求一连接」——简单到能快速实现
- **1994**：Web 爆发，多对象页面触发 TCP 握手风暴
- **1994-10**：本文早期版在 WWW 1994（Chicago）发表
- **1995-12**：完整版见 Computer Networks and ISDN Systems
- **1997-01**：RFC 2068 HTTP/1.1 把持久连接默认化，pipelining 可选
- **2015 / 2022**：HTTP/2 多路复用、HTTP/3/QUIC 0-RTT 分别接上「并发」与「砍握手」两条线

## 学到什么

1. **协议优化的关键单位常是 RTT，不是字节**
2. **对照实验 > 纯理论**：把旧协议、长连接、流水线放同一条链路跑，数字比口号硬
3. **修错地方收益有限**：只砍握手、不解决多小对象往返，对 Web 页面帮助有限
4. **性能最好 ≠ 能普及**：pipelining 测得最快，却因队头阻塞与部署难长期未默认；更简单的持久连接先成事实标准

## 延伸阅读

- 姊妹篇（仿真立论，含对 T/TCP 的讨论）：[[mogul-1995-persistent-http]]
- HTTP/2 多路复用：[[http-2]]
- Web 架构约束：[[fielding-rest-2000]]
- 另一条路——把内容搬近用户：[[akamai-2002]]
- RFC 2068 HTTP/1.1：[https://www.rfc-editor.org/rfc/rfc2068](https://www.rfc-editor.org/rfc/rfc2068)
- TCP Fast Open RFC 7413：[https://www.rfc-editor.org/rfc/rfc7413](https://www.rfc-editor.org/rfc/rfc7413)

## 关联

- [[mogul-1995-persistent-http]] —— 同年姊妹篇，仿真立论与本文实测互补
- [[http-2]] —— 把流水线思想升级成流级多路复用
- [[fielding-rest-2000]] —— Web 架构约束，本文是性能层注脚
- [[akamai-2002]] —— 不改协议、把内容搬近用户的另一条路
- [[krishnamurthy-1999-http11]] —— HTTP/1.0 到 1.1 改动总览

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[akamai-2002]] —— Akamai 2002 — 把网站搬到离用户 10 毫秒的地方
- [[http-2]] —— HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
- [[krishnamurthy-1999-http11]] —— Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"
