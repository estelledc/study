---
title: 'Piper — 端侧低延迟 TTS'
来源: 'https://github.com/rhasspy/piper'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

Piper 是 Rhasspy 团队（Michael Hansen 主导）开源的**本地神经网络 TTS（文本转语音）**：把火热的 VITS 端到端 TTS 模型导出为 ONNX，再用 C++ 二进制驱动推理，**专为树莓派等低功耗板优化**（Pi Zero 级也能跑 `x_low`，Pi 4 跑 `medium` 更常见）。日常类比：像把一台**录音棚级的合成器塞进鞋盒**——不联网、不烧电、还能在板子上比说话还快地把文字读出来。

最小用法（命令行）：

```bash
echo '你好，世界。' | ./piper \
    --model zh_CN-huayan-medium.onnx \
    --output_file out.wav
```

每个声音 = 一对文件：`model.onnx`（约 20-100MB）+ `model.onnx.json`（描述音素表、采样率、speaker id）。下载选好的声音，扔进同目录就能跑。仓库 6k+ star，MIT 许可（**可商用**）。

## 为什么重要

不理解 Piper，下面这些事会卡住你：

- 为什么 Home Assistant 能在断网状态下用本地语音回答「客厅温度多少」——答案是本地 ASR（[[whisper]]）+ 本地 LLM + 本地 TTS（Piper）三件套
- 为什么 2024 年「全本地语音助手」这个赛道突然密集起来——Piper 把 TTS 这块最后的拼图从「需要 GPU」拉到了「树莓派也能跑」
- 为什么 Piper 不能像 XTTS-v2 那样「6 秒克隆任意人声」——它是**部署优先**，砍掉了零样本克隆能力换来低延迟
- 为什么开源 TTS 圈把 Piper 和 [[coqui-tts]] 并列推荐——Coqui 是训练/研究全栈，Piper 是部署/推理引擎，两者互补

## 核心要点

记 **3 条架构主线 + 1 条工程现实**：

1. **VITS 2021 提供模型架构**：VITS 把「文字 → mel 频谱 → 波形」两段式 TTS 折叠成一个端到端网络，训练时直接出波形。Piper 不发明新模型，**直接拿 VITS 训完导出**——这是它能「轻」的根本原因。

2. **ONNX 导出 + C++ 推理是落地关键**：训练在 PyTorch + Lightning 完成，但部署不带 PyTorch 一起走，而是导出成 ONNX 格式，推理用 C++ 调 ONNX Runtime。**1.5GB 的训练框架被压成 100MB 的可执行文件 + 模型**，这是 Piper 比 Coqui TTS 在树莓派上快几个数量级的根本原因。

3. **espeak-ng 做文字到音素的前端**：神经网络只负责「音素序列 → 波形」，文字怎么变成音素由 espeak-ng（或简化版 piper-phonemize）处理。这一层覆盖 100+ 语言，**多语种支持的代价是中文这种音调语言 G2P 质量较粗糙**。

4. **工程现实——质量分四档**：每个声音模型有 `x_low / low / medium / high` 四个体积/质量档。Pi Zero 2 跑 `x_low`，Pi 4 跑 `medium`，桌面 CPU 跑 `high`。**RTF (real-time factor) 在 Pi 4 medium 档远小于 1**，意味着合成 1 秒音频耗时不到 1 秒，可以边合成边播。

合起来一句话：**用 VITS 模型 + ONNX 部署 + espeak-ng 前端，把研究界的 TTS 搬到边缘设备上跑**。

## 实践案例

### 案例 1：在树莓派 4 上跑中文 TTS

```bash
# 下载二进制和中文模型
wget https://github.com/rhasspy/piper/releases/download/v1.2.0/piper_arm64.tar.gz
tar -xzf piper_arm64.tar.gz
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx
wget https://huggingface.co/rhasspy/piper-voices/resolve/main/zh/zh_CN/huayan/medium/zh_CN-huayan-medium.onnx.json

# 合成
echo '今天是星期五，明天放假。' | ./piper/piper \
    --model zh_CN-huayan-medium.onnx \
    --output_file out.wav
```

`huayan` 是中文女声预训练模型（约 60MB）。Pi 4 上**首次合成约 200ms 启动 + 边合成边写文件**，10 字句子总耗时不到 1 秒。

### 案例 2：用 Python 包装做长文本朗读

```python
import wave, io, subprocess

def synthesize(text: str, model: str = 'en_US-amy-medium.onnx') -> bytes:
    proc = subprocess.run(
        ['piper', '--model', model, '--output_raw'],
        input=text.encode('utf-8'),
        capture_output=True, check=True,
    )
    return proc.stdout  # 16-bit PCM raw bytes

audio = synthesize('Hello world.')
with wave.open('out.wav', 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(22050)
    w.writeframes(audio)
```

`--output_raw` 让 Piper 把 PCM 直接写到 stdout，**不写盘**。配合 [`sounddevice`](https://pypi.org/project/sounddevice/) 可以做流式朗读：边合成边播。

### 案例 3：通过 Wyoming 协议接入 Home Assistant

```bash
pip install wyoming-piper
python -m wyoming_piper \
    --piper /usr/local/bin/piper \
    --voice en_US-amy-medium \
    --uri 'tcp://0.0.0.0:10200'
```

Home Assistant 配置里指向 `tcp://nas.local:10200` 即可作为本地 TTS 后端。Wyoming 是 Rhasspy 定义的**轻量语音服务协议**——一台 NAS 上跑 Piper，多台 HA 设备共享。

## 踩过的坑

1. **espeak-ng 中文 G2P 较粗糙**：多音字（「行」xíng/háng）、轻声、儿化音处理弱，长句韵律不如商业 TTS。短指令场景（「客厅灯打开」）够用，长篇朗读会觉得「机器味」。

2. **不支持零样本声音克隆**：换声音必须**重新训练或换预训练模型**。要克隆某人声音需要 1-3 小时干净录音 + GPU + Lightning 训练经验。要零样本克隆请用 [[coqui-tts]] XTTS-v2。

3. **韵律单一**：VITS 训练时只学一种说话风格，做不出 ChatGPT Voice Mode 那种富有情感的朗读。Piper 的定位是「能听懂的低延迟播报」，不是「有感情的朗诵」。

4. **ONNX Runtime CPU 占用集中**：Pi 4 跑 medium 档时单核 80%+，长时间播报风扇会响。**长流程要做散热**或降到 `low` 档。

5. **声音模型 license 不一**：仓库本身 MIT，但**不同声音模型有不同来源数据集**（VCTK / mailabs / LJSpeech / 自录），商用前确认每个 `.onnx` 对应数据集的许可。

## 适用 vs 不适用场景

**适用**：

- 本地语音助手 TTS 后端（Home Assistant / Rhasspy / 自建）
- 嵌入式设备语音播报（树莓派 / 工控板 / 智能音箱）
- 离线无障碍阅读器
- 多语种短指令场景（30+ 语言、100+ 声音）

**不适用**：

- 需要零样本声音克隆 → 用 [[coqui-tts]] 的 XTTS-v2 或 Bark
- 需要富情感朗读（小说、播客）→ 用闭源商业 TTS 或 XTTS-v2
- 需要中文极高自然度（普通话标准 + 韵律）→ 用国内商业 TTS API
- GPU 集群批量合成（不在乎延迟、要质量最高）→ 直接用 VITS / Tacotron2 + HiFi-GAN

## 学到什么

1. **模型 + 部署是两道独立的工程题**：VITS 论文是 2021 年的研究成果，Piper 是 2023-2024 的部署工程化。**研究界每年出新模型，部署界把它们一个个搬到边缘——这是一条独立的赛道**。
2. **ONNX 是研究到生产的桥**：PyTorch 训练 → ONNX 导出 → C++ + ONNX Runtime 推理。这条路径在 [[whisper]].cpp、Piper 上都被验证。
3. **取舍是部署的核心**：Piper 砍掉零样本克隆、砍掉富情感、砍掉 Tacotron2 选项，只保留 VITS + ONNX，**换来 10x 推理速度和 1/10 包体积**。一个工具不可能什么都做，明确取舍才能做透一个场景。
4. **espeak-ng 这种 30 年老库还在被新工具复用**：神经网络解决「音素 → 波形」，但「文字 → 音素」这种规则密集的任务，老式词典 + 规则反而比神经网络更可靠。新旧组合是工程常态。

## 历史小故事（可跳过）

- **2017 — Tacotron2**：Google 提出两段式 TTS（声学模型 + WaveNet 声码器），开启神经 TTS 时代
- **2020 — HiFi-GAN**：让 GAN 声码器质量逼近 WaveNet 而推理快 100 倍，让两段式可以实时
- **2021 — VITS**：Kim 等把两段折成端到端，**端到端训练 + flow-based 解码器**，质量直接拉到 SOTA
- **2022 — Mozilla TTS / Coqui TTS**：把 Tacotron2 / VITS 等都整理进一个 PyTorch 工具包
- **2023 — Piper 出现**：把 VITS 通过 ONNX 部署到树莓派，**Rhasspy 把 TTS 的最后一公里落到边缘**
- **2024 — Home Assistant 内置**：Piper 成为 HA 官方推荐本地 TTS 后端，本地语音助手生态闭环

整条脉络看到的是**研究模型先在论文里出现，2-3 年后被部署工具搬到生产**。Piper 的位置就是 2023 年那个把 VITS 搬下 GPU 的工具。

## 延伸阅读

- 仓库 README：[rhasspy/piper](https://github.com/rhasspy/piper)（含全部预训练模型清单、采样、Wyoming 集成）
- 声音体验页：[rhasspy.github.io/piper-samples](https://rhasspy.github.io/piper-samples/)（在线试听 100+ 声音）
- VITS 论文：[Kim et al. 2021 — Conditional VAE with Adversarial Learning for E2E TTS](https://arxiv.org/abs/2106.06103)
- ONNX Runtime 文档：[onnxruntime.ai](https://onnxruntime.ai/)（理解 C++ 推理引擎）

## 关联

- [[coqui-tts]] —— 研究/训练全栈 TTS 工具包，Piper 在部署侧的对照面
- [[whisper]] —— ASR 的对偶；本地语音助手 = Whisper + Piper
- [[pytorch]] —— Piper 训练栈底座
- [[pytorch-lightning]] —— Piper 训练循环抽象

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
