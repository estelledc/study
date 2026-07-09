---
title: Shaka Player — Google 流媒体播放器
来源: 'https://github.com/shaka-project/shaka-player'
日期: 2026-05-29
分类: media
难度: 中级
---

## 是什么

Shaka Player 是 Google 开源的**浏览器流媒体播放器库**，专门把 DASH、HLS 这类“分片视频”稳定播出来。日常类比：普通 MP4 像一整张电影光盘；Shaka 像外卖调度员，边看路况边决定下一分钟送 480p、720p 还是 1080p。

你写的应用代码大概长这样：

```js
const video = document.querySelector('video');
const player = new shaka.Player();
await player.attach(video);
await player.load('https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd');
```

这 4 行背后做了很多事：读 manifest、选择音视频轨道、下载分片、塞进 MediaSource、遇到加密内容时走 EME 请求许可证。你看到的是一个 `<video>`，Shaka 负责把“很多小文件 + 很多浏览器差异”缝成连续播放。

它不是视频转码器，也不是 CDN，也不是播放器 UI 皮肤库。它更像播放链路里的“聪明中控”：浏览器能播什么、网络还剩多少、哪个 DRM 可用、缓存够不够，都由它协调。

## 为什么重要

不理解 Shaka Player，下面这些事都不好解释：

- 为什么 Netflix / YouTube 式的清晰度切换不是换一个大文件，而是每几秒选择一段不同码率的分片
- 为什么 Chrome 能用 Widevine、Edge 能用 PlayReady、Safari 又绕不开 FairPlay 和原生 HLS
- 为什么一个 Web 播放器要关心 CORS、HTTPS、Range request、bufferingGoal 这些“后端和网络细节”
- 为什么离线下载视频不是 `fetch(mp4)` 存起来这么简单，还要处理 manifest、分片、字幕和持久许可证

## 核心要点

Shaka Player 的核心可以拆成 **三层**：

1. **Manifest 驱动播放**：DASH 的 `.mpd` 和 HLS 的 `.m3u8` 像菜单，告诉播放器有哪些清晰度、语言、字幕和分片地址。类比：你不直接进厨房拿菜，而是先看菜单，按预算和口味点下一盘。

2. **MSE 把分片喂给 `<video>`**：浏览器原生 `<video>` 更擅长吃连续媒体流，MediaSource Extensions 让 JS 可以一段一段追加数据。类比：不是一次性灌满水箱，而是水位低了就补一桶。

3. **EME 和网络层处理商业复杂度**：加密内容要通过 Encrypted Media Extensions 找 CDM，再向 license server 拿钥匙；请求还可能要带 header、cookie、token。类比：电影票不是影片本身，但没有票闸机不会放你进场。

三层合起来，Shaka 的价值不是“播放一个视频”，而是把不同浏览器、不同协议、不同 DRM、不同网络状态变成一套统一控制面。

## 实践案例

### 案例 1：官方 Angel One DASH 演示流

```html
<video id="video" width="640" controls autoplay></video>
<script src="dist/shaka-player.compiled.js"></script>
```

```js
shaka.polyfill.installAll();
if (!shaka.Player.isBrowserSupported()) throw new Error('not supported');
const player = new shaka.Player();
await player.attach(document.getElementById('video'));
await player.load('https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd');
```

**逐部分解释**：`installAll()` 先补浏览器兼容洞；`isBrowserSupported()` 检查 MSE/EME 等底层能力；`attach()` 把 Shaka 接到真实 video 元素；`load()` 读 manifest 后开始拉分片。这个例子来自官方 Basic Usage 教程，不是虚构地址。

### 案例 2：Widevine / PlayReady 许可证服务器

```js
player.configure({
  drm: {
    servers: {
      'com.widevine.alpha': 'https://foo.example/drm/widevine',
      'com.microsoft.playready': 'https://foo.example/drm/playready'
    }
  }
});
await player.load(manifestUri);
```

**逐部分解释**：`drm.servers` 是 key system 到 license server 的映射；Chrome 通常走 Widevine，Edge / Xbox 常见 PlayReady。manifest 里声明内容被加密，浏览器通过 EME 选择可用 CDM，Shaka 再替你把许可证请求发出去。

### 案例 3：把内容存进 IndexedDB 离线播放

```js
const storage = new shaka.offline.Storage(player);
storage.configure({ offline: { progressCallback: setProgress } });
const stored = await storage.store(manifestUri, { title: 'Angel One' }).promise;
await player.load(stored.offlineUri);
```

**逐部分解释**：`Storage` 会下载 manifest 选中的分片和文本轨道，底层放进 IndexedDB；`progressCallback` 更新下载进度；`offlineUri` 看起来像一个普通播放地址，所以播放器不需要知道它来自网络还是本地缓存。

## 踩过的坑

1. **HTTPS 不是可选项**：EME 在 Chrome 里要求安全来源；页面是 `https` 时，manifest、分片、license server 也不能混用 `http`。

2. **CORS 和 Range 少一个都会卡**：跨域媒体服务器要允许播放器访问，分片和某些 manifest 探测还可能需要 `Range` 头；后端只返回 200 全量文件会拖慢启动。

3. **iOS Safari 经常走原生 HLS 路径**：Shaka 对 iOS 提供同一层顶级 API，但很多时候只是把 HLS URL 交给浏览器原生播放器，MSE/EME 能力不能按桌面 Chrome 想象。

4. **DRM 配置错时错误很绕**：许可证 URL、key system、robustness、header、cookie 任一处错，都可能表现成 `LICENSE_REQUEST_FAILED`；要用 debug bundle 和错误码查根因。

5. **离线 DRM 受平台限制**：离线视频可以存，但持久许可证不是每个平台都支持；有些配置能离线存内容，却播放时仍要联网拿许可证。

## 适用 vs 不适用场景

**适用**：

- Web 点播 / 直播播放器，需要 DASH 或 HLS 自适应码率
- 有 DRM 的商业视频站，必须同时面对 Widevine、PlayReady、FairPlay
- 需要字幕、多音轨、缩略图、广告、Chromecast 或智能电视兼容的复杂播放链路
- 想自己控制 UI 和业务逻辑，只需要底层播放引擎可靠工作

**不适用**：

- 只播放一个无加密 MP4 文件，原生 `<video>` 已经足够
- 需要服务端转码、打包、切片、发 CDN；这些属于媒体后端，不是 Shaka 的职责
- 主要做实时音视频通话，应该看 [[webrtc-rs]] / WebRTC 生态，而不是 DASH/HLS 播放器
- 想要开箱即用的皮肤和 CMS 工作台，[[video-js]] 这类播放器框架可能更省事

## 历史小故事（可跳过）

- **2014 Q4**：v1.0 支持 DASH VOD、VTT 字幕和 Widevine，目标是用开放 Web 标准替代插件式播放
- **2015 年**：加入 DASH live、离线播放、统一配置、PlayReady 和 Chromecast，开始从 demo 走向真实设备
- **2017 年**：v2.1 支持 HLS VOD 和异步网络过滤器，说明它不再只是 DASH 播放器
- **2019 年**：v2.5 加入官方 UI、FairPlay 与 iOS 支持，覆盖 Safari 这条最难路线
- **2021-2024 年**：低延迟直播、缩略图、内容 steering、内置 transmuxer、HLS interstitials 陆续进入主线
- **2026 年**：v5.1 发布，继续补 DASH JSON manifest、ABR 掉帧监控和 TiVo OS / Titan OS 等平台支持

## 学到什么

1. **流媒体播放的本体是调度，不是解码**：真正难的是在网络、码率、缓存、DRM、浏览器能力之间持续做选择。
2. **开放标准替代插件，但不会消灭复杂度**：MSE/EME 让浏览器能做专业播放，同时把 CORS、HTTPS、license server 暴露给前端工程师。
3. **一个播放器库也要懂平台差异**：桌面 Chrome、iOS Safari、Tizen TV、Chromecast 的能力边界不一样，统一 API 背后是大量分支。
4. **离线播放不是下载文件**：可播放资产由 manifest、分片、字幕、metadata、许可证共同组成，少一个环节都会坏。

## 延伸阅读

- 官方文档：[Shaka Player Basic Usage](https://shaka-player-demo.appspot.com/docs/api/tutorial-basic-usage.html) —— 最小播放闭环
- 官方文档：[DRM Configuration](https://shaka-player-demo.appspot.com/docs/api/tutorial-drm-config.html) —— Widevine / PlayReady / FairPlay 的入口
- 官方文档：[Offline Playback](https://shaka-player-demo.appspot.com/docs/api/tutorial-offline.html) —— IndexedDB 离线存储流程
- 官方文档：[Networking and Buffering Configuration](https://shaka-player-demo.appspot.com/docs/api/tutorial-network-and-buffering-config.html) —— 重试、buffer 和 CORS 坑
- [[hls.js]] —— 只专注 HLS 的 Web 播放库，对比 Shaka 的多协议路线
- [[dash.js]] —— DASH 官方参考播放器，对比 Shaka 的工程化和 DRM 覆盖

## 关联

- [[hls.js]] —— HLS 专用播放器，能帮助理解 Shaka 为什么要同时兼容 HLS 与 DASH
- [[dash.js]] —— DASH 参考实现，和 Shaka 的 manifest / MSE 播放链路最接近
- [[video-js]] —— 更偏播放器框架和 UI 生态，Shaka 更偏底层流媒体引擎
- [[ffmpeg]] —— 服务端转码和切片常用工具，负责生产 Shaka 要消费的媒体分片
- [[ovenmediaengine]] —— 直播流媒体服务器，和 Shaka 处在“生产流”和“播放流”的两端
- [[webrtc-rs]] —— 实时通话协议栈，对比 DASH/HLS 的高延迟但更适合大规模分发
- [[lottie]] —— 也是播放器，但播放的是设计动画 JSON；对比能看出“播放器”这个词的范围很宽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
