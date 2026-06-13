---
title: COMPOSE — 从引用与形式结构「合成」未来定理
来源: https://arxiv.org/abs/2605.30333
日期: 2026-06-13
子分类: 定理证明
分类: 形式化方法
provenance: pipeline-v3
---

## 从日常类比开始：猜下一本书该写什么章节

你在写一本数学教材，已经写到第 5 章。同事问你：「下一章最可能写什么？」

你会同时看两样东西：

1. **学术脉络（科学上下文）**：这章引用了哪些经典论文？同行最近在推什么方向？引用出现在证明里还是背景介绍里？——这告诉你「**大家正在往哪走**」。
2. **逻辑地基（形式结构）**：第 5 章用到的引理、定理，在 Lean 的 Mathlib 里依赖谁、又能推出谁？——这告诉你「**从现有结果出发，逻辑上还能合法地接什么**」。

只盯引用、不看形式依赖，容易猜出「听起来很前沿、但证不出来」的口号；只盯 Mathlib 依赖、不看论文叙事，容易猜出「逻辑上能证、但没人会关心」的边角结论。

**COMPOSE**（Busbib & Werman, Hebrew University, arXiv:2605.30333）要做的，就是把这两种约束同时喂给一个数学专用语言模型，让它为**锚点论文（anchor paper）**生成一句「像真会出现在未来论文里的定理式主张」，再用检索 benchmark 检验：生成的主张能否找回**后来真正发表、且引用了该锚点的论文**。

类比总结：

| 日常 | COMPOSE | 论文术语 |
|------|---------|----------|
| 看参考文献判断趋势 | 2-hop 引用子图 + 摘要/定理节点 | Scientific graph $G_s$ |
| 看教材定理依赖链 | Mathlib 对齐 + LeanDojo 依赖扩展 | Formal graph $G_f$ |
|  informal 定理 ↔ Lean 定理 | FrenzyMath 检索 + 相似度阈值 | Alignment set $\mathcal{P}$ |
| 两路信息合并后再写 | 双向 cross-attention 融合 | Dual-graph encoder |
| 猜下一篇会 cite 本文的工作 | 生成主张 → 检索 47K 未来论文 | Grounded future mathematical generation |

---

## 这篇论文在解决什么问题

### 1. 未来数学主张必须满足双重约束

一个** plausible** 的未来数学结果需要：

- **科学动机**：延续 Lakatos 意义上的研究纲领，跟引用脉络、社区兴趣一致；
- **形式可 grounded**：在已有定义/引理/定理的依赖图上，下一步「能接得上」。

现有工作往往只建模一侧：

| 路线 | 强项 | 盲区 |
|------|------|------|
| 基于引用的 idea generation（GIANTS、GoAI、CoI 等） | 捕捉研究趋势 | 缺少形式依赖，主张可能「逻辑悬空」 |
| 定理证明 / Mathlib 检索（ReProver、DeepSeek-Prover 等） | 严格依赖结构 | 缺少「哪条 informal 方向值得做」的科学语境 |
| 仅 citation GNN 或仅 theorem GNN | 结构感知 | 单源，无法同时 grounded + motivated |

COMPOSE 提出 **grounded future mathematical generation**：给定锚点论文，联合利用**科学引用图**与**形式定理依赖图**，生成定理式未来主张。

### 2. 非平凡对齐：informal 论文 ↔ formal Mathlib

同一数学内容在 arXiv 正文与 Lean 语法里长相完全不同。COMPOSE 不追求端到端 autoformalization，而采用 **informal-to-informal** 对齐（沿用 FrenzyMath 思路）：

1. 从论文中抽取 informal 定理陈述；
2. 用 E5 嵌入在 FrenzyMath 语料（约 14 万条 Mathlib 定理的自然语言描述）里检索；
3. 相似度高于阈值 $\tau$ 才保留匹配，否则丢弃该定理的形式分支；
4. 以匹配到的 Mathlib 定理为根，用 LeanDojo 沿依赖边扩展局部形式子图。

这样约 **108K** 个「科学图 + 形式图」配对样本可用于训练；测试集为 **2024–2025 年 47K** 篇未来数学论文（时间上 hold-out）。

---

## 核心概念

### 1. 科学图 $G_s$（Scientific Citation Graph）

以锚点论文为中心：

- **节点**：论文摘要节点（abstract）+ 从 1–2 hop 引用文献中抽取的**定理节点**（theorem）；
- **边类型**：引用边、摘要→定理、定理→父定理等；
- **选引用策略**：不是整篇 bibliography 全收，而是按**引用上下文相关性**筛选（最多 1-hop 5 篇、2-hop 每节点 3 篇），优先出现在证明或主结果中的引用；
- **节点初始化**：E5-large-v2 文本嵌入。

训练时的**监督目标**来自「未来论文」：某篇在锚点之后发表、且**引用了锚点**的论文，其**主要数学主张**是要生成的 $y$；该未来论文**不能**出现在输入图里（防泄漏）。

### 2. 形式图 $G_f$（Formal Theorem Dependency Graph）

- **节点**：Mathlib 定理（Lean 签名 + 依赖关系）；
- **边**：Mathlib 中的 directed dependency（由 LeanDojo 抽取）；
- **根节点**：与 $G_s$ 中 informal 定理对齐成功的 Mathlib 定理，标记为 distinct root type；
- **节点初始化**：DeepSeek-Math 对定理签名的嵌入（比 E5 更懂形式数学）。

对齐集合 $\mathcal{P} \subseteq V_s^{\mathrm{thm}} \times V_f$ 把两侧定理节点连起来，是跨图融合的锚。

### 3. 双图编码器 + 融合

两条支路结构相同（2 层 message-passing GNN，hidden 1024），参数不共享：

```
G_s → SimpleGNN(E5 init) → h^s  ─┐
                                  ├─ Bridge MLP → 共享 4224 维
G_f → SimpleGNN(DS-Math init) → h^f ─┘
                                  ↓
                    双向 cross-attention（各 8 head）
                                  ↓
              融合节点表示 {h̃_i} → 条件化 DeepSeek-Math-7B
```

- GNN 更新：入边/出边消息分别 mean-pool，经 gated residual + LayerNorm，缓解 over-smoothing；
- 融合后表示与 decoder 隐藏态在**第 3,7,11,15,19,23,27,31 层**做 cross-attention（约 20% 层）；
- Decoder 用 **LoRA rank 32** 微调。

### 4. 两阶段训练

**Stage 1（无 decoder）**：只训 GNN、Bridge、Fusion，冻结文本嵌入。

- $\mathcal{L}_{link}$：链路预测，让相邻节点表示内积大、非边小；
- $\mathcal{L}_{align}$：对比学习，融合图表示靠近「真实未来论文」的 abstract+claim 嵌入，远离负样本；
- $\mathcal{L}_{cross}$：对齐 $\mathcal{P}$ 中 informal↔formal 定理对，InfoNCE 式对比。

**Stage 2（加 decoder）**：

- 自回归 CE：生成未来数学主张文本；
- **Graph margin loss**：防止 decoder 忽略图条件（无图时 loss 应更差）。

若某样本没有任何高置信 Mathlib 匹配，则**仅用科学图编码器**训练（形式支路为空）。

### 5. 评估方式

主指标不是 ROUGE 抄未来摘要，而是**检索真实未来论文**：

1. 模型生成主张 $\hat{y}$；
2. 在 **47K** 未来论文池里，用微调过的 DeepSeek-Math 嵌入做相似度检索；
3. 看 ground-truth 未来 citing 论文是否出现在 Top-k。

在 confidence-stratified 子集上，COMPOSE **H@10 = 0.508**（CoI-GPT4 约 0.410，GIANTS 约 0.080）。LLM-as-judge 五维（数学内容、技术深度、新颖性、精确性、具体性）综合最优；**Struct.**（含实质数学内容的比例）约 **0.975**。

**Fut-R** 指标衡量是否「向前看」：

$$\mathrm{Fut\text{-}R}=\frac{\mathrm{ROUGE\text{-}L}(\hat{y}, y^{*})}{\mathrm{ROUGE\text{-}L}(\hat{y}, x)}$$

> 1 表示生成文本更像未来真定理，而非复述输入；COMPOSE 约 1.223，GIANTS 约 0.314。

---

## 代码示例 1：用 Python 构造「科学图 + 形式图」的极简骨架

下面不是官方实现，但对应论文 §3.1 的数据逻辑，帮助零基础读者把两张图「画」出来：

```python
from dataclasses import dataclass, field
from typing import Literal

NodeKind = Literal["abstract", "theorem_informal", "theorem_formal"]

@dataclass
class Node:
    id: str
    kind: NodeKind
    text: str          # 摘要、informal 定理陈述、或 Lean 签名
    embedding: list[float] = field(default_factory=list)

@dataclass
class Edge:
    src: str
    dst: str
    kind: Literal["cites", "paper_has_theorem", "theorem_dep", "align"]

@dataclass
class DualGraphExample:
    anchor_id: str
    scientific: list[Node]
    formal: list[Node]
    edges_s: list[Edge]
    edges_f: list[Edge]
    align_pairs: list[tuple[str, str]]  # (informal_thm_id, mathlib_thm_id)
    target_future_claim: str            # 监督：后来 cite 锚点的那篇论文的主主张

def build_scientific_subgraph(anchor, refs_hop1, refs_hop2, tau_context=0.5):
    """按引用上下文相关性选边，不是全量 bibliography。"""
    nodes, edges = [], []
    nodes.append(Node(anchor.id, "abstract", anchor.abstract))
    for ref in select_by_citation_context(refs_hop1, max_papers=5):
        nodes.append(Node(ref.id, "abstract", ref.abstract))
        edges.append(Edge(ref.id, anchor.id, "cites"))
        for thm in ref.extracted_theorems:
            tid = f"{ref.id}::{thm.label}"
            nodes.append(Node(tid, "theorem_informal", thm.statement))
            edges.append(Edge(tid, ref.id, "paper_has_theorem"))
    # hop-2 同理，每节点最多 3 篇…
    return nodes, edges

def align_to_mathlib(informal_thm, frenzymath_index, sim_threshold=0.72):
    """informal-to-informal：E5 检索 FrenzyMath 描述，再映射到 Mathlib。"""
    candidates = frenzymath_index.search(informal_thm.statement, top_k=5)
    best = max(candidates, key=lambda c: c.cosine)
    if best.cosine < sim_threshold:
        return None  # 该定理无形式分支
    return best.mathlib_theorem_id

def expand_formal_deps(root_mathlib_id, leandojo, hops=2):
    """从对齐根定理沿 Mathlib 依赖边扩展。"""
    nodes, edges = [], []
    frontier = [(root_mathlib_id, 0)]
    seen = set()
    while frontier:
        tid, depth = frontier.pop()
        if tid in seen or depth > hops:
            continue
        seen.add(tid)
        meta = leandojo.get_theorem(tid)
        nodes.append(Node(tid, "theorem_formal", meta.signature))
        for dep in meta.dependencies:
            edges.append(Edge(dep, tid, "theorem_dep"))
            frontier.append((dep, depth + 1))
    return nodes, edges

def select_by_citation_context(refs, max_papers):
    # 论文附录 A.1：引用出现在证明/主结果中得分更高
    return sorted(refs, key=lambda r: r.citation_importance, reverse=True)[:max_papers]
```

要点：**科学图**负责「往哪走」，**形式图**负责「能接什么」；`align_pairs` 是两座桥。

---

## 代码示例 2：双图融合 + 条件化解码（PyTorch 伪代码）

对应 §3.2 的 encoder–fusion–decoder 数据流：

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class SimpleGNN(nn.Module):
    def __init__(self, in_dim, hidden=1024, layers=2):
        super().__init__()
        self.layers = nn.ModuleList([
            nn.Linear(hidden if i else in_dim, hidden) for i in range(layers)
        ])
        self.gates = nn.ModuleList([nn.Linear(hidden * 2, 1) for _ in range(layers)])

    def forward(self, h, edge_index_in, edge_index_out):
        for lin, gate in zip(self.layers, self.gates):
            m_in = mean_aggregate(h, edge_index_in)
            m_out = mean_aggregate(h, edge_index_out)
            msg = F.relu(lin(m_in + m_out))
            g = torch.sigmoid(gate(torch.cat([h, msg], dim=-1)))
            h = F.layer_norm(g * msg + (1 - g) * h, h.shape[-1:])
        return h  # 再 concat 冻结文本嵌入 → 1152/4096 维上下文向量

class ComposeDualEncoder(nn.Module):
    def __init__(self, d_s=1152, d_f=4096, d_fused=4224, n_heads=8):
        super().__init__()
        self.gnn_s = SimpleGNN(d_s)
        self.gnn_f = SimpleGNN(d_f)
        self.bridge_s = nn.Sequential(nn.Linear(d_s, 2048), nn.GELU(), nn.Linear(2048, d_fused))
        self.bridge_f = nn.Sequential(nn.Linear(d_f, 2048), nn.GELU(), nn.Linear(2048, d_fused))
        self.type_embed = nn.Embedding(2, d_fused)  # 0=scientific, 1=formal
        self.cross_attn = nn.MultiheadAttention(d_fused, n_heads, batch_first=True)

    def fuse(self, h_s, h_f):
        z_s = self.bridge_s(h_s) + self.type_embed(torch.zeros(len(h_s), dtype=torch.long))
        z_f = self.bridge_f(h_f) + self.type_embed(torch.ones(len(h_f), dtype=torch.long))
        # 双向：科学节点 attend 形式节点，再反过来
        z_s2, _ = self.cross_attn(z_s.unsqueeze(0), z_f.unsqueeze(0), z_f.unsqueeze(0))
        z_f2, _ = self.cross_attn(z_f.unsqueeze(0), z_s.unsqueeze(0), z_s.unsqueeze(0))
        z_s = F.layer_norm(z_s + z_s2.squeeze(0), z_s.shape[-1:])
        z_f = F.layer_norm(z_f + z_f2.squeeze(0), z_f.shape[-1:])
        return torch.cat([z_s, z_f], dim=0)  # decoder cross-attn 的 K/V

# Stage 1：对比损失（简化版 L_align）
def alignment_loss(h_graph, e_pos, e_negs, temperature=0.07):
    sim_pos = F.cosine_similarity(h_graph, e_pos) / temperature
    sim_negs = torch.stack([F.cosine_similarity(h_graph, n) for n in e_negs]) / temperature
    logits = torch.cat([sim_pos.unsqueeze(0), sim_negs])
    return F.cross_entropy(logits.unsqueeze(0), torch.zeros(1, dtype=torch.long))

# Stage 2：decoder 在指定层把 hidden states 作为 Q，融合图节点作为 K/V
# DeepSeek-Math-7B + LoRA；cross-attn 插入层索引 [3,7,11,15,19,23,27,31]
```

训练时若 `h_f` 为空（无 Mathlib 匹配），`fuse` 只返回 `z_s`，与论文「仅 citation encoder」分支一致。

---

## 代码示例 3：官方 CLI 推理流程（概念）

仓库 [david-busbib/COMPOSE](https://github.com/david-busbib/COMPOSE) 提供端到端 demo，逻辑与论文 Figure 1 一致：

```bash
# 给定 arXiv ID，拉 Semantic Scholar 引用 → 建 G_s → FrenzyMath 对齐 → 建 G_f → 生成 n 条未来主张
python run_compose.py \
  --arxiv 2309.03806 \
  --n 3 \
  --checkpoint checkpoints/compose-ds-math-7b
```

内部流水线（摘自项目 README）：

1. 拉取锚点论文及参考文献（Semantic Scholar，无需 API key）；
2. E5-large-v2 嵌入摘要，构建 citation 子图；
3. 抽取 informal 定理，嵌入检索 Mathlib4 / FrenzyMath，构建形式子图；
4. 双 GNN + 双向 cross-attention；
5. DeepSeek-Math-7B 解码 `--n` 条 plain-text 未来主张。

---

## 与相关工作的关系

| 工作 | 与 COMPOSE 的差异 |
|------|-------------------|
| **GIANTS** | 用引用上下文生成未来**科学摘要**，不生成定理式主张，不用 Mathlib 结构 |
| **GoAI / FutureGen / ResearchAgent** | 通用 research idea，缺形式 grounded |
| **GoR**（Citation Evolution Graphs） | 也用引用 DAG 监督 LLM，但面向 ML/NLP venue，无 formal graph |
| **Lemmanaid / conjecture generation** | 在形式库内猜新引理，缺 arXiv 科学叙事 |
| **FrenzyMath / Autoformalization** | COMPOSE **消费**对齐结果，目标不是翻译而是**预测未来** |

COMPOSE 的定位：**informal 研究 front-end**（读论文、看趋势）与 **formal library back-end**（Lean 依赖）之间的桥，用于** grounded 的未来定理式生成**。

---

## 实验要点与消融

- **Paper-graph-only**（去掉 $G_f$）：H@10 与 Struct. 均下降，说明形式结构不是装饰；
- **Bag-of-Papers**（打平图结构）：弱于完整 GNN，说明**边类型与定理节点**重要；
- **Text-only LoRA**（无图）：Fut-R 虚高（2.241）但 BERTScore 更低——更像「改写输入」而非预测未来；
- 嵌入空间上，**原始 cosine 检索**区分度差（Tgt-Neg margin 小），故 benchmark 额外微调 DeepSeek-Math 嵌入做检索。

---

## 局限与开放问题

1. **对齐覆盖率**：大量 informal 定理达不到 FrenzyMath 阈值，只能退化为单图；autoformalization 进步可能扩大 $G_f$。
2. **时间切分**：训练 2000–2023，测试 2024–2025；领域漂移、Mathlib 版本变化会影响对齐质量。
3. **「预测」≠「证明」**：生成的是 plausible **claim**，不保证真或可证；更像 research hypothesis 生成器。
4. **评估依赖检索代理**：H@10 衡量的是「能否找对后来 cite 锚点的那篇」，不是形式验证。
5. **计算成本**：双 GNN + 7B decoder cross-attn，比纯 prompt baseline 重得多。

---

## 谁应该读这篇论文

- 做 **AI for Math / 自动猜想 / 研究 idea 生成** 的人；
- 把 **Lean/Mathlib 依赖** 当结构信号，而不只做 proof search 的人；
- 关心 **citation graph + KG** 混合 conditioning 的 NLP 研究者；
- 想复现 **108K 双图数据 + 47K 未来检索 benchmark** 的工程师（代码与 project page 已公开）。

---

## 一句话带走

> COMPOSE 把「参考文献告诉你方向」和「Mathlib 告诉你能接什么」编成两张图，用 GNN 分别编码、cross-attention 融合，再条件化 DeepSeek-Math-7B 生成未来定理式主张——在 47K 真实未来论文检索上，比只看 citation 或纯文本微调更 grounded、也更像数学。

---

## 参考

- 论文：[COMPOSE: Composing Future Theorems from Citations and Formal Structure](https://arxiv.org/abs/2605.30333)
- Project page：https://david-busbib.github.io/COMPOSE-page/
- 代码：https://github.com/david-busbib/COMPOSE
- 对齐语料：FrenzyMath（Gao et al., 2024）
- 形式依赖抽取：LeanDojo（Yang et al., 2023）
- 基线：GIANTS（He-Yueya et al., 2026）、Chain-of-Ideas 等
