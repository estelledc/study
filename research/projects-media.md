---
已写: 50
待写: 0
title: 项目候选 — 音视频 / 媒体处理 / 多模态基础设施
日期: 2026-05-29
---

# 音视频 / 媒体处理 / 多模态基础设施 项目候选

候选 50 个，按子类分组（视频转码 5 / 视频编解码 5 / 音频编解码 4 / 音频处理 4 / DAW 4 / 流媒体播放 6 / 直播推流 4 / WebRTC 5 / 图像处理 4 / 视觉检测 5 / 媒体服务器 2 / 3D 重建 2）。

study 站此前 `projects-*.md` 媒体类几乎全空。本表只收"读源码学多媒体管线"主线项目：转码 / 编解码 / 流媒体 / 实时通信 / 图像视觉 / 媒体存储与重建。

已过滤 `projects-data-science-ai.md` 已收 7 个：whisper / faster-whisper / silero-vad / coqui-tts / piper / comfyui / stable-diffusion-webui / invokeai / open-sora / fooocus（音频 / TTS / 图像视频生成方向）。本表的 sam2 / mediapipe / dlib / insightface / ultralytics 是图像 / 视频"分析理解"方向，与生成模型互斥。

闭源项目按 study 惯例跳过：Plex / Emby / Agisoft Metashape / Mubert / Talkmix（部分服务无源码）。Stars 量级为 2025-2026 区间近似值，仅作影响力参考。

## 总览

- **总数**：50 个
- **挑选维度**：视频转码与编辑 / 视频编解码器 / 音频编解码器 / 音频分析与生产 / 流媒体播放与直播 / 实时通信 / 图像处理与视觉 / 媒体服务器 / 三维重建
- **GitHub-first**：编解码器若主仓在 GitLab / VideoLAN（如 dav1d / svt-av1 / x264 / x265），优先列 GitHub 镜像方便阅读

### 子类分布

| 子类 | 数量 |
|---|---:|
| [1. 视频转码 / 编辑核心](#1-视频转码--编辑核心) | 5 |
| [2. 视频编码 / 解码器库](#2-视频编码--解码器库) | 5 |
| [3. 音频编解码器](#3-音频编解码器) | 4 |
| [4. 音频处理 / 分析](#4-音频处理--分析) | 4 |
| [5. DAW / 音乐生产](#5-daw--音乐生产) | 4 |
| [6. 流媒体 / 网页播放器](#6-流媒体--网页播放器) | 6 |
| [7. 直播 / 推流 / 打包](#7-直播--推流--打包) | 4 |
| [8. WebRTC / 实时通讯](#8-webrtc--实时通讯) | 5 |
| [9. 图像处理](#9-图像处理) | 4 |
| [10. 视觉检测 / 跟踪](#10-视觉检测--跟踪) | 5 |
| [11. 媒体服务器 / 录屏](#11-媒体服务器--录屏) | 2 |
| [12. 3D 扫描 / 重建](#12-3d-扫描--重建) | 2 |

---

## 1. 视频转码 / 编辑核心

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `ffmpeg` | ✓ 已写 | FFmpeg — 多媒体处理瑞士军刀 | ~50k | libavcodec / libavformat / libavfilter 三件套是几乎所有视频工具的底层 | https://github.com/FFmpeg/FFmpeg |
| `handbrake` | ✓ 已写 | HandBrake — GUI 转码器 | ~13k | 在 ffmpeg / x264 上做产品化封装的成熟开源案例 | https://github.com/HandBrake/HandBrake |
| `mlt` | ✓ 已写 | MLT — 多媒体编辑框架 | ~1.6k | Producer + Filter + Consumer 流式抽象，开源 NLE 引擎模板 | https://github.com/mltframework/mlt |
| `shotcut` | ✓ 已写 | Shotcut — 跨平台非线性视频编辑器 | ~12k | 基于 MLT 的 Qt GUI，开源 NLE 教学样本 | https://github.com/mltframework/shotcut |
| `gstreamer` | ✓ 已写 | GStreamer — 流水线式多媒体框架 | ~3k | element / pad / caps 三层模型，GNOME 多媒体栈基石 | https://github.com/GStreamer/gstreamer |

---

## 2. 视频编码 / 解码器库

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `x264` | ✓ 已写 | x264 — H.264/AVC 编码器 | ~1.5k | 开源 H.264 编码事实标准，rate-control 算法教科书 | https://github.com/mirror/x264 |
| `x265` | ✓ 已写 | x265 — HEVC/H.265 编码器 | ~700 | 多核 + SIMD 优化的开源 HEVC 编码实现 | https://github.com/videolan/x265 |
| `libvpx` | ✓ 已写 | libvpx — VP8/VP9 编解码器 | ~1.8k | Google 出品的 WebM 视频核心，YouTube 转码后端 | https://github.com/webmproject/libvpx |
| `dav1d` | ✓ 已写 | dav1d — AV1 解码器 | ~1k | VideoLAN 出品速度优先的 AV1 解码器，asm 优化范例 | https://github.com/videolan/dav1d |
| `svt-av1` | ✓ 已写 | SVT-AV1 — 可扩展 AV1 编码器 | ~900 | Intel 出品多核分块编码，AOMedia 旗舰开源 AV1 编码器 | https://github.com/AOMediaCodec/SVT-AV1 |

---

## 3. 音频编解码器

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `opus` | ✓ 已写 | Opus — 低延迟全频带音频编解码 | ~2k | RFC 6716 标准，WebRTC / 视频会议默认音频 codec | https://github.com/xiph/opus |
| `lame` | ✓ 已写 | LAME — MP3 编码事实标准 | ~600 | 心理声学模型 + 比特率分配的开源参考实现 | https://github.com/rbrito/lame |
| `fdk-aac` | ✓ 已写 | FDK-AAC — Fraunhofer AAC 编解码 | ~600 | HE-AAC v1/v2 高质量实现，Android / 广播底层 | https://github.com/mstorsjo/fdk-aac |
| `flac` | ✓ 已写 | FLAC — 无损音频压缩 | ~1.7k | xiph 出品，无损音频事实标准，封装 + 解码教学清晰 | https://github.com/xiph/flac |

---

## 4. 音频处理 / 分析

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `sox` | ✓ 已写 | SoX — 命令行音频处理瑞士军刀 | ~1.2k | 滤波 / 重采样 / 合成 / 分析一站式 CLI，30 年老牌 | https://github.com/chirlu/sox |
| `aubio` | ✓ 已写 | aubio — 实时音频分析库 | ~3.3k | 节拍 / 起音 / 音高检测 C 库，librosa 算法亲戚 | https://github.com/aubio/aubio |
| `librosa` | ✓ 已写 | librosa — Python 音频分析库 | ~7.6k | MFCC / STFT / chroma 特征提取，MIR 教学事实标准 | https://github.com/librosa/librosa |
| `essentia` | ✓ 已写 | Essentia — 音乐信息检索工具箱 | ~3.1k | UPF MTG 出品，C++/Python 双层 API，节奏 / 调性 / 风格分类 | https://github.com/MTG/essentia |

---

## 5. DAW / 音乐生产

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `audacity` | ✓ 已写 | Audacity — 开源音频编辑器 | ~14k | 多轨 + 效果链 + 插件，开源 DAW 入门首选 | https://github.com/audacity/audacity |
| `ardour` | ✓ 已写 | Ardour — 专业级 DAW | ~2.2k | 实时录音 / 混音 / 母带，C++ 实时音频架构教学经典 | https://github.com/Ardour/ardour |
| `lmms` | ✓ 已写 | LMMS — Linux 多媒体工作站 | ~8k | 节拍 / 钢琴卷帘 / 软合成器一体，业余作曲首选 | https://github.com/LMMS/lmms |
| `supercollider` | ✓ 已写 | SuperCollider — 实时音频合成环境 | ~5.5k | sclang 语言 + scsynth 服务器架构，算法作曲学术基础 | https://github.com/supercollider/supercollider |

---

## 6. 流媒体 / 网页播放器

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `yt-dlp` | ✓ 已写 | yt-dlp — 视频下载工具 | ~92k | youtube-dl 的活跃 fork，extractor 架构覆盖上千站点 | https://github.com/yt-dlp/yt-dlp |
| `streamlink` | ✓ 已写 | Streamlink — 直播流提取器 | ~10.7k | 把直播站流转给本地播放器，HLS / DASH 解析教学 | https://github.com/streamlink/streamlink |
| `hls.js` | ✓ 已写 | hls.js — Web HLS 播放库 | ~15k | 把 m3u8 翻译成 MSE 喂给 video 标签，HLS 工作机制范例 | https://github.com/video-dev/hls.js |
| `dash.js` | ✓ 已写 | dash.js — Web DASH 播放器 | ~5.5k | DASH-IF 官方参考实现，ABR 自适应码率算法学习好材料 | https://github.com/Dash-Industry-Forum/dash.js |
| `video.js` | ✓ 已写 | Video.js — Web 视频播放器框架 | ~38k | HTML5 video 增强 + 插件生态，前端播放器事实参考 | https://github.com/videojs/video.js |
| `shaka-player` | ✓ 已写 | Shaka Player — Google 流媒体播放器 | ~7.3k | DASH / HLS 双协议 + DRM 集成，企业级播放器范本 | https://github.com/shaka-project/shaka-player |

---

## 7. 直播 / 推流 / 打包

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `obs-studio` | ✓ 已写 | OBS Studio — 直播推流软件事实标准 | ~63k | 场景 / 滤镜 / 编码 / 推流四件套，主播首选 | https://github.com/obsproject/obs-studio |
| `nginx-rtmp-module` | ✓ 已写 | nginx-rtmp-module — RTMP 服务器模块 | ~13k | 把 nginx 改成 RTMP / HLS server，自建直播后端学习起点 | https://github.com/arut/nginx-rtmp-module |
| `ant-media-server` | ✓ 已写 | Ant Media Server — WebRTC / CMAF 直播服务 | ~4.4k | 低延迟直播全套（recording / clustering / SDK） | https://github.com/ant-media/Ant-Media-Server |
| `shaka-packager` | ✓ 已写 | Shaka Packager — 流媒体打包工具 | ~3k | 把 mp4 切成 DASH / HLS 分片 + 加 DRM，OTT 后端标准工具 | https://github.com/shaka-project/shaka-packager |

---

## 8. WebRTC / 实时通讯

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mediasoup` | ✓ 已写 | mediasoup — Selective Forwarding Unit | ~7.4k | Node.js + C++，会议 / 直播多对多媒体路由首选 | https://github.com/versatica/mediasoup |
| `janus-gateway` | ✓ 已写 | Janus — 通用 WebRTC 网关 | ~8.6k | 插件式（流 / 视频会议 / 录像），WebRTC 服务端教学经典 | https://github.com/meetecho/janus-gateway |
| `pion` | ✓ 已写 | Pion — Go 实现的 WebRTC 协议栈 | ~15.6k | 纯 Go 协议栈，可读性最强的 WebRTC 学习实现 | https://github.com/pion/webrtc |
| `livekit` | ✓ 已写 | LiveKit — 开源实时多媒体 SFU | ~13.3k | Go 写的 SaaS 化 WebRTC，房间 / 录制 / Egress 一体 | https://github.com/livekit/livekit |
| `jitsi-meet` | ✓ 已写 | Jitsi Meet — 开源视频会议 | ~25.4k | Jitsi Videobridge SFU + Web 客户端，自托管会议首选 | https://github.com/jitsi/jitsi-meet |

---

## 9. 图像处理

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `imagemagick` | ✓ 已写 | ImageMagick — 图像处理瑞士军刀 | ~12.7k | convert / mogrify / identify CLI 是命令行图像工具鼻祖 | https://github.com/ImageMagick/ImageMagick |
| `vips` | ✓ 已写 | libvips — 流式低内存图像库 | ~10.4k | demand-driven 管道架构，处理巨图比 IM 快 10x | https://github.com/libvips/libvips |
| `opencv` | ✓ 已写 | OpenCV — 计算机视觉库 | ~81k | 滤波 / 特征 / 几何 / 跟踪 / DNN 一体，CV 教学事实标准 | https://github.com/opencv/opencv |
| `pillow` | ✓ 已写 | Pillow — Python 图像处理 | ~12.3k | PIL 的活跃 fork，Python 图像 IO / 编辑事实首选 | https://github.com/python-pillow/Pillow |

---

## 10. 视觉检测 / 跟踪

> 注：与 `projects-data-science-ai.md` 互斥 —— 那边收的是生成模型（comfyui / sd-webui / open-sora 等），本节是检测 / 分割 / 跟踪类"理解模型"。

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mediapipe` | ✓ 已写 | MediaPipe — Google ML 多模态流水线 | ~28.5k | 手势 / 姿态 / 面部 + Edge TPU 部署一体 | https://github.com/google-ai-edge/mediapipe |
| `dlib` | ✓ 已写 | dlib — C++ 机器学习 / CV 工具箱 | ~14k | 人脸 landmark / SVM / 跟踪算法老牌实现 | https://github.com/davisking/dlib |
| `insightface` | ✓ 已写 | InsightFace — 人脸识别 / 检测 SOTA | ~25.6k | ArcFace / RetinaFace 主线工具，人脸研究事实仓库 | https://github.com/deepinsight/insightface |
| `ultralytics` | ✓ 已写 | Ultralytics — YOLOv8/v11 实现 | ~36k | YOLO 系列易用 SDK，检测 / 分割 / 姿态 / OBB 一体 | https://github.com/ultralytics/ultralytics |
| `sam2` | ✓ 已写 | SAM 2 — Segment Anything Model 2 | ~14.6k | Meta 出品的图像 + 视频通用分割模型 | https://github.com/facebookresearch/sam2 |

---

## 11. 媒体服务器 / 录屏

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `jellyfin` | ✓ 已写 | Jellyfin — 自托管媒体服务器 | ~36k | Plex 闭源后的开源 fork，转码 + 多客户端 + 元数据 | https://github.com/jellyfin/jellyfin |
| `scrcpy` | ✓ 已写 | scrcpy — Android 屏幕镜像 / 录制 | ~113k | adb 实时屏幕拉流 + 编解码，跨平台录屏神器 | https://github.com/Genymobile/scrcpy |

---

## 12. 3D 扫描 / 重建

| Slug | 状态 | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `colmap` | ✓ 已写 | COLMAP — 多视图 SfM/MVS 重建 | ~8.5k | Structure-from-Motion 学术 baseline，相机标定 + 稠密重建一体 | https://github.com/colmap/colmap |
| `meshroom` | ✓ 已写 | Meshroom — AliceVision 节点式 GUI | ~12k | 节点式摄影测量流水线，开源 3D 重建一体化方案 | https://github.com/alicevision/meshroom |

---

## 与现有候选池 / atlas 的去重确认

- **与 `projects-data-science-ai.md` 互斥**：那边收 whisper / coqui-tts / piper / faster-whisper / silero-vad / comfyui / sd-webui / invokeai / open-sora / fooocus（语音 + AI 图像视频生成）；本表只收转码 / 编解码 / 流媒体 / 实时通讯 / CV 检测 / 媒体服务器，slug 全部不冲突
- **opencv** 在数据科学池中**未收**（那边只到 paddleocr / unstructured 文档解析），本表首次纳入
- **scrcpy** 与 `projects-cli.md` 已纳入的命令行工具不冲突（scrcpy 是 GUI 屏幕镜像，不是 CLI 工具）

## 备注

- Stars 数为 2026/05 前后估算，前后浮动 < 15%
- 候选不包括：闭源（Plex / Emby / Agisoft Metashape / Mubert / Talkmix 等）、归档项目（kazam）、< 500 stars 的小工具（live555 / scrny 等）
- 视频编码器主仓多在 GitLab / VideoLAN，列出 GitHub 镜像方便 study 站统一抓 README + 样本
- 三大类未深入展开（用户提名但本期暂未收）：视频分析高阶（detectron2 / mmtracking / boxmot）、AI 音乐生成（bark / audiocraft / demucs / spleeter / magenta）、媒体生成 SaaS（多为闭源）—— 后续可单独开 `projects-media-ai.md` 收录
- 所有候选都是**输入 → 处理 → 输出**链上的独立组件，符合 study 站"读项目源码学多媒体管线"主线
