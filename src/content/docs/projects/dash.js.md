---
title: dash.js — Web DASH 播放器官方参考实现
来源: 'https://github.com/Dash-Industry-Forum/dash.js'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

dash.js 是 DASH Industry Forum 维护的 **Web 端 MPEG-DASH 播放器参考实现**。日常类比：普通 `<video>` 像你把一整盘菜端上桌；DASH 像自助餐台，播放器每隔几秒根据胃口和排队情况，决定拿高清、标清还是先少拿一点。

它读的不是一个完整 MP4，而是一个 `.mpd` 清单和一堆小媒体片段。清单告诉播放器："这里有 360p、720p、1080p；每段几秒；音频和字幕在哪里。" dash.js 负责下载片段、喂给浏览器的 MSE，再让 `<video>` 像播放普通视频一样播出来。

最小心智模型：

```html
<video id="player" controls></video>
<script src="https://cdn.dashjs.org/latest/modern/umd/dash.all.min.js"></script>
<script>
  const url = 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd'
  const player = dashjs.MediaPlayer().create()
  player.initialize(document.querySelector('#player'), url, true)
</script>
```

一句话：dash.js 不是"视频文件处理器"，而是"浏览器里会自己换码率、管缓冲、读 DASH 清单的播放控制器"。

## 为什么重要

不理解 dash.js，下面这些事都很难解释：

- 为什么视频网站不会给每个人都发同一个 4K 文件，而是按网络情况切换不同码率
- 为什么一个直播延迟 3 秒还是 30 秒，不只取决于 CDN，也取决于播放器怎么追 live edge
- 为什么 ABR 算法要同时看带宽和缓冲区，只看下载速度会在弱网里来回抖
- 为什么 DASH-IF 需要一个参考播放器：标准写得再清楚，也要有可运行实现验证细节

## 核心要点

dash.js 的核心可以压缩成 **三件事**：

1. **MPD 是菜单**：MPD 清单列出所有可选 Representation，比如 480p/600k、720p/2.5M。类比：餐厅菜单写着有哪些套餐、价格和出餐节奏，播放器照着菜单点菜。

2. **MSE 是上菜口**：dash.js 用 Fetch/XHR 拿到媒体片段，再通过 Media Source Extensions append 到 `SourceBuffer`。类比：厨房分批出菜，服务员按顺序放到传送带，客人看到的是连续一餐。

3. **ABR 是调度员**：每下载一段，播放器估算吞吐、查看 buffer、观察掉帧，再决定下一段用哪个码率。类比：高速路导航不是只看最高限速，还要看拥堵、油量和前方出口。

这也是它适合学习 ABR 的原因：ThroughputRule、BolaRule、L2A、LoL+ 都能在官方文档和样例里看到入口，抽象比生产闭源播放器透明。

## 实践案例

### 案例 1：网页里播放一个 DASH 点播流

```html
<video id="v" controls></video>
<script src="https://cdn.dashjs.org/latest/modern/umd/dash.all.min.js"></script>
<script>
  const mpd = 'https://dash.akamaized.net/envivio/EnvivioDash3/manifest.mpd'
  const player = dashjs.MediaPlayer().create()
  player.initialize(document.querySelector('#v'), mpd, true)
</script>
```

逐部分解释：

- `mpd` 指向清单，不是单个视频文件；播放器会继续按清单请求音视频片段
- `MediaPlayer().create()` 创建播放器控制器，不直接替代 `<video>`
- `initialize(video, mpd, true)` 把控制器、DOM video、DASH 清单连起来，并允许自动播放

这是官方 Quickstart 的真实用法，适合验证"浏览器 + MSE + DASH 清单"这条最短链路。

### 案例 2：把 ABR 切到吞吐优先，观察码率怎么变

```js
player.updateSettings({
  streaming: {
    abr: {
      rules: {
        throughputRule: { active: true },
        bolaRule: { active: false },
        insufficientBufferRule: { active: true },
        switchHistoryRule: { active: false },
        droppedFramesRule: { active: false },
        abandonRequestsRule: { active: false }
      }
    }
  }
})
player.initialize(video, 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', true)
```

逐部分解释：

- `throughputRule` 根据最近片段的下载速度选下一段码率，直觉最容易懂
- `bolaRule` 是 buffer-based 规则；关掉它可以单独观察吞吐规则的反应
- `insufficientBufferRule` 像安全员，缓冲快空时强制保守，避免卡顿

这来自官方 ABR sample，是学习自适应码率最有价值的入口：你能看到"算法选择"不是口号，而是具体开关。

### 案例 3：低延迟直播里追 live edge

```js
player.updateSettings({
  streaming: {
    delay: { liveDelay: 4 },
    liveCatchup: {
      maxDrift: 0,
      playbackRate: { max: 1, min: -0.5 }
    },
    abr: {
      throughput: {
        lowLatencyDownloadTimeCalculationMode:
          dashjs.Constants.LOW_LATENCY_DOWNLOAD_TIME_CALCULATION_MODE.MOOF_PARSING
      }
    }
  }
})
```

逐部分解释：

- `liveDelay: 4` 表示目标是离直播边缘大约 4 秒；越小越实时，但越容易卡
- `liveCatchup` 允许播放器用轻微变速或 seek 把自己拉回 live edge
- `MOOF_PARSING` 用 CMAF chunk 边界估算下载时间，避免把服务器等待时间误当成网络慢

这是官方低延迟文档里的真实配置方向，适合理解"直播低延迟 = 内容切片 + 服务器传输 + 播放器追赶"三件事一起成立。

## 踩过的坑

1. **把 MPD 当 MP4**：`.mpd` 只是清单，真正媒体片段还要继续请求；直接下载一个 MPD 当然播不出画面。
2. **只调 `liveDelay` 就期待低延迟**：如果内容不是 CMAF chunk、服务器不支持 chunked transfer，播放器没有魔法可用。
3. **ABR 只看带宽会抖**：网络瞬间变好就升码率，buffer 还没稳就容易再次卡顿，所以 dash.js 默认会动态结合 throughput 和 BOLA。
4. **忘记浏览器能力边界**：MSE、EME、codec 支持都在浏览器侧；dash.js 能调度片段，但不能让不支持的 codec 突然可播。

## 适用 vs 不适用

**适用**：

- Web 端 MPEG-DASH 点播和直播播放器
- 想研究 ABR 算法、低延迟直播、CMCD 指标上报的团队
- 需要对齐 DASH-IF IOP、做标准兼容性验证的流媒体工程
- 需要 DRM、字幕、多音轨、指标事件等播放器控制面的场景

**不适用**：

- 只想处理本地视频文件、转码、切片，先看 [[ffmpeg]]
- iOS Safari 原生 HLS 优先的业务，通常先看 [[hls.js]] 或原生播放能力
- 超低延迟双向通话，应该看 WebRTC / [[openvidu]] / [[webrtc-rs]]
- 不想碰 DASH 清单、CDN、segment、codec 的简单页面嵌入

## 历史小故事（可跳过）

- **2012 年前后**：MPEG-DASH 标准化，目标是让自适应 HTTP 流媒体不再被单一厂商协议锁死。
- **2013-2014 年**：浏览器 MSE 成熟，JavaScript 播放器开始能自己喂片段给 `<video>`，dash.js 有了落地空间。
- **DASH-IF 维护阶段**：dash.js 成为 DASH Industry Forum 的参考客户端，跟 IOP 指南、LiveSim 2、测试流一起演进。
- **低延迟阶段**：CMAF chunk、L2A、LoL+、CMCD 等能力陆续进入文档和样例，播放器从"能播"变成"能解释体验"。
- **今天**：仓库约 5.5k stars，价值不在 star 数本身，而在它是标准组织维护、可对照规范学习的实现。

## 学到什么

- **流媒体播放器是调度系统**：它不只是播文件，而是在网络、缓冲、码率、延迟之间做连续决策。
- **标准需要参考实现**：DASH 的 MPD、SegmentTemplate、CMAF、CMCD 都很抽象，dash.js 把它们变成能跑的代码。
- **ABR 的本质是取舍**：高画质、低卡顿、低延迟不能同时拉满，算法是在三个目标之间找平衡。
- **低延迟不是单点优化**：编码切片、HTTP 传输、CDN、播放器 catchup、吞吐估算要一起配合。

## 延伸阅读

- 官方文档：[dashif.org/dash.js](https://dashif.org/dash.js/)（Quickstart、Usage、样例入口都在这里）
- 官方样例：[dash.js Samples](https://reference.dashif.org/dash.js/latest/samples/index.html)（ABR、低延迟、CMCD 都能直接跑）
- ABR 文档：[ABR Settings](https://dashif.org/dash.js/pages/usage/abr/settings.html)（理解 ThroughputRule、BolaRule、L2A、LoL+）
- 低延迟文档：[Low Latency Streaming](https://dashif.org/dash.js/pages/usage/low-latency.html)（CMAF chunk 和 live edge 解释很细）
- [[hls.js]] —— Web HLS 播放库，适合对照 HLS 与 DASH 两条路线
- [[ffmpeg]] —— 生成 DASH/HLS 片段前常用的转码与封装工具

## 关联

- [[hls.js]] —— 同样是 Web 自适应流播放器，但协议生态偏 HLS
- [[ffmpeg]] —— 常用来把源视频转码、切片、封装成 DASH 可用素材
- [[gstreamer]] —— 另一套媒体 pipeline 框架，适合理解"片段、编码、缓冲"的底层来源
- [[ovenmediaengine]] —— 流媒体服务器侧项目，可对照播放器和服务端的责任边界
- [[openvidu]] —— 实时会议 PaaS，和 dash.js 的单向 HTTP 流媒体形成对照
- [[webrtc-rs]] —— WebRTC 协议栈，适合比较低延迟直播和双向实时通信的差异

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hls.js]] —— hls.js — 浏览器里的 HLS 播放库
- [[mediasoup]] —— mediasoup — 多人音视频会议的 SFU 路由器
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 把 NGINX 变成直播入口
- [[shaka-player]] —— Shaka Player — Google 流媒体播放器
- [[video.js]] —— Video.js — Web 视频播放器框架
