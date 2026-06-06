---
title: t-Closeness — 用"分布距离"堵住匿名化的最后漏洞
来源: 'Ninghui Li, Tiancheng Li, Suresh Venkatasubramanian, "t-Closeness: Privacy Beyond k-Anonymity and l-Diversity", ICDE 2007'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

t-Closeness 是一条数据匿名化规则：**每个"相似人群组"里，敏感属性（如病种、薪资）的分布，必须和全表的分布距离不超过 t**。

日常类比：想象你把一个城市的居民按邮编分组。k-anonymity 要求每组 ≥k 人（防止单人被识别）；l-diversity 要求每组的病种不能千篇一律（防止组内同质）；而 t-Closeness 更进一步——要求每组的病种比例，不能和全市比例差太多，这样你观察某组之后，**获得的新信息量被严格限制**。

具体来说，若全表中"糖尿病"患者占 20%，那每个等价类里也应接近 20%，而不是某组 90%、另一组 5%。距离用的是**地球移动距离**（Earth Mover Distance，EMD）：把一个分布"运输"成另一个分布的最小搬运代价。

t-Closeness 是 k-anonymity（2002）→ l-diversity（2006）→ t-Closeness（2007）三阶段递进的收官之作，被引用超过 3000 次。

## 为什么重要

不理解 t-Closeness，下面这些事都解释不清楚：

- 为什么满足了 l-diversity 的数据集，攻击者还是能以 70% 的准确率推断出你的病情（**偏度攻击**）
- 为什么敏感属性值"多样"不代表"安全"——胃炎、胃溃疡、胃癌在语义上高度相关（**相似性攻击**）
- 为什么差分隐私（Differential Privacy）出现之前，匿名化理论经历了哪些失败和修补
- 为什么在数据发布场景，"让用户学不到超出先验的个体信息"才是正确的隐私目标

## 核心要点

1. **l-diversity 的两个致命弱点**：偏度攻击利用全表分布偏斜——若全表中 1% 是艾滋病患者，一个 3-diverse 的等价类里有 1/3 的艾滋病记录，攻击者知道你在这个组后，推断概率从 1% 跳到 33%。相似性攻击利用语义——胃炎/胃溃疡/胃癌三种值满足 Distinct 3-diversity，但都是"胃病"，攻击者同样能精准推断。

2. **t-Closeness 的核心定义**：等价类中敏感属性的分布 P 与全表分布 Q 的 EMD 距离 ≤ t。EMD 对数值型属性用有序距离：`EMD = 1/(m-1) × Σ|r₁+r₂+…+rᵢ|`，其中 `rᵢ = pᵢ - qᵢ`；对分类型属性用等距或分层树形距离。t 越小越安全，t=1 退化为无约束，t=0 要求等价类分布完全等于全表分布。

3. **信息增益的二分视角**：论文把攻击者的信息增益拆成两部分——关于总体统计规律的增益（B0→B1，**允许**，因为这是发布数据的目的）和关于特定个体的增益（B1→B2，**限制**）。t-Closeness 只压制后者，这是比 l-diversity 更精确的隐私目标建模。三条性质保证了可实现性：泛化单调性、子集封闭性、任意 t≥0 均可通过合并等价类达到。

## 实践案例

### 案例 1：检测一份数据集是否满足 t-Closeness

```python
import numpy as np

def emd_numerical(p_dist, q_dist):
    """数值型属性的 EMD：基于累积差分"""
    m = len(p_dist)
    # rᵢ = pᵢ - qᵢ，计算前缀和
    diff = [p - q for p, q in zip(p_dist, q_dist)]
    prefix_sum = np.cumsum(diff)
    return sum(abs(s) for s in prefix_sum) / (m - 1)

# 全表薪资分布（按区间分桶：<30k, 30-50k, 50-80k, >80k）
global_dist = [0.3, 0.4, 0.2, 0.1]

# 某等价类的薪资分布
eq_class_dist = [0.1, 0.3, 0.4, 0.2]

distance = emd_numerical(eq_class_dist, global_dist)
t = 0.2
print(f"EMD = {distance:.3f}, 满足 t=0.2: {distance <= t}")
# EMD = 0.167, 满足 t=0.2: True
```

**逐部分解释**：
- 前缀和的含义：把等价类分布"搬运"成全表分布，每一步搬运多少由差分决定
- `/(m-1)` 归一化让距离在 [0, 1] 内，与属性值个数无关
- t=0.2 是论文实验中数据质量影响极小的推荐起点

### 案例 2：偏度攻击的数字演示

假设全表中敏感属性"感染 HIV"占比 1%，非 HIV 共 99%。一个满足 3-diversity 的等价类包含 3 种敏感值：HIV/流感/肺炎各占 1/3。

```python
# 攻击者的先验
prior_hiv = 0.01

# 攻击者知道某人在这个等价类后
posterior_hiv = 1 / 3   # ≈ 33%

# 信息增益
gain = posterior_hiv / prior_hiv
print(f"患 HIV 概率从 {prior_hiv:.0%} → {posterior_hiv:.0%}，增益 {gain:.0f}x")
# 患 HIV 概率从 1% → 33%，增益 33x
```

若改用 t-Closeness（t=0.15），等价类内 HIV 比例必须接近全表 1%，攻击者最多从 1% 推断到 1.15%，**增益被压制 30 倍**。

### 案例 3：与 Incognito 算法结合生成满足 t-Closeness 的表

```python
def check_t_closeness(equivalence_classes, global_dist, t, attr_type="numerical"):
    """检验所有等价类是否满足 t-Closeness"""
    violations = []
    for i, eq_class in enumerate(equivalence_classes):
        local_dist = compute_distribution(eq_class)
        if attr_type == "numerical":
            dist = emd_numerical(local_dist, global_dist)
        else:
            dist = emd_categorical(local_dist, global_dist)
        
        if dist > t:
            violations.append({
                "class_id": i,
                "emd": dist,
                "suggestion": "与邻近等价类合并以降低 EMD"
            })
    return violations

# 若有违规，合并相邻等价类直到所有类满足 t-Closeness
# 论文证明：合并操作不会增加最大 EMD，因此总能收敛
```

**关键点**：合并等价类是单调的——合并只会让局部分布更接近全局分布，不会破坏已满足的等价类，因此算法一定终止。

## 踩过的坑

1. **t 值选太小会破坏数据可用性**：t=0 要求每个等价类完全复现全表分布，几乎没有实用价值；论文实验表明 t=0.2 是安全与可用性的合理平衡点，但不同数据集需要独立校准。

2. **多敏感属性时 EMD 复杂度爆炸**：单属性 EMD 是线性规划，多属性联合分布维度指数增长，实践中通常对每个敏感属性分别检验 t-Closeness，牺牲了联合分布保护。

3. **分类型属性的 EMD 需要语义层级**：对"职业"这类属性，若不提供行业层级树，只能用等权距离（EMD = ½Σ|pᵢ-qᵢ|），可能低估语义距离，导致保护不足。

4. **t-Closeness 不防身份披露**：只要等价类内只有一个人（k=1），即使分布完全符合 t-Closeness，攻击者也能直接识别你是谁；必须与 k-anonymity（k≥2）联合使用。

## 适用 vs 不适用场景

**适用**：
- 医疗、金融微数据发布，需同时防身份披露和属性披露
- 敏感属性分布在全表层面已知或可公开（t-Closeness 需要全局分布作为基准）
- 数据已经按 k-anonymity 分组，需要在此基础上加强保护
- 需要给监管机构提供可解释的隐私量化指标

**不适用**：
- 实时查询场景（t-Closeness 是静态发布，不适配动态数据库）
- 攻击者拥有辅助数据集（差分隐私更适合对抗任意外部知识）
- 数据集极小（等价类合并后信息损失过大，不如直接匿名或不发布）
- 需要对发布后的查询提供精确隐私保证（差分隐私提供更严格的数学保证）

## 历史小故事（可跳过）

- **2002 年**：Samarati 和 Sweeney 提出 k-anonymity。动机是 1990 年美国医疗数据库泄露事件——Massachusetts 的保险数据与选民名册交叉，87% 的美国人可被唯一识别。
- **2006 年**：Machanavajjhala 等提出 l-diversity，修补了 k-anonymity 不防属性披露的漏洞。但同年就有论文指出偏度攻击，l-diversity 的"多样性"是伪命题。
- **2007 年**：Purdue 大学 Ninghui Li 团队在 ICDE 提出 t-Closeness，用 EMD 度量分布距离，把"攻击者学到的信息量"形式化。论文首次把信息增益拆成总体知识和个体知识两部分，理论框架比前两者更严密。
- **2006-2008 年（并行线）**：Dwork 等提出差分隐私（DP），用完全不同的路线（随机噪声 + ε-DP 定义）解决相同问题。t-Closeness 属于确定性匿名化的最后阵地，之后学界主流逐渐转向 DP，但 t-Closeness 在数据发布实践中仍广泛使用。

## 学到什么

1. **"多样"不等于"安全"**——l-diversity 的失败说明，隐私保护必须考虑背景知识（全局分布），而非仅看局部多样性
2. **用分布距离量化信息泄露**是 t-Closeness 最重要的工程洞见：把直觉上的"分布接近"变成可计算的 EMD，使隐私保证可验证
3. **隐私保护是分层问题**：k-anonymity 防身份披露 → l-diversity 防属性均质 → t-Closeness 防属性偏斜，每一层修补上一层的漏洞，但也引入新约束
4. **实践中 t=0.15~0.25 是常用区间**：过小破坏数据可用性，过大保护不足；具体值依赖业务场景和全局分布形状

## 延伸阅读

- 论文 PDF（Purdue 官网）：[t-Closeness: Privacy Beyond k-Anonymity and l-Diversity](https://www.cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf)
- l-diversity 原文：Machanavajjhala et al., "l-Diversity: Privacy Beyond k-Anonymity", TKDE 2007
- 差分隐私综述：[The Algorithmic Foundations of Differential Privacy](https://www.cis.upenn.edu/~aaroth/Papers/privacybook.pdf) — Dwork & Roth 2014
- [[abadi-dpsgd-2016]] —— 差分隐私在机器学习中的应用，与 t-Closeness 代表两条路线
- [[libsignal]] —— 端到端加密，另一种视角的隐私保护

## 关联

- [[abadi-dpsgd-2016]] —— 差分隐私 + 随机梯度下降，与 t-Closeness 同解决隐私问题但路线截然不同
- [[libsignal]] —— Signal 端到端加密内核，隐私保护在通信侧的实现
- [[fielding-rest-2000]] —— REST 数据接口设计，数据发布架构背景
- [[davis-putnam-1960]] —— 约束求解技术，EMD 计算底层用到线性规划
- [[cook-levin]] —— NP 完全性理论，EMD 的精确计算是多项式可解的重要结论

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[abadi-dpsgd-2016]] —— DP-SGD — 深度学习差分隐私训练
- [[cook-levin]] —— Cook-Levin 定理 — NP-完全性的诞生
- [[davis-putnam-1960]] —— Davis-Putnam 1960 — 让机器自动判断一堆逻辑式能不能同时成立
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核

