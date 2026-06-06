---
title: dav1d — 速度优先的 AV1 解码器
description: VideoLAN 出品；大量汇编优化；FFmpeg/播放器读 AV1 的默认软解路径之一
来源: 'https://github.com/videolan/dav1d'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**dav1d** 是 VideoLAN 开发的 **AV1 视频解码器**，设计目标是**极快、低内存、易集成**。与编码器 [[svt-av1]] 配对：前者把 AV1 码流变成像素，后者把像素变成 AV1。FFmpeg 4.0+ 可用 `libdav1d`；VLC、mpv 默认软解 AV1 常走 dav1d。

日常类比：AV1 像新方言；[[svt-av1]] 是「翻译写出」的作家；dav1d 是**同声传译员**——听众（播放器）听得清、反应快才算成功。

```bash
ffmpeg -c:v libdav1d -i input.av1.mkv -c:v copy out.mkv
```

## 为什么重要

AV1 推广瓶颈常在**解码性能**而非编码：

- **移动端软解**：dav1d 的 SIMD/asm 让中低端 CPU 可播 1080p AV1
- **转码管线**：解码 AV1 源再转 H.264 给旧端（[[ffmpeg]] + [[x264]]）依赖快解码
- **与硬件解码分工**：硬解不可用回退 dav1d；理解边界利排障
- **VideoLAN 工程文化**：与 [[x264]]、VLC 同血脉，读代码学性能优化

## 核心要点

1. **只做解码**：不编码；编码看 [[svt-av1]] / libaom。

2. **线程模型**：帧级/瓦片级并行；多核缩放明显。

3. **8/10/12-bit**：跟随 AV1 标准位深；HDR 工作流需正确 pix_fmt。

4. **零拷贝友好**：输出格式对接 GPU 上传需额外 swscale（[[ffmpeg]] `-pix_fmt`）。

5. **API 稳定**：C API 被 FFmpeg、GStreamer 等封装；应用层少直接调。

## 实践案例

### 案例 1：探测 AV1 流信息

```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,pix_fmt input.mkv
```

确认 `av1` 后决定 dav1d 软解或硬解。

### 案例 2：AV1 → H.264 兼容转码

```bash
ffmpeg -c:v libdav1d -i in.av1.webm -c:v libx264 -crf 23 -c:a copy out.mp4
```

数据集要喂老 [[decord]] / 手机硬解时用。

### 案例 3：benchmark 解码 FPS

```bash
ffmpeg -c:v libdav1d -i test_1080p.av1.mkv -f null -
```

看 `speed=` 字段评估机器能否实时播。

### 案例 4：与 [[svt-av1]]  round-trip

svt 编码 → dav1d 解码 → PSNR/SSIM 对比原 y4m，验证编码器输出合规。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **硬解优先**：有 VA-API/NVDEC AV1 时 ffmpeg 可能自动硬解；强制 `-c:v libdav1d` 才测软解路径。

2. **10-bit 显示**：8-bit 显示器 downconvert 发灰；需正确 tone-map 链。

3. **旧 FFmpeg**：无 libdav1d 需自编译 `--enable-libdav1d`。

4. **与编码器混淆**：dav1d 不解 VP9；VP9 走 libvpx。

5. **训练侧**：PyTorch 很少直接读 AV1；常先转码再 [[decord]]。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 播放器/转码服务集成 AV1 软解
- 学习 SIMD 解码优化
- AV1 存量内容向下兼容转码

**不适用**：

- 需要 AV1 编码（用 [[svt-av1]]）
- 极致低功耗移动播放（优先硬解 IP）
- 论文训练默认格式（仍多 H.264）

## 历史小故事（可跳过）

- **2018**：VideoLAN 宣布 dav1d，弥补 libaom 解码偏慢。
- **2019–2021**：并入 FFmpeg、Android、浏览器测试栈。
- **2022+**：AV1 硬解普及，dav1d 仍是软解金标准。
- **2024+**：长视频平台 AV1 分发增加，dav1d 是服务端转码必备。

## 学到什么

- 新标准落地**解码器速度**决定用户体验。
- 汇编优化是多媒体底层核心竞争力。
- 编码器/解码器分离利于生态分工（[[svt-av1]] / dav1d）。
- 训练管线可滞后于分发格式一代；转码桥接仍重要。
- VideoLAN 项目链是读透音视频栈的捷径。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://code.videolan.org/videolan/dav1d
- [[svt-av1]] —— 配对编码器
- [[ffmpeg]] —— libdav1d 集成
- [[libvpx]] —— VP9 前代
- [[x264]] —— 兼容转码目标
- [[vlc]] —— 默认集成播放器（若站内有）

## 关联

- [[svt-av1]] —— AV1 编码对照
- [[ffmpeg]] —— 转码与探测
- [[libvpx]] —— 上一代 Web 开源编码
- [[x264]] —— 向下兼容转码
- [[handbrake]] —— GUI 转码下游
- [[decord]] —— 训练读解码后 mp4
- [[shaka-player]] —— 浏览器 AV1 播放栈
- [[obs-studio]] —— 录制/推流格式选择

## 维护备注

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[handbrake]] —— HandBrake — FFmpeg 上的 GUI 转码器
- [[libvpx]] —— libvpx — VP8/VP9 开源视频编解码
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[shaka-player]] —— Shaka Player — Google 自适应流媒体播放器
- [[svt-av1]] —— SVT-AV1 — 可扩展 AV1 软件编码器
- [[x264]] —— x264 — 开源 H.264/AVC 软件编码器
- [[x265]] —— x265 — 开源 HEVC/H.265 编码器

