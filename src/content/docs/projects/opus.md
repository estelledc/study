---
title: Opus — 低延迟全频带音频编解码器
来源: 'IETF RFC 6716, https://github.com/xiph/opus'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
---

## 是什么

**Opus** 是 IETF **RFC 6716** 标准化的**交互式音频编解码器**——把 Skype 系的 SILK（语音优化）与 CELT（音乐优化）合并，单 codec 覆盖窄带语音到立体声音乐，延迟可低至几毫秒，也是 WebRTC 默认音频格式。

日常类比：[[lame]] MP3 像**邮寄 CD**——音质不错但有固定延迟，不适合对讲。[[opus]] 像**无线对讲机**——小声说话清、唱歌也能听，还能在「省流量模式」和「高保真模式」间一键切换。

[[ffmpeg]] 转 Opus in WebM：

```bash
ffmpeg -i talk.wav -c:a libopus -b:a 64k -vbr on -compression_level 10 out.webm
```

`libopus` 是参考实现；浏览器 WebRTC 内置解码器与之比特流兼容。

## 为什么重要

不理解 Opus，下面这些事讲不清：

- 为什么 Zoom/Discord/WebRTC 会议默认 Opus 而非 MP3/AAC
- 为什么 [[libvpx]] WebM 视频常配 Opus 音轨——开放 A/V 套餐
- 为什么 48 kHz 帧长 20 ms 是 VoIP 事实标准
- 为什么 Opus 1.5 加入 DRED 深冗余应对丢包（RFC 草案）

## 核心要点

1. **模式自动切换**：SILK 处理语音（8–24 kHz），CELT 处理音乐（全频带）；编码器按内容选。

2. **bitrate 弹性**：6 kbps 窄带语音到 510 kbps 立体声音乐；VBR/CBR 均可。

3. **低延迟帧长**：2.5/5/10/20 ms 可选；20 ms 最常用，交互与效率平衡。

4. **容器**：RTP 走 RFC 7587；文件存储用 Ogg Opus（RFC 7845）。

5. **DTX/CNG**：静音时可停发包，省会议带宽。

## 实践案例

### 案例 1：语音 podcast 压到 48 kbps

```bash
ffmpeg -i voice.wav -c:a libopus -b:a 48k -application voip mono.opus
```

`-application voip` 偏向 SILK，清辅音更利落地。

### 案例 2：与 [[lame]] MP3 对比

| 维度 | Opus 48k | MP3 128k |
|---|---|---|
| 语音清晰度 | 高 | 中 |
| 延迟 | 毫秒级 | 帧缓冲更大 |
| 开源专利 | RFC 免版税 | MP3 专利已过期 |
| 浏览器 | WebRTC 原生 | 需容器支持 |

### 案例 3：Video-LLM 音视频

[[decord]] `AVReader` 读视频时音频轨常见 AAC；若 WebM+Opus，FFmpeg 统一解码。多模态模型要确认采样率对齐（通常 16 kHz 重采样给 ASR）。

## 踩过的坑

1. **用 opus_demo 比特流当发布格式**——演示流含调试数据，分发用 Ogg/WebM。

2. **音乐内容却开 voip 模式**——高频损失，改 `audio` 或默认。

3. **固定比特率过低**——复杂音乐会金属声，开 VBR 或提码率。

4. **与视频封装不匹配**——MP4 常用 AAC；WebM 才原生 Opus。

## 适用 vs 不适用场景

**适用**：
- 实时会议、游戏语音、直播连麦
- WebM/HTML5 开放音视频
- 低码率语音分发

**不适用**：
- 只关心归档audiophile（FLAC 无损）
- 旧车载只认 MP3（用 [[lame]]）
- 广播级多声道 Atmos（非 Opus 主场）

## 历史小故事（可跳过）

- **2012**：IETF 标准化 Opus，合并 Skype SILK 与 Xiph CELT
- **2010s**：成为 WebRTC 强制 codec
- **2024**：Opus 1.5 引入 DRED 深冗余抗丢包
- **现状**：libopus 由 Xiph 维护；opus-tools 处理 Ogg 封装

## 学到什么

1. **交互音频首要指标是延迟 + 鲁棒性**，不是仅码率
2. **语音/音乐统一 codec** 降低协议栈复杂度
3. **RFC 标准化 = 浏览器与终端硬解普及前提**
4. **视频管线**：画面 [[x264]]，声音 Opus，容器 WebM 是开放组合
5. **1.5 DRED**：深冗余在丢包网络提升可懂度，值得跟进 RFC 进展

## 延伸阅读

- [RFC 6716](https://tools.ietf.org/html/rfc6716) — 规范全文
- [opus-codec.org](https://opus-codec.org/) — 生态与测试向量
- [[lame]] —— MP3 对照
- [[libvpx]] —— WebM 视频搭档
- [[ffmpeg]] —— libopus 封装

## 与同类对比

| 音频 codec | 延迟 | 码率范围 | 交互场景 | 文件生态 |
|---|---|---|---|---|
| **Opus** | 毫秒 | 6–510 kbps | WebRTC 首选 | WebM/Ogg |
| [[lame]] MP3 | 较高 | 32–320 kbps | 归档分发 | 全系 |
| AAC | 中 | 类似 | HLS/MP4 | 苹果友好 |
| FLAC | N/A | 无损 | 存档 | 发烧友 |

会议产品选 Opus 不是因为它「音质永远最好」，而是**延迟+抗丢包+带宽弹性**综合最优。

## 关联

- [[lame]] —— MP3 编码对照
- [[libvpx]] —— WebM 视频
- [[ffmpeg]] —— 转码与封装
- [[handbrake]] —— 音频轨转 AAC/Opus
- [[shotcut]] —— 时间线导出音频设置
- [[decord]] —— AVReader 音频切片
- [[videollama2]] —— 音视频多模态常需对齐采样率

WebM（VP9+Opus）是开放栈样板；MP4（H.264+AAC）是兼容栈样板——按播放端能力二选一。

会议录制若已 Opus，提取音轨用 `ffmpeg -i call.webm -vn -c:a copy voice.opus` 即可，无需重编码。

`opus_demo` 仅用于编解码实验，不要把它输出当发布文件。

编译后跑 `make check` 可快速验证本机浮点/定点路径是否正常。

浏览器 WebRTC 栈已内置 Opus，服务端只需正确封装 RTP 即可对接。

固定点编译 `--enable-fixed-point` 面向嵌入式，桌面默认浮点音质更好。

RFC 6716 原文不长，值得一读以理解模式切换边界。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
