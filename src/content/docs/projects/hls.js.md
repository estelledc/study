---
title: hls.js — 浏览器里的 HLS 播放库
来源: 'https://github.com/video-dev/hls.js'
日期: 2026-07-08
分类: media
难度: 中级
---

## 是什么

hls.js 是一个在网页里播放 **HLS**（HTTP Live Streaming）的 JavaScript 库。日常类比：普通 `<video src="a.mp4">` 像把一整部电影拷进播放器；HLS 像连载漫画——先读目录（`.m3u8` 播放列表），再按页（分片）下载，网速差就先看清晰度低的一版。

Safari 往往能直接播 `.m3u8`；Chrome / Firefox 等多数桌面浏览器不行。hls.js 的做法是：自己拉播放列表和分片，必要时把 MPEG-TS **转封装**成浏览器吃得下的 fMP4，再通过 **MSE**（Media Source Extensions，给 `<video>` 持续喂数据的接口）塞进去。

它工作在标准 HTML `<video>` 之上，不是转码服务器，也不是完整「视频网站后台」。一句话：**让不原生支持 HLS 的浏览器，也能播 `.m3u8` 点播和直播。**

## 为什么重要

不理解 hls.js，下面这些事很难解释：

- 为什么同一条 HLS 地址在 iPhone Safari 能播、在桌面 Chrome 却要挂一个 JS 库
- 为什么卡顿时「降码率」发生在播放器里，而不只是 CDN 的事
- 为什么直播延迟 3 秒还是 30 秒，和分片长度、缓冲策略、LL-HLS 都有关
- 为什么 [[video.js]] / 自研播放器常常内嵌或对接 hls.js，而不是从零解析 m3u8

## 核心要点

压缩成三件事：

1. **播放列表是菜单**：主列表列出多种码率/分辨率；媒体列表列出分片 URL。类比：餐厅菜单写套餐，后厨按桌出菜。

2. **MSE 是上菜口**：hls.js 下载分片 →（TS 则 transmux）→ `SourceBuffer.append`。类比：分批出菜放到传送带，客人看到连续一餐。

3. **ABR 是调度员**：根据带宽与缓冲选下一分片清晰度；弱网紧急降级。类比：导航不看最高限速，还看拥堵和油量。

官方还强调：可用 Web Worker 做异步 transmux；支持 fMP4、AES、EME DRM、字幕音轨等——学习时先抓住上面三条主线。

## 实践案例

### 案例 1：网页里播一条公开 HLS

```html
<video id="v" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script>
  const src = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
  const video = document.getElementById('v')
  if (Hls.isSupported()) {
    const hls = new Hls()
    hls.loadSource(src)
    hls.attachMedia(video)
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = src // Safari 原生 HLS
  }
</script>
```

**逐部分解释**：

- `Hls.isSupported()` 检查 MSE 路径是否可用（多数 Chromium / Firefox）
- `loadSource` + `attachMedia` 把播放列表接到 `<video>`
- `else if canPlayType(...)` 走 Safari 原生，避免双栈抢播放器

### 案例 2：监听错误并尝试恢复

```js
hls.on(Hls.Events.ERROR, (_, data) => {
  if (!data.fatal) return
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad()
  else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
  else hls.destroy()
})
```

**逐部分解释**：

- 非 fatal 错误常可忽略或只打日志
- 网络 fatal → `startLoad()` 重新拉分片
- 媒体 fatal → `recoverMediaError()`；再不行就 `destroy()`，避免僵尸实例

### 案例 3：手动锁码率做对比

```js
hls.on(Hls.Events.MANIFEST_PARSED, () => {
  console.log(hls.levels.map(l => [l.height, l.bitrate]))
  hls.currentLevel = 0 // 锁最低档；-1 回到自动 ABR
})
```

**逐部分解释**：

- `levels` 是解析主播放列表后的码率档
- `currentLevel = 0` 强制最低清，方便弱网复现
- 设回 `-1` 把选择权还给内置 ABR

## 踩过的坑

1. **忘了 CORS**：分片与 m3u8 必须允许网页域读取，否则 MSE 路径直接挂。
2. **Safari 双挂**：原生已能播又 `new Hls()`，容易重复缓冲；先分支检测。
3. **Codec 不支持**：清单里写了浏览器解不了的编码，表现为黑屏/立刻 MEDIA_ERROR。
4. **直播追边缘过猛**：缓冲太小 → 频繁卡顿；太大 → 延迟变差。要按业务定秒数。
5. **销毁不彻底**：路由离开页面不 `hls.destroy()`，隐藏的下载与 Worker 还在跑。

## 适用 vs 不适用

**适用**：

- 桌面 Chrome/Firefox 等需播 HLS 点播或直播
- 已有 CDN 输出 `.m3u8`，前端要统一播放体验
- 需要可观察的 ABR / 错误事件做监控

**不适用**：

- 仅 iOS Safari 且原生 HLS 已够用——可少引入一坨 JS
- 源是 DASH（`.mpd`）——应看 [[dash.js]]，不是改后缀
- 需要服务端转码/打包——那是 ffmpeg / 打包器的事，不是 hls.js

## 历史小故事（可跳过）

- **2012 前后**：Apple 推 HLS；移动 Safari 原生友好，桌面 Chrome 长期缺口。
- **社区库兴起**：在 MSE 普及后，用 JS 补齐「非 Safari 播 HLS」成为刚需。
- **video-dev/hls.js**：成为最常见的开源实现之一，持续跟 HLS 草案标签与 LL-HLS。
- **今天**：许多播放器壳（含 [[video.js]] 生态）把「HLS 能力」接到 hls.js 或同类库上。

## 学到什么

1. **协议与引擎要分开**：HLS 是分发格式；hls.js 是浏览器侧客户端。
2. **MSE 是关键桥**：没有它，JS 很难把分片「喂」给 `<video>`。
3. **ABR 是产品体验**：同一清单，调度策略决定卡顿与清晰度摆动。
4. **原生优先分支**：能走 Safari 原生就别硬上 MSE，少一层故障面。

## 延伸阅读

- 仓库：[video-dev/hls.js](https://github.com/video-dev/hls.js)
- 文档：[hls.js API](https://github.com/video-dev/hls.js/blob/master/docs/API.md)
- HLS 草案：[RFC 8216 系](https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis)
- [[dash.js]] —— DASH 对照实现
- [[video.js]] —— 播放器壳，常对接 HLS/DASH
- [[ffmpeg]] —— 打包/转封装常在服务端配合 HLS

## 关联

- [[dash.js]] —— 另一条自适应流（DASH）的 Web 参考实现
- [[video.js]] —— UI/插件壳，底下可接 hls.js
- [[ffmpeg]] —— 生成 m3u8/分片的常见工具链
- [[mediasoup]] —— 实时 SFU，问题域是 WebRTC 不是 HLS VOD
- [[jitsi-videobridge]] —— 会议媒体转发，对照「直播协议选型」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
