---
title: OpenBMB/VoxCPM — 零基础学习笔记
来源: https://github.com/OpenBMB/VoxCPM
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# OpenBMB/VoxCPM — 零基础学习笔记

## 一句话概括

VoxCPM 是一个不需要把声音切成"离散编码"就能说话的 AI 系统——你给它文字，它还你一段逼真的人声录音。

## 从日常类比开始

想象一下，你想让一个人念一段话。传统做法像这样：

1. 先把你的文字翻译成"音标"（比如拼音）
2. 再把每个音标对应到一个固定的声音片段
3. 最后把这些片段拼起来

这种方式的问题在于：声音片段是"离散的"，就像乐高积木——只有有限的几块，拼出来的声音听起来机械、生硬。

VoxCPM 的做法完全不同。它不经过"音标"这一步，而是直接把文字变成一段连续的声波信号。类比来说：

- 传统方法：用有限颜色的蜡笔画画，颜色少，过渡生硬
- VoxCPM：用水彩颜料，颜色可以无限渐变，画面自然流畅

这就是论文里反复说的 **"tokenizer-free"**（无分词器）的意思。

## 核心概念

### 1. Tokenizer-Free（无分词器）

传统 TTS（Text-to-Speech）系统中间有一个关键步骤叫"音频分词"（audio tokenization）：把声音压缩成一个个离散的 code（类似压缩图片成像素块）。好处是计算快，坏处是信息丢失，声音不够自然。

VoxCPM 跳过了这一步，直接在**连续空间**（continuous space）里处理声音。你可以把连续空间想象成一根橡皮筋——它可以被拉伸到任意长度、任意形状，而不是只能跳到几个固定位置。

### 2. Diffusion Autoregressive（扩散自回归）

这个词拆开看更好理解：

- **Diffusion（扩散）**：来自图像生成领域的技术。简单说，就是从一团噪声慢慢"去噪"出清晰的声音。就像你从模糊的照片一点点调出清晰画面。
- **Autoregressive（自回归）**：意思是"一步步来"。模型每次只生成一小段声音，然后把这段声音作为下一段的参考，继续生成下一段。就像你写字是一个字一个字写出来，而不是整句话同时出现在纸上。

两者结合：VoxCPM 一边"去噪"一边"逐步推进"，最终生成一段连贯的自然语音。

### 3. AudioVAE（音频变分自编码器）

这是 VoxCPM 的"耳朵"和"嘴巴"：

- **Encoder（编码器）**：把原始音频压缩成一个紧凑的数学表示（latent representation），方便模型处理
- **Decoder（解码器）**：把模型生成的数学表示还原成你能听到的音频

VoxCPM 用的是 **AudioVAE V2**，它的一个厉害之处在于：输入 16kHz 的低质量音频，输出 48kHz 的高质量音频——内置了超分辨率（super-resolution）能力。

### 4. 四阶段处理流程（VoxCPM2 架构）

VoxCPM2 的处理流程像一个流水线工厂：

1. **LocEnc**：从参考音频中提取说话人的声音特征（音色、音调）
2. **TSLM**（Text-to-Speech Language Model）：根据文字内容生成语音的语义表示
3. **RALM**（Reference Audio Language Model）：结合参考音频的特征，调整生成的语音
4. **LocDiT**（Local Diffusion Transformer）：把最终的数学表示还原成高质量音频

## 能做什么

### 文本转语音（TTS）

最基本的功能：输入文字，输出语音。支持 30 种语言和 9 种中文方言。

### 音色设计（Voice Design）

只用文字描述就能创造一个新声音。比如："一个年轻女性的声音，温柔甜美，略带微笑"。不需要任何参考音频。

### 声音克隆（Voice Cloning）

给一段别人的录音，VoxCPM 就能克隆那个人的声音。有两种模式：

- **可控克隆**：克隆音色的同时还能控制语速、情绪
- **极致克隆**：给出参考音频和对应的文字，实现最高保真度的克隆

### 流式合成

可以一段一段地生成音频，适合实时场景（比如聊天机器人）。

## 代码示例

### 示例 1：基础文本转语音

```python
from voxcpm import VoxCPM
import soundfile as sf

# 加载模型（首次运行会自动从 HuggingFace 下载）
model = VoxCPM.from_pretrained(
    "openbmb/VoxCPM2",
    load_denoiser=False,
)

# 生成语音
wav = model.generate(
    text="VoxCPM2 是目前推荐使用的多语言语音合成版本。",
    cfg_value=2.0,          # 指导系数，越高越严格按文字生成
    inference_timesteps=10, # 扩散步数，越多越精细（也越慢）
)

# 保存为 WAV 文件
sf.write("demo.wav", wav, model.tts_model.sample_rate)
print("已保存: demo.wav")
```

这里 `cfg_value` 就像是"严格程度"的旋钮。设为 2.0 意味着模型会比较严格地按照文字内容生成，数值越高，生成的语音越贴近文字的字面意思，但可能失去一些自然感。`inference_timesteps` 是扩散过程的步数——想象你在画画，10 步就像粗略勾勒，50 步就像精雕细琢。

### 示例 2：音色设计 + 声音克隆

```python
from voxcpm import VoxCPM
import soundfile as sf

model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)

# --- 音色设计：用文字描述创造声音 ---
wav = model.generate(
    text="(年轻男性，声音低沉稳重，语速偏慢)你好，欢迎来到 VoxCPM2 的世界。",
    cfg_value=2.0,
    inference_timesteps=10,
)
sf.write("voice_design.wav", wav, model.tts_model.sample_rate)

# --- 声音克隆：用参考音频克隆声音 ---
wav = model.generate(
    text="(稍快一点，欢快的语气)这是克隆出来的声音！",
    reference_wav_path="path/to/reference.wav",
    cfg_value=2.0,
    inference_timesteps=10,
)
sf.write("cloned_voice.wav", wav, model.tts_model.sample_rate)
```

注意 `text` 参数的写法：括号里的内容是**音色指令**，括号外面是要朗读的文字。VoxCPM 会先读取括号里的描述，调整声音风格，然后再读后面的内容。

### 示例 3：流式合成

```python
from voxcpm import VoxCPM
import soundfile as sf
import numpy as np

model = VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)

# 流式生成：一段一段地输出
chunks = []
for chunk in model.generate_streaming(
    text="流式语音合成让实时对话成为可能。",
):
    chunks.append(chunk)

# 拼接所有片段并保存
wav = np.concatenate(chunks)
sf.write("streaming.wav", wav, model.tts_model.sample_rate)
```

流式生成的好处是：你不需要等整段语音都生成完才能听到。第一段出来就可以播放，后面的一段段陆续跟上。这对于聊天机器人、游戏 NPC 等实时场景很重要。

## 模型版本对比

| 特性 | VoxCPM2 | VoxCPM1.5 | VoxCPM-0.5B |
|------|---------|-----------|-------------|
| 参数量 | 20亿 | 6亿 | 5亿 |
| 音频质量 | 48kHz | 44.1kHz | 16kHz |
| 支持语言 | 30种 | 2种 | 2种 |
| 音色设计 | ✅ | ❌ | ❌ |
| 声音克隆 | ✅ | ✅ | ✅ |
| 显存需求 | ~8GB | ~6GB | ~5GB |

VoxCPM2 是当前推荐使用的版本。如果你显卡不太好，VoxCPM1.5 是个不错的折中选择。

## 为什么重要

传统 TTS 系统（比如你手机里的 Siri）听起来"像机器"，因为它们是"拼"出来的声音。VoxCPM 代表的方向是：让 AI 真正"理解"声音的连续性，而不是把它当成一堆离散的积木。

这背后的思想其实和当前大语言模型的发展是一致的——从"离散的 token 预测"走向"连续的语义表达"。VoxCPM 把这个思路用在了声音上，效果就是：你几乎听不出它是 AI 生成的。

## 进一步学习

- 官方文档：https://voxcpm.readthedocs.io/
- 技术报告（VoxCPM2）：https://arxiv.org/abs/2606.06928
- 技术报告（VoxCPM 原版）：https://arxiv.org/abs/2509.24650（ICLR 2026）
- 在线体验：https://huggingface.co/spaces/OpenBMB/VoxCPM-Demo
