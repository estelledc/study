---
title: hls.js — 用 MSE 在浏览器里播 HLS 的客户端
description: 介绍固定版本的 HLS 客户端如何用播放列表、分片 transmux 和 EWMA ABR 把 m3u8 喂给 MediaSource
来源: https://github.com/video-dev/hls.js
日期: 2026-08-27
分类: media
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/video-dev/hls.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 565f70ee8e074a0fbe82ed80dfb7fac0697bbb8a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.7.1
---

## 是什么

hls.js 是一个在网页里播放 **HLS**（HTTP Live Streaming）的 JavaScript 客户端。日常类比：普通 `<video src="a.mp4">` 像把整部片子拷进播放器；HLS 像连载目录——先读 `.m3u8` 菜单，再按页下载分片。Safari 往往能原生播这份菜单；多数桌面 Chrome / Firefox 不行。

你写：

```js
import Hls from 'hls.js';

const video = document.querySelector('video');
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource('https://example.com/index.m3u8');
  hls.attachMedia(video);
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  video.src = 'https://example.com/index.m3u8';
}
```

`Hls.isSupported()` 不只看有没有 MSE：还要用 `MediaSource.isTypeSupported` 试一组基线 codec。只想问“能不能建 MediaSource”，应看 `Hls.isMSESupported()`。固定 1.7.1 的实例一次只挂一个 `HTMLMediaElement`。

## 为什么重要

不理解固定版本的播放列表、MSE 和 ABR 合同，下面这些事会对不上：

- 为什么同一条 `.m3u8` 在 iPhone Safari 能播、在桌面 Chrome 却要挂这个库
- 为什么 `currentLevel = 0` 会立刻打断播放，而 `nextLevel = 0` 不会
- 为什么 fatal 错误之后只调 `startLoad()` 不一定够，媒体错误要走 `recoverMediaError()`
- 为什么直播“晚几秒”默认按 **3 个 target duration** 算，不是固定 3 秒

## 核心要点

固定 1.7.1 的主链可以拆成五步：

1. **构造时装配控制器**：`new Hls(userConfig)` 用 `mergeConfig(DefaultConfig, userConfig)`。默认 `autoStartLoad: true`、`enableWorker: true`。构造函数会新建 `PlaylistLoader`、`LevelController`、`StreamController`、`AbrController`、`BufferController` 和 `ErrorController`。

2. **先挂媒体，再给地址**：`attachMedia(video)` 发出 `MEDIA_ATTACHING`。`loadSource(url)` 把相对地址收成绝对 URL，触发 `MANIFEST_LOADING`；若已有媒体且源变了，会先 `detachMedia` 再重新挂，以便重建 MediaSource。

3. **播放列表 → 分片 → transmux → SourceBuffer**：`PlaylistLoader` 拉主列表和媒体列表；`StreamController` 下分片。MPEG-TS 要经 `TransmuxerInterface` 转成浏览器能 append 的 fMP4。`enableWorker` 为 true 时优先走 Worker，失败再退回主线程。

4. **ABR 用 EWMA 估带宽**：`AbrController` 持有 `EwmaBandWidthEstimator`，默认初值 `abrEwmaDefaultEstimate = 5e5`（500 kbps）。`currentLevel = -1` 把选择权交回自动档。

5. **出错先分类再决定是否拆 MediaSource**：`ErrorController` 可按 `fragLoadPolicy` 重试或换档。带 `ResetMediaSource` 标志时会自己调用 `recoverMediaError()`；一旦标成 `fatal`，它会 `stopLoad()`，不再自动往下拉。

## 实践示例

### 案例 1：MSE 路径与 Safari 原生分支

```js
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);
} else if (video.canPlayType('application/vnd.apple.mpegurl')) {
  video.src = src;
}
```

`isSupported()` 会试 `avc1.42E01E,mp4a.40.2` / `av01.0.01M.08` / `vp09.00.50.08` 或音频 `mp4a.40.2` / `fLaC`。原生分支不要再 `new Hls()`，避免两套缓冲抢同一个 `<video>`。

### 案例 2：锁当前档会冲缓冲，锁下一档不会

```js
hls.on(Hls.Events.MANIFEST_PARSED, () => {
  hls.currentLevel = 0; // 立刻切，flush 后重同步
  // hls.nextLevel = 0; // 只改下一片，不打断当前播放
  // hls.currentLevel = -1; // 回到自动 ABR
});
```

`currentLevel` 写入 `levelController.manualLevel` 后走 `immediateLevelSwitch()`。`nextLevel` 走 `nextLevelSwitch()`，注释写明尽量不打断播放。

### 案例 3：fatal 网络错误与媒体错误不是同一条恢复链

```js
hls.on(Hls.Events.ERROR, (_, data) => {
  if (!data.fatal) return;
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
  else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
  else hls.destroy();
});
```

`startLoad()` 让还活着的 `networkControllers` 重新拉流。`recoverMediaError()` 先 `detachMedia`，再挂回同一个元素，并在已经 `startLoad` 过时从 `media.currentTime` 续播。库内 `ErrorController` 也可能先自动拆过一次 MediaSource；应用层仍要处理最终 `fatal`。

## 踩过的坑

1. **把 `isSupported()` 当成“有 MSE 就行”**：没有过 codec `isTypeSupported` 时它仍返回 false。只查 MSE 要用 `isMSESupported()`。
2. **把 `currentLevel` 当无缝切换**：它会立刻 flush。只想换下一片清晰度，用 `nextLevel`。
3. **把 `liveSyncDurationCount: 3` 读成 3 秒**：默认按 3 个 target duration 对齐 live edge，分片 6 秒就是大约 18 秒延迟。秒级控制要另设 `liveSyncDuration`，且不能和 `*Count` 混用。
4. **路由离开不 `destroy()`**：`destroy()` 会 `detachMedia` 并拆掉全部 network / core 控制器；只丢掉 JS 引用，Worker 和下载仍可能在跑。
5. **源码仓 `package.json` 没有 `version` 字段**：发布版本由构建注入 `__VERSION__`。本页绑定的是 tag `v1.7.1` 剥皮提交，与 npm `hls.js@1.7.1` 的 `gitHead` 一致。

## 适用 vs 不适用场景

**适用**：

- 桌面 Chrome / Firefox 等需要 MSE 才能播 HLS 点播或直播
- 已有 CDN 输出 `.m3u8`，前端要统一错误事件和档位控制
- 能接受默认 Worker transmux，以及自动 `startLoad`

**不适用**：

- 仅 iOS Safari 且原生 HLS 已够用——不必再挂一套 MSE 客户端
- 源是 DASH（`.mpd`）——应看 [[dash.js]]
- 需要服务端转码或打包——那是 [[ffmpeg]] 的事
- 要把本页写成“已跑过真实流 / 已测体积”的结论——本轮没有

## 固定版本边界

- 本文绑定 `video-dev/hls.js@565f70ee8e074a0fbe82ed80dfb7fac0697bbb8a`，tag `v1.7.1`。该 tag 是附注标签，标签对象为 `cdc4f116c3b83c23fd6e47ecbd2ddc0a6b399092`，剥皮提交即上式。
- npm `hls.js@1.7.1` 的 `gitHead` 与剥皮提交一致。源码仓 `package.json` 不写 `version`，`main` / `module` 指向 `dist/hls.js` 与 `dist/hls.mjs`。
- 默认 `maxBufferLength = 30`、`abrEwmaDefaultEstimate = 5e5`、`enableSoftwareAES = true`。本文未安装依赖、未跑上游测试、未播真实流。
- 状态保持 `UNVERIFIED`。

## 学到什么

1. **协议和引擎要分开**——HLS 是分发格式；hls.js 是浏览器侧 MSE 客户端。
2. **`isSupported()` 含 codec 探测**——有 MediaSource 不等于能播这份清单。
3. **档位 API 分“立刻换”和“下一片换”**——`currentLevel` flush，`nextLevel` 尽量不停播。
4. **直播延迟默认按分片个数**——`liveSyncDurationCount` 不是秒。

## 应用型自测

1. `Hls.isSupported()` 在只有 MSE、但 `isTypeSupported` 对基线 codec 全失败时，返回值是什么？
2. 设置 `hls.currentLevel = 0` 会不会走 `immediateLevelSwitch()`？
3. 默认配置下，直播对齐 live edge 看的是 `liveSyncDuration` 还是 `liveSyncDurationCount`？

检查点：

1. `false`。它先要求 `isMSESupported()`，再要求至少一种基线 video/audio codec 通过 `isTypeSupported`。
2. 会。setter 先写 `manualLevel`，再调用 `streamController.immediateLevelSwitch()`。
3. `liveSyncDurationCount`，默认是 3。`liveSyncDuration` 默认是 `undefined`。

## 延伸阅读

- 固定源码：[video-dev/hls.js](https://github.com/video-dev/hls.js) —— 本文绑定提交 `565f70ee8e074a0fbe82ed80dfb7fac0697bbb8a`
- API 说明：[docs/API.md](https://github.com/video-dev/hls.js/blob/565f70ee8e074a0fbe82ed80dfb7fac0697bbb8a/docs/API.md)
- HLS 草案：[RFC 8216 系](https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis)
- [[dash.js]] —— 同一条 MSE 路上的 DASH 参考实现
- [[video.js]] —— 播放器壳，底下可接 hls.js

## 关联

- [[dash.js]] —— DASH 清单 + 规则化 ABR 的对照
- [[video.js]] —— UI / 插件壳，HLS 能力常接到本库
- [[ffmpeg]] —— 生成 m3u8 与分片的常见服务端工具
- [[shaka-player]] —— 同时覆盖 HLS / DASH 的另一套 MSE 播放器
- [[mediasoup]] —— WebRTC SFU，问题域不是 HLS VOD

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
