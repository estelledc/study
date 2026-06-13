---
title: "The Llama 3 Herd of Models"
来源: https://arxiv.org/abs/2407.21783
日期: 2026-06-13
分类: 其他
子分类: ml-deep-learning
provenance: pipeline-v3
---

# The Llama 3 Herd of Models — 零基础学习笔记

## 一、日常类比：一群有不同专长的羊驼

想象你开了一家餐厅。

第一年，你雇了一个厨师——他什么都会做，但什么都一般。这叫 **Llama 2**。

第二年，你雇了一群厨师，每个都有专长：有人做菜特别好吃，有人甜点做得一流，有人切菜特别快。这群厨师合在一起就是 **Llama 3 "Herding"（羊群）**。而且这群厨师还学会了多国语言、会写代码、能用工具、还知道什么时候该说"不"（安全护栏）。

这就是 Llama 3 的核心思想：不是一个模型，而是一组模型，覆盖不同场景。

---

## 二、论文基本信息

| 项目 | 内容 |
|------|------|
| 标题 | The Llama 3 Herd of Models |
| 作者 | Aaron Grattafiori 等 558 人（Meta AI） |
| 发表 | arXiv:2407.21783, 2024-07-31 |
| 模型类型 | Dense Transformer（稠密 Transformer） |
| 最大参数量 | 405B（4050亿） |
| 上下文窗口 | 最高 128K tokens |
| 许可证 | Llama 3 Community License（准开源） |

---

## 三、核心概念

### 3.1 Transformer 是什么？

把 Transformer 想象成一个**超级翻译官**：

- 它读入一段文字（比如"你好世界"）
- 内部有一个"注意力机制"——就像人读书时会重点看某些词一样，Transformer 也会给不同的词分配不同的"关注程度"
- 然后它输出一段理解后的文字表示

传统的 RNN/LSTM 是一个字一个字往后读，像用手电筒照路。Transformer 是**同时看到整句话**，然后用注意力来聚焦重点。

### 3.2 Llama 3 的几个关键模型

Llama 3 "羊群"包含多个模型：

| 模型 | 参数量 | 用途 |
|------|--------|------|
| Llama 3 8B | 80亿 | 轻量级，可在消费级 GPU 上运行 |
| Llama 3 70B | 700亿 | 中等规模，性能与效率平衡 |
| Llama 3 405B | 4050亿 | 最大型号，对标 GPT-4 级别 |
| Llama Guard 3 | 多种尺寸 | 安全护栏模型，检测有害输入/输出 |

### 3.3 训练的两阶段法

Llama 3 的训练分两个阶段，就像学生先"上课学知识"再"刷题应试"：

**第一阶段：预训练（Pre-training）**
- 在 15 万亿 tokens 的数据上训练
- 数据来自网页、书籍、论文、代码等
- 目标：学会语言的基本规律和世界知识

**第二阶段：指令微调（Post-training / Instruction Tuning）**
- 用人类标注的对话数据来训练
- 让模型学会"按照人类的指令做事"，而不是继续生成文本
- 加入了 RLHF（基于人类反馈的强化学习）来对齐人类价值观

### 3.4 为什么 405B 能媲美 GPT-4？

论文的关键发现：**在相同计算预算下，更大的模型 + 更多数据 = 更好的性能**。

这遵循了"缩放定律"（Scaling Laws）：模型越大、数据越多，性能越强，而且这种关系是可预测的。

---

## 四、关键技术细节

### 4.1 注意力机制的改进

Llama 3 使用了 **Grouped-Query Attention (GQA)**：

- 传统 Transformer 中，每个查询（Query）都有自己的键值对（Key-Value）
- GQA 让一组共享同一个 Key-Value 对，减少了计算量但保持质量
- 效果：推理速度更快，内存占用更低

### 4.2 SwiGLU 激活函数

替换了传统的 ReLU，使用 SwiGLU：

```
SwiGLU(x, W, V) = SwiGLU(xW) ⊗ (xV)
其中 SwiGLU(z) = Swish(z) ⊗ z
```

这就像给每个神经元加了更精细的"调音旋钮"，让模型学得更好。

### 4.3 词表大小

Llama 3 的词表从 Llama 2 的 32K 扩大到了 **128K**：

- 更大的词表意味着每个 token 能表达更多信息
- 同样长度的文本，token 数更少 → 推理更快
- 对非英语语言（如印地语、泰语）的支持也更好

---

## 五、代码示例

### 5.1 使用 transformers 库加载 Llama 3

```python
from transformers import AutoTokenizer, AutoModelForCausalLM

# 加载模型和分词器（以 8B 为例）
model_name = "meta-llama/Meta-Llama-3-8B-Instruct"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto"
)

# 准备输入
messages = [
    {"role": "user", "content": "请用一句话解释什么是人工智能"}
]

# 分词并生成回复
inputs = tokenizer.apply_chat_template(
    messages, tokenize=True, add_generation_prompt=True,
    return_tensors="pt"
).to(model.device)

outputs = model.generate(inputs, max_new_tokens=256)
response = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(response)
```

**逐行解释：**

1. `AutoTokenizer` 负责把人类文字拆成 tokens（Llama 3 的词表有 128K 个 token）
2. `AutoModelForCausalLM` 加载实际的模型权重
3. `apply_chat_template` 按照 Llama 3 要求的对话格式组装消息
4. `model.generate` 让模型开始生成文本

### 5.2 对比不同尺寸的模型

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# 定义要比较的模型
models = [
    "meta-llama/Meta-Llama-3-8B-Instruct",
    "meta-llama/Meta-Llama-3-70B-Instruct",
]

prompt = "请写一个Python函数，计算斐波那契数列第n项的值"

for model_name in models:
    print(f"\n=== {model_name} ===")

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
        device_map="auto"
    )

    inputs = tokenizer(prompt, return_tensors="pt").to(model.device)
    outputs = model.generate(**inputs, max_new_tokens=256)
    response = tokenizer.decode(outputs[0], skip_special_tokens=True)

    # 提取生成的部分
    generated = response[len(tokenizer.decode(inputs[0][0])):]
    print(generated[:500])
    print(f"[参数量: {model_name.split('-3-')[1].replace('-', 'B').replace('Instruct', '')}]")
```

**这段代码做了什么？**

- 用同一个 prompt 分别问 8B 和 70B 两个模型
- 对比它们的回答质量和速度
- 70B 通常回答更准确、更详细，但推理时间更长

### 5.3 使用 Llama Guard 3 做安全检测

```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# 加载 Llama Guard 3
guard_model_name = "meta-llama/Llama-Guard-3-8B"
tokenizer = AutoTokenizer.from_pretrained(guard_model_name)
model = AutoModelForSequenceClassification.from_pretrained(
    guard_model_name,
    torch_dtype=torch.bfloat16,
    device_map="auto"
)

# 检测输入是否安全
def check_safety(text, role="user"):
    messages = [
        {"role": "system", "content": "Some safety-related system prompt here..."},
        {"role": role, "content": text}
    ]
    inputs = tokenizer.apply_chat_template(
        messages, add_generation_prompt=False, return_tensors="pt"
    ).to(model.device)
    outputs = model.generate(inputs, max_new_tokens=5)
    result = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return "unsafe" in result.lower()

# 测试
safe_text = "请帮我做一道番茄炒蛋"
unsafe_text = "如何制造危险物品"

print(f"安全检测 '{safe_text[:10]}...' → {'安全' if not check_safety(safe_text) else '不安全'}")
print(f"安全检测 '{unsafe_text[:10]}...' → {'安全' if not check_safety(unsafe_text) else '不安全'}")
```

**Llama Guard 3 的作用：**

- 它是一个专门的"安检员"模型
- 在用户输入送给主模型之前先检查一遍
- 在模型输出之后再检查一遍
- 防止生成有害内容

---

## 六、Llama 3 的多模态扩展

论文还展示了一种**组合式方法**，把图像、视频、语音能力"拼装"到 Llama 3 上：

- **图像**：用 CLIP 等预训练编码器提取图像特征，接入 LLM
- **视频**：类似方法，处理时序帧
- **语音**：用 Whisper 等编码器处理音频

这种方法的好处是：**不需要重新训练整个模型**，只需要把对应的编码器接入已有的 LLM。

---

## 七、核心数据对比

论文在多个基准测试上对比了 Llama 3 405B 与其他模型：

| 基准测试 | Llama 3 405B | 代表竞品 |
|----------|-------------|----------|
| MMLU（综合知识） | 87.4% | GPT-4 级别 |
| HumanEval（代码） | 81.7% | 接近 GPT-4 |
| GPQA（科学推理） | 52.8% | 领先开源模型 |
| MATH（数学） | 68.0% | 与闭源模型相当 |

关键结论：**Llama 3 405B 在多数基准上达到了 GPT-4 级别的质量**。

---

## 八、思考题

1. 为什么 Llama 3 要把词表从 32K 扩大到 128K？这对多语言支持有什么影响？
2. Grouped-Query Attention 是如何在保持质量的同时加速推理的？
3. 如果让你设计一个"组合式多模态 LLM"，你会怎么拼接不同的编码器？

---

## 九、延伸阅读

- Llama 2 论文：[arXiv:2307.09288](https://arxiv.org/abs/2307.09288)
- 缩放定律（Scaling Laws）：[Kaplan et al., 2020](https://arxiv.org/abs/2001.08361)
- GPT-4 技术报告：[arXiv:2303.08774](https://arxiv.org/abs/2303.08774)
- Llama 官方代码：[github.com/meta-llama/llama3](https://github.com/meta-llama/llama3)
