---
title: Krishnamurthy 1999 — HTTP/1.0 到 1.1 究竟改了什么
来源: Krishnamurthy, Mogul, Kristol, "Key Differences between HTTP/1.0 and HTTP/1.1", WWW8 1999
日期: 2026-06-01
分类: 网络协议
难度: 入门
---

## 是什么

这是 1999 年 WWW8 大会上的一篇**协议导览**——三位作者（来自 AT&T、Compaq、Bell Labs，都是 HTTP/1.1 标准的实际起草人）写给业界看："1.0 到 1.1 我们到底改了哪些东西，为什么改"。

日常类比：把它想成**一辆车从手动挡升级到自动挡**的说明书——不是新发明一辆车，而是在原有基础上把最磨人的几个动作自动化了。HTTP/1.0 的"磨人之处"是：每发一次请求就开一条 TCP 连接、不能让多个网站共用同一个 IP、缓存说不清"什么时候过期"。HTTP/1.1 把这些一一改掉。

读完你会知道**七件事**为什么是今天 Web 的地基：持久连接、流水线、Host 头、分块传输、字节范围、缓存控制、内容协商。

## 为什么重要

不读这篇你会以为 HTTP/2 / HTTP/3 是凭空出现的。其实：

- HTTP/2 的多路复用 = HTTP/1.1 流水线 + 修掉队头阻塞
- CDN 能让百万站点共用一个 IP = 因为 1.1 的 Host 头
- 浏览器 DevTools 里看到的 `Cache-Control: max-age=3600` = 这篇里写的设计
- 任何"动态生成的网页"（PHP、SSR、Server-Sent Events）能边算边发 = 因为分块传输

更关键：这是少见的**用工程语言写给工程师看**的协议解读，比 RFC 2616 好读 10 倍。

## 核心要点

HTTP/1.1 相比 1.0 的改动可以归到 **七大类**，论文按这个顺序讲：

1. **可扩展方法**：1.0 方法固定（GET/HEAD/POST），1.1 允许 OPTIONS / PUT / DELETE / TRACE，且服务器可声明自己支持哪些
2. **连接管理**：持久连接 + 流水线（详见下文案例 1）
3. **Host 头**：请求必须带 `Host: example.com`，让一个 IP 服务多个域名（虚拟主机）
4. **分块传输**：`Transfer-Encoding: chunked` 让"长度未知"的动态内容也能边生成边发
5. **字节范围**：`Range: bytes=0-499` 请求文件的一段，支持断点续传 / 视频跳转
6. **缓存控制**：用 `Cache-Control` + `ETag` 替换 1.0 含糊的 `Expires` + `If-Modified-Since`
7. **内容协商**：`Accept-Language` / `Accept-Encoding: gzip` 让服务器返回最合适的版本

## 实践案例

### 案例 1：持久连接 + 流水线为什么这么重要

HTTP/1.0 加载一个有 10 张图的网页：

```
开 TCP → 三次握手 → 请求 HTML → 收 HTML → 关 TCP   （1 RTT 握手 + 1 RTT 请求）
开 TCP → 三次握手 → 请求 img1 → 收 img1 → 关 TCP   （重复 10 次）
...
```

每开一条 TCP 都要付 **1 个往返时间（RTT）的握手 + TCP 慢启动期间的低带宽**。10 张图 = 11 条连接 = 浪费 11 个握手 RTT。

HTTP/1.1 默认**持久连接**：

```
开 TCP → 握手 → 请求 HTML → 收 HTML
              → 请求 img1 → 收 img1
              → 请求 img2 → 收 img2  ...   （连接不关）
```

握手只付一次。再加上**流水线**——客户端可以把 10 个图片请求一次性发出去，不等响应：

```
客户端：→ 请求 img1, img2, img3, ..., img10  （一次性发完）
服务器：→ 响应 img1, img2, img3, ..., img10  （按顺序回）
```

延迟从"10 RTT"压到"接近 1 RTT"。这是 1999 年 WWW8 上引爆全场的数字。

**留下的坑**：流水线要求服务器**按顺序**回复。如果 img1 算得慢，img2-10 就被堵住——这叫**队头阻塞（head-of-line blocking）**。HTTP/2 用多路复用修掉它，但你看，问题是 1999 年就埋下的。

### 案例 2：Host 头为什么是 IPv4 的救命稻草

1996 年的一个真实困境：你想让 `alice.com` 和 `bob.com` 都跑在同一台服务器上。但 HTTP/1.0 的请求长这样：

```
GET /index.html HTTP/1.0
```

服务器只看到路径 `/index.html`，**完全不知道**用户想访问哪个域名。结果只能给每个域名分配一个 IP。1996 年时 IPv4 已经在喊"地址不够用"了。

HTTP/1.1 强制要求：

```
GET /index.html HTTP/1.1
Host: alice.com
```

服务器看 `Host` 字段决定返回 alice 的页面还是 bob 的。这一改：

- CDN 能让一个 IP 撑百万站点（CloudFlare / Akamai 的商业模式基础）
- 共享虚拟主机便宜了一个数量级
- 给 IPv4 续命二十年

### 案例 3：分块传输解决"长度不知道"的死局

HTTP 响应必须告诉客户端"我要发多少字节"，否则客户端不知道何时停。1.0 用 `Content-Length: 12345`。

但**动态内容**（PHP、SSR、流式生成的 JSON）在开始发送时**根本不知道**最终长度。1.0 时代两种烂解法：

- **解法 A**：先在服务器内存里把完整响应攒齐再发——内存爆炸
- **解法 B**：发完直接关 TCP 让客户端"看到 EOF 就当结束"——杀死了持久连接

1.1 的分块传输：

```
HTTP/1.1 200 OK
Transfer-Encoding: chunked

1a\r\n            ← 这一块 0x1a = 26 字节
abcdefghijklmnopqrstuvwxyz\r\n
10\r\n            ← 这一块 0x10 = 16 字节
... 16 字节内容 ...\r\n
0\r\n             ← 0 长度的块表示结束
\r\n
```

每块自己声明自己长度，整体不需要预先知道。**结果**：服务器边算边发、内存占用恒定、连接还能复用。今天的 Server-Sent Events、流式 LLM 输出（ChatGPT 那种字一个个蹦出来的效果）都是这个机制。

## 踩过的坑

1. **流水线在野外几乎没用起来**：理论上能压延迟，实际部署时代理 / 中间盒经常错乱（请求和响应对不上）。浏览器要么默认关闭要么有限启用。最终 HTTP/2 用多路复用替代

2. **Cache-Control 直接弃用 Pragma**：1.0 只有 `Pragma: no-cache`，是请求方向的、含义模糊。1.1 用 `Cache-Control` 全方位指令——`max-age` / `no-cache` / `no-store` / `must-revalidate` / `private` / `s-maxage` 区分浏览器缓存和共享缓存

3. **ETag 替换时间戳**：1.0 用 `Last-Modified` + `If-Modified-Since`，秒级精度，sub-second 更新会漏检。1.1 引入 `ETag`（不透明字符串，可以是哈希）+ `If-None-Match`，精确比对

4. **Vary 是缓存的隐形雷**：返回 `Vary: Accept-Encoding` 告诉 CDN "这个响应根据 Accept-Encoding 不同有多个版本"。漏写就会把 gzip 版本给不支持 gzip 的客户端

## 适用 vs 不适用场景

**HTTP/1.1 至今仍合适**：
- 简单博客、文档站、API server
- 浏览器 -> 任何后端的兜底协议（HTTP/2/3 协商失败时回退）
- 调试场景（明文好读）

**应该升级到 HTTP/2 / HTTP/3 的场景**：
- 高并发资源加载（多路复用甩开队头阻塞）
- 移动网络（HTTP/3 over QUIC 在丢包率高时优势明显）
- 高频小请求（HPACK 头压缩省带宽）

## 历史小故事（可跳过）

- **1991 年**：Tim Berners-Lee 写出 HTTP/0.9。一行命令：`GET /path`。没有版本号、没有头、没有错误码
- **1996 年**：HTTP/1.0（RFC 1945）补上了 header、版本号、状态码。但每请求一关连接的设计成了瓶颈
- **1997 年**：RFC 2068 定义 HTTP/1.1 初版
- **1999 年 5 月**：本论文在 WWW8 发表，作者就是写 RFC 2068 的人
- **1999 年 6 月**：RFC 2616 修订版发布
- **2015 年**：HTTP/2 (RFC 7540) 解决流水线队头阻塞
- **2022 年**：HTTP/3 (RFC 9114) 把传输层从 TCP 换成 QUIC

26 年后的今天写 fetch / axios / curl，背后跑的还是 1999 年这套头字段语义。

## 学到什么

1. **协议演进是叠加不是替换**：1.1 没废掉 1.0，只是补齐缺口。HTTP/2/3 也没废 1.1 头字段语义，只换了线路上的字节编码
2. **一个字段能救一个产业**：Host 头三十个字符让 CDN 行业成为可能
3. **流式 vs 完整 是基本张力**：分块传输代表"先发部分、再发部分"的胜利。今天的 SSE、流式 LLM、HTTP/2 server push 都是同一思路的延伸
4. **设计要和部署现实对账**：流水线在论文里是巨大胜利，在野外被中间盒打死。再好的协议也要看生态能否吞下

## 延伸阅读

- 论文原文：[Krishnamurthy 1999 PDF](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1999/CSD-99-1064.pdf)
- 标准文本：[RFC 7230-7235](https://datatracker.ietf.org/doc/html/rfc7230)（2014 年把 RFC 2616 拆成六篇）
- [[fielding-rest-2000]] —— REST 论文，HTTP 设计哲学的另一篇关键文献
- [[http-2]] —— HTTP/2 多路复用如何修掉本文埋下的队头阻塞坑
- [[mogul-1995-persistent-http]] —— 持久连接最早的实测论文（本文作者之一 Mogul 写的）

## 关联

- [[fielding-rest-2000]] —— REST 把 HTTP 当成应用层架构来设计的方法论
- [[http-2]] —— HTTP/2 把流水线升级为多路复用
- [[mogul-1995-persistent-http]] —— 持久连接的早期实证
- [[padmanabhan-1995-http-latency]] —— 同期对 HTTP 延迟瓶颈的分析
- [[akamai-2002]] —— Host 头使 CDN 成为可能后的大规模工程实践

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[padmanabhan-1995-http-latency]] —— Padmanabhan-Mogul 1995 — 用秒表证明：持久连接 + 流水线能砍掉 HTTP 延迟
