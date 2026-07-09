---
title: LoRA — 给冻结大模型贴低秩便签
来源: 'J. Edward Hu, Yelong Shen, Phillip Wallis, "LoRA: Low-Rank Adaptation of Large Language Models", arXiv 2021'
日期: 2026-05-29
分类: 机器学习
难度: 中级
---

## 是什么

LoRA（Low-Rank Adaptation）是一种**不改大模型原始权重，只训练很小一组低秩矩阵**的微调方法。日常类比：你不把整本教材重写一遍，只是在关键页贴几张便签；考试时教材还是原书，但便签会提醒你这门课该怎么答。

大模型里每个线性层都有一块权重矩阵 `W`。普通微调会直接更新 `W` 的全部数字；LoRA 把 `W` 冻住，只学习一个小更新量 `ΔW`，并把这个更新量写成两个瘦矩阵相乘：`ΔW = B @ A`。

为什么叫低秩？因为 `A` 和 `B` 中间有一个很小的维度 `r`。如果原矩阵像一张 4096×4096 的大桌布，LoRA 只缝两条窄布带，拼起来近似完成任务需要的改动。

## 为什么重要

不理解 LoRA，下面这些事都没法解释：

- 为什么 70B 大模型也能在单机或少量 GPU 上做指令微调，而不是每个任务都重新训练 700 亿参数
- 为什么 PEFT（Parameter-Efficient Fine-Tuning）成为现代 LLM 微调默认入口，背后最常用的基线就是 LoRA
- 为什么部署时可以把 LoRA 权重合并回原模型，不像很多 adapter 那样额外增加推理延迟
- 为什么后来的 QLoRA、AdaLoRA、DoRA 都围绕"小矩阵改大模型"继续演化

## 核心要点

LoRA 的核心可以拆成 **三步**：

1. **冻结原模型**：预训练权重 `W` 不动，像锁在保险柜里的底片。这样训练时不用保存 `W` 的梯度和优化器状态，显存压力大幅下降。

2. **学习低秩更新**：只训练 `A` 和 `B` 两个小矩阵，类比只给地图加几条新路线。论文里的直觉是：下游任务真正需要改变的方向很少，不必在所有维度上重新写一遍。

3. **推理时合并**：训练完把 `B @ A` 加回 `W`，得到 `W' = W + BA`。类比把便签内容抄进复印件，正式使用时不需要多走一层网络，因此没有额外推理延迟。

一个常见配置是只在 Transformer attention 的 `Wq` 和 `Wv` 上加 LoRA。论文在 GPT-3 175B 上发现，同样参数预算下，改 `Wq + Wv` 往往比只改一个矩阵更划算。

## 实践案例

### 案例 1：一个最小 LoRA 线性层

```python
import torch
import torch.nn as nn

class LoRALinear(nn.Module):
    def __init__(self, in_dim, out_dim, r=8, alpha=16):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(out_dim, in_dim), requires_grad=False)
        self.A = nn.Parameter(torch.randn(r, in_dim) * 0.01)
        self.B = nn.Parameter(torch.zeros(out_dim, r))
        self.scale = alpha / r

    def forward(self, x):
        delta = self.B @ self.A
        return x @ (self.weight + self.scale * delta).T
```

**逐部分解释**：

- `weight` 是冻结的大模型原权重，`requires_grad=False` 表示不训练它
- `A` 和 `B` 是 LoRA 新增的小矩阵，训练时只更新它们
- `alpha / r` 是缩放系数，避免低秩更新一开始就把原模型扰动得太猛

### 案例 2：参数量为什么能少这么多

```python
d = 4096
r = 8
full = d * d              # 普通微调一个 4096x4096 矩阵
lora = r * d + d * r      # A: 8x4096, B: 4096x8
print(full, lora, full / lora)
```

**逐部分解释**：

- 普通微调要动 `16,777,216` 个参数
- LoRA 只动 `65,536` 个参数
- 单个矩阵上大约少 `256` 倍；模型越大，冻结权重带来的优化器显存节省越明显

### 案例 3：训练后合并，不增加推理层数

```python
def merge_lora(weight, A, B, alpha, r):
    delta = (alpha / r) * (B @ A)
    return weight + delta

merged_weight = merge_lora(W, A, B, alpha=16, r=8)
```

**逐部分解释**：

- 训练阶段保留 `W`、`A`、`B` 三份东西，方便只训练小矩阵
- 部署阶段提前算好 `B @ A`，直接加进 `W`
- 线上推理只看到一个普通线性层，所以 LoRA 的延迟优势来自"可合并"

## 踩过的坑

1. **低秩不是越大越好**：`r` 变大参数更多，但论文里 GPT-3 任务上 `r=1/2/4/8` 已经很强，继续加到 64 不一定涨分。

2. **LoRA 加在哪里很关键**：只改 `Wq` 常常不如同时改 `Wq` 和 `Wv`，因为注意力里的查询和取值承担不同功能。

3. **冻结不等于没有显存成本**：前向激活、KV cache、batch、序列长度仍然吃显存；LoRA 主要省的是可训练参数、梯度和优化器状态。

4. **多个 LoRA adapter 会互相打架**：同一底座挂多个任务 adapter 时，要管理好加载、合并和卸载顺序，否则容易把某个任务的改动误合进通用权重。

## 适用 vs 不适用场景

**适用**：

- 大语言模型的指令微调、领域微调、分类微调
- 想给同一个底座维护多个任务版本，但不想复制整套模型权重
- 训练资源有限，只能接受少量可训练参数和较低 optimizer 显存
- 线上推理要求低延迟，希望把 adapter 合并进原权重

**不适用**：

- 任务和底座差异极大，需要重写大量表示能力，低秩更新可能不够
- 需要持续预训练级别的大规模知识注入，LoRA 更像微调工具，不是预训练替代品
- 对 adapter 动态切换要求极高且不能重启模型，需要额外的服务层管理
- 非线性结构要大改的场景，比如新增模态模块、换 attention 结构、改 tokenizer

## 历史小故事（可跳过）

- **2019 年**：Adapter tuning 在 NLP 里流行，把小瓶颈层插进 Transformer，但推理时会多走一段网络。
- **2020 年**：Intrinsic Dimensionality 相关工作提示，语言模型微调真正需要搜索的方向可能远少于参数总数。
- **2021 年 1 月**：Prefix-Tuning 用连续提示向量适配生成任务，但会占用上下文长度，也不总是稳定。
- **2021 年 6 月**：LoRA 上 arXiv，提出"冻结权重 + 低秩更新 + 可合并推理"这组三件套。
- **2023 年**：QLoRA 把 4-bit 量化和 LoRA 结合，让普通显卡微调大模型成为社区常规操作。

LoRA 重要的地方不是数学复杂，而是工程位置刚好：它把"便宜训练"、"多任务存储"和"低延迟部署"同时放进一个简单接口里。

## 学到什么

1. **微调不是必须改全模型**：预训练模型已经学到大量通用特征，下游任务往往只需要放大少数方向。
2. **低秩是参数效率的语言**：用两个窄矩阵表达一个大矩阵的主要改动，相当于把"我要改哪里"压缩成少数轴。
3. **工程胜点在可合并**：LoRA 和传统 adapter 的关键差别，是训练时像外挂，推理时能融入原层。
4. **PEFT 的核心 trade-off**：参数越少越省钱，但表达能力也受限；`r`、作用层、学习率和数据量一起决定最后效果。

## 延伸阅读

- 论文 PDF：[Hu et al. 2021, arXiv:2106.09685](https://arxiv.org/abs/2106.09685)（核心看 §3 方法、§5 实验、§7 低秩分析）
- 上游背景：[Intrinsic Dimensionality Explains the Effectiveness of Language Model Fine-Tuning](https://arxiv.org/abs/2012.13255)（解释为什么微调可能只需要少数方向）
- 对照方法：[Prefix-Tuning: Optimizing Continuous Prompts for Generation](https://arxiv.org/abs/2101.00190)（同属参数高效适配，但占用 prompt 长度）
- 后续技术：[QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314)（把 LoRA 和 4-bit 量化结合）
- [[gpt-3]] —— LoRA 在 175B GPT-3 上展示了极端参数节省
- [[attention]] —— LoRA 常加在 attention 的 `Wq/Wv` 线性矩阵上

## 关联

- [[gpt-3]] —— 论文最震撼的实验对象，175B 模型只训练几百万到几千万参数
- [[attention]] —— LoRA 主要插在 Transformer attention 的投影矩阵上
- [[bert]] —— 早期预训练后微调范式的代表，LoRA 是对"全量微调"成本的回应
- [[roberta-2019]] —— RoBERTa 展示了扎实训练配方，LoRA 关注训练后如何低成本适配
- [[deberta-2021]] —— LoRA 在 DeBERTa XXL 上也能接近全量微调效果
- [[accelerate]] —— 实际训练 LoRA 时常和 HuggingFace/PEFT/Accelerate 工具链一起用
- [[llm-int8-2022]] —— 量化和 LoRA 经常组合，用更少显存完成大模型微调

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

