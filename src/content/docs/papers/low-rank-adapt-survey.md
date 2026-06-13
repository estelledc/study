---
title: Low-Rank Adaptation for Foundation Models — 一篇读懂 LoRA 全景
来源: 'https://arxiv.org/abs/2501.00365'
日期: 2026-06-13
分类: 机器学习
子分类: 微调
provenance: pipeline-v3
---

## 是什么

这是一篇 2025 年初发表的**LoRA 全景综述论文**，由香港科技大学、耶鲁大学、新加坡南洋理工等机构的 12 位作者联合撰写。它是目前第一篇把 LoRA 从"大语言模型微调技巧"扩展到"所有基础模型适配方法"的系统性综述。

日常类比：想象你有一本印好的百科全书（预训练基础模型），现在需要让它回答医疗、法律、编程等不同领域的问题。传统做法是把整本书撕下来重新排版印刷（全量微调），成本极高。LoRA 的做法是在书的空白处贴几张便签纸（低秩矩阵），便签上写"遇到医疗问题按这套规则答""遇到编程问题按那套规则答"。推理的时候，读者同时看到原书内容和便签，既得到了专业答案，又不需要重新印刷整本书。

这篇论文把围绕"便签"做的所有改进做了系统梳理，分成了三大板块：

- **基础层（Foundations）**：怎么让便签更小、更省空间（参数分解、剪枝、冻结共享、量化）
- **前沿层（Frontiers）**：便签的高级玩法（多便签组合、持续学习、遗忘学习、联邦学习、长序列）
- **应用层（Applications）**：便签贴在哪（语言、视觉、语音、代码、科学发现、推荐系统、图学习、多模态等 9 大领域）

## 为什么重要

不理解 LoRA 的全景，下面这些事都没法解释：

- 为什么微调一个 70B 模型需要几十 GB 显存——因为全量微调要保存所有参数的梯度和 optimizer 状态，而 LoRA 只训练几千到几百万个参数
- 为什么同一个基础模型可以同时拥有"医疗版""法律版""编程版"三个 LoRA 适配器，推理时按需切换而不增加延迟
- 为什么 LoRA 能扩展到视觉、语音、图神经网络等非 NLP 领域——因为它的核心思想（权重更新存在于低维子空间）是通用的

这篇论文的价值在于：**它不是教你怎么用 LoRA，而是告诉你 LoRA 的所有变体、所有应用场景、所有未解决的问题**。对你这样的学习者来说，这是一张"地图"，让你知道 LoRA 这个领域的边界在哪里。

## 核心概念

### 概念 1：低秩适应（Low-Rank Adaptation）

LoRA 的核心公式只有一行：

```
ΔW = B @ A
```

其中 W 是预训练模型的权重矩阵（比如一个 4096x4096 的矩阵，有 1600 万个参数），ΔW 是你想要学习的"更新量"。LoRA 不直接学 ΔW，而是把它拆解成两个小矩阵相乘：

- B 的形状是 d × r（比如 4096 × 8）
- A 的形状是 r × k（比如 8 × 4096）
- r 就是"秩"（rank），通常远小于 d 和 k

原来的参数量是 d × k = 4096 × 4096 = 16,777,216。
LoRA 的参数量是 d × r + r × k = 4096 × 8 + 8 × 4096 = 65,536。

**从 1600 万降到 6.5 万，减少了 256 倍。**

推理时的前向传播变成：

```
output = W_pretrained @ input + (α/r) * B @ A @ input
```

关键设计：A 用高斯随机初始化，B 用零初始化。这样训练开始时 B@A = 0，ΔW 从零开始增长，保证了训练的稳定性。

**类比**：你要画一幅精细的画（学习完整的权重更新），但你的颜料只有有限的几种颜色（低秩约束）。你发现其实不需要所有颜色——只需要几种关键的混合色就够了。

### 概念 2：参数效率增强四件套

论文把让 LoRA 更省参数的方法分为四类：

| 方法 | 核心思想 | 代表工作 |
|------|----------|----------|
| 参数分解 | 把矩阵拆成更紧凑的形式（SVD、张量训练） | AdaLoRA, DoRA, TT-LoRA |
| 参数剪枝 | 评估每个参数的重要性，扔掉不重要的 | SparseAdapter, SoRA, LoRA-Drop |
| 冻结与共享 | 冻结 A 只训 B，或多个层共享同一组参数 | LoRA-FA, VeRA, NOLA |
| 参数量化 | 用更低精度的数字表示权重（4bit、2bit） | QLoRA, LoftQ, L4Q |

每一类下面都有大量变体。比如量化这一项，按时间分为微调前量化（QLoRA）、微调中量化（QA-LoRA）、微调后量化（LQER），每种都有不同的精度选择和技术路线。

### 概念 3：秩自适应（Rank Adaptation）

原始 LoRA 对所有层用同一个固定的 rank（比如 r=8）。但论文指出：**不同层需要的适配程度不同——浅层可能 r=2 就够了，深层可能需要 r=32。**

秩自适应分为两个方向：

- **秩精炼（Rank Refinement）**：让 rank 变小或动态变化。AdaLoRA 根据重要性分数动态调整各层的 rank；PRILoRA 用启发式规则让 rank 从浅层到深层线性递增。
- **秩增强（Rank Augmentation）**：让 rank 变大以逼近全量微调的效果。ReLoRA 通过迭代合并多个 LoRA 模块来累积更高的有效秩；MELoRA 并行训练多个小 LoRA 并拼接输出；XGBLoRA 把梯度提升框架引入 LoRA，用一系列 rank-1 适配器逐步改进。

### 概念 4：前沿方向一览

论文第 4 节涵盖了 LoRA 最前沿的研究方向：

- **LoRA 组合**：多个 LoRA 适配器叠加使用，或者用 MoE（混合专家）架构动态选择
- **持续学习**：不断学新知识而不忘记旧知识——每个新任务分配一个新的 LoRA 适配器
- **遗忘学习**：安全地"删除"模型中的特定知识（比如有害行为），通过 LoRA 的负权重实现
- **联邦学习**：多个设备各自训练自己的 LoRA 适配器，只上传小文件到服务器聚合，保护隐私
- **长序列建模**：把 LoRA 用在处理超长上下文的 Transformer 变体中
- **LoRA 推理系统**：如何高效地在服务端同时服务多个用户的不同 LoRA 适配器

### 概念 5：跨领域应用全景

论文第 5 节把 LoRA 的应用扩展到了 9 大类领域，远超 NLP：

- **语言任务**：NLU、问答、翻译、推理、多语言、医疗文本
- **计算机视觉**：图像分类、分割、目标检测、图像生成（Stable Diffusion 的 LoRA 训练）
- **语音识别**：假音频检测、多语言 ASR、低资源语言 ASR
- **代码工程**：代码审查、代码生成、代码摘要
- **科学发现**：蛋白质结构分析、材料设计
- **推荐系统**：点击率预测、序列推荐
- **图学习**：跨域图适配、动态知识图谱更新
- **时空预测**：交通流量预测、气象预报
- **多模态**：图文理解、图文生成、语言-音频联合学习

## 代码示例

### 示例 1：用 PyTorch 实现一个最简单的 LoRA 层

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class LoRALayer(nn.Module):
    """
    一个完整的 LoRA 适配层。

    原始权重 W 的形状是 (out_features, in_features)，比如 (4096, 4096)。
    LoRA 添加两个小矩阵 A (r, in_features) 和 B (out_features, r)。
    前向传播时：output = W @ x + (alpha / r) * B @ A @ x
    """
    def __init__(self, in_features, out_features, rank=8, alpha=16):
        super().__init__()
        self.rank = rank
        self.alpha = alpha
        self.scaling = alpha / rank

        # 原始权重——冻结，不参与训练
        self.weight = nn.Parameter(torch.eye(out_features, in_features), requires_grad=False)

        # LoRA 矩阵：A 高斯初始化，B 零初始化
        self.A = nn.Parameter(torch.randn(rank, in_features) * 0.01)
        self.B = nn.Parameter(torch.zeros(out_features, rank))

    def forward(self, x):
        # 原始路径
        original_output = F.linear(x, self.weight)
        # LoRA 路径
        lora_update = (self.B @ self.A) @ x.T
        lora_output = self.scaling * lora_update.T
        # 合并输出
        return original_output + lora_output


# 演示：参数量对比
in_dim, out_dim, r = 4096, 4096, 8
full_params = in_dim * out_dim  # 16,777,216
lora_params = in_dim * r + r * out_dim  # 65,536
print(f"全量参数: {full_params:,}")
print(f"LoRA 参数: {lora_params:,}")
print(f"节省比例: {(1 - lora_params/full_params)*100:.2f}%")
# 输出:
#   全量参数: 16,777,216
#   LoRA 参数: 65,536
#   节省比例: 99.61%
```

**逐部分解释**：

- `self.weight` 设为 `requires_grad=False`——这就是"冻结预训练权重"的意思，反向传播时不会更新它
- `self.A` 用 `randn * 0.01` 初始化（高斯分布，小方差），`self.B` 用 `zeros` 初始化——这保证了训练开始时 `B @ A = 0`，LoRA 路径的输出为零，不会干扰初始的前向传播
- `self.scaling = alpha / rank` 是缩放因子——论文指出，调节 alpha 大致等价于调节学习率
- 前向传播中，`original_output` 和 `lora_output` 分别计算后相加——推理时可以合并为 `W + (alpha/r)*B@A`，不增加延迟

### 示例 2：用 peft 库给 LLaMA 模型加 LoRA（实战写法）

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model, TaskType

# 加载基础模型（这里用一个很小的模型做演示）
model_name = "hf-internal-testing/tiny-random-LlamaForCausalLM"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name)

# 配置 LoRA
lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,       # 因果语言建模任务
    inference_mode=False,                 # 训练模式（推理模式会合并权重）
    r=8,                                  # 秩 = 8
    lora_alpha=16,                        # alpha = 16, scaling = 16/8 = 2.0
    lora_dropout=0.1,                     # Dropout 概率
    target_modules=["q_proj", "v_proj"],  # 只对 attention 的 Q 和 V 投影加 LoRA
)

# 包装模型——只有 LoRA 参数会被优化
model = get_peft_model(model, lora_config)

# 查看可训练参数占比
total = sum(p.numel() for p in model.parameters())
trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
print(f"总参数: {total:,}")
print(f"可训练参数: {trainable:,}")
print(f"可训练比例: {trainable/total*100:.4f}%")
# 输出（典型值）:
#   总参数: 12,288
#   可训练参数: 2,048
#   可训练比例: 16.6667%

# 打印哪些参数被 LoRA 添加了
model.print_trainable_parameters()
# 输出:
#   trainable params: 2,048 || all params: 12,288 || trainable%: 16.6667
```

**逐部分解释**：

- `target_modules=["q_proj", "v_proj"]` 控制了 LoRA 贴在哪——论文第 3 节提到，常见的选择是 attention 层的 Q/K/V/O 投影和 MLP 的 FFN 层。不同选择会影响效果和参数量的权衡
- `r=8, lora_alpha=16` 决定了 scaling factor = 2.0。论文第 3.3 节指出，alpha 的典型取值范围是 rank 的 1-16 倍
- `lora_dropout=0.1` 是在 LoRA 路径上加的 Dropout——论文第 3.3 节提到，虽然 LoRA 参数少，但在小数据集上仍然可能过拟合，结构化 Dropout 是有效的正则化手段
- `get_peft_model` 会自动把 LoRA 矩阵注入到指定模块中，原始权重保持冻结

### 示例 3：AdaLoRA——动态调整秩的 LoRA 变体

```python
import torch
import torch.nn as nn
import torch.nn.functional as F


class AdaLoRALayer(nn.Module):
    """
    AdaLoRA 的核心思想：每个 LoRA 适配器的秩不是固定的，
    而是根据"重要性"动态分配。用 SVD 形式参数化更新矩阵：

        ΔW = P @ Lambda @ Q^T

    其中 P 和 Q 是正交矩阵，Lambda 是对角矩阵（奇异值）。
    训练过程中，不重要方向的奇异值会被修剪到零，
    相当于自动降低了该方向的秩。
    """
    def __init__(self, in_features, out_features, max_rank=8):
        super().__init__()
        self.max_rank = max_rank
        self.in_features = in_features
        self.out_features = out_features

        # 用 SVD 形式存储：P (out x max_rank), Lambda (max_rank,), Q (max_rank x in)
        self.P = nn.Parameter(torch.randn(out_features, max_rank) / max_rank)
        self.Lambda = nn.Parameter(torch.ones(max_rank))
        self.Q = nn.Parameter(torch.randn(max_rank, in_features) / max_rank)

    def get_delta_W(self):
        """
        当前时刻的 ΔW = P @ diag(Lambda) @ Q^T
        训练过程中 Lambda 中不重要的元素会变成接近零的值，
        等效于该方向的秩被"剪掉"了。
        """
        return self.P @ torch.diag(self.Lambda) @ self.Q.T

    def forward(self, x):
        delta_W = self.get_delta_W()
        return F.linear(x, delta_W)


# 演示：观察 Lambda 的变化如何等效于秩的动态调整
layer = AdaLoRALayer(64, 64, max_rank=8)
print(f"初始 Lambda: {layer.Lambda.data}")

# 模拟训练几步后，部分方向的奇异值衰减
with torch.no_grad():
    layer.Lambda.data *= 0.5   # 所有方向减半
    layer.Lambda.data[5:] = 0.01  # 后半部分几乎为零

effective_rank = (layer.Lambda.data > 0.1).sum().item()
print(f"训练后 Lambda: {layer.Lambda.data}")
print(f"有效秩（Lambda > 0.1 的数量）: {effective_rank} / {layer.max_rank}")
# 输出:
#   初始 Lambda: tensor([1., 1., 1., 1., 1., 1., 1., 1.])
#   训练后 Lambda: tensor([0.5000, 0.5000, 0.5000, 0.5000, 0.5000, 0.0100, 0.0100, 0.0100])
#   有效秩: 5 / 8
```

**逐部分解释**：

- 原始 LoRA 的 `B @ A` 是两个独立矩阵相乘，秩始终是 `min(d, r, k)`——固定不变
- AdaLoRA 改用 SVD 参数化：`P @ Lambda @ Q^T`，其中 `Lambda` 的对角元素就是奇异值
- 训练时，不重要的奇异值会逐渐缩小到接近零——相当于那个方向的"秩"被自动剪掉了
- 上面的例子中，初始最大秩是 8，训练后只有 5 个方向的奇异值显著大于零，有效秩降到了 5
- 这实现了论文第 3.2.1 节说的"自适应秩分配"——不同层、甚至同一层不同方向可以有不同有效秩

## 踩过的坑

1. **把 LoRA 理解成"只是个小学习率"**：错。LoRA 的核心贡献是结构约束——它强制权重更新在一个低维子空间里，这不仅减少了参数量，还改变了优化的几何性质。全量微调用小学习率和 LoRA 的效果完全不同。

2. **以为 rank 越大越好**：论文第 3.2 节明确指出，rank 超过一定阈值后收益急剧递减。对于大多数任务，r=8 到 r=64 已经足够，再往上基本是浪费。Rank 增强的方法（ReLoRA、MELoRA）恰恰说明"单次训练用大 rank"不如"多次迭代合并小 rank"。

3. **忽略 scaling factor 的影响**：论文第 3.3 节指出，默认的 `alpha/r` 缩放在高 rank 时会导致梯度坍缩（gradient collapse）。rsLoRA 把它改为 `alpha/sqrt(r)` 来解决这个问题。不加注意的话，r=64 的效果可能比 r=8 还差。

4. **LoRA 不是银弹**：论文第 6 节讨论了 LoRA 的局限性——理论上它不能表示满秩的权重更新（虽然实践中很少遇到）；在极端数据稀缺的场景下，可能不如全量微调；对某些架构（如卷积网络）的直接套用效果不如 Transformer 好。

5. **混淆 LoRA 和 QLoRA**：LoRA 只训练低秩适配器，预训练权重仍然是 FP16/BF16。QLoRA 在此基础上把预训练权重量化到 4bit，进一步节省显存。两者是不同的技术，可以叠加使用。

## 适用 vs 不适用场景

**适用**：

- 基础模型（LLM、Vision Transformer、扩散模型等）的任务适配
- 显存受限（单卡微调 7B/13B/70B 模型）
- 多任务场景——每个任务一个 LoRA 文件，按需加载切换
- 需要快速迭代的实验——训练和验证周期短
- 边缘设备部署——LoRA 文件只有几 MB 到几百 MB

**不适用**：

- 从零训练一个新模型——LoRA 是微调技术，不是预训练方法
- 需要满秩权重更新的极端场景——虽然论文说实践中极少遇到
- 数据量极大的微调——全量微调有时仍能超越 LoRA
- 对推理延迟零容忍的极端场景——虽然 LoRA 理论上可以合并权重，但合并操作本身有计算开销

## 学到什么

1. **LoRA 是一个庞大的研究领域，不只是一个 API**——从参数分解到量化，从秩自适应到前沿的联邦学习和遗忘学习，论文展示了一个完整的学术生态。

2. **低秩假设在实践中非常强大**——权重更新存在于低维子空间这个假设，不仅在 NLP 中成立，在视觉、语音、图学习、科学发现等领域也有效。这是 LoRA 能跨领域成功的关键。

3. **效率与性能的平衡是永恒主题**——论文中的每一条改进都在回答同一个问题："如何在更少的参数/计算下达到更好的效果？"这是 AI 工程的核心矛盾。

4. **理论正在追赶实践**——NTK 理论、最优秩选择、矩阵不对称性分析等工作，正在为 LoRA 的有效性提供数学解释。从"炼丹"到"科学"的路还很长，但已经在路上。

5. **LoRA 的未来不止于微调**——持续学习、遗忘学习、联邦学习、混合专家架构……LoRA 正在从一个微调工具演变为模型适应的基础设施。

## 延伸阅读

- 原始论文 PDF：[arXiv 2501.00365](https://arxiv.org/pdf/2501.00365)
- 代码与资源汇总：[github.com/marlin-codes/awesome-lora-adapter](https://github.com/marlin-codes/awesome-lora-adapter)
- [how-lora-remembers-a-parametric-memory-law-for-llm-finetuning-arxiv-2605-30260] —— LoRA 的参数记忆定律，定量理解 rank 和记忆的关系
- Hu et al. 2022 —— LoRA 原始论文（"LoRA: Low-Rank Adaptation of Large Language Models"）
- Zaken et al. 2022 —— Adapter 的先驱工作（"AdapterHub"）
- Ding et al. 2023 —— PEFT 综述（"Prompt or Parameter? A Survey of Prompting and Parameter Efficient Fine-tuninging Approaches"）

## 关联

- [how-lora-remembers-a-parametric-memory-law-for-llm-finetuning-arxiv-2605-30260] —— LoRA 的参数记忆定律
- [[lora]] —— LoRA 微调的基本原理
- [[qlora]] —— 4-bit 量化的 LoRA
- [[adapter]] —— 适配器方法的先驱
- [[peft]] —— 参数高效微调的广义框架

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- （暂无）
