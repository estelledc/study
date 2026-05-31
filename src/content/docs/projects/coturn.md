---
title: coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
来源: coturn/coturn GitHub README + RFC 5766 / RFC 8656
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

coturn 是一个**用 C 写的开源服务器**，它干的事是：当两个上网的人因为各自家里的路由器（NAT）挡着、连不上彼此的时候，coturn 站在公网上做"中转员"，把数据帮你来回搬。

日常类比：两个住在不同小区的人想直接对讲，但小区门禁都不让外人进。coturn 是开在城市中心的咖啡馆——双方都先到这里，借这里的桌子说话。

技术上它实现两套协议：

- **STUN**（RFC 5389）：告诉你"你在公网上看起来是什么 IP 和端口"
- **TURN**（RFC 5766 / 8656）：在 STUN 不够用时，真的帮你中转所有数据包

GitHub 12k+ star，作者是 Oleg Moskalenko，BSD 3-Clause 协议。Jitsi Meet、Nextcloud Talk、Matrix/Element 这些做实时通讯的开源项目几乎都用它。

## 为什么重要

WebRTC（浏览器里两人直接视频通话的技术）有个根本问题：**家里宽带的 NAT 默认禁止外人主动连进来**。直接 P2P 在严格 NAT、企业防火墙、对称型 NAT 下大概率失败。

没有 TURN 服务器，下面这些场景会直接挂掉：

- 公司网络里的同事打 Google Meet
- 4G/5G 移动网络下的微信视频（运营商 NAT 是出名的严）
- 学校宿舍 WiFi 下的 Discord 语音

coturn 是**开源世界唯一能跟商业 TURN 服务（Twilio / Xirsys）打的产品**。你自己搭一台，能省掉每月按流量计费的账单——但代价是要自己懂 NAT 穿透。

## 核心要点

理解 coturn 要抓住四件事：

1. **STUN 报地址**：客户端发一个包过来，coturn 把"我看到你来自 IP 1.2.3.4 端口 5678"写在回包里。客户端拿着这个地址去告诉对方"你来连我这个公网地址"。这一步**没有任何数据中转**，开销极小。
2. **TURN 中转**：当对方仍然连不上时，客户端发一个 `Allocate` 请求，coturn 在自己机器上分配一个端口当**中继口**（XOR-RELAYED-ADDRESS），所有数据从这里转。默认租期 600 秒，到期不续就回收。中转前还要 `CreatePermission`（5 分钟有效）告诉服务器"允许这个对端 IP 给我发数据"——防止有人借你中转打别人。
3. **Channel 省字节**：每个 TURN 包都要带 36 字节头太浪费。客户端可以申请一个 16 位 channel number（0x4000-0x7FFE），之后每包只带 4 字节头。寿命 10 分钟，过期要续。
4. **ICE 三层候选**：浏览器同时收集"本机地址""STUN 看到的反射地址""TURN 中继地址"三类候选，**优先 P2P 直连，TURN 是兜底**。这个顺序很重要——能不走中转就不走，省钱省延迟。

认证有三种模式：长期凭证（用户名密码，写死在 db）、短期凭证（HMAC 签名）、REST API 时限凭证（推荐做法，给前端发一个 5 分钟有效的临时账号）。后端用 shared secret 签出 `username = 时间戳:用户ID`、`password = HMAC-SHA1(secret, username)`，前端拿到就用，过期自动失效。

数据库支持 SQLite / MySQL / PostgreSQL / MongoDB / Redis 五种，存用户和会话状态。生产环境一般选 Redis（轻量、原生过期）。

## 实践案例

### 案例 1：配 Jitsi Meet 的 TURN

`/etc/turnserver.conf` 最小可用配置：

```
listening-port=3478
tls-listening-port=5349
external-ip=PUBLIC_IP
realm=example.com
use-auth-secret
static-auth-secret=YOUR_SECRET
total-quota=100
cert=/etc/letsencrypt/live/example.com/fullchain.pem
pkey=/etc/letsencrypt/live/example.com/privkey.pem
```

`use-auth-secret` 配合后端发临时凭证。前端拿到的不是真密码，是用密钥签名出来的、5 分钟过期的串。

### 案例 2：TLS 在 443 端口兜底

很多企业防火墙连 5349 都不让出。coturn 支持监听 443/TCP+TLS，让 TURN 流量伪装成 HTTPS 出去。代价是和你的 web 服务器抢 443，所以**通常单独用一台机器跑 TURN**。

### 案例 3：测试是否通

coturn 自带 `turnutils_uclient` 命令行客户端，专门用来跑通整套握手：

```
turnutils_uclient -v -t -T -u USER -w PASS PUBLIC_IP
```

这条命令会模拟客户端走一遍 Allocate / CreatePermission / ChannelBind / 发数据，能看到完整握手日志。配错了在这里会直接报错——比 WebRTC 浏览器调试方便得多，因为浏览器只会沉默地把候选打叉，不告诉你为什么。

### 案例 4：在线测试工具

Trickle ICE 测试页（webrtc.github.io/samples/src/content/peerconnection/trickle-ice/）让你填 TURN URL 和凭证，点一下能看到收集到的所有候选。看到 `relay` 类型说明 TURN 通了，只看到 `srflx` 说明只有 STUN 通、TURN 没起作用。

### 案例 5：监控告警

生产环境用 prometheus-coturn-exporter 把指标抓出来：当前会话数、每秒 Allocate 数、出入带宽、auth 失败率。最该报警的是**走 TURN 的会话比例突然飙升**——往往是上游 STUN 服务挂了或者 NAT 类型探测错了，所有会话被迫走中转。

### 案例 6：和 SFU 协同

mediasoup 等 SFU 框架自带 ICE Server 配置项，把 coturn 的 URL 和临时凭证填进去就行。SFU 处理多人混流的同时，TURN 负责少数完全连不上 SFU 公网地址的客户端兜底——典型企业内网用户。

## 踩过的坑

1. **`external-ip` 没配**：服务器在云上有内网 IP 也有公网 IP，coturn 默认报内网 IP，客户端拿到后连不上。**必须显式 `external-ip=PUBLIC_IP/PRIVATE_IP`**。AWS / 阿里云 / 腾讯云的 ECS 都属于这种情况。
2. **中继端口段太窄**：默认 49152-65535 共 16k 端口。每个会话占 2 个，理论 8k 并发。生产环境要在防火墙放通整段 UDP，少一个端口就有用户连不上。安全组配置粗心很容易忘掉。
3. **TURN 流量翻倍**：A→TURN→B 每个字节走两遍，带宽账单会让你心痛。**业务上要监控走 TURN 的比例**，正常应该 10-20%，超过就是 STUN 配错了。
4. **TLS 证书必须真证书**：coturn 不接受自签名给生产用，浏览器 WebRTC 会拒。Let me Encrypt 免费证书够用但要配自动续期；coturn 默认不会自动 reload 证书，crontab 里要加 `pkill -USR2 turnserver` 触发重载。
5. **realm 必须和前端一致**：长期凭证模式下，前端写的 realm 和服务端配的不一样，会一直 401，日志只说 "no credentials"，新人调半天。
6. **systemd 启动顺序**：如果 coturn 依赖 Redis 存凭证，systemd unit 里要写 `After=redis.service`，否则重启机器后 coturn 比 Redis 早起来，连不上数据库直接挂。

## 适用 vs 不适用场景

**适用**：

- 自建 WebRTC 应用（视频会议、语音聊天、实时协作白板）的 NAT 兜底
- 替代 Twilio / Xirsys 这类按量计费的商业 TURN，节省成本
- 需要把 TURN 流量伪装成 HTTPS（443/TLS）穿越严格防火墙
- 学习 STUN/TURN/ICE 协议——源码 C 写的，结构清晰，是教科书级实现

**不适用**：

- 需要 SFU（多人会议转发，比如 mediasoup / Janus）→ TURN 只是 1:1 中转，不做媒体处理，多人会议要叠 SFU 在前面
- 需要 MCU（服务端混流）→ 同上，混流要 GPU 解码再编码，coturn 不碰媒体内容
- 内网通话不出公网 → 直接 P2P 就够，根本用不上 TURN
- 想做信令（谁打给谁）→ 那是 WebSocket 服务器的事，不是 TURN；TURN 只接管"已经知道要连谁"之后的数据通路
- 大规模分布式部署 → coturn 单机模式为主，多节点同步要自己拼 Redis 共享，没现成的集群方案

## 历史小故事（可跳过）

- **2008 年前后**：Oleg Moskalenko 个人写了 `rfc5766-turn-server`，跟着 RFC 草案演进。当时 WebRTC 还没出来，主要用户是 SIP 视频电话和早期 IM 软件。
- **2012 年**：项目改名 coturn（"complete TURN" 的意思），加了 STUN、TLS、长期短期双凭证。同年 Google 在 Chrome 里启用 WebRTC，TURN 服务器需求量爆发。
- **2014-2018 年**：Jitsi、Matrix、Nextcloud 陆续选它做默认 TURN，star 数从几百涨到上万。商业云服务（Twilio、Xirsys）也开始基于 coturn 包装收费。
- **2020 年后**：Oleg 放慢维护节奏，社区接管为主，PR 处理速度变慢但仍在更新。RFC 8656（TURN bis）在这期间合入，统一了 IPv4/IPv6 的处理。

## 学到什么

1. **NAT 穿透的核心顺序是"先 P2P，不行再反射，再不行才中转"**，TURN 永远是兜底——这个顺序写在 ICE 协议里，理解它才能解释为什么有时通话很快、有时延迟突然变高（切到中转了）
2. **同一份代码同时实现 STUN+TURN+TLS** 是 coturn 的工程价值，不用拼三个组件，少一份配置错位的可能
3. **认证模式选 REST 时限凭证**，别把长期密码发到前端，这是 WebRTC 安全最大的踩坑点——前端代码任何人都能 F12 看
4. **运维监控要看走 TURN 的比例**，这个数字直接决定带宽账单和用户体验，正常应该 10-20%
5. **协议设计的 trade-off**：Channel 4 字节头省流量但要 10 分钟续期，Permission 5 分钟既防滥用又不至于频繁握手——RFC 选这些数字时考虑了真实网络的延迟和丢包率

## 延伸阅读

- 项目主页：[github.com/coturn/coturn](https://github.com/coturn/coturn)
- 配置 wiki：[coturn/coturn wiki](https://github.com/coturn/coturn/wiki)（最实用，包含 Jitsi/Nextcloud/Matrix 的完整配置示例）
- 协议参考：RFC 5389（STUN）/ RFC 5766（TURN 原版）/ RFC 8656（TURN bis）/ RFC 8445（ICE）
- WebRTC 全景：[webrtcforthecurious.com](https://webrtcforthecurious.com/)（免费在线书，第 3 章专门讲 NAT 类型与 TURN）
- 抓包视角：用 Wireshark 看 STUN/TURN 包的字段对照，能把抽象协议变直观

## 关联

- [[libp2p]] —— 另一种 P2P 网络栈，也要解 NAT 但思路偏 DHT
- [[nginx]] —— 同样是 C 写的高性能网络服务器，可对比事件循环写法
- [[envoy]] —— 现代 L4/L7 代理，处理 TCP/UDP 中转的另一种思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[nginx]] —— nginx — 高性能 Web 服务器

