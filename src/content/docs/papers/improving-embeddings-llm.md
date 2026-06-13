---
title: 用 LLM 生成合成数据来训练文本向量
来源: 'Wang et al., "Improving Text Embeddings with Large Language Models", arXiv 2401.00368, 2024 (ACL 2024)'
日期: 2026-06-13
分类: 信息检索
子分类: 嵌入
provenance: pipeline-v3
---

## 是什么

这篇论文提出了一个简单但颠覆性的想法：**用 GPT-4 这样的闭源大模型生成合成训练数据，再拿这些数据来微调一个开源小模型（Mistral-7B），让它变成一个顶级的文本向量模型。** 名字叫 E5-Mistral-7B。

日常类比：以前你要教一个学生做"阅读理解检索"，得先花几年时间让他博览群书（预训练），再给他几十万道老师批改过的练习题（监督微调）。这篇论文的套路是——请一个学霸（GPT-4）自己出题、自己写答案，然后让学生只靠这些"学霸出的题"练不到一千步就毕业了。而且成绩还比传统方法更好。

它的关键创新在于**完全绕过人工标注**。之前的顶级 embedding 模型（E5、BGE）都要经过"大规模弱监督预训练 + 多轮人工标注微调"的复杂流水线。这篇论文证明：如果你有一个足够强的 LLM 来生成合成数据，中间那些繁琐步骤都可以省掉。

## 为什么重要

不理解这篇论文，就无法理解 2024 年以来 embedding 领域的范式转移：

- 在此之前，所有人都认为 embedding 模型必须靠"多阶段训练"——先用几十亿对弱监督数据预训练，再用人工标注数据微调。这篇论文第一次证明单阶段就够了
- 在此之前，顶级 embedding 用的是 BERT 风格的编码器（双向编码器）。这篇论文证明了 decoder-only LLM（如 Mistral-7B）也可以，而且效果更好
- 在此之前，embedding 模型的多语言能力受限于人工标注数据的语言覆盖（比如 Instructor 只有 330 个英文指令）。这篇论文用 LLM 生成了 93 种语言的数据
- 在此之后，"LLM 生成合成数据 → 微调小模型"这条路线成为主流——不只是 embedding，指令微调、代码生成等领域都在跟进

简单来说，它把 embedding 模型的训练从"工业级流水线"简化成了"一步到位"。

## 核心概念

### 概念 1：合成数据生成的两步法

论文的核心方法是**两步提示策略**：

第一步——头脑风暴：让 GPT-4 列出各种可能的文本检索任务类型。比如"写一篇关于气候变化政策的中英文摘要"、"根据产品描述推荐最匹配的评论"等等。这一步是为了覆盖尽可能多的任务场景。

第二步——生成数据：针对每一步脑暴出来的任务类型，让 GPT-4 生成具体的 (查询, 正面文档, 困难负样本) 三元组。困难负样本是指那些看起来相关但其实不匹配的文档——这才是训练embedding最有价值的信号。

为什么要两步？论文尝试过一步到位（直接让 GPT-4 生成三元组），结果多样性不够。先让模型"想任务"再"做题"，相当于给了模型思考的时间，产出质量更高。

### 概念 2：非对称 vs 对称任务

embedding 任务分为两大类：

**非对称任务**（asymmetric）：查询和文档长度/语义角色不同。比如搜索引擎里"简短的搜索词"去匹配"长长的网页文档"。论文进一步分成四种子类型：短查长、长查短、短短、长长。每种都设计了不同的 prompt 模板。

**对称任务**（symmetric）：查询和文档语义相近但表达不同。比如语义相似度比较（"这两句话意思一样吗？"）和跨语言句对匹配（同一句话的英文和中文版）。这类任务不需要脑暴步骤，因为任务定义本身就很简单。

### 概念 3：对比学习（InfoNCE Loss）

训练 embedding 模型的核心目标是**对比学习**。用最直白的话说：

想象你在一个舞会上，每个人手里拿着一张"语义名片"（向量）。对比学习的目标就是让语义相近的人站得近，语义不同的人站得远。

具体怎么衡量远近？用**余弦相似度**——两个向量夹角越小，越相似。然后用一个叫 InfoNCE 的损失函数：对每个正样本对（查询和正确文档），把它在同一个 batch 里所有其他文档都当作负样本来推远。温度系数 tau（论文中设为 0.02）控制"远近"的敏感度。

### 概念 4：指令前缀（Instruction Prefix）

论文的一个关键技巧：给查询加指令前缀，格式是 `Instruct: {任务定义}\nQuery: {查询文本}`。文档侧不加任何东西。

这意味着什么？意味着你可以通过改变查询侧的指令来**自定义模型的检索行为**，而不需要重新训练模型或重建索引。比如你想做"学术论文摘要检索"，就在指令里写明；想做"产品评论检索"，换一条指令就行。

### 概念 5：为什么 LLM 不需要对比预训练

之前的 embedding 模型（如 E5）需要先做一轮"对比预训练"——用大量无标签文本对让模型学会基本的语义对齐。但对 Mistral-7B 这种在万亿 token 上预训练的 LLM 来说，这一步**几乎没用**。

论文的实验（图 3）显示：对小型模型（XLM-R-large），对比预训练能带来 8.2 分的提升；但对 Mistral-7B，提升微乎其微。原因是 LLM 的自回归预训练已经让它学会了足够好的语义表示，微调就能直接转化为 embedding 能力。

## 代码示例

### 示例 1：用合成数据格式训练一个简易对比学习 loop

```python
# 模拟论文中的合成数据格式：(任务定义, 查询, 正面文档, 困难负样本列表)
synthetic_data = [
    {
        "task_definition": "根据用户的问题找到最相关的帮助文档",
        "query": "如何重置我的密码？",
        "positive": "要重置密码，请访问设置页面并点击'忘记密码'链接...",
        "negatives": [
            "如何更改我的用户名？",
            "密码强度要求是什么？",
        ],
    },
    {
        "task_definition": "根据产品描述找到最匹配的买家评论",
        "query": "这款耳机的降噪效果怎么样？",
        "positive": "降噪效果超出预期，地铁上完全听不到外界噪音...",
        "negatives": [
            "电池续航时间能达到多久？",
            "耳机佩戴舒适吗？",
        ],
    },
]

# 每条数据构造为对比学习格式
training_samples = []
for item in synthetic_data:
    instruction = f"Instruct: {item['task_definition']}\nQuery: {item['query']}"
    training_samples.append({
        "anchor": instruction,       # 带指令的查询
        "positive": item["positive"],
        "negatives": item["negatives"],
    })

# 实际训练中，这些样本会被送入 Mistral-7B，取 [EOS] 位置的向量
# 然后用 InfoNCE loss 优化：拉近 anchor 和 positive，推远 anchor 和 negatives
```

### 示例 2：用训练好的模型做检索（推理阶段）

```python
from transformers import AutoModel, AutoTokenizer
import torch
import numpy as np

# 加载微调后的 E5-Mistral-7B 模型
model_name = "intfloat/e5-mistral-7b-instruct"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModel.from_pretrained(model_name)

def get_embedding(text, is_query=True, task_definition=""):
    """把文本编码为向量"""
    if is_query and task_definition:
        # 查询侧加指令前缀
        text = f"Instruct: {task_definition}\nQuery: {text}"
    # 文档侧不加任何前缀

    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)

    with torch.no_grad():
        outputs = model(**inputs)

    # 取 [EOS] 位置的向量作为文本表示
    eos_mask = inputs["input_ids"] == tokenizer.eos_token_id
    eos_indices = eos_mask.long().argmax(dim=-1)
    embeddings = outputs.last_hidden_state.gather(
        dim=1, index=eos_indices.unsqueeze(-1).unsqueeze(-1)
    ).squeeze(1)

    # L2 归一化，方便算余弦相似度
    embeddings = embeddings / embeddings.norm(dim=1, keepdim=True)
    return embeddings.numpy()

# 建索引
docs = [
    "要重置密码，请访问设置页面并点击'忘记密码'链接...",
    "降噪效果超出预期，地铁上完全听不到外界噪音...",
    "这款手机电池容量为 5000mAh，正常使用可达两天...",
]
doc_embeddings = np.array([get_embedding(d, is_query=False) for d in docs])

# 搜索
query = "如何重置我的密码？"
query_emb = get_embedding(query, is_query=True, task_definition="根据用户问题找到最相关的帮助文档")

# 算余弦相似度，取 Top-K
similarities = doc_embeddings @ query_emb.T
top_idx = np.argsort(similarities)[::-1][0]
print(f"最匹配文档: {docs[top_idx]}")
print(f"相似度: {similarities[top_idx]:.4f}")
```

### 示例 3：用 LoRA 高效微调（论文实际用的训练方式）

```python
from peft import LoraConfig, get_peft_model
from transformers import AutoModelForCausalLM, AutoTokenizer

base_model = "mistralai/Mistral-7B-v0.1"
tokenizer = AutoTokenizer.from_pretrained(base_model)
model = AutoModelForCausalLM.from_pretrained(
    base_model, torch_dtype=torch.float16, device_map="auto"
)

# 论文使用 LoRA rank=16，只训练少量参数
lora_config = LoraConfig(
    r=16,                    # 论文默认值
    lora_alpha=32,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
    lora_dropout=0.05,
    bias="none",
)
model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 4,194,304 || all params: 7,241,745,152 || 0.058%

# 训练配置
# - 损失函数：InfoNCE (对比损失)
# - 温度系数 tau = 0.02
# - 训练步数：< 1000 步
# - 优化器：AdamW + DeepSpeed ZeRO-3
# - 数据量：50 万条合成数据（GPT-4 生成）+ 可选的 MS MARCO 标注数据
```

## 实验结果

论文在两个权威 benchmark 上做了大量实验：

**MTEB 基准**（56 个英语任务，涵盖分类、聚类、检索、相似度等 8 类）：

| 模型 | 平均得分 | 说明 |
|------|---------|------|
| BGE-large-en-v1.5 | 64.2 | 之前的 SOTA，多阶段训练 |
| E5-large-v2 | 62.3 | 两阶段训练，13 亿对弱监督数据 |
| E5-Mistral-7B + 合成数据 | **63.1** | 零人工标注，仅 50 万条合成数据 |
| E5-Mistral-7B + 合成+标注 | **66.6** | 超越 BGE 2.4 分，新 SOTA |

关键发现：即使只用合成数据（零人工标注），E5-Mistral-7B 已经超过了几乎所有传统方法。加上少量标注数据后更是大幅领先。

**多语言检索**（MIRACL 数据集，18 种语言）：在高资源语言（英、法、西语等）上表现优异，但在低资源语言上不如 mE5-base。作者承认这是因为 Mistral-7B 主要在英语上预训练，未来多语言 LLM 结合这个方法会更好。

**长文本**：通过调整 RoPE 旋转基数，模型可以在 32K token 的上下文中做个性化密钥检索，准确率达 90%+，远超传统 512 token 的限制。

## 踩过的坑

1. **GPT-3.5 产出的质量不如 GPT-4**：论文发现 GPT-3.5 生成的部分数据不严格遵循 prompt 格式。虽然整体质量可接受且加入后有收益，但 GPT-4 的数据明显更干净。

2. **指令前缀不是噱头**：去掉指令前缀后性能下降 4.2 分（从 64.5 降到 60.3）。这说明自然语言指令确实帮助模型理解了任务上下文，不是简单的文档化手段。

3. **低资源语言的天花板**：合成数据覆盖了 93 种语言，但低资源语言的效果不如 mE5-base。根本原因是 Mistral-7B 本身在这些语言上的预训练不够充分。方法再好，底座不行也白搭。

4. **推理成本高**：相比 BERT-style 的小模型，Mistral-7B 的推理速度慢很多，embedding 维度也有 4096。对于部署场景这是一个实际的成本权衡。

## 适用 vs 不适用场景

**适用**：

- 从零开始构建一个新的 embedding 模型，不想花时间收集标注数据
- 需要一个能自定义检索行为的通用模型（通过指令切换任务）
- 多语言场景（93 种语言覆盖）
- 长文本检索需求（可扩展到 32K token）

**不适用**：

- 算力受限、需要轻量级部署的场景——7B 参数的推理成本远高于 BERT 级别的几百 MB 模型
- 低资源语言优先的场景——底座模型的预训练语言分布决定了天花板
- 需要极致低延迟的在线检索——解码器架构的推理速度不如编码器

## 历史小故事（可跳过）

- **2022 年底** E5 用两阶段训练统治了 MTEB 榜单，但训练流程极其复杂：13 亿对弱监督数据 + 150 万对人工标注 + 多轮 hard negative 挖掘
- **2023 年中** BGE 和 GTE 跟进，但都延续了 E5 的多阶段流水线
- **2024 年 1 月** 这篇论文出现，直接把训练流程砍到一步：LLM 生成数据 → 微调。训练步数不到 1000
- **2024 年 5 月** 论文被 ACL 2024 接收
- 此后"LLM 生成合成数据训练下游模型"的思路蔓延到指令微调、代码生成、对话系统等多个领域

## 学到什么

1. **LLM 本身就是一个强大的数据工厂**——GPT-4 生成的合成数据质量足以媲美甚至超越人工标注数据
2. **两阶段训练不是必须的**——对足够大的 LLM 底座，对比预训练可以省掉，直接微调即可
3. **指令是零成本的"旋钮"**——通过改变查询侧的指令前缀，可以在不重新训练模型的情况下切换检索任务
4. **数据多样性比数据量更重要**——50 万条多样化的合成数据（覆盖 93 种语言、数百种任务）胜过单一来源的数百万条
5. **底座决定天花板**——合成数据方法再强大，如果底座模型在某种语言上预训练不足，效果就上不去

## 关键概念词典

- **InfoNCE loss**：对比学习的核心损失函数，本质是一个多分类问题——给定一个查询和一组文档，模型要选出哪个是真正的正样本
- **LoRA**：低秩自适应，一种高效的微调技术，只训练少量额外参数（论文中占全部参数的 0.058%），大幅降低训练成本
- **MTEB**：Massive Text Embedding Benchmark，当前 embedding 模型的事实标准评测基准，56 个任务跨 8 大类
- **BEIR**：15 个零样本检索任务的集合，常用于评估 embedding 模型的泛化能力
- **RoPE**：旋转位置编码（Rotary Positional Embedding），Transformer 的一种位置编码方式，论文中通过调整旋转基数来扩展上下文窗口
- **EOS pooling**：取序列最后一个 [EOS] token 的隐藏状态作为整个文本的向量表示，论文采用的方式而非 [CLS] 或 mean pooling

## 延伸阅读

- 论文：[arXiv 2401.00368](https://arxiv.org/abs/2401.00368)
- HuggingFace 模型：[intfloat/e5-mistral-7b-instruct](https://huggingface.co/intfloat/e5-mistral-7b-instruct)
- MTEB 榜单：[huggingface.co/spaces/mteb/leaderboard](https://huggingface.co/spaces/mteb/leaderboard)
- [[e5-2022]] —— E5 的前作，两阶段训练范式，本文在其基础上用 LLM 合成数据简化了流程
- [[rag-lewis-2020]] —— RAG 的开山论文，embedding 是 RAG 系统的核心组件
- [[dpr-2020]] —— 稠密检索先驱，对比 E5 看从"纯监督"到"合成数据"的演化

## 关联

- [[e5-2022]] —— E5 的前作，两阶段训练；本文用 LLM 合成数据将其压缩为一步
- [[dpr-2020]] —— 稠密检索开山，需要大量人工标注；本文证明合成数据可以替代
- [[rag-lewis-2020]] —— RAG 框架，embedding 是其中检索环节的核心
- [[colbert-2020]] —— late interaction 检索路线，和本文单向量是稠密检索两大流派
- [[llama]] —— Llama 系列的开源 LLM，和 Mistral 一样是 decoder-only 架构的代表
- [[clip]] —— 跨模态对比学习，InfoNCE loss 的灵感来源，本文是纯文本版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- 暂无
