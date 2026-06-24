---
title: OvenMediaEngine — 亚秒级直播流媒体服务器
来源: https://github.com/AirenSoft/OvenMediaEngine
日期: 2026-05-30
分类: 基础设施 / 流媒体
难度: 中级
---

## 是什么

OvenMediaEngine（**OME**）是韩国公司 AirenSoft 在 2018 年开源的一台**直播流媒体服务器**，用 C++ 写的。它要解决一件事：**主播推一路流上来，观众那边的延迟低到 1 秒以内**。

日常类比：

- 经典直播（HLS）像**电视台延时播出**——主播说一句话，10-30 秒后观众才听到。卡顿少但慢。
- OME 像**演唱会现场调音台**——主播一开口几乎实时传到每个观众耳朵里，因为它走的是浏览器原生的 WebRTC 通道。

最小用法：主播用 OBS 推一路 RTMP 到 OME，观众打开网页用 OvenPlayer（OME 自带的 JS 播放器）连上来，全程 < 1 秒延迟。

```
OBS ──RTMP──▶ OvenMediaEngine ──WebRTC──▶ 浏览器
                  │
                  └──LL-HLS──▶ iOS Safari
```

## 为什么重要

不理解 OME 这一类的"低延迟流媒体服务器"，下面这些事都没法解释：

- 为什么**直播带货**主播能和观众"实时"互动——经典 HLS 10 秒延迟根本对不上口型，必须 WebRTC
- 为什么**云游戏**（GeForce Now / Stadia）能玩——延迟超过 100ms 操作就废了，全靠 WebRTC 这套
- 为什么**在线监控**摄像头能在网页直接看——传统方案要装插件，WebRTC 让浏览器原生收
- 为什么 nginx-rtmp 还能活但越来越边缘——它只会经典 HLS / RTMP，做不到亚秒级

## 核心要点

OME 的几个关键机制：

1. **一推多拉 fan-out**：主播推一路上来，OME 内部拷贝并转码出多种规格（1080p / 720p / 480p），再用多种协议（WebRTC / LL-HLS / HLS / DASH）分发给不同观众。一份算力服务所有人。
2. **协议杂食**：进来支持 RTMP（OBS 默认）/ SRT（专业广电）/ WebRTC 推流 / MPEG-TS。出去支持 WebRTC（亚秒）/ LL-HLS（2-5 秒）/ HLS（10-30 秒）/ DASH。
3. **内置 FFmpeg 转码**：可以把进来的 H.264 + AAC 转成 H.264 + Opus（因为浏览器 WebRTC 不接 AAC），或者把 1080p 转成多档码率给不同网络。
4. **Server.xml 配置驱动**：所有行为写在一个 XML 配置文件里——VirtualHost（虚拟主机）→ Application（应用）→ Stream（流）三层结构。
5. **REST API 控制面**：可以远程创建 / 删除 / 查询流、触发录制、转推到第三方平台（B 站 / 抖音）、抓缩略图。

## 实践案例

### 案例 1：最小直播链路

主播在 OBS 里把推流地址填成 `rtmp://your-server/app/stream`，观众在网页打开：

```javascript
const player = OvenPlayer.create('player', {
  sources: [{
    type: 'webrtc',
    file: 'wss://your-server:3334/app/stream'
  }]
});
```

主播说 "你好"，观众**几百毫秒后**听到。这就跑起来了。

### 案例 2：转码出多档码率

Server.xml 里配一个转码 profile：

```xml
<OutputProfile>
  <Name>720p</Name>
  <Encodes>
    <Video>
      <Codec>h264</Codec>
      <Bitrate>2000000</Bitrate>
      <Width>1280</Width>
      <Height>720</Height>
    </Video>
    <Audio>
      <Codec>opus</Codec>
      <Bitrate>128000</Bitrate>
    </Audio>
  </Encodes>
</OutputProfile>
```

主播推 1080p 上来，OME 自动转码成 720p + Opus。手机用户拉 720p 省流量，电脑用户拉原清晰度。

### 案例 3：转推到第三方平台

直播带货同时推到 B 站 + 抖音 + 自家 H5——一次推流多端分发。OME 用 REST API 触发：

```bash
curl -X POST http://ome:8081/v1/vhosts/default/apps/app/streams/stream:startPush \
  -H "Authorization: Basic xxx" \
  -d '{"id":"to-bilibili","protocol":"rtmp","url":"rtmp://live-push.bilivideo.com/...","streamKey":"xxx"}'
```

## 踩过的坑

1. **WebRTC 公网必须 STUN/TURN**：内网测试都通，一上公网观众连不上——因为 NAT 穿透失败。必须配 ICE 候选、跑 TURN 服务器作为兜底。
2. **LL-HLS 必须 HTTPS**：Apple 强制要求，HTTP 在 iOS Safari 直接不播。自签证书也不行（CA 不被信任），必须真证书。
3. **AAC 进 WebRTC 出**：Chrome 收 WebRTC 不接 AAC 音频，必须在 OME 里转成 Opus。第一次配的人 100% 踩——画面有声音没。
4. **AGPL-3.0 协议**：商业产品如果通过网络提供 OME 服务，**整个产品源码都要开**。商用前先让法务看一眼，必要时找 AirenSoft 买商业授权。

## 适用 vs 不适用场景

**适用**：

- 直播带货 / 在线教育 / 互动直播——对延迟敏感（< 1 秒）
- 云游戏 / 远程操控——延迟越低越好
- 自建直播平台 / 监控视频聚合——不想付 Wowza 商业费用
- 一推多拉场景——一路源转码后多协议分发

**不适用**：

- 多人会议（5 人以上互推互拉）→ 用 Janus / Mediasoup / LiveKit，它们是 SFU 设计
- 录播点播站——OME 偏直播，点播用普通 HLS / 对象存储 + CDN 即可
- 闭源商业产品集成 → AGPL 传染风险，要么买商业授权要么换 SRS（Apache 2.0）

## 历史小故事（可跳过）

- **2010 前后**：Adobe RTMP + Flash 主导直播，但 Flash 要插件、iOS 不支持
- **2014**：Apple 推 HLS（HTTP 切片），延迟 10-30 秒成行业默认，"直播 = 慢" 被钉死
- **2018**：AirenSoft 开源 OME，把 WebRTC（原本设计给视频会议）改造来做"一推多拉"直播
- **2020**：Apple 推 LL-HLS（低延迟 HLS），把 HLS 延迟从 10s 压到 2-5s。OME 第一时间支持
- **2023+**：直播带货催熟亚秒级直播市场，OME / SRS / Wowza / Red5 在这条赛道竞争

## 学到什么

1. **协议决定延迟**——WebRTC < 1s，LL-HLS 2-5s，HLS 10-30s，没有银弹，按场景选
2. **一推多拉是核心架构**——主播推一路，服务器 fan-out 给所有观众，转码 + 多协议分发是标配
3. **NAT 穿透是 WebRTC 的隐藏 boss**——内网测试再顺，公网部署都要重新调一次 STUN/TURN
4. **协议许可证比技术更要命**——AGPL 的传染性能让一个商业产品翻车，技术选型时先看 LICENSE

## 延伸阅读

- 官网：[ovenmediaengine.com](https://www.ovenmediaengine.com/)（含完整文档和 demo）
- 文档：[airensoft.gitbook.io/ovenmediaengine](https://airensoft.gitbook.io/ovenmediaengine)
- 同类对比：[SRS](https://github.com/ossrs/srs)（Apache 2.0，C++ 偏 RTMP/HLS）/ [Janus](https://github.com/meetecho/janus-gateway)（C，会议 SFU）
- 协议背景：[[webrtc-protocol]] —— WebRTC 整套协议栈
- 上游基石：[[ffmpeg]] —— OME 的转码引擎

## 关联

- [[nginx]] —— 反向代理常摆 OME 前面做 SSL 终止 / 静态文件
- [[ffmpeg]] —— OME 内嵌的转码核心，所有 codec 都靠它
- [[webrtc-protocol]] —— OME 亚秒级延迟的协议底座
- [[envoy]] —— 数据面代理；OME 是流媒体专用版，思路相似但目标不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigbluebutton]] —— BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
- [[envoy]] —— Envoy — 把网络通信从业务代码里抠出来的代理进程
- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[openmeetings]] —— Apache OpenMeetings — 单 Java 进程跑完整 Web 会议系统

