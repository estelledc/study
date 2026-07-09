---
title: LiveKit — 开源实时多媒体 SFU
来源: 'https://github.com/livekit/livekit'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

LiveKit 是一套 **Go 写的 WebRTC 实时音视频平台**：它把多人房间、音视频转发、权限 token、录制 Egress、外部推流 Ingress 做成一组可自托管也可云托管的基础设施。

日常类比：它像一栋已经配好门禁、会议室、监控录像和直播导播台的办公楼。你不是从水泥和电线开始盖楼，而是在这栋楼里分配房间、发门禁卡、决定谁能说话、要不要录下会议。

更技术一点说，LiveKit 的核心是 **SFU（Selective Forwarding Unit）**：每个参与者把音频、视频、数据发到服务器，服务器不把所有画面混成一张，而是按需把不同轨道转发给订阅者。

它的 GitHub README 把定位说得很清楚：开源、可扩展、多用户 WebRTC，服务端用 Go，并基于 Pion WebRTC 实现。约 13.3k stars 说明它不是一个小 demo，而是实时媒体领域里很成体系的开源产品。

## 为什么重要

不理解 LiveKit，下面这些事都没法解释：

- 为什么多人视频会议不能只靠浏览器点对点互连：人数一多，每个人要同时维护太多连接
- 为什么 SaaS 化音视频不只是“推流服务器”：还要有房间生命周期、JWT 权限、SDK、录制、Webhook、运维部署
- 为什么 SFU 常比 MCU 延迟低：它主要转发 RTP 包，不默认解码再重编码每个人的视频
- 为什么录制不是前端点一下保存：Egress 需要独立权限、渲染模板、对象存储、转码和生命周期状态

## 核心要点

LiveKit 可以先记住 **三层心智模型**：

1. **房间是舞台**：Room 把一场实时会话圈起来，Participant 是上台的人，Track 是麦克风、摄像头、屏幕共享这些信号。类比：同一间教室里，学生能听到老师开麦，也能看到同学共享屏幕。

2. **Token 是门禁卡**：每个参与者进房前要拿 JWT，里面写着能不能进哪个房间、能不能发音视频、能不能订阅别人。类比：门禁卡不只开门，还能限制你只能进 3 楼会议室，不能碰设备间。

3. **Egress 是录播员**：房间里的实时轨道可以被录成 MP4、HLS 分片，或转推到 RTMP / SRT。类比：课堂正在上，录播员坐在后排把老师和学生画面按布局录下来，再上传到云盘。

这三层合起来，LiveKit 的价值就不是“会发视频包”，而是把实时媒体做成产品工程能直接接入的后端能力。

## 实践案例

### 案例 1：在线教室，后端创建房间并发门禁卡

真实产品里通常由后端决定房间名和权限，然后前端只拿 token 加入：

```ts
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const host = 'https://my.livekit.host';
const roomService = new RoomServiceClient(host, 'api-key', 'secret-key');

await roomService.createRoom({
  name: 'math-class-101',
  emptyTimeout: 10 * 60,
  maxParticipants: 40,
});

const token = new AccessToken('api-key', 'secret-key', { identity: 'student-a' });
token.addGrant({ roomJoin: true, room: 'math-class-101', canPublish: true });
console.log(await token.toJwt());
```

**逐部分解释**：

- `createRoom` 是后端控制面，负责提前准备房间、限制空房保留时间和人数上限
- `identity` 是参与者在房间里的唯一身份，后续踢人、禁麦、统计都靠它
- `canPublish` 这类 grant 是权限边界，不能把 API secret 放到浏览器里让前端自己签

### 案例 2：浏览器加入房间并发布摄像头和麦克风

前端拿到后端发的 token 后，用客户端 SDK 连接并发布本地媒体：

```ts
import { Room, RoomEvent, Track } from 'livekit-client';

const room = new Room({ adaptiveStream: true, dynacast: true });

room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
    document.body.appendChild(track.attach());
  }
});

await room.connect('wss://my.livekit.host', tokenFromBackend);
await room.localParticipant.setCameraEnabled(true);
await room.localParticipant.setMicrophoneEnabled(true);
```

**逐部分解释**：

- `adaptiveStream` 会让客户端按可见区域和网络状况订阅合适的视频质量
- `dynacast` 会减少没人需要的上行编码层，省 CPU 和带宽
- `TrackSubscribed` 是“别人发来的轨道可用了”，这时把音视频元素挂到页面上

### 案例 3：会议结束后自动录制为 HLS

LiveKit 的 Egress 可以把房间画面录成 HLS 分片并上传到 S3 兼容存储：

```json
{
  "room_name": "math-class-101",
  "layout": "grid",
  "preset": "H264_720P_30",
  "segment_outputs": [{
    "filename_prefix": "classes/math-101",
    "playlist_name": "lesson.m3u8",
    "segment_duration": 2,
    "s3": {
      "bucket": "recordings",
      "region": "us-east-1",
      "access_key": "...",
      "secret": "..."
    }
  }]
}
```

```sh
lk egress start --type room-composite egress.json
lk egress list
lk egress stop --id EG_xxx
```

**逐部分解释**：

- `room-composite` 会像一个隐藏浏览器一样把房间按布局合成，再编码输出
- `segment_outputs` 适合边录边看，播放器读取 `lesson.m3u8` 就能播放 HLS
- 调 Egress API 的 token 必须有 `roomRecord` 权限，否则录制请求会被拒绝

## 踩过的坑

1. **把 LiveKit 当成纯前端库**：前端 SDK 只能入会和收发轨道，房间、token、录制都需要可信后端。

2. **把 API secret 放进浏览器**：secret 一泄露，别人就能给自己签管理员 token，正确做法是后端短期签发。

3. **误以为 SFU 会自动省所有带宽**：SFU 不魔法压缩网络，仍要靠 simulcast、dynacast、选择性订阅控制上行和下行。

4. **录制时忘了 Egress 是独立服务**：自托管如果只起 livekit-server，没有部署 Egress worker，就无法真正合成和上传录像。

## 适用 vs 不适用场景

**适用**：

- 在线会议、课堂、语音房、远程协作，需要多人实时互动
- 产品想保留自托管能力，但又希望有接近 SaaS 的 SDK、CLI、Egress、Ingress 配套
- 需要同时支持 Web、iOS、Android、Flutter、React Native 等多端实时媒体
- 需要录制、直播转推、房间 Webhook、权限控制这些产品级能力

**不适用**：

- 只做传统点播视频站，核心是上传、转码、CDN 分发，不需要实时互动
- 只要单向大规模直播，观众不发言，经典 RTMP / HLS 架构可能更简单
- 团队完全不想维护实时媒体运维，也不想用 LiveKit Cloud，那自托管成本会偏高
- 要深度改 RTP / WebRTC 内核算法，mediasoup 或 Pion 裸库的可控粒度更细

## 历史小故事（可跳过）

- **2021 年**：LiveKit 官方博客发布项目，把它描述成“面向实时通信的开源基础设施”，核心 SFU 基于 Pion。
- **2021 年底**：项目增长到约 2k stars，社区开始贡献屏幕共享、说话人检测、多平台 SDK 等能力。
- **之后几年**：LiveKit 逐步把 Egress、Ingress、SIP、Agents 等能力放进生态，不再只是一个会议服务器。
- **今天**：它更像“实时媒体操作系统”：房间是内核对象，SDK 是客户端驱动，Egress / Ingress 是周边设备。

## 学到什么

1. **实时媒体的产品边界比协议边界更大**：WebRTC 只是传输协议，真正落地还要权限、房间、录制、运维和 SDK。
2. **SFU 的关键是按需转发**：服务器不默认混流，而是把每个参与者的轨道分发给需要的人。
3. **JWT 是实时房间的安全入口**：谁能进、能发什么、能不能录制，都应该由后端签出的 grant 决定。
4. **Egress 把“正在发生”变成“可回看资产”**：课堂、会议、访谈有了录制链路，实时系统才接上内容系统。

## 延伸阅读

- 官方仓库：[LiveKit server](https://github.com/livekit/livekit)
- 官方文档：[LiveKit Docs](https://docs.livekit.io)
- 房间管理：[Room management](https://docs.livekit.io/intro/basics/rooms-participants-tracks/rooms/)
- 客户端 SDK：[LiveKit JS Client SDK](https://docs.livekit.io/reference/client-sdk-js/)
- 录制与转推：[Egress examples](https://docs.livekit.io/reference/other/egress/examples/)
- [[mediasoup]] —— 另一个常见 SFU，更偏底层媒体路由零件

## 关联

- [[mediasoup]] —— 同属 SFU，但 mediasoup 更低层，LiveKit 更产品化
- [[aiortc]] —— Python 端 WebRTC 协议栈，适合写服务端媒体实验和机器人
- [[ovenmediaengine]] —— 更偏低延迟直播分发，LiveKit 更偏多人互动房间
- [[jitsi-videobridge]] —— 老牌会议 SFU，可对比会议产品和开发平台的取舍
- [[freeswitch]] —— 传统 VoIP / SIP 交换机，能帮助理解 LiveKit SIP 生态的位置
- [[gstreamer]] —— 媒体管线工具，常用于理解编码、封装、转码这些 Egress 背后的概念
- [[opus]] —— WebRTC 常用音频编解码器，LiveKit 音频实时性离不开它

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
