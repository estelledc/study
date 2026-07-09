---
title: Ant Media Server — WebRTC / CMAF 直播服务
来源: 'https://github.com/ant-media/Ant-Media-Server'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

Ant Media Server（**AMS**）是一套把**采集、转发、低延迟播放、录制、集群和客户端 SDK** 打包在一起的直播服务器。

日常类比：它像一座直播电视台的中控室。主播从前门把画面送进来，观众从不同出口看直播，后台还能自动录像、分房间、加备用机器。

最小例子可以先把一个本地视频推成 RTMP 直播：

```bash
ffmpeg -re -i test.mp4 -c copy -f flv rtmp://IP-address/live/primary
```

这条命令里的 `primary` 是流 ID。推上去以后，AMS 可以把同一条流用 WebRTC、HLS、DASH 或 LL-HLS / CMAF 方式给不同设备播放。

如果把 [[ffmpeg]] 想成“会处理视频文件的工具箱”，AMS 更像“在线直播机房”：它关心的不只是编码，还关心观众怎么连、延迟多少、流断了怎么办、录制文件放哪里。

## 为什么重要

不理解 Ant Media Server，下面这些事会很难解释：

- 为什么直播系统不是“推一个视频文件到服务器”这么简单，还要同时处理 RTMP、SRT、WebRTC、HLS、CMAF 等入口和出口。
- 为什么互动直播强调 WebRTC 的亚秒级延迟，而大规模普通观看常常还要保留 HLS / LL-HLS 这类更耐 CDN 的协议。
- 为什么录制不是播放器顺手保存一下，而是服务器端按流 ID、编码器、容器格式和存储位置统一管理。
- 为什么真正上线后会立刻遇到集群、负载均衡、TURN、防火墙、证书和 SDK 版本这些“视频以外”的问题。

## 核心要点

AMS 可以先记住 **三件事**：

1. **多协议网关**：同一套服务器能接 WebRTC、RTMP、SRT、RTSP 等输入，再输出 WebRTC、HLS、DASH、LL-HLS / CMAF。类比：火车站把高铁、地铁、出租车的人都接进来，再按目的地分流。

2. **控制面和媒体面绑在一起**：REST API、WebSocket 信令、Web 管理台和媒体转发都在同一个产品里。类比：小团队不用自己分别买票务系统、调度系统和检票闸机，先用一套成品跑起来。

3. **从单机到集群有明确台阶**：单机适合验证，生产会引入 MongoDB、origin / edge、Kubernetes 或 Docker Swarm。类比：先开一家门店，再把总仓、分店和配送路线补齐。

这也是 AMS 和 [[jitsi-videobridge]] 的差别：JVB 更像专门的视频会议转发器，AMS 更像覆盖直播、录制、播放和分发的全套流媒体平台。

## 实践案例

### 案例 1：手机 App 直接发布 WebRTC 直播

官方 Android SDK 文档给出的核心代码很短：Activity 里创建 `IWebRTCClient`，填服务器 WebSocket 地址，然后发布一个流 ID。

```java
IWebRTCClient webRTCClient = IWebRTCClient.builder()
  .setActivity(this)
  .setLocalVideoRenderer(findViewById(R.id.full_screen_renderer))
  .setServerUrl("wss://test.antmedia.io:5443/live/websocket")
  .build();

webRTCClient.publish("stream1");
```

逐部分解释：

- `setServerUrl(...)` 指向 AMS 的 WebRTC 信令入口，不是普通 HTTP 播放地址。
- `setLocalVideoRenderer(...)` 让本机摄像头画面先显示在手机屏幕上，方便确认采集正常。
- `publish("stream1")` 把这台手机的音视频推到服务器，`stream1` 就是后续播放和录制要用的名字。

这个案例说明 AMS 的 SDK 价值：业务方不用从零写 `RTCPeerConnection`、ICE、WebSocket 消息和摄像头权限，只要围绕“发布哪条流”组织业务逻辑。

### 案例 2：只给某一条直播开启 MP4 录制

官方录制文档提供 REST API，可以按单个 `streamId` 开关录制，而不是把所有直播都保存下来。

```bash
curl -X 'PUT' \
  'https://domain-or-IP:5443/AppName/rest/v2/broadcasts/streamId/recording/true?recordType=mp4' \
  -H 'accept: application/json'
```

停止录制时把 `true` 改成 `false`：

```bash
curl -X 'PUT' \
  'https://domain-or-IP:5443/AppName/rest/v2/broadcasts/streamId/recording/false?recordType=mp4' \
  -H 'accept: application/json'
```

逐部分解释：

- `AppName` 是应用名，常见默认应用叫 `live`，不同应用可以有不同配置。
- `streamId` 对应正在直播的那条流，录制开关跟着它走。
- `recordType=mp4` 表示落成 MP4；如果走 WebM，需要确认 VP8 等编码条件满足。

这个案例适合在线课、访谈、审计回放：只录需要留档的流，能少占 CPU、磁盘和对象存储。

### 案例 3：用 Helm 把直播服务拆成 origin / edge

官方 Kubernetes 文档里的 Helm 入口把 MongoDB、origin、edge 和 ingress 一起部署出来，适合作为“单机之后的第一版集群”。

```bash
helm repo add antmedia https://ant-media.github.io/helm
helm repo update
helm install antmedia antmedia/antmedia \
  --set origin=origin.example.com \
  --set edge=edge.example.com \
  --namespace antmedia --create-namespace
```

逐部分解释：

- `origin` 更像主播入口和主源站，负责接住发布端。
- `edge` 更像离观众近的分发节点，负责把观看流量摊开。
- MongoDB 用来保存集群里共享的流、节点和状态信息。

这个案例说明“低延迟直播”不是只调播放器参数。人数一多，真正要设计的是 origin / edge 拓扑、DNS、证书、TURN、资源限额和监控。

## 踩过的坑

1. **把 WebRTC 和 HLS 当成同一种播放方式**：WebRTC 追求互动低延迟，HLS / LL-HLS 更适合大规模分发；目标不同，缓存和排障方式也不同。

2. **录 MP4 前没确认编码器**：MP4 常用 H.264，流如果只开了不兼容的编码，服务器即使收到直播也不一定能正确落成 MP4。

3. **只开 HTTP 端口就以为 WebRTC 能通**：浏览器 WebRTC 还要走 ICE、UDP、TURN、证书和 WebSocket；企业内网挡 UDP 时，问题会表现成“能打开页面但播不起来”。

4. **把 Community 和 Enterprise 能力混在一起看**：集群、自动扩缩、部分高级安全和商业支持常有版本边界；做技术选型时要先确认自己实际可用的版本。

## 适用 vs 不适用场景

**适用**：

- 在线教育、拍卖、直播带货、远程问诊这类需要低延迟互动的直播业务。
- 已经有 RTMP / RTSP / SRT 输入，但希望浏览器端用 WebRTC 或 LL-HLS 播放。
- 需要服务端录制、对象存储、REST 管理和多端 SDK 的团队。
- 小团队想先用一套成品媒体平台跑通业务，再逐步拆分和调优。

**不适用**：

- 只想离线转码、剪辑或批量处理文件，直接用 [[ffmpeg]] 或 [[gstreamer]] 更轻。
- 只做多人视频会议，不需要 RTMP、HLS、录制和直播分发，[[openvidu]] / [[jitsi-videobridge]] 可能更贴合。
- 要完全自研 SFU 算法、RTP 转发策略或插件体系，[[janus-gateway]] 这类底层网关更容易改。
- 团队没有运维人手，却想一开始就上跨地域大集群；这会把媒体问题变成基础设施问题。

## 历史小故事（可跳过）

- **2010 年代中后期**：WebRTC 浏览器能力成熟，低延迟互动直播开始从插件时代迁移到原生浏览器。
- **RTMP 时代之后**：传统直播入口仍大量依赖 RTMP / RTSP / SRT，服务器需要同时照顾老设备和新浏览器。
- **LL-HLS / CMAF 出现后**：直播分发开始追求“比传统 HLS 更低延迟，同时还能走 HTTP/CDN”的折中路线。
- **今天**：AMS 把开源社区版、企业版、云市场镜像、SDK 和文档打包成一个商业化开源项目，定位不只是代码库，而是完整直播基础设施。

## 学到什么

1. 直播平台的核心不是单个协议，而是把“推流、播放、录制、扩容、SDK 接入”串成一条稳定链路。
2. WebRTC、RTMP、SRT、HLS、CMAF 各自服务不同角色；选协议之前要先问“谁在推、谁在看、能接受多少延迟”。
3. 录制和集群不是附属功能，它们会反过来影响编码器选择、存储成本和应用架构。
4. 对初学者来说，AMS 是理解现代直播后端的好入口，因为它把很多分散概念放进了同一个可运行系统。

## 延伸阅读

- 官方仓库：[ant-media/Ant-Media-Server](https://github.com/ant-media/Ant-Media-Server)
- 官方文档入口：[Ant Media Server Docs](https://docs.antmedia.io/)
- Android SDK 发布示例：[Publish WebRTC Stream](https://docs.antmedia.io/guides/developer-sdk-and-api/sdk-integration/android-sdk/android-webrtc-publish/)
- 录制文档：[MP4 & WebM Recording](https://docs.antmedia.io/guides/recording-live-streams/mp4-and-webm-recording/)
- Kubernetes 文档：[Deploy Ant Media Server with Helm Charts](https://docs.antmedia.io/guides/clustering-and-scaling/kubernetes/deploy-ams-with-helm/)
- [[ovenmediaengine]] —— 同样面向低延迟直播，可对照不同服务器的协议取舍。

## 关联

- [[webrtc-rs]] —— WebRTC 协议栈的 Rust 实现，能帮助理解 AMS SDK 背后的连接过程。
- [[openvidu]] —— 更偏视频会议 PaaS，和 AMS 的直播平台定位相邻但不完全相同。
- [[jitsi-videobridge]] —— 典型 SFU，只管会议媒体转发，适合对照 AMS 的全栈能力。
- [[ffmpeg]] —— 常作为推流、转码、测试输入工具，AMS 则负责在线服务化。
- [[gstreamer]] —— 媒体 pipeline 框架，能解释服务器内部为什么要拆解码、封装和输出。
- [[hls.js]] —— 浏览器 HLS 播放侧组件，和 AMS 的 HLS / LL-HLS 输出互补。
- [[coturn]] —— WebRTC 穿透失败时的常见兜底组件，部署 AMS 也绕不开 NAT 问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
