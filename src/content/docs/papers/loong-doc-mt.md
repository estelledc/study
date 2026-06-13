---
title: Loong — 类人长文档翻译 Agent 与自适应上下文选择
来源: https://arxiv.org/abs/2605.30274
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：专业译员翻长篇小说

想象你接到一本**五十万字的技术手册**或**古典小说**的翻译任务。你不会把整本书一次性塞进脑子里再动笔——那既记不住，也会被无关细节淹没。专业译员通常这样做：

1. **分段推进**：每次翻译一小段（比如 5 句），翻完再写下一段。
2. **三层笔记本**：
   - **剧情摘要本**（Essence）：每翻完一段，用几句话记下「这段讲了什么、文体如何」；
   - **例句对照本**（Exemplar）：把已翻好的中英（或德/法）句对存起来，遇到类似句式时参考；
   - **术语卡**（Entity）：「Korren → 科伦（中尉，不是上校）」「Borlatin Xiao → 博拉丁·肖上尉」——专名一旦定稿就不能漂移。
3. **翻下一段前先「看再选」**（Observe-and-Act）：从笔记本里**检索**候选条目，但**不会全塞进 prompt**——译员会判断：这段摘要跟当前句有关吗？那个例句的文体值得模仿吗？这条术语卡是否重复了？
4. **噪声会害人**：如果把所有历史摘要、所有例句、所有实体一股脑丢给模型，上下文窗口很快爆掉；更糟的是，无关信息会**干扰**当前句的翻译（论文称「冗余上下文降低质量」）。

**Loong**（龙）就是把这个「类人译员工作流」做成 LLM Agent：**3E 记忆模块**存历史、**Observe-and-Act 推理**筛上下文、**强化学习（DPO）**优化「该看什么、怎么用」，再配合**对齐强制翻译算法**保证源句与译句一一对应。

一句话：**长文档翻译的难点不是「有没有上下文」，而是「选什么上下文、怎么用」——Loong 学的是这个策略。**

---

## 是什么

**Loong: A Human-Like Long Document Translation Agent with Observe-and-Act Adaptive Context Selection**（Wang 等，哈工大深圳 / 澳门大学 / 华为翻译中心，arXiv:[2605.30274](https://arxiv.org/abs/2605.30274)）提出：

1. **3E 记忆模块**：Essence（段摘要）+ Exemplar（双语句对）+ Entity（实体术语库），多粒度存储已翻译历史。
2. **Observe-and-Act 自适应上下文选择**：三步推理——先选摘要、再选例句、再选实体——每步输出「思考 + 选中子集」，过滤冗余。
3. **基于采样轨迹的偏好学习**：对每步动作并行采样 \(M\) 次、对翻译采样 \(N\) 次，用 COMET 等质量分构造 \((\text{preferred}, \text{dispreferred})\) 对，经 **SFT + DPO（LoRA）** 优化策略。
4. **对齐强制推理**：递归二分切分未对齐的段，保证**句级对齐**，便于评测与记忆更新。

| 项目 | 内容 |
|------|------|
| 任务 | 文档级机器翻译（DocMT） |
| 语言对 | 英 ↔ 中、德、法（训练）；评测含跨域、未见语言、超长《西游记》 |
| 骨干模型 | Qwen2.5-7B、Qwen3-8B/14B、Llama3.1-8B 等 |
| 开源 | [github.com/YutongWang1216/LoongDocMT](https://github.com/YutongWang1216/LoongDocMT) |
| 效果 | 三项指标平均最高约 **+13.0** 分；Llama3.1-8B 上 LLM-as-Judge 比 DelTA 高 **7.1** 分 |

---

## 为什么重要

长文档翻译是 LLM 的「夹心困境」：

| 困境 | 表现 |
|------|------|
| **窗口有限** | 整篇历史塞进 prompt → 超长文档直接失败（Doc2Doc 在《西游记》约 156–160 行处崩溃） |
| **冗余有害** | 有记忆但不筛选 → sCOMET 甚至不如逐句翻译（DelTA/Doc2Doc 在 Qwen3-8B 上低于 Sentence 基线） |
| **一致性难** | 专名漂移（Korren → Cole/Kolen/Korm）、职衔错误（中尉译成上校） |
| **对齐难** | Doc2Doc 生成句数与源句不对齐 → 文档级指标与记忆更新都不可靠 |

Loong 把问题从「堆更多 token」转成「**学一个上下文策略**」，对 Agent、RAG、长上下文应用都有参考价值。

---

## 核心概念

### 1. 文档分段与 Doc2Doc 工作流

源文档切成 \(L\) 个段 \(\{s_1,\ldots,s_L\}\)，每段默认 **5 句**。按序翻译：翻完 \(s_\tau\) 后更新 3E 记忆，再处理 \(s_{\tau+1}\)。属于 **Doc2Doc**（整段输出），但通过句级对齐算法兼顾 **Doc2Sent** 的评测友好性。

### 2. 3E 记忆模块（Human-like Translation Memory）

| 组件 | 粒度 | 存什么 | 怎么检索 |
|------|------|--------|----------|
| **Essence** | 全局/语义 | 已完成段的 LLM 摘要 | 句向量余弦相似度，取 top-\(K_s\)（默认 4） |
| **Exemplar** | 模式/文体 | 全部历史源-译句对 | 同样 embedding 检索 top-\(K_x\)（默认 4） |
| **Entity** | 专名/术语 | \((e^{src}, e^{tgt}, \text{属性})\) 结构化记录 | 当前段出现的实体 + 上下文相关描述 |

实体分 Character、Organization、Location、Event、Object、Other 六类，每类有不同属性字段（见论文附录 A.1）。翻译完一段后，Agent **抽取实体并更新知识库**。

### 3. Observe-and-Act 三步推理

候选上下文排成序列 \(\mathbf{E} = \langle \tilde{\mathcal{E}}_s, \tilde{\mathcal{E}}_x, \tilde{\mathcal{E}}_n \rangle\)。Agent 执行三步 \(\langle O_1,A_1,O_2,A_2,O_3,A_3 \rangle\)：

- **Observe \(O_k\)**：当前步的候选集合 + 之前步的历史推理；
- **Act \(A_k\)**：\(\langle r_k, \mathcal{C}_k \rangle\)——先写**推理链** \(r_k\) 分析相关性，再输出**选中子集** \(\mathcal{C}_k\)。

**为何分三步而不是一次选？** 联合搜索空间是 \(O(\prod 2^K)\)，逐步分解为 \(O(\sum 2^K)\)，且能对每种上下文类型做**细粒度消融**（论文 Table 3：去掉 Essence 伤害最大）。

### 4. 偏好数据构造（训练时）

对每个 \(A_k\) **并行采样 \(M=7\) 次** → 每种选择再**采样 \(N=5\) 个翻译** → 用 \(\mu\)（sCOMET）算效用 \(U(A_k^i)\)：

- **上下文选择数据集 \(\mathcal{D}_{sel}\)**：同一步里效用最高/最低的动作为 preferred/dispreferred；
- **上下文利用数据集 \(\mathcal{D}_{util}\)**：同一选中上下文下，最好/最差翻译为 preferred/dispreferred。

最后 \(\mathcal{D} = \mathcal{D}_{sel} \cup \mathcal{D}_{util}\)。

### 5. SFT + DPO 两阶段微调

1. **SFT**：只用 preferred 样本，教会模型「能推理、能输出结构化结果」；
2. **DPO**（\(\beta=0.1\)，LoRA rank=8）：在完整偏好对上优化，相对 SFT  checkpoint 拉大 preferred 与 dispreferred 的对数几率差。

论文称此为 RL 优化；实现上是 **offline preference optimization（DPO）**，而非在线 PPO。

### 6. 对齐强制翻译（Alignment-Enforced Inference）

推理时每类上下文**只采样一次**选择，不做中间质量评估。生成时对段 \(u_{i:j}\) 注入句序号与分隔符；若输出句数与源句不对齐，**递归二分**切半重译，直到对齐或降到单句：

\[
T(u_{i:j}) = \begin{cases}
\text{LLM}(u_{i:j}), & \text{已对齐或 } i=j \\
T(u_{i:k}) \oplus T(u_{k+1:j}), & \text{否则}
\end{cases}
\]

### 7. 基线对比（你在读论文时会看到）

| 基线 | 做法 | 弱点 |
|------|------|------|
| **Sentence** | 逐句翻译，无文档上下文 | 术语/文体不一致 |
| **Segment** | 分段翻译，不用跨段记忆 | 无长程依赖 |
| **Doc2Doc** | 对话历史堆全部已译段 | 窗口爆炸 + 噪声 |
| **DelTA** | 多粒度记忆 + 检索，**不过滤** | 冗余上下文干扰句级质量 |

Loong ≈ DelTA 的记忆架构 + **Observe-and-Act 筛选** + **DPO 学策略**。

---

## 代码示例 1：极简 3E 记忆与检索（教学用）

下面用 Python 伪代码演示 Essence / Exemplar 的「翻译一段 → 写记忆 → 下一段检索」循环。实体库用 dict 简化；embedding 用占位函数表示。

```python
from dataclasses import dataclass, field
from typing import List, Tuple, Dict
import numpy as np

def embed(text: str) -> np.ndarray:
    """实际论文用 all-distilroberta-v1；这里用随机向量占位。"""
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    v = rng.standard_normal(768)
    return v / (np.linalg.norm(v) + 1e-9)

def top_k_by_cosine(query: str, items: List[str], k: int) -> List[str]:
    q = embed(query)
    scored = [(it, float(np.dot(q, embed(it)))) for it in items]
    scored.sort(key=lambda x: x[1], reverse=True)
    return [it for it, _ in scored[:k]]

@dataclass
class ThreeEMemory:
    essences: List[str] = field(default_factory=list)      # 段摘要
    exemplars: List[Tuple[str, str]] = field(default_factory=list)  # (src, tgt) 句对
    entities: Dict[str, str] = field(default_factory=dict)  # src_term -> tgt_term

    def update_after_segment(self, src_sents: List[str], tgt_sents: List[str], summary: str):
        self.essences.append(summary)
        for s, t in zip(src_sents, tgt_sents):
            self.exemplars.append((s, t))
        # 实体抽取省略：实际 Loong 用 LLM 结构化抽取六类实体

def retrieve_candidates(memory: ThreeEMemory, segment_src: str, k_s: int = 4, k_x: int = 4):
    essence_cands = top_k_by_cosine(segment_src, memory.essences, k_s)
    src_pool = [s for s, _ in memory.exemplars]
    idx = top_k_by_cosine(segment_src, src_pool, k_x)
    exemplar_cands = [(s, t) for s, t in memory.exemplars if s in idx]
    entity_cands = {k: v for k, v in memory.entities.items() if k in segment_src}
    return essence_cands, exemplar_cands, entity_cands

# --- 模拟翻译两段的 Doc2Doc 循环 ---
memory = ThreeEMemory()

segments = [
    "Captain Borlatin Xiao led the squad. Korren was his lieutenant.",
    "The armored unit moved toward Nemic. Borlatin Xiao gave the order.",
]

for seg in segments:
    ess, ex, ent = retrieve_candidates(memory, seg)
    # Loong 在此调用 Observe-and-Act LLM，从 ess/ex/ent 中再「思考+筛选」
    prompt_context = {"essence": ess, "exemplar": ex, "entity": ent}
    tgt_seg = f"[TRANSLATED] {seg}"  # 占位：真实系统走对齐强制 LLM 调用
    memory.update_after_segment(
        src_sents=seg.split(". "),
        tgt_sents=[tgt_seg],
        summary=f"Summary of: {seg[:40]}...",
    )
    print("segment:", seg[:50], "...")
    print("  retrieved essences:", len(ess), "exemplars:", len(ex))
```

要点：**检索只是候选池**；Loong 的价值在下一步 Agent **拒绝无关条目**（论文案例：10 个实体候选 prune 到 2 个，并丢弃与 record 5 重复的 record 10）。

---

## 代码示例 2：Observe-and-Act 偏好对构造（对应 §3.2）

训练数据来自「同一观察 \(O_k\) 下，不同动作 \(A_k\) 导致不同翻译质量」。下面演示效用 \(U(A)\) 与 preferred/dispreferred 的选取逻辑（公式 3–4）。

```python
import random
from statistics import mean

def comet_score(src: str, hyp: str, ref: str) -> float:
    """占位：论文用 wmt22-comet-da 作为 μ。"""
    # 真实实现调用 Unbabel/COMET
    overlap = len(set(hyp.split()) & set(ref.split())) / max(len(ref.split()), 1)
    return 80.0 + 10.0 * overlap + random.uniform(-0.5, 0.5)

def sample_translations(src: str, context_subset, n: int = 5) -> list[str]:
    """给定选中上下文，采样 n 个翻译（论文 N=5）。"""
    return [f"hyp_{i}_with_{len(context_subset)}_ctx" for i in range(n)]

def build_selection_preference(observation: dict, actions: list[dict], src: str, ref: str):
    """对同一步 k，从 M 个动作中选 U 最高/最低，构成 D_sel 样本。"""
    utilities = []
    for act in actions:
        hyps = sample_translations(src, act["selected"])
        u = mean(comet_score(src, h, ref) for h in hyps)
        utilities.append((act, u))
    best = max(utilities, key=lambda x: x[1])
    worst = min(utilities, key=lambda x: x[1])
    return {
        "observation": observation,
        "preferred": best[0],
        "dispreferred": worst[0],
        "u_plus": best[1],
        "u_minus": worst[1],
    }

# 模拟 Step 1：从 4 条 Essence 摘要中选子集（M=7 种动作，这里只演示 3 种）
src_segment = "Korren reported to Captain Borlatin Xiao."
ref_segment = "科伦向博拉丁·肖上尉作了汇报。"

candidate_summaries = [
    "Squad leadership and ranks in chapter 1",
    "Weather report from previous chapter",      # 噪声
    "Armored unit deployment near Nemic",
    "Character name spellings: Korren, Borlatin Xiao",
]

actions = [
    {"thought": "Summary 1,4 mention ranks and names.", "selected": [0, 3]},
    {"thought": "Use all summaries.", "selected": [0, 1, 2, 3]},  # 含噪声 → 通常更差
    {"thought": "Only summary 2.", "selected": [1]},
]

pref = build_selection_preference(
    observation={"step": 1, "candidates": candidate_summaries},
    actions=actions,
    src=src_segment,
    ref=ref_segment,
)

print("preferred utility:", pref["u_plus"])
print("dispreferred utility:", pref["u_minus"])
print("preferred selection indices:", pref["preferred"]["selected"])
```

构造出的三元组 \((O_k, A_k^+, A_k^-)\) 与 \((\langle s_\tau, \mathcal{C}_k \rangle, t^+, t^-)\) 一起送入 **SFT → DPO**。推理时不再采样 \(M\times N\) 次，每步**一次** Observe-and-Act 即可。

---

## 实验结果速览

### 主结果（Table 2）

在 News Commentary V18.1 与 WMT24++ 上，Loong 在 **sCOMET / dCOMET / LLM-as-Judge** 三项平均上 consistently SOTA。例如 Qwen3-8B、Xx⇒En、WMT24++：**LLM 分 83.5**，DelTA 为 81.1。

### 消融（Table 3，Llama3.1-8B En⇒Xx）

| 设置 | Avg | 解读 |
|------|-----|------|
| Loong 完整 | 80.2 | — |
| w/o Context（只学翻译） | 77.4 | 证明「学策略」比「多看译文」重要 |
| w/o Translation（只学选择） | 63.6 | 选择与利用必须联合训练 |
| w/o Tuning | 75.4 | 微调必要 |
| w/o Essence | 79.0 | 全局摘要最关键 |
| w/o Exemplar | 79.3 | 文体例句重要 |
| w/o Entity | 79.7 | 术语一致性 |

### 超长文档（《西游记》→ 葡萄牙语，Figure 1）

Doc2Doc 在中途因上下文长度**翻译失败**；DelTA 等指标随长度**持续下滑**；Loong 凭结构化记忆 + selective retrieval **全程稳定**，累积 sCOMET / LLM 分最高。

---

## 与相关工作的关系

```text
Doc2Sent（邻句编码）     → 目标侧上下文利用不足
Doc2Doc（历史堆 prompt） → 窗口与噪声
DelTA（3E 记忆 + 检索）  → Loong 的直接前驱，缺「过滤」
Think-and-Translate RL  → 句级推理翻译；Loong 扩展到 DocMT + 多步 Observe-and-Act
DeepSeek-R1 / o1 范式   → Loong 把「采样轨迹 + 偏好优化」用到上下文策略
```

---

## 适用 vs 不适用

**适用**：

- 技术手册、新闻、小说等**长文档**机翻
- 需要**术语一致、文体统一、跨段指代**的场景
- 已有开源 LLM、希望用 **Agent + 记忆 + DPO** 提升 DocMT 而非换更大窗口
- 研究 **自适应 RAG / 上下文压缩** 的 NLP 或 Agent 系统

**局限**（论文 Limitation）：

- 分段长度固定为 5 句，未对齐自然 discourse 边界
- Observe-and-Act 多步推理 → **推理成本**高于 one-pass
- 奖励模型 COMET 与人工文档级偏好可能有 gap
- 实体抽取与六类属性维护增加 pipeline 复杂度

---

## 超参数备忘（复现实验）

| 参数 | 值 |
|------|-----|
| 段长 \(l\) | 5 句 |
| \(K_s, K_x\) | 4（超长文 Essence/Exemplar 可调至 8/6） |
| 动作采样 \(M\) | 7 |
| 翻译采样 \(N\) | 5 |
| SFT | 1 epoch, lr 1e-5, batch 64, ZeRO-3 |
| DPO | 1 epoch, lr 5e-6, batch 32, \(\beta=0.1\), LoRA r=8 |
| max length | 2560 |
| 推理 temperature | 0.7, top-p 1.0 |

---

## 踩过的坑（读论文时的常见误解）

1. **Loong ≠ 更大 context window**：核心是**外部记忆 + 选择性注入**，不是把 128K 全塞满。
2. **3E 检索 ≠ 最终上下文**：检索 top-K 只是候选；Observe-and-Act 还会**再删**。
3. **RL 在这里主要是 DPO**：不是环境交互式 PPO；偏好来自**自己采样**的轨迹。
4. **对齐算法不能省**：DocMT 评测依赖句对齐；不对齐则 dCOMET 与记忆更新都会失真。
5. **Sentence 基线有时很强**：说明「加上下文」若带噪声，不如不加——Loong 的价值在**滤噪**。

---

## 自测题

1. 3E 三个组件分别解决什么粒度的问题？
2. 为什么 Observe-and-Act 要分三步而不是一次选出所有上下文？
3. \(\mathcal{D}_{sel}\) 和 \(\mathcal{D}_{util}\) 分别优化 Agent 的哪种能力？
4. DelTA 与 Loong 架构上最大差异是什么？
5. 对齐强制算法在什么情况下递归二分？

<details>
<summary>参考答案（先自己做）</summary>

1. Essence 管全局语义/体裁；Exemplar 管句式与文体模式；Entity 管专名与术语一致性。
2. 联合选择空间指数级；分步将复杂度从 \(O(\prod 2^K)\) 降到 \(O(\sum 2^K)\)，且便于分析各记忆类型的贡献。
3. \(\mathcal{D}_{sel}\)：**选什么**上下文；\(\mathcal{D}_{util}\)：**给定上下文怎么译**。
4. DelTA 检索后**不过滤**；Loong 增加 Observe-and-Act 推理 + DPO 学习筛选策略。
5. 当 LLM 输出段落的句数/分隔与源段不一致，且段内多于 1 句时，切半分别调用 \(T(\cdot)\) 直到对齐或单句。

</details>

---

## 延伸阅读

- 论文 HTML：[arxiv.org/html/2605.30274v1](https://arxiv.org/html/2605.30274v1)
- 代码：[github.com/YutongWang1216/LoongDocMT](https://github.com/YutongWang1216/LoongDocMT)
- 前驱 DelTA（多粒度记忆 DocMT Agent）：Wang et al., 2025c
- 指标：sCOMET / dCOMET（Unbabel COMET、amazon-science/doc-mt-metrics）
- 同类思路：GraphRAG、长文 Agent 记忆、DPO 偏好优化

---

## 一句话总结

**Loong 像带三本笔记本的资深译员：翻长文档时先检索、再思考、只把真正相关的摘要/例句/术语塞进当前 prompt，并用 DPO 把这套「观察—行动」策略练成肌肉记忆——在有限窗口下换得术语稳、文体齐、超长文不崩。**
