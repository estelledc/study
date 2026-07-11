---
title: Janus WebRTC Gateway — 轻量 WebRTC 服务器和插件底座
来源: 'https://github.com/meetecho/janus-gateway'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

Janus WebRTC Gateway 是一个用 C 写的通用 WebRTC 服务器：它负责把浏览器的音视频连接接起来，具体业务交给插件处理。

日常类比：它像一个小型交通枢纽。Janus 本身只修路、查票、分流，至于这条路是通向会议室、直播间、电话网关，还是录制室，由不同插件决定。

最小例子不是“写一个视频会议”，而是先让客户端创建一个 Janus 会话，再把会话挂到某个插件上：

```bash
curl -s http://127.0.0.1:8088/janus \
  -H 'Content-Type: application/json' \
  -d '{"janus":"create","transaction":"t1"}'
```

这条请求只是在 Janus core 开一张“临时工作单”。真正的媒体能力，通常会继续 attach 到 `janus.plugin.videoroom`、`janus.plugin.streaming`、`janus.plugin.recordplay` 或 `janus.plugin.sip`。

所以 Janus 的关键不是“自带一个完整产品”，而是“给实时音视频业务提供一个轻、可插拔、可部署到边缘机器上的底座”。

## 为什么重要

不理解 Janus，下面这些事会很难解释：

- 浏览器之间点对点 WebRTC 可以跑，但一到多人会议、录制、转推、SIP 互通就会迅速变复杂
- 如果没有 SFU，六个人会议可能变成每个人给五个人各发一路视频，上行带宽立刻爆炸
- 如果没有插件边界，会议、直播、录制、电话互通会挤在一坨业务代码里，后续维护很痛
- 如果只用云端重型媒体服务器，小盒子、内网边缘节点、实验室设备这类轻量场景会显得过度配置

## 核心要点

Janus 可以拆成三层看：

1. **Core 只管 WebRTC 基础设施**：类比物业只负责门禁、电梯和消防，不负责每家公司卖什么。Janus core 处理 ICE、DTLS、SRTP、RTP/RTCP、JSON 信令和 transport，业务语义交给插件。

2. **Plugin 决定业务形态**：类比同一栋楼里可以开会议室、录音棚和前台。VideoRoom 是 SFU 会议，Streaming 是把外部 RTP/RTSP/文件流变成 WebRTC，Record&Play 是录制和回放，SIP 插件则把浏览器接到传统电话系统。

3. **轻量优先，功能按需打开**：类比工具箱里只拿今天要用的扳手。Janus 用 C 实现，依赖和插件很多是可选项；你需要 WebSocket、Data Channel、MQTT、SIP、录制时再打开对应库。

## 实践案例

### 案例 1：用 VideoRoom 做多人会议 SFU

真实来源：官方 VideoRoom 文档把它定义为基于发布/订阅模式的会议插件，每个发布者的音视频 feed 可以被其他人订阅。

```json
{
  "request": "create",
  "room": 1234,
  "description": "Daily standup",
  "publishers": 6,
  "bitrate": 512000,
  "record": false
}
```

逐部分解释：

- `request: create`：让 VideoRoom 插件动态创建一个房间，而不是只靠配置文件预先写死
- `publishers: 6`：限制同时发言、发视频的人数；观看者订阅 feed，不等于都是发布者
- `bitrate`：给发布者一个默认码率上限，避免一个人把房间带宽吃光
- `record`：房间级录制开关；真要强制录制，还要配合 secret 和 `lock_record`

真正发布视频时，客户端还要发送 `join`、创建 SDP offer，再用 `publish` 请求完成协商。Janus 不替你写 UI，也不替你维护用户表，它只负责把媒体路由好。

### 案例 2：用 Streaming 把外部 RTP 流转成 WebRTC

真实来源：官方 Streaming 示例里有 `rtp-sample`，它监听本机端口，等待 GStreamer、FFmpeg 等工具把 RTP 包送进来。

```ini
rtp-sample: {
  type = "rtp"
  id = 1
  description = "Opus/VP8 live stream"
  audio = true
  video = true
  audioport = 5002
  audiopt = 111
  audiocodec = "opus"
  videoport = 5004
  videopt = 100
  videocodec = "vp8"
}
```

逐部分解释：

- `type = "rtp"`：这不是浏览器主动推流，而是外部程序把编码好的 RTP 包喂给 Janus
- `audioport` / `videoport`：Janus 在这些 UDP 端口上收包，再转给 WebRTC 观看者
- `audiopt` / `videopt`：payload type 要和外部发送器保持一致，否则浏览器不知道包里是什么编码
- `codec`：这里选 Opus 和 VP8，是因为它们是 WebRTC 世界里最常见的安全选择

这个案例常用于“摄像头、机器人、媒体管线已经有了，只想让浏览器能看”的场景。Janus 在中间像翻译站，把 RTP 世界和 WebRTC 世界接起来。

### 案例 3：用 Record&Play 留下一段 WebRTC 录制

真实来源：官方 Record&Play 文档说明 `record` 请求要带 JSEP offer，插件会返回 answer，并把媒体存成 Janus 自己的录制格式。

```json
{
  "request": "record",
  "name": "interview-clip",
  "is_private": true,
  "filename": "/var/lib/janus/records/interview-clip",
  "audiocodec": "opus",
  "videocodec": "vp8"
}
```

逐部分解释：

- `name`：给录制一个人能看懂的名字，后面列表或回放时更容易识别
- `is_private`：控制它是否出现在普通 `list` 返回里，适合内部录制
- `filename`：只是基础路径，Janus 会按音频、视频、数据轨生成对应文件
- `audiocodec` / `videocodec`：表达录制时希望协商的编码；最终还要看浏览器和插件协商结果

Record&Play 适合“录一段 WebRTC 消息再播放”的小闭环。如果你要做长期会议归档，通常还要加权限、索引、后处理和存储生命周期。

## 踩过的坑

1. **把 Janus 当成完整视频会议产品**：Janus core 只提供连接和插件接口，用户系统、房间列表、权限、前端状态都要应用自己做。

2. **以为发布和订阅能共用一个 PeerConnection**：VideoRoom 文档明确把 publisher 和 subscriber 分开设计，这是为了避免频繁重协商把连接状态搅乱。

3. **Streaming 新观众一进来黑屏**：RTP 转发默认只转最新包，新观众如果没赶上关键帧，就要等下一帧才能解码。

4. **复制非官方 Windows 可执行文件**：README 强调官方主要面向 Linux，Windows 场景更可靠的路径是 WSL 或自己清楚地维护构建链。

## 适用 vs 不适用场景

**适用**：

- 需要自己掌控信令、业务状态、权限模型的 WebRTC 产品
- 多人音视频会议、在线课堂、直播连麦这类 SFU 场景
- 把摄像头、GStreamer、FFmpeg、RTSP 源转成浏览器可看的 WebRTC
- 需要在边缘机器、内网节点、小型服务器上跑轻量媒体服务

**不适用**：

- 想要开箱即用的完整会议 SaaS，不想写前端和业务服务
- 强依赖服务端转码、复杂混流、美颜、云端录制流水线的重媒体平台
- 团队完全不想碰 ICE、SDP、NAT、端口、防火墙这些 WebRTC 基础问题
- 只做一对一低风险通话，而且浏览器点对点已经能满足需求

## 历史小故事（可跳过）

- **2014 年左右**：Janus 作为通用 WebRTC server 出现，核心思路是“底座小、插件可换”。
- **早期版本**：README 和文档长期强调 Linux 是主阵地，Mac 可以编译，Windows 不是主要支持目标。
- **多插件演进**：VideoRoom、Streaming、SIP、AudioBridge、Record&Play 等插件把它从单一网关扩展成实时媒体工具箱。
- **multistream 分支**：当前主线文档强调 multistream 版本，订阅可以批量或分开处理，但发布和订阅仍是不同连接。
- **社区状态**：GitHub 上已有数千 stars，官方文档、Discourse、demo 页面和 issue 共同构成学习入口。

## 学到什么

1. **WebRTC 服务器不是一个东西，而是一组职责切分**：连接、信令、媒体转发、业务状态要分清。
2. **插件架构的价值是让复杂性有房间住**：会议插件不必知道 SIP 注册细节，录制插件也不必混进直播逻辑。
3. **轻量不是功能少，而是默认不替你做过多决定**：Janus 给接口和管道，产品形态由应用层补齐。
4. **音视频工程的坑常在边界处**：关键帧、payload type、NAT、证书、端口、浏览器策略，比业务按钮更容易卡人。

## 延伸阅读

- 官方 README：[meetecho/janus-gateway](https://github.com/meetecho/janus-gateway)
- 官方文档首页：[Janus general purpose WebRTC server](https://janus.conf.meetecho.com/docs/)
- 插件文档：[VideoRoom plugin](https://janus.conf.meetecho.com/docs/videoroom)
- 插件文档：[Streaming plugin](https://janus.conf.meetecho.com/docs/streaming)
- 部署说明：[Deploying Janus](https://janus.conf.meetecho.com/docs/deploy)
- [[jitsi-videobridge]] —— 同样是 WebRTC SFU，但更偏会议系统生态

## 关联

- [[webrtc]] —— Janus 处理的核心协议族，理解 ICE/DTLS/SRTP 才能排查连接问题
- [[jitsi-videobridge]] —— 另一个常见 SFU，对比能看出“通用插件底座”和“会议专用后端”的差别
- [[gstreamer]] —— Streaming 插件常把 GStreamer 产生的 RTP 流转给浏览器
- [[ffmpeg]] —— 常作为外部编码和推流工具，和 Janus Streaming 搭配使用
- [[freeswitch]] —— SIP 插件常见互通对象，负责传统电话侧的媒体和信令生态
- [[coturn]] —— WebRTC 穿透失败时常见的 TURN 服务器伙伴

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[projects/asterisk]] —— Asterisk — 把企业总机变成一台 Linux 服务器
- [[jitsi-videobridge]] —— Jitsi Videobridge — 只读 RTP 包头的 WebRTC 视频转发器
