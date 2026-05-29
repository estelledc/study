---
title: HTTP/2 — Hypertext Transfer Protocol Version 2
来源: RFC 7540, "Hypertext Transfer Protocol Version 2 (HTTP/2)", IETF HTTPbis Working Group, May 2015；后续修订 RFC 9113 (June 2022)
---

# HTTP/2 — 把 HTTP 从文本协议改造成二进制 framing 协议

## 一句话总结

HTTP/2（RFC 7540, 2015 年 5 月）是 IETF HTTPbis 工作组发布的 HTTP 协议第二个主要版本，由 Mike Belshe（Twist）+ Roberto Peon（Google）+ Martin Thomson（Mozilla）主笔。它把 HTTP 从一种**基于文本的纯请求/响应协议**改造为**基于二进制 frame 的多路复用协议**：同一个 TCP 连接上多个请求并行交错，header 用 HPACK 压缩，server 可主动 push 资源，stream 之间有优先级和流控。源头是 Google 在 2009 年启动的 SPDY 实验协议，2012 年 Chrome / Firefox / Twitter / Facebook 大规模部署后，2014 年 IETF HTTPbis 工作组以 SPDY/3 为基础起草，2015 年 5 月发布 RFC 7540 + RFC 7541（HPACK），2022 年 6 月由 RFC 9113 修订。

设计目标（RFC 7540 §1）：

1. **降低延迟**：单连接多请求并行，消除浏览器对 6/host 并发限制的依赖
2. **header 压缩**：消除每个请求重复发送 Cookie/User-Agent 的浪费
3. **保持 HTTP 语义**：方法 / URL / status code / header 全部不变，应用层零改动可升级
4. **服务器主动推送**：server 在 client 请求 HTML 后立即 push CSS/JS，省一个 RTT
5. **优先级与流控**：让浏览器告诉 server "这个 stream 比那个重要"
6. **最少 ossification**：基于现有 TLS + ALPN 协商，部署不依赖新中间盒

它今天是 HTTP/1.1 之后所有大型网站的默认协议（W3Techs 2024 数据：top 10M 网站中 HTTP/2 部署率约 36%，HTTP/3 部署率约 28%，剩余仍走 HTTP/1.1）。但 server push 已被浏览器逐步禁用（Chrome 106, 2022），HTTP/3（RFC 9114, 2022）正在取代 HTTP/2 over TCP——HTTP/2 的"多路复用"理念成功了，"在 TCP 上做"被 head-of-line blocking 证伪。

为什么要专门读 RFC 7540 而不是只用 nghttp2 / h2 库？

1. HTTP/2 的 framing 是后续 HTTP/3 / WebTransport / gRPC 的概念基础——读 RFC 才能理解为什么 stream / frame / flow control 是这样切的
2. HPACK 是个独立的小算法（RFC 7541），有动态表 + Huffman 双层压缩，安全 trade-off 写在 RFC 里，库注释看不全
3. server push 的设计成败是协议工程的经典案例，只读源码不读规范 + 部署反思看不到全貌
4. HTTP/2 over TCP 的 head-of-line blocking 是引出 QUIC + HTTP/3 的根本动机，理解 HTTP/2 的限制才能理解 HTTP/3 的设计

本笔记按 Layer 0 速查 → 历史定位 → 5 个 Definition → frame 格式详解 → 多路复用 → HPACK → server push → flow control + priority → 与 TCP 配合的 HoL 问题 → HTTP/3 的接力 → 限制 → 怀疑 → permalinks → 学到 + 关联 的顺序展开。

![HTTP/1.1 vs HTTP/2 多路复用对比](/papers/http-2/01-multiplexing.webp)

上图：上半 HTTP/1.1 在 6 个 TCP 连接上各自串行处理请求（队头阻塞 + slow-start 6 次税），下半 HTTP/2 在单 TCP 连接上把多个 stream 的 frame 交错传输。HTTP/2 在协议层做对了，但 TCP 层的 head-of-line blocking 仍存在——这是 QUIC 出场的伏笔。

## Layer 0 — 协议档案速查

| 字段 | 值 |
|---|---|
| 协议名 | HTTP/2 |
| 标准 | RFC 7540（HTTP/2）+ RFC 7541（HPACK），2015-05；RFC 9113 修订，2022-06 |
| 主笔 | Mike Belshe（Twist 创始人，前 Google）+ Roberto Peon（Google）+ Martin Thomson（Mozilla） |
| 工作组 | IETF HTTPbis Working Group |
| 起源 | Google SPDY（2009 启动 / 2012 部署 / 2014 终结） |
| 协商方式 | TLS ALPN（h2）/ 明文 HTTP Upgrade（h2c，几乎不用）/ Prior Knowledge |
| 默认前提 | TLS 1.2+ 必须开（实际上）；明文 HTTP/2 浏览器拒绝实现 |
| 帧化 | 二进制 frame，9 字节固定头 + 变长 payload |
| Frame 类型 | 10 种（DATA / HEADERS / PRIORITY / RST_STREAM / SETTINGS / PUSH_PROMISE / PING / GOAWAY / WINDOW_UPDATE / CONTINUATION） |
| Stream 数 | 单连接最多 2^31-1 个，server 通过 SETTINGS_MAX_CONCURRENT_STREAMS 控制 |
| Stream ID | 31 bit，奇数 = client 发起，偶数 = server 发起（push） |
| Header 压缩 | HPACK（RFC 7541）：静态表 + 动态表 + Huffman |
| 流控 | window-based，connection-level + stream-level 双层 |
| 优先级 | weighted dependency tree（RFC 7540 §5.3，复杂）；RFC 9113 标记为 deprecated |
| Server Push | PUSH_PROMISE frame（RFC 7540 §8.2）；RFC 9113 仍保留但浏览器都关 |
| 默认窗口 | 65535 字节（initial window） |
| 最大 frame 长 | 默认 16384，可协商到 16 MB |
| ALPN 标识 | "h2"（TLS）/ "h2c"（明文，浏览器不支持） |
| Connection preface | client 必须发 24 字节 magic："PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n" |
| 加密 | 浏览器强制 TLS（事实标准），RFC 不强制 |
| 主流实现 | nghttp2（C，curl/Apache/Node）/ h2（Rust，hyper） / Netty HTTP/2（Java）/ golang.org/x/net/http2（Go）/ Jetty HTTP/2（Java）/ aiohttp h2（Python）/ Twisted h2 |
| 部署率（W3Techs 2024） | top 10M 站点 ~36% HTTP/2 默认 |
| 取代它 | HTTP/3（RFC 9114，2022） |

## Section 1 — 历史定位：SPDY → HTTP/2 → HTTP/3

### SPDY（2009-2014）：Google 内部实验

2009 年 Google 内部 Mike Belshe 等人启动 SPDY 项目（"speedy" 缩写），目标是把 HTTP 改造成更适合现代 web 的协议。SPDY/1（2009 实验）/ SPDY/2（2010 部署到 Gmail / Google search）/ SPDY/3（2012 大规模）/ SPDY/3.1（2014 临终版本）。Chrome / Firefox 默认开启，Twitter / Facebook 接入。

SPDY 的核心创新（后来全部进 HTTP/2）：

- 二进制 framing（不再是文本）
- 多路复用 + 多 stream
- header 压缩（早期用 zlib，问题不少，后来才换 HPACK）
- server push
- 优先级

SPDY 是部署在 TLS NPN（Next Protocol Negotiation，Google 自己的扩展）上协商的。NPN 后来被 IETF 收编为 ALPN（RFC 7301）。

### IETF HTTPbis 工作组接手（2012-2015）

2012 年 IETF HTTPbis 工作组开始讨论 "HTTP/2.0 应该是什么"。提案：

1. **SPDY/3 直接升级**（Google 提案）—— 主流意见
2. **HTTP-NG**（学术界历史包袱协议）—— 讨论后弃
3. **Speed+Mobility**（Microsoft 提案，基于 WebSocket）—— 影响小
4. **httpbis Network-Friendly HTTP Upgrade**（小修补）—— 不够激进

最终 2014 年 11 月以 SPDY/3 + HPACK 为蓝本，2015 年 5 月正式发布 RFC 7540 + RFC 7541。Google Chrome 在 2016 年正式 deprecate SPDY，全部走 HTTP/2。

### RFC 9113 修订（2022）

七年后修订主要清理：

1. **TLS 1.3 集成澄清** —— 与 RFC 8446 配合
2. **优先级正式 deprecate** —— 实际部署混乱，让位给 RFC 9218 Extensible Priorities
3. **CONNECT 在 HTTP/2 的细节** —— 规范隧道用法
4. **Cookie 处理边角** —— 与 RFC 6265bis 对齐

RFC 9113 不是新协议，是把 RFC 7540 的 7 年勘误 + 实践经验整合成清洁版。

### HTTP/3 接力（2022 至今）

HTTP/3（RFC 9114, 2022-06）= HTTP 语义 + QUIC transport。HTTP/3 保留 HTTP/2 的所有应用层概念（HEADERS / DATA / stream / priority），但把 transport 从 TCP 换成 QUIC（基于 UDP，参见 [[quic]]）。原因：HTTP/2 在协议层多路复用了，但 TCP 仍是单 byte 流，丢包会卡所有 stream（HoL）。

部署模式：浏览器先 TCP+TLS+HTTP/2 拉首屏，server 通过 `Alt-Svc: h3=":443"` header 告知"我也支持 QUIC"，浏览器后台开 QUIC 连接，下次连接走 HTTP/3。HTTP/2 与 HTTP/3 长期共存，5-10 年逐步收敛。

## Section 2 — 五个核心 Definition

### Definition 1：Frame

Frame 是 HTTP/2 通信的最小单元，结构固定 9 字节头 + 变长 payload。

```
+-----------------------------------------------+
|                 Length (24)                   |
+---------------+---------------+---------------+
|   Type (8)    |   Flags (8)   |
+-+-------------+---------------+-------------------------------+
|R|                 Stream Identifier (31)                      |
+=+=============================================================+
|                   Frame Payload (0...)                        |
+---------------------------------------------------------------+
```

字段：

- **Length**（24 bit）—— payload 长度，最大 16 MB（受 SETTINGS_MAX_FRAME_SIZE 限制，默认 16 KB）
- **Type**（8 bit）—— frame 类型，10 种之一
- **Flags**（8 bit）—— 类型相关标志位（如 END_STREAM / END_HEADERS / PADDED）
- **R**（1 bit）—— 保留，必须 0
- **Stream Identifier**（31 bit）—— 0 表示连接级，奇数 client 发起，偶数 server 发起

为什么 9 字节固定头：解析速度快（无 varint）；24 bit length 够用 16 MB；32 bit stream id 上限 2^31。比 HTTP/1.1 的"读到 \r\n\r\n 才知道 header 边界"快得多。

### Definition 2：Stream

Stream 是连接里的逻辑双向通道，承载一个请求 + 响应（或 push）。属性：

| 属性 | 说明 |
|---|---|
| Stream ID | 31-bit，连接内全局唯一，单调递增 |
| 状态机 | idle → open → half-closed → closed（共 7 个状态，RFC 7540 §5.1） |
| 流控窗口 | 独立的 WINDOW_UPDATE，初始 65535 字节 |
| 优先级 | 父 stream + 1-256 权重 + exclusive bit |
| 关闭 | END_STREAM flag 优雅关 / RST_STREAM frame 强制关 |

Stream 之间在 HTTP/2 协议层独立，但**底层 TCP 仍是单 byte 流**——这是 HoL 的根源。

Stream ID 不复用：一旦关闭就永远不能再开。所以一个 HTTP/2 连接最多承载 2^30 个 client 请求（奇数 ID）。实际部署一般跑几小时就因为 ID 用尽 GOAWAY 重建。

### Definition 3：Connection

Connection = 一个 TCP（+TLS）连接 + HTTP/2 协议状态。

要点：

- **Connection preface** —— client 连上后必须发 24 字节 magic：`"PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n"`，避免被 HTTP/1.1 server 误解
- **SETTINGS frame** —— preface 后立刻交换连接参数（max concurrent streams / initial window / max frame size 等）
- **Connection-level flow control** —— 整个连接共享一个流控窗口
- **GOAWAY** —— 优雅关闭，告知对端 "我不再处理新 stream，已处理到 stream id N"
- **PING** —— RTT 测量 + keepalive

一个浏览器对一个 origin（scheme + host + port）只开一个 HTTP/2 连接（vs HTTP/1.1 开 6 个）。

### Definition 4：HPACK Context

HPACK（RFC 7541）是 header 压缩算法，每个 connection 维护一对 client → server 和 server → client 的 HPACK context。每个 context 包含：

| 组件 | 说明 |
|---|---|
| 静态表 | 61 项预定义 header（`:method GET` / `cookie` / `accept-encoding gzip,deflate` 等），RFC 7541 Appendix A |
| 动态表 | FIFO 缓存最近发送的 header，server 通过 SETTINGS_HEADER_TABLE_SIZE 限制（默认 4 KB） |
| Huffman 编码 | 静态 Huffman 表（RFC 7541 Appendix B）压缩 string 字面值 |

发送一个 header 三种方式：

1. **索引引用** —— 直接发 1-2 字节索引（`62` 表示动态表第 1 项）
2. **字面值带索引** —— name 用静态表索引，value 用 Huffman 编码字面值，并加入动态表
3. **字面值不带索引** —— name + value 都字面，不入动态表（敏感 header 用，避免 CRIME 攻击）

### Definition 5：Flow Control Window

HTTP/2 自带应用层流控（独立于 TCP 的 receive window）。每个方向、每个 stream 各自一个窗口。

- **初始大小** —— 65535 字节（initial window）
- **更新机制** —— receiver 每消费 N 字节，发 WINDOW_UPDATE frame 加 N
- **双层** —— stream window + connection window，两者都不能超
- **DATA frame 计入流控** —— HEADERS / SETTINGS / PING 不算

为什么需要应用层流控：HTTP/2 多路复用后，receiver 可能 stream A 处理慢、stream B 处理快。如果只有 TCP 流控，A 慢会拖慢整个连接。HTTP/2 的 stream-level 窗口让 receiver 单独限速 A，B 可以全速。

## Section 3 — Frame 格式与十种类型

![HTTP/2 frame 二进制格式](/papers/http-2/02-frame-format.webp)

上图：HTTP/2 frame 头 9 字节固定布局 + 类型相关 payload + 全部 10 种 frame 类型一览。

10 种 frame 类型按用途分组：

### 数据 / 元数据 frame

- **DATA (0x0)** —— 承载 HTTP body 字节，flag 含 END_STREAM / PADDED
- **HEADERS (0x1)** —— 开 stream + 发 HPACK 压缩的 header block；flag END_HEADERS / END_STREAM / PADDED / PRIORITY
- **CONTINUATION (0x9)** —— 当 HEADERS 太大超过 max frame size 时续传

### 流控制 frame

- **PRIORITY (0x2)** —— 设置 stream 父子依赖 + 权重（RFC 9113 deprecated）
- **RST_STREAM (0x3)** —— 立即关闭 stream，带 error code
- **WINDOW_UPDATE (0x8)** —— 给 stream 或 connection 加流控信用

### 连接级 frame

- **SETTINGS (0x4)** —— 协商连接参数（max stream / initial window / max frame size / max header list / push enable）
- **PING (0x6)** —— RTT 测量 / keepalive，对端必须回 PING ACK
- **GOAWAY (0x7)** —— 通知对端 "不再处理新 stream"，含 last-stream-id + error code

### 推送 frame

- **PUSH_PROMISE (0x5)** —— server 主动推送资源前，先在已有 client stream 上发 promise 通知

设计取舍：把 HEADERS 和 DATA 分开是因为压缩后 header 块短小，DATA 块大，分开传方便流控（DATA 计入流控、HEADERS 不计）。CONTINUATION 是个历史包袱——单个 HEADERS 可能因为某些"巨型 header"超 frame size，所以拆出 CONTINUATION 续传，这给实现带来麻烦（必须连续，不能交错），RFC 9113 仍保留。

## Section 4 — 多路复用机制

HTTP/1.1 的 head-of-line blocking：一个 TCP 连接上严格串行 request/response，下一个请求要等前一个响应完。浏览器为绕过这个限制开 6 个并发 TCP 连接（per host），代价：

1. 每个连接独立 TCP 三次握手 + TLS 握手
2. 每个连接独立 slow-start，初期都很慢
3. server 端文件描述符 + 内存翻 6 倍
4. 同一个 origin 的 cookies / headers 在 6 个连接上各发一次

HTTP/2 用单连接多路复用：

```
单 TCP 连接
└─ HTTP/2 frame 流
   ├─ Stream 1: GET /index.html
   │   ├─ HEADERS frame
   │   ├─ DATA frame (page chunk 1)
   │   ├─ DATA frame (page chunk 2, END_STREAM)
   ├─ Stream 3: GET /style.css   ← 与 Stream 1 帧交错
   │   ├─ HEADERS frame
   │   ├─ DATA frame (END_STREAM)
   ├─ Stream 5: GET /script.js
   │   ├─ HEADERS frame
   │   ├─ DATA frame ...
```

发送方把 frame 交错插入：可以一会儿 stream 1 一个 DATA、一会儿 stream 3 一个 HEADERS、一会儿 stream 5 一个 DATA。接收方按 stream id 分发到各自的处理逻辑。

收益：

1. **省 5 个 TCP 握手** —— 单连接首字节延迟显著降
2. **省 5 个 slow-start** —— 拥塞窗口在单连接持续涨，不必反复重启
3. **共享拥塞控制** —— 单 cwnd 决策更准
4. **header 压缩跨请求生效** —— 第二次请求 cookie 几乎不占字节

代价：**TCP-level head-of-line blocking** —— 单 TCP 字节流，一个 IP 包丢失，所有 stream 都要等重传。1% 丢包率下，HTTP/2 实测可能比 HTTP/1.1 多连接还差（参考 Akamai 2017 实测）。这是 HTTP/3 over QUIC 出场的根本原因。

## Section 5 — HPACK 算法详解

### 为什么不直接用 gzip？

SPDY/2 用 zlib 压 header，结果遭到 CRIME 攻击（2012）—— 攻击者通过观察压缩后长度变化推断出 cookie 内容。zlib 的"重复字符串自动 backref"特性是漏洞根源。

HPACK（RFC 7541）专门为 header 设计，关闭这个攻击向量：

1. **不做跨 header 字符串匹配** —— 每个 header 独立处理
2. **动态表是显式 keyed** —— 加入动态表的 header 必须显式标记，敏感 header（password、auth token）走 "literal without indexing" 不入表
3. **Huffman 是静态预定义表** —— 不学习当前 stream 内容，攻击者无法影响压缩字典

### 三层结构

#### 第一层：静态表（static table）

61 项最常见 header / value 组合，RFC 7541 Appendix A：

| 索引 | Name | Value |
|---|---|---|
| 1 | `:authority` |  |
| 2 | `:method` | GET |
| 3 | `:method` | POST |
| 4 | `:path` | / |
| 5 | `:path` | /index.html |
| 6 | `:scheme` | http |
| 7 | `:scheme` | https |
| 8 | `:status` | 200 |
| ... | ... | ... |
| 32 | `cookie` |  |
| ... | ... | ... |
| 61 | `www-authenticate` |  |

发送 `:method GET` 只需 1 字节（索引 2，二进制 `1000 0010`）。

#### 第二层：动态表（dynamic table）

每次发送的 header 可以选择"加入动态表"，FIFO，受 SETTINGS_HEADER_TABLE_SIZE 字节数限制（默认 4 KB）。

第一个请求发 `cookie: session=abc123`：

- 静态表第 32 项是 `cookie`（无 value），所以发"name 索引 + value 字面值"
- 标记加入动态表，分配索引 62（动态表索引从 62 开始）

第二个请求发同样的 `cookie: session=abc123`：

- 直接发索引 62（1-2 字节），命中

#### 第三层：Huffman 编码

字面值字符串可选 Huffman 压缩。RFC 7541 Appendix B 是预定义 Huffman 表（基于 HTTP header 字符频率统计）。常见字符如小写字母 5-6 bit，少见字符 30 bit。

实测压缩率：

- 第一次请求 header 块大小 ≈ HTTP/1.1 的 60-70%（只有 Huffman 收益）
- 重复请求 header 块大小 ≈ HTTP/1.1 的 5-10%（动态表命中）

### 安全 trade-off

HPACK 仍有 timing 攻击面：

- **Dynamic table sizing attack** —— 攻击者通过观察动态表 evict 行为推断对方 header 内容
- **CRIME-like 残留** —— 如果应用错误地把用户输入直接拼到 header value，仍可能被压缩长度反推

RFC 7541 §7 专门讨论 mitigation：敏感 header 用 "Never Indexed"（字面值 + 永不进表），代价是失去压缩。

CVE 历史：

- CVE-2019-9512 / 9514 / 9518 / 9516 —— 一系列 HTTP/2 实现的 DoS 漏洞，多与 HEADERS / CONTINUATION / RST_STREAM flooding 有关
- CVE-2023-44487 —— "Rapid Reset" 攻击（2023-10），client 大量开 stream 立即 RST_STREAM，server 资源耗尽。Google / AWS / Cloudflare 同时披露

## Section 6 — Server Push 与它的失败

### 设计意图

HTML 引用 CSS/JS/图片，浏览器解析 HTML 后才发现要请求这些资源。一个 RTT 浪费在"读 HTML → 知道要 style.css → 发请求 → 等响应"。

Server Push 让 server 在 client 请求 index.html 时**立即同时**推 style.css / script.js，省一个 RTT。

```
Client                           Server
  HEADERS(stream 1) GET /        ----->
                  <-----  PUSH_PROMISE(stream 1, promised stream 2: GET /style.css)
                  <-----  PUSH_PROMISE(stream 1, promised stream 4: GET /script.js)
                  <-----  HEADERS(stream 1) 200 OK
                  <-----  DATA(stream 1) <html>...
                  <-----  HEADERS(stream 2) 200 OK content-type: text/css
                  <-----  DATA(stream 2) body { ... }
                  <-----  HEADERS(stream 4) 200 OK content-type: text/javascript
                  <-----  DATA(stream 4) console.log(...)
```

PUSH_PROMISE 必须先于 push 资源的 HEADERS，告知 client "我要给你推什么"，client 可以发 RST_STREAM 拒绝。

### 为什么失败了

Chrome 在 2022 年正式禁用 server push（Chrome 106+），Firefox 同年关闭。原因：

1. **缓存判断难** —— server 不知道 client 缓存里有什么，盲推浪费带宽。"我推个 style.css 但 client 缓存里已经有"是常态
2. **优先级反直觉** —— 推送的资源占用关键路径带宽，反而可能挤压 HTML 本身
3. **浏览器实现不一** —— 推送的资源何时进 cache、是否被 service worker 拦截、各浏览器行为不同
4. **HTTP/2 优先级混乱** —— push stream 如何与 client 主动发起的 stream 排序，规范没说清
5. **103 Early Hints 替代** —— RFC 8297（2017）+ Chrome 在 2022 年实现，server 可以发 103 Early Hints 告诉 client "这些资源你即将需要，先抢先 fetch"，client 自己发请求，**保留 cache 判断权**

103 Early Hints 是更优雅的方案：把"知道要什么"和"实际请求"解耦，cache 命中由 client 决定。

### 为什么 RFC 7540 没提前发现

RFC 设计时 push 看起来很美：表面上省 RTT、协议上对称（client 主动发请求、server 主动发 push）、与 HTTP/1.1 的 "100 Continue" 异步响应有先例。但部署后才发现 cache 信息的维护比想象难——这是协议工程的经典教训：**RFC 上对称的 feature 可能在生产环境不对称**（client cache 是私有信息，server 不掌握）。

## Section 7 — Flow Control + Priority

### Window-based Flow Control

- 每个 stream 独立窗口（初始 65535 字节）+ connection 全局窗口（初始 65535 字节）
- DATA frame 占用窗口，HEADERS / SETTINGS / PING 不占
- receiver 处理完 DATA 后，发 WINDOW_UPDATE 加回信用
- 窗口耗尽时 sender 必须停发 DATA（HEADERS 仍可发）

实战调优：默认 65 KB 窗口太小，跨数据中心 50 ms RTT、1 Gbps 带宽链路上，65 KB / 50 ms = 1.3 MB/s 上限。库通常默认开到 1 MB / 16 MB。Linux 内核 TCP 自动调窗（auto-tuning），HTTP/2 应用层窗口需要手工 SETTINGS_INITIAL_WINDOW_SIZE + WINDOW_UPDATE 配合。

### Priority（RFC 7540 §5.3，已 deprecated）

每个 stream 可声明 PRIORITY：

- **dependency** —— 依赖另一个 stream id（构造一棵树）
- **weight** —— 1-256，与同 parent 的兄弟分配剩余带宽
- **exclusive** —— 独占 parent 的所有 child slot

例如浏览器告诉 server："stream 1 (HTML) 是 root，stream 3 (CSS) 依赖 1 weight 220，stream 5 (image) 依赖 3 weight 110。"

实际部署一团乱：

1. **浏览器实现差异巨大** —— Chrome / Firefox / Safari 的优先级树构造完全不同
2. **server 实现选择性遵守** —— nginx 长期忽略优先级，h2o 严格遵守
3. **CDN 重写** —— Cloudflare 主动改 client 的优先级树
4. **依赖树的语义复杂度** —— 大多数开发者不理解，配错率高

RFC 9113（2022）正式 deprecate PRIORITY frame，让位给 RFC 9218 Extensible Priorities：用 `priority: u=2, i` HTTP header 表达 urgency（0-7）+ incremental（是否流式渲染），简单 + 透明 + 实际可用。

## Section 8 — 与 TCP 配合的 HoL 问题（HTTP/2 的 "kryptonite"）

HTTP/2 在协议层多路复用了，但所有 frame 仍走单一 TCP 字节流。

```
TCP byte stream (sender):
  [F1.S1][F2.S3][F3.S1][F4.S5][F5.S3][F6.S1][F7.S5][F8.S3]
            ↓ 一个 IP packet 丢
  TCP 必须等重传，所有后续 byte 全部 stall

TCP receive buffer:
  [F1.S1][F2.S3][???][F4.S5][F5.S3][F6.S1][F7.S5][F8.S3]
                  ↑
        TCP 不能 deliver 任何 byte 给应用层
        即使 F4.S5 / F7.S5 是完全独立的 stream
```

应用层（HTTP/2 解析器）即使能识别 stream 5 与丢失包无关，也拿不到 stream 5 的 byte——因为 TCP 是按序交付的字节流，少一段就全停。

实测影响（Akamai 2017、Fastly 2018）：

- 0% 丢包：HTTP/2 比 HTTP/1.1 + 6 连接快 10-20%（多路复用收益兑现）
- 1% 丢包：两者打平
- 2% 以上丢包：HTTP/2 比 HTTP/1.1 + 6 连接**慢** —— HTTP/1.1 的 6 连接像 6 条独立车道，一条堵车其他 5 条不受影响

这是协议工程的根本性限制：**应用层多路复用 + 传输层单 byte 流 = 错位**。要彻底解决必须把"流"概念下沉到传输层。

## Section 9 — HTTP/3 over QUIC 的接力解决

HTTP/3（RFC 9114, 2022）= HTTP 语义 + QUIC transport。详见 [[quic]]。

变化：

| 维度 | HTTP/2 | HTTP/3 |
|---|---|---|
| Transport | TCP | QUIC (over UDP) |
| 加密 | TLS 1.2/1.3 over TCP | TLS 1.3 内嵌 in QUIC |
| Stream HoL | TCP 层有 | 无（QUIC stream 独立） |
| Header 压缩 | HPACK | QPACK（RFC 9204，解决 HPACK 跨 stream 依赖） |
| Server Push | PUSH_PROMISE | 保留但默认关 |
| Priority | dependency tree（deprecated） | Extensible Priorities (RFC 9218) |
| 0-RTT | 不支持 | 支持（QUIC 提供） |
| 连接迁移 | 不支持 | 支持（QUIC Connection ID） |
| 协商 | TLS ALPN "h2" | TLS ALPN "h3" + Alt-Svc header 升级 |
| 部署率 (W3Techs 2024) | ~36% | ~28% |

HPACK 在 HTTP/3 不能直接用：HPACK 假定单 byte 流（动态表更新有顺序依赖），HTTP/3 stream 独立后必须解决"动态表更新跨 stream"问题。QPACK 的解法是把动态表更新放到独立的 control stream（encoder stream + decoder stream），不阻塞数据 stream。代价：实现复杂度提升。

## Section 10 — 限制 + 部署痛点

1. **TCP HoL 是结构性的** —— HTTP/2 协议本身没问题，但 TCP 是死胡同。HTTP/3 over QUIC 才是终极解
2. **server push 被证伪** —— 设计上看起来很美，部署后浏览器全关，103 Early Hints 是更好的替代
3. **优先级机制混乱** —— RFC 7540 dependency tree 实际部署没有谁严格遵守，RFC 9113 已 deprecate
4. **HPACK CRIME 残留** —— 应用层错误地把用户输入拼接到 header value 仍可能信息泄露
5. **CVE-2023-44487 Rapid Reset** —— stream 开 + RST_STREAM flooding 让 server CPU 耗尽，所有 HTTP/2 实现都中招
6. **CONTINUATION frame 复杂度** —— 单 HEADERS 拆分必须连续不交错，给实现带 bug 空间（CVE-2024-27316 续集）
7. **浏览器拒绝明文 h2c** —— RFC 7540 允许明文 HTTP/2 over TCP（h2c），但浏览器都不实现，实际只有 server-server 通信（如 gRPC）会用
8. **header table size 协商边角** —— SETTINGS_HEADER_TABLE_SIZE 修改时机微妙，多个 RFC 7541 实现存在 race condition
9. **Stream id 单调递增 + 不复用** —— 长连接每几小时因为 stream id 接近 2^31 必须 GOAWAY 重建
10. **CDN 优先级重写** —— Cloudflare / Fastly 主动改 client 的 priority tree，client 行为难预测
11. **多个 RFC 7540 实现 fuzzing 暴露问题** —— h2spec / nghttp2 fuzzer 持续发现 corner case，RFC 9113 也没全清理
12. **TLS 1.3 与 HTTP/2 的 0-RTT 没标准化** —— TLS 1.3 0-RTT + HTTP/2 GET 的 replay 风险无明确规范，浏览器各家选择不一
13. **Push cache 信息缺失** —— server 不知道 client 缓存里有啥，"盲推" 浪费带宽是 push 失败的根源
14. **gRPC 强绑定 HTTP/2** —— 生态深度依赖，但 gRPC over HTTP/3 才刚起步（grpc-web + h3）
15. **observability 工具链** —— Wireshark / curl --http2 / nghttp 工具链成熟，但分布式 trace 跨 stream 定位仍 painful

## 怀疑总集

> 怀疑 1：HTTP/2 server push 在 RFC 7540 标志卖点，但浏览器 2020 起逐步弃用（Chrome 106 在 2022 年正式关）。RFC 工作组在标准化时是否充分调研过 client cache 状态对 push 决策的影响？是设计失败（思路就不对：server 没有 client 缓存信息）还是实现不到位（push 资源缓存的语义浏览器没对齐）？我倾向于"设计失败"——cache 信息天然是 client 私有，server 永远只能猜。RFC 应该把 push 标记为 "best-effort guidance" 而不是 first-class feature，规范上的对称性误导了实现。

> 怀疑 2：HPACK 对 header 压缩 80%+，但每个 stream 共享 dynamic table，安全性问题（CVE-2019-9518 / CVE-2023-44487 等）反复出现。压缩 vs 安全的取舍是否值得？RFC 7541 §7 做了 mitigation 说明（敏感 header 用 Never Indexed），但应用开发者很少正确执行。更深一层：HTTP header 重复度其实没那么高（cookie 之外的头大多 client/server 静态），只为了优化 cookie 重传引入这么大攻击面，是不是过度工程？

> 怀疑 3：HTTP/2 多路复用解决 HTTP/1.1 应用层 HoL，但底层 TCP 仍 HoL（一个 IP 包丢全部 stream 停）。RFC 设计时是否充分考虑还是受限于"不能改 TCP"？1% 丢包以上 HTTP/2 性能反而比 HTTP/1.1 + 6 连接差。这意味着在 Mobile 网络（典型 1-3% 丢包）HTTP/2 有时是负优化。HTTP/3 用 QUIC 直接绕开 TCP 才彻底解决——HTTP/2 是不是结构上一开始就走了死路？是 IETF 政治（不能动 TCP）压制了技术（应该把 stream 下沉传输层）？

> 怀疑 4：HTTP/2 优先级（dependency tree + weight）在 RFC 7540 写了 5 页，结果 RFC 9113 deprecate 让位给 RFC 9218 简化方案。这意味着 7 年生产部署证明这个 feature 设计错了。问题在于：协议设计时没人能预测部署后的混乱。是否说明 RFC 工作组应该多用 "experimental phase" 模式（先发 draft，3 年后定稿）而不是直接 PROPOSED STANDARD？

> 怀疑 5：HTTP/2 强制要求 TLS 1.2+（事实标准，RFC 不强制）。代价：所有内网 server-server 通信也得 TLS 解密一次。gRPC 大规模部署后这个 CPU 成本不小。是不是协议绑定 TLS 是过度的"安全卫道士"？为什么 server-server 不允许明文 HTTP/2（h2c）但浏览器拒绝？这种 "we know better than you" 的强制是否应该让位给"by default secure but allow opt-out"？

> 怀疑 6：CVE-2023-44487（Rapid Reset）影响所有 HTTP/2 实现，根因是 RFC 7540 没限制 client 开 stream 的速率。攻击者快速开 + RST_STREAM 让 server CPU 过载。设计时为什么没有 anti-DoS rate limit？是因为协议层不该管限流（那是应用 / WAF 的事），还是真的疏忽？同类 RST_STREAM flood 在 SPDY 时代就有先例（CVE-2014）。9 年后同样的攻击模式仍然能击穿全行业，是不是说明 RFC 工作组的 security review 流程有结构性缺陷？

> 怀疑 7：HTTP/2 的所有问题在 HTTP/3 都解决了。那 RFC 7540（2015）→ RFC 9114（2022）只用了 7 年。问题是：HTTP/2 部署占比仍 36%，HTTP/3 才 28%，HTTP/1.1 还在 30% 以上。如果一个协议刚部署 7 年就被下一代取代，标准化的 ROI 在哪？是不是 RFC 7540 应该更早承认"这是过渡方案"而不是当作"下个 20 年的协议"？这种"快速迭代但又强标准化"的模式是否对生态有害（应用要同时支持 HTTP/1.1 + HTTP/2 + HTTP/3 三套实现）？

## GitHub Permalinks

源码精读入口（每条都是稳定 commit / tag 形式的 permalink，链接示意，未实际验证 SHA）：

- **nghttp2 connection 主入口**：`https://github.com/nghttp2/nghttp2/blob/v1.61.0/lib/nghttp2_session.c`
- **nghttp2 frame 编解码**：`https://github.com/nghttp2/nghttp2/blob/v1.61.0/lib/nghttp2_frame.c`
- **nghttp2 HPACK 实现**：`https://github.com/nghttp2/nghttp2/blob/v1.61.0/lib/nghttp2_hd.c`
- **nghttp2 stream 状态机**：`https://github.com/nghttp2/nghttp2/blob/v1.61.0/lib/nghttp2_stream.c`
- **nghttp2 flow control**：`https://github.com/nghttp2/nghttp2/blob/v1.61.0/lib/nghttp2_session.c#L4500-L4700`
- **h2 (Rust hyperium) connection**：`https://github.com/hyperium/h2/blob/v0.4.5/src/proto/connection.rs`
- **h2 (Rust) frame 模块**：`https://github.com/hyperium/h2/blob/v0.4.5/src/frame/mod.rs`
- **h2 (Rust) HPACK encoder**：`https://github.com/hyperium/h2/blob/v0.4.5/src/hpack/encoder.rs`
- **h2 (Rust) HPACK decoder**：`https://github.com/hyperium/h2/blob/v0.4.5/src/hpack/decoder.rs`
- **h2 (Rust) flow control**：`https://github.com/hyperium/h2/blob/v0.4.5/src/proto/streams/flow_control.rs`
- **Linux kernel TLS (kTLS) 主模块**：`https://github.com/torvalds/linux/blob/v6.9/net/tls/tls_main.c`
- **Linux kernel TLS sw 实现**：`https://github.com/torvalds/linux/blob/v6.9/net/tls/tls_sw.c`
- **Linux kernel TLS device offload**：`https://github.com/torvalds/linux/blob/v6.9/net/tls/tls_device.c`
- **Go net/http2 server**：`https://github.com/golang/net/blob/v0.25.0/http2/server.go`
- **Go net/http2 frame**：`https://github.com/golang/net/blob/v0.25.0/http2/frame.go`
- **Go net/http2 hpack**：`https://github.com/golang/net/blob/v0.25.0/http2/hpack/hpack.go`
- **curl HTTP/2 集成**：`https://github.com/curl/curl/blob/curl-8_8_0/lib/http2.c`
- **Envoy HTTP/2 codec**：`https://github.com/envoyproxy/envoy/blob/v1.30.0/source/common/http/http2/codec_impl.cc`

精读建议：

1. **先读 nghttp2 的 nghttp2_frame.c** —— C 实现 + 注释充分，frame 编解码是 HTTP/2 的入门
2. **对照 RFC 7540 §6 全部 frame 类型** —— 边读 RFC 边读代码，互相印证
3. **再读 nghttp2_hd.c** —— HPACK 算法核心，配 RFC 7541 Appendix A/B 静态表 + Huffman 表
4. **h2 (Rust) 的状态机表达更清晰** —— Rust 类型系统让 stream 状态机一目了然，nghttp2 的 C 版本则更接近规范字面
5. **kTLS 是 HTTP/2 性能优化的隐形依赖** —— Linux 6.x 内核把 TLS 加密下沉到内核，HTTP/2 server (nginx 1.21+ / Envoy) 用 kTLS 显著降 CPU。读 tls_sw.c 看用户态 vs 内核态切换边界
6. **Go net/http2 是最易读的实现** —— Go 协程 + channel 让多 stream 并发逻辑非常直观，适合学整体架构
7. **CVE-2023-44487 (Rapid Reset) patch** —— 在 nghttp2 / h2 / Go net/http2 都有对应 commit，对照看不同实现的 mitigation 策略

## 学到什么 + 关联

学到的：

1. **二进制 framing 是协议演进的关键** —— 从文本协议（HTTP/1.x）到 frame（HTTP/2），解析速度 + 多路复用 + 流控全部成为可能
2. **多路复用必须下沉到正确层** —— HTTP/2 在应用层多路复用，但 transport 还是单 byte 流，HoL 没解决；HTTP/3 把 stream 下沉到 transport 才彻底清算
3. **协议的对称性 ≠ 部署的对称性** —— server push 在 RFC 上对称（client 主动 / server 主动），但 cache 信息天然不对称，导致 push 失败
4. **优先级是协议工程最难做对的部分** —— RFC 7540 的 dependency tree 写了 5 页，7 年后被简单的 urgency header 取代。复杂的优先级机制实际部署混乱
5. **header 压缩需要专用算法** —— gzip / zlib 的跨字符串匹配在 header 上是攻击面（CRIME），HPACK 用 "static + dynamic + Huffman 三层 + 显式索引" 解决
6. **协议安全要从 spec 层做 anti-DoS** —— CVE-2023-44487 Rapid Reset 暴露 RFC 7540 没限制 stream 开 + reset 速率，全行业实现一起中招
7. **TLS 强制 vs 可选是政治问题** —— RFC 不强制 TLS 但浏览器全强制，这种 "by deployment" 的事实标准比 RFC 文字更有约束力
8. **CONTINUATION 是历史包袱** —— 巨型 header 拆 frame 的设计带来实现复杂度，所有 HTTP/2 实现都为它付了 bug 代价
9. **103 Early Hints 是更优雅的 push 替代** —— 协议提示 + client 决策的分离，比 server push 强行决定更好
10. **Stream id 单调递增不复用是个简单但代价不小的设计** —— 长连接几小时必须 GOAWAY 重建
11. **协议演进受现实重力束缚** —— TCP 不能改 → HTTP/2 在 TCP 上做 → HoL 出现 → 改 UDP 做 QUIC + HTTP/3。每一步都是在现有约束下找最优
12. **RFC 工作组的标准化节奏与生态演进不匹配** —— 7 年从 HTTP/2 到 HTTP/3，标准之间还没 "稳定"，应用要同时支持三代

关联：

- [[tcp]] —— HTTP/2 在 TCP 上跑，TCP 的单 byte 流是 HTTP/2 HoL 的根源
- [[tls-1.3]] —— HTTP/2 事实强制 TLS 1.2+，TLS 1.3 + ALPN "h2" 是部署默认配置
- [[quic]] —— HTTP/3 over QUIC 接力解决 HTTP/2 的 TCP HoL 问题，stream 下沉传输层
- [[bert]] [[attention]] —— LLM serving API（OpenAI / Anthropic / Google）今天主流走 HTTP/2 (gRPC) 或 HTTP/3，长连接 + streaming response 的多路复用直接受益于 HTTP/2 设计
- [[bigtable]] [[spanner]] —— 大型分布式数据库内部 RPC 走 gRPC（基于 HTTP/2）。RPC framework 强绑定 HTTP/2 是 gRPC 演进到 HTTP/3 的阻力
- [[chubby]] —— ZooKeeper / Chubby 类锁服务的 client 协议在低延迟场景可受益于 HTTP/2 多路复用
- [[clickhouse]] —— 列式数据库的 query result streaming 适合 HTTP/2 DATA frame 流式传输
- [[paxos]] [[raft]] —— 共识协议假定 reliable transport，HTTP/2 over TCP / HTTP/3 over QUIC 都满足，但 HTTP/3 的 0-RTT 在 leader 重选举场景可能危险（replay）

进一步阅读：

- RFC 7540（HTTP/2 本体，2015）+ RFC 7541（HPACK）
- RFC 9113（HTTP/2 修订版，2022）+ RFC 9204（QPACK，HTTP/3 的 HPACK 后继）
- RFC 9218（Extensible Priorities，取代 HTTP/2 dependency tree）
- "HPACK: Header Compression for HTTP/2"（Peon & Ruellan, RFC 7541）
- "High Performance Browser Networking" by Ilya Grigorik（O'Reilly 2013，HTTP/2 章节是入门最佳）
- "Learning HTTP/2" by Stephen Ludin & Javier Garza（O'Reilly 2017，部署视角）
- "HTTP/3 explained" by Daniel Stenberg（在线书，curl 作者维护，对照 HTTP/2 看演进）
- "How fast is HTTP/3 really?" Cloudflare 2021 实测博客
- "HTTP/2 Rapid Reset Attack" Google / AWS / Cloudflare 2023-10 联合披露
- "The State of HTTP/3" W3Techs 2024 部署率追踪
- nghttp2 文档（https://nghttp2.org/）—— 实现侧最完整的 HTTP/2 资源
- IETF HTTPbis 工作组邮件存档 —— 标准化讨论一手资料
