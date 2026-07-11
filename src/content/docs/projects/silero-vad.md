---
title: 'Silero VAD — 轻量语音活动检测'
来源: 'https://github.com/snakers4/silero-vad'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '入门'
---

## 是什么

Silero VAD 是一个**只有约 2 MB**的开源语音活动检测模型：把一段音频切成 **32 毫秒**的小块（16 kHz 下固定 512 样本），它逐块告诉你「这一块是有人在说话，还是静音/背景噪声」。日常类比：像一个**门口的传达室大爷**，他不识字也不懂英语法语，但能一眼分辨「有人在敲门」和「没人」，然后再决定要不要把客人放进屋里。

最小用法（PyTorch）：

```python
import torch
model, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad')
(get_speech_timestamps, _, read_audio, _, _) = utils

wav = read_audio('meeting.wav', sampling_rate=16000)
ts = get_speech_timestamps(wav, model, sampling_rate=16000)
# [{'start': 12800, 'end': 38400}, {'start': 51200, 'end': 76800}, ...]
```

返回的是一串「说话区间」（采样点下标）。把这些区间切出来塞给下游 ASR，就能省掉绝大多数静音时间。

模型权重 **约 2 MB**，在普通笔记本 CPU 上单线程跑 **每 32 ms 音频耗时 < 1 ms**——也就是说处理速度比音频流入快 30 倍以上。

## 为什么重要

不理解 VAD 这一层，下面这些事都没法解释：

- 为什么 ChatGPT 语音模式、Apple Siri、各家会议转写工具都**不是把麦克风全程录下来扔给大模型**——大模型太贵，必须先用小模型守门
- 为什么会议转写按 90 分钟收费，但实际跑 ASR 的时间只有 40 分钟——VAD 把静音和无人说话的段落直接跳过
- 为什么手机上能本地跑「语音输入」而不发热——VAD 让 ASR 99% 时间睡眠
- 为什么 2022 年之后开源语音流水线**常把 Silero 当默认 VAD**——它是少数 MIT 许可、零 telemetry、不收钱的工业级选择

## 核心要点

记 **3 个关键设计 + 1 个集成模式**：

1. **二分类，不识别内容**：VAD 只回答「是/否有人说话」，**不关心说什么、什么语种、谁在说**。这让模型可以做得极小（约 2 MB），延迟极低（< 1 ms）。

2. **训练覆盖 6000+ 语言**：Silero 团队从全网抓了大量语音/非语音对，覆盖范围远超传统 VAD。结果是**对俄语、中文方言、带口音英语、儿童声音**都能稳定守门，不会把"非英语就当噪声"。

3. **两种部署后端，按需选**：
   - **PyTorch 后端**（默认）：开发友好，但要装 torch + torchaudio，体积上百 MB
   - **ONNX 后端**：纯 ONNX Runtime，模型仍约 2 MB，速度比 PyTorch **快 4–5 倍**，部署到树莓派 / 浏览器 / 手机首选

4. **流式 vs 离线两种集成模式**：
   - **离线**：`get_speech_timestamps(整段音频, model)` → 一次性返回所有说话区间，适合处理录好的音频
   - **流式**：每 32 ms 喂一帧，模型返回这一帧的说话概率（0–1），自己设阈值判断切换。**这是塞进实时 ASR / 语音机器人的标准用法**

## 实践案例

### 案例 1：给 Whisper 做开关层（最常见）

```python
from faster_whisper import WhisperModel
import torch

vad, utils = torch.hub.load('snakers4/silero-vad', 'silero_vad')
get_speech_timestamps, _, read_audio, _, _ = utils
asr = WhisperModel('medium')

wav = read_audio('podcast.wav', sampling_rate=16000)
segments = get_speech_timestamps(wav, vad, sampling_rate=16000)

for seg in segments:
    chunk = wav[seg['start']:seg['end']]
    parts, _ = asr.transcribe(chunk)
    print(''.join(p.text for p in parts))
```

把一小时播客的静音段切掉，Whisper 实际只跑 30–40 分钟音频，**省一半算力**，转写质量还更稳（没静音段就不会幻觉乱编）。

### 案例 2：实时语音机器人的「打断检测」

语音助手有个经典体验：**用户说话时机器人要立刻闭嘴**。这一步靠 VAD：每 32 ms 一帧地监听麦克风，一旦概率连续约 200 ms 高于 0.5，就触发"用户开始说话"，立即停掉 TTS 和当前 LLM 推理。

```python
import sounddevice as sd, numpy as np, torch
vad, _ = torch.hub.load('snakers4/silero-vad', 'silero_vad')  # 与案例 1 同款加载
buf = np.zeros(0, dtype=np.float32)
def callback(indata, *_):
    global buf
    buf = np.concatenate([buf, indata[:, 0]])
    while len(buf) >= 512:  # 16 kHz → 32 ms
        prob = vad(torch.from_numpy(buf[:512]), 16000).item()
        if prob > 0.5: print('用户在说话')
        buf = buf[512:]
sd.InputStream(samplerate=16000, blocksize=512, callback=callback).start()
```

延迟低到人感觉「机器人是真的在听」，而不是「念完一段才反应」。

### 案例 3：清洗训练数据集

要训自己的 ASR / TTS 模型？数据集里通常 30–50% 是静音和噪声段。四步预处理：

1. **跑 VAD**：对整段录音调用 `get_speech_timestamps`
2. **切段**：按返回的 start/end 切片
3. **加 padding**：每段边界各留约 0.5 秒，避免吞字
4. **导出**：只保留语音段写入新数据集

数据集常能瘦身一半，训练速度接近翻倍。

## 踩过的坑

1. **采样率必须严格 8 kHz 或 16 kHz**：喂 44.1 kHz / 48 kHz 不报错但概率全乱。**先用 librosa / torchaudio 重采样**到 16 kHz 再喂。

2. **窗口大小必须是固定值**：16 kHz 下只接受 **512 样本**（32 ms）。多 1 个少 1 个都不行。流式实现要自己攒缓冲区。

3. **概率阈值不是越高越好**：默认 0.5 适合干净录音；电话/远场建议 0.3，否则漏掉低声说话；嘈杂环境（咖啡馆）需要 0.7 + 最小持续时长（200 ms 以上才算「真在说话」）。

4. **PyTorch Hub 缓存第一次要联网**：`torch.hub.load` 会从 GitHub 拉模型，离线环境会卡。生产部署要么提前缓存，要么用 ONNX 文件直接加载。

5. **不要拿 VAD 当「噪声门」**：它只判断「是不是人声」，不会去除背景音乐、电视声。要降噪请配合 RNNoise / DeepFilterNet。

## 适用 vs 不适用场景

**适用**：

- 给 ASR / 语音机器人 / 字幕工具做**开关层**——最经典用法
- **数据集预处理**：从长录音里切出说话段
- **会议录音/电话客服**自动剪辑：跳过静音和等待
- **边缘设备**（树莓派、ESP32-S3、手机）：约 2 MB 模型 + ONNX 几乎无门槛

**不适用**：

- **说话人分离**（diarization）→ 用 pyannote.audio
- **关键词唤醒**（"Hey Siri"）→ 用 openWakeWord / Porcupine，VAD 不识别词
- **情感/语种识别**→ 用 SpeechBrain，VAD 只做二分类
- **音乐 vs 语音区分** → Silero 把唱歌也当语音，需专门 music detection 模型

## 历史小故事（可跳过）

- **2020 年**：Silero 团队（来自俄语圈的小团队）开源 Silero TTS，主打"小、快、多语种"，社区认可度起飞
- **2021 年**：发布 Silero VAD v1，对标 WebRTC VAD（Google 2010 年代的传统 GMM 方案）
- **2023 年**：v4 加入流式 API + 多语种训练，正式成为开源语音流水线默认 VAD
- **2026 年**：v6.2，支持纯 ONNX 部署，模型再次压缩，延迟 < 1 ms

整条线和 OpenAI 大模型路线刚好相反：**越小越快越多语种**。

## 学到什么

1. **流水线分层思想**：贵模型不要全程开，便宜模型守门，只在需要时唤醒下游
2. **二分类问题可以做到极致小**：不识别内容、只判断"有/没有"，约 2 MB 足够覆盖多语种守门
3. **MIT 许可 + 零 telemetry** 在开源语音工具里非常稀缺，是 Silero 能成为默认选项的关键
4. **采样率/窗口大小是音频模型的隐形契约**——这种"看似可调实际写死"的参数最容易踩坑

## 延伸阅读

- 官方仓库（含 examples/ 目录覆盖 8 种集成）：[snakers4/silero-vad](https://github.com/snakers4/silero-vad)
- 对比基准：[Picovoice VAD Benchmark](https://github.com/Picovoice/voice-activity-benchmark)（Silero 在多数指标领先）
- WebRTC VAD 老前辈源码：[wiseman/py-webrtcvad](https://github.com/wiseman/py-webrtcvad)（看完会理解为什么需要新一代 VAD）
- [[whisper]] —— Silero VAD 最常见的下游消费者
- [[faster-whisper]] —— 性能更高的 Whisper 加速版，搭配 Silero 是开源转写黄金组合

## 关联

- [[whisper]] —— ASR 模型，VAD 给它做开关层最经典用例
- [[faster-whisper]] —— Whisper 的 4× 加速版，社区一般 Silero + faster-whisper 拼成端到端
- [[coqui-tts]] —— 输出语音的另一端，VAD 同样守在它的输入侧
- [[onnx-runtime]] —— Silero 推荐的高性能后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
