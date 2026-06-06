---
title: Shaka Packager — 流媒体打包工具
description: DASH/HLS 打包工具，切片 mp4 并加 DRM
来源: 'https://github.com/shaka-project/shaka-packager'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Shaka Packager** DASH/HLS 打包工具，切片 mp4 并加 DRM。

日常类比：像把长电影剪成带索引的小段，播放器按网速换清晰度。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学 CMAF/fMP4 分片
- DRM 密钥轮换概念
- 对照 [[dash-js]] 播放端
- OTT 后端标准工具

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

Shaka Packager 的处理流程围绕**解复用（Demux）→ 加密 → 复用（Mux）→ Manifest 生成**展开：

**解复用层**：
- 读入 MP4、WebM、MPEG-TS、ADTS（AAC）、WebVTT 等格式
- 分离音频、视频、字幕轨道为独立访问单元（Access Unit）
- 解析 SPS/PPS 参数集，提取编解码信息供后续封装使用

**加密层（DRM 集成）**：
- **Widevine**：调用 Google Widevine Key Server API 生成内容加密密钥（CEK）和许可证请求；支持 CENC（Common Encryption）和 CBCS 加密方案
- **PlayReady**：生成 PlayReady PSSH（Protection System Specific Header）box，兼容 Microsoft 许可证服务器
- **FairPlay**：生成 HLS 加密分片（AES-128 / SAMPLE-AES），对接 Apple FPS Key Server
- **离线密钥模式**：可传入原始 key/key_id 对，无需连接外部 Key Server，适合测试场景

**复用层**：
- 输出 fMP4（Fragmented MP4）或 WebM 分片，每个分片包含完整的 initialization segment + media segment
- 支持 **CMAF（Common Media Application Format）** 打包，实现 DASH 与 HLS 共用同一份分片

**Manifest 生成**：
- **MPEG-DASH**：生成 `.mpd` 文件，含 AdaptationSet（视频/音频/字幕）、Representation（不同码率）、SegmentTemplate 等元素
- **HLS**：生成 master `.m3u8` 和逐轨 media `.m3u8`，包含 `#EXT-X-KEY` 加密标签

**自适应码率（ABR）工作流**：Shaka Packager 本身不做转码，通常与 FFmpeg 配合：先用 FFmpeg 生成多路不同分辨率/码率的编码流，再用 Shaka Packager 统一打包为 DASH+HLS。

## 性能与规格

- **打包速度**：纯 I/O 密集型，通常以 5~20× 实时速度处理（即 1 分钟视频约需 3~12 秒，无 DRM）；加 Widevine 远程密钥请求会增加 1~2 秒网络延迟
- **支持容器格式**：MP4/fMP4、WebM、MPEG-TS、ADTS、WebVTT
- **支持编解码**：H.264、H.265/HEVC、VP8、VP9、AV1、AAC、AC-3、EC-3、Opus、FLAC

## CLI 打包示例

```bash
# 基本 DASH 打包（本地密钥，无 DRM）
packager \
  in=input_720p.mp4,stream=video,output=video_720p.mp4 \
  in=input_720p.mp4,stream=audio,output=audio.mp4 \
  --mpd_output dash.mpd

# 多码率 DASH + HLS 同时输出
packager \
  in=video_360p.mp4,stream=video,output=v360.mp4 \
  in=video_720p.mp4,stream=video,output=v720.mp4 \
  in=audio.mp4,stream=audio,output=audio.mp4 \
  --mpd_output manifest.mpd \
  --hls_master_playlist_output master.m3u8

# 加 Widevine DRM 打包
packager \
  in=input.mp4,stream=video,output=video_enc.mp4 \
  in=input.mp4,stream=audio,output=audio_enc.mp4 \
  --enable_widevine_encryption \
  --key_server_url https://license.widevine.com/cenc/getcontentkey \
  --content_id 6162636465666768696a6b6c6d6e6f70 \
  --signer my_signer --signing_key ... --signing_iv ... \
  --mpd_output encrypted.mpd
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd shaka-packager
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[dash-js]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。
6. **PSSH 格式不匹配**：Widevine 和 PlayReady PSSH 需同时生成并写入 MPD，遗漏任何一个都会导致特定平台播放器报 DRM 初始化失败。
7. **分片对齐**：音视频分片 GOP 不对齐会导致 Seeking 时播放器在切换码率时出现音画不同步，打包前需确保各分辨率流使用相同 GOP 结构（FFmpeg `-g` 和 `-force_key_frames` 参数）。

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

- 官方仓库：https://github.com/shaka-project/shaka-packager
- [[dash-js]]
- [[hls-js]]
- [[shaka-player]]
- [[ffmpeg]]

## 关联

- [[dash-js]] —— 同专题对照阅读
- [[hls-js]] —— 同专题对照阅读
- [[shaka-player]] —— 同专题对照阅读
- [[ffmpeg]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[shaka-player]] —— Shaka Player — Google 自适应流媒体播放器

