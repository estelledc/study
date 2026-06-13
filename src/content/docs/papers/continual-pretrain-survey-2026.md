---
title: Continual Pretraining — 让大模型"活到老，学到老"
来源: https://arxiv.org/abs/2402.01364
日期: 2026-06-13
分类_原始: 大语言模型
分类: 机器学习
子分类: 模型与训练
难度: 入门
provenance: pipeline-v3
---

> **说明**：用户提供的 arXiv ID 2605.30765 实际对应一篇量子物理论文，与"Continual Pretraining"无关。本文基于该主题最相关的综述论文 arXiv:2402.01364 *Continual Learning for Large Language Models: A Survey*（Wu et al., 2024）以及多篇核心研究撰写，覆盖 Continual Pretraining 的完整知识体系。

## 是什么

**Continual Pretraining（持续预训练，简称 CPT）** 是在一个已经训练好的大语言模型（LLM）基础上，**继续喂新数据做预训练**，让模型"边活边学"，而不是每次学新知识都从零训练或者只靠外挂检索。

日常类比：

- **传统预训练** = 一个学生读完了大学本科（4 年），毕业了。之后再想知道新东西，只能课外自学（检索增强 / RAG），或者重新考研（全量重新训练）。
- **Continual Pretraining** = 这个学生边工作边读在职研究生，继续上课、做研究，**原来的知识没丢，还学了新的**。

一句话：CPT 就是用**新的语料**对一个**已有的预训练模型**再做几轮自监督训练，让它掌握新事实、新领域或新语言。

## 为什么重要

不理解 CPT，下面这些事都没法解释：

- 为什么 GPT-4 的"知识截止日期"是 2023 年——因为它的预训练数据停在那儿，之后发生的事它不知道
- 为什么每个行业都想把自己的"医疗版 / 法律版 / 金融版 LLaMA"做出来——通用模型不够专精，CPT 是最低成本的领域适配方式
- 为什么 RAG 不能完全替代 CPT：RAG 只能补事实，CPT 能补领域语言风格、术语体系，甚至推理模式
- 为什么模型越大越适合 CPT：大模型有更强的"记忆弹性"，学新东西时不容易把旧的忘光

## 核心概念

### 1. 三阶段学习框架

LLM 的完整训练分三阶段，CPT 发生在第一阶段：

```
初始化权重（随机）
  |
  v
┌─────────────────────┐
│ ① 初始预训练 (PT)   │ ← 从海量无标注文本学语言
│   (基础大模型诞生)    │
└─────────────────────┘
  |
  v
┌─────────────────────┐
│ ② 持续预训练 (CPT)  │ ← 用新数据继续学（本文主题）
│   "活到老学到老"     │
└─────────────────────┘
  |
  v
┌─────────────────────┐
│ ③ 指令微调 (SFT)    │ ← 学怎么听话办事
│   Alignment / RLHF  │ ← 学价值观对齐
└─────────────────────┘
```

CPT 的核心问题：**模型学新东西的时候，怎么不把旧的东西忘光？** 这个问题叫"灾难性遗忘"（Catastrophic Forgetting）。

### 2. 灾难性遗忘

神经网络在学新任务时，参数会剧烈调整，导致旧知识的表示被"覆盖"。

类比：你英文很好，后来去学法语。学得越用力，英文反而越生疏——这就是遗忘。

### 3. 三种 CPT 方向

| 方向 | 目标 | 例子 |
|------|------|------|
| 更新事实 | 跟上时事 / 新知识 | 用最新维基百科更新模型 |
| 更新领域 | 让通用模型变专家 | 让 LLaMA 变成医疗 LLaMA |
| 扩展语言 | 增加新语言支持 | 让英语模型学会中文 |

## 代码示例

### 示例 1：最基本的 CPT 流程（PyTorch + Hugging Face）

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from datasets import load_dataset

# 1. 加载已有的基础模型（例如 LLaMA-2-7B）
model_name = "meta-llama/Llama-2-7b-hf"
model = AutoModelForCausalLM.from_pretrained(model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# 2. 加载新语料——这里用最新的维基百科数据做例子
dataset = load_dataset("wikipedia", "20231201.en", split="train")

# 3. 对文本做 tokenize，切分成固定长度的句子块
MAX_LENGTH = 512

def tokenize(example):
    return tokenizer(
        example["text"],
        truncation=True,
        max_length=MAX_LENGTH,
        return_overflowing_tokens=True,
        stride=128,  # 重叠 128 个 token，避免切分处信息丢失
    )

tokenized_dataset = dataset.map(tokenize, batched=True)
tokenized_dataset = tokenized_dataset.filter(lambda x: x["input_ids"] is not None)

# 4. 定义训练参数
training_args = TrainingArguments(
    output_dir="./continual-pretrained-model",
    learning_rate=1e-5,          # CPT 的 lr 通常比从头训练小很多
    num_train_epochs=3,          # 通常 1-3 轮就够了，学太多会过拟合
    per_device_train_batch_size=16,
    gradient_accumulation_steps=4,
    warmup_ratio=0.05,           # 少量 warmup
    logging_steps=100,
    save_strategy="epoch",
    fp16=True,                   # 混合精度训练
)

# 5. 启动持续预训练
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
)

trainer.train()
trainer.save_model("./continual-pretrained-model")
```

关键点：
- **学习率要小**（1e-5 ~ 5e-5），比从头预训练小一个数量级——太大容易覆盖旧知识
- **训练轮次要少**（1-3 epoch）——多训不如早停
- **重叠切分（stride）**很重要——句子不会恰好从边界断掉

### 示例 2：用 LoRA 做参数高效的 CPT

全量微调 7B 模型需要约 28GB GPU 显存（参数本身就占 14B × 4 bytes × 2 for Adam optimizer）。**LoRA** 只训练少量参数，大幅降低成本：

```python
from peft import LoraConfig, get_peft_model

# 1. 加载基础模型（同上）
model = AutoModelForCausalLM.from_pretrained(model_name)

# 2. 注入 LoRA 适配器
lora_config = LoraConfig(
    r=16,                          # LoRA 的秩——越大表达力越强，但参数也越多
    lora_alpha=32,                 # 缩放因子，通常设为 r 的 2 倍
    target_modules=[              # 对哪些层打 LoRA 补丁
        "q_proj",                 # Q 矩阵（注意力查询）
        "k_proj",                 # K 矩阵（注意力键）
        "v_proj",                 # V 矩阵（注意力值）
        "out_proj",               # 注意力输出投影
        "fc_in",                  # MLP 的前馈层
        "fc_out",                 # MLP 的输出层
    ],
    lora_dropout=0.05,            # 小 dropout 防过拟合
    bias="none",                  # 偏置项不训练
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, lora_config)

# 3. 打印一下可训练参数比例——通常只有 0.1%~1%
model.print_trainable_parameters()
# 例如: trainable params: 8,388,608 || all params: 6,738,012,672 || 0.12%

# 4. 训练（用上面的 Trainer 即可，不需要改）
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset,
)

trainer.train()

# 5. 合并 LoRA 权重并保存（可选——不合并也可以直接用）
model = model.merge_and_unload()
model.save_pretrained("./lora-continual-pretrained-model")
```

为什么 LoRA 适合 CPT？
- **参数少 = 遗忘少**：只动 0.1% 的参数，旧知识被改动的幅度自然小
- **可切换**：不同领域的 LoRA 适配器可以插拔，一个基座模型配多个领域适配器

### 示例 3：数据混合策略——防止遗忘的关键 trick

只用新数据训练 = 高遗忘风险。业界常用"新旧混合"策略：

```python
# 数据混合比例实验（来自多项 CPT 研究）

# 方案 A：纯新数据（遗忘最严重，但新知识学得最快）
# new_data_ratio = 1.0

# 方案 B：90% 新 + 10% 旧（业界最常用，遗忘和学习的平衡点）
# new_data_ratio = 0.9

# 方案 C：50% 新 + 50% 旧（遗忘最少，但新知识学得慢）
# new_data_ratio = 0.5

# 实现混合：
def build_mixed_dataset(new_dataset, old_dataset, new_ratio=0.9):
    """
    按 new_ratio 混合新旧数据集。
    old_dataset 通常是原始预训练数据的一个子集（没必要全量）。
    """
    # 权重采样：新数据被抽到的概率 = new_ratio
    from datasets import concatenate_datasets, Dataset

    # 简单做法：拼接后 shuffle
    old_subset = old_dataset.shuffle(seed=42).select(range(len(new_dataset) * (1 - new_ratio) // (new_ratio or 1e-9)))
    mixed = concatenate_datasets([new_dataset, old_subset])
    return mixed.shuffle(seed=42)

# 更高级的做法：按"知识领域"加权——
# 通用知识（语法、常识）用旧数据保持
# 领域知识（新闻、论文）用新数据更新
# 这相当于给不同知识类型不同的"遗忘保护"
```

## 踩过的坑

### 坑 1：学习率设太大 = 遗忘加速器

```
从头预训练： lr = 3e-4 ~ 6e-4
CPT 微调：   lr = 1e-5 ~ 5e-5    ← 必须小
```

原因：从头训练时参数在"找"大方向；CPT 时参数已经在好位置附近，大步走就直接跨出去了。

经验法则：CPT 的学习率 = 从头预训练学习率 × 0.05 ~ 0.1。

### 坑 2：训练轮次越多越好 = 错的

```
从头预训练： 通常训练 100B-300B tokens，可能跨数周
CPT：        通常训练 5B-50B tokens，几天到一周
```

过度训练 CPT 的后果：
- 模型"过度适应"新数据，在新数据上表现得很好，但在通用任务上退化
- 新数据的分布通常不够多样（比如只有维基百科），多训会过拟合

### 坑 3：数据质量比数据量重要得多

CPT 的教训：**脏数据 × CPT = 垃圾进，更快垃圾出。**

- 原始预训练的数据是人工筛选过的（Common Crawl → 清洗 → 去重 → 质量过滤）
- 如果你直接用"爬回来的网页"做 CPT，效果往往不如先用干净数据
- 一条高质量新闻 > 100 条低质量网页

### 坑 4：词汇表不匹配

换了新语言或新领域后，**tokenizer 的词汇表可能不认识新词**：

```python
# 问题：中文词汇在新tokenizer里被拆成碎片
# "人工智能" → ["人", "工", "智", "能"] → 4 个 token
# 而不是一个 token → 信息密度下降，训练效率降低

# 解决：扩展 tokenizer
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.trainers import BpeTrainer

# 用新语料重新训练 tokenizer，保留原有词表
tokenizer = AutoTokenizer.from_pretrained(model_name)
new_tokens = ["人工智能", "大语言模型", ...]  # 领域术语
tokenizer.add_tokens(new_tokens)
# ⚠️ 加完 token 后，需要重新初始化它们的 embedding，并小心训练
```

### 坑 5：跨阶段遗忘

CPT 如果发生在指令微调之后：

```
PT → CPT → SFT → Alignment   ← 正常流程

PT → SFT → CPT（在指令微调后的模型上继续预训练）
            ↓
       指令跟随能力下降！      ← 跨阶段遗忘
```

原因：指令微调改变了模型的"行为模式"（从"补全句子"变成"回答问题"），再回到自监督预训练会"忘记怎么听话"。

解决方案：在 CPT 数据里掺入一部分指令数据。

### 坑 6：评估指标选不对

| 指标 | 公式 | 含义 |
|------|------|------|
| 困惑度 (PPL) | exp(-平均 log prob) | CPT 时最常用的训练指标——越低越好 |
| BWT（向后转移率） | avg(新模型在旧任务上的性能 - 旧模型在旧任务上的性能) | 负值 = 有遗忘，越接近 0 越好 |
| FWT（向前转移率） | avg(新模型在新任务上的初始性能 - 随机初始化在旧任务上的性能) | 正值 = 旧知识帮助了新任务 |

很多人只看 PPL，忽略了 BWT。**PPL 下降了 10% 但 BWT 是 -0.3，说明模型学了新东西但丢了旧东西——得不偿失。**

## 不同规模的模型，CPT 效果差异很大

研究（Yıldız et al., 2024, arXiv:2402.17400）发现：

- **< 1.5B 的小模型**：CPT 提升显著，是最受益的群体。因为小模型在预训练时学不完所有知识，CPT 能补
- **7B+ 的大模型**：CPT 仍然有效，但边际收益递减。大模型本身已经"学了很多"，CPT 主要补的是领域知识
- **关键发现**：大模型在 CPT 时遗忘更慢。同样的训练强度下，LLaMA-7B 遗忘率远低于 GPT-2 (125M)

## 相关技术对比

| 技术 | 更新什么 | 要不要改模型参数 | 成本 |
|------|----------|-----------------|------|
| **CPT（本文）** | 语言理解 / 知识 / 领域 | 改 | 高 |
| RAG | 事实知识 | 不改 | 低 |
| 指令微调 (SFT) | 任务行为 | 改 | 中 |
| 模型编辑 | 特定事实 | 改少量 | 低 |

核心区别：CPT 是唯一能改变模型**语言理解能力**和**领域适配度**的方法。RAG 只能在外围补充知识。

## 读到什么

1. **固定权重的模型 = 时间胶囊**——预训练完成的那一刻，模型就被"冻结"在那个时间点。CPT 是打破这种冻结的方式。

2. **遗忘不是故障，是学习的代价**——神经网络本质上是在参数空间里找一个新的最优解。这个过程中旧知识被覆盖是物理规律，不是 bug。关键是用混合数据、小学习率、LoRA 等手段来减轻。

3. **CPT 不是万能药**——它不能让你的模型突然学会它语言里本来没有的语法结构，也不能让它突然理解它从未接触过的推理模式。它最适合"增量式"的知识更新。

4. **数据管道比模型架构更重要**——一个精心构建的 CPT 数据管道（清洗→去重→质量过滤→领域标注→混合比例调优）带来的提升，远大于换个更复杂的模型。

5. **"活到老学到老"是渐进式的**——CPT 不是一次性的。模型可以每隔几个月做一次小更新，或者按领域持续积累。真正的 LLM 应该是"持续进化"的。

## 延伸阅读

- 综述论文：[Continual Learning for Large Language Models: A Survey](https://arxiv.org/abs/2402.01364)（Wu et al., 2024）——本文的核心来源
- 持续预训练基准：[Investigating Continual Pretraining in LLMs](https://arxiv.org/abs/2402.17400)（Yıldız et al., 2024）——不同规模模型的 CPT 对比研究
- [Recyclable Tuning for Continual Pre-training](https://arxiv.org/abs/2305.08702)（Qin et al., ACL 2023 Findings）——如何回收旧任务的适配权重
- [Synthetic Continued Pretraining](https://arxiv.org/abs/2409.07431)（Yang et al., 2024）——用小领域数据合成大量预训练数据
- [RedWhale: Korean LLM via Continual Pretraining](https://arxiv.org/abs/2408.11294)（Vo et al., 2024）——CPT 在低资源语言的实践

## 关联

- [[指令微调]] —— CPT 之后的第二步：让模型学会听话
- [[rag]] —— 不靠改参数的知识更新方案，和 CPT 互补
- [[灾难性遗忘]] —— CPT 要面对的核心难题
- [[liger-kernel-llm-training]] —— 如果要做 CPT，需要高效的训练框架
- [[how-lora-remembers]] —— LoRA 在持续学习中的记忆保持机制
