---
title: Jitsi Meet — 开源视频会议
description: 开源视频会议：Jitsi Videobridge SFU + Web 客户端
来源: 'https://github.com/jitsi/jitsi-meet'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Jitsi Meet** 开源视频会议：Jitsi Videobridge SFU + Web 客户端。

日常类比：像可自建的 Zoom：浏览器入会，后台 SFU 转发多人视频。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学完整会议栈开源实现
- WebRTC 与 XMPP 集成
- 对照 [[livekit]] 新架构
- 企业内网会议部署

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

Jitsi Meet 由多个独立服务组成，各司其职：

### 核心组件

- **Prosody（XMPP 服务器）**：信令层，负责房间管理、参与者列表、聊天消息；使用 XMPP 协议（BOSH/WebSocket）；Jicofo 和客户端均通过 Prosody 交换信令。
- **Jicofo（Jitsi Conference Focus）**：会议焦点组件，Java 实现；负责 SDP offer/answer 协调、媒体桥选择、参与者踢出/静音等会议控制逻辑；每个会议一个 Jicofo 实例。
- **Jitsi Videobridge（JVB）**：SFU（Selective Forwarding Unit），Java 实现；不混流，只转发 RTP 包；支持 Simulcast（多分辨率流）和 **Last-N**（只转发最近 N 个发言者的视频流，节省带宽）；支持多节点水平扩展。
- **Jitsi Meet（前端）**：React 应用；基于 `lib-jitsi-meet` WebRTC SDK；内置聊天、屏幕共享、虚拟背景（MediaPipe）、举手、字幕等功能。
- **Jibri**（可选）：浏览器实例录制/推流组件；启动 Chrome 无头浏览器入会并录制为 MP4 或推流至 RTMP。

### 自适应码率策略

JVB 实现 **BWE（Bandwidth Estimation）+ Simulcast + Last-N**：
- 发送端发布 3 层 Simulcast（720p/360p/180p）
- JVB 根据接收端带宽估算自动切层（`BitrateController`）
- Last-N 机制确保大房间下主讲人视频不被丢弃

```
浏览器 A（发布者）
  │ WebRTC（SRTP + SCTP）
  ▼
Jitsi Videobridge（SFU）
  ├── Simulcast Layer 选择
  ├── Last-N 过滤
  └── 转发 RTP 包
  │
  ├── → 浏览器 B
  ├── → 浏览器 C
  └── → 浏览器 D ...

信令路径：浏览器 ↔ Prosody（XMPP）↔ Jicofo
```

## 性能与规格

| 指标 | 参考值 |
|------|--------|
| JVB 单节点并发参与者 | ~500 路（纯转发，4 核 8G）|
| 端到端延迟 | 150–300 ms（公网）|
| Simulcast 层数 | 3 层（高/中/低分辨率）|
| Last-N 默认值 | 20（超出只保留发言者）|
| 录制格式（Jibri） | MP4 / RTMP 推流 |

## 代码示例

### Docker Compose 快速启动

```yaml
# docker-compose.yml（官方 docker-jitsi-meet）
version: "3"
services:
  web:
    image: jitsi/web:latest
    ports:
      - "443:443"
      - "80:80"
    volumes:
      - ${CONFIG}/web:/config
    environment:
      - ENABLE_LETSENCRYPT=1
      - LETSENCRYPT_DOMAIN=meet.yourdomain.com
      - PUBLIC_URL=https://meet.yourdomain.com

  prosody:
    image: jitsi/prosody:latest
    volumes:
      - ${CONFIG}/prosody/config:/config
      - ${CONFIG}/prosody/prosody-plugins-custom:/prosody-plugins-custom

  jicofo:
    image: jitsi/jicofo:latest
    volumes:
      - ${CONFIG}/jicofo:/config
    environment:
      - XMPP_SERVER=prosody

  jvb:
    image: jitsi/jvb:latest
    ports:
      - "10000:10000/udp"
    volumes:
      - ${CONFIG}/jvb:/config
    environment:
      - DOCKER_HOST_ADDRESS=YOUR_PUBLIC_IP
      - XMPP_SERVER=prosody
```

```bash
# 生成配置并启动
cp env.example .env
# 编辑 .env 设置域名和密码
docker-compose up -d
```

### 使用 Jitsi Meet API 嵌入到自己的页面

```html
<div id="meet"></div>
<script src="https://meet.jit.si/external_api.js"></script>
<script>
const api = new JitsiMeetExternalAPI("meet.jit.si", {
  roomName: "MyMeetingRoom",
  parentNode: document.getElementById("meet"),
  width: 800,
  height: 600,
  configOverwrite: {
    startWithAudioMuted: true,
    startWithVideoMuted: false,
  },
  interfaceConfigOverwrite: {
    SHOW_JITSI_WATERMARK: false,
  },
});

// 监听事件
api.addEventListener("videoConferenceJoined", () => {
  console.log("加入会议成功");
});
</script>
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd jitsi-meet
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[livekit]] 的实现差异：LiveKit 用 Go 实现、单服务部署、SDK 生态丰富、更适合开发者集成；Jitsi Meet 是完整的开箱即用会议系统，适合直接部署给用户使用。

### 案例 4：大规模会议优化

对于 50+ 人的会议，调整 Last-N 为 5-10，并启用 Octo（JVB 级联）将负载分散到多台 JVB；单台 JVB 可处理约 500 路并发，多台通过 Octo 路由形成集群。

### 案例 5：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **PUBLIC_URL 未正确配置**：JVB 需要知道自身公网 IP（`DOCKER_HOST_ADDRESS`），配置错误导致 ICE candidate 无效，无法建连。
3. **UDP 10000 端口未开放**：JVB 媒体走 UDP 10000，只开 TCP 443 无法正常视频通话。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **Jibri 录制 Chrome 版本依赖**：Jibri 启动无头 Chrome，Chrome 版本与 Jibri 版本不匹配会导致录制启动失败；建议 Docker 锁定版本。
6. **XMPP 域名配置**：Prosody 的 `VirtualHost` 和 Jicofo/JVB 的 `XMPP_DOMAIN` 必须一致，任何一处错误导致会议无法创建。
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

- 官方仓库：https://github.com/jitsi/jitsi-meet
- [[livekit]]
- [[janus-gateway]]
- [[mediasoup]]
- [[pion]]

## 关联

- [[livekit]] —— 同专题对照阅读
- [[janus-gateway]] —— 同专题对照阅读
- [[mediasoup]] —— 同专题对照阅读
- [[pion]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[janus-gateway]] —— Janus WebRTC Gateway
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈

