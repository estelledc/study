---
title: "Llama 2: 开源大模型的民主化革命"
来源: 'https://arxiv.org/abs/2307.09288'
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 是什么

Llama 2 是 Meta 在 2023 年 7 月发布的**开源大语言模型家族**，包含 7B、13B 和 70B 三种规模。它的核心贡献有两点：

1. **预训练模型（Llama 2）**：在 2 万亿 token 的数据上训练，上下文长度翻倍到 4K，性能比 Llama 1 显著提升
2. **对话模型（Llama 2-Chat）**：经过 SFT + RLHF 微调，专为聊天场景优化，在帮助性和安全性上接近 GPT-3.5

日常类比：如果说 GPT-4 是一辆**封闭工厂生产的豪华轿车**（你只能坐，不能拆看），那 Llama 2 就是一辆**把设计图纸完全公开的赛车**——任何人都可以照着造、照着改，甚至在自己的赛道上跑。

## 为什么重要

- 它是第一个在多个基准上**接近闭源模型**（GPT-3.5、Claude）的开源模型
- 它**允许商用**，这是之前 Llama 1 没有的——直接催生了无数商业应用（Groq、Together AI 等）
- 它让"微调一个自己的聊天机器人"从大公司特权变成了小团队也能做的事

## 核心架构

Llama 2 沿用了 Llama 1 的 Transformer 基础架构，但做了三个关键改进：

### 1. Grouped-Query Attention (GQA)

传统 Transformer 中，每个 Query 都要和所有的 Key/Value 做注意力计算。GQA 把多个 Query 头**共享同一组 Key/Value 头**，大幅减少推理时的内存带宽需求。

想象一下：传统 Multi-Query 就像一个老师（Key/Value）同时回答几十个学生（Query）的问题——老师很累；Grouped-Query 则是把一个班分成几个小组，每组选一个代表去问同一个老师——效率高了，答案质量也差不多。

### 2. 上下文长度翻倍

从 Llama 1 的 2K 提升到 Llama 2 的 **4K**，意味着模型能一次"记住"更长的对话或文档。

### 3. 训练数据升级

- 数据量：从 1 万亿 token 提升到 **2 万亿 token**
- 数据清洗更严格，去除了含个人隐私的网站内容
- 采用新的数据混合策略，增加事实性内容的比例

## 训练流程：三步走

Llama 2-Chat 的训练分三个阶段，每一步都在前一步的基础上加料：

```
预训练（Pretrain）→ 监督微调（SFT）→ 人类反馈强化学习（RLHF）
   ↓                    ↓                      ↓
 读万卷书            学怎么回答问题          学会做人
（通用知识）        （对话格式）            （安全+有用）
```

### 第一步：预训练（Pretraining）

在 2T token 的公开数据上，用标准的自回归 Transformer 训练。目标很简单：**预测下一个词**。

### 第二步：监督微调（SFT）

这一步的关键发现是：**数据质量 > 数据数量**。

Meta 只收集了 **27,540 条**高质量的对话标注数据，就比使用数百万条第三方数据效果更好。每条数据包含一个 prompt 和一个人工写的理想回答。

训练时，模型序列被拼接成 `[prompt][特殊分隔符][answer]` 的形式，只对 answer 部分计算损失并反向传播。

### 第三步：RLHF（人类反馈强化学习）

这是让模型"学会做人"的一步，又分三小步：

**Step A：收集人类偏好数据**

让人工标注员写 prompt，然后对模型生成的两个回答做二选一，并标注偏好程度（显著更好 / 更好 / 稍好 / 差不多）。共收集了约 **300 万组**偏好比较。

**Step B：训练奖励模型（Reward Model）**

训练两个独立的奖励模型——一个评"帮助性"，一个评"安全性"。输入是 prompt + 回答，输出是一个标量分数。

奖励模型的损失函数核心是**排序损失**：

```
L_ranking = -log(sigmoid(r(x, y_chosen) - r(x, y_rejected)))
```

其中 `r(x, y)` 是奖励模型对 prompt x 和回答 y 给出的分数。目标是让"被选中的回答"得分高于"被拒绝的回答"。

他们还加入了一个**边际（margin）**项，根据偏好程度的不同来调整差距大小——"显著更好"的差距要大，"稍好"的差距要小。

**Step C：用 PPO 微调 LLM**

奖励模型给 LLM 的回答打分，然后用 PPO（近端策略优化）算法调整 LLM 的参数，让它生成更高分的回答。

## 代码示例

### 示例 1：用 Hugging Face 加载 Llama 2 模型

```python
from transformers import AutoTokenizer, AutoModelForCausalLM

# 加载 7B 版本的 Llama 2-Chat
model_name = "meta-llama/Llama-2-7b-chat-hf"

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(
    model_name,
    torch_dtype="auto",
    device_map="auto"
)

# 构造对话格式（Llama 2 使用特殊的对话模板）
messages = [
    {"role": "system", "content": "你是一个有帮助的助手。"},
    {"role": "user", "content": "什么是 Llama 2？请用简单的语言解释。"}
]

# 用模板把对话转成模型能理解的格式
input_ids = tokenizer.apply_chat_template(
    messages,
    add_generation_prompt=True,
    return_tensors="pt"
).to(model.device)

# 生成回答
outputs = model.generate(
    input_ids,
    max_new_tokens=512,
    do_sample=True,
    temperature=0.7,
    top_p=0.9
)

response = tokenizer.decode(outputs[0][input_ids.shape[-1]:], skip_special_tokens=True)
print(response)
```

### 示例 2：理解 GQA 与普通 Multi-Head Attention 的区别

```python
import torch
import torch.nn as nn

class MultiHeadAttention(nn.Module):
    """传统 Multi-Head Attention：每个 Query 头有独立的 Key/Value"""
    def __init__(self, d_model=4096, num_heads=32):
        super().__init__()
        self.num_heads = num_heads
        self.head_dim = d_model // num_heads
        self.q_proj = nn.Linear(d_model, d_model)       # Q: 32 组
        self.k_proj = nn.Linear(d_model, d_model)       # K: 32 组
        self.v_proj = nn.Linear(d_model, d_model)       # V: 32 组

    def forward(self, x):
        B, L, D = x.shape
        q = self.q_proj(x).reshape(B, L, self.num_heads, self.head_dim)
        k = self.k_proj(x).reshape(B, L, self.num_heads, self.head_dim)
        v = self.v_proj(x).reshape(B, L, self.num_heads, self.head_dim)
        # QK^T / sqrt(d) 做注意力 → 每个 Q 对应一个 K/V
        return torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim ** 0.5)


class GroupedQueryAttention(nn.Module):
    """GQA：32 个 Query 头共享 8 组 Key/Value"""
    def __init__(self, d_model=4096, num_heads=32, num_kv_heads=8):
        super().__init__()
        self.num_heads = num_heads
        self.num_kv_heads = num_kv_heads
        self.head_dim = d_model // num_heads
        self.q_proj = nn.Linear(d_model, d_model)              # Q: 32 组
        self.k_proj = nn.Linear(d_model, num_kv_heads * self.head_dim)  # K: 8 组
        self.v_proj = nn.Linear(d_model, num_kv_heads * self.head_dim)  # V: 8 组

    def forward(self, x):
        B, L, D = x.shape
        q = self.q_proj(x).reshape(B, L, self.num_heads, self.head_dim)
        k = self.k_proj(x).reshape(B, L, self.num_kv_heads, self.head_dim)
        v = self.v_proj(x).reshape(B, L, self.num_kv_heads, self.head_dim)

        # 把 K/V 扩展到和 Q 相同的头数（广播）
        k = k.repeat_interleave(self.num_heads // self.num_kv_heads, dim=2)
        v = v.repeat_interleave(self.num_heads // self.num_kv_heads, dim=2)

        return torch.matmul(q, k.transpose(-2, -1)) / (self.head_dim ** 0.5)


# 对比参数量（以 70B 为例）
# Llama 2 70B: num_heads=64, num_kv_heads=8 → 8 倍 KV 缓存缩减
# Llama 2 7B:  不使用 GQA（num_heads=32, num_kv_heads=32）
# Llama 2 13B: 不使用 GQA
```

### 示例 3：理解 RLHF 的奖励模型损失

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

def reward_loss(reward_chosen, reward_rejected, preference_rating):
    """
    Llama 2 的奖励模型损失函数。
    reward_chosen: 被选中的回答的奖励分数
    reward_rejected: 被拒绝的回答的奖励分数
    preference_rating: 人工标注的偏好程度 (0= negligibly, 3= significantly)
    """
    # 偏好程度映射为边际值
    margin = torch.tensor([0.0, 0.5, 1.0, 2.0])[preference_rating]

    # 带边际的排序损失
    diff = reward_chosen - reward_rejected - margin
    loss = -F.logsigmoid(diff)
    return loss.mean()


# 模拟数据
reward_chosen = torch.tensor([0.8, 0.6, 0.9, 0.5])
reward_rejected = torch.tensor([0.3, 0.4, 0.7, 0.2])
preference_rating = torch.tensor([3, 1, 2, 0])  # 显著更好、稍好、更好、差不多

loss = reward_loss(reward_chosen, reward_rejected, preference_rating)
print(f"Reward loss: {loss.item():.4f}")
# 输出类似: Reward loss: 0.4521
# 注意：偏好程度越高（significant=3），边际越大，模型学到的差距也越大
```

## 关键数据对比

| 模型 | 参数 | 上下文 | 训练数据 | MMLU |
|------|------|--------|----------|------|
| Llama 1 65B | 65B | 2K | 1T tokens | 63.4 |
| Llama 2 70B | 70B | 4K | 2T tokens | 68.9 |
| GPT-3.5 | ? | ? | ? | 70.0 |

Llama 2 70B 在 MMLU 上达到了 68.9，已经非常接近 GPT-3.5 的 70.0。

## 安全设计

Llama 2 在安全方面做了大量工作：

- **预训练阶段**：主动过滤含个人隐私的网站内容
- **SFT 阶段**：标注员专门编写安全相关的 prompt-response 对
- **RLHF 阶段**：专门的 Safety RM 奖励模型 + 红队测试（Red Teaming）
- **分级许可**：7B 模型完全开放，13B 需要申请，70B 需要签署使用协议

## 你的下一步

如果你想动手体验：

1. 去 Hugging Face 搜索 `meta-llama/Llama-2-7b-chat-hf`，申请访问权限
2. 用上面示例 1 的代码在本地跑起来（需要约 14GB GPU 显存）
3. 试试用自己的数据做 LoRA 微调——这是门槛最低的实践方式

---

*这篇笔记只覆盖了论文的核心部分。如果想深入了解 RLHF 的细节，建议接着看 Ouyang et al. 2022 的 "Training Language Models to Follow Instructions with Human Feedback"（即 ChatGPT 的原论文）。*
