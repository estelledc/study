---
title: Shaka Packager — 流媒体打包工具
来源: 'https://github.com/shaka-project/shaka-packager'
日期: 2026-05-29
分类: media
难度: 中级
---

## 是什么

Shaka Packager 是一个**把已编码视频整理成 DASH / HLS 分片，并按需要加 DRM 的命令行工具和 SDK**。日常类比：摄影师已经拍好整场婚礼视频，Shaka Packager 像后厨分餐员，把一大锅菜分成小份、贴菜单、再给贵宾餐盒上锁。

最小例子长这样：

```bash
packager input=movie.mp4 --dump_stream_info
```

这一行不会转码，只是看清 `movie.mp4` 里有什么：几路视频、几路音频、编码格式、时长、分辨率。真正打包时，它会把输入流拆成 init segment、media segment、manifest，再交给 CDN 和播放器。

它不是 [[ffmpeg]] 那种通用转码器，也不是 [[shaka-player]] 那种浏览器播放器。它站在媒体后端中间：上游通常是编码器，下游通常是 CDN、DASH/HLS 播放器和 DRM 许可证服务。

## 为什么重要

不理解 Shaka Packager，下面这些事都不好解释：

- 为什么 OTT 后端不能只把一个大 MP4 扔给用户，而要生成 `.mpd`、`.m3u8` 和一堆小分片
- 为什么同一部片要同时准备 DASH 和 HLS，因为浏览器、电视、手机生态吃的“菜单格式”不一样
- 为什么 DRM 不只是“给文件加密”，还要在 manifest、PSSH、key id、license server 之间对齐
- 为什么直播链路里 manifest 必须等分片写完再更新，否则播放器会看到菜单却拿不到菜

## 核心要点

Shaka Packager 的核心可以拆成 **三件事**：

1. **拆流和分片**：输入是已经编码好的音频、视频、字幕，输出是一段段可缓存的小文件。类比：不是重新做饭，而是把做好的饭按盒分装，方便外卖员一盒一盒送。

2. **生成播放菜单**：DASH 的 `.mpd` 和 HLS 的 `.m3u8` 告诉播放器每个清晰度、语言、字幕和分片地址在哪里。类比：菜单不等于菜，但没有菜单，客人不知道下一口该点哪盘。

3. **接入加密和多 DRM**：它可以从 Widevine / PlayReady key server 取钥匙，也可以直接用 raw key。类比：同一批餐盒可以贴不同门禁标签，让 Chrome、Edge、Safari 各走自己能识别的验票口。

这三件事合起来，就是“可大规模分发的视频资产”。播放器看到的不是一个文件，而是一套被组织好的目录、清单和权限信息。

## 实践案例

### 案例 1：把多档 H264 打成 DASH 点播

官方 DASH 教程给的是多档 H264 VOD 包装命令；下面保留音频和两档视频，看字段会更清楚：

```bash
packager \
  in=h264_baseline_360p_600.mp4,stream=audio,output=audio.mp4 \
  in=h264_baseline_360p_600.mp4,stream=video,output=h264_360p.mp4 \
  in=h264_main_720p_3000.mp4,stream=video,output=h264_720p.mp4 \
  --mpd_output h264.mpd
```

**逐部分解释**：

- `stream=audio` 和 `stream=video` 告诉它从同一个 MP4 里抽哪一路
- `output=...mp4` 生成单轨 fragmented MP4，便于 DASH 播放器按轨道取
- `--mpd_output h264.mpd` 生成 DASH manifest，播放器先读它再决定拉哪一路
- 这个案例来自官方 DASH tutorial；完整示例还包括字幕和 480p / 1080p 档位

### 案例 2：一次产出 DASH 和 HLS 两套菜单

官方 HLS / DASH 文档都说明：MP4 输出时可以同时写 DASH 和 HLS manifest。实际后端常用这一招减少重复打包：

```bash
packager \
  in=h264_baseline_360p_600.mp4,stream=audio,output=audio.mp4,playlist_name=audio.m3u8,hls_group_id=audio,hls_name=ENGLISH \
  in=h264_baseline_360p_600.mp4,stream=video,output=h264_360p.mp4,playlist_name=h264_360p.m3u8 \
  in=h264_main_720p_3000.mp4,stream=video,output=h264_720p.mp4,playlist_name=h264_720p.m3u8 \
  --hls_master_playlist_output h264_master.m3u8 \
  --mpd_output h264.mpd
```

**逐部分解释**：

- `playlist_name` 是每一路 HLS media playlist 的文件名
- `hls_group_id` 和 `hls_name` 把音频轨道标成一组，方便播放器选择语言
- `--hls_master_playlist_output` 生成 HLS 总菜单，`--mpd_output` 生成 DASH 总菜单
- 这样同一组分片能服务不同客户端：Safari 偏 HLS，很多 Web / TV 播放器也能吃 DASH

### 案例 3：用 raw key 做加密并声明多 DRM

官方 Raw Key 教程给了测试 key id 和 key；下面示例展示“同一内容，音频、SD、HD 用不同 key label”：

```bash
packager \
  in=h264_baseline_360p_600.mp4,stream=audio,output=audio.mp4,drm_label=AUDIO \
  in=h264_baseline_360p_600.mp4,stream=video,output=h264_360p.mp4,drm_label=SD \
  in=h264_main_720p_3000.mp4,stream=video,output=h264_720p.mp4,drm_label=HD \
  --enable_raw_key_encryption \
  --keys label=AUDIO:key_id=f3c5e0361e6654b28f8049c778b23946:key=a4631a153a443df9eed0593043db7519,label=SD:key_id=abba271e8bcf552bbd2e86a434a9a5d9:key=69eaa802a6763af979e8d1940fb88392,label=HD:key_id=6d76f25cb17f5e16b8eaef6bbf582d8e:key=cb541084c99731aef4fff74500c12ead \
  --protection_systems Widevine,PlayReady \
  --mpd_output h264.mpd
```

**逐部分解释**：

- `drm_label` 是“这一路流该用哪把钥匙”的标签，大小写要和 `--keys` 里一致
- `--enable_raw_key_encryption` 表示钥匙由命令行提供，不去 key server 拉
- `--protection_systems Widevine,PlayReady` 会在输出里写出对应保护系统信息
- 这适合本地测试或自管 key 的系统；生产环境还要配许可证服务和播放器 DRM 配置

## 踩过的坑

1. **把 Packager 当转码器用会失望**：它主要重封装、切片、加密，输入编码质量和码率阶梯要先由编码器准备好。

2. **manifest 不是装饰文件**：`.mpd` / `.m3u8` 写错路径或语言标签，分片都在也会播不起来，因为播放器先信菜单。

3. **`$Number$` 要防 shell 提前展开**：在 zsh / bash 里 segment template 常要用单引号包住，否则 `$Number$` 可能被当成环境变量。

4. **DRM 标签大小写很敏感**：`drm_label=HD` 和 `label=hd` 匹配不上，最后可能表现成某一路无法解密。

## 适用 vs 不适用

**适用**：

- OTT / 点播后端：把多档 MP4 产物变成 DASH / HLS 可分发资产
- 直播打包：从 UDP 或 FFmpeg pipe 接入输入，持续生成分片和更新 manifest
- 商业视频加密：接 Widevine、PlayReady、FairPlay 或 raw key 工作流
- 需要同一份媒体同时服务 Web、移动端、电视端的团队

**不适用**：

- 还没编码出 H264 / H265 / AV1 等输入文件；这一步应先看 [[ffmpeg]]、[[x264]]、[[x265]]
- 只想播放本地 MP4，原生播放器或 [[video.js]] 已经足够
- 做 WebRTC 级别的实时互动，DASH/HLS 的分片模型天然有更高延迟
- 想要一个 CMS、上传后台或 CDN 平台；Shaka Packager 只处理媒体打包这一段

## 历史小故事（可跳过）

- **2014 年前后**：Shaka 生态开始围绕开放 Web 流媒体标准建设，播放器和打包工具各管一段链路
- **早期目标**：让 DASH 内容能被稳定准备出来，减少每家公司重复写打包器的成本
- **HLS 支持加入后**：它不再只是 DASH 工具，而是更接近“多协议 OTT 打包器”
- **DRM 扩展阶段**：Widevine、PlayReady、FairPlay、raw key 等能力逐步补齐，适合商业视频链路
- **今天**：它仍保持命令行工具定位，常和编码器、对象存储、CDN、[[shaka-player]] 一起出现

## 学到什么

1. **流媒体后端的关键产物不是一个视频文件，而是一套可寻址的分片和清单**。
2. **打包和转码要分清**：转码决定画质和码率，打包决定播放器怎么找到、切换和解密。
3. **DASH / HLS 的共同点大于差异**：它们都把长视频拆成小片，只是菜单格式和生态偏好不同。
4. **DRM 是端到端约定**：Packager 写入加密信息，播放器和许可证服务必须读懂同一套 key / system / policy。

## 延伸阅读

- 官方 README：[Shaka Packager](https://github.com/shaka-project/shaka-packager) —— 支持格式、平台和文档入口
- 官方教程：[Basic Usage](https://shaka-project.github.io/shaka-packager/html/tutorials/basic_usage.html) —— 先学 dump stream 和拆音视频
- 官方教程：[DASH](https://shaka-project.github.io/shaka-packager/html/tutorials/dash.html) —— 点播、static-live、DASH + HLS 示例
- 官方教程：[HLS](https://shaka-project.github.io/shaka-packager/html/tutorials/hls.html) —— master playlist、media playlist 和 HLS 字段
- 官方教程：[Raw Key](https://shaka-project.github.io/shaka-packager/html/tutorials/raw_key.html) —— raw key、PSSH、多 DRM 示例
- [[shaka-player]] —— 下游播放器，能直接消费 Shaka Packager 生成的 manifest 和分片

## 关联

- [[shaka-player]] —— Packager 生产 DASH/HLS 资产，Player 在浏览器里把它播出来
- [[dash]] —— DASH 是 Packager 最核心的输出协议之一，`.mpd` 就是它的菜单
- [[ffmpeg]] —— 常负责上游编码和转封装，Packager 接手切片、manifest 和 DRM
- [[video.js]] —— 更偏播放器框架，对比能看出“打包工具”和“播放 UI”的边界
- [[x264]] —— H264 编码器，常先产出多档码率文件再交给 Packager
- [[x265]] —— H265/HEVC 编码器，适合更高清的 OTT 码率阶梯
- [[svt-av1]] —— AV1 编码器，和 Packager 共同服务新一代流媒体工作流

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
