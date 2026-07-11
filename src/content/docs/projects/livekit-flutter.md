---
title: LiveKit Flutter SDK — 一份 Dart 代码连通六个平台的实时音视频
来源: 'https://github.com/livekit/client-sdk-flutter'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

LiveKit Flutter SDK 是 **LiveKit 官方的 Flutter 客户端**——你用 Dart 写一份 UI 和逻辑，编译出来的 App 能在 Android、iOS、Web、macOS、Windows、Linux 这六个平台上跑实时音视频通话。

日常类比：浏览器原生有 WebRTC API（`getUserMedia` / `RTCPeerConnection` 那一套），但只在浏览器里能用。Flutter App 不是浏览器，没有这套 API。LiveKit Flutter SDK 把 WebRTC 装进 Flutter 进程，再加一层服务器（SFU），让多人会议、屏幕共享、端到端加密一股脑儿可用。

GitHub 0.5k 星，Apache 2.0 协议，最新版 v2.7.0（2026 年 3 月）。代码语言比例：Dart 76%、C++ 7%、JavaScript 6%——C++ 是底层 WebRTC 库的桥接，JS 是 Web 平台的 polyfill。

## 为什么重要

不理解 LiveKit Flutter SDK，下面这些事都没法解释：

- 为什么 Flutter 做实时音视频常绕不开开源 SFU SDK 或闭源 SaaS（声网、ZEGO）
- 为什么 WebRTC 五层协议（ICE/DTLS/SRTP/SCTP/RTP）能收成 Dart 里的 `Room` / `Participant` / `Track`
- 为什么 LiveKit 要覆盖手机端，几乎必须有 Flutter（或再写 Swift + Kotlin 两套原生）
- 为什么 AI 语音助理 / 多模态对话在 Flutter App 里，常把实时音视频接到 LiveKit 这类房间模型上

## 核心要点

### 三个一等公民对象

1. **Room**：一次会议/直播的容器。`Room.connect(url, token)` 进会，`Room.disconnect()` 离会
2. **Participant**：房间里的人。本地的叫 `LocalParticipant`，别人叫 `RemoteParticipant`
3. **Track**：音视频流的最小单位。一个 Participant 可以发布多个 Track（前置摄像头一个、麦克风一个、屏幕共享再一个）

WebRTC 原生 API 里 Track 是包在 `MediaStream` 里的二等公民，LiveKit 把它提到一等——**单独发布、单独订阅、单独静音**。

### SFU：从 N×N 到 N×1

WebRTC 原生是端到端 mesh，三人会议每人要发两路、收两路，十人就得发九路、收九路，上行带宽爆炸。

LiveKit 在中间放一台 **SFU**（Selective Forwarding Unit，选择性转发服务器）：

- 每个客户端只往 SFU 发一路（自己的）
- SFU 按订阅关系把流转发出去
- 服务器**只转发不解码**——保留端到端加密的可能性

这是 LiveKit 和 P2P-only 的 WebRTC 库（比如 PeerJS）最大的架构区别。

### Simulcast + Adaptive Stream

发布端同时推三档分辨率（180p / 360p / 720p），SFU 按订阅者当前显示尺寸**动态选档**：

- 你把对方视频缩到角落 → SFU 发 180p
- 你点全屏 → SFU 切 720p

这两个机制（Simulcast 推三档、Adaptive Stream 自动选档）让一个 SFU 同时服务百人会议时带宽不会被撑爆。

### Track 状态机

Track 不是发布了就完事，要走一整套生命周期：

`created` → `published`（告诉 SFU 我有这个 Track）→ `subscribed`（其他人订阅）→ `muted` / `unmuted` → `unpublished`

每个状态变化都通过 `EventsListener` 推回 UI 层。

## 实践案例

### 案例 1：连入房间发布摄像头

```dart
final room = Room();
await room.connect(
  'wss://my-livekit.example.com',
  token, // 服务端签发的 JWT
);

// 发布摄像头和麦克风
await room.localParticipant?.setCameraEnabled(true);
await room.localParticipant?.setMicrophoneEnabled(true);
```

**逐部分解释**：

- `Room()` 创建会议容器（还没连）
- `connect(url, token)` 建立 WebSocket 信令通道 + WebRTC PeerConnection
- token 是服务端用 API Key 签的 JWT，包含房间名、用户身份、权限
- `setCameraEnabled(true)` 自动申请权限、开摄像头、创建 Track、发布到 SFU——一行顶 WebRTC 原生十几行

### 案例 2：监听别人加入并渲染视频

```dart
final listener = room.createListener();
listener.on<TrackSubscribedEvent>((event) {
  if (event.track is VideoTrack) {
    showVideoWidget(VideoTrackRenderer(event.track as VideoTrack));
  }
});
```

**逐部分解释**：

- `createListener()` + `on<TrackSubscribedEvent>` 比 `addListener` 轮询 `remoteParticipants` 更省：有人发布轨道才刷新 UI
- `TrackSubscribedEvent` 表示"别人的轨道已订阅成功，可以渲染"
- `VideoTrackRenderer` 把 Track 画到 Flutter `Texture`：移动端走 Metal/Vulkan，Web 走 `<video>`

### 案例 3：屏幕共享（六平台一致）

```dart
await room.localParticipant?.setScreenShareEnabled(true);
```

**逐部分解释**：

- 业务层只看到一个布尔开关；底下 iOS 走 ReplayKit、Android 走 MediaProjection、桌面走窗口捕获
- 发布成功后，远端会收到一条屏幕共享 Track，和摄像头 Track 一样可单独订阅/静音
- Android 10+ 还要先起前台服务，否则这一行会直接抛异常（见踩坑）

## 踩过的坑

1. **iOS 后台音频要配 Capability**：不在 Xcode 里勾 Background Modes → Audio 的话，App 切到后台几秒钟音频就被系统掐断。SDK 不会替你处理 Info.plist
2. **Android 屏幕共享要前台服务**：Android 10+ 不允许后台启动屏幕捕获，必须先起一个带通知的前台服务，否则 `setScreenShareEnabled` 直接抛异常
3. **Web 端 autoplay 策略**：Chrome / Safari 不允许"未用户交互就播声音"，第一次进房间的 audio Track 必须等用户点一下页面才能 unmute——SDK 文档里叫 `startAudio()` 模式
4. **token 过期不会自动续**：JWT 默认 6 小时过期，长会议要客户端自己监听 `RoomEvent.Reconnecting` 时换 token，否则掉线后再连不上
5. **Adaptive Stream 在弱网会乱跳档**：网络抖动时分辨率反复切，画面看着像呼吸——v2 引入了滞后阈值缓解，但仍偶发

## 适用 vs 不适用场景

**适用**：

- 跨平台实时音视频 App（视频会议、直播间、语音房）
- AI 多模态对话（用户说话 → LLM 服务器 → 实时回放）
- 需要自托管 RTC 基建（不愿把音视频流交给闭源 SaaS）
- 需要端到端加密的通话场景（医疗、金融、跨国合规）

**不适用**：

- 纯 P2P 一对一通话（直接用 WebRTC 原生 API 更轻，省一台 SFU 服务器）
- 极低延迟游戏语音（< 50ms）→ 专用 UDP 协议（如 Mumble）更优
- 仅 Web 端 → 直接用 LiveKit JS SDK，不用 Flutter
- 后端服务器之间转流 → 用 LiveKit Server SDK（Go/Node），不用客户端 SDK

## 历史小故事（可跳过）

- **2021 年**：LiveKit 开源，定位开源实时媒体基础设施；创始人 Russ d’Sa 有 Twitter Spaces 早期工程背景
- **2022 年**：Flutter SDK 首发，补上 Flutter 生态里"有 WebRTC 插件、缺官方 SFU 集成"的缺口
- **2023 年起**：LiveKit Agents 提供 OpenAI Realtime 等插件，Flutter 客户端常被用来做移动端语音助理 Demo
- **2026 年**：v2.7.0 把 E2EE 相关开关收到 `RoomOptions` 顶层，API 更扁平

## 学到什么

1. **协议复杂度的封装是真价值**——WebRTC 五层收成三个对象，是这个 SDK 存在的理由
2. **跨平台一致性靠分层**——Dart 业务层共享，平台桥接层各自对接原生 WebRTC
3. **SFU 是开源多人 RTC 的常见胜负手**——纯 P2P 难扩到多人，闭源 SaaS 又锁私有部署
4. **AI 实时对话抬高了客户端 SDK 的需求**——星数不高，但和 Agents / Realtime 集成绑在一起时工程价值更大

## 延伸阅读

- 官方文档：[LiveKit Flutter Docs](https://docs.livekit.io/realtime/quickstarts/flutter/)
- WebRTC 参考：[High Performance Browser Networking — Ch.18](https://hpbn.co/webrtc/)
- SFU 设计：[Mediasoup design](https://mediasoup.org/documentation/v3/mediasoup/design/)（原理与 LiveKit 同类）
- [[aiortc]] —— Python 服务端 RTC，与本项目互补
- [[webrtc-rs]] —— Rust WebRTC 协议栈
- [[livekit]] —— LiveKit 服务端 / SFU 本体

## 关联

- [[livekit]] —— 服务端 SFU 与房间模型，本 SDK 的对端
- [[aiortc]] —— 同样基于 WebRTC，Python 在服务端，本项目在客户端
- [[webrtc-rs]] —— Rust 实现的 WebRTC 协议栈，可作自建 SFU 底层
- [[flutter]] —— 跨平台 UI 框架，本 SDK 的运行环境
- [[mediasoup]] —— 另一常见 SFU，可对比底层零件 vs 产品化 SDK

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[flutter]] —— Flutter — Google 的 Dart 跨平台 UI 框架
