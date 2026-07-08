---
title: FDK-AAC — Fraunhofer AAC 编解码库
来源: 'https://github.com/mstorsjo/fdk-aac'
日期: 2026-07-08
分类: media
难度: 中级
---

## 是什么

FDK-AAC 是一个把 PCM 原始声音压成 AAC，或把 AAC 还原成 PCM 的 C/C++ 编解码库。

日常类比：它像一个会打包和拆包的音频快递员，把一大箱原始声音压成适合网络传输的小包，到播放器那边再拆回连续的声音。

你最小可以这样理解：

```bash
# 仓库自带 aac-enc.c 这个示例工具，输入 16-bit WAV，输出 ADTS AAC
./aac-enc -r 64000 -t 2 input.wav output.aac
```

这里 `-r 64000` 是目标码率，`-t 2` 是 AAC-LC。真正的项目通常不是直接跑命令，而是把 `libfdk-aac` 链进播放器、录音工具、转码服务或 Android 多媒体栈。

## 为什么重要

不理解 FDK-AAC，下面这些事会很难解释：

- 为什么同样是 `.aac`，有的文件适合低码率直播，有的适合本地高质量音乐。
- 为什么 `HE-AAC`、`HE-AAC v2`、`AAC-LD`、`AAC-ELD` 这些名字不是营销词，而是不同延迟、码率和声道场景的取舍。
- 为什么 FFmpeg 里大家会反复讨论 `libfdk_aac`，但发布二进制时又会小心许可证和专利问题。
- 为什么音频编码不是“调一个 bitrate”就完事，还要管采样率、声道布局、传输封装、延迟和错误恢复。

## 核心要点

1. **编码器像压缩行李箱**：`aacEncOpen` 先开箱，`aacEncoder_SetParam` 决定箱子规格，`aacEncEncode` 一帧一帧往里塞 PCM。规格选错，箱子也能关上，但到播放器那里可能打不开或声音变差。

2. **解码器像流水线拆包**：`aacDecoder_Open` 选择 ADTS、RAW、LATM、LOAS 等传输格式，`aacDecoder_Fill` 喂入比特流，`aacDecoder_DecodeFrame` 吐出 PCM。它不是一次读完整首歌，而是边来边解。

3. **FDK 的强项在低码率 AAC 家族**：官方许可文本强调 HE-AAC、HE-AAC v2 和 AAC-ELD 的效率与通信场景。类比：它不是万能压缩器，而是专门把“人耳觉得重要的部分”留下来的音频工具箱。

## 实践案例

### 案例 1：用仓库自带示例把 WAV 编成 AAC

`aac-enc.c` 是项目根目录里的真实示例程序，它展示了最常见的“读取 WAV → 设置编码参数 → 写 ADTS AAC”流程。

```bash
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DBUILD_PROGRAMS=ON
cmake --build build --config Release
./build/aac-enc -r 64000 -t 2 -a 1 input.wav output.aac
```

逐部分解释：

- `-DBUILD_PROGRAMS=ON` 会把额外示例工具一起编出来。
- `-r 64000` 选择总码率，适合先做一个能听的低码率样例。
- `-t 2` 是 AAC-LC；仓库示例还列出 `5` 表示 HE-AAC，`29` 表示 HE-AAC v2，`23` 表示 AAC-LD，`39` 表示 AAC-ELD。
- `-a 1` 打开 afterburner，通常用更多 CPU 换一点编码质量。

### 案例 2：在 C 代码里直接调用编码器 API

官方头文件 `aacenc_lib.h` 的调用顺序很固定：打开、设参数、初始化、拿配置、循环编码、关闭。

```c
HANDLE_AACENCODER enc;
AACENC_InfoStruct info = {0};

aacEncOpen(&enc, 0, channels);
aacEncoder_SetParam(enc, AACENC_AOT, 2);
aacEncoder_SetParam(enc, AACENC_SAMPLERATE, sample_rate);
aacEncoder_SetParam(enc, AACENC_CHANNELMODE, MODE_2);
aacEncoder_SetParam(enc, AACENC_BITRATE, 64000);
aacEncoder_SetParam(enc, AACENC_TRANSMUX, TT_MP4_ADTS);
aacEncEncode(enc, NULL, NULL, NULL, NULL);
aacEncInfo(enc, &info);
```

逐部分解释：

- `AACENC_AOT` 决定用 AAC-LC、HE-AAC、HE-AAC v2 还是低延迟家族。
- `AACENC_TRANSMUX` 决定输出是裸流还是带 ADTS 等传输头。
- 第一次 `aacEncEncode(... NULL ...)` 不是在编码声音，而是在让内部状态按参数完成初始化。
- `aacEncInfo` 会告诉你帧长、延迟和配置字节，后面写容器或做 raw 解码时很关键。

### 案例 3：用 Android 测试和 fuzz 保护解码器

仓库里的 `fuzzer/README.md` 和 `tests/AacDecBenchmark/README.md` 给的是工程侧真实用法：不是听歌，而是找崩溃、量性能。

```bash
mm -j$(nproc) aac_dec_fuzzer
adb sync data
adb shell /data/fuzz/arm64/aac_dec_fuzzer/aac_dec_fuzzer CORPUS_DIR

mmm external/aac/tests/AacDecBenchmark/
atest AacDecBenchmark
```

逐部分解释：

- fuzzer 会把各种畸形 AAC 数据喂给解码器，目标是覆盖更多路径并发现崩溃。
- benchmark 会记录文件名、声道数、采样率、帧大小、真实耗时和 CPU 耗时。
- 这说明 FDK-AAC 在系统组件里不只看“能不能播”，还要看“坏输入会不会把进程带崩”和“同一设备上到底慢不慢”。

## 踩过的坑

1. **把许可证当普通开源许可证看**：仓库 `NOTICE` 明确说版权许可不等于专利许可，原因是 AAC 标准相关专利可能需要另外授权。

2. **RAW AAC 和 ADTS AAC 混着喂**：解码器打开时要选 `TT_MP4_RAW`、`TT_MP4_ADTS` 等传输格式，原因是裸帧没有同样的同步头和配置信息。

3. **输入 WAV 格式想当然**：示例工具只接受 PCM、16-bit 的 WAV，原因是它的读入和转换逻辑按这个前提写。

4. **低码率只调 bitrate**：HE-AAC、HE-AAC v2、SBR、PS、VBR mode 彼此有关，原因是编码器会按 AOT、采样率和码率共同选择工具。

## 适用 vs 不适用场景

**适用**：

- 需要在 C/C++ 程序里做 AAC-LC、HE-AAC、HE-AAC v2、AAC-LD、AAC-ELD 编码或解码。
- 需要低码率语音、广播、直播或移动端音频，并且愿意处理许可证和专利合规。
- 需要和 Android 多媒体组件、fuzzer、benchmark 这类系统工程流程对齐。
- 需要可控的帧级 API，而不是只想点一个 GUI 转格式。

**不适用**：

- 只想把几个文件临时转成 `.m4a`，用 FFmpeg 命令可能更省事。
- 不想碰 AAC 专利和再分发条款的商业产品，要先找法务或换无专利负担更低的格式。
- 需要现代浏览器里直接跑的纯 JS 编码器，FDK-AAC 是原生库。
- 主要目标是无损音频，AAC 是有损压缩，不该拿来替代 FLAC。

## 历史小故事（可跳过）

- **1990s-2000s**：AAC 成为 MPEG 音频标准家族的一部分，用心理声学模型换取更高压缩率。
- **Android 时代**：Fraunhofer FDK AAC Codec Library for Android 被用于 Android 设备上的 AAC 编解码。
- **2011 年左右**：Martin Storsjo 把 Android 里的 FDK AAC 代码整理成独立库，方便非 Android 项目复用。
- **2.0.0**：项目同步到 FDKv2，上游源码、配置和 fuzz 修复都有大更新。
- **现在**：GitHub 页面显示它是独立的 Fraunhofer FDK AAC Android 代码库，社区在构建系统、崩溃修复和平台移植上持续维护。

## 学到什么

- 音频编码的核心不是“压小”，而是在码率、听感、延迟、兼容性之间做工程取舍。
- FDK-AAC 的 API 很像一条工厂流水线：先配置机器，再按帧喂原料，最后拿走压缩包或 PCM。
- AAC 的传输格式很重要，ADTS、RAW、LATM、LOAS 不是后缀差异，而是解码器如何找到帧边界和配置的规则。
- 媒体基础库的学习重点要同时看声音质量、坏输入安全、性能测试和许可证边界。

## 延伸阅读

- [fdk-aac GitHub 仓库](https://github.com/mstorsjo/fdk-aac) —— 项目主页、源码、构建文件和示例入口。
- [aacEncoder.pdf](https://github.com/mstorsjo/fdk-aac/tree/master/documentation) —— 官方编码器文档所在目录，重点看调用顺序和参数说明。
- [aacDecoder.pdf](https://github.com/mstorsjo/fdk-aac/tree/master/documentation) —— 官方解码器文档所在目录，重点看 fill/decode 流程。
- [fuzzer README](https://github.com/mstorsjo/fdk-aac/tree/master/fuzzer) —— 看系统组件如何用 fuzz 抓坏输入问题。
- [[ffmpeg]] —— 常见音视频转码入口，常和 `libfdk_aac` 一起讨论。
- [[opus]] —— 另一个低延迟、低码率音频编码方向，适合和 AAC 家族对比。

## 关联

- [[ffmpeg]] —— 上层转码工具经常把 FDK-AAC 当作可选 AAC 编码后端。
- [[android-media]] —— FDK-AAC 的来源和系统级测试都和 Android 媒体栈关系很近。
- [[opus]] —— 同样面向低码率和实时场景，但标准、许可和浏览器生态不同。
- [[flac]] —— 无损压缩代表，用来对比“保真保存”和“有损传输”的差别。
- [[webrtc]] —— 实时音视频系统会关心延迟、抖动和音频编码器选择。
- [[libavcodec]] —— FFmpeg 的编解码库抽象，帮助理解 codec wrapper 如何接第三方库。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
