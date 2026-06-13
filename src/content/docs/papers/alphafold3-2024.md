---
title: AlphaFold 3 学习笔记 —— 生物分子相互作用的高精度结构预测
来源: https://www.nature.com/articles/s41586-024-07487-w
日期: 2026-06-13
分类: 其他
子分类: ml
provenance: pipeline-v3
---

# AlphaFold 3 学习笔记

## 一、引言：AlphaFold 解决了什么问题？

在 AlphaFold 出现之前，**蛋白质折叠问题**是生物学五十年来的最大难题之一。蛋白质的功能完全取决于它的三维形状（3D 结构），但实验手段（X 射线晶体学、冷冻电镜）解析一个结构往往需要数月到数年的时间，而且有些蛋白质根本难以结晶。

AlphaFold 2（2021 年，发表于 Nature）首次用深度学习实现了近乎实验级的蛋白质单体结构预测，被誉为"半个世纪生物学难题的解决"。

AlphaFold 3（2024 年 5 月，发表于 Nature）则把这个问题推到了新高度：**不再是只预测蛋白质，而是预测整个生物分子复合物**——蛋白质、DNA、RNA、小分子药物、离子、修饰碱基……全部在一个模型里。

---

## 二、核心概念（从日常类比开始）

### 2.1 什么是 "分子复合物"？

想象一个拼图。以前的 AlphaFold 2 只能猜**单个拼图片**（蛋白质）的形状。AlphaFold 3 可以猜**多块拼图拼在一起**（蛋白质 + DNA + 药物分子）的样子。

### 2.2 Diffusion（扩散模型）—— AF3 的核心架构变化

AF2 使用 "结构模块"（Structure Module）直接预测原子坐标。
AF3 改用 **Diffusion（扩散）模块**——灵感来自 AI 图像生成模型（如 Stable Diffusion）。

**类比：橡皮泥**

- 给定一团有噪音的、扭曲的橡皮泥，让它逐渐变回正确形状
- 训练时：把真实结构一点点"加噪"（变得模糊混乱），然后让模型学会"去噪"还原
- 推理时：从一团完全随机的噪音开始，让模型一步步去噪，最终输出结构

这个设计的妙处在于：
1. **通用性**：不需要为蛋白质、DNA、小分子分别设计不同模块
2. **多样性**：生成的是分布而非单一答案，能捕捉生物分子本身的"柔性"

### 2.3 Pairformer（替代 Evoformer）

AF2 的核心是 **Evoformer**，它同时处理序列信息（Multiple Sequence Alignment, MSA）和成对信息。
AF3 把 Evoformer 简化为 **Pairformer**：
- 只处理"成对表示"（pair representation）和"单 token 表示"（single representation）
- 不再保留 MSA 表示
- 结构更简洁，计算效率更高

**类比**：Evoformer 像一个同时读原文和注释的翻译官；Pairformer 像一个只看原文、但已经见过足够多类似文本的翻译官。

### 2.4 pLDDT 与 PAE —— 模型的"自信心"评分

AF3 和 AF2 一样，会给预测结果打分：

- **pLDDT**（predicted Local Distance Difference Test）：每个原子的置信度，0-100 分。越高越可信
- **PAE**（Predicted Aligned Error）：成对残基之间的误差估计，用矩阵表示。对角线附近深色表示模型对链内关系很自信

---

## 三、AF3 的架构详解

### 3.1 整体流程

```
输入（序列 + SMILES + 修饰信息）
       │
       ▼
  Input Embedding（将序列、配体等信息编码为初始表示）
       │
       ▼
  Pairformer（48 层，处理成对表示 + 单 token 表示）
       │
       ▼  ┌──────────────────┐
  单 token 表示  │              │
       └──► │  Diffusion  │
  成对表示 ──┘    Module    │
                          │
                          ▼
                    输出：所有原子坐标 + 置信度评分
```

### 3.2 Diffusion 模块的工作原理

```
步骤 1: 从标准正态分布采样噪声坐标 x_T
步骤 2: 模型接收 (x_t, 时间步 t, 单 token 表示, 成对表示)
步骤 3: 模型预测噪声方向
步骤 4: 根据预测逐步去噪：x_t → x_{t-1}
步骤 5: 重复步骤 2-4，直到 t = 0，得到最终结构
```

---

## 四、代码示例

### 示例 1：用 AlphaFold 3 预测蛋白质-配体复合物结构

以下是一个概念性示例，展示 AF3 的输入输出格式：

```python
# === AlphaFold 3 预测：蛋白质 + 小分子配体的复合物结构 ===

# 1. 准备输入
protein_sequence = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQAPILSRV..."  # 蛋白质氨基酸序列（FASTA 格式）

ligand_smiles = "CC1=CC2=C(C=C1C(=O)N2C)C"  # 小分子配体的 SMILES 字符串（OpenEye 工具包可解析）

# 2. 构建输入字典（概念性伪代码，非真实 API）
input_data = {
    "sequences": {
        "protein": [protein_sequence],
        "ligands": [ligand_smiles]
    },
    "model_seed": 42,          # 随机种子（控制扩散过程的随机性）
    "num_diffusion_samples": 5, # 每个 seed 生成 5 个候选结构
    "max_msa_clusters": 128,    # MSA 聚类上限
}

# 3. 运行预测
predictions = alphafold3.predict(input_data)

# 4. 输出结果
for i, pred in enumerate(predictions):
    # 每个预测包含：
    confidence = pred.confidence  # 置信度字典
    print(f"pLDDT (overall): {confidence['overall_plddt']:.1f}")
    print(f"pAE (chain pair): {confidence['pae_matrix'].shape}")

    # 输出原子坐标（PDB 格式）
    coordinates = pred.coordinates  # 形状: (num_atoms, 3)
    atomic_types = pred.atomic_types  # 原子类型列表

    # 保存为 PDB 文件供 PyMOL / Chimera 可视化
    pred.to_pdb(f"prediction_sample_{i}.pdb")

    # 评估：与实验结构的差距（RMSD）
    # 如果已知实验结构 ground_truth.pdb：
    # rmsd = compute_rmsd(coordinates, ground_truth_coordinates)
    # print(f"RMSD vs experiment: {rmsd:.2f} Angstroms")
```

### 示例 2：解析置信度评分，筛选高质量预测

```python
# === 从 AF3 输出中筛选高置信度的预测 ===

# 假设 predictions 是从上面的 predict() 得到的结果列表
# 每个 prediction 对应一个扩散样本 + 一个 seed 的组合

def evaluate_and_rank(predictions):
    """对预测结果打分、排序，选出最可信的那个"""
    scored = []
    for pred in predictions:
        c = pred.confidence

        # 综合评分：成 pLDDT 越高越好，pAE 越低越好
        avg_plddt = c["overall_plddt"]
        avg_pae = c["pae_mean"]  # 所有残基对的平均预测误差

        # 自定义 ranking 分数
        score = avg_plddt - avg_pae * 10  # pAE 的权重更高

        scored.append({
            "score": score,
            "plddt": avg_plddt,
            "pae": avg_pae,
            "prediction": pred
        })

    # 按分数排序
    scored.sort(key=lambda x: x["score"], reverse=True)

    # 取最佳预测
    best = scored[0]
    print(f"最佳预测 — 综合分数: {best['score']:.2f}")
    print(f"  pLDDT:  {best['plddt']:.1f}")
    print(f"  pAE:    {best['pae']:.2f}")

    # 检查每个链的置信度分布
    for chain_id, chain_plddt in best["prediction"].per_chain_plddt.items():
        print(f"  链 {chain_id}: pLDDT = {chain_plddt:.1f}")

    return best["prediction"]

best_prediction = evaluate_and_rank(predictions)
best_prediction.to_pdb("final_prediction.pdb")
```

### 示例 3：PAE 矩阵可视化（理解置信度）

```python
# === 可视化 PAE 矩阵，分析模型对哪些相互作用最自信 ===

import matplotlib.pyplot as plt
import numpy as np

def plot_pae(pae_matrix, chain_boundaries, chain_names):
    """
    绘制 PAE 矩阵热力图，用链颜色标注行/列
    pae_matrix:   (n_residues, n_residues) 的误差矩阵
    chain_boundaries: [(chain_name, start, end), ...]
    """
    fig, ax = plt.subplots(figsize=(8, 8))

    # 绘制热力图（深色 = 低误差 = 高置信度）
    im = ax.imshow(pae_matrix, cmap="viridis", vmin=0, vmax=30)
    plt.colorbar(im, label="Predicted Aligned Error (Å)")

    # 用不同颜色标注各条链的边界
    colors = ["blue", "red", "green", "orange", "purple"]
    for i, (name, start, end) in enumerate(chain_boundaries):
        # 行方向的分隔线
        ax.axhline(start - 0.5, color=colors[i % len(colors)], linewidth=1.5)
        # 列方向的分隔线
        ax.axvline(start - 0.5, color=colors[i % len(colors)], linewidth=1.5)

    ax.set_xlabel("Residue index")
    ax.set_ylabel("Residue index")
    ax.set_title("PAE Matrix — Darker = More Confident")

    # 链标签
    for i, (name, start, end) in enumerate(chain_boundaries):
        mid = (start + end) // 2
        ax.text(mid, -1, name, ha="center", color=colors[i % len(colors)])
        ax.text(-1, mid, name, ha="right", va="center",
                rotation=90, color=colors[i % len(colors)])

    plt.tight_layout()
    plt.savefig("pae_matrix.png", dpi=150)

# 使用示例：
# pae_matrix = best_prediction.confidence["pae_matrix"]  # numpy array
# chain_boundaries = [("protein_A", 0, 350), ("ligand_L", 350, 360)]
# plot_pae(pae_matrix, chain_boundaries, ["A", "L"])
```

---

## 五、AF3 相比 AF2 的关键改进

| 维度 | AlphaFold 2 | AlphaFold 3 |
|------|-------------|-------------|
| 预测对象 | 蛋白质单体 / 蛋白质复合物 | 蛋白质 + 核酸 + 小分子 + 离子 + 修饰 |
| 核心架构 | Evoformer + Structure Module | Pairformer + Diffusion Module |
| 坐标表示 | 氨基酸特定的框架 + 二面角 | 原始原子坐标（去噪生成） |
| 生成方式 | 确定性输出 | 生成式（可产生分布） |
| 化学合理性 | 需特殊惩罚项约束 | 扩散过程自然保持 |
| MSA 处理 | 大量 MSA 嵌入块 | 大幅简化，弱化 MSA 依赖 |
| 训练数据 | PDB 中的蛋白质结构 | PDB 中几乎所有分子类型 |

---

## 六、性能亮点

### 6.1 蛋白质-配体相互作用

在 PoseBusters 基准测试上（Pocket-aligned RMSD < 2 Å）：
- AF3 大幅超越传统分子对接工具（如 AutoDock Vina）
- 关键：AF3 **不需要**实验结构作为输入，是真正的"盲对接"

### 6.2 蛋白质-核酸复合物

- 准确率超过专门的核酸预测工具 RoseTTAFold2NA
- 可处理数千个残基的大型复合物（如核糖体）

### 6.3 抗体-抗原复合物

- 使用 1,000 个 seed 采样，准确率远超 AlphaFold-Multimer v2.3
- 这对药物研发意义重大（抗体药物设计）

### 6.4 共价修饰

- 能准确预测糖基化、磷酸化等共价修饰对结构的影响
- 支持蛋白质、DNA、RNA 上的任何残基修饰

---

## 七、模型的局限性

AF3 论文也坦诚列出了四个主要局限：

1. **手性违反（Chirality Violation）**
   约 4.4% 的预测出现手性原子错误（如把左旋氨基酸预测为右旋）。模型在推理时会用多 seed 采样来缓解。

2. **原子冲突（Clashing）**
   少数情况下，对称链会出现重叠（如同源多聚体）。排名阶段引入 clash penalty 可以减少但不能完全消除。

3. **幻觉（Hallucination）**
   生成式模型容易在无序区域"编造"结构。AF3 通过**交叉蒸馏**（用 AF-Multimer v2.3 的预测结果富化训练数据）缓解此问题。

4. **动态信息缺失**
   AF3 输出静态结构，无法预测蛋白质的构象变化和运动轨迹。

---

## 八、学习总结

### 8.1 核心思想提炼

1. **从"确定性"到"生成式"**：AF3 用扩散模型替代了 AF2 的确定性结构模块，使输出不再是单一固定答案，而是结构分布
2. **通用架构取代定制化**：不再为蛋白质、核酸、小分子分别设计模块，一个 Diffusion Module 全搞定
3. **MSA 不再是一切**：AF3 大幅弱化了 MSA 的权重，意味着在缺少同源序列时也能有一定预测能力

### 8.2 关键术语速查表

| 术语 | 含义 |
|------|------|
| pLDDT | 预测的局部距离差异测试分数（0-100），越高越可信 |
| PAE | 预测对齐误差矩阵，行/列各代表一条残基 |
| PDE | 预测距离误差矩阵（AF3 新增） |
| ipTM | 链对间的界面 TM-score，用于评估复合物界面的置信度 |
| RMSD | 均方根偏差，衡量预测结构与实验结构的差距 |
| DockQ | 蛋白质-蛋白质对接质量评分，>0.23 表示可接受 |
| SMILES | 小分子结构的文本表示法（如 `CCO` = 乙醇） |
| Diffusion | 通过逐步去噪生成目标结构的深度学习方法 |
| Pairformer | AF3 中替代 Evoformer 的核心网络模块 |
| Cross-distillation | 用 AF-Multimer 的预测结果富化 AF3 的训练数据 |

---

*笔记参考：Abramson et al. "Accurate structure prediction of biomolecular interactions with AlphaFold 3." Nature 630, 493–500 (2024).*
