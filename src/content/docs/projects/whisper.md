---
title: 'Whisper — OpenAI 多语言 ASR'
来源: 'https://github.com/openai/whisper'
日期: '2026-05-31'
子分类: 数据科学与 AI
分类: 机器学习
难度: '中级'
provenance: pipeline-v3
---

## 是什么

Whisper 是 OpenAI 2022 年开源的**自动语音识别**（ASR）系统：**一个权重文件吃 99 种语言的转写 + 任意语言→英语的翻译**，本地就能跑。日常类比：像一个**会 99 种语言的速记员**，你把音频塞给他，不管是普通话播客、法语会议还是带口音的英语电话录音，他都能写下来；如果你额外让他「翻成英文」，他还能边听边翻。

最小用法（命令行）：

```bash
pip install -U openai-whisper
whisper audio.mp3 --model medium --language Chinese
```

或者 Python：

```python
import whisper
model = whisper.load_model("medium")
result = model.transcribe("audio.mp3")
print(result["text"])
```

模型权重几百 MB 到 1.5 GB，**完全离线运行**，不向任何服务器发数据。这一点把它和云端 ASR API（Google / Azure / Deepgram）彻底区分开。

## 为什么重要

不理解 Whisper，下面这些事会卡住你：

- 为什么 2023 年之后**几乎所有「字幕生成 / 会议转写 / 播客检索」的开源工具**都直接套 Whisper——因为它一份模型解决了多语言这个最大的工程麻烦
- 为什么 ChatGPT 的语音输入、Apple 的 Voice Memo 转写、各种 AI 笔记 app 的录音功能背后**几乎都是 Whisper 或 Whisper 的衍生**（whisper.cpp / faster-whisper）
- 为什么过去十年「每种语言一个模型」的传统 ASR 范式在 2022 年突然终结——**弱监督 + 大数据**这条路被验证可以替代「精标小数据」
- 为什么这是少数 OpenAI **真正开源（MIT 许可）权重**的项目——和 GPT 系列闭源形成鲜明对比

## 核心要点

记 **3 个关键设计 + 1 个 prompt 协议**：

1. **架构是标准 Encoder-Decoder Transformer**：和翻译模型同款。Encoder 读 30 秒的 80 通道 log-mel 频谱图，Decoder 自回归地吐 token。**没有任何语音专用的奇技淫巧**——就是 NLP 那一套搬过来。

2. **训练数据是 68 万小时弱监督音频**：直接从互联网爬「音频 + 字幕」配对，含 11.7 万小时非英语 + 12.5 万小时「外语音频→英语字幕」翻译对。**不做精标、不做对齐**，靠数据量和噪声多样性硬扛。

3. **任务靠特殊 token 切换**：Decoder 第一步喂 `<|startoftranscript|><|zh|><|transcribe|>` 就是「中文转写」；换成 `<|fr|><|translate|>` 就是「法语→英语翻译」；不指定语种就让模型自己识别。**一个模型多任务，靠 prompt 协议复用 weights**。

4. **5 种尺寸阶梯**：tiny（39M）/ base（74M）/ small（244M）/ medium（769M）/ large（1550M）。后续 large-v2、large-v3 增量更新 large 档。**移动端选 tiny / base，会议转写选 medium，专业字幕选 large**。

合起来一句话：**用 NLP 的标准做法 + 海量弱监督数据，把 ASR 做成了和翻译一样的 seq2seq 任务**。

## 实践案例

### 案例 1：5 行 Python 跑会议转写带时间戳

```python
import whisper
model = whisper.load_model("medium")
result = model.transcribe("meeting.mp3", language="zh", verbose=True)
for seg in result["segments"]:
    print(f"[{seg['start']:.1f}s] {seg['text']}")
```

输出形如 `[12.3s] 我们这周的目标是...`。**直接拿来做字幕文件**（SRT / VTT 格式 Whisper 命令行原生支持 `--output_format srt`）。

### 案例 2：让外语音频直接出英文字幕

```python
result = model.transcribe("french_podcast.mp3", task="translate")
print(result["text"])  # 全英文，源语言不需要指定
```

这一步在 2022 年之前需要「ASR + 机器翻译」两步级联，错误会累加。Whisper 训练时直接见过「法语音频→英语文本」的配对，**端到端一步出结果**，质量反而更好。

### 案例 3：whisper.cpp 在 iPhone / Mac 本地跑

```bash
git clone https://github.com/ggerganov/whisper.cpp
make && ./main -m models/ggml-base.bin -f sample.wav
```

Georgi Gerganov（也是 llama.cpp 作者）用 C++ + GGML 量化把 Whisper 移植到「无 Python、无 PyTorch」的纯 C 二进制，能在 iPhone / Raspberry Pi 上实时跑 base 模型。**这是 Whisper 生态最重要的衍生**——把云端 API 的能力压进端侧。

## 踩过的坑

1. **长音频幻觉**：Whisper 按 30 秒窗口推理，遇到长沉默或纯背景噪音会**编造文本**（比如反复输出「谢谢观看」「字幕由 XX 提供」——训练数据里 YouTube 字幕末尾常有这种话）。解法：先跑 VAD（语音活动检测）切掉静音段，或用 `--no_speech_threshold` 调更严。

2. **窗口边界拼接错位**：30 秒一段独立解码，长音频拼回来时**词可能在边界处被腰斩或重复**。faster-whisper / WhisperX 用「上一段最后 5 秒作 prompt」缓解，原版 Whisper 也支持 `condition_on_previous_text=True`。

3. **不会做说话人分离**：Whisper 只输出文字，**不知道是谁说的**。会议转写要分「张三说 / 李四说」需要再跑 pyannote / WhisperX 做 diarization，然后按时间戳合并。

4. **中文标点和英文标点会混**：训练数据里中文字幕的标点风格不统一，转写中文音频可能吐出半角逗号、空格分词。需要后处理统一。

5. **GPU 显存吃法非线性**：large 在 fp16 推理需要 ~10 GB，但**长音频 + word_timestamps=True** 会再翻倍（要存对齐用的 cross-attention 权重）。faster-whisper 用 INT8 + CTranslate2 把 large 压到 4 GB 还快 4 倍。

6. **`language` 参数不写就先跑一次语种识别**：默认行为是先用前 30 秒做 language detection 再转写，开销是「白跑一遍 encoder」。如果你已经知道是中文，**显式传 `language="zh"` 能省 5%-10% 时间**。

7. **`initial_prompt` 是软引导不是词表**：想让模型把「张三」「LLM」「向量数据库」这些专有名词写对，可以塞进 `initial_prompt="本期讨论张三、LLM、向量数据库..."`。但这只是给 Decoder 一段先验，模型不一定听话——重要术语该后处理还是要后处理。

## 适用 vs 不适用场景

**适用**：

- 离线 / 隐私敏感的语音转写（医疗、法律、企业会议）
- 多语种内容本地化（一份代码处理 99 种语言）
- 字幕生成 / 播客检索 / 录音笔记 app 的核心引擎
- 嵌入端侧设备（用 whisper.cpp / faster-whisper / distil-whisper 量化版）

**不适用**：

- 实时流式低延迟（< 300ms）→ Whisper 是 30 秒分块的非流式架构，要 streaming 用 RNN-T 类模型或 faster-whisper streaming 分支
- 必须有说话人分离 → 需要叠 pyannote / WhisperX
- 极小语种（训练数据不足的语言） → 准确率显著低于英语 / 中文 / 西语等头部语种
- 对术语表 / 专有名词强约束 → Whisper 不接受「自定义词表」，专业术语只能靠 [[whisper]] 的 `initial_prompt` 软引导

## 历史小故事（可跳过）

- **2022-09**：OpenAI 发布 Whisper，论文标题《Robust Speech Recognition via Large-Scale Weak Supervision》——明确把「弱监督 + 大数据」作为核心论点。
- **2022-10**：Georgi Gerganov 启动 whisper.cpp，证明 ASR 可以脱离 Python 跑在端侧。后来这套 GGML 思路被复用到 llama.cpp，**点燃了本地 LLM 浪潮**。
- **2023**：HuggingFace 发布 distil-whisper（蒸馏 6× 小、2× 快），SYSTRAN 发布 faster-whisper（CTranslate2 重写 4× 快）。生态分化为「准确率派」和「速度派」。
- **2023-11**：large-v3 发布，新增对部分小语种的覆盖，频谱图通道从 80 改到 128。
- **2024**：Whisper 成为 ChatGPT 语音输入、各种 AI 笔记 app、播客平台字幕功能的事实标准。

## 学到什么

1. **架构选「标准 + 简单」往往赢过「专用 + 复杂」**——Whisper 用最普通的 Encoder-Decoder Transformer，把语音问题完全 NLP 化
2. **数据规模可以补齐标注质量**——68 万小时网络音频比 1 千小时人工精标更有效，前提是模型够大
3. **多任务靠 prompt 协议解决**：转写 / 翻译 / 语种识别 / 时间戳全靠 token 切换，不需要多个 head——这是把 [[gpt]] 思路引入 ASR
4. **开源权重的网络效应**：MIT 许可让 whisper.cpp / faster-whisper / distil-whisper 这一整片生态长出来，反过来让 Whisper 本身使用规模指数级扩大
5. **「鲁棒性」可以用噪声训练数据获得**：对口音、背景噪音、低采样率的鲁棒，**不是设计出来的，是被 68 万小时各种烂质量音频喂出来的**——这一点改变了语音处理领域的训练数据观

## 延伸阅读

- 官方仓库（最佳起点）：[github.com/openai/whisper](https://github.com/openai/whisper)
- 论文：[Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356)
- whisper.cpp（端侧 C++ 移植）：[github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- faster-whisper（4× 加速）：[github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- distil-whisper（6× 蒸馏）：[huggingface.co/distil-whisper](https://huggingface.co/distil-whisper)
- WhisperX（强制对齐 + diarization）：[github.com/m-bain/whisperX](https://github.com/m-bain/whisperX)
- 解读文章：[The Illustrated Whisper](https://amgadhasan.substack.com/p/sota-asr-tooling-long-form-transcription)（图解长音频转写流程）

## 关联

- [[pytorch]] —— Whisper 训练和推理框架
- [[transformers]] —— HuggingFace 的 Whisper 实现入口（`pipeline("automatic-speech-recognition")`）
- [[gpt]] —— Whisper 的 Decoder 结构和「prompt 切任务」思路同源
- [[llama-cpp]] —— whisper.cpp 是 llama.cpp 的前身，同一作者同一套 GGML 量化思路
- [[accelerate]] —— 训练 Whisper 这种规模模型时的分布式抽象层
- [[hindley-milner]] —— 不直接相关，但同样体现「一套通用机制覆盖大量特例」的设计哲学
