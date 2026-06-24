---
title: ICE (RFC 5245) — 让两台藏在 NAT 后面的设备找到彼此
来源: 'Rosenberg, "Interactive Connectivity Establishment (ICE)", RFC 5245, 2010'
日期: 2026-06-24
分类: 网络协议
难度: 中级
---

## 是什么

想象你和朋友各住在一个封闭小区里，门牌号只有小区内部认识，外人看不到。你想直接喊话（P2P 通信），但保安（NAT）只放行"你先喊出去的"回应，不允许外人主动闯入。ICE 就是一套**试探+挑选最佳喊话路线**的流程：先列出所有可能的联系方式（候选地址），两边互相试探，最后选出延迟最低、能通的那条路。如果所有直接喊话方式都被保安拦住，ICE 会自动安排一个"中间人"（TURN 中继）帮你转达，保证一定能通。

技术定义：ICE 是 IETF 定义的 NAT 穿越框架，编排 STUN（探测外部地址）和 TURN（中继兜底）两个协议，通过系统化的候选收集、优先级排序、连通性检查，为实时媒体（音视频）建立最优传输路径。WebRTC 的 P2P 连接建立完全依赖 ICE。

## 为什么重要

- 没有 ICE，两台在不同 NAT 后面的设备**无法直接通信**——这是互联网上 80%+ 的终端所处的环境
- WebRTC 视频通话、屏幕共享、P2P 文件传输的底层连接全靠 ICE 协商
- ICE 把"碰运气打洞"变成**有确定性保障的算法流程**：打洞失败就自动走中继，用户无感
- 理解 ICE 是理解 SDP offer/answer、STUN、TURN、RTP 等整条实时通信栈的前提
- 在移动网络环境下（4G/5G），运营商级 NAT（CGN）层级更深，ICE 的兜底策略尤其关键
- 所有主流浏览器（Chrome、Firefox、Safari）的 RTCPeerConnection API 内部实现都严格遵循 ICE 规范

## 核心要点

ICE 的工作分三个阶段：

**阶段一：候选收集（Gathering）**

每一端收集三类候选地址：

- host 候选：本机网卡上的局域网 IP（如 192.168.1.100:5000），零额外延迟但只在同一局域网可达
- srflx 候选（Server Reflexive）：向 STUN 服务器发探测包，STUN 告诉你"外面看到你的 IP:port 是 203.0.113.5:8000"——这是 NAT 分配的外部地址
- relay 候选：由 TURN 服务器分配一个中继地址（如 turn-server.example:9000），所有流量经 TURN 转发，延迟最高但 100% 可达

优先级排序：host > srflx > relay（直连优先，中继兜底）。优先级公式考虑候选类型、本地偏好、组件 ID 三个因子。

**阶段二：候选交换（Exchange）**

双方通过信令通道（SIP / WebSocket / 任何带外通道）把各自候选列表塞进 SDP offer/answer 发给对方。每个候选属性包含：IP、端口、传输协议、类型（host/srflx/relay）、优先级数值、foundation 标识（用于冻结/解冻分组优化）、component-id（RTP=1, RTCP=2）。

**阶段三：连通性检查（Connectivity Checks）**

两端把本地候选和远端候选做笛卡尔积形成"候选对"（如果各有 3 个候选，就有 9 对）。候选对按组合优先级从高到低排入 check list。ICE agent 按顺序发 STUN Binding Request 探测：

1. 发送 Request（携带 ufrag:pwd 认证）
2. 收到 Success Response → 该方向通
3. 对端也完成同样检查 → 双向通 → 该对进入 "succeeded" 状态

第一个双向通过的高优先级候选对被 nominate 为最终路径，后续媒体流走这条路。

两种选举策略：Aggressive Nomination（检查通过立刻 nominate，快但可能选次优）和 Regular Nomination（等多个检查完成后由 controlling agent 主动 nominate 最优的）。RFC 5245 推荐 Regular Nomination。

额外概念——**冻结机制（Frozen）**：为避免同时发出大量 STUN 包造成网络拥塞，ICE 把候选对按 foundation 分组。初始只"解冻"每组第一个对，检查通过后再解冻同组下一个。这样既保证覆盖面又控制了带宽占用。

## 实践案例

### 场景一：WebRTC 视频通话

```
浏览器 A                        信令服务器                      浏览器 B
   |--- 收集候选(host/srflx/relay) ---|                           |
   |--- SDP offer + 候选列表 -------->|--- 转发 offer ----------->|
   |                                   |<-- SDP answer + 候选 ----|
   |<-- 转发 answer ------------------|                           |
   |                                                              |
   |====== STUN Binding 双向探测（多对并行） =====================|
   |                                                              |
   |--- 选出 nominated pair，媒体开始流动 ----------------------->|
```

A 在公司 NAT 后面（srflx 地址 203.0.113.5:5000），B 在家庭路由器后面（srflx 地址 198.51.100.8:6000）。ICE 先尝试 srflx↔srflx 直连（UDP 打洞）；如果公司网是对称 NAT 导致打洞失败，自动回退到 relay 候选（经 TURN 中继），用户只感觉到通话质量稍降，但不会断。

### 场景二：移动端 4G 切 WiFi（ICE Restart）

用户正在 4G 通话，走进办公室切到 WiFi。4G 的 srflx 候选失效。应用触发 ICE restart：重新生成 ufrag/pwd，收集 WiFi 网卡的新候选，通过信令发给对端。对端开始新一轮连通性检查，选出新的 nominated pair。整个过程对用户表现为约 1-2 秒的短暂卡顿后恢复，而不是通话断开。

### 场景三：Trickle ICE 优化首帧延迟

传统 ICE 要等所有候选收集完毕才交换。Trickle ICE 允许边收集边发送——收集到 host 候选就立刻通过信令发出，不等 TURN allocate 完成。对端收到一个候选就加入 check list 开始探测。这样在 relay 候选还在收集时，host 或 srflx 候选可能已经通过检查，首帧延迟可缩短 300-500ms。

## 踩过的坑

1. **只部署 STUN 不部署 TURN，对称 NAT 下无法通话**——原因：对称 NAT 每个目标地址分配不同端口，STUN 探测拿到的端口对另一端无效，必须 TURN 兜底。生产环境必须同时部署 TURN，否则约 10-15% 用户会连接失败。

2. **候选收集超时设置太短导致 relay 候选丢失**——原因：TURN allocate 需要额外往返（至少 2 RTT + 认证），网络差时超过默认 timeout，relay 候选未被加入 SDP，失去兜底能力。建议 timeout 至少设 5 秒。

3. **ICE restart 后旧候选对被复用导致单向音频**——原因：ICE restart 会生成新 ufrag/pwd，但若实现未正确清除旧 check list 状态，一端仍用旧凭证发包，对端 STUN 认证失败后静默丢弃。需确保 restart 时彻底重置所有候选对状态。

4. **Trickle ICE 与非 Trickle 端互操作失败**——原因：Trickle ICE 边收集边发送候选，但对端若要求完整候选列表（等 end-of-candidates 信号）才开始检查，会永远等待。解法：在 SDP 中标明 ice-options:trickle，检测对端不支持则回退 full ICE 模式。

## 适用 vs 不适用场景

**适用**：

- 实时音视频通话（WebRTC、VoIP SIP）——延迟敏感、需要最短路径
- P2P 文件传输——避免所有流量经服务器，节省带宽成本
- 游戏 P2P 联机——减少服务器带宽成本，降低玩家间延迟
- 物联网设备远程控制——设备通常在家庭 NAT 后面，需要穿越才能从外部访问
- 去中心化应用的节点发现——IPFS、BitTorrent 等 P2P 网络的底层连接

**不适用**：

- 客户端-服务器模式（服务器有公网 IP）——无需穿越，直接连
- 纯 HTTP 请求——浏览器→服务器方向天然可达，不存在 NAT 问题
- 同一局域网内通信——host 候选直接可达，不需要 ICE 完整流程
- 对延迟不敏感的大文件分发——CDN 更合适，ICE 的 TURN 中继带宽昂贵且不可扩展

## 历史小故事（可跳过）

2003 年前后，VoIP 因为 NAT 问题苦不堪言——SIP INVITE 里写的是私有 IP，对方根本连不上。各厂商各自发明打洞技巧（STUN 单独用、UPnP、ALG），互不兼容，用户体验像抽奖。有些方案在锥形 NAT 上成功率 90%，换个网络环境就降到 30%，没有人能给出可靠性承诺。

Jonathan Rosenberg 在 IETF 提出 ICE，目标是**一套统一框架把所有 NAT 穿越手段编排起来**，不再赌哪种能通，而是全试一遍选最好的。他同时也是 STUN（RFC 3489）和 TURN 的主要作者，对 NAT 穿越问题有深刻理解。

2007 年发布第一版草案，2010 年正式成为 RFC 5245。2012 年 Google 推动 WebRTC 项目时选定 ICE 为标准穿越机制，使得浏览器无需插件也能 P2P 通话，ICE 从 VoIP 小众协议一跃成为 Web 基础设施。

2018 年 RFC 8445 取代 5245 成为最新版本，核心流程未变，但修正了若干歧义并正式纳入 Trickle ICE。

## 学到什么

1. **系统化胜过碰运气**——ICE 的价值不在发明新打洞技术，而在把 STUN/TURN/host 三种手段用优先级队列统一编排，确保有确定性结果
2. **兜底设计是必须的**——relay 候选虽然延迟高、带宽贵，但保证 100% 可达；没有兜底就没有可靠性承诺。这是工程设计的通用原则
3. **对称性验证**——ICE 要求双向检查（A→B 和 B→A 都通过）才算连通，避免单向通的假象导致单向音频。教训：任何网络连通性判断都要验证双向
4. **信令和媒体分离**——候选交换走信令通道（可靠传输），媒体走选出的直连/中继路径（低延迟传输），两条路径完全独立，是关注点分离的经典实践
5. **渐进式优化**——Trickle ICE 展示了"不等完美再行动"的工程思想：先用已有信息开始工作，后续信息到达时增量更新
6. **角色不对称设计**——ICE 区分 controlling 和 controlled agent，由一方主导 nomination 决策，避免两端同时决策导致冲突

## 延伸阅读

- RFC 8445（ICE 的 2018 更新版，取代 5245）：修正了若干歧义，Trickle ICE 正式纳入
- RFC 8838（Trickle ICE）：边收集边发送候选的正式规范
- RFC 5389 / RFC 8489（STUN 协议）：ICE 用来探测外部地址和做连通性检查的底层协议
- RFC 5766 / RFC 8656（TURN 协议）：ICE 的中继兜底层，理解 Allocate/Permission/Channel 三种模式
- WebRTC 1.0 W3C 规范：浏览器侧如何调用 ICE（RTCPeerConnection.addIceCandidate / onicecandidate）
- P. Osonoi,《WebRTC 实时通信》：从信令到 ICE 到 DTLS-SRTP 全链路讲解
- [[coturn]] —— 最常用的开源 TURN/STUN 服务器，配合本文理解部署实践

## 关联

- [[coturn]] —— 最常用的开源 TURN/STUN 服务器实现，ICE 的运行时基础设施
- [[rtp-rfc-1889]] —— ICE 建立的通道最终承载 RTP 媒体流
- [[quic]] —— QUIC 也面临 NAT 穿越问题，其连接迁移思路与 ICE 互补
- [[tcp]] —— ICE 主要用 UDP 但也支持 TCP 候选，理解两者差异很关键
- [[websocket-rfc-6455]] —— WebSocket 常作为 ICE 信令通道的传输层
- [[cerf-kahn-1974]] —— TCP/IP 奠基论文，NAT 是 IP 地址耗尽的产物，ICE 是对 NAT 的应对
- [[bittorrent-2003]] —— BitTorrent 的 P2P 连接也需要类似 NAT 穿越技术

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
