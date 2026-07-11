---
title: OpenVidu — 把 Kurento 包成开箱即用的视频会议 PaaS
来源: 'https://github.com/OpenVidu/openvidu'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

OpenVidu 是一套**开源的 WebRTC 视频会议平台**，把底层 Kurento Media Server（KMS）+ 应用层 SDK + 房间管理 REST 打包成"装上就能用"的服务。日常类比：自己用积木搭 WebRTC 大概像从面粉开始烤披萨——和面、发酵、调酱、烤箱温度全要操心；OpenVidu 像一家半成品店，把底坯、酱料、奶酪都按比例调好，你只管放进自己烤箱。

最小用法长这样（前端 JS）：

```js
import { OpenVidu } from 'openvidu-browser'

const ov = new OpenVidu()
const session = ov.initSession()
session.on('streamCreated', (event) => {
  session.subscribe(event.stream, 'video-container')
})
await session.connect(token)                // token 由后端调 REST 拿
const publisher = await ov.initPublisherAsync('camera', { videoSource: undefined })
await session.publish(publisher)
```

后端只做一件事：调 OpenVidu Server 的 REST `POST /sessions` 拿到 sessionId，再 `POST /sessions/{id}/connection` 拿到 token 发给前端。媒体协商、ICE 穿透、转发、录制都被 OpenVidu Server + KMS 默默接管。

## 为什么重要

不理解 OpenVidu，下面这些事都没法解释：

- 为什么"自建一个 Zoom 替代品"听起来吓人，社区里几十人小团队却真能做出来
- 为什么 Kurento 这种底层媒体服务器需要 OpenVidu 这一层"封装"才好用——直接对 KMS 写代码工作量是十倍
- 为什么同样定位的 LiveKit / Jitsi Meet / Mediasoup 都活着，市场没有合并到一家——拓扑、语言栈、商业模式各占一段
- 为什么"远程医疗 / 在线教育"在西班牙、拉美的政府项目里大量出现 OpenVidu——它的开源协议和数据自托管特性正好契合监管要求

## 核心要点

OpenVidu 的架构可以拆成 **三层**：

1. **客户端 SDK 层**：`openvidu-browser`（JS）/ `openvidu-android` / `openvidu-ios` / `openvidu-react-native`。SDK 把 W3C 的 RTCPeerConnection 包成 Session / Publisher / Subscriber 三个面向对象的抽象，事件订阅风格类似 socket.io。

2. **OpenVidu Server**：Java + Spring Boot 写的控制面。负责房间生命周期、token 鉴权、参与者状态、录制调度、信令路由。它自己**不处理媒体字节**，只下命令给 KMS。

3. **Kurento Media Server (KMS)**：C++ 写的真正媒体平面，基于 GStreamer。负责 ICE/DTLS/SRTP、SFU 转发、混流（MCU）、转码、录制成 MP4。OpenVidu Server 通过 JSON-RPC 控制它。

三层加起来形成一个常见的 PaaS 范式：**SDK（开发者面）→ 控制面（房间/凭证）→ 数据面（媒体字节）**。三者各跑各的进程，可以独立伸缩。

## 实践案例

### 案例 1：录一节直播课并合成成 MP4

教育场景里"老师 + 4 个学生"的视频要同时录下来供回放。OpenVidu 提供两种录制：

- **COMPOSED**：服务器端开 headless Chrome 渲染所有人的画面成一路 MP4，用户拿到一份就能放
- **INDIVIDUAL**：每个 Stream 单独存一个文件，事后自己拼

```bash
# 启动一段 COMPOSED 录制
curl -u OPENVIDUAPP:secret -X POST \
  https://my-openvidu/openvidu/api/recordings/start \
  -d '{"session":"class-101","outputMode":"COMPOSED","hasAudio":true,"hasVideo":true}'
```

教育平台用这个特性最爽——**不用自己写 ffmpeg 拼流的逻辑**。

### 案例 2：把 OpenVidu 嵌进自己的客服系统

客服场景需要"用户在网页点一下→直接和坐席通话"。后端两步 REST（默认 basic auth `OPENVIDUAPP:secret`）：

```bash
# 1) 创建会话，拿到 sessionId
curl -u OPENVIDUAPP:secret -X POST https://my-openvidu/openvidu/api/sessions \
  -H 'Content-Type: application/json' -d '{"customSessionId":"support-42"}'

# 2) 为用户/坐席各发一个 connection token
curl -u OPENVIDUAPP:secret -X POST \
  https://my-openvidu/openvidu/api/sessions/support-42/connection \
  -H 'Content-Type: application/json' \
  -d '{"role":"PUBLISHER","data":"{\"name\":\"user\"}"}'
```

前端用返回的 `token` 调 `session.connect(token)`；通话结束再 `DELETE /openvidu/api/sessions/support-42`。业务方只写鉴权与路由，媒体层是黑盒。

### 案例 3：和 LiveKit / Jitsi 做对照阅读

三个项目同样定位"开源会议 PaaS"，但选型不一样：

- **OpenVidu**：Java 控制面 + C++ 媒体面（KMS）→ 适合企业 Java 栈、需要稳定老技术的政府/医疗项目
- **LiveKit**：Go 控制面 + Go 媒体面（基于 Pion）→ 适合云原生 / Kubernetes 团队，单语言栈轻
- **Jitsi Meet**：Java 控制面 + jitsi-videobridge（Java）→ 历史最久，Meet 产品免费且能直接用

对照阅读三个项目的 Session / Room / Track 抽象，能看清"会议 PaaS"这个领域的**通用建模**长什么样。

### 案例 4：用 Connection Property 做权限分级

同一房间里"老师"和"学生"权限不同——老师能踢人、能强制静音，学生不能。OpenVidu 用 Connection 创建时的 role 字段实现：

```json
{
  "role": "PUBLISHER",
  "data": "{\"name\":\"Alice\",\"role\":\"teacher\"}",
  "kurentoOptions": { "videoMaxRecvBandwidth": 2000 }
}
```

`role` 取 `SUBSCRIBER` / `PUBLISHER` / `MODERATOR`。Moderator 在前端可以调用 `forceDisconnect` / `forceUnpublish`，普通 Publisher 不行。这种"权限随 token 颁发"的模型让客户端**没法越权**——后端不发 token，前端怎么改也连不上。

## 踩过的坑

1. **KMS 的 Docker 镜像版本要和 OpenVidu Server 严格对齐**：跨大版本（KMS 6 → 7）混用会出现 "media element not found" 之类的 JSON-RPC 错。官方都打成同一组 Docker Compose，别自己拆。

2. **录制 COMPOSED 模式很重**：每条会话录制要起一个 headless Chrome 进程，CPU 和内存吃得猛。10 个并发会议 + COMPOSED 录制，单机 8 核 16G 就吃满。生产环境要把录制节点单独拉出来。

3. **NAT 穿透在企业内网经常失败**：没配 TURN Server 的话，跨子网用户基本连不上。OpenVidu 镜像内置 coturn，但默认证书是自签的——浏览器在某些版本会拒绝。

4. **Pro 版功能不可见的边界**：多节点、SIP 接入、增强录制布局都在 Pro。社区版文档偶尔写"OpenVidu 支持 X"实际是 Pro 才有，读文档时注意 badge。

## 适用 vs 不适用场景

**适用**：

- Java / Spring 团队想快速搭会议、直播课、远程问诊
- 需要数据自托管、不能上云的政府/医疗项目
- 团队不想自己维护媒体协议栈，只想写业务逻辑
- 录制功能开箱即用是核心需求

**不适用**：

- 团队是 Node / Go 主栈，又对 Java 生态没兴趣 → 选 LiveKit / Mediasoup 更顺
- 需要超大房间（万人级直播）→ OpenVidu 走会议拓扑，不是 CDN，应改用 SRS / 阿里云直播
- 想深度定制媒体处理（自定义编解码、AI 推理） → 直接用 Mediasoup / Pion，控制面薄
- 移动端要极致包大小 → openvidu-android / ios SDK 拖来一整套 libwebrtc，体积不小

## 历史小故事（可跳过）

- **2013 年**：西班牙 Universidad Rey Juan Carlos 启动 Kurento 项目，目标是"用 GStreamer 做模块化媒体服务器"。
- **2015 年**：同一团队意识到 Kurento 太底层，开发者不愿意直接对它写代码，开始做上层封装 OpenVidu。
- **2016 年**：Kurento 被 Twilio 收购，团队被打散。OpenVidu 团队留下来继续维护这两个项目。
- **2019 年**：OpenVidu 推出 Pro 版（多节点 + 高级录制），形成开源 + 商业的双轨。
- **2023 年起**：随着 LiveKit 兴起，OpenVidu 的相对份额被稀释，但在西语国家政府项目里仍是首选。

## 学到什么

1. **底层媒体服务器 + 上层 PaaS 封装是一种稳定的两层结构**——Kurento + OpenVidu / Pion + LiveKit / Mediasoup + 自己写控制面，三种组合本质都是这个。
2. **控制面和数据面分离**是规模化的前提——OpenVidu Server 不碰媒体字节，就能轻松横向扩展。
3. **PaaS 卖的是"省下的工程"**——直接写 Kurento 也能做到同样的事，但需要熟悉 GStreamer 生态、JSON-RPC、ICE/DTLS 全套，估算 10 倍工时。
4. **同领域多个开源项目并存的原因往往是技术栈和市场细分**——不是"赢者通吃"，而是 Java 团队、Go 团队、政府客户、初创团队各取所需。

## 延伸阅读

- 官方文档：[docs.openvidu.io](https://docs.openvidu.io/en/stable/)（教程 + REST API + SDK 三块）
- 官方参考会议室：[openvidu-call](https://github.com/OpenVidu/openvidu-call)（Angular + Node.js 后端，能直接当成会议产品部署）
- Kurento 文档：[doc-kurento](https://doc-kurento.readthedocs.io/)（理解底层媒体服务器在做什么）
- [[aiortc]] —— Python 端用 aiortc 当 OpenVidu 客户端，做服务端机器人接入
- [[webrtc-rs]] —— Rust 实现的同类底层栈，对照看媒体服务器的另一种选型路径

## 关联

- [[aiortc]] —— Python 服务端接入 WebRTC 的常见库，和 OpenVidu 一起搭混合架构
- [[webrtc-rs]] —— Rust 实现的 WebRTC 协议栈，可对照媒体服务器的另一条路线
- [[mumble]] —— 同样做实时语音的开源方案，但只管语音不管视频，对照看"全功能 PaaS"和"单点工具"的差别

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[dash.js]] —— dash.js — Web DASH 播放器官方参考实现
- [[libvpx]] —— libvpx — VP8/VP9 编解码器
- [[obs-studio]] —— OBS Studio — 直播推流软件事实标准
- [[video.js]] —— Video.js — Web 视频播放器框架
