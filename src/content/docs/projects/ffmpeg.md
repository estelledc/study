---
title: FFmpeg — 多媒体处理瑞士军刀与底层编解码库
description: libavcodec/libavformat/libavfilter 三件套；ffmpeg/ffprobe/ffplay CLI 是几乎所有音视频工具的底层
来源: 'https://github.com/FFmpeg/FFmpeg'
日期: 2026-06-05
分类: 多媒体
子分类: 编解码
难度: 中级
provenance: manual-read
---

## 是什么

**FFmpeg** 是一套开源**多媒体处理库与命令行工具集**：把音频、视频、字幕及相关元数据的编解码、封装、滤镜、缩放、推流串成完整 toolchain。几乎所有视频 AI 管线（含 [[decord]]、[[whisper]]）最终都绕不开它。

日常类比：如果 MP4 文件是「快递包裹」，FFmpeg 就是**全球物流枢纽**——能拆箱（demux）、改包装（transcode）、加滤镜（filter graph）、再发货（mux/stream）。

核心库分工：

| 库 | 职责 |
|----|------|
| libavcodec | 编解码器实现（H.264/HEVC/AV1/AAC…） |
| libavformat | 容器格式与 I/O（mp4/mkv/rtsp…） |
| libavfilter | 解码后音视频滤镜图 |
| libswscale / libswresample | 像素格式转换 / 音频重采样 |
| libavutil | 哈希、数学、通用工具 |

命令行三件套：`ffmpeg`（转换/推流）、`ffprobe`（探测元数据）、`ffplay`（极简播放器）。

## 为什么重要

不懂 FFmpeg，视频 ML 工程会在「数据进不了模型」处反复卡住：

- **Video-LLM 采帧前置步骤**：抽帧、改 fps、裁片段、转 yuv420p 都靠 ffmpeg CLI 一行搞定
- **容器与 codec 解耦认知**：`.mp4` 只是盒子，H.264/HEVC 才是编码——排查「能播不能训」必查两者
- **GPL/LGPL 合规边界**：可选组件带 GPL，商用集成要读 LICENSE 分拆
- **贡献路径特殊**：官方不接受 GitHub PR，patch 走 ffmpeg-devel 邮件列表

## 核心要点

1. **filter_complex 是有向图**：多个输入 → 滤镜节点 → 多个输出；`-vf`/`-af` 是单链简写，复杂场景必须画 graph。

2. **`-c copy` vs 重编码**：流复制零质量损失且极快；改分辨率/帧率/编码必须重编码，别对 already-broken 流盲目 copy。

3. **硬件加速可选**：`-hwaccel cuda/videotoolbox` 等减轻 CPU，但 filter 与 hw frame 格式转换常是坑——先 CPU 跑通再加速。

## 实践案例

### 案例 1：均匀抽帧供 Video-LLM

```bash
# 每秒 1 帧，输出 jpg 序列
ffmpeg -i input.mp4 -vf fps=1 frames/%04d.jpg

# 或直接缩放到 336 边长（CLIP 常见输入）
ffmpeg -i input.mp4 -vf "fps=1,scale=336:336:force_original_aspect_ratio=decrease,pad=336:336:(ow-iw)/2:(oh-ih)/2" frames/%04d.jpg
```

配合 [[decord]] 时，也可在 Python 层采帧；批处理海量视频时 CLI 往往更稳。

### 案例 2：探测视频元数据

```bash
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,duration -of json input.mp4
```

训练前用 ffprobe 确认 fps、时长、旋转 metadata；竖屏视频未处理会导致宽高颠倒进模型。

### 案例 3：转码 + 音频提取

```bash
# H.264 + AAC 标准 mp4
ffmpeg -i input.mkv -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4

# 只要音频给 [[whisper]]
ffmpeg -i input.mp4 -vn -acodec pcm_s16le -ar 16000 audio.wav
```

`-crf` 控制质量/体积；Whisper 要 16kHz mono wav 是常见约定。

## 踩过的坑

1. **旋转 metadata 未应用**：手机视频 `displaymatrix` 导致「横屏文件竖着播」——加 `-vf transpose` 或 `-noautorotate` 前先 ffprobe。

2. **时间戳断裂**：某些 TS/RTSP 源 concat 后 A/V 不同步——用 `-fflags +genpts` 或 `-async 1` 修，别直接 copy。

3. **滤镜引号在 shell 里被吃掉**：`-vf "scale=..."` 复杂表达式用单引号包外层，或写 `-filter_complex_script`。

4. **许可证误用 GPL 组件**：`--enable-gpl` 构建的 ffmpeg 静态链进闭源产品有风险——生产用 LGPL 默认构建并审计 linked libs。

5. **像素格式 surprise**：YUV420p vs yuvj420p 在 ML 管线里会导致 mean/std 归一化偏移——转码时显式 `-pix_fmt yuv420p`。

## 适用 vs 不适用场景

**适用：**

- 视频数据集预处理、抽帧、转码、裁剪、加字幕
- 流媒体推/拉（RTMP、HLS、SRT）
- 嵌入式/服务器侧轻量转码

**不适用：**

- 非线性剪辑（多轨时间线）——用专业 NLE
- 实时特效合成——更偏 GPU 引擎（Unity/Unreal）
- 只想「播视频」——直接用播放器 SDK，不必裸调 libav*
- 需要 GUI 拖拽时间线的场景——ffmpeg CLI 不适合，应导出中间格式给剪辑软件

## 历史小故事（可跳过）

- **2000**：Fabrice Bellard 发起 FFmpeg 项目
- **2011**：Libav fork 分裂（现仍见老文档混淆）
- **2015+**：AV1/VP9 生态推动 ffmpeg 成为事实标准转码后端
- **今**：Video AI boom 让「会写 ffmpeg 一行命令」成为 MLE 基础技能；NVENC/QSV 硬件编码与 filter 组合仍是面试常考点

## 学到什么

- 视频 ML 问题有一半是容器/codec/时间戳问题，ffprobe 先于 pytorch debug
- filter graph 思维可迁移到任何 DAG 数据处理
- 读 doc/examples 比 StackOverflow 拼凑更可靠
- 生产转码队列要区分 copy 与 reencode 路径，监控 queue depth 与失败重试

## 延伸阅读

- 官网文档：https://ffmpeg.org/documentation.html
- Wiki：https://trac.ffmpeg.org
- 仓库 doc/examples —— C API 最小示例
- [[decord]] —— Python 侧高效解码，底层常依赖 ffmpeg
- [[whisper]] —— 典型音频提取下游

## 关联

- [[decord]] —— Video-LLM 采帧常用包装
- [[whisper]] —— 音频提取标准下游
- [[opencv]] —— 另一种视频处理路线（偏 CV）
- [[gradio]] —— demo 上传视频前的格式归一
- [[docker]] —— 容器里装 ffmpeg 是常见 baseline
- [[videollama2]] —— README 依赖 ffmpeg-python
- [[videollama3]] —— 同上
- [[yt-dlp]] —— 下载后几乎必过 ffmpeg remux
- [[librosa]] —— 音频特征提取常配合 ffmpeg 预提取 wav
- [[internvideo]] —— 训练管线前置转码步骤
- [[lmms-eval]] —— 评测前统一视频规格
- [[whisper]] —— 16kHz mono 提取是 ASR 标准前置
- [[video-understanding]] —— 视频 ML 专题枢纽

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— 高效视频解码，常与 ffmpeg 二进制配合
