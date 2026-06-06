---
title: Shaka Player — Google 自适应流媒体播放器
来源: 'https://github.com/shaka-project/shaka-player'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
---

## 是什么

**Shaka Player** 是 Google 开源的 JavaScript **自适应流媒体播放器**：在浏览器用 MSE + EME 播放 **DASH 与 HLS**，支持 DRM、离线缓存与广告插入。

日常类比：[[hls.js]] 像专业 HLS 译员，[[dash.js]] 像 DASH 朗读者。Shaka 像**带保险柜的同声传译包厢**——双协议、加密片源、离线带走都能管。

```html
<video id="video" width="640" controls autoplay></video>
<script src="https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.3.0/shaka-player.compiled.js"></script>
<script>
  async function init() {
    shaka.polyfill.installAll();
    const video = document.getElementById('video');
    const player = new shaka.Player();
    await player.attach(video);
    await player.load('https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd');
  }
  init();
</script>
```

## 为什么重要

不理解 Shaka，企业级 Web 点播会少默认选项：

- **双协议 + DRM 矩阵文档齐全**：Widevine / PlayReady / FairPlay 组合表可直接对照
- **离线播放**：IndexedDB 存 manifest 与分片，PWA 离线课场景常用
- **与 [[video.js]] 可集成**：也有带 UI 的 `shaka-player.ui.js` 构建
- **Google 长期维护**：Chromecast、TV 平台适配经验沉淀在 issue 与 roadmap

## 核心要点

1. **Manifest 解析插件化**：除 DASH/HLS 外可写自定义 parser，适合内部私有格式。

2. **ABR 与清晰度策略**：`configure` 里限制分辨率、码率、HDCP level，防止弱机硬扛 4K。

3. **Transmuxer 内置**：TS → fMP4 与 [[hls.js]] 类似，减少第三方依赖。

4. **广告与插播**：IMA SDK、HLS interstitials、DASH MPD 插入点，商业化站点关心。

5. **平台兼容表**：维护 Chrome / Safari / TV 浏览器矩阵，iOS 常走原生 HLS 路径。

6. **Google Hosted Libraries**：可 CDN 引 shaka，但生产建议锁版本 hash。

## 实践案例

### 案例 1：配置 DRM（Widevine）

```javascript
player.configure({
  drm: {
    servers: { 'com.widevine.alpha': 'https://license.example.com/wv' }
  }
});
```

需合法 license server；ClearKey 仅适合调试。

### 案例 2：离线存储

```javascript
const storage = new shaka.offline.Storage(player);
const ids = await storage.list();
await storage.store('https://example.com/manifest.mpd').progress((p) => console.log(p));
```

适合培训视频「下载后飞机上再看」。

### 案例 3：与 [[dash.js]] 对比同一 MPD

Shaka 错误信息常更面向应用层；dash.js 更贴 DASH-IF 标准细节，二者交叉验证 MPD 问题。

### 案例 4：限制自动清晰度

```javascript
player.configure({ abr: { restrictions: { maxHeight: 720 } } });
```

移动端省流量或避免 4K 解码发热。

## 踩过的坑

1. **FairPlay 在 Safari 的 native HLS 路径**：配置 `useNativeHlsForFairPlay` 行为与 Chrome 不同。

2. **非官方 Chrome 无 Widevine**：Chromium 自编译版缺 CDM，DRM 播不了。

3. **bundle 体积**：完整 UI 构建较大，按需选 `compiled` / `dash` / `hls` 分包。

4. **许可证服务器 CORS**：license 请求失败时画面黑屏但 network 面板才有线索。

5. **iOS 低版本无 MSE**：只能原生 HLS，功能降级要产品接受。

6. **离线存储配额**：IndexedDB 被浏览器清缓存策略影响，勿当永久归档。

## 适用 vs 不适用场景

**适用**：
- 需要 DASH + HLS 统一播放器
- DRM 点播 / 直播
- 离线缓存与 TV / Chromecast 部署

**不适用**：
- 只要极简 HLS（[[hls.js]] 更轻）
- 服务端转码（用 [[ffmpeg]]）
- 纯 WebRTC 会议（看 [[mediasoup]] / [[pion]]）

## 历史小故事（可跳过）

- **Google 开源**：填补浏览器端 DRM 自适应播放空白
- **与 DASH-IF、HLS 规范同步迭代**：低延迟、CMCD、Interstitials 随标准更新
- **shaka-player 更名独立基金会**：社区治理从单一团队扩展
- **常被与 [[video.js]]、React 封装项目一起出现**

## 学到什么

1. **企业播放器 = 协议 + DRM + 离线 + 广告**，Shaka 一次打包
2. **读平台矩阵比读 API 更重要**：Safari 与 Chrome 路径分叉
3. **与 [[dash.js]]/[[hls.js]] 三角对照**最快建立流媒体全局观
4. **configure 是核心**：多数行为非构造参数而在运行时配置
5. **错误类型分 stream 与 drm**：排障先分类

## 延伸阅读

- [Shaka 教程](https://shaka-project.github.io/shaka-player/docs/api/tutorial-welcome.html)
- [Demo 页](https://shaka-project.github.io/shaka-player-demo/)
- [[dash.js]] —— DASH 参考实现
- [[hls.js]] —— HLS 专精库
- [[video.js]] —— UI 集成示例

## 关联

- [[dash.js]] —— DASH 标准侧
- [[hls.js]] —— HLS 专精
- [[video.js]] —— 皮肤与插件
- [[ffmpeg]] —— 打包与转码
- [[nginx-rtmp-module]] —— 源站
- [[streamlink]] —— 公开流提取
- [[obs-studio]] —— 制作端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dash.js]] —— dash.js — 浏览器 MPEG-DASH 参考播放器
- [[dav1d]] —— dav1d — 速度优先的 AV1 解码器
- [[fdk-aac]] —— fdk-aac — Fraunhofer AAC 编解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[hls.js]] —— hls.js — 浏览器里播放 HLS 直播
- [[libvpx]] —— libvpx — VP8/VP9 开源视频编解码
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[shaka-packager]] —— Shaka Packager — 流媒体打包工具
- [[streamlink]] —— Streamlink — 把网页直播流接到本地播放器
- [[svt-av1]] —— SVT-AV1 — 可扩展 AV1 软件编码器
- [[video.js]] —— Video.js — Web 视频播放器框架
- [[x265]] —— x265 — 开源 HEVC/H.265 编码器

