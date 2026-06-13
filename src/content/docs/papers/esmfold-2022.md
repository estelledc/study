---
title: "Evolutionary-Scale Prediction of Atomic-Level Protein Structure with a Language Model"
来源: https://www.science.org/doi/10.1126/science.ade2574
日期: 2026-06-13
分类: 机器学习
子分类: 生物信息
provenance: pipeline-v3
---

# ESMFold：用语言模型预测蛋白质结构

## 背景：蛋白质折叠问题

想象一下：你有一串项链，由 20 种不同颜色的珠子组成。这串项链有多长，取决于你有多少颗珠子——从几十颗到几千颗不等。现在，把这串项链随意扔在桌上，它自己会卷成一个特定的形状。这个"从珠子序列自动卷成特定形状"的过程，就是**蛋白质折叠**。

在生物体内，蛋白质的**功能取决于它的形状**。就像钥匙的形状决定它能开哪把锁一样，蛋白质的三维结构决定它能做什么。如果能从"珠子序列"直接预测出"最终形状"，就等于掌握了理解生命的一把钥匙。

2020 年，DeepMind 的 AlphaFold2 震惊了世界。它主要依赖**多重序列比对（MSA）**——也就是把同一类蛋白质的"亲戚序列"找出来，对比它们的差异，从而推断哪些位置"必须一起变化"（因为结构要保持稳定）。但这有个问题：找"亲戚序列"非常耗时，预测一个蛋白质可能需要几个小时。

ESMFold 的做法完全不同。它把蛋白质序列当成一门"语言"，用一个**蛋白质语言模型**直接预测结构，不需要找"亲戚"。

## 核心概念 1：蛋白质语言模型

### 类比：学语言的两种方式

学一门新语言，你有两种方法：

1. **对比学习**：同时读 100 个不同国家的同一篇文章的翻译，对比它们的差异来推断语法。这就像 AlphaFold2 用的 MSA 方法。
2. **海量阅读**：直接读 100 亿句话，读得够多之后，自然就能猜出下一个词是什么，也理解了语言的"结构"。ESMFold 用的就是这种方法。

ESMFold 基于 **ESM-2** 模型，这是一个用 Transformer 架构训练的蛋白质语言模型。训练方式是"填空格"——把一段蛋白质序列中的某些氨基酸"遮住"，让模型猜被遮住的是什么。

```python
# 类比：给语言模型"填空格"
# 假设蛋白质序列是: A-R-G-I-N-I-N
# 遮住后变成:          A-?-G-?-?-?-N
# 模型的任务是猜出每个"?"处应该填什么氨基酸

sequence = "ARGININ"
masked_sequence = "A?G???"
# 训练时，模型会看到大量这样的"填空题"
# 经过在 2.8 亿条蛋白质序列上的训练
# 模型学会了氨基酸之间的"搭配规则"
```

ESM-2 有从 8000 万到 150 亿参数的多个版本。论文发现，当模型规模达到 **150 亿参数**时，模型内部表示中会"自然涌现"出蛋白质的结构信息——就像一个人学语言学得足够深之后，不仅会说话，还理解了语法和逻辑。

## 核心概念 2：从语言表示到 3D 结构

### 类比：从"文字描述"画出"三维模型"

ESM-2 模型理解蛋白质序列后，输出的不是结构坐标，而是一系列**注意力图**——显示哪些位置的氨基酸"彼此关注"。这些注意力模式隐含了哪些氨基酸在空间中距离很近的信息。

ESMFold 在这之上加了一个 **Structure Module**，它做的事情就像从文字描述构建 3D 模型：

1. **输入**：ESM-2 对每条序列产生的"理解"（嵌入表示）
2. **处理**：通过一个迭代 refinment 的神经网络，逐步调整每个原子的位置
3. **输出**：每个原子的 3D 坐标（x, y, z），生成 .pdb 文件

```python
# 使用 ESMFold 预测蛋白质结构的基本流程
import esm

# 1. 加载预训练模型（以 ESMFold 为例）
model = esm.pretrained.esmfold_v1()
model.eval()

# 2. 输入蛋白质序列（用单字母氨基酸代码）
# 例如：肌红蛋白（Myoglobin）的前 20 个氨基酸
sequence = "MVLSEGEWQLVLNVWGA"

# 3. 直接预测结构（不需要 MSA！）
prediction = model.infer_pdb(sequence)

# 4. 结果保存为 PDB 文件（蛋白质 3D 坐标的标准格式）
with open("myoglobin.pdb", "w") as f:
    f.write(prediction)

# 运行时间：约 3 秒（对比 AlphaFold2 需要数小时）
```

## 核心概念 3：为什么这么快？

AlphaFold2 的慢在于第一步：为每条序列做 MSA 搜索。它需要在庞大的数据库（如 UniRef）中查找相似序列，这就像你要写一篇文章，需要先读遍全图书馆找参考资料。

ESMFold 不需要这步。它就像读过全图书馆的人，看到序列后直接凭"记忆"写出结论。

```python
# 速度对比示意
import time

def alphafold2_predict(sequence, database):
    """AlphaFold2：需要先搜索数据库找相似序列"""
    start = time.time()
    msa = search_sequence_against_database(sequence, database)  # 耗时步骤
    structure = alphafold2(msa)
    elapsed = time.time() - start
    return structure, elapsed

def esmfold_predict(sequence, model):
    """ESMFold：直接前向传播"""
    start = time.time()
    embeddings = model.encode(sequence)   # 模型内部"理解"序列
    structure = model.decode(embeddings)  # 从嵌入中"翻译"出结构
    elapsed = time.time() - start
    return structure, elapsed

# 实际测试（论文中的数据）：
# AlphaFold2: ~3 hours per protein
# ESMFold:    ~3 seconds per protein
# 加速比: ~3600 倍
```

## 核心概念 4：ESM 大科学项目——结构即涌现

ESMFold 论文最震撼的发现不是"它更快"，而是 **"随着模型变大，结构信息自然涌现"**。

作者训练了从 8000 万到 1500 亿参数的 ESM 模型。他们发现：

| 模型大小 | 参数量 | 是否有结构信息 |
|---------|--------|--------------|
| ESM-1v | 8,000 万 | 很弱 |
| ESM-2 (650M) | 6.5 亿 | 有 |
| ESM-2 (3B) | 30 亿 | 强 |
| ESM-2 (15B) | 150 亿 | 很强 |

这意味着：**你不需要教模型"结构是什么"**，只要给它足够多的蛋白质序列数据、足够大的模型，它自己就学会了空间的折叠规则。这类似于：你不需要教孩子"物理定律"，他通过观察世界自然就懂了重力。

## 核心概念 5：ESM 结构图谱

基于 ESMFold 的速度优势，作者预测了 **超过 6.17 亿条** 来自自然界（土壤、海洋等环境样本）的蛋白质序列的结构，其中超过 **2.25 亿条** 预测置信度高。这被称为 **ESM 结构图谱（ESM Structure Atlas）**。

作为对比，人类用实验方法（X 射线晶体学、冷冻电镜）花了 50 年，才积累了约 20 万条蛋白质结构。ESMFold 在几个月内就生成了 6 亿多条。

```python
# 评估预测质量：用 pLDDT 置信度评分
# pLDDT（predicted Local Distance Difference Test）类似 AlphaFold 的置信度分数
# 范围 0-100，分数越高表示预测越可信

# pLDDT 评分解读：
# 90-100: 极高置信度，原子级准确
# 70-90:  良好，主链可靠
# 50-70:  中等，侧链可能有偏差
# < 50:   低置信度，可能无序

# 在 CAMEO（蛋白质结构预测持续评估）基准测试中：
# ESMFold 在 87.8% 的测试蛋白上达到与 AlphaFold2 相当的准确度
# 同时快 3600 倍
```

## 核心概念 6：训练与架构细节

ESMFold 的完整架构由两部分组成：

```
ESM-2 (语言模型) → Structure Module (结构解码器)
       ↓                    ↓
  理解氨基酸序列        输出 3D 原子坐标
```

**ESM-2 部分**：
- 基于 Transformer 架构（与 GPT 类似）
- 使用 **RoPE（旋转位置编码）** 而不是传统的位置编码
- 在 2.8 亿条蛋白质序列上训练
- 训练目标：掩码预测（Masked Language Modeling）

**Structure Module 部分**：
- 借鉴 AlphaFold2 的设计，但做了简化
- 使用 **SE(3)-Transformer**，保证输出满足旋转和平移不变性
- 迭代 refinment 24 次，逐步优化结构

```python
# ESMFold 训练过程示意
# 第一步：训练 ESM-2 语言模型
# 模型学会从序列中"理解"蛋白质的"语法"

language_model = ESM2.from_pretrained("esm2_t33_650M_UR50D")

# 第二步：用已知结构数据微调 Structure Module
# 从 PDB（Protein Data Bank，已知的蛋白质结构数据库）中取约 4900 条
# 这些数据有实验测得的 3D 坐标

known_structures = load_pdb_database("pdb_2021")
structure_module = StructureModule()

# 训练：输入序列，让模型输出坐标，和真实坐标对比
for sequence, true_coords in known_structures:
    embeddings = language_model(sequence)
    predicted_coords = structure_module(embeddings)
    loss = compare(predicted_coords, true_coords)  # 计算误差
    structure_module.update_gradients(loss)

# 注意：ESM-2 本身在第二步是冻结的（不更新）
# 只有 Structure Module 在学习
```

## 学习要点总结

1. **蛋白质 = 氨基酸序列**，序列决定形状，形状决定功能
2. **AlphaFold2** 找"亲戚序列"来辅助预测，但很慢
3. **ESMFold** 把蛋白质当"语言"，用大规模语言模型直接预测，快 3600 倍
4. **规模涌现**：模型越大，越能自发理解"结构"，无需明确教
5. **ESM 结构图谱**：预测了 6.17 亿条蛋白质结构，是实验数据量的 30 倍
6. 核心架构 = ESM-2 语言编码 + SE(3)-Transformer 结构解码

## 进一步思考的问题

- ESMFold 的预测准确度虽然接近 AlphaFold2，但在 MSA 信息丰富的情况下（如家族蛋白），AlphaFold2 仍然更准。这说明"找亲戚"的信息和"大规模预训练"的信息各有价值。
- 6.17 亿条结构中，很多属于自然界从未被观察过的蛋白质。这意味着我们对"蛋白质能长什么样"的认知还极其有限。
