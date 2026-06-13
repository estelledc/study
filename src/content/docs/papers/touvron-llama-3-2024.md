---
title: Llama 3 基础模型与开放多语言模型学习笔记
来源: https://arxiv.org/abs/2407.21783
日期: 2026-06-13
分类: 其他
子分类: ml-deep-learning
provenance: pipeline-v3
---

# Llama 3 基础模型与开放多语言模型学习笔记

## 一、什么是基础模型？（从日常类比开始）

想象你有一个学生，他从幼儿园一直读到博士。在读博之前，他读了图书馆里几乎所有公开的书——小说、科技论文、代码文档、数学教材、各种语言的文本。这个过程叫做**预训练（Pre-training）**：通过大量数据自学语言的结构和世界知识。

但光读书不够。他可能知道很多事实，却不会按照你的要求做事。比如你问他"请帮我写一段 Python 代码"，他可能只是继续往下写文章，而不是写代码。所以你需要对他进行**后训练（Post-training）**：教他理解指令、遵循格式、对齐人类偏好。

基础模型（Foundation Model）就是这个"读到博士的学生"——它是一个通用的、经过大规模训练的模型，可以支持多种 AI 任务。

Llama 3 就是 Meta 公司发布的这一代基础模型家族。

## 二、Llama 3 家族有哪些成员？

Llama 3 不是一个单一模型，而是一个"模型群"（Herd），包含三个不同规模的版本：

| 模型 | 参数量 | 发布时间 |
|------|--------|----------|
| Llama 3 8B | 80 亿 | 2024 年 4 月 |
| Llama 3 70B | 700 亿 | 2024 年 4 月 |
| Llama 3 405B | 4050 亿 | 2024 年 7 月 |

每个规模都有两个版本：基础版（Pre-trained）和指令版（Instruct）。基础版只做了预训练，指令版额外做了后训练，能更好地理解和遵循人类指令。

405B 是旗舰模型，参数量接近 4050 亿，相当于如果把每个参数写成一个小字，把所有参数排成一列，长度可以绕地球好几圈。

## 三、核心概念详解

### 3.1 Transformer 架构

Llama 3 使用的是标准的**密集 Transformer** 架构。你可以把 Transformer 想象成一个超级高效的阅读理解机器：

- 它不是逐字阅读，而是同时关注整段文字的所有部分
- 通过一种叫"注意力机制"（Attention）的技术，它能判断哪些词和当前词最相关
- 比如句子"猫坐在垫子上，因为它很暖和"，模型能通过注意力知道"它"指的是"猫"而不是"垫子"

Llama 3 相比前代的小改动：
- 使用**分组查询注意力（GQA）**：把多个查询头共享同一个键值头，提升推理速度
- 词汇表扩大到 **128K** 个 token（Llama 2 只有 32K），压缩率更高
- 支持最长 **128K token** 的上下文窗口（约 10 万字的文档）

### 3.2 训练数据：从 1.8T 到 15T token

Llama 3 预训练用了约 **15 万亿（15T）多语言 token**，而 Llama 2 只有 1.8T。数据量翻了近 8 倍。

数据来源包括：
- 网页文本（经过严格清洗，去除个人信息和不安全内容）
- 代码和数学相关内容
- 176 种语言的文本

数据配比精心调优：
- 50% 通用知识
- 25% 数学和推理
- 17% 代码
- 8% 多语言

### 3.3 后训练：SFT + DPO

后训练分两步：

1. **监督微调（SFT, Supervised Fine-Tuning）**：用人工编写的"问题-答案"对来教模型如何遵循指令
2. **直接偏好优化（DPO, Direct Preference Optimization）**：让模型学会区分"好的回答"和"不好的回答"

这就像先让学生做练习题（SFT），然后老师告诉学生哪些答得好、哪些答得不好（DPO），学生逐渐学会自己判断。

### 3.4 多语言能力

Llama 3 原生支持至少 8 种语言：英语、德语、法语、意大利语、葡萄牙语、印地语、西班牙语和泰语。

这不是简单地把英文模型翻译成其他语言，而是在预训练阶段就融入了多语言数据，让模型真正理解多种语言的表达方式。

## 四、代码示例

### 4.1 使用 Hugging Face Transformers 加载 Llama 3

```python
# 安装依赖：pip install transformers torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# 加载 Llama 3 8B 指令版模型和分词器
model_name = "meta-llama/Meta-Llama-3-8B-Instruct"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto"       # 自动选择 GPU 或 CPU
)

# 准备对话输入
messages = [
    {"role": "system", "content": "你是一个有帮助的助手。"},
    {"role": "user", "content": "请用简单的语言解释什么是神经网络。"}
]

# 将消息转换为模型可接受的格式
input_ids = tokenizer.apply_chat_template(
    messages,
    add_generation_prompt=True,
    return_tensors="pt"
).to(model.device)

# 生成回答
outputs = model.generate(
    input_ids,
    max_new_tokens=512,
    temperature=0.7,
    top_p=0.9
)

# 提取并打印生成的文本
response = tokenizer.decode(outputs[0][input_ids.shape[-1]:], skip_special_tokens=True)
print(response)
```

这里的关键步骤是：
1. 加载预训练好的模型权重和分词器
2. 用 `apply_chat_template` 把对话格式化成模型能理解的 token 序列
3. 用 `model.generate` 让模型一步步预测下一个 token，直到生成完毕

### 4.2 自定义 Prompt 进行推理

```python
# 不使用聊天模板，直接用自定义 prompt
prompt = """请完成以下任务：

给定一个列表 [1, 2, 3, 4, 5]，请写出 Python 代码计算它的平均值和中位数。
只输出代码，不要解释。"""

# 分词
inputs = tokenizer(prompt, return_tensors="pt").to(model.device)

# 生成
outputs = model.generate(
    **inputs,
    max_new_tokens=256,
    temperature=0.1,          # 温度越低，输出越确定
    top_k=50                  # 只在概率最高的 50 个词中选择
)

# 解码
generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(generated_text)
```

`temperature` 控制输出的随机性：
- 接近 0：输出稳定、可重复，适合代码生成
- 接近 1：输出更有创意和多样性，适合写作

### 4.3 量化部署（降低显存需求）

405B 模型需要大量显存。量化技术可以用更少的精度存储参数：

```python
# 使用 bitsandbytes 进行 4-bit 量化加载
from transformers import BitsAndBytesConfig

quantization_config = BitsAndBytesConfig(
    load_in_4bit=True,              # 4-bit 量化
    bnb_4bit_quant_type="nf4",      # 归一化浮点数 4-bit
    bnb_4bit_compute_dtype="float16"
)

# 量化加载 70B 模型，显存需求大幅降低
model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Meta-Llama-3-70B-Instruct",
    quantization_config=quantization_config,
    device_map="auto"
)

# 此时 70B 模型可以在单张 80GB GPU 上运行
```

4-bit 量化把每个参数从 16 位压缩到 4 位，显存占用减少到原来的约 1/4，但模型质量损失很小。

## 五、性能表现

Llama 3 405B 在多项基准测试中达到了与 GPT-4 相当的水平：

- **MMLU**（综合知识测试）：87.3 vs GPT-4 的 85.1
- **HumanEval**（代码生成）：89.0 vs GPT-4 的 86.6
- **GSM8K**（数学推理）：96.8 vs GPT-4 的 94.2
- **MATH**（数学题）：73.8 vs GPT-4 的 64.5

更重要的是，Llama 3 是**开源**的——任何人都可以下载、研究、修改和部署。这与 GPT-4 等闭源模型形成鲜明对比。

## 六、为什么 Llama 3 很重要？

1. **开放获取**：405B 级别的旗舰模型首次开源，让学术界和小公司也能使用顶级模型
2. **多语言原生支持**：不是在英文模型上加翻译层，而是从一开始就用多语言数据训练
3. **编码和推理能力突出**：代码和数学 benchmark 表现优异
4. **工具使用能力**：支持零样本工具调用，可以直接连接外部 API
5. **安全护栏**：配套的 Llama Guard 3 模型用于检测不安全输入和输出

## 七、思考题

这篇文章提到了"数据、规模、管理复杂度"是发展高质量基础模型的三个关键杠杆。你觉得对于初学者来说，如果想自己训练一个小语言模型，应该从哪个杠杆入手？为什么？

（答案会在后续课程中讨论，先想一想自己的看法。）
