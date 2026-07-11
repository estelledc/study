---
title: 'Coqui TTS — 多语种 TTS 工具包'
来源: 'https://github.com/coqui-ai/TTS'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

Coqui TTS 是一套基于 PyTorch 的**开源文本转语音工具包**：**一份代码库覆盖从 Tacotron2 到 XTTS-v2 的整条主流 TTS 模型谱系**，可以训练、合成、做声音克隆。日常类比：像一个**TTS 主题的瑞士军刀**——你想要的「读出文字」「换不同声线」「拿 6 秒录音克隆某个人的声音」「一句话切日语再切中文」全部在同一把刀里。

最小用法（Python）：

```python
from TTS.api import TTS
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2')
tts.tts_to_file(text='你好世界', speaker_wav='ref.wav',
                language='zh-cn', file_path='out.wav')
```

或者 CLI：

```bash
pip install coqui-tts
tts --text "你好" --model_name tts_models/zh-CN/baker/tacotron2-DDC-GST \
    --out_path out.wav
```

仓库由前 Mozilla TTS 团队 2020 年从 Mozilla TTS 分叉重写而来。Coqui Inc 公司 2024-01 关闭后原仓库归档，社区维护 fork 在 `idiap/coqui-ai-TTS`。

## 为什么重要

不理解 Coqui TTS，下面这些事会卡住你：

- 为什么开源 TTS 圈讨论「baseline」时几乎默认指 Coqui——它是**唯一一个把 Tacotron2 / VITS / XTTS 都跑得通**的代码库
- 为什么 2023-2024 年大量「克隆某 UP 主声音读小说」的工具背后是 XTTS-v2——**6 秒参考音 + 17 语言**这个组合在闭源以外无人能及
- 为什么 TTS 社区会用「acoustic model + vocoder 两段式」这种 2020 年代以前的术语，又会用「end-to-end」「flow-based」这种新词——Coqui 仓库里两种范式都在，正好是分水岭样本
- 为什么 Bark / Tortoise / Fish-Speech 这些后起之秀仍要用 Coqui 做 baseline 对比——它的预训练模型是事实标准

## 核心要点

记 **3 条架构脉络 + 1 条工程现实**：

1. **两段式 vs 端到端**：早期 TTS 是「文字 → mel 频谱（声学模型）→ 波形（声码器）」两段式，例如 Tacotron2 + HiFi-GAN。VITS（2021）把两段折叠成一个网络，**端到端训练直接出波形**。Coqui 仓库里两类模型都在 `TTS/tts/models/` 和 `TTS/vocoder/models/` 下，可以对比着读。

2. **XTTS = GPT 思路用到语音**：XTTS-v2 把语音离散化成 token，再用 GPT 风格的自回归 Transformer 预测下一个语音 token，最后一个解码器把 token 还原为波形。这条思路和 [[whisper]] 把 ASR 做成 seq2seq 是同一类哲学：**用 NLP 的标准做法处理语音**。

3. **零样本语音克隆靠 speaker embedding**：XTTS-v2 / YourTTS 都从参考音频里提取一个固定长度向量（speaker embedding），再让生成网络在这个向量条件下输出波形。**6 秒参考音**够提取稳定 embedding，所以不需要重新训练就能克隆任意人声。

4. **工程现实——许可证陷阱**：仓库本身是 MPL 2.0（宽松开源），但 XTTS-v2 **模型权重是 CPML 许可（仅限非商用）**。商用必须用 VITS / Tacotron2 自己训，或者去 Coqui 的商业版（已停售）。

合起来一句话：**用一份 PyTorch 代码库覆盖 TTS 五年里的三代架构，并把零样本语音克隆做成开箱即用**。

## 实践案例

### 案例 1：5 行 Python 用 XTTS-v2 克隆任意人声

```python
from TTS.api import TTS
tts = TTS('tts_models/multilingual/multi-dataset/xtts_v2', gpu=True)
tts.tts_to_file(
    text='今天天气真好，我们去公园散步吧。',
    speaker_wav='reference_6s.wav',  # 6 秒以上单人音频
    language='zh-cn',
    file_path='cloned.wav',
)
```

`reference_6s.wav` 是任意人讲 6 秒以上的单声道音频。模型从中提取 speaker embedding，再合成「这个人念这句中文」的波形。**没有训练步骤**，是真正的零样本克隆。

### 案例 2：用 VITS 自己从头训一个特定说话人

```bash
python TTS/bin/train_tts.py \
    --config_path configs/vits_ljspeech.json
```

`configs/vits_ljspeech.json` 是仓库提供的 LJSpeech 数据集配方。换成自己的 `(text, wav)` pair 数据集（一般 10 小时起步）就能训出专属声线。VITS 端到端训练，**不需要单独训声码器**——这是相比 Tacotron2 时代的重大简化。

### 案例 3：CLI 一行做长文本播报

```bash
tts --text "$(cat article.txt)" \
    --model_name tts_models/zh-CN/baker/tacotron2-DDC-GST \
    --vocoder_name vocoder_models/universal/libri-tts/fullband-melgan \
    --out_path article.wav
```

这是经典两段式：Tacotron2-DDC-GST 出 mel 频谱，再用 fullband-melgan 这个通用声码器把频谱还原成波形。**两段式的好处是声码器可以复用**——同一个 melgan 给任何输出 mel 的声学模型用。

## 踩过的坑

1. **原仓库归档了**：Coqui Inc 2024-01 关闭后 `coqui-ai/TTS` 不再更新。**用 `idiap/coqui-ai-TTS` fork**（PyPI 包名 `coqui-tts`）。原始 PyPI 包名 `TTS` 已停更。

2. **XTTS-v2 商用许可陷阱**：模型许可是 CPML（Coqui Public Model License），**仅限非商用**。商用必须用 VITS / Tacotron2 自训权重，或评估 OpenVoice / Fish-Speech 等替代品。

3. **espeak-ng 系统依赖**：`phonemizer` 这一步需要 espeak-ng 二进制。macOS 要 `brew install espeak-ng`，Ubuntu 要 `apt install espeak-ng`，**`pip install` 装不全**——这是新手最常见的安装失败原因。

4. **CPU 推理慢得不实用**：XTTS-v2 在 CPU 上合成 10 秒文本要数分钟。**GPU 4 GB VRAM 起步**，T4 / RTX 3060 以上才舒服。

5. **参考音质量强决定克隆质量**：reference_wav 需要 ≥ 6 秒、单一说话人、低噪声、最好 24 kHz 单声道。**带背景音乐 / 多人对话 / 短于 3 秒的音频克隆出来全是噪声**。

6. **采样率默认 24 kHz**：XTTS-v2 输出 24 kHz，很多语音管线（如电话级 8 kHz、ASR 常用 16 kHz）不匹配，**对接前要先 `librosa.resample` 重采样**。

7. **中文质量弱于英语**：XTTS-v2 的中文（zh-cn）训练数据远少于英语，多音字、儿化音、方言会出错。**专业中文场景建议用 Bert-VITS2 / GPT-SoVITS 中文社区分支**。

8. **VITS 微调显存吃紧**：单卡训 VITS 至少 16 GB VRAM；XTTS-v2 微调要 24 GB。**消费级显卡只能跑推理或用 LoRA + 梯度检查点**。

## 适用 vs 不适用场景

**适用**：

- 有声书 / 短视频配音 / 播客（非商用 demo 阶段直接用 XTTS-v2）
- 辅助技术（屏幕朗读自定义声线，本地运行隐私可控）
- 多语言 IVR / 客服 TTS（VITS 自训权重商用合规）
- 学术研究（架构齐全、代码可读，做新 TTS 方法的 baseline 对比）

**不适用**：

- 实时低延迟流式 TTS（< 200ms 首音）→ XTTS 是 chunk 式生成，要 streaming 用 StyleTTS2 streaming 分支或 ElevenLabs API
- 商用语音克隆产品 → 许可证不允许，需要重新训或换 OpenVoice v2
- 极小语种 → XTTS-v2 仅 17 语言，越南语、泰语、阿拉伯语都缺
- 一句话同时切多种语言、带情感细粒度控制 → 看 Bark / Fish-Speech / Style2TTS

## 历史小故事（可跳过）

- **2017**：Mozilla 启动 Mozilla TTS，是开源 Tacotron 的早期工程化实现
- **2020**：Mozilla 裁撤语音团队，原团队成立 Coqui，把 Mozilla TTS fork 出来重写，就是现在的 `coqui-ai/TTS`
- **2021**：YourTTS 发表，**首次端到端工程化「多语种 + 零样本语音克隆」**
- **2023-09**：XTTS-v1 发布，引入 GPT 风格的语音 token 自回归
- **2023-11**：XTTS-v2 发布，17 语言 + 6 秒参考音，**击穿开源 TTS 克隆质量天花板**
- **2024-01**：Coqui Inc 关闭，仓库归档；社区分裂为 `idiap/coqui-ai-TTS` 等多个 fork 继续维护

## 学到什么

1. **TTS 的「两段式 → 端到端 → 自回归 token」三代演进**，在同一个仓库里能完整看到，**这种历史厚度对学架构设计极有价值**
2. **零样本能力来自 speaker embedding 这种条件输入设计**——不是改架构，是把「身份」当成额外输入；这思路和 [[whisper]] 把语种用 token 切换同源
3. **开源工具包的命门是维护**——Coqui 仓库归档之后，PyPI 包要换名字、社区要重新协调，**说明依赖一个公司维护的开源项目是有风险的**
4. **许可证比代码重要**：MPL 2.0 仓库 + CPML 模型这种**双层许可**在 AI 开源里越来越常见，用之前一定看清模型自己的 license
5. **语音处理 = NLP + 信号处理两套思维**：mel 频谱、声码器是信号处理，VITS / XTTS 的 Transformer 又是 NLP，**两边语言不通时要主动切换术语库**

## 延伸阅读

- 官方仓库（已归档，仍是文档最佳起点）：[github.com/coqui-ai/TTS](https://github.com/coqui-ai/TTS)
- 社区维护 fork：[github.com/idiap/coqui-ai-TTS](https://github.com/idiap/coqui-ai-TTS)
- VITS 论文（端到端 TTS 起点）：[Conditional Variational Autoencoder with Adversarial Learning for End-to-End TTS](https://arxiv.org/abs/2106.06103)
- XTTS 报告：[XTTS: a Massively Multilingual Zero-Shot TTS](https://arxiv.org/abs/2406.04904)
- YourTTS 论文（多语种零样本克隆奠基）：[YourTTS](https://arxiv.org/abs/2112.02418)
- HiFi-GAN（最常用声码器）：[HiFi-GAN](https://arxiv.org/abs/2010.05646)
- Bark（基于 GPT 的另一条 TTS 路线）：[github.com/suno-ai/bark](https://github.com/suno-ai/bark)

## 关联

- [[whisper]] —— 同样把语音问题 NLP 化，ASR 端的对偶；可以两边对照学 seq2seq 在语音的应用
- [[pytorch]] —— Coqui TTS 训练和推理框架
- [[transformers]] —— XTTS-v2 的 Transformer 主干和 HuggingFace 同生态
- [[hindley-milner]] —— 不直接相关，但同样体现「一套通用机制覆盖大量特例」的设计哲学

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[vall-e-2023]] —— VALL-E — 3 秒音频样本就能克隆你的声音
- [[essentia]] —— Essentia — 音乐信息检索的 C++/Python 工具箱
- [[ffmpeg]] —— FFmpeg — 几乎所有视频工具背后都藏着它
- [[handbrake]] —— HandBrake — 把视频转码变成点两下鼠标的事
- [[piper]] —— Piper — 端侧低延迟 TTS
- [[silero-vad]] —— Silero VAD — 轻量语音活动检测
