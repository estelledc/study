---
title: Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器
来源: 'https://github.com/jitsi/jitsi-videobridge'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

Jitsi Videobridge（**JVB**）是一台**只转发不加工**的 WebRTC 视频服务器。日常类比：邮局分拣员——他只看包裹标签上的地址，不会拆开包装、不会重新打包，更不会把几个快递合成一箱。包来了看一眼标签就送出去。

放到视频会议场景：10 个人开会，每个人发 1 路视频上传。JVB 收到这 10 路流，按"谁应该看谁"的规则把每路分别转发给其他 9 个人。**不解码、不混合、不重新编码**——只读 RTP 包头里的几个字节，决定这个包发给谁。

它属于 **SFU（Selective Forwarding Unit）** 这个家族：和 MCU（把所有人画面混成一路再发出去）相反，SFU 只做选择与转发。GitHub 约 4k 星，Apache 2.0，主代码 Java/Kotlin，由 8x8 维护（2018 年从 Atlassian 收购 Jitsi 团队）。

想单独理解 JVB 时，记住一句话就够：**它是会议里的媒体分拣中心，不是混流机，也不是完整产品。**

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么同样开几十路视频，MCU 混流要大机器，而 SFU 一台小机就能扛——因为它**根本不解码**
- 为什么现代会议产品普遍走 SFU 思路（Meet / Teams 等；Zoom 也长期以选择性转发为主）——开源里 JVB 是可读的参考实现
- 为什么浏览器开会不卡，要靠 simulcast / last-N / 选择性转发，而不是中央服务器重编码
- 为什么"只起一个 jvb 容器"永远开不成会——媒体层离开信令层就是死的

## 核心要点

JVB 的设计有四个关键决定：

1. **只读 RTP 包头，不动负载**——看 SSRC / 序列号 / 时间戳就够路由；加密视频负载它看不懂也不想看。类比：分拣员只看面单。
2. **simulcast 是 SFU 的灵魂搭档**——发送端同时上传高/中/低三档，JVB 按接收端下行带宽挑一档，服务端不用解码。
3. **last-N 策略**——只转发"最近 N 个说话的人"的视频，其余用静止头像，带宽和 CPU 一起省。
4. **级联扩展（Octo / secure-octo relay）**——单实例通常在数十到约百路量级见顶；多 JVB 用 relay（现称 secure-octo，走 ICE/DTLS/SRTP）互相转发，做跨地域横向扩展。

完整栈四件套：**Prosody**（XMPP 信令底座）、**Jicofo**（会议焦点）、**JVB**（媒体转发）、**Jitsi Meet**（前端）。传输优先 UDP/ICE，防火墙挡死时才 TCP/443 + TURN；媒体加密用 DTLS-SRTP。

## 实践案例

### 案例 1：用官方 compose 起整栈（别只起 JVB）

```sh
git clone https://github.com/jitsi/docker-jitsi-meet
cd docker-jitsi-meet
cp env.example .env
./gen-passwords.sh
mkdir -p ~/.jitsi-meet-cfg/{web,transcripts,prosody/config,prosody/prosody-plugins-custom,jicofo,jvb}
docker compose up -d
```

**逐部分解释**：

- 必须同时起 web / Prosody / Jicofo / JVB；只 `docker run jvb` 没有信令，进不了会
- `.env` 里配公网域名与端口；防火墙至少放行 `443/tcp` 与 `10000/udp`
- 浏览器打开你的域名后，媒体面才真正打到本机 JVB

### 案例 2：simulcast 让 JVB 替每个人选画质

```
Alice → JVB:  180p / 360p / 720p 三档同时上传
JVB → Bob(网好):720p | Carol(一般):360p | Dave(4G):180p
```

**逐部分解释**：

- Alice 编码时就把三档备好，上行会更胖，但换来服务端零转码
- JVB 只根据 Bob/Carol/Dave 的下行带宽与订阅，挑已有档位转发
- 这就是 SFU 比 MCU 省 CPU 的根因：选择，而不是重编码

### 案例 3：跨地域级联（secure-octo / relay）

```
亚洲 → JVB-SG  --\
欧洲 → JVB-FRA --+-- relay（ICE/DTLS/SRTP）互相转发
美洲 → JVB-VA  --/
```

**逐部分解释**：

- Jicofo 按地域把人分到近端 JVB，避免所有人挤同一桥
- 跨区媒体走 bridge-to-bridge relay，不再要求旧式 VPN 组播 Octo
- 用户延迟主要是"到本地 JVB 一跳"，而不是跨洋直拉每一路

## 踩过的坑

1. **JVB 单跑不通**——缺 Jicofo / Prosody 时媒体层是死的；用官方 compose 一次起四件套
2. **不转码意味着编解码器谈崩就黑屏**——发送端只出 VP9、接收端只认 H.264 时，JVB 帮不上忙
3. **E2EE 与 SFU 冲突**——路由必须读包头；Jitsi 用 insertable streams：包头可见、画面仍端到端加密
4. **UDP 被墙后走 TURN/TCP**——能通但延迟和丢包恢复明显变差，企业网部署常踩

## 适用 vs 不适用

**适用**：

- 中等规模会议（大约 5–100 人）—— SFU 甜区；再大要靠多桥级联与调参
- 自建会议套件——配合 Jitsi Meet 即开即用
- 需要跨地域级联——secure-octo / relay 是开源 SFU 里少见的自带能力
- 浏览器优先的 WebRTC 场景

**不适用**：

- 1 对 1 通话——P2P 更轻，多一层 SFU 只增加跳数
- 十万人级单向直播——HLS / DASH / RTMP 更合适
- 必须服务端混成单文件——配合 Jibri，别指望 JVB 混流
- 必须服务端转码接老 SIP 终端——找 Janus 或加 FreeSWITCH

## 历史小故事（可跳过）

- **2003 年**：Emil Ivov 启动 SIP Communicator 桌面客户端
- **2013 年**：改名 Jitsi，加入 WebRTC，开始做服务端组件
- **2015 年**：Atlassian 收购，集成进 HipChat
- **2018 年**：8x8 收购整支团队，开源主线继续
- **2020 年**：疫情流量暴涨，meet.jit.si 成为常见开源会议入口
- **2021 年后**：Colibri2 + secure-octo（relay）取代旧版 Octo 组网假设

## 学到什么

1. **不做事比做事更聪明**——SFU 省 CPU，靠的是"我不解码"
2. **协议分层**——JVB 管媒体，Jicofo 管焦点，Prosody 管 XMPP，各自扩缩容
3. **simulcast 把自适应画质推到客户端**——服务端只做选择，不做重编码
4. **开源会议不是单体**——四件套齐活，理解 JVB 必须连带整栈

## 延伸阅读

- 官方文档：[Jitsi Handbook](https://jitsi.github.io/handbook/)
- 架构说明：[Jitsi Architecture](https://jitsi.github.io/handbook/docs/architecture)
- 级联 / relay：[Bridge cascading](https://jitsi.org/blog/bridge-cascading-is-back/)
- [[jitsi-meet]] —— 完整会议产品栈，JVB 是其中的媒体层
- [[mediasoup]] —— 同为 SFU，但更偏底层库而非成品会议
- [[aiortc]] —— 用 Python 客户端调试 SFU 收发时很方便

## 关联

- [[jitsi-meet]] —— 成品会议套件；本笔记是它的媒体转发核心
- [[mediasoup]] —— 同属 SFU，控制颗粒度更偏开发者库
- [[livekit]] —— 可自托管 WebRTC 平台，可对比 SFU 产品化路线
- [[coturn]] —— TURN 兜底，JVB 在 UDP 被挡时经常依赖它
- [[janus-gateway]] —— 另一类开源媒体网关，转码 / SIP 场景常拿来对比
- [[kamailio]] —— 信令媒体分离的 SIP 版本
- [[freeswitch]] —— B2BUA / 混流思路，和纯 SFU 互补
- [[aiortc]] —— Python WebRTC 客户端，常用来单测 SFU 收发路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[hls.js]] —— hls.js — 浏览器里的 HLS 播放库
- [[janus-gateway]] —— Janus WebRTC Gateway — 轻量 WebRTC 服务器和插件底座
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[mediasoup]] —— mediasoup — 多人音视频会议的 SFU 路由器
- [[obs-studio]] —— OBS Studio — 直播推流软件事实标准
- [[pion]] —— Pion — Go 实现的 WebRTC 协议栈
