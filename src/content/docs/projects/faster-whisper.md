---
title: 'faster-whisper — Whisper 的 4× 加速重写版'
来源: 'https://github.com/SYSTRAN/faster-whisper'
日期: '2026-05-31'
分类: '数据科学与 AI'
难度: '中级'
---

## 是什么

faster-whisper 是 SYSTRAN 维护的 **Whisper 推理加速库**：把 OpenAI 的 PyTorch 实现换成 **CTranslate2**（一个 C++/CUDA 的 Transformer 推理引擎）重写，**速度约 4 倍、显存约减半**；fp16 与原版基本对齐，INT8 会有轻微精度损失但多数场景可接受。日常类比：原版 Whisper 像一台手动挡轿车——能开但费油；faster-whisper 是同一辆车换了 ECU 重新调校，油耗腰斩、加速更猛，**驾驶手感仍接近原车**。

最小用法：

```bash
pip install faster-whisper
```

```python
from faster_whisper import WhisperModel

model = WhisperModel("large-v3", device="cuda", compute_type="float16")
segments, info = model.transcribe("audio.mp3", language="zh")

for seg in segments:
    print(f"[{seg.start:.1f}s] {seg.text}")
```

注意 `segments` 是 **惰性 generator**——不迭代它就不会真的跑推理。这是 faster-whisper 和原版 API 最重要的差异。

## 为什么重要

不理解 faster-whisper，下面这些事会卡住你：

- 为什么 2023 年之后**大量常见开源字幕工具、AI 笔记 app 的 ASR 后端**改用 faster-whisper 而不是原版——同一张 RTX 3090，原版跑 large-v3 要 10 GB 还慢，faster-whisper INT8 只要约 3 GB 还快约 4 倍
- 为什么本地跑 large 模型从「奢侈」变成「日常」——8 GB 消费级显卡也能流畅推理
- 为什么 [[whisperx]]、subtitle-generator、HuggingFace ASR space 都把 faster-whisper 当默认引擎——它是 Whisper 生态的**事实推理层**
- 理解它你才知道：**模型权重不变，光换推理后端，能拿到 4 倍加速**——这是工程优化的极限案例

## 核心要点

记 **3 个加速来源 + 2 个 API 习惯**：

1. **CTranslate2 后端**：把 Transformer 的 attention/layernorm/gelu 等算子用 C++ 手写，融合 kernel、用 cuBLAS / oneDNN，比 PyTorch 的通用算子快得多。**等价于把模型『编译』了一次**。

2. **量化推理**：原生支持 FP16 / INT8 / INT8-FP16 混合精度。`compute_type="int8"` 时 large-v3 模型从 3 GB 权重压到 1.5 GB，**CPU 也能跑动**——原版 Whisper 在 CPU 上跑 large 几乎不可用。

3. **流式 generator + VAD 集成**：`transcribe()` 返回 generator 而非 list；`vad_filter=True` 自动接 Silero VAD 跳过静音段。**长音频内存占用平稳**，并直接缓解 Whisper 的「长沉默幻觉」问题。

4. **API 习惯一**：`segments` 不 `list()` 就不跑。想拿全部结果要 `segments = list(segments)`，否则 `info` 拿到了但实际推理还没启动。

5. **API 习惯二**：模型加载支持 HuggingFace Hub 名（`"large-v3"` 自动下转好的 CT2 格式），也支持本地路径。**自己训练的 PyTorch checkpoint 要先用 `ct2-transformers-converter` 转格式**。

合起来一句话：**用编译型推理引擎 + 量化 + 流式 API，把 Whisper 从『能跑』推到『随便跑』**。

## 实践案例

### 案例 1：消费级显卡跑 large-v3

```python
from faster_whisper import WhisperModel

# RTX 3060（12GB）也能流畅跑
model = WhisperModel("large-v3", device="cuda", compute_type="int8_float16")
segments, info = model.transcribe(
    "podcast.mp3",
    language="zh",
    beam_size=5,
    vad_filter=True,            # 自动跳过静音
    word_timestamps=True,       # 词级时间戳
)
print(f"语种: {info.language}, 概率: {info.language_probability:.2f}")
for seg in segments:
    print(f"[{seg.start:.1f}-{seg.end:.1f}] {seg.text}")
```

`int8_float16` 是常用挡位：权重 INT8 存储省显存，激活 FP16 计算保精度。**显存占用约 3 GB**，原版需要 ~10 GB。

### 案例 2：批处理进一步提速

```python
from faster_whisper import WhisperModel, BatchedInferencePipeline

model = WhisperModel("large-v3", device="cuda", compute_type="float16")
batched = BatchedInferencePipeline(model=model)
segments, info = batched.transcribe("long_audio.mp3", batch_size=16)
```

`BatchedInferencePipeline`（1.0+ 引入）把 VAD 切出的多段并行喂给 GPU，**长音频再快 2-3 倍**。代价是峰值显存上升——`batch_size` 要按显卡调。

### 案例 3：CPU 也能跑（Mac / 服务器无 GPU）

```python
model = WhisperModel("medium", device="cpu", compute_type="int8", cpu_threads=8)
segments, _ = model.transcribe("interview.wav", language="en")
print(" ".join(s.text for s in segments))
```

`compute_type="int8"` + `cpu_threads` 调线程数，**M1 MacBook 跑 medium 接近实时**。CPU 路径不如 [[whisper-cpp]] 极致（whisper.cpp 是纯 C + Metal），但比原版 PyTorch CPU 快得多。

## 踩过的坑

1. **`segments` 是 generator，不 `list()` 就不跑**：写 `segments, info = model.transcribe(...)` 后立刻 `print(info)`，看起来已经返回，其实推理一行没跑。要么 `for seg in segments`，要么 `segments = list(segments)`。**测速时这个坑最常见**。

2. **CUDA / cuDNN 版本严格**：faster-whisper ≥ 1.0 要 **cuDNN 9 + CUDA 12**。老驱动会报 `libcudnn_ops_infer.so.9: cannot open shared object file`。解法：升级 driver，或装 `pip install nvidia-cudnn-cu12==9.*` 让 pip wheel 自带。

3. **VAD 过激进截掉短句**：`vad_filter=True` 默认 `min_silence_duration_ms=2000`，对快语速对话会把停顿当静音剪掉。调小到 500 ms 或关掉 VAD 改用更长的 `condition_on_previous_text`。

4. **自己 fine-tune 的 Whisper 不能直接加载**：HF 上 `Systran/faster-whisper-large-v3` 是已转好的 CT2 格式。自己训练的 PyTorch checkpoint 要先：
   ```bash
   ct2-transformers-converter --model /path/to/hf_model \
       --output_dir /path/to/ct2_model --quantization float16
   ```

5. **Word timestamps 显存翻倍**：`word_timestamps=True` 要存 cross-attention 权重做对齐。large-v3 + word_timestamps 在 fp16 会从 5 GB 涨到 ~9 GB。**只在需要逐词字幕时开**。

6. **多 GPU 不自动并行**：单 `WhisperModel` 实例只用一张卡。多卡要用 `device_index=[0,1]` 或起多进程，**API 比 transformers 弱**。

## 适用 vs 不适用场景

**适用**：

- 需要本地跑 Whisper、对延迟和显存敏感的所有场景
- 大批量字幕生成（一份长视频跑几次模型）
- 资源受限设备（消费级 GPU、CPU 服务器）
- 在 [[whisperx]] / 字幕工具栈里作为默认推理后端

**不适用**：

- 必须改模型架构 / 训练 → CTranslate2 是推理引擎，**不能训练**，要训练用 [[transformers]] + [[pytorch]]
- 极致 CPU 性能 / 端侧（手机、树莓派）→ 用 [[whisper-cpp]]，那是纯 C/Metal/Neon
- 实时流式低延迟（< 300 ms）→ Whisper 30 秒分块的非流式架构本身决定了，换后端不解决

## 历史小故事（可跳过）

- **2022-09**：OpenAI 发布 Whisper（PyTorch 实现），社区抱怨推理慢、显存吃。
- **2023-03**：SYSTRAN 开源 faster-whisper，把 Whisper 用 CTranslate2 重写，立即拿到 4× 加速。
- **2023**：HuggingFace Spaces、subtitle 工具、AI 笔记 app 大规模迁到 faster-whisper。
- **2024-05**：1.0 发布，引入 `BatchedInferencePipeline`，长音频再快 2-3 倍。
- **2024-10**：跟进 OpenAI 的 large-v3-turbo（4 层 Decoder 蒸馏版），延续『同精度、更快』的产品线。

## 学到什么

1. **推理层换实现能拿到 4 倍加速**——不需要改模型、不需要重训，工程优化的天花板比想象高
2. **量化是普及大模型的钥匙**——INT8 把 large-v3 压到 3 GB，让消费级显卡能跑，等于扩大了用户基数 10 倍
3. **API 设计要照顾长任务**——`segments` 用 generator 而非 list，长音频内存平稳；这种设计哲学和 [[fastapi]] / [[asyncio]] 一脉相承
4. **后端可替换的开源项目生态会自我演化**：Whisper 权重 + CTranslate2 引擎 + Silero VAD + diarization 模型，**四层各自迭代**，组合出 [[whisperx]] 这类完整产品

## 延伸阅读

- 官方仓库：[github.com/SYSTRAN/faster-whisper](https://github.com/SYSTRAN/faster-whisper)
- CTranslate2 引擎：[github.com/OpenNMT/CTranslate2](https://github.com/OpenNMT/CTranslate2)
- 性能对比 benchmark：仓库 README 的 Benchmark 表（large-v2 在 RTX 3070 从 4m11s → 54s）
- WhisperX（diarization + 强制对齐，底层用 faster-whisper）：[github.com/m-bain/whisperX](https://github.com/m-bain/whisperX)
- 转换工具：`ct2-transformers-converter`（[CTranslate2 docs](https://opennmt.net/CTranslate2/guides/transformers.html)）

## 关联

- [[whisper]] —— faster-whisper 加速的就是它，模型权重完全相同
- [[whisper-cpp]] —— 同样是 Whisper 的高性能重写，但走纯 C / GGML 路线，偏端侧
- [[whisperx]] —— 在 faster-whisper 之上加说话人分离和词级强制对齐
- [[transformers]] —— HuggingFace 模型仓库，faster-whisper 通过 `ct2-transformers-converter` 从这里转模型
- [[pytorch]] —— 原版 Whisper 训练框架，faster-whisper 推理时已不依赖

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
