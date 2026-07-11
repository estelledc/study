---
title: 'Whisper — OpenAI 多语言 ASR'
来源: 'https://github.com/openai/whisper'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
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
- 为什么 ChatGPT 的语音输入、各类 AI 笔记 app、开源字幕工具背后**几乎都是 Whisper 或 Whisper 的衍生**（whisper.cpp / faster-whisper）——端侧与云端共用同一套权重生态
- 为什么过去十年「每种语言一个模型」的传统 ASR 范式在 2022 年被打破——**弱监督 + 大数据**被验证可以替代「精标小数据」
- 为什么这是少数 OpenAI **真正开源（MIT 许可）权重**的项目——和 GPT 系列闭源形成鲜明对比

## 核心要点

记 **3 个关键设计 + 1 个 prompt 协议**：

1. **架构是标准 Encoder-Decoder Transformer**：类比「听写员先听完整段（Encoder），再一句句写下来（Decoder）」。Encoder 读 30 秒的 log-mel 频谱图（把声音画成「音高热力图」），Decoder 一个字一个字吐出文本。**没有传统 ASR 那套声学模型 + 发音词典流水线**——就是把 NLP 的翻译模型搬过来。

2. **训练数据是 68 万小时弱监督音频**：弱监督 = 网上爬来的「音频 + 字幕」配对，不人工精标。含 11.7 万小时非英语 + 12.5 万小时「外语音频→英语字幕」翻译对。类比：不请专业速记员校对，直接拿海量粗糙字幕当教材，靠量硬扛。

3. **任务靠特殊 token 切换**：Decoder 第一步喂 `<|startoftranscript|><|zh|><|transcribe|>` 就是「中文转写」；换成 `<|fr|><|translate|>` 就是「法语→英语翻译」。类比：同一本字典，封面贴纸决定「只听写」还是「听写并翻成英文」。

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

**逐部分解释**：

- `load_model("medium")`：下载并加载中等尺寸权重（约 769M 参数）
- `language="zh"`：跳过自动语种识别，直接当中文处理
- `result["segments"]`：按时间切好的片段列表；`start` 是起点秒数，`text` 是该段文字
- 命令行加 `--output_format srt` 可直接导出字幕文件

### 案例 2：让外语音频直接出英文字幕

```python
result = model.transcribe("french_podcast.mp3", task="translate")
print(result["text"])  # 全英文，源语言不需要指定
```

**逐部分解释**：

- 默认 `task="transcribe"` = 原语言听写；这里改成 `"translate"` = 听外语、写英文
- 源语言可省略：模型会先猜语种，再端到端翻成英文
- 2022 年前通常要「ASR + 机器翻译」两步级联，错误会累加；Whisper 训练时直接见过「法语音频→英语文本」配对，**一步出结果**

### 案例 3：whisper.cpp 在 iPhone / Mac 本地跑

```bash
git clone https://github.com/ggerganov/whisper.cpp
make
# 旧版入口 ./main；新版多为 ./whisper-cli
./whisper-cli -m models/ggml-base.bin -f sample.wav
```

**逐部分解释**：

- `make`：编出不依赖 Python / PyTorch 的纯 C 二进制
- `-m`：指定 GGML 量化后的权重文件（体积更小）
- `-f`：输入 wav；可在 iPhone / Raspberry Pi 上实时跑 base
- 这是 Whisper 生态最重要的衍生——把云端 API 能力压进端侧

## 踩过的坑

1. **长音频幻觉**：按 30 秒窗口推理，长沉默时会编造「谢谢观看」之类训练数据里常见的片尾字幕。解法：先用 VAD（语音活动检测，判断「有没有人在说话」）切掉静音，或调严 `--no_speech_threshold`。
2. **窗口边界拼接错位**：长音频拼回来时词可能在边界被腰斩或重复。用 `condition_on_previous_text=True`，或换 faster-whisper / WhisperX。
3. **不会做说话人分离**：只输出文字，不知道谁说的。会议要分「张三 / 李四」需再跑 pyannote / WhisperX 做 diarization（按说话人打标签），再按时间戳合并。
4. **中文标点常混半角**：训练字幕风格不统一，需后处理统一全角标点。
5. **GPU 显存吃法非线性**：large 在 fp16（半精度浮点）约需 ~10 GB；再开 `word_timestamps=True` 会翻倍。faster-whisper 用 INT8（8 位整数）+ CTranslate2 把 large 压到约 4 GB 且更快。
6. **不写 `language` 会先跑语种识别**：已知中文时显式传 `language="zh"` 能省 5%–10% 时间。
7. **`initial_prompt` 是软引导不是词表**：可塞专有名词先验，但模型不一定听话——重要术语仍要后处理。

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
- 对术语表 / 专有名词强约束 → 不接受自定义词表，只能靠 `initial_prompt` 软引导

## 历史小故事（可跳过）

- **2022-09**：OpenAI 发布 Whisper，论文《Robust Speech Recognition via Large-Scale Weak Supervision》把「弱监督 + 大数据」写进标题。
- **2022-10**：Georgi Gerganov 启动 whisper.cpp；后来 GGML 思路复用到 llama.cpp，**点燃本地 LLM 浪潮**。
- **2023**：HuggingFace 发布 distil-whisper（蒸馏约 6× 小），SYSTRAN 发布 faster-whisper（约 4× 快）。生态分化为准确率派与速度派。
- **2023-11**：large-v3 发布，频谱图通道从 80 改到 128，小语种覆盖增强。
- **2024**：Whisper 成为开源字幕 / AI 笔记 / 播客转写的事实标准引擎。

## 学到什么

1. **架构选「标准 + 简单」往往赢过「专用 + 复杂」**——普通 Encoder-Decoder Transformer 把语音问题 NLP 化
2. **数据规模可以补齐标注质量**——68 万小时网络音频比 1 千小时人工精标更有效，前提是模型够大
3. **多任务靠 prompt 协议解决**：转写 / 翻译 / 语种识别 / 时间戳全靠 token 切换——把 [[gpt]] 思路引入 ASR
4. **开源权重的网络效应**：MIT 许可催生 whisper.cpp / faster-whisper / distil-whisper，反过来放大 Whisper 使用规模
5. **「鲁棒性」可以用噪声训练数据获得**：口音、背景噪音、低采样率的抗性，是被 68 万小时烂质量音频喂出来的

## 延伸阅读

- 官方仓库：[github.com/openai/whisper](https://github.com/openai/whisper)
- 论文：[Robust Speech Recognition via Large-Scale Weak Supervision](https://arxiv.org/abs/2212.04356)
- whisper.cpp：[github.com/ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- faster-whisper：[github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- distil-whisper：[huggingface.co/distil-whisper](https://huggingface.co/distil-whisper)
- WhisperX：[github.com/m-bain/whisperX](https://github.com/m-bain/whisperX)

## 关联

- [[pytorch]] —— Whisper 训练和推理框架
- [[transformers]] —— HuggingFace 的 Whisper 实现入口（`pipeline("automatic-speech-recognition")`）
- [[gpt]] —— Decoder 结构与「prompt 切任务」思路同源
- [[llama-cpp]] —— whisper.cpp 是 llama.cpp 的前身，同一作者同一套 GGML 量化思路
- [[accelerate]] —— 训练这类规模模型时的分布式抽象层
- [[ffmpeg]] —— 转写前常先用它把任意音频转成 Whisper 能吃的 wav / mp3
