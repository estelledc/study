---
title: mediasoup — WebRTC 选择性转发 SFU
来源: 'https://github.com/versatica/mediasoup'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 高级
---

## 是什么

**mediasoup** 是开源 **SFU（Selective Forwarding Unit）**：在服务端用 C++ worker 转发 WebRTC 音视频流，浏览器之间不直连 mesh，减轻上行带宽压力。

日常类比：三人视频若人人互传，像**每人给另外两人各寄一份快递**（mesh）。SFU 像**区域集散中心**——每人只寄一份到中心，中心再分发给其他人（star）。

特点：**信令无关**（自己用 WebSocket 交换 SDP）、**只处理媒体层**、Node.js 或 Rust API 操控 worker。

在线 demo：[v3demo.mediasoup.org](https://v3demo.mediasoup.org) 可先看多方通话再读 API。

## 为什么重要

不理解 mediasoup，现代视频会议架构会模糊：

- **Zoom/Meet 类系统核心是 SFU/MCU**：mediasoup 是最流行的开源 SFU 之一
- **与 [[pion]] 对照**：后者是完整 WebRTC 栈库，mediasoup 专注服务端转发
- **Simulcast / SVC**：多路分辨率上行，SFU 按订阅者带宽选层
- **低层 API**：不绑死任何前端框架，适合自定义会议产品

## 核心要点

1. **Router / Transport / Producer / Consumer**：房间、ICE 通道、上行轨、下行轨四层对象模型。

2. **Plain RTP 与 WebRTC 互通**：可接 [[ffmpeg]]、GStreamer 等非浏览器源。

3. **Worker 子进程 C++**：媒体密集逻辑在 worker，Node 侧只做控制，崩溃隔离。

4. **带宽估计与层选择**：内置 BWE，按丢包与 RTT 调整转发层。

5. **DataChannel 支持**：屏幕共享外的数据消息也可走 SCTP。

6. **Rust 绑定可选**：除 Node 外可用 Rust crate 控 worker，适合全 Rust 后端团队。

## 实践案例

### 案例 1：官方 v3demo 本地跑

克隆 [mediasoup-demo](https://github.com/versatica/mediasoup-demo)，按 README 起 server + 浏览器，观察 Producer/Consumer 生命周期。

### 案例 2：创建 Router 与 WebRtcTransport

```javascript
const router = await worker.createRouter({ mediaCodecs });
const transport = await router.createWebRtcTransport({ listenIps: [{ ip: '0.0.0.0' }] });
// 客户端 ICE/DTLS 与 transport 对接后 produce/consume
```

信令层需自写：交换 `dtlsParameters`、`iceCandidates`。

### 案例 3：与 [[pion]] 互通

一端 Pion 发 Plain RTP 到 mediasoup `PlainTransport`，浏览器 Consumer 播放——混合栈会议常见。

### 案例 4：录制旁路

Consumer 到 [[ffmpeg]] 或 GStreamer 写文件，SFU 不录只转，录制是旁路消费者。

### 案例 5：Simulcast 三档上行

浏览器 `encodings` 设 180p/360p/720p 三档，SFU 给弱网用户只订 180p Consumer，带宽省在服务端决策。

信令服务器只需转发 SDP/ICE，不必解析媒体负载，职责边界清晰。

Consumer `preferredLayers` 可在弱网时只订小层，节省下行带宽。

## 踩过的坑

1. **NAT 与 TURN**：生产必须配 TURN，否则对称 NAT 用户进不了房间。

2. **信令全自理**：无内置房间服务，demo 仅参考，业务要自己设计状态机。

3. **worker 崩溃恢复**：需监控重启并清理僵尸 transport。

4. **Simulcast 协商**：浏览器 encode 参数与 router codec 要一致，否则层无效。

5. **Windows 开发体验**：生产部署仍推荐 Linux，与 worker 调优文档一致。

6. **版本 v3 API 与旧教程**：网上文章可能仍写 v2，对照官方 migration。

7. **端口与防火墙**：UDP 端口范围要在安全组放行，否则 ICE 连不上。

8. **单 worker 容量**：大房间要水平扩展多 worker，需自建路由与负载策略。

## 适用 vs 不适用场景

**适用**：
- 自研多人视频会议 / 互动直播
- 需要 SFU 级控制与 simulcast
- 混合 WebRTC + RTP 专业设备

**不适用**：
- 纯 HLS 广播（[[nginx-rtmp-module]] + CDN）
- 快速搭聊天 App 且不需定制媒体层（用现成 SaaS）
- 只要客户端 WebRTC（[[pion]] 单机对等）

## 历史小故事（可跳过）

- **Versatica 团队**：Iñaki Baz Castillo 等从早期 VoIP 经验演化
- **v3 大改**：Router 模型与 TypeScript API 现代化
- **demo 在线**：v3demo.mediasoup.org 长期可玩
- **与 [[webrtc-rs]]、[[pion]] 构成 Go/Rust/Node SFU 学习三角**

## 学到什么

1. **会议扩展性靠 SFU 而非 mesh**
2. **信令与媒体分离**：mediasoup 刻意不管信令
3. **Producer/Consumer 是订阅模型核心**
4. **TURN 是生产必选项不是优化**
5. **与 [[pion]] 分工**：一个偏服务端转发引擎，一个偏协议栈实现
6. **Demo 源码先读 server 再读 client**：信令时序最清晰
7. **水平扩展要自研房间路由**：官方只给单 worker 抽象
8. **codec 列表要和浏览器 offer 对齐**：router `mediaCodecs` 缺 H264 baseline 会导致 iOS 黑屏
9. **PlainTransport 适合接 [[ffmpeg]]**：先 RTP 通再开 WebRTC，分层排障

## 延伸阅读

- [mediasoup 文档](https://mediasoup.org/documentation/)
- [v3demo 源码](https://github.com/versatica/mediasoup-demo)
- [[pion]] —— Go WebRTC 栈
- [[webrtc-rs]] —— Rust WebRTC 栈
- [WebRTC for the Curious](https://webrtcforthecurious.com/)

## 关联

- [[pion]] —— Go 协议栈对照
- [[webrtc-rs]] —— Rust 协议栈
- [[obs-studio]] —— 推流制作端不同路线
- [[nginx-rtmp-module]] —— RTMP 广播链
- [[ffmpeg]] —— 录制与转码旁路
- [[hls.js]] —— 单向广播播放
- [[shaka-player]] —— 点播播放无关 SFU
- [[hls.js]] —— 单向广播对照
- [[streamlink]] —— 拉流与会议无关但同属媒体栈
- [[sox]] —— 音频预处理另一工具
- [[aubio]] —— 音频事件检测
- [[flac]] —— 离线音频格式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aubio]] —— aubio — 实时音频事件检测库
- [[dash.js]] —— dash.js — 浏览器 MPEG-DASH 参考播放器
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[flac]] —— FLAC — 无损音频压缩格式与参考实现
- [[janus-gateway]] —— Janus WebRTC Gateway
- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[opus]] —— Opus — 低延迟全频带音频编解码
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[shaka-player]] —— Shaka Player — Google 自适应流媒体播放器
- [[sox]] —— SoX — 命令行音频处理瑞士军刀
- [[streamlink]] —— Streamlink — 把网页直播流接到本地播放器
- [[video.js]] —— Video.js — Web 视频播放器框架
- [[webrtc-rs]] —— webrtc-rs — Rust 纯实现 WebRTC 协议栈，对标 Go 世界的 Pion

