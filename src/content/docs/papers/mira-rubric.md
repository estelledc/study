---
title: MIRA — 中期训练中的来源感知 Rubric 锚定数据筛选
来源: https://arxiv.org/abs/2605.30288
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：同一套评分表评不了所有作业

想象你是教研组长，要在开学前从**海量练习册**里挑出最值得练的题，但练习册来源极杂：

- 有的是**纯代码文档**（像 GitHub 仓库快照）
- 有的是**问答对**（题目 + 参考答案）
- 有的是 **Agent 轨迹**（多轮对话 + 工具调用 JSON）

如果你拿一张**全局评分表**——「文笔流畅、逻辑清晰、信息量大」——去筛 Agent 轨迹，很可能把「话术漂亮但工具调用格式错误」的样本留下；用「困惑度（PPL）」筛一切，长轨迹会被系统性压低分数，和「质量」混为一谈。

MIRA 的做法像**先分组出题、再各组定制 rubric、最后雇便宜助教批量打分**：

1. 把 21 种来源按内容嵌入聚成 **5 个能力组**（Agent / QA / Text 等）
2. 请一位**前沿教师模型**自由写出「这一组到底该看什么」→ 聚类成每组固定的 **anchor rubric（锚定评分维度）**
3. 教师按锚定维度给约 **200 万条**样本打结构化分 → 蒸馏成每组一个**轻量学生打分器**
4. 全库数千万条用学生快速打分 → **可靠性掩码**去掉不靠谱的维度 → **按来源/组保留阈值**筛出最终语料

论文核心结论：**用一半 token（25B vs 50B）的中期训练数据，九项代码 benchmark 的宏平均可与「不过滤全量 50B」持平**，且优于 PPL、DSIR、DataMan、随机采样等基线。

---

## 是什么

**MIRA**（**Mi**d-training **R**ubric **A**nchoring for Source-Aware Data Selection，Wang et al., 2026）是面向 **heterogeneous mid-training（异构中期训练）** 语料的**来源感知质量筛选框架**。

| 阶段 | 训练目标 | 数据特点 | 筛选难点 |
|------|----------|----------|----------|
| 预训练 | 通用语言建模 | 规模大、格式相对同质 | PPL / 去重可扩展 |
| **中期训练** | 仍是大规模 LM loss，但**面向下游能力** | Web、代码、数学、指令、推理链、Agent 轨迹混在一起 | 需要**语义标准**，且标准因来源而异 |
| 后训练（SFT/RL） | 指令跟随 / 偏好对齐 | 格式较标准 | 固定 rubric、LLM-as-judge 成熟 |

MIRA 把 **rubric 发现** 和 **可扩展打分** 拆开：前沿教师只负责「这一组该评什么」，真正扫全库的是蒸馏后的学生模型。

---

## 为什么重要

1. **中期训练已成标配**：在预训练与 SFT/RL 之间，用大规模 curated mixture 补强代码、推理、长上下文、工具使用等能力（Qwen、DeepSeek-R1、CWM 等路线均涉及）。
2. **旧方法两头不靠**：预训练筛选（PPL、DSIR、梯度影响）信号隐式、不懂「Agent 轨迹是否有效恢复错误」；后训练筛选（DataMan、QuRating）假设**固定全局 rubric**，难以覆盖 21 种异构来源。
3. **算力即数据**：论文在 **Qwen2.5-Coder-14B** 上 mid-train **50B token**；MIRA-Group 只用 **25B** 精选子集，SFT 后 **Macro Avg. 64.20**，超过 Random（63.23）、DataMan（63.01）、DSIR（59.55），并逼近 Raw Mixture 50B 的 63.83。
4. **可解释**：分数来自组内多维 rubric + 理由，而非单一标量；案例研究显示低分轨迹多因 **invalid tool-call payload、无 error recovery**，而非「写得不好看」。

---

## 核心概念

### 1. Mid-training（中期训练）

介于大规模预训练与任务后训练之间的阶段：仍用 next-token prediction、token 量级接近预训练，但混合料**刻意偏向能力域**（代码、数学、长文、Agent 等）。与「窄域继续预训练」不同，它要在**保持通用性**的同时拉高特定能力。

### 2. Self-Anchored Rubric Discovery（自锚定 Rubric 发现）

**不做**人工写「代码质量 5 维度、Agent 质量 8 维度」。流程：

1. 对每个来源采样，用内容嵌入把 **21 个来源** 聚成 **5 个组**
2. 教师模型对组内样本 **自由形式评判**：自己提出维度名、打分、写理由（无预设 rubric）
3. 解析为 `(dimension_name, reason)` 判点，嵌入后聚类；每个簇取距质心最近的判点作为 **anchor dimension**
4. 每组得到一组固定锚定维度（实现中每组约 **15 个 anchor**），构成该组的评分空间

直觉：rubric 来自教师**实际怎么评**，不是作者拍脑袋的 normative checklist。

### 3. Anchored Judge Distillation（锚定评判蒸馏）

自由形式评判每条记录的维度集合不同，无法直接当监督信号。固定 anchor 后：

- 教师对更大样本集，在**每个 anchor** 上打数值分 + 简短理由
- 约 **200 万条** teacher-scored 记录 → 训练集 / 验证集
- 每组训练一个 **group-specific student**（论文用 **Qwen3.5-35B-A3B-Base** 全参微调；教师为 **Kimi-K2.6**）
- 学生输出：每个 anchor 的 score + rationale，可解析为多维向量

**每组一个学生**，因为各组 anchor 语义空间不同；比「一个万能打分器」拟合更稳。

### 4. Source-Conditioned Reliability Aggregation（来源条件可靠性聚合）

学生并非在每个「来源 × 维度」上都可靠。在验证集上算教师–学生 **MAE** 与 **Spearman**，低于阈值的 `(source, dimension)` 记入掩码 \(M^{(g)}_{s,d}=0\)。

聚合单条记录分数时：**只对掩码为 1 的维度做 trimmed mean**。掩码在聚合阶段后验应用，**不改学生 prompt**——避免改 prompt 导致剩余维度分数联合分布漂移。

### 5. Source-Preserving Selection（保来源筛选）

不同来源分数分布的均值/方差不同；**单一全局阈值**会先删掉低均值来源 → **能力域被整类砍掉**。三种变体：

| 变体 | 阈值策略 | 特点 |
|------|----------|------|
| MIRA-Global | 全库一个 cutoff | 易偏向高分分布组 |
| **MIRA-Group**（默认） | 每个来源组内保留 | 平衡质量与能力覆盖 |
| MIRA-Source | 每个来源单独 cutoff | 保多样性最强，小来源更噪 |

---

## 实验设置速览

- **基座**：Qwen2.5-Coder-14B
- **Mid-training**：Megatron-LM，约 50B token，seq len 128k，BF16
- **数据**：代码向中期训练混合，**21 sources → 5 groups**（含 Agent 轨迹、QA、Text 等）
- **SFT**：固定 40 万条指令样本，超参一致，差异仅来自 mid-train 数据
- **评测**：9 个 benchmark，分四类宏平均——代码生成（MBPP、MBPP+、BCB、LCB）、多语言 Multipl-E（8 语言）、SQL（Spider + BIRD 可执行准确率）、SWE-Multi

**主要数字（25B 子集，Table 1 Macro Avg.）**：

| 方法 | Macro Avg. |
|------|------------|
| DSIR | 59.55 |
| PPL | 54.73 |
| Random | 63.23 |
| DataMan | 63.01 |
| MIRA-Group | **64.20** |
| Raw Mixture（50B，无筛选） | 63.83 |

---

## 代码示例 1：模拟「自锚定 Rubric 发现」

下面用 Python 演示**分组 → 教师自由判点 → 聚类成 anchor** 的逻辑（教学伪代码，非官方实现）：

```python
from dataclasses import dataclass
from sklearn.cluster import AgglomerativeClustering
import numpy as np

@dataclass
class JudgmentPoint:
    dimension: str
    reason: str
    score: float
    embedding: np.ndarray  # 对 (dimension + reason) 的向量

def cluster_sources_by_embedding(source_means: dict[str, np.ndarray], n_groups: int):
    """按来源内容嵌入的均值向量，把 21 个来源聚成 5 组。"""
    sources = list(source_means.keys())
    X = np.stack([source_means[s] for s in sources])
    labels = AgglomerativeClustering(n_clusters=n_groups).fit_predict(X)
    groups: dict[int, list[str]] = {i: [] for i in range(n_groups)}
    for src, g in zip(sources, labels):
        groups[g].append(src)
    return groups

def discover_anchor_rubrics(free_form_judgments: list[JudgmentPoint], k_anchors: int = 15):
    """
    教师对组内样本的自由评判 → 解析为 JudgmentPoint → 聚类 → 每簇一个 anchor。
    """
    emb = np.stack([j.embedding for j in free_form_judgments])
    cluster_ids = AgglomerativeClustering(n_clusters=k_anchors).fit_predict(emb)
    anchors = []
    for cid in range(k_anchors):
        members = [j for j, c in zip(free_form_judgments, cluster_ids) if c == cid]
        centroid = np.mean([m.embedding for m in members], axis=0)
        # 选距质心最近的判点作为该维度的 anchor 名称与示例理由
        best = min(members, key=lambda m: np.linalg.norm(m.embedding - centroid))
        anchors.append({"name": best.dimension, "exemplar_reason": best.reason})
    return anchors

# 示例：Agent 组可能发现 tool_call_validity、error_recovery 等 anchor；
# Text 组可能是 coherence、technical_depth 等——同一套全局 rubric 无法同时覆盖。
```

---

## 代码示例 2：可靠性掩码 + 组内保留阈值

演示 **source-conditioned reliability** 与 **MIRA-Group** 筛选：

```python
from typing import Dict, List, Tuple

def reliability_mask(
    teacher_scores: Dict[Tuple[str, str], float],
    student_scores: Dict[Tuple[str, str], float],
    mae_thresh: float = 0.35,
    spearman_thresh: float = 0.4,
) -> Dict[Tuple[str, str], bool]:
    """
    对每个 (source, dimension) 在验证集上算 MAE / Spearman。
    低于阈值 → 掩码为 False，不参与聚合。
    """
    from scipy.stats import spearmanr
    mask = {}
    pairs = set(teacher_scores.keys()) & set(student_scores.keys())
    by_pair = {}
    for key in pairs:
        by_pair.setdefault(key, []).append((teacher_scores[key], student_scores[key]))
    for key, pairs_vals in by_pair.items():
        t = [p[0] for p in pairs_vals]
        s = [p[1] for p in pairs_vals]
        mae = sum(abs(a - b) for a, b in zip(t, s)) / len(t)
        corr = spearmanr(t, s).correlation if len(t) > 2 else 1.0
        mask[key] = mae <= mae_thresh and (corr or 0) >= spearman_thresh
    return mask

def aggregate_record_score(
    source: str,
    dim_scores: Dict[str, float],
    mask: Dict[Tuple[str, str], bool],
) -> float:
    """只对可靠维度做 trimmed mean（这里简化为均值）。"""
    vals = [
        dim_scores[d]
        for d in dim_scores
        if mask.get((source, d), True)
    ]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)

def mira_group_select(
    records: List[dict],
    group_of_source: Dict[str, int],
    budget_tokens_per_group: Dict[int, int],
) -> List[dict]:
    """
  在每个 source group 内按 aggregate_score 排序，保留到组内 token 预算。
  避免 MIRA-Global 只捞高分分布组。
    """
    selected = []
    by_group: Dict[int, List[dict]] = {}
    for r in records:
        g = group_of_source[r["source"]]
        by_group.setdefault(g, []).append(r)
    for g, items in by_group.items():
        items.sort(key=lambda x: x["aggregate_score"], reverse=True)
        cap = budget_tokens_per_group.get(g, 0)
        used = 0
        for r in items:
            if used + r["tokens"] <= cap:
                selected.append(r)
                used += r["tokens"]
    return selected
```

---

## 与相关方法的对比

| 方法 | 信号类型 | Rubric | 来源感知 | 可扩展性 |
|------|----------|--------|----------|----------|
| PPL | 模型困惑度 | 无显式语义 | 否 | 高 |
| DSIR | 分布匹配 / 重要性重采样 | 隐式 | 弱 | 高 |
| DataMan | 14 维固定通用质量 rubric | 全局固定 | 否 | 中（长上下文受限） |
| Random | 无 | — | 保来源多样性 | 最高 |
| **MIRA** | 教师语义 + 学生蒸馏 | **每组自发现 anchor** | **是** | 高（学生扫全库） |

分析章节指出：PPL、DSIR **强依赖序列长度**；DataMan 在超长 Agent 轨迹上**无法打分**；MIRA 分数在长短序列上更平滑，更适合含长轨迹的中期训练混合。

---

## 案例分析：Agent 轨迹

高分轨迹：工具调用 JSON **合法** → 收到 error → **下一步修正**行为。  
低分轨迹：多个 JSON 对象拼进一个 `arguments` 字段 → 解析失败 → **重复同样错误调用**，话术仍然流畅。

这说明 MIRA 的 Agent 分数反映 **trajectory-level correctness**，单用「文本质量」或 PPL 难以捕捉。

---

## 局限与后续方向

- MIRA 解决的是**筛选**；来源发现、混合比例、课程学习、去重、污染检测仍属其他模块。
- Rubric 发现依赖 frontier teacher（Kimi-K2.6）能力；换弱教师可能 anchor 质量下降。
- 5 组 / 15 anchor 是工程选择，更细 per-source rubric 与更粗全局 rubric 的 trade-off 需按语料调整。
- 论文实验集中在**代码向中期训练**；数学、多模态、通用能力混合是否同样受益，有待验证。

---

## 一句话总结

**MIRA 把「评什么」和「怎么评全库」拆开：先用教师自发现每组 anchor rubric，再蒸馏成轻量学生，配合来源可靠性掩码与组内保留阈值，在异构中期训练数据上做到语义可解释、可扩展、保能力多样性的筛选——一半 token 逼近全量训练效果。**

---

## 延伸阅读

- 中期训练综述：Tu et al., "A survey on LLM mid-training"
- 固定 rubric 质量分：DataMan (Peng et al., 2025)
- 分布匹配筛选：DSIR (Xie et al., 2023)
- PPL 数据修剪：Marion et al., "When less is more" (2023)
- 同批次「反推配比」思路：[[llmsurgeon-data-mixture]]（事后审计 vs MIRA 事前筛选，问题互补）
