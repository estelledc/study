---
title: coturn — 帮 WebRTC 穿越 NAT 的开源中转服务器
来源: coturn 项目（Oleg Moskalenko 创建，BSD 3-Clause），GitHub coturn/coturn，遵循 RFC 5389 / 5766 / 8656
日期: 2026-05-31
分类: 基础设施
难度: 中级
---

## 是什么

**coturn** 是一个开源的 TURN/STUN 服务器实现，作用是**帮两台都躲在路由器后面、互相看不见对方的电脑接通**——用一台公网中转机当邮差。

日常类比：

- 你和朋友都住在小区里（NAT 后面），单元楼门禁让外面的快递进不来
- STUN 像让朋友先告诉你"我家小区门口的地址"
- 如果门禁太严连小区门口都送不进去，TURN 就是一台**公网邮局**：你俩都把包裹寄到邮局，邮局再互相转交

coturn 就是这台邮局的最常见实现。视频会议（Jitsi Meet、Nextcloud Talk、Matrix/Element）在用户网络太差时，背后兜底的几乎都是它。

## 为什么重要

不知道 coturn / TURN 这层，下面这些事都不好理解：

- 为什么浏览器视频通话**有时候特别清晰、有时候卡顿翻倍**——清晰那次是 P2P 直连，卡那次是被迫走中转
- 为什么公司网络下视频会议**总是连不上 UDP**，但切到 443 端口又能用——TURN 可以伪装成 HTTPS over TLS 走 443
- 为什么部署一套自托管视频会议系统，文档总让你**单独开一台机器装 coturn**——它必须有公网 IP，否则中转无意义
- 为什么 WebRTC 流量比想象中贵——走 TURN 的时候服务器**进出流量翻倍**（A 上传给服务器，服务器再下发给 B）

## 核心要点

coturn 实现的是 **ICE 协议族**里的"兜底通道"，可以拆成 **三层候选地址**：

1. **host 候选**：本机的内网 IP。同一局域网下能直接通。
2. **server-reflexive 候选（STUN）**：客户端问 coturn"我从你这看出去长啥样"，coturn 告诉它公网映射的 `IP:port`。运气好双方都是锥形 NAT，就能直接 P2P。
3. **relay 候选（TURN）**：上面都失败了，客户端发 **Allocate 请求**让 coturn **在自己身上开一个中转端口**，所有流量从 A 上传到这个端口、再下发给 B。

TURN 协议两条关键机制：

- **Allocate**：分配中转地址，默认 `LIFETIME` 600 秒，到期不续就回收
- **ChannelBind**：把对端地址绑到一个 16 位通道号，之后发数据**只用 4 字节头**（不绑则要带完整 STUN 包头，多花 36 字节，对实时音视频很贵）

为什么会有 ICE 这种"列候选-试一遍"的设计？因为 NAT 类型太杂：

- **全锥形 NAT**：内外端口固定映射，STUN 报地址就够，最容易穿透
- **地址限制 / 端口限制锥形**：要先发包出去对方才能回，需要"打洞"动作
- **对称 NAT**：每个目的地址都新映射一个端口，**STUN 报的地址换个对端就失效**——这种只能上 TURN 中转

所以 ICE 的策略是：**所有候选都试，挑最快通的那条**。coturn 同时承担"报地址"（STUN）和"中转"（TURN）两个角色，部署一台机器就够。

## 实践案例

### 案例 1：Jitsi Meet 怎么用 coturn

Jitsi 的部署里典型分工：

- **Prosody**（XMPP 服务器）通过 `mod_turncredentials` 给客户端**临时签发**用户名/密码（HMAC-SHA1，时限几分钟）
- **客户端**拿这对临时凭证去 coturn 上 Allocate 中转地址
- **媒体流**走 coturn 端口 `3478`（UDP）；如果 UDP 被防火墙完全屏蔽，再退到 `5349`（TLS over TCP）

这种"短时凭证"模式比写死用户密码安全得多——泄露了也只活几分钟。

### 案例 2：external-ip 配错的经典坑

云上部署 coturn（AWS/GCP），机器有两个 IP：

- 内网 `10.0.x.x`（系统 ifconfig 看到的）
- 公网 `54.x.x.x`（NAT 网关映射出去的）

如果 `turnserver.conf` 不写：

```ini
external-ip=54.x.x.x/10.0.x.x
```

coturn 会**告诉客户端走 `10.0.x.x`**——客户端在公网上根本路由不到这个地址，连接直接失败。报错还很隐晦：客户端只看到"ICE failed"。

### 案例 3：为什么 TURN 流量翻倍

A 上传 1 Mbps 给 coturn，coturn 再下发 1 Mbps 给 B。从 coturn 视角看：

- 入流量：1 Mbps（来自 A）
- 出流量：1 Mbps（发给 B）
- **总带宽消耗：2 Mbps**

100 个 1v1 通话同时走 TURN，机器要扛 200 Mbps。这是为什么生产部署都尽量让 P2P 先尝试、TURN 只兜底。

## 踩过的坑

1. **端口段开太窄**：默认 relay 端口段 `49152-65535`，但很多人在防火墙只放了几百个端口。**每个 Allocate 占一个端口**，并发上千就用光了
2. **TURN over TLS 证书过期**：`5349` 端口要 HTTPS 级别证书。证书一过期，所有走 TLS 兜底的客户端立刻断线，监控不容易看出来——P2P 用户感受不到
3. **认证模式混用**：`use-auth-secret`（短时凭证）和 `lt-cred-mech`（长期账号库）**不能同时启用**。新人常常两个一起开，结果两边都不工作
4. **日志文件长爆磁盘**：默认日志写到 `/var/log/turnserver/`，高并发下每天几个 G。要么配 `simple-log` 关详细日志，要么 logrotate

## 适用 vs 不适用场景

**适用**：

- 自托管 WebRTC 视频/语音会议（Jitsi、BBB、Nextcloud Talk、Matrix）
- IoT 设备 P2P（设备在家用路由器后，远程客户端要直连）
- 需要 NAT 穿透的游戏联机、远程桌面
- 客户端在严格防火墙后（企业网、酒店 WiFi），需要 TLS 443 兜底

**不适用**：

- **多方会议（4 人以上）**：那是 SFU/MCU 的活（Jitsi Videobridge、mediasoup、Janus）。TURN 是 1v1 中转，不做混流
- **强加密保密通话**：TURN 看不到媒体内容（DTLS-SRTP 端到端加密），但**能看到通话双方的 IP 和时间**——隐私敏感场景要警惕
- **完全公网环境**：双方都有公网 IP 直接连，根本不需要 TURN

## 一个最小配置的样子

为了不只停留在概念，给个能跑的最小 `turnserver.conf` 骨架（自托管视频会议常见写法）：

```ini
listening-port=3478
tls-listening-port=5349
external-ip=54.x.x.x/10.0.x.x
realm=meet.example.com
use-auth-secret
static-auth-secret=<随机长字符串>
min-port=49160
max-port=49200
cert=/etc/letsencrypt/live/meet.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/meet.example.com/privkey.pem
no-stdout-log
log-file=/var/log/turnserver.log
```

这十几行覆盖了：双端口监听、公网/内网 IP 映射、HMAC 短时凭证、TLS 证书、日志落盘。生产环境再加上 prometheus 监控、`total-quota` 限并发就比较完整。

## 历史小故事（可跳过）

- **2008 前后**：Oleg Moskalenko 写了 `rfc5766-turn-server`，是当时少有的开源 TURN 实现
- **2012**：Oleg 把项目重构、扩展，改名为 **coturn**（"community TURN"），加了多种数据库后端、REST 凭证 API、TLS 支持
- **2010 中后期**：WebRTC 浏览器普及，coturn 成为事实标准——几乎所有自托管视频会议方案都依赖它
- **2020 年代**：Oleg 逐渐淡出，社区接管（Misi、Pavel Punsky 等维护者）。GitHub 上 12k+ stars

## 学到什么

1. **NAT 穿透不是一个协议，是一套候选机制**——ICE 让客户端把所有可能的地址都列出来，挑最优的
2. **STUN 是问"我看出去啥样"，TURN 是"实在不行就走我"**——前者一次握手，后者持续中转
3. **Allocate + Channel** 这种"先建会话、再压缩头"的设计在很多协议里能见到（QUIC 的连接 ID、HTTP/2 的 stream）
4. **TURN 流量翻倍的代价决定了部署策略**——P2P 优先、TURN 兜底，不是技术选择，是钱的选择

## 延伸阅读

- 项目主页：[coturn/coturn GitHub](https://github.com/coturn/coturn)（README + wiki 全在这）
- RFC 8656：[当前 TURN 规范](https://datatracker.ietf.org/doc/html/rfc8656)（替代 RFC 5766）
- Jitsi 官方部署文档：[Setting up coturn for Jitsi](https://jitsi.github.io/handbook/docs/devops-guide/turn/)（最完整的实战示例）
- WebRTC for the Curious：[ICE/STUN/TURN 章节](https://webrtcforthecurious.com/docs/03-connecting/)（图很清楚的免费书）
- [[quic]] —— QUIC 也要面对 NAT 穿透，但走的是另一条路（连接迁移 + 0-RTT）
- [[tcp]] —— TURN over TCP 兜底就是把媒体塞进 TCP，理解 TCP 行为有助于调参
- [[websocket-rfc-6455]] —— 部分场景下 TURN 客户端用 WebSocket 代替 UDP

## 关联

- [[quic]] —— 同样关心 NAT 后两端如何稳定通信，但 QUIC 在协议层解决，TURN 在中转层兜底
- [[tcp]] —— TURN-TCP 模式建立在 TCP 之上，行为受 TCP 拥塞控制影响
- [[dns]] —— TURN 客户端通常通过 SRV 记录发现服务器地址
- [[http-2]] —— 都是基础设施层协议，思想上有"复用 + 流控"的影子

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gcc-webrtc-2016]] —— GCC (WebRTC) — 让视频通话不卡的拥塞控制算法
- [[ice-rfc-5245]] —— ICE (RFC 5245) — 让两台藏在 NAT 后面的设备找到彼此
