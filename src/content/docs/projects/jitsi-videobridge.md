---
title: "Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器"
来源: 'https://github.com/jitsi/jitsi-videobridge'
日期: 2026-05-31
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Jitsi Videobridge（**JVB**）是一台**只转发不加工**的 WebRTC 视频服务器。日常类比：邮局分拣员——他只看包裹标签上的地址，不会拆开包装、不会重新打包，更不会把几个快递合成一箱。包来了看一眼标签就送出去。

放到视频会议场景：10 个人开会，每个人发 1 路视频上传。JVB 收到这 10 路流，按"谁应该看谁"的规则把每路分别转发给其他 9 个人。**不解码、不混合、不重新编码**——只读 RTP 包头里的几个字节，决定这个包发给谁。

它属于 **SFU（Selective Forwarding Unit）** 这个家族。GitHub 4k 星，Apache 2.0，主代码 Java/Kotlin，由 8x8 公司维护（2018 年从 Atlassian 手里收购了 Jitsi 团队）。

## 为什么重要

- **CPU 成本低到反直觉**——同样开 50 路视频会议，传统 MCU（混流方案）要一台 32 核服务器；SFU 一台 4 核就够，因为它**根本不解码**
- **WebRTC 视频会议的事实标准架构**——Google Meet / Microsoft Teams / Zoom 后端都是 SFU 思路，开源世界 JVB 是参考实现之一
- **理解"为什么浏览器开会议不卡"的钥匙**——simulcast / SVC / 选择性转发这些技术，JVB 把它们做齐了
- 如果你想看清"现代视频会议不靠中央服务器混流，靠什么撑住"，JVB 是看得最透的样本

## 核心要点

JVB 的设计有四个关键决定：

1. **只读 RTP 包头，不动负载**——一个 RTP 包头有 SSRC（哪条流）、序列号、时间戳。JVB 看这几个字节就够决定路由。负载部分是加密的视频数据，**它根本看不懂也不想看**
2. **simulcast 是 SFU 的灵魂搭档**——发送端同时编三档画质（高/中/低）一起上传。JVB 按每个接收端的下行带宽，给他选合适的那档。这件事服务端不用解码就能做
3. **last-N 策略**——10 个人开会，没必要每个人都收 9 路视频。JVB 只转发"最近 N 个说话的人"的视频，剩下的人头像静止。带宽和 CPU 一起省
4. **Octo 协议级联**——单实例撑 100 路就到顶。多个 JVB 之间用 Octo 协议互相转发媒体，跨地域大会议靠这个横向扩展

JVB 不能单独工作。完整栈四件套：

- **Prosody** —— XMPP 服务器，做信令传输底座
- **Jicofo** —— 信令焦点，决定"谁该和谁通话、用哪个 JVB"
- **JVB** —— 只管媒体转发
- **Jitsi Meet** —— 浏览器前端

传输层：UDP/ICE 优先，TCP/443 fallback 给被防火墙挡的客户端。媒体加密用 DTLS-SRTP。

## 实践案例

### 案例 1：一路视频在 JVB 里走的路径

```
Alice 浏览器                                    Bob/Carol/Dave 浏览器
     |                                                  ^
     | RTP (VP8 视频负载，加密)                          |
     v                                                  |
  +------------------------------------------------+
  |               Jitsi Videobridge                |
  |  1. 收到 RTP 包，读 SSRC                       |
  |  2. 查路由表：这条流 Bob/Carol/Dave 都订了      |
  |  3. 改写包头里的 SSRC（避免 ID 冲突）           |
  |  4. 转给 Bob 的 PeerConnection                 |
  |  5. 转给 Carol 的 PeerConnection                |
  |  6. 转给 Dave 的 PeerConnection                 |
  +------------------------------------------------+
```

负载（加密的视频字节）从头到尾**没被打开过**。JVB 干的是"高级 NAT"的活——按规则改包头然后转发。

### 案例 2：simulcast 让 JVB 替每个人选画质

Alice 发送端开 simulcast，同时编三档：

```
Alice → JVB:  低档 180p / 中档 360p / 高档 720p（三路同时上传）
```

接收端三个人，下行带宽不同：

```
JVB → Bob   (网好):  转发 720p
JVB → Carol (一般):  转发 360p
JVB → Dave  (4G):   转发 180p
```

整个过程 JVB **没有做任何转码**——画质转换的工作 Alice 编码时就做完了，JVB 只在"已经存在的三档里挑一档"。这就是 SFU 比 MCU 省 CPU 的根本原因。

### 案例 3：Octo 跨地域级联

一场 200 人的全球会议，单实例 JVB 撑不住。Jicofo 调度算法把人按地域分到不同 JVB：

```
亚洲用户 → JVB-Singapore  ----+
                              | Octo 协议
欧洲用户 → JVB-Frankfurt  ----+----- 互相转发媒体
                              |
美洲用户 → JVB-Virginia  -----+
```

每个用户连离自己最近的 JVB，跨地域的媒体在 JVB 之间走 Octo。用户感受到的延迟只是"自己到本地 JVB 的一跳"，不是"从亚洲拉到欧洲"。

## 踩过的坑

1. **JVB 单跑不通**——新人 docker pull 一个 jvb 镜像启动完发现连不上。原因：缺 Jicofo 和 Prosody。**JVB 是媒体层，没有信令层就是死的**。官方 docker-compose 一次起四件套
2. **不转码意味着编解码器协商失败就完蛋**——iPhone Safari 只支持 H.264，老 Android 只支持 VP8。如果发送端只编了 VP9，接收端不支持，JVB 帮不上忙——它不会替你转码
3. **E2EE 和 SFU 是天然冲突**——JVB 必须读 RTP 包头才能路由。Jitsi 的折中方案叫 insertable streams：包头明文，负载用客户端密钥额外加一层。JVB 看得见路由信息但看不见画面
4. **BWE 公平性是个调参噩梦**——10 个人接收，谁掉包谁就被 JVB 降档。但谁该先降、降多少，算法每改一次都有人抱怨
5. **UDP 被防火墙挡时性能跳水**——fallback 到 TCP/443 走 TURN 中继，延迟和丢包恢复都变差。企业网部署经常踩这个

## 适用 vs 不适用

**适用**：

- 中等规模视频会议（5-100 人）—— SFU 架构甜区
- 自建 Zoom 替代品的开源选型——Jitsi Meet 即开即用
- 需要级联跨地域的大会议——Octo 是少数开源 SFU 自带这个能力的
- 浏览器优先的场景——WebRTC 原生支持

**不适用**：

- 1 对 1 通话——P2P 直连即可，JVB 是浪费
- 10 万人级直播——那是 RTMP/HLS 的活，SFU 不擅长
- 必须服务端混流的场景（合规录制单文件）——JVB 不混流，需配合 Jibri 录制
- 必须服务端转码（兼容老旧 SIP 终端）——找 Janus 或加一层 FreeSWITCH

## 历史小故事（可跳过）

- **2003 年**：法国 Strasbourg 大学 Emil Ivov 启动 SIP Communicator 桌面客户端
- **2013 年**：改名 Jitsi，加入 WebRTC 支持，开始做服务端组件
- **2015 年**：Atlassian 收购，集成进 HipChat
- **2018 年**：8x8 从 Atlassian 收购整支团队，开源主线继续
- **2020 年**：COVID 期间用户暴涨，meet.jit.si 成为 Zoom 开源替代代表
- **现在**：约 600 名贡献者，每年若干主版本

## 学到什么

1. **不做事比做事更聪明**——SFU 比 MCU 性能高一个数量级，靠的是"我不解码"
2. **协议分层让职责清晰**——JVB 只管媒体，Jicofo 管信令，Prosody 管 XMPP 传输。每层独立扩缩容
3. **simulcast 把"自适应画质"的负担推到客户端**——这是个聪明的偷懒，省了服务端的 CPU
4. **开源会议系统不是单体**——四件套组合才能跑，理解 JVB 必须连带理解整个栈

## 延伸阅读

- 官方文档：[Jitsi Handbook](https://jitsi.github.io/handbook/)
- SFU vs MCU 对比：[Jitsi Architecture](https://jitsi.github.io/handbook/docs/architecture)
- Octo 协议设计：[Jitsi Octo Whitepaper](https://jitsi.org/blog/jitsi-meet-cascaded-bridges-poc/)
- [[kamailio]] —— 同样做信令媒体分离，但走 SIP 路线
- [[aiortc]] —— Python 实现的 WebRTC 客户端栈

## 关联

- [[kamailio]] —— 信令媒体分离思想的 SIP 版本，JVB 是 WebRTC 版本
- [[freeswitch]] —— 老牌媒体引擎，B2BUA 思路，和 SFU 互补
- [[aiortc]] —— 调试 SFU 时常用的 Python WebRTC 客户端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kamailio]] —— Kamailio — 把电信级 SIP 流量塞进一台 Linux 服务器

