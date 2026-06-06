---
title: hls.js — 浏览器里播放 HLS 直播
来源: 'https://github.com/video-dev/hls.js'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
---

## 是什么

**hls.js** 是一个 JavaScript 库：在支持 MSE（Media Source Extensions）的浏览器里，把 **HLS（m3u8）** 流转成 `<video>` 能吃的 MP4 片段。

日常类比：Safari 自带「HLS 翻译器」，Chrome 默认没有。hls.js 像**外挂字幕组**——把 m3u8 清单和 ts/fmp4 分片实时翻译，喂给 HTML5 视频标签。

最小 HTML：

```html
<video id="video" controls></video>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
<script>
  const video = document.getElementById('video');
  const src = 'https://example.com/live/index.m3u8';
  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(src);
    hls.attachMedia(video);
  }
</script>
```

## 为什么重要

不理解 hls.js，Web 直播前端会断档：

- **Chrome / Firefox 不原生播 m3u8**：苹果推 HLS，其他浏览器要靠 MSE 方案
- **自适应码率是 HLS 核心**：`#EXT-X-STREAM-INF` 多档位切换，hls.js 内置 ABR 逻辑
- **与 [[video.js]]、[[shaka-player]] 常组合**：前者做 UI，后者也可播 HLS，hls.js 更轻、更专
- **读源码能学透 m3u8 标签**：比只看 RFC 更贴近工程

## 核心要点

1. **Transmux**：把 MPEG-2 TS 或 AAC 流转封装成 fMP4，再 append 到 SourceBuffer。重活在 Web Worker 里跑，减轻主线程卡顿。

2. **三级清单**：Master（多码率）→ Media（分片列表）→ 分片 URL。库负责轮询 live playlist 更新。

3. **ABR 三种切换模式**：即时切、平滑切、保守切（少 flush buffer）。直播卡顿时常调 `capLevelToPlayerSize` 限制分辨率。

4. **容错与重试**：网络抖动时自动重拉分片；`hls.on(Hls.Events.ERROR, ...)` 可区分致命/可恢复错误。

5. **DRM / AES-128**：支持 SAMPLE-AES 与 EME，企业点播常配合 [[shaka-player]] 对照学习。

## 实践案例

### 案例 1：监听缓冲与码率切换

```javascript
hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
  console.log('当前档位 level', data.level);
});
hls.on(Hls.Events.BUFFER_APPENDED, () => {
  console.log('缓冲追加', video.buffered.end(0));
});
```

调试直播卡顿时，先看是否频繁降档或 buffer 追不上。

### 案例 2：低延迟 LIVE 配置

```javascript
const hls = new Hls({
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 10,
});
```

缩短追直播窗口；代价是更易 rebuffer，需与 CDN 分片时长匹配。

### 案例 3：与 [[video.js]] 插件集成

```javascript
import videojs from 'video.js';
import 'videojs-contrib-hls'; // 旧栈；新项目可直接 videojs + hls.js 手动 attach
```

许多站点仍用 hls.js 独立挂载，video.js 只负责皮肤与控件。

### 案例 4：本地 dev 用 ll-hls 测试

用 Apple 示例或自建 [[nginx-rtmp-module]] HLS 输出，浏览器开 `file://` 会 CORS 失败，需本地静态服务器。

## 踩过的坑

1. **Safari 原生 HLS 不必加载 hls.js**：`video.src = m3u8` 即可，重复挂载浪费 CPU。

2. **CORS 响应头**：分片服务器必须允许跨域，否则 MSE append 失败。

3. **混合容器**：同一流 TS 与 fMP4 混用需确认 hls.js 版本与 codec 支持表。

4. **自动播放策略**：移动端需 `muted` + `playsinline` 才能 autoplay。

5. **内存与旧 tab**：长时间直播不 destroy `Hls` 实例会泄漏 SourceBuffer。

6. **低延迟 HLS 参数与 CDN 不一致**：服务器仍是 6s 分片时，客户端调再激进也难亚秒级。

## 适用 vs 不适用场景

**适用**：
- Web 端播放 HLS 直播/点播
- 学习 m3u8、ABR、MSE 管线
- 需要细粒度事件与错误恢复钩子

**不适用**：
- 仅面向 Safari 且可接受原生 HLS（可不用库）
- 需要完整 DRM 方案（常选 [[shaka-player]]）
- 原生 App（应用系统播放器或 [[ffmpeg]]）

## 历史小故事（可跳过）

- **2015 前后**：video-dev 社区维护，填补非 Safari 的 HLS 空白
- **2016**：支持 fmp4 HLS（WWDC 路线），与苹果生态对齐
- **持续迭代**：低延迟 HLS、CMCD、多音轨与字幕标签随规范扩展
- **生态**：npm 周下载百万级，与 [[dash.js]] 并列流媒体前端双壁

## 学到什么

1. **浏览器播 HLS = 清单解析 + 转封装 + MSE**，不是简单改 `video.src`
2. **ABR 是播放器灵魂**：档位切换策略决定观感与带宽
3. **Worker transmux 是性能关键**：主线程只做控制面
4. **与 [[streamlink]] 对照**：一个管「网页→流 URL」，一个管「m3u8→像素」
5. **错误事件分级处理**：fatal 才需重建实例，network 可重试

## 延伸阅读

- [hls.js API 文档](https://github.com/video-dev/hls.js/tree/master/docs)
- [Apple HLS 规范草案](https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis)
- [[dash.js]] —— DASH 侧参考实现
- [[video.js]] —— UI 层集成
- [[shaka-player]] —— Google 双协议播放器

## 关联

- [[dash.js]] —— 另一自适应协议
- [[video.js]] —— 播放器 UI 框架
- [[shaka-player]] —— 企业级替代
- [[streamlink]] —— 提取 m3u8 源
- [[nginx-rtmp-module]] —— 自建 HLS 输出
- [[ffmpeg]] —— 生成 HLS 分片
- [[obs-studio]] —— 推流上游

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

