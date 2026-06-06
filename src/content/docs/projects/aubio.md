---
title: aubio — 实时音频事件检测库
来源: 'https://github.com/aubio/aubio'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
---

## 是什么

**aubio** 是 C/Python 库：从音频流里检测 **onset（起音）、节拍、音高、MFCC** 等音乐信息，适合实时与离线分析。

日常类比：人耳能听出「鼓点来了」「这句起了一个 C4」。aubio 像**给程序装耳蜗**——把波形变成「第 3.2 秒有一次敲击、基频 440Hz」这类事件。

Python 快速试用：

```bash
pip install aubio
aubioonset input.wav          # 打印 onset 时间戳
aubiopitch input.wav          # 每帧音高
```

## 为什么重要

不理解 aubio，音乐信息检索与互动应用会缺工具：

- **轻量 C 核心 + Python 绑定**：比 heavyweight DAW 分析更适合嵌入
- **与 librosa 算法亲戚**：README 自承相关，aubio 偏实时 C 实现
- **DJ / 可视化 / 游戏**：节拍驱动动画、自动对拍常用 onset/beat
- **与 [[sox]] 预处理链**：滤波、归一化后再检测更稳

## 核心要点

1. **多种 onset 算法**：energy、hfc、complex 等，材质不同选不同法。

2. **tempo / beat**：`aubio.tempo` 跟拍，输出 BPM 与 beat 时间。

3. **pitch（yinfft 等）**：单音旋律跟踪；复调音乐易误。

4. **MFCC / 滤波器组**：接语音识别或分类前端特征。

5. **CLI 工具族**：`aubiocut` 按 onset 切片，`aubionotes` 输出 midi 式音符。

6. **文档双轨**：Sphinx 手册偏用户，Doxygen 偏 C API，按角色选读。

## 实践案例

### 案例 1：Python 实时 onset

```python
import aubio

hop_s = 512
samplerate = 44100
o = aubio.onset("default", hop_s, hop_s, samplerate)
# 在音频块循环里 o(samples); o.get_last() 得秒级时间戳
```

适合麦克风实时闪光或视觉特效触发。

### 案例 2：aubiocut 自动分轨

```bash
aubiocut -i song.wav -o slice -b
```

按 beat 切成多文件，做采样包或数据集。

### 案例 3：先 [[sox]] 再 aubio

```bash
sox noisy.wav -r 44100 clean.wav highpass 100 norm -1
aubioonset clean.wav
```

减少低频隆隆导致的假 onset。

### 案例 4：与 [[ffmpeg]] 提音频轨

```bash
ffmpeg -i video.mp4 -vn -acodec pcm_s16le audio.wav
aubiotrack audio.wav
```

从视频抽 wav 做节拍网格，给剪辑软件打标记。

## 踩过的坑

1. **hop_size 与窗口**：太小噪声敏感，太大时间分辨率粗，需按 BPM 调。

2. **复调与和弦**：pitch 轨道当旋律用会乱，单音源最准。

3. **采样率不一致**：检测前统一 44100 或 22050，勿混用。

4. **实时延迟**：块越小延迟越低，但 CPU 与稳定性变差。

5. **安装依赖**：部分平台要 C 编译器；conda-forge 包省事。

6. **名称玩笑**：README 说 aubio 来自 audio 拼写错误——文档幽默但 API 严肃。

## 适用 vs 不适用场景

**适用**：
- 节拍检测、自动切片、简单音高跟踪
- 嵌入式与 Raspberry Pi 实时分析
- 音乐信息检索入门实验

**不适用**：
- 高质量分离人声伴奏（用深度学习源分离）
- 母带级音效（用 [[sox]]/DAW）
- 视频编解码（[[ffmpeg]]）

## 历史小故事（可跳过）

- **Paul Brossier 等**：巴黎 IRCAM 传统音乐信息检索背景
- **GPL v3**：嵌入闭源需注意许可证
- **Python 模块与 C CLI 并行**：科研用 Python，批处理用命令行
- **与 librosa 生态互补**：论文复现常两者对照

## 学到什么

1. **onset ≠ beat**：起音是瞬态，节拍是周期网格
2. **算法选择比调参更重要**：打击乐与钢琴用不同 onset
3. **预处理决定上限**：[[sox]] 滤波 Often 比换算法划算
4. **实时块处理是嵌入式思维**：与批处理 WAV 两套调参
5. **CLI 适合胶水脚本**：与 shell 管道组批
6. **GPL 嵌入要合规**：静态链入闭源 App 前咨询许可证

## 延伸阅读

- [aubio 手册](https://aubio.org/manual/latest/)
- [Python README](https://github.com/aubio/aubio/blob/master/python/README.md)
- [[sox]] —— 预处理
- [[flac]] —— 无损中间格式
- [[ffmpeg]] —— 抽音频轨

## 关联

- [[sox]] —— 波形预处理
- [[flac]] —— 无损源
- [[ffmpeg]] —— 抽轨与转码
- [[obs-studio]] —— 录制源
- [[pion]] —— 实时音频另一栈（Opus）
- [[video.js]] —— 播放与分析分离
- [[mediasoup]] —— 实时音频会议另一技术线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dash.js]] —— dash.js — 浏览器 MPEG-DASH 参考播放器
- [[essentia]] —— Essentia — 音乐信息检索工具箱
- [[flac]] —— FLAC — 无损音频压缩格式与参考实现
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[sox]] —— SoX — 命令行音频处理瑞士军刀
- [[video.js]] —— Video.js — Web 视频播放器框架

