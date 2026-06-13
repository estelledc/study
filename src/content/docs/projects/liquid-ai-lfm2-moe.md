---
title: Liquid AI LFM2.5-8B-A1B — 8B 参数 / 1B 激活的 MoE 模型，在 38T Token 上训练
来源: https://www.liquid.ai/blog/lfm2-5-8b-a1b
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

# Liquid AI LFM2.5-8B-A1B 零基础学习笔记

## 一句话总结

Liquid AI 发布了 **LFM2.5-8B-A1B**：一个只有 8B 总参数、每次推理只激活 1B 参数的 MoE（混合专家）模型，在 38T Token 上训练，可以跑在普通笔记本甚至手机上。

---

## 日常类比：一个团队分工协作

想象一家小型咨询公司：

- **公司总共有 8 位顾问**（总参数 8B），但每个客户来咨询时，**只需要 1 位最对口的顾问**来回答（激活参数 1B）。
- 这 8 位顾问各自擅长不同领域：有的写代码、有的做数学、有的懂法律。
- 接案的时候，前台（模型的路由机制）判断你的问题属于哪个领域，只叫那位顾问出来。

这就是 **MoE（Mixture of Experts，混合专家）** 的核心思想：模型整体很大、知识丰富，但每次推理只"激活"一小部分，所以跑得快、省资源。

---

## 核心概念拆解

### 1. 什么是 MoE？

传统大模型（Dense Model）每次推理都要把所有参数都算一遍。就像让 8 位顾问同时回答同一个问题。

MoE 模型在 Transformer 的 FFN（前馈神经网络）层插入"专家门控"：

```
输入 → [门控路由器] → 选择 top-k 个专家 → 专家计算 → 加权输出
```

每次只选 1-2 个专家参与计算，所以实际消耗的算力只有总参数的一小部分。

LFM2.5-8B-A1B 中：
- **8B** = 总参数（所有专家加起来）
- **A1B** = Active 1B = 每次推理只激活约 1B 参数
- 推理速度比同规模的 Dense 模型快很多

### 2. 为什么叫 LFM？

LFM = **Liquid Foundation Model**，Liquid AI 的基础模型系列。

和传统"大就是好"的思路不同，LFM 追求的是 **极致效率**：在尽可能少的参数和算力下，做到尽可能好的效果。目标是在消费级硬件（笔记本、手机）上跑私人 AI 助手。

### 3. 这次相比上一代变了什么？

| 改动 | 上一代 (LFM2) | 这一代 (LFM2.5) |
|------|---------------|-----------------|
| 上下文窗口 | 32K | **128K**（可以读更长的文档） |
| 训练 Token | 12T | **38T**（训练量翻了 3 倍多） |
| 词表大小 | 65K | **128K**（非拉丁语更高效） |
| 推理模式 | 直接回答 | **思维链推理**（先思考再回答） |

---

## 代码示例

### 示例 1：用 Python 加载和推理

假设你已经从 Hugging Face 下载了模型，用 `transformers` 库推理：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

# 加载模型和分词器
model_name = "LiquidAI/LFM2.5-8B-A1B"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",      # 自动选择精度
    device_map="auto"        # 自动分配到 GPU/CPU
)

# 构造输入
messages = [
    {"role": "user", "content": "请用 Python 写一个快速排序算法"}
]
prompt = tokenizer.apply_chat_template(messages, tokenize=False)

# 生成回答
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
outputs = model.generate(**inputs, max_new_tokens=512)
print(tokenizer.decode(outputs[0], skip_special_tokens=True))
```

关键点：这个模型总参只有 8B，即使没有 GPU，在 CPU 上也能推理（M5 Max MacBook 上达到 253 tokens/s）。

### 示例 2：用 llama.cpp 在 CPU 上推理

Liquid AI 第一天就支持了 `llama.cpp`，可以用 GGUF 格式在纯 CPU 上高效推理：

```bash
# 1. 下载 GGUF 量化模型（以 Q4_K_M 4bit 量化为例）
huggingface-cli download LiquidAI/LFM2.5-8B-A1B \
  --filename LFM2.5-8B-A1B-Q4_K_M.gguf \
  --local-dir ./models

# 2. 用 llama.cpp 的 main 程序推理
./main \
  -m ./models/LFM2.5-8B-A1B-Q4_K_M.gguf \
  -p "请用中文解释什么是机器学习" \
  -n 512 \
  --temp 0.7

# 输出示例：
# 机器学习是一种人工智能技术，...
# [speed: 146 tokens/sec on Ryzen AI Max+ 395]
```

或者在 Python 中用 `llama-cpp-python`：

```python
from llama_cpp import Llama

# 加载 GGUF 模型（CPU 推理，内存占用约 6GB）
llm = Llama(
    model_path="./models/LFM2.5-8B-A1B-Q4_K_M.gguf",
    n_ctx=128_000,     # 128K 上下文窗口
    n_gpu_layers=0,    # 0 = 纯 CPU
    n_threads=8
)

response = llm(
    "解释什么是深度学习",
    max_tokens=256,
    temperature=0.5
)
print(response["choices"][0]["text"])
```

---

## 关键数字速览

- **AA-Omniscience Index** 从 -78.42 提升到 -24.70（提升 53.62），越接近 0 越好，衡量"答对且少幻觉"的综合得分
- **幻觉拒绝率** 从 7.46% 飙升到 63.47% — 模型学会了"不知道就说不知道"
- **MATH500** 数学得分：88.76（比上一代 +13.96）
- **工具调用** BFCLv4：48.50（比上一代 +22.98）
- H100 GPU 上：单卡最高 18.5K tokens/s，一天可处理约 16 亿 tokens

---

## 训练亮点（给想深入的人）

### Tokenizer 扩展

词表从 65K 翻倍到 128K，方法不是从头训练，而是在原有词表上**继续做 BPE merge 训练**，新增的词能被分解为原有子词的组合，所以不会破坏已有的知识。

对非拉丁语的提升特别大：
- 泰语：chars/token 从 0.671 → 2.269（**+238%**）
- 越南语：1.519 → 3.311（**+118%**）
-  Hindi：0.961 → 2.118（**+120%**）

### "末日循环"（Doom Loops）处理

长推理过程中，模型有时会陷入死循环，反复说"让我重新思考..."。Liquid AI 做了针对性优化：识别容易触发循环的 token，把概率质量重新分配给合理的替代方案。

### 幻觉抑制

通过 avg@k 奖励机制做 RL 训练，鼓励模型在面对超出自己知识范围的问题时**主动选择"我不知道"**，而不是瞎编。这让它的幻觉拒绝率从 7.5% 提升到了 63.5%。

---

## 总结

LFM2.5-8B-A1B 代表了当前端侧 AI 的一个里程碑：

1. **MoE 架构**让 8B 参数的模型每次推理只消耗 1B 的算力
2. **38T Token**的训练量让它的能力远超同体积的模型
3. **128K 上下文**让它可以处理长文档
4. **纯 CPU 推理**在普通笔记本上就够用，不需要 GPU
5. **原生支持** llama.cpp / MLX / vLLM / SGLang / ONNX，覆盖几乎所有硬件平台

对于初学者来说，最值得记住的一个理念是：**AI 不一定需要超级计算机才能跑，聪明地设计架构比堆参数更重要。**
