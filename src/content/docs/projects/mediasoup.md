---
title: mediasoup — 多人音视频会议的 SFU 路由器
来源: 'https://github.com/versatica/mediasoup'
日期: 2026-05-29
分类: media
难度: 中级
---

## 是什么

mediasoup 是一个 **Selective Forwarding Unit（SFU）**：多人会议里每个人把音视频发到服务器，服务器只负责按需转发给别人。

日常类比：它像会议室里的分发员。每个人把纸条交给分发员，分发员按座位发给需要的人；他不会重写纸条内容，只决定发给谁、发哪一张、发多清晰。

这和“服务器把所有视频重新合成一张大画面”的 MCU 不一样。mediasoup 的 README 明确把目标写成：Node.js / Rust 侧暴露低层 API，C++ worker 处理 ICE、DTLS、RTP、RTCP 等媒体细节。

所以它不是开箱即用的视频会议产品，而是给你做会议、直播、录制、媒体网关时用的底层路由零件。约 7.4k stars 的价值也在这里：Node.js 负责业务编排，C++ 负责高频媒体包。

## 为什么重要

不理解 mediasoup，下面这些事都没法解释：

- 为什么 4 人视频会议不能靠浏览器两两直连硬撑，人数一多连接数会从 N 变成 N²
- 为什么 SFU 比 MCU 延迟低：它转发 RTP 包，不解码再重编码整路视频
- 为什么 mediasoup 文档反复说“信令自己做”：它只管媒体层，不替你定义房间协议
- 为什么一台 32 核机器不能只开一个 worker：一个 Router 属于一个 worker，而 worker 基本吃单核

## 核心要点

mediasoup 可以拆成 **三层心智模型**：

1. **Worker 是发动机**：Node.js 调 `createWorker()`，背后起一个 C++ 子进程。类比：前台服务员接单，后厨真正炒菜。

2. **Router 是房间**：一个 Router 里有 Producer 和 Consumer，大家在这里交换音视频。类比：每个包间有自己的服务员清单，不同包间互不串台。

3. **Transport 是门**：WebRTC Transport 给浏览器用，Plain Transport 给 FFmpeg / GStreamer / RTP 设备用。类比：有人从正门进，有人从货梯进，最终都把东西送到同一个分发台。

这三个概念比 API 名更重要：先想清“谁发、谁收、走哪扇门”，再看具体方法名才不会迷路。

## 实践案例

### 案例 1：官方 mediasoup-demo，验证小班会议

官方 demo 是一个真实可跑的 Node.js SFU 应用，不只是库的玩具片段。server README 里最核心的启动链路是：

```sh
cd mediasoup-demo/server
npm ci
cp config.example.mjs config.mjs
npm run typescript:build
DEBUG="mediasoup-demo-server* mediasoup:WARN* mediasoup:ERROR*" npm start
```

**逐部分解释**：

- `config.mjs` 里配置监听 IP、TLS、WebRTC listenInfo；公网部署时 `announcedAddress` 很关键
- `DEBUG` 同时打开 demo server 和 mediasoup worker 的日志，排 ICE / DTLS 问题时先看它
- 浏览器端用 `roomId`、`forceTcp`、`forceVP8`、`usePipeTransports` 等 query 参数模拟不同网络和编码场景

### 案例 2：FFmpeg 作为主播，把文件推入房间

mediasoup 文档和 demo 的 broadcaster 脚本展示了“外部 RTP 设备接入”的真实用法：先用 HTTP 创建 PlainTransport 和 Producer，再让 FFmpeg 按相同 SSRC / payload type 发 RTP。

```sh
SERVER_URL=https://demo.example.com:4443 \
ROOM_ID=test \
MEDIA_FILE=./party.mp4 \
./ffmpeg.sh
```

脚本内部最后会跑类似这样的命令：

```sh
ffmpeg -re -stream_loop -1 -i "$MEDIA_FILE" \
  -map 0:a:0 -acodec libopus -ar 48000 \
  -map 0:v:0 -c:v libvpx -deadline realtime \
  -f tee "[select=a:f=rtp:ssrc=1111:payload_type=100]rtp://AUDIO_IP:AUDIO_PORT|[select=v:f=rtp:ssrc=2222:payload_type=101]rtp://VIDEO_IP:VIDEO_PORT"
```

**逐部分解释**：

- PlainTransport 让 mediasoup 收普通 RTP，不要求对方是浏览器
- `ssrc` 和 `payload_type` 必须和服务端创建 Producer 时写的一致，否则路由器不知道这包是谁的
- 这类方案适合把录播文件、演播室推流、转码器输出接进 WebRTC 房间

### 案例 3：BigBlueButton，把 mediasoup 放进在线课堂

BigBlueButton 的 `bbb-webrtc-sfu` 是开源在线课堂里的真实 SFU 控制服务。它的 mediasoup 配置文档直接暴露生产问题：NAT、公网 IP、worker 数量和不同媒体类型的独立 worker 池。

```sh
yq w -i /etc/bigbluebutton/bbb-webrtc-sfu/production.yml \
  mediasoup.webrtc.listenIps[0].announcedIp "$SERVER_IPv4"

yq w -i /etc/bigbluebutton/bbb-webrtc-sfu/production.yml \
  mediasoup.workers "cores"

yq w -i /etc/bigbluebutton/bbb-webrtc-sfu/production.yml \
  mediasoup.dedicatedMediaTypeWorkers.audio "auto"
```

**逐部分解释**：

- `announcedIp` 是告诉远端浏览器“你应该连这个公网地址”，不是本机绑定地址
- `workers: cores` 说明媒体路由要按 CPU 核扩展，不能只靠 Node.js 事件循环
- audio / main / content 分池，能避免屏幕共享或摄像头高峰把语音挤掉

## 踩过的坑

1. **把 mediasoup 当完整会议系统**：它不含用户、房间权限、聊天、录制 UI，业务协议都要自己写。

2. **忘记 NAT 的 announcedAddress**：服务器监听 `0.0.0.0` 不等于浏览器能连上，公网地址必须显式告知。

3. **把一个 Router 当无限房间**：Router 所在 worker 基本绑定单核，消费者数量上来后要拆 worker、拆 Router 或跨机器分发。

4. **以为 SFU 会自动转码**：mediasoup 主要转发 RTP 包，不负责把 H264 神奇变成 VP8；编解码匹配要在能力协商里处理。

## 适用 vs 不适用场景

**适用**：
- 4 人以上实时会议、在线课堂、远程协作，需要低延迟多对多音视频
- 一对多低延迟直播，且你愿意自己设计房间、鉴权、扩容和录制链路
- 需要接 FFmpeg、GStreamer、SIP/RTP 网关，把非浏览器媒体送进 WebRTC 世界
- 已经有 Node.js 后端，想把媒体层当一个可控库嵌进去

**不适用**：
- 只想两个人视频聊天 → 先用 P2P WebRTC，复杂度更低
- 只想 10 秒延迟的传统直播 → HLS / DASH / RTMP 服务更省心
- 需要服务端统一美颜、转码、混成一张大画面 → 找 MCU 或转码流水线
- 团队没有人愿意维护信令、ICE、带宽估计、worker 调度 → 直接选托管 RTC 服务

## 历史小故事（可跳过）

- WebRTC 早期，浏览器终于能直接采集摄像头和麦克风，但多人会议还缺一个可靠的服务器侧转发层。
- mediasoup 作者来自 VoIP / SIP 背景，参与过 WebSocket 承载 SIP 的 RFC 7118；这解释了它为什么特别重视协议边界。
- v2 时代文档把它描述成 C++ SFU + Node.js 模块，已经不是“完整服务器”，而是可嵌入组件。
- v3 进一步把心智模型稳定成 Worker、Router、Transport、Producer、Consumer，并提供 mediasoup-client / libmediasoupclient。
- 后来 BigBlueButton 等项目把它放进真实教育和会议场景，证明“低层库 + 上层业务系统”的组合能跑生产。

## 学到什么

1. **SFU 的核心不是“视频会议 UI”，而是 RTP 包路由**：谁发给谁、发哪一层、丢包时怎么补，才是 mediasoup 的主战场。
2. **低层 API 是自由也是责任**：它不绑 WebSocket 协议，所以能接各种业务；也意味着你必须自己维护状态机。
3. **扩容单位是 worker / router / host**：媒体系统的瓶颈往往是单核、带宽和关键帧请求，不只是 Node.js QPS。
4. **Node.js + C++ 的分工很清楚**：业务控制在 JS，实时媒体包在 C++，这是它能兼顾可编排和性能的原因。

## 延伸阅读

- 官方 README：[versatica/mediasoup](https://github.com/versatica/mediasoup)（先看设计目标，不要从 API 表开始）
- 设计文档：[mediasoup v3 Design](https://mediasoup.org/documentation/v3/mediasoup/design/)（Node.js 层和 C++ worker 的边界）
- 扩容文档：[Scalability](https://mediasoup.org/documentation/v3/scalability/)（Router、worker、pipeToRouter 的取舍）
- 通信指南：[Communication Between Client and Server](https://mediasoup.org/documentation/v3/communication-between-client-and-server/)（信令为什么必须自己做）
- 官方 demo：[mediasoup-demo](https://github.com/versatica/mediasoup-demo)（看真实房间、broadcaster、query 参数）
- [[bigbluebutton]] —— 在线课堂系统里如何把 SFU 放进完整产品

## 关联

- [[jitsi-videobridge]] —— 同样是 SFU，但 Jitsi 更像成品会议栈里的媒体核心
- [[bigbluebutton]] —— 真实课堂产品，展示 mediasoup 如何服务视频和屏幕共享
- [[coturn]] —— TURN 解决“连不上媒体服务器”的兜底路径，常和 SFU 搭配
- [[aiortc]] —— Python 侧理解 WebRTC 协议很好，但大规模 SFU 不适合用它硬扛
- [[freeswitch]] —— 更偏电话交换和音频混音，和 mediasoup 的 RTP 转发定位互补
- [[opus]] —— WebRTC 音频常用编码，mediasoup 转发但不替你理解编码质量
- [[dash.js]] —— 延迟容忍的播放链路；和 mediasoup 的实时低延迟目标形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/asterisk]] —— Asterisk — 把企业总机变成一台 Linux 服务器
- [[projects/coturn]] —— coturn — 帮 WebRTC 穿越 NAT 的开源 TURN/STUN 中转服务器
- [[hls.js]] —— hls.js — 浏览器里的 HLS 播放库
- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议的自托管套件
- [[jitsi-videobridge]] —— Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[livekit-flutter]] —— LiveKit Flutter SDK — 一份 Dart 代码连通六个平台的实时音视频
- [[pion]] —— Pion — Go 实现的 WebRTC 协议栈
- [[scrcpy]] —— scrcpy — Android 屏幕镜像 / 录制
- [[streamlink]] —— Streamlink — 把直播页变成可播的流
