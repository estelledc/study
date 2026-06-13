---
title: 共形预测 + LLM — 用统计保证让大模型决策更可靠
来源: "Vishwakarma, Mishler, Cook, Dalmasso, Raman & Ganesh, Prune n Predict: Optimizing LLM Decision-making with Conformal Prediction, ICML 2025"
日期: 2026-06-13
分类: 机器学习
子分类: 共形预测
provenance: pipeline-v3
---

## 是什么

**日常类比：面包店的诚信保证**

想象你去面包店问老板"这个可颂新鲜吗？"。普通 AI 模型就像老板凭直觉说"85% 新鲜"，但这个 85% 只是感觉，没有真正的保证。**共形预测（Conformal Prediction）**则像老板背后藏了一本账本——过去 500 天每天记录了早上预测 vs 中午实际检查的结果。现在老板翻账本后说："根据我的历史记录，在这种不确定程度下，我错的比例正好是 10%。所以我给你一个**统计保证**：我有 90% 的把握这个可颂是新鲜的。如果我没把握，我会老实说'不好说'。"

这个保证的厉害之处：**无论面包店老板水平如何（模型好坏），无论卖什么面包（数据分布），这个 90% 的保证都是数学上成立的。**

**技术定义**

共形预测是一种**包裹任何模型的外壳**——把模型的原始输出（比如 softmax 概率、logits）变成带有**统计保证的预测集合**。它的核心承诺是：

> "给定置信度 90%，真正的答案落在预测集合里的概率 >= 90%。这个保证不需要任何数据分布假设，对任何模型都成立。"

ICML 2025 的这篇论文把这个想法用在了 LLM 上。LLM 做选择题时（比如 MMLU 题库、工具选择），常常被干扰选项带偏。论文提出两步法：

1. **CROQ**：先用共形预测筛掉明显错的选项，再把精简后的题重新给 LLM
2. **CP-OPT**：训练一个打分函数，让筛选完的选项集尽可能小（同时保证正确选项不丢）

## 为什么重要

- **LLM 做选择题会犯错**：MMLU 上 Llama-3 面对 10 个选项时，有大量题因为干扰项太多而答错
- **传统 confidence（softmax）不可靠**：LLM 输出的"置信度"经常过度自信——声称 99% 确定但实际错误率远高于 1%
- **高风险场景不能赌**：医疗诊断、金融决策、法律咨询中，宁愿说"我拿不准 A 还是 B"而不是赌一个错的
- **CROQ 让准确率提升 6-15%**：仅仅通过"先筛掉明显错的再让 LLM 选"，不需要微调模型、不需要更多计算
- **CP-OPT 让筛选更精准**：标准 logits 产生的预测集太大（平均 5-6 个选项），CP-OPT 把集合缩小 50% 同时保持 95% 覆盖

## 核心要点

### 要点 1：Split Conformal Prediction（共形预测的实操版）

共形预测最常用的实现叫"split conformal"——把数据切成三块：

```
全部数据 -> [训练集] [校准集] [测试集]
              |         |         |
           训练模型   算阈值    预测+评估
```

**三步走**：

1. **训练模型**（在训练集上，和平时一样）
2. **校准**（在校准集上）：
   - 对校准集的每个样本，计算"非一致性分数"（nonconformity score）——模型错得越离谱，这个分越高
   - 比如分类任务：`score = 1 - 模型对正确答案的输出概率`
   - 按 (1-alpha) 分位数取阈值：`tau = quantile(校准集所有分数, 1-alpha)`
3. **预测**（对测试集新样本）：
   - 对每个候选答案算分数，分数低于 tau 的入选
   - 预测集合 = `{候选 | score(候选) <= tau}`

**核心保证**：如果校准集和测试集来自同一分布（exchangeability），那么 `P(真答案 属于 预测集) >= 1-alpha`。

### 要点 2：CROQ —— 用共形预测改写题目

CROQ（Conformal Revision of Questions）的思路出奇简单：

```
原题："法国的首都是？A) 伦敦 B) 巴黎 C) 柏林 D) 马德里"
  |  第一步：共形预测筛选项
置信集包含：{B, D}  （95% 概率包含真答案）
  |  第二步：改写题目，只保留 B 和 D
改写题："法国的首都是？A) 巴黎 B) 马德里"
  |  第三步：LLM 在新题上作答 —— 选项少了，更准了
```

**为什么有效**：LLM 在有 4 个选项时比有 10 个选项时准确得多。但只有当筛选后**真答案还在集合里**时才有意义——这正是共形预测的覆盖保证。论文实验证实：当被筛掉的选项不包含真答案时（覆盖失效），反而会降低准确率；但因为共形预测保证了覆盖概率，平均下来准确率是上升的。

**Monty Hall 类比**：就像"三门问题"——主持人先打开一扇空门，你在剩下两扇门中再选，概率从 1/3 变成 2/3。CROQ 先筛掉明显错的选项，LLM 在更小的选项集里做选择，效果更好。

### 要点 3：CP-OPT —— 学习更好的打分函数

简单的非一致性分数（`1 - softmax(正确选项)`）产生**太大的预测集**——经常包含 5-6 个选项，CROQ 的筛选效果就打折扣。CP-OPT 的核心思路：

- **优化目标**：`最小化(预测集平均大小) 同时满足 覆盖概率 >= 1-alpha`
- **怎么优化**：用一个小的神经网络（比如 2 层 MLP）作为打分函数 g(x, y)，用 SGD 训练
- **技巧**：用 sigmoid 函数 `sigma(s - tau)` 替代硬性的 `1{s >= tau}` 指示函数，让整个目标可微
- **结果**：预测集缩小 50%，同时保持 95% 覆盖

CP-OPT 不依赖 LLM 本身的 logits，它可以在 LLM 的 embedding 之上训练一个小网络来重新打分——完全黑盒，不需要 LLM 内部权重。

## 实践案例

### 案例 1：从零实现 Split Conformal Prediction

```python
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.datasets import make_classification

# ===== 准备数据 =====
X, y = make_classification(n_samples=1000, n_features=10, n_classes=5,
                           n_informative=8, random_state=42)

# 三块切分：训练 60% / 校准 20% / 测试 20%
X_train, X_temp, y_train, y_temp = train_test_split(
    X, y, test_size=0.4, random_state=42)
X_calib, X_test, y_calib, y_test = train_test_split(
    X_temp, y_temp, test_size=0.5, random_state=42)

# ===== 步骤 1：训练模型（普通训练，无特殊操作） =====
model = LogisticRegression(max_iter=1000, multi_class='multinomial')
model.fit(X_train, y_train)

# ===== 步骤 2：校准 —— 在模型没见过的校准集上算阈值 =====
# 获取校准集上每个样本所有类别的预测概率
calib_probs = model.predict_proba(X_calib)  # shape: (n_calib, n_classes)

# 非一致性分数 = 1 - 模型对"正确答案"的输出概率
# 分数越高 = 模型越不认同这个答案
n_calib = len(y_calib)
calib_scores = np.array([
    1 - calib_probs[i, y_calib[i]] for i in range(n_calib)
])

# 按 (1-alpha) 分位数取阈值
alpha = 0.1  # 希望 90% 的覆盖
n_calib = len(calib_scores)
q_level = np.ceil((n_calib + 1) * (1 - alpha)) / n_calib
tau = np.quantile(calib_scores, q_level, method='higher')

print(f"阈值 tau = {tau:.4f}")
print(f"校准集分数范围: [{calib_scores.min():.4f}, {calib_scores.max():.4f}]")

# ===== 步骤 3：在测试集上产生预测集合 =====
test_probs = model.predict_proba(X_test)  # shape: (n_test, n_classes)

coverage_count = 0
avg_set_size = 0

for i in range(len(X_test)):
    # 每个类别的非一致性分数
    scores = 1 - test_probs[i]  # 分数越低越可信

    # 所有分数 <= tau 的类别入选
    pred_set = np.where(scores <= tau)[0]

    avg_set_size += len(pred_set)
    if y_test[i] in pred_set:
        coverage_count += 1

avg_set_size /= len(X_test)
empirical_coverage = coverage_count / len(X_test)

print(f"\nAlpha = {alpha} (目标覆盖 >= {1-alpha:.0%})")
print(f"实际覆盖 = {empirical_coverage:.1%} ({coverage_count}/{len(X_test)})")
print(f"平均预测集大小 = {avg_set_size:.2f} / {model.classes_.shape[0]} 个类别")

# ===== 对比：不用共形预测的 top-1 准确率 =====
top1_pred = model.predict(X_test)
top1_acc = np.mean(top1_pred == y_test)
print(f"\n对比: Top-1 准确率 = {top1_acc:.1%}")
print(f"共形预测: 覆盖 {empirical_coverage:.1%}，平均给出 {avg_set_size:.1f} 个候选")
```

**运行结果理解**：你会看到实际覆盖 >= 90%（满足保证），平均预测集大约是 1.5-2.5 个类别。这意味着模型在大多数时候能很确定地给出 1-2 个候选（已经非常接近单一答案），但同时保留了当模型不确定时集合变大的灵活性。

### 案例 2：模拟 CROQ —— 选项精简提升 LLM 准确率

这个例子**不调用真实 LLM**，而是用概率模拟 CROQ 的核心逻辑：展示"筛掉干扰项"如何提升准确率。

```python
import numpy as np

# ===== 模拟 LLM 做选择题的行为 =====
# 假设：LLM 在面对 k 个选项时，准确率随 k 增加而下降
def llm_accuracy(k):
    """LLM 面对 k 个选项时的准确率（单调递减）"""
    return 0.95 - 0.03 * (k - 2)  # 2 选项 95%, 4 选项 89%, 10 选项 71%

def simulate_llm_choice(correct_idx, n_options):
    """模拟 LLM 从 n_options 中选一个答案"""
    acc = llm_accuracy(n_options)
    if np.random.random() < acc:
        return correct_idx
    else:
        # 从错误选项中随机选一个
        wrong_options = [i for i in range(n_options) if i != correct_idx]
        return np.random.choice(wrong_options)

# ===== 模拟共形预测筛选项（核心：保证真答案入选概率 >= 1-alpha） =====
def conformal_prune(correct_idx, n_options, alpha=0.1):
    """
    模拟共形预测筛选。
    返回 (筛选后的选项数, 真答案是否在集合中)

    简化假设：
    - 当共形预测"成功"时（概率 1-alpha），真答案一定在集合中
    - 筛掉多少取决于选项总数（越多选项，筛掉越多）
    - 覆盖概率 = 1-alpha（共形预测的核心保证）
    """
    coverage_success = np.random.random() < (1 - alpha)

    if coverage_success:
        # 共形预测成功：真答案在集合中
        # 筛掉 40-60% 的选项（根据 CP-OPT 论文结果）
        prune_ratio = np.random.uniform(0.4, 0.6)
        remaining = max(2, int(n_options * (1 - prune_ratio)))
        # 确保真答案在剩余集合中
        return remaining, True
    else:
        # 共形预测失败（概率 alpha）：真答案可能不在集合中
        prune_ratio = np.random.uniform(0.4, 0.6)
        remaining = max(2, int(n_options * (1 - prune_ratio)))
        # 真答案有 50% 概率还在集合中（随机留下）
        in_set = np.random.random() < 0.5
        return remaining, in_set

# ===== 实验：对比"直接做 10 选项题" vs "CROQ 先筛再选" =====
N_TRIALS = 10000
n_options = 10
alpha = 0.1  # 90% 覆盖保证

correct_no_croq = 0
correct_with_croq = 0
croq_penalty = 0  # CROQ 筛选丢掉了真答案的次数

for trial in range(N_TRIALS):
    correct_idx = np.random.randint(0, n_options)

    # === 对照组：直接让 LLM 做 10 选项题 ===
    llm_answer = simulate_llm_choice(correct_idx, n_options)
    if llm_answer == correct_idx:
        correct_no_croq += 1

    # === 实验组：CROQ 流程 ===
    remaining, answer_in_pool = conformal_prune(correct_idx, n_options, alpha)

    if not answer_in_pool:
        # 真答案被筛掉了——CROQ 失效
        croq_penalty += 1
        # 即使筛掉了，LLM 还是有概率碰对
        if np.random.random() < 1/remaining:
            correct_with_croq += 1
    else:
        # 真答案在集合中，LLM 在更少的选项里选
        llm_answer_2 = simulate_llm_choice(0, remaining)
        if llm_answer_2 == 0:  # 选中了第一个（即真答案）
            correct_with_croq += 1

# ===== 结果 =====
acc_no_croq = correct_no_croq / N_TRIALS
acc_with_croq = correct_with_croq / N_TRIALS

print("=" * 50)
print("CROQ 效果模拟（10 选项 -> 精简到 2-5 选项）")
print("=" * 50)
print(f"LLM 在 {n_options} 个选项下的准确率: {llm_accuracy(n_options):.1%}")
print(f"LLM 在 4 个选项下的准确率:   {llm_accuracy(4):.1%}")
print(f"LLM 在 2 个选项下的准确率:   {llm_accuracy(2):.1%}")
print()
print(f"对照组（直接做 {n_options} 选项）: {acc_no_croq:.2%}")
print(f"实验组（CROQ 先筛再选）:         {acc_with_croq:.2%}")
print(f"提升:                             {acc_with_croq - acc_no_croq:+.2%}")
print()
print(f"CROQ 失效次数（真答案被筛掉）: {croq_penalty}/{N_TRIALS} ({croq_penalty/N_TRIALS:.1%})")
print(f"理论覆盖失效概率: {alpha:.1%}")
print()
print("关键洞察：")
print(f"  - 如果覆盖失效率 约等于 {alpha}，说明共形预测保证成立")
print(f"  - 即使偶尔丢答案，筛掉干扰项带来的好处远大于损失")
print(f"  - 选项越多，CROQ 效果越明显（LLM 在多选项时更需要帮助）")
```

**代码解读**：这个模拟展示了 CROQ 的核心 trade-off：
- 共形预测保证 90% 的时间真答案在集合中（10% 丢失率）
- 即使 10% 的时间丢了真答案，由于 LLM 在少选项时准确率显著更高，**平均准确率仍然上升**
- 这类似于 Monty Hall 问题——先去掉一个错误门，再选，赢面变大

## 踩过的坑

1. **非一致性分数的方向搞反**：`score = 1 - p(正确答案)` 意味着分数越低越可信。阈值判断是 `score <= tau`，不是 `>=`。搞反了会导致覆盖暴降（因为选入的都是模型最不认同的答案）

2. **校准集必须模型没见过**：如果你用训练集做校准，非一致性分数会被严重低估——模型在训练集上自信过头，阈值太小，测试时覆盖远低于目标。必须严格 split

3. **小校准集会让阈值不稳定**：校准集只有 50 个样本时，`alpha=0.05` 的阈值对应第 2.5 个样本的分数，方差很大。建议校准集至少 200-500 个样本

4. **CROQ 改写题目时注意 token 对齐**：把选项从 `B) 巴黎` 重新编号为 `A) 巴黎` 后，LLM 的 logits 分布会变。因为 token `B` 和 `A` 的 logit 不同——论文中对此有专门处理（选项用 key token 的 logits 而不是全文 softmax）

## 适用

适合使用 CROQ + CP-OPT 的场景：
- LLM 做**多选问答**（MCQ），选项越多效果越明显
- LLM 做**工具 / API 选择**（比如从 20 个可用 API 中选一个调用）
- **高风险决策**场景，需要统计保证而非依赖模型自报的 confidence
- 任何**黑盒 LLM**——因为 CP-OPT 不依赖模型内部权重，只需 access logits 或 embedding

不适合的场景：
- 开放式文本生成（没有"选项"这个概念）
- 模型已经接近完美准确率的情况（95%+ 时 CROQ 提升空间小）
- 校准数据难以获取的场景（比如用户 query 的正确答案无法标注）

## 学到什么

1. **共形预测不提高模型能力，只提高可信度**：它不能把 70% 准确率的模型变成 90%，但能让模型诚实地说"这个我不确定"——给出更大的预测集

2. **CROQ 的优雅之处**：不是去改进 LLM 本身，而是改进**LLM 面对的问题**。减少选项数 = 降低任务难度 = 提高准确率，这个想法极其简单但有效

3. **CP-OPT 的巧妙**：把"预测集大小 vs 覆盖保证"的 trade-off 变成一个可微的优化问题，用 SGD 求解。这是共形预测从"统计方法"走向"学习方法"的关键一步

4. **和 Prompt Engineering 的关系**：CROQ 可以看作是**自动化的 prompt rewriting**——不是人工写 "Let's think step by step"，而是用统计保证自动决定"先去掉这几个明显错的，再仔细看剩下的"

5. **适用范围广**：任何 LLM 做结构化决策的场景——选择题、工具选择、API 调用、多选问答——只要你能定义"选项"和"打分函数"，CROQ + CP-OPT 就可以应用

## 延伸阅读

- **共形预测入门**：Angelopoulos & Bates, "A Gentle Introduction to Conformal Prediction and Distribution-Free Uncertainty Quantification" (2023) — 零基础也能读懂，带 Jupyter Notebook
- **MAPIE 库**：scikit-learn-contrib 的共形预测库 — `pip install mapie`，直接套在 sklearn 模型上
- **crepes 库**：另一个轻量共形预测库，支持 hinge/margin 等多种非一致性分数
- **Awesome Conformal Prediction**：GitHub valeman/awesome-conformal-prediction — 论文、代码、教程的精选列表

## 关联

- **三门问题（Monty Hall）**：论文的核心类比——条件概率更新后重新选择
- **Prompt Engineering**：CROQ 本质是自动化的 prompt rewriting
- **Uncertainty Quantification**：共形预测是 UQ 领域中唯一提供 "distribution-free finite-sample guarantee" 的方法
- **Calibration**：和 Platt scaling、temperature scaling 等同属模型校准范畴，但共形预测的保证更强（不依赖假设）
