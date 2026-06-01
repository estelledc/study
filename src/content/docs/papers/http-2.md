---
title: HTTP/2 — 把 HTTP 从文本协议改造成二进制多路复用
来源: 'RFC 7540, "Hypertext Transfer Protocol Version 2 (HTTP/2)", IETF HTTPbis Working Group, 2015-05；RFC 9113 修订, 2022-06'
日期: 2026-05-30
分类: 网络协议
难度: 中级
---

## 是什么

HTTP/2 是 2015 年 IETF 发布的 HTTP 第二代协议，把 HTTP 从**文本协议**改成**二进制 frame 多路复用协议**。日常类比：从一条只能单向通行的小路（HTTP/1.1，每次只能跑一辆车），改造成多车道高速（一个 TCP 连接上多辆车并排跑）。

HTTP/1.1 在一个 TCP 连接上只能严格串行：上一个请求没回完，下一个请求只能等。浏览器为绕过这个"队头阻塞"，对每个 host 开 **6 个并发 TCP 连接**——代价是 6 次握手 + 6 次 slow-start + cookie/header 重复发 6 遍。

HTTP/2 改成：单个 TCP 连接上跑很多 **stream**（逻辑通道），每个 stream 切成小 **frame**（二进制数据包，9 字节头），frame 之间可以**交错传输**——一会儿 stream 1 的 DATA，一会儿 stream 3 的 HEADERS，一会儿 stream 5 的 DATA。这是 OCaml/Haskell 编译器自动推类型那种"安静地把脏活干了"的体感。

源头是 Google 2009 年内部实验的 SPDY 协议，2012 年部署到 Chrome/Firefox/Twitter，2014 年 IETF 以 SPDY/3 为蓝本起草，2015 年发布 RFC 7540 + 7541（HPACK header 压缩）。

## 为什么重要

不理解 HTTP/2，下面这些事都没法解释：

- 为什么 gRPC / Anthropic API / OpenAI streaming 都基于 HTTP/2——长连接 + 多路复用 + streaming response 是 RPC 的天然底座
- 为什么浏览器加载现代网页比 2010 年快很多，但服务器配置反而少了——单连接 + ALPN 协商让基础设施简化
- 为什么 HTTP/3 又用 UDP 重做了一次——HTTP/2 在 TCP 上的多路复用没解决 head-of-line blocking
- 为什么 server push 出现 7 年又被浏览器全关——协议上对称的 feature 在生产环境不一定对称

## 核心要点

HTTP/2 的设计可以拆成 **三个核心抽象**：

1. **Frame**：通信最小单元，9 字节固定头（length 24 bit + type 8 bit + flags 8 bit + stream id 31 bit）+ 变长 payload。10 种类型：DATA / HEADERS / SETTINGS / PUSH_PROMISE / PING / GOAWAY / WINDOW_UPDATE / RST_STREAM / PRIORITY / CONTINUATION。

2. **Stream**：一个连接里的逻辑双向通道，承载一个请求 + 响应。Stream ID 31 bit，奇数 = client 发起，偶数 = server 主动 push。状态机有 7 个状态（idle → open → half-closed → closed）。

3. **HPACK**：header 压缩算法（RFC 7541），三层结构——静态表 61 项预定义 header（`:method GET` 1 字节命中）+ 动态表 FIFO 缓存最近 header（cookie 第二次发只需索引）+ Huffman 编码字面值（5-6 bit 一个常见字符）。重复请求的 header 块能压到 HTTP/1.1 的 5-10%。

加上**应用层流控**（每个 stream 独立窗口，初始 65535 字节，receiver 用 WINDOW_UPDATE frame 加信用）+ **ALPN 协商**（TLS 握手里告知 "h2"）+ **优先级树**（已 deprecated，让位给 RFC 9218 简单 urgency header）+ **server push**（已被浏览器关），就构成了 HTTP/2 全貌。

## 实践案例

### 案例 1：浏览器加载一个 50 个资源的页面

HTTP/1.1：浏览器对一个 origin 开 6 个 TCP 连接，每条连接付一次握手 + slow-start，cookie 在 6 个连接上各发一次。50 个资源排队过 6 个口子。

HTTP/2：单个 TCP 连接，50 个 stream 并行交错。frame 在线上看像这样：

```
单 TCP 连接的字节流
[HEADERS s1][DATA s1 part1][HEADERS s3][DATA s1 part2][HEADERS s5]
[DATA s3][DATA s5][DATA s1 END_STREAM][DATA s3 END_STREAM]...
```

发送方按需把 frame 交错插入，接收方按 stream id 分发到各自处理逻辑。省掉 5 次握手 + 5 次 slow-start，cookie 跨请求只发一次（HPACK 动态表命中）。0% 丢包时实测比 HTTP/1.1 快 10-20%。

### 案例 2：gRPC 用 HTTP/2 做 RPC transport

gRPC 选 HTTP/2 不是历史包袱而是设计选择：

- **多路复用** → 一个长连接跑成千上万 RPC，无需连接池
- **二进制 frame** → 不用解析文本，反序列化直接拿 protobuf 字节
- **streaming** → DATA frame 流式传，原生支持 server-streaming / client-streaming / bidi-streaming
- **HEADERS 复用** → metadata（trace id / auth token）跨 RPC 用 HPACK 几乎不占字节

代价是 gRPC 强绑死 HTTP/2，迁移到 HTTP/3 要改 transport 层（grpc-web + h3 才刚起步）。

### 案例 3：HPACK 动态表怎么把 cookie 压成 1 字节

第一次请求 `cookie: session=abc123`：

1. 静态表第 32 项是 `cookie`（无 value），发 "name 索引 32 + value 字面值 abc123"，约 10 字节
2. 标记加入动态表，分配索引 62

第二次同样的请求：

1. 直接发索引 62（1-2 字节，二进制 `1011 1110`）
2. 命中

整个 1KB cookie 压成 1-2 字节，这是 HTTP/2 在重复请求场景的杀手锏。

实测压缩率：第一次请求 header 块 ≈ HTTP/1.1 的 60-70%（只有 Huffman 收益），重复请求 ≈ 5-10%（动态表命中）。代价是动态表 evict 行为可被 timing 推断（CRIME-like 攻击残留），敏感 header 必须用 "Never Indexed" 显式标记不进表，但应用开发者很少正确执行。

## 踩过的坑

1. **TCP head-of-line blocking 没解决**：HTTP/2 在协议层多路复用了，但所有 frame 仍走单一 TCP 字节流。一个 IP 包丢失，TCP 必须等重传，**所有 stream 都 stall**。Akamai 2017 实测：1% 丢包率下 HTTP/2 与 HTTP/1.1 + 6 连接打平，2% 以上 HTTP/2 反而慢——Mobile 网络典型 1-3% 丢包，HTTP/2 有时是负优化。

2. **server push 被证伪**：server 不知道 client 缓存里有什么，盲推 style.css 但 client 已缓存 = 浪费带宽。Chrome 106（2022）正式禁用，Firefox 同年关闭。103 Early Hints（RFC 8297）是更优雅替代——server 提示 "你即将需要这些"，client 自己决定要不要发请求。

3. **优先级 dependency tree 混乱**：RFC 7540 §5.3 写了 5 页的依赖树 + 权重 + exclusive bit。实际部署：浏览器实现各异、nginx 长期忽略、CDN 主动重写。RFC 9113（2022）正式 deprecate，让位给 RFC 9218 的简单 `priority: u=2, i` header。

4. **CVE-2023-44487 Rapid Reset**：client 大量开 stream 立即 RST_STREAM，server 资源耗尽。Google / AWS / Cloudflare 2023-10 同时披露，所有 HTTP/2 实现一起中招。根因是 RFC 7540 没限制 stream 开 + reset 速率——9 年后同类攻击模式仍击穿全行业。

5. **CONTINUATION frame 是历史包袱**：单 HEADERS 因为巨型 header 超 max frame size 时拆 CONTINUATION 续传，规定必须连续不交错——所有实现都为它付了 bug 代价（CVE-2024-27316 是续集）。RFC 9113 仍保留这个设计。

6. **Stream id 单调递增不复用**：长连接每跑几小时，stream id 接近 2^31 就必须 GOAWAY 重建连接。这是 HTTP/2 协议设计的小坑，库一般自动处理但调试时需要知道。

## 适用 vs 不适用场景

**适用**：

- 浏览器 ↔ 服务器（top 10M 站点 36% 部署，2024 W3Techs）
- 内部 RPC（gRPC 强绑 HTTP/2）
- 长连接 streaming（LLM API / WebTransport）
- 移动 app ↔ API（cookie / token 重发收益最大）

**不适用**：

- 极高丢包率链路（卫星 / 弱 WiFi，2% 以上丢包用 HTTP/3）
- 单次短请求（HTTP/2 协商开销盖不过收益，CDN 静态资源仍可走 HTTP/1.1）
- 明文 server-server（h2c 浏览器拒绝，但 service mesh 内部可用）
- 跨 stream 强依赖的协议（HTTP/2 stream 独立设计就是为了消除依赖）

## 历史小故事（可跳过）

- **1991**：Tim Berners-Lee 发布 HTTP/0.9，只有 `GET /path` 一行
- **1999**：HTTP/1.1 RFC 2616，加 keep-alive + pipelining（pipelining 几乎没人用对——浏览器都默认关）
- **2009**：Google 内部 Mike Belshe 启动 SPDY（"speedy" 缩写），目标是把 HTTP 改造为现代 web 协议
- **2012**：SPDY/3 部署到 Gmail / Google Search / Twitter / Facebook，证明二进制多路复用可行
- **2014**：IETF HTTPbis 工作组以 SPDY/3 + HPACK 为蓝本起草 HTTP/2，曾有 Microsoft 的 Speed+Mobility 等多个竞争提案，最终输给 SPDY 的部署证据
- **2015-05**：RFC 7540（HTTP/2）+ RFC 7541（HPACK）发布；Google Chrome 2016 deprecate SPDY，全部走 HTTP/2
- **2022-06**：RFC 9113 修订（清理 7 年勘误 + deprecate 优先级）+ RFC 9114（HTTP/3 over QUIC）同月发布
- **2023-10**：CVE-2023-44487 Rapid Reset 攻击，所有 HTTP/2 实现一起打补丁

从 SPDY 实验到标准化只用了 6 年，这是 IETF 历史上少见的快速迭代——但代价是 7 年后又被 HTTP/3 接力，标准还没"稳定"应用就要支持三代。

## 学到什么

1. **二进制 framing 是协议演进的关键**——文本协议（HTTP/1.x）解析慢、不能多路复用；frame 让多路复用 + 流控 + 优先级一起成为可能
2. **多路复用必须下沉到正确层**——HTTP/2 在应用层做、TCP 还是单 byte 流，HoL 没解决；HTTP/3 把 stream 下沉传输层才彻底清算
3. **协议的对称性 ≠ 部署的对称性**——server push 在 RFC 上对称，但 client cache 是私有信息 server 永远只能猜，导致 push 失败
4. **复杂特性大概率会被简化版取代**——优先级 dependency tree 7 年后被 urgency header 取代；过度工程的 feature 实际部署一定混乱
5. **协议安全要从 spec 层做 anti-DoS**——CVE-2023-44487 暴露 RFC 7540 没限制 stream 开 + reset 速率，9 年后同类攻击仍击穿全行业
6. **header 压缩需要专用算法**——zlib 直接压 header 招来 CRIME 攻击；HPACK 用 "静态表 + 动态表 + Huffman" 三层 + 显式索引 才能既压又安全

## 延伸阅读

- 视频：[High Performance Browser Networking — HTTP/2 chapter](https://hpbn.co/http2/)（Ilya Grigorik，O'Reilly，免费在线）
- 部署视角：[Learning HTTP/2](https://www.oreilly.com/library/view/learning-http2/9781491962435/)（Stephen Ludin & Javier Garza, 2017）
- RFC 6 页快读：[RFC 7540 §3-6](https://www.rfc-editor.org/rfc/rfc7540)（frame + stream + connection 核心三章）
- 实测对照：[How fast is HTTP/3 really?](https://blog.cloudflare.com/http-3-vs-http-2/)（Cloudflare 2021）
- 实现入门：[nghttp2 文档](https://nghttp2.org/)（C 实现 + 注释充分）

## 关联

- [[tcp]] —— HTTP/2 跑在 TCP 上，TCP 单 byte 流是 HTTP/2 head-of-line blocking 根源
- [[tls-1.3]] —— HTTP/2 事实强制 TLS 1.2+，TLS 1.3 + ALPN "h2" 是部署默认
- [[quic]] —— HTTP/3 用 QUIC 接力，把 stream 下沉到传输层彻底解 HoL
- [[dns]] —— HTTP/2 协商前先 DNS 解析，HTTPS DNS record（RFC 9460）让 ALPN 协商提前
- [[attention]] —— Transformer 推理 streaming API（OpenAI / Anthropic）走 HTTP/2，DATA frame 流式传 token
- [[flash-attention]] —— LLM serving 长连接 + 多路复用直接受益于 HTTP/2 设计
- [[bert]] —— BERT 类模型推理服务今天主流走 gRPC over HTTP/2

进一步阅读：

- RFC 7540（HTTP/2 本体）+ RFC 7541（HPACK）+ RFC 9113（修订版）+ RFC 9218（Extensible Priorities）
- "HTTP/2 Rapid Reset Attack" Google / AWS / Cloudflare 2023-10 联合披露，HTTP/2 协议层 anti-DoS 的反面教材
- "The State of HTTP/3" W3Techs 2024 年部署率追踪
- IETF HTTPbis 工作组邮件存档——标准化讨论一手资料

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[axum]] —— axum — 用 Rust 类型系统当『路由参数表』的 Web 框架
- [[bert]] —— BERT — 双向 Transformer 预训练
- [[cerf-kahn-1974]] —— Cerf-Kahn 1974 — 用网关把异构网络拼成一个互联网
- [[chi]] —— chi — Go 标准库友好的轻量 HTTP router
- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[clark-1988]] —— Clark 1988 — TCP/IP 七大目标的优先级，决定了 Internet 长成今天这样
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[connect-rpc]] —— ConnectRPC — 让 gRPC 在浏览器里裸跑的 RPC 协议
- [[coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[dns]] —— DNS — 把全球域名解析切成一棵可分布维护的树
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[echo]] —— Echo — 极简高性能 Go 框架，5 行起服务
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[gin]] —— Gin — Go 写 web API 的事实标准框架
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[kong]] —— Kong — 基于 nginx + Lua 的云原生 API 网关
- [[krishnamurthy-1999-http11]] —— Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么
- [[mogul-1995-persistent-http]] —— Mogul 1995 — 为什么 HTTP 必须改成"一根连接复用多次请求"
- [[padmanabhan-1995-http-latency]] —— Padmanabhan-Mogul 1995 — 把 HTTP 三种提速方案放一起跑，看谁真的快
- [[paxos]] —— Paxos — 分布式共识算法
- [[poem]] —— poem — 一份 impl 块同时变 HTTP API + OpenAPI 文档站的 Rust 框架
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[raft]] —— Raft — 易理解的共识算法
- [[rtp-rfc-1889]] —— RTP RFC 1889 — 让 UDP 也能跑实时音视频
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[server-sent-events]] —— Server-Sent Events — 服务器单向推送的标准协议
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tls-1.3]] —— TLS 1.3 — 把 HTTPS 握手砍到一个来回
- [[twirp]] —— Twirp — 用 protobuf 定义服务，但只走 HTTP/1.1 + JSON

