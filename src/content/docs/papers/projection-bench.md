---
title: ProjectionBench — 渐进披露下，LLM 能「猜对」科学结论吗？
来源: https://arxiv.org/abs/2605.30284
日期: 2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：猜结局的侦探剧

想象你在看一集还没播完的悬疑剧。导演只告诉你：

1. **第一幕**：题材是「校园」+ 核心问题是「谁偷了图书馆的稀有书？」
2. **第二幕**：追加一条线索——「警方怀疑是内部人员，但尚无证据」
3. **第三幕**：再给你完整审讯记录和物证链

每一幕结束时，你都要**用一句话写出你认为的结局**（谁干的、关系如何变化）。最后和编剧写好的真结局对比：你猜对了哪些因果陈述？多写了哪些胡编？漏掉了哪些关键事实？

**ProjectionBench**（Lew, Cao & Buehler, arXiv:2605.30284）把大语言模型（LLM）放进同一套「渐进披露」剧本里，但舞台换成**真实材料科学论文**。它问的不是「模型会不会背课本」或「会不会搜文献写综述」，而是更尖锐的问题：

> 在**还没看到实验结果**时，模型能否像科学家一样，从问题出发**投射（project）**出与论文结论语义一致的发现？

这和常见 benchmark 的分工不同：

| 类比 | 测什么 | 典型 benchmark |
|------|--------|----------------|
| 闭卷考试做课后题 | 已知知识上的推理 | SciBench、MatSciBench |
| 写文献综述、核对引用 | 检索与综合 | DeepScholar-Bench、ResearcherBench |
| 给你数据集让你提假设 | 数据驱动发现 | DiscoveryBench |
| **只给研究问题，让你猜实验会得出什么** | **假设生成 + 渐进推理** | **ProjectionBench** |

论文核心发现之一：GPT-5.4 在**仅给主题 + 研究问题**的极简上下文下，仍能保持约 **0.7 F1** 与论文真结论的对齐；而较早的 Gemini 2.5 Pro 往往需要完整实验流程才追得上——说明「创新投射」与「有依据推理」是可以分开度量的两种能力。

---

## 这篇论文在解决什么问题

### 1. 科学发现 ≠ 知识检索

作者引用 Fisher 的经典表述：实验的意义在于给事实一个**否定零假设**的机会。真正的发现需要：

- **创新性**：在信息极少时提出 plausible 的新关系
- **正确性**：在信息充分时推断与证据一致的结论

现有 benchmark 大多测前者（题库）或测检索/写作，很少用**同一份论文、同一研究问题**，在不同信息量下反复考「你猜的结论离真结局有多远」。

### 2. 「Live + 可扩展」的反污染设计

数据集来自 Springer Nature **近 6 个月**开放获取论文（生物活性材料、机械材料、纳米材料各 15 篇，共 **45 篇**），刻意选在模型训练截止日之后发表，降低「背答案」风险。评测在 **offline** 模式运行，避免模型现场检索原文。

### 3. 与 SoundnessBench 的互补（读者可串联阅读）

若把 [SoundnessBench](./soundness-bench.md) 理解为「提案阶段方法论是否站得住」，ProjectionBench 则测「**若实验真做了，你会预测出什么结果**」。一个管**该不该做**，一个管**做了会得出什么**——都是 AI Scientist / Co-Scientist 流水线里缺了很久的环节。

---

## 核心概念

### 1. Progressive Information Disclosure（渐进信息披露）

模型在三个**上下文档位**收到不同信息，并在每一档生成**一句**投射结论（固定格式：`This study finds RESULT`）：

| 档位 `amount` | 给定信息 | 考察能力 |
|---------------|----------|----------|
| **0** | 主题（Topic）+ 研究问题（Research Question） | 开放式科学投射 / 创新 |
| **1** | 上述 + 零假设（Null Hypothesis） | 在统计框架下收窄猜测 |
| **2** | 上述 + 实验流程（Experimental Procedure） | 结构化推理、综合实验设计 |

信息像剥洋葱一样变多，F1 随档位变化形成一条曲线；曲线下的面积 **AUC**（三档 F1 之和）作为模型总评。

### 2. Atomic Claims（原子陈述）

论文结论往往一句里塞多个「若 X 则 Y」关系。评测先把 ground truth 与模型投射都拆成**原子 claim**，每条 claim 用三元组表示：

- **subject**：自变量（被操纵的条件）
- **relationship**：关系词（如 increases、exhibits higher）
- **object**：因变量（被测量的结果）

再分三类对齐情况：

- **(a)** ground truth claim 有对应的投射 claim
- **(b)** ground truth 有，投射**缺失**（漏报）
- **(c)** 投射多出 ground truth 没有的**多余** claim（可能的幻觉）

### 3. LLM-as-Judge + 软 F1

对齐分数 `a(g, p)` 由 **GPT-5 评审**给出（并做顺序翻转取平均，缓解 position bias）。在此基础上定义：

- **TP**：与真值一致或正向对齐的 claim 强度之和
- **FP**：与真值矛盾 claim 的强度之和
- **RE**：相关 claim 总数

再算 Precision、Recall、**F1**。这不是简单字符串匹配，而是**语义级**的 claim 对齐。

### 4. 数据集构建的三波提取（GPT-5）

为避免「假设」和「结论」逻辑脱节，信息提取分波进行：

1. **波 1**：标题、主题、实验流程（较客观）
2. **波 2**：在给定上下文下提取**假设**
3. **波 3**：零假设、研究问题、**最终结果**（ground truth）

这样 benchmark 里的研究问题、零假设、结论在结构上互相约束，更像真实论文叙事链。

### 5. 实验结果摘要

| 模型 | AUC（三档 F1 合计） |
|------|---------------------|
| GPT-5.4 | **1.56** |
| GPT-5 / Gemini 3.1 Pro Preview | 1.44 |
| Gemini 2.5 Pro | 1.33 |

其他要点：

- 加**零假设**带来的 F1 提升，往往大于再加**实验流程**——边际信息递减
- **生物活性材料**题目整体更易猜对；**机械材料**方差大、难度高
- 低上下文下 Gemini 2.5 Pro 有时「锚定」于传统知识（如默认 NaOH 处理更好），而真论文结论是新型钾肥处理更优——这正是 ProjectionBench 要抓的「创新 vs 复述」差异

---

## 代码示例 1：复现三档渐进披露 Prompt

论文附录 Prompt 1 的核心逻辑：根据 `amount` 拼接上下文，再要求模型只输出一句结果观察。

```python
from dataclasses import dataclass
from typing import Literal

ContextAmount = Literal[0, 1, 2]

@dataclass
class PaperSlice:
    topic: str
    research_question: str
    null_hypothesis: str
    experimental_method: str

def build_projection_prompt(paper: PaperSlice, amount: ContextAmount) -> str:
    """ProjectionBench 元素一：可变长度的研究上下文。"""
    base = (
        f"Topic: {paper.topic}\n"
        f"Research Question: {paper.research_question}"
    )
    if amount == 0:
        context = base
    elif amount == 1:
        context = base + f"\nUnverified Hypothesis: {paper.null_hypothesis}"
    else:
        context = (
            base
            + f"\nUnverified Hypothesis: {paper.null_hypothesis}"
            + f"\nExperimental Procedure: {paper.experimental_method}"
        )

    task = """
In one sentence, do your best to project the key outcome of the Research Question.
Focus on the existence and qualitative extent of relationships between
Independent and Dependent Variables.
Do not explain the problem or method. Only provide the new result observation.
Provide in the following format, filling in 'RESULT':

This study finds RESULT
""".strip()

    return context + "\n\n" + task


# 示例：机械材料论文（论文 Table 3 简化）
honckenya = PaperSlice(
    topic="Honckenya fiber-reinforced polypropylene composites",
    research_question=(
        "How do novel potash salt (KTN) and conventional NaOH fiber "
        "treatments compare in thermo-mechanical properties?"
    ),
    null_hypothesis=(
        "KTN treatment does not improve storage/loss moduli or thermal "
        "stability relative to NaOH-treated composites."
    ),
    experimental_method=(
        "Prepare composites with untreated, NaOH-treated, and KTN-treated "
        "Honckenya fibers; measure DMA storage/loss moduli and TGA thermal stability."
    ),
)

print("=== amount=0 (仅主题+问题) ===")
print(build_projection_prompt(honckenya, 0)[:400], "...\n")
print("=== amount=2 (含零假设+实验) ===")
print(build_projection_prompt(honckenya, 2)[-300:])
```

**读代码时注意**：三档之间**研究问题不变**，变的是模型「被允许知道多少实验设计」。因此同一模型在三档的输出差异，直接刻画「从猜想到推理」的轨迹。

---

## 代码示例 2：原子 Claim 拆解与简化 F1 计算

完整评测用 GPT-5 做 claim 提取与对齐打分；下面用**可运行的玩具实现**说明「拆句 → 配对 → F1」管线，便于零基础理解论文 Section 3。

```python
import re
from dataclasses import dataclass

@dataclass(frozen=True)
class AtomicClaim:
    subject: str
    relationship: str
    object: str

    def key(self) -> str:
        norm = lambda s: re.sub(r"\s+", " ", s.strip().lower())
        return f"{norm(self.subject)}|{norm(self.relationship)}|{norm(self.object)}"


def extract_claims_toy(result_sentence: str) -> list[AtomicClaim]:
    """
    教学用简化解析：真实 benchmark 用 LLM（Prompt 2–4）做语义级拆分。
    这里用手工规则模拟 Table 3 中 ground truth 的三条关系。
    """
    templates = {
        "ground_truth": [
            AtomicClaim("KTN-treated composites", "exhibit higher", "storage modulus"),
            AtomicClaim("KTN-treated composites", "exhibit higher", "loss modulus"),
            AtomicClaim("KTN-treated composites", "improve", "thermal stability"),
        ],
        "gpt54_low": [
            AtomicClaim("potash treatment", "improves up to optimum then declines", "thermo-mechanical properties"),
            AtomicClaim("potash treatment", "comparable or modestly superior to", "NaOH treatment"),
        ],
        "gpt54_high": [
            AtomicClaim("KTN-treated composites", "exhibit higher", "storage modulus"),
            AtomicClaim("KTN-treated composites", "exhibit higher", "loss modulus"),
            AtomicClaim("KTN-treated composites", "modestly improve", "thermal stability"),
        ],
    }
    # 演示：根据句子关键词路由到预设 claim 集
    if "significantly higher storage and loss moduli" in result_sentence:
        return templates["ground_truth"]
    if "optimum level" in result_sentence:
        return templates["gpt54_low"]
    if "comparable to or slightly better than NaOH" in result_sentence:
        return templates["gpt54_high"]
    return []


def alignment_score(gt: AtomicClaim, pred: AtomicClaim) -> float:
    """玩具对齐：key 完全一致得 1.0，subject/object 部分重叠得 0.5，否则 0。"""
    if gt.key() == pred.key():
        return 1.0
    overlap = (
        gt.subject.lower() in pred.subject.lower()
        or pred.subject.lower() in gt.subject.lower()
    )
    if overlap and gt.object.lower() == pred.object.lower():
        return 0.5
    return 0.0


def soft_f1(ground_truth: list[AtomicClaim], projected: list[AtomicClaim]) -> float:
    """
    简化版软 F1：对每个 projected claim 取与 ground truth 的最佳对齐；
    对每个 ground truth 检查是否被任一 projected 覆盖（recall）。
    论文用加权 TP/FP 与 LLM 评审分数，这里保留直觉。
    """
    if not projected:
        return 0.0

    tp = 0.0
    matched_gt = set()

    for p in projected:
        best = max((alignment_score(g, p) for g in ground_truth), default=0.0)
        if best > 0:
            tp += best
            for i, g in enumerate(ground_truth):
                if alignment_score(g, p) == best:
                    matched_gt.add(i)

    fp = sum(1 for p in projected if max(alignment_score(g, p) for g in ground_truth) == 0)
    fn = len(ground_truth) - len(matched_gt)

    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    if precision + recall == 0:
        return 0.0
    return 2 * precision * recall / (precision + recall)


GT = "This study finds KTN-treated Honckenya fiber/polypropylene composites exhibit significantly higher storage and loss moduli and improved thermal stability over temperature than NaOH-treated or untreated counterparts."

low = "This study finds potash treatment produces comparable to modestly superior thermo-mechanical performance than NaOH, improving up to an optimum level and then declining under harsher treatment."

high = "This study finds KTN-treated Honckenya fiber/polypropylene composites exhibit higher storage and loss moduli and modestly improved thermal stability across the temperature range than untreated composites, comparable to or slightly better than NaOH-treated composites."

print("GPT-5.4 低上下文 F1 (玩具):", round(soft_f1(extract_claims_toy(GT), extract_claims_toy(low)), 2))
print("GPT-5.4 高上下文 F1 (玩具):", round(soft_f1(extract_claims_toy(GT), extract_claims_toy(high)), 2))
# 论文报告：低上下文 F1≈0.5，高上下文 F1≈1.0（Table 3）
```

这段玩具代码**不能**复现论文精确分数，但展示了 ProjectionBench 的评测哲学：**先把结论拆成可检验的原子关系，再算语义对齐的精确率与召回率**。

---

## 代码示例 3：汇总三档分数得到 AUC

```python
def projectionbench_auc(f1_by_amount: dict[int, float]) -> float:
    """
    论文定义：AUC = 三档渐进披露 F1 的聚合（文中为各档 F1 之和）。
    f1_by_amount: {0: f1_minimal, 1: f1_with_null, 2: f1_with_procedure}
    """
    return sum(f1_by_amount.get(i, 0.0) for i in (0, 1, 2))


# 示意：GPT-5.4 在 45 篇上的平均趋势（具体分档数值见论文 Figure 3）
gpt54_example = {0: 0.70, 1: 0.82, 2: 0.90}
gemini25_example = {0: 0.35, 1: 0.55, 2: 0.78}

print("GPT-5.4 AUC (示意):", projectionbench_auc(gpt54_example))
print("Gemini 2.5 Pro AUC (示意):", projectionbench_auc(gemini25_example))
```

AUC 高不一定代表「更会幻觉」，因为 FP 会进入分母；但若低上下文 F1 也很高，说明模型在**少信息时就能瞄准正确因果方向**——这正是 co-scientist 在实验设计早期最需要的技能。

---

## 方法论细节：为什么这样设计算「科学」

### 与零假设检验的结构对齐

传统流程：研究问题 → 零假设 → 实验 → 拒绝/接受零假设 → 结论。ProjectionBench **故意**让模型在实验结果披露前多次作答，观察：

- 无零假设时是否瞎猜或复述领域常识
- 有实验流程时是否能推出与论文一致的定性关系（而非数值过拟合）

### 评判偏差与局限（论文自述）

1. **Judge 同源偏差**：用 GPT-5 评 GPT 系列，可能偏好相近表述；作者计划**跨家族**评审（如 Gemini 评 GPT）。
2. **材料科学域偏**：45 篇均来自材料子领域，向生物、物理、社科推广需重做数据集管道。
3. **分档较粗**：仅三档上下文，未来可加方法细节、中间结果等更细粒度。
4. **离线模式**：测的是「闭卷投射」，不包含工具调用、实时文献检索——与真实 Deep Research agent 仍有距离。

---

## 与其他 benchmark 怎么选（Table 1 精读）

| 维度 | ProjectionBench 特点 |
|------|----------------------|
| 数据源 | 近期 OA 论文，持续更新 |
| 预测目标 | **论文结果/outcome**，非 QA 或任务实现 |
| 评测 | 原子 claim + LLM judge + F1 |
| Reasoning | ✓（高上下文档位） |
| Discovery | ✓（低上下文档位） |
| Live | ✓（6 个月内新文） |
| Scalable | ✓（API 拉文 + GPT 提取） |

若你正在做 **AI Scientist** 产品路线图，可把 ProjectionBench 放在「**假设生成质量**」验收环节，与 SoundnessBench 的「**方案健全性**」、DeepScholar 的「**综述可信度**」并列。

---

## 实践启示（给工程师与研究者）

1. **给 agent 的上下文不是越多越好**：论文显示「加上零假设」的边际收益常大于堆满实验细节——产品设计时可先结构化「统计假设」，再喂方法学。
2. **分开监控两种失败模式**：低 F1 + 高上下文 → 推理/sync 失败；低 F1 仅出现在低上下文 → 可能只会复述旧知识，不会「向前看」。
3. **评测要拆 claim**：一句漂亮的总结可能混入三个关系，其中一个错了整个发现就不成立；原子化对齐比 BLEU/ROUGE 更贴近科学语义。
4. **防污染是 live benchmark 的生命线**：新论文 + offline 是最低配；仍应用 hold-out 评审模型与多 judge 交叉验证。

---

## 一句话总结

**ProjectionBench** 用「渐进披露 + 原子陈述对齐 + 分档 F1/AUC」，在真实近期论文上测量 LLM 能否从研究问题**投射**出与真结论语义一致的科学发现——既考极简信息下的创新猜测，也考完整实验语境下的 grounded 推理，为下一代 AI co-scientist 提供了可扩展的「猜结局」标尺。

---

## 延伸阅读

- 论文：[arXiv:2605.30284](https://arxiv.org/abs/2605.30284)
- 作者单位：Unreasonable Labs（Mountain View, CA）
- 相关笔记：[SoundnessBench](./soundness-bench.md)（提案阶段方法论健全性）
- 相邻 benchmark：DiscoveryBench、ScholarEval、InnovatorBench、DeepScholar-Bench

---

## 自测题

1. 三档 `amount=0/1/2` 分别多给了什么信息？各主要考察哪种能力？
2. 为什么要把结论拆成 atomic claims，而不是整句算相似度？
3. GPT-5.4 在极简上下文 F1≈0.7 意味着什么？是否等于「已经能替代科学家」？
4. 若用同一模型家族做 judge 和被测模型，可能引入什么偏差？论文建议如何缓解？

<details>
<summary>参考答案（先自己想再点开）</summary>

1. **0**：仅主题+研究问题 → 开放式投射；**1**：+零假设 → 统计框架下的猜测；**2**：+实验流程 → 基于方法的结构化推理。
2. 一句结论常含多个独立/因变量关系；整句相似度会把「对一半」与「全对」混为一谈，也无法惩罚**多余错误 claim**。
3. 表示在**闭卷、极少信息**时，模型猜测与真结论在 claim 级语义上仍有可观对齐；**不等于**可替代科学家——域窄、无因果验证、无实验成本与可重复性考量。
4. **表述风格偏好**、对齐标准过松/过紧；缓解：**跨家族 judge**、claim 提取统一经第三方模型、对齐评测做顺序翻转平均。

</details>
