---
title: FLAC — 无损音频压缩格式与参考实现
来源: 'https://github.com/xiph/flac'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 初级
---

## 是什么

**FLAC**（Free Lossless Audio Codec）是 **无损音频压缩** 开放格式：压缩后解码与原始 PCM **bit 级一致**，体积通常比 WAV 小 40–60%。

日常类比：MP3 像 JPEG——有损换小文件。FLAC 像 **PNG**——文件变小，但展开后每个像素（采样点）与原件完全相同。Xiph.Org 维护格式与参考编解码器。

命令行工具 `flac` 与库 `libFLAC` 同源仓库：

```bash
flac -8 input.wav -o output.flac   # 最高压缩级别
flac -d output.flac                # 解码回 wav
metaflac --list output.flac        # 查看采样率、位深、标签
```

FLAC 是**格式名**也是**参考编码器名**；多数播放器内置解码，无需用户装软件。

## 为什么重要

不理解 FLAC，音频资产管线会混淆「无损」：

- **母带归档事实标准之一**：与 WAV 互转无.generation loss
- **流媒体无损档**：Tidal/Qobuz 等「Hi-Res」常基于 FLAC 或同类
- **与 [[sox]]、[[ffmpeg]] 衔接**：转格式、剪切片时常用 flac 作中间格式
- **开源专利自由**：Xiph 项目哲学与 [[aubio]] 分析链可组合

## 核心要点

1. **帧结构**：音频切成独立帧，单帧损坏不影响全局，适合流式与纠错。

2. **元数据 Vorbis Comment**：曲目、艺术家存在 METADATA_BLOCK，与音频帧分离。

3. **压缩级别 0–8**：只影响编码时间与体积，**解码输出完全一致**。

4. **libFLAC API**：`FLAC__stream_encoder` / `decoder` 供嵌入式与 [[sox]] 等工具调用。

5. **Ogg 封装可选**：`.oga` 容器便于与 Ogg 生态统一；裸 `.flac` 也更常见。

6. **硬件播放器兼容广**：车机、Hi-Fi 数播普遍标 FLAC，比小众无损格式省心。

## 实践案例

### 案例 1：批量归档 CD 抓轨

```bash
for f in *.wav; do flac -e -V -8 "$f"; done
```

`-e` 对齐扇区，`-V` 验证，适合长期存档。

### 案例 2：用 [[ffmpeg]] 转 FLAC 不重编码 PCM

```bash
ffmpeg -i input.mp3 -c:a flac output.flac
```

注意 mp3 源本身有损，转 FLAC 不会「变回无损」，只避免再损。

### 案例 3：C 程序嵌入 libFLAC 解码

读 `include/FLAC/stream_decoder.h`：回调 `write` 拿 PCM buffer，喂给音频设备或 [[aubio]] 分析。

### 案例 4：与 [[sox]] 效果链

```bash
sox input.wav -t flac output.flac trim 0 30 fade 1
```

SoX 做效果，输出容器选 flac，保持无损链路。

### 案例 5：校验无损往返

```bash
flac -d output.flac -o roundtrip.wav
cmp input.wav roundtrip.wav && echo "bit-identical"
```

确认工具链未引入隐性重采样或 dither。

## 踩过的坑

1. **把有损源转 FLAC 当「升级音质」**：心理安慰，信息已丢。

2. **压缩级别 8 极慢**：归档可过夜跑，实时场景用 0–3。

3. **标签编码**：非 UTF-8 标签在部分播放器乱码，用 metaflac 规范写入。

4. **与 ALAC 别混**：苹果无损是另一格式，设备兼容表不同。

5. **硬盘仍要够**：无损比 mp3 大很多，批量收藏先算容量。

6. **编译依赖 libogg**：部分构建需 `-DOGG_ROOT`，见 CMake 文档。

7. **流式 FLAC**：网络电台无损档可用 FLAC 帧独立特性做容错，但 CDN 成本更高。

## 适用 vs 不适用场景

**适用**：
- 母带/采样库长期归档
- 需要可验证无损的音频管道
- 学习音频压缩原理（预测 + 残差编码）

**不适用**：
- 手机流量敏感播放（用 AAC/Opus）
- 实时语音（Opus 更合适）
- 视频轨（应看 [[ffmpeg]] 视频编码）

## 历史小故事（可跳过）

- **2001**：Josh Coalson 发布 FLAC，填补开源无损空白
- **并入 Xiph.Org**：与 Ogg Vorbis、Opus 同属一家
- **2014 起**：FLAC 进入 Android/iOS 系统解码器
- **至今**：参考实现即规范事实标准

## 学到什么

1. **无损 = 可逆压缩**，级别只影响编码侧
2. **元数据块设计便于编辑标签不重编码音频**
3. **与有损格式互补**：分发用 AAC，存档用 FLAC
4. **命令行 flac + metaflac 覆盖 90% 个人场景**
5. **读 Xiph 其它项目**：codec 家族思想一致
6. **校验用 flac -t**：批量归档后跑测试通过再删源 wav
7. **封面图嵌入 BLOCK_PICTURE**：metaflac 可导入专辑图

## 延伸阅读

- [FLAC 格式规范](https://xiph.org/flac/documentation_format_overview.html)
- [Xiph.Org](https://xiph.org/flac/)
- [[sox]] —— 命令行处理
- [[ffmpeg]] —— 通用转码
- [[aubio]] —— 解码后分析

## 关联

- [[sox]] —— 效果与格式转换
- [[ffmpeg]] —— 通用多媒体
- [[aubio]] —— 特征分析
- [[obs-studio]] —— 录制常出 mkv，归档可转 flac 仅音频轨
- [[video.js]] —— 浏览器播 flac 支持有限，常转 aac
- [[hls.js]] —— 流媒体分发常转有损码率

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aubio]] —— aubio — 实时音频事件检测库
- [[essentia]] —— Essentia — 音乐信息检索工具箱
- [[fdk-aac]] —— fdk-aac — Fraunhofer AAC 编解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[lame]] —— LAME — MP3 编码开源参考实现
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[opus]] —— Opus — 低延迟全频带音频编解码
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[sox]] —— SoX — 命令行音频处理瑞士军刀

