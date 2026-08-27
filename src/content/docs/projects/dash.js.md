---
title: dash.js — DASH-IF 的 Web MPEG-DASH 参考播放器
description: 介绍固定版本的 DASH 参考播放器如何用 FactoryMaker、MPD 与动态 Throughput/BOLA 规则把 mpd 喂给 MediaSource
来源: https://github.com/Dash-Industry-Forum/dash.js
日期: 2026-08-27
分类: media
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Dash-Industry-Forum/dash.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a9a8542cd7e6257116be4046ebf16ac49e1cec91
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.2.1
---

## 是什么

dash.js 是 DASH Industry Forum 维护的 **Web 端 MPEG-DASH 参考播放器**。日常类比：普通 `<video>` 像一次端上一整盘菜；DASH 像自助餐台，播放器隔几秒按胃口和排队情况决定拿哪一档。

你写：

```js
import dashjs from 'dashjs';

const player = dashjs.MediaPlayer().create();
player.initialize(
  document.querySelector('video'),
  'https://example.com/manifest.mpd',
  true,
);
```

`MediaPlayer` 是 `FactoryMaker` 的 class factory：先 `MediaPlayer()` 拿到工厂，再 `.create()` 得到实例。`initialize(view, source, autoPlay, startTime = NaN)` 会检查 `capabilities.supportsMediaSource()`，再 `attachView` / `attachSource`。npm 包名是 `dashjs`，不是带点的 `dash.js`。

## 为什么重要

不理解固定 5.2.1 的工厂、MPD 和 ABR 规则开关，下面这些事会对不上：

- 为什么视频网站不给每个人发同一个 4K 文件，而是按缓冲和吞吐换 Representation
- 为什么默认同时打开 Throughput 和 BOLA，实际每个媒体类型同一时刻只用其中一条
- 为什么只写 `liveDelay: 4` 并不等于仓库默认低延迟配置
- 为什么 `reset()` 还能再挂源，而 `destroy()` 会拆掉整个 context 的单例

## 核心要点

固定 5.2.1 的主链可以拆成五步：

1. **工厂先于实例**：`dashjs.MediaPlayer().create()` 走 `FactoryMaker.getClassFactory`。`MediaPlayerFactory.create(video)` 是另一条捷径：它扫描 `application/dash+xml` 的 `<source>`，并记住 `video._dashjs_player`。

2. **initialize 先查 MSE**：没有 MediaSource 就报 `CAPABILITY_MEDIASOURCE_ERROR` 并返回。通过后装配 `AbrController`、`StreamController`、`CatchupController`、`DashAdapter` 等，再按参数挂 view / source。`autoPlay` 缺省当成 `true`。

3. **MPD 是菜单，MSE 是上菜口**：`.mpd` 列出 Period / AdaptationSet / Representation。`ManifestLoader` 拉清单，`StreamController` 按模板或时间线取片段，再 append 到 `SourceBuffer`。

4. **ABR 是可开关的规则表**：默认 `throughputRule`、`bolaRule`、`insufficientBufferRule`、`switchHistoryRule`、`abandonRequestsRule` 为 active；`droppedFramesRule`、`l2ARule`、`loLPRule` 为 false。Throughput 与 BOLA 同时打开时进入动态模式：缓冲越过 `hybridSwitchBufferTime`（默认 12 秒）才从 Throughput 切到 BOLA，`getBestPossibleSwitchRequest` 同一媒体类型不会两条一起算。

5. **直播延迟默认不写死 4 秒**：`streaming.delay.liveDelay` 默认 `NaN`，`useSuggestedPresentationDelay` 为 true。`liveCatchup.enabled` 默认 `null`，`playbackRate.min/max` 默认也是 `NaN`。低延迟下载时间默认用 `MOOF_PARSING`。

## 实践示例

### 案例 1：最短 MSE + MPD 链路

```js
const player = dashjs.MediaPlayer().create();
player.initialize(video, 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', true);
```

第三个参数是 autoplay，不是“已经在播”。第四个可选 `startTime`：点播相对第一 Period；直播可写 `posix:` 前缀表示 UTC 秒。没有 MSE 时 `initialize` 直接返回，后面的 `updateSettings` 也帮不上。

### 案例 2：关掉 BOLA，只观察吞吐规则

```js
player.updateSettings({
  streaming: {
    abr: {
      rules: {
        throughputRule: { active: true },
        bolaRule: { active: false },
        insufficientBufferRule: { active: true },
      },
    },
  },
});
```

`updateSettings` 是深合并，两次分别改 `a` 和 `b` 等于一次都写上。默认动态模式里 Throughput / BOLA 互斥；这里把 BOLA 关掉后，质量切换只走 Throughput，缓冲保护仍可由 `insufficientBufferRule` 兜底。

### 案例 3：显式指定 live delay，而不是以为仓库默认就是 4 秒

```js
player.updateSettings({
  streaming: {
    delay: { liveDelay: 4 },
    liveCatchup: {
      enabled: true,
      maxDrift: 0,
      playbackRate: { min: -0.5, max: 0.5 },
    },
  },
});
```

仓库默认 `liveDelay` 是 `NaN`，会先看 MPD 的 SuggestedPresentationDelay。`maxDrift` 和 `playbackRate` 默认也是 `NaN`。低延迟还要求内容是 CMAF chunk，并且传输支持 chunked transfer；只改播放器数字没有魔法。

## 踩过的坑

1. **把 MPD 当 MP4**：`.mpd` 只是清单。直接下载一个 MPD 文件不会出画面。
2. **把默认 ABR 理解成“Throughput 和 BOLA 同时投票”**：两者都 active 时，`getBestPossibleSwitchRequest` 每个媒体类型只留一条。
3. **把样例里的 `liveDelay: 4` 抄成默认值**：源码默认是 `NaN`。`droppedFramesRule` 默认也是关的。
4. **`reset()` 和 `destroy()` 当成一回事**：`reset()` 卸源、卸 view、复位 settings；`destroy()` 还会 `FactoryMaker.deleteSingletonInstances(context)`。
5. **npm 包名写成 `dash.js`**：registry 上是 `dashjs@5.2.1`。该版本 `package.json` 没有 `gitHead`，本页绑定的是 Git tag `v5.2.1` 轻量标签提交。

## 适用 vs 不适用场景

**适用**：

- Web 端 MPEG-DASH 点播 / 直播，并要对齐 DASH-IF 参考行为
- 想看 ABR 规则如何按 settings 装卸载，而不是只听算法名字
- 需要 DRM、多音轨、CMCD、字幕等播放器控制面

**不适用**：

- 只处理本地文件、转码、切片——先看 [[ffmpeg]]
- iOS Safari 原生 HLS 优先的业务——通常先看 [[hls.js]] 或系统播放器
- 超低延迟双向通话——应看 WebRTC，而不是 HTTP 自适应点播
- 需要本页提供已测量的卡顿率或码率曲线——本轮没有跑流

## 固定版本边界

- 本文绑定 `Dash-Industry-Forum/dash.js@a9a8542cd7e6257116be4046ebf16ac49e1cec91`，轻量 tag `v5.2.1`，`package.json` 的 `version` 同为 `5.2.1`。
- npm 包 `dashjs@5.2.1` 未提供 `gitHead`；条件 exports 指向 `dist/modern/esm/dash.all.min.js` 与 UMD 构建。`engines.node` 为 `>=20`。
- `Version.js` 的字符串同样由构建替换 `__VERSION__`。本文未安装依赖、未跑上游测试、未测 bundle。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **参考播放器首先是调度器**——它读 MPD、选 Representation、喂 MSE，不负责把源片转成 DASH。
2. **规则表不等于同时生效**——Throughput / BOLA 默认双开，运行时按缓冲互斥。
3. **低延迟是三件事对齐**——切片、传输、播放器 catchup；默认 `liveDelay` 并不等于 4。
4. **工厂和单例有生命周期**——`reset` 可重挂，`destroy` 拆 context。

## 应用型自测

1. `dashjs.MediaPlayer().create()` 和 `dashjs.MediaPlayerFactory.create(video)` 是不是同一条入口？
2. 默认 settings 里 `bolaRule.active` 和 `droppedFramesRule.active` 分别是什么？
3. `initialize()` 在 `supportsMediaSource()` 为 false 时还会不会 `attachSource`？

检查点：

1. 不是。前者是 FactoryMaker class factory；后者扫描 `application/dash+xml` 的 `<source>` 并写 `video._dashjs_player`。
2. `true` 与 `false`。
3. 不会。它先报 MediaSource 能力错误并 `return`，后面的 attach 不会执行。

## 延伸阅读

- 固定源码：[Dash-Industry-Forum/dash.js](https://github.com/Dash-Industry-Forum/dash.js) —— 本文绑定提交 `a9a8542cd7e6257116be4046ebf16ac49e1cec91`
- 官方站点：[dashif.org/dash.js](https://dashif.org/dash.js/)
- [[hls.js]] —— 同一条 MSE 路上的 HLS 客户端
- [[ffmpeg]] —— 生成 DASH 片段前常用的转码与封装工具

## 关联

- [[hls.js]] —— HLS 菜单 + EWMA ABR 的对照
- [[ffmpeg]] —— 把源视频切成 DASH 可用素材
- [[shaka-player]] —— 同时覆盖 DASH / HLS 的另一套 MSE 播放器
- [[video.js]] —— UI 壳，协议层可接到 dash.js 或 VHS
- [[openvidu]] —— 实时会议，和单向 HTTP 流对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
