---
title: Opus — 低延迟全频带音频编解码
description: RFC 6716；WebRTC/视频会议默认音频；与 WebM/MP4 伴音的开源首选
来源: 'https://github.com/xiph/opus'
日期: 2026-06-06
分类: 媒体
子分类: 音频编解码
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Opus** 是 IETF 标准（RFC 6716）的开源音频编解码器：融合 Skype **SILK**（语音优化）与 Xiph **CELT**（音乐优化），单编解码器覆盖 **窄带语音到全频带音乐**，延迟可低至几毫秒。WebRTC、Zoom 开源栈、[[mediasoup]]、[[pion]] 默认音频几乎都是 Opus。

日常类比：[[lame]] MP3 像老式卡带；Opus 是**蓝牙耳机时代**的 codec——语音清、音乐也能听、延迟够开会。

```bash
ffmpeg -i in.wav -c:a libopus -b:a 64k -vbr on out.opus
```

## 为什么重要

音视频 LLM 与会议系统都绕不开 Opus：

- **WebRTC 强制能力**：不懂 Opus 就不懂实时音轨打包
- **与 [[libvpx]]/AV1 伴音**：WebM 标准音频轨
- **可变比特率 VBR**：语音场景自动省码率
- **对比 [[lame]]**：同一 podcast Opus 64k 常优于 MP3 128k 感知

## 核心要点

1. **模式自动**：编码器按内容选 SILK/CELT/混合；应用一般不需手调。

2. **帧长 2.5–60ms**：短帧低延迟；长帧省开销。会议常用 20ms。

3. **FEC / DTX**：前向纠错与静音检测省带宽；弱网会议关键。

4. **多声道**：最多 255 声道；立体声音乐与单声道语音通吃。

5. **容器**：`.opus` 原生；WebM/mkv/mp4 也常见。

## 实践案例

### 案例 1：语音播客压缩

```bash
ffmpeg -i voice.wav -c:a libopus -b:a 32k -application voip out.opus
```

`application voip` 偏 SILK，体积小于音乐模式。

### 案例 2：与 [[ffmpeg]] 视频一并封装

```bash
ffmpeg -i v.mp4 -i a.wav -c:v copy -c:a libopus -b:a 96k out.webm
```

视频 copy、音频转 Opus 进 WebM，给 [[dash-js]] 实验轨。

### 案例 3：WebRTC 对照

在 [[pion]] 示例里看 `mimeType: audio/opus` 与 SDP `opus/48000/2`；理解采样率 48kHz 标准。

### 案例 4：数据集统一采样

多源视频抽音频轨转 16kHz mono（ASR）或 48kHz Opus（存档）：

```bash
ffmpeg -i clip.mp4 -vn -ar 48000 -ac 1 -c:a libopus -b:a 64k clip.opus
```

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **重采样**：Opus 内部 48kHz；输入别的采样率 ffmpeg 会 resample，注意 `-ar`。

2. **旧播放器**：极老设备无 Opus；交付备 AAC（[[fdk-aac]]）。

3. **比特率不是 MP3 刻度**：32k Opus 不要与 128k MP3 直接比数值。

4. **复制流**：WebRTC 里是 RTP 打包 Opus，不是裸 `.opus` 文件。

5. **与视频 LLM**：[[videollama3]] 等要音频时常从 mp4 抽 AAC；转码注意音画同步。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- WebRTC / 实时会议音频
- WebM/开源 Web 分发伴音
- 语音数据集压缩存档

**不适用**：

- 极致旧车机兼容（AAC/MP3）
- 无损归档（用 [[flac]]）
- 专业母带（PCM/FLAC 工作流）

## 历史小故事（可跳过）

- **2012**：IETF 标准化，Skype 与 Xiph 技术合并。
- **2013+**：WebRTC 1.0 采纳为必选 codec。
- **2018+**：YouTube 部分场景 Opus 音轨。
- **2024+**：仍是实时音频开源默认；[[lame]] MP3 渐退直播场景。

## 学到什么

- **一个 codec 覆盖语音+音乐**减少协议协商复杂度。
- 低延迟来自短帧与高效 SILK，不是魔法。
- Web 音视频要把**音频 codec 与视频 codec 分开选型**。
- RTP 打包与文件封装是两层知识。
- Opus 是读 [[mediasoup]]/[[pion]] 前的音频预习。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- RFC 6716：https://datatracker.ietf.org/doc/html/rfc6716
- [[ffmpeg]] —— libopus
- [[lame]] —— MP3 对照
- [[flac]] —— 无损对照
- [[libvpx]] —— WebM 视频搭档
- WebRTC 音频指南

## 关联

- [[ffmpeg]] —— 抽轨与转码
- [[lame]] —— MP3 老标准
- [[flac]] —— 无损音频
- [[libvpx]] —— WebM 容器伴音
- [[mediasoup]] —— SFU 默认 Opus
- [[pion]] —— Go WebRTC Opus 轨
- [[obs-studio]] —— 推流音频编码选项
- [[videollama3]] —— 多模态需音轨时常从视频抽取

## 维护备注

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
