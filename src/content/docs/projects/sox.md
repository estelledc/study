---
title: SoX — 命令行音频处理瑞士军刀
来源: 'https://github.com/chirlu/sox'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 初级
---

## 是什么

**SoX**（Sound eXchange）是跨平台 **命令行音频工具**：读一种格式、施加效果、写出另一种格式，三十年来被戏称为「音频界的 sed/awk」。

日常类比：Photoshop 有「滤镜」菜单。SoX 在终端里对声波做同样的事——**重采样、均衡、变速、合成、统计**，一条命令批处理成百文件。

```bash
sox input.wav output.flac          # 格式转换
sox input.wav output.wav fade 1 0 1  # 淡入淡出
sox -n drum.wav synth 1 sine 440    # 生成 1 秒 440Hz 测试音
```

包名在各系统多为 `sox`；与 Audacity 导出的 wav 完全兼容。

## 为什么重要

不理解 SoX，音频脚本化会退回 GUI 或笨重 Python：

- **流水线友好**：与 [[flac]]、[[ffmpeg]]、shell 管道自然组合
- **效果可复现**：参数写进脚本，比手点 DAW 可审计
- **轻量分析**：`sox stat` 看峰值/RMS，无需开 Audacity
- **教学 DSP 入门**：reverb、compand 等效果参数直观

## 核心要点

1. **全局选项 + 多个输入文件 + 效果链 + 输出**：顺序即信号流。

2. **多轨混合**：`sox -m a.wav b.wav mix.wav` 把两路混成一路。

3. **synth 内置振荡器**：测试设备、生成提示音不需外部采样。

4. **rate / resample**：高质量重采样依赖 libsoxr，注意别重复有损编码。

5. **与 libSoX 绑定**：C API 供其它程序嵌入基础效果。

6. **play 子命令**：`play file.wav` 快速试听效果链结果，无需另开播放器。

## 实践案例

### 案例 1：批量转 16kHz 单声道给 ASR

```bash
for f in *.wav; do
  sox "$f" -r 16000 -c 1 "out/${f%.wav}.wav" norm -0.1
done
```

语音识别模型常要固定采样率与归一化音量。

### 案例 2：拼接播客片头片尾

```bash
sox intro.wav episode.wav outro.wav final.wav
```

中间可加 `pad 0 0.5` 插半秒静音。

### 案例 3：与 [[aubio]] 前置处理

先用 SoX 去直流、带通滤波，再喂 aubio 做节拍检测，减少误检。

### 案例 4：导出 [[flac]] 无损归档

```bash
sox master.wav -t flac master.flac compand 0.3,1 -90,-90,-70,-70,-60,-20,0,0 -5 0 0.2
```

压缩器轻微修整动态再无损封装（仍是有损效果链，若要保持原始请少效果）。

### 案例 5：生成静音占位

```bash
sox -n silence.wav trim 0.0 2.0
```

剪辑时间线补空档，避免播放器跳时间戳。

## 踩过的坑

1. **多次有损格式往返**：wav→mp3→wav 会劣化；中间尽量 wav/flac。

2. **clip 与 norm**：盲目 norm 可能削波，先看 `sox stat -x`。

3. **效果顺序敏感**：`reverb` 在 `compand` 前后听感不同。

4. **macOS 默认 sox 过旧**：Homebrew 装新版，旧版缺格式。

5. **多声道 downmix 规则**：`-c 1` 默认混音公式可能不符合广播标准，查 remix 效果。

6. **Windows 路径与引号**：含空格文件名要引好，与 Unix 脚本略有差异。

7. **dither 与位深**：降到 16bit 发布版时加 dither，避免量化失真。

## 适用 vs 不适用场景

**适用**：
- 批处理转格式、剪静音、标准化音量
- 生成测试信号、简单混音
- CI 里自动处理音频资产

**不适用**：
- 多轨非线性编辑（用 DAW）
- 实时低延迟效果（专业音频接口 + JACK）
- 视频轨处理（用 [[ffmpeg]]）

## 历史小故事（可跳过）

- **1991 起**：Chris Bagwell 维护，比许多 Web 框架还老
- **「瑞士军刀」绰号**：社区口口相传
- **chirlu/sox GitHub**：持续移植与修复现代编译环境
- **与 [[flac]] 同属无损工作流常客**

## 学到什么

1. **命令行音频 = 效果链思维**，与 [[ffmpeg]] 滤镜类似
2. **synth 与 stat 是调试利器**，不必打开 GUI
3. **批处理脚本可版本管理**，复现实验靠参数文件
4. **与 [[aubio]] 分工**：SoX 改波形，aubio 提特征
5. **先 wav/flac 再分发有损**：SoX 常在中游
6. **rec 子命令录音**：`rec test.wav trim 0 5` 快速抓麦克风五秒
7. **help-effect 查参数**：每个效果都有独立手册页

## 延伸阅读

- [SoX 官方文档](http://sox.sourceforge.net/Docs/Documentation)
- `man sox` / `sox --help-effect`
- [[flac]] —— 无损输出
- [[ffmpeg]] —— 音视频一体
- [[aubio]] —— 节拍与音高

## 关联

- [[flac]] —— 无损格式
- [[ffmpeg]] —— 视频与容器
- [[aubio]] —— 分析下游
- [[obs-studio]] —— 录制后处理
- [[video.js]] —— 播放端与 SoX 无直接关系
- [[pion]] —— 实时 Opus 另一场景
- [[mediasoup]] —— 实时会议音频另一栈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ardour]] —— Ardour — 专业级 DAW
- [[aubio]] —— aubio — 实时音频事件检测库
- [[audacity]] —— Audacity — 开源音频编辑器
- [[essentia]] —— Essentia — 音乐信息检索工具箱
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[flac]] —— FLAC — 无损音频压缩格式与参考实现
- [[lame]] —— LAME — MP3 编码开源参考实现
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[supercollider]] —— SuperCollider — 实时音频合成环境

