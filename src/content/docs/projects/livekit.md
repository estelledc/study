---
title: LiveKit — 开源实时多媒体 SFU
description: Go 写的开源 WebRTC SFU，房间、录制与 Egress 一体
来源: 'https://github.com/livekit/livekit'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**LiveKit** Go 写的开源 WebRTC SFU，房间、录制与 Egress 一体。

日常类比：像视频会议的后台调度员：谁说话就把谁的视频流转发给别人。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学现代 SFU 房间模型
- SaaS 化实时音视频架构
- 对照 [[janus-gateway]] 插件式
- 与 [[pion]] Go 栈配套读

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

LiveKit 完全用 **Go** 实现，底层 WebRTC 栈基于 **Pion**，整体设计面向云原生水平扩展：

### 核心组件

- **SFU 引擎（livekit-server）**：基于 Pion WebRTC；每个参与者（Participant）维护一个 PeerConnection；房间（Room）是逻辑隔离单元；支持 Simulcast（多分辨率）和 **Dynacast**（按订阅者带宽自动暂停/恢复高分辨率层）。
- **Redis 集群协调**：多节点 LiveKit 通过 Redis Pub/Sub 协调房间状态、信令路由；单节点可不依赖 Redis 运行。
- **信令协议**：使用 **Protocol Buffers** over WebSocket（`livekit.proto`）；比 JSON 信令更紧凑、更易版本管理。
- **Egress 服务**：独立服务，负责录制和推流；底层启动无头 Chrome 实例（Room Composite）或直接处理 RTP（Track Composite）；输出 MP4/HLS/RTMP。
- **Ingress 服务**：接收 RTMP/WHIP 推流并转为 LiveKit 房间中的 Track，实现「推流入会议」场景。

### Simulcast 与 Dynacast

- **Simulcast**：发布者同时发送多个分辨率（如 1080p/540p/180p）的 RTP 流；订阅者可独立选择分辨率层。
- **Dynacast**：LiveKit 独有特性；当没有订阅者消费高分辨率层时，自动通知发布者暂停该层发送，节省上行带宽。

### SDK 生态

| SDK | 语言 | 场景 |
|-----|------|------|
| `livekit-client` | TypeScript/JS | Web 浏览器 |
| `@livekit/components-react` | React | UI 组件库 |
| `livekit-client-sdk-swift` | Swift | iOS/macOS |
| `livekit-android` | Kotlin | Android |
| `livekit-server-sdk-python` | Python | 服务端 Token 生成 |
| `livekit-server-sdk-go` | Go | 服务端管理 API |

```
浏览器/App（livekit-client SDK）
      │ WebSocket + WebRTC
      ▼
livekit-server（Go + Pion）
  ├── Room Manager
  ├── Simulcast/Dynacast 层选择
  └── 转发 RTP 包
      │ Redis Pub/Sub
      ▼
其他 livekit-server 节点（水平扩展）
      │
livekit-egress → MP4 录制 / RTMP 推流
livekit-ingress ← RTMP / WHIP 推流
```

## 性能与规格

| 指标 | 参考值 |
|------|--------|
| 单节点并发参与者（8 核 16G） | ~1000 路（纯转发）|
| 单节点房间数 | 数千个（轻量房间）|
| 端到端延迟 | < 200 ms（公网），< 50 ms（局域网）|
| Simulcast 层数 | 最多 3 层 |
| Egress 录制格式 | MP4、OGG、HLS、RTMP |

LiveKit Cloud 定价模型：按并发参与者分钟计费（约 $0.006/参与者分钟，Egress 额外计费）；自托管免费，仅付服务器成本。

## 代码示例

### TypeScript SDK：加入房间并发布摄像头

```typescript
import { Room, RoomEvent, Track } from "livekit-client";

const room = new Room({
  adaptiveStream: true,     // 根据网络自适应码率
  dynacast: true,           // 启用 Dynacast
});

// 监听远端参与者加入
room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  if (track.kind === Track.Kind.Video) {
    const videoEl = document.createElement("video");
    track.attach(videoEl);
    document.body.appendChild(videoEl);
  }
});

// 连接到房间
await room.connect("wss://your-livekit-host", "your-access-token");

// 发布本地摄像头和麦克风
await room.localParticipant.enableCameraAndMicrophone();
```

### Python 服务端：生成 Access Token

```python
from livekit import api
import os

livekit_api = api.LiveKitAPI(
    url=os.environ["LIVEKIT_URL"],
    api_key=os.environ["LIVEKIT_API_KEY"],
    api_secret=os.environ["LIVEKIT_API_SECRET"],
)

# 生成参与者 Token（有效期 1 小时）
token = api.AccessToken(
    api_key=os.environ["LIVEKIT_API_KEY"],
    api_secret=os.environ["LIVEKIT_API_SECRET"],
).with_identity("user-123") \
 .with_name("Alice") \
 .with_grants(api.VideoGrants(room_join=True, room="my-room")) \
 .to_jwt()

print(f"Token: {token}")
```

### Docker 单节点快速启动

```bash
docker run -d --name livekit \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -v $(pwd)/livekit.yaml:/livekit.yaml \
  livekit/livekit-server:latest \
  --config /livekit.yaml --dev
```

```yaml
# livekit.yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: true
keys:
  devkey: devsecret
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd livekit
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[pion]] 的实现差异：Pion 是纯 WebRTC 协议库，LiveKit 在 Pion 上构建了完整的房间模型、SDK 和管理 API；[[janus-gateway]] 用 C 实现更轻量，但 API 较老旧；[[mediasoup]] 用 Node.js + C++ 实现，JavaScript 生态更熟悉。

### 案例 4：AI 集成场景

LiveKit Agents 框架支持将 LLM/TTS/STT 接入实时通话：参与者发言→STT 转文字→LLM 生成回复→TTS 合成语音→作为 AI 参与者的 AudioTrack 发布回房间；延迟全链路 < 1 s。

### 案例 5：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **外网 IP 未配置**：`use_external_ip: true` 时自动获取外网 IP；若部署在多 NIC 或 NAT 后，需手动指定 `node_ip`，否则 ICE candidate 无效。
3. **Token 过期**：Access Token 默认有效期较短，前端需在过期前刷新或重新生成，否则断线重连失败。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **Egress 需要单独部署**：`livekit-egress` 是独立进程，需要连接到 Redis 和 livekit-server；容易遗漏配置导致录制请求无响应。
6. **Simulcast SDP 协商失败**：部分移动端浏览器（旧版 Safari）不支持 Unified Plan SDP，Simulcast 协商可能失败；LiveKit SDK 有兼容处理但需测试。
7. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读

**不适用**：
- 闭源 SaaS 一键替代（若需合规审计）
- 超大规模不经优化的默认配置
- 不看文档直接改内核 fork

## 历史小故事（可跳过）

- 项目源于社区/公司开源贡献，Stars 随场景周期性上涨。
- 近年多与云原生、GPU、WebRTC 生态交叉。
- 文档与 issue 常比论文更新快，读 release note 很重要。
- 与 study 站邻居项目常构成「编码-传输-播放」全链。

## 学到什么

- 先跑通再读码，效率高于反过来。
- 开源多媒体/系统栈多为「薄壳 + 厚库」。
- 配置即架构，改一个 flag 可能换一条数据路径。
- 关联笔记要优先链到 `written.txt` 已有 slug。

## 延伸阅读

- 官方仓库：https://github.com/livekit/livekit
- [[pion]]
- [[janus-gateway]]
- [[mediasoup]]
- [[jitsi-meet]]
- [[obs-studio]]

## 关联

- [[pion]] —— 同专题对照阅读
- [[janus-gateway]] —— 同专题对照阅读
- [[mediasoup]] —— 同专题对照阅读
- [[jitsi-meet]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[gcc-webrtc-2016]] —— Analysis and Design of the Google Congestion Control for Web Real-time Communication (WebRTC)
- [[ice-rfc-5245]] —— Interactive Connectivity Establishment (ICE): A Protocol for Network Address Translator (NAT) Traversal
- [[janus-gateway]] —— Janus WebRTC Gateway
- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈

