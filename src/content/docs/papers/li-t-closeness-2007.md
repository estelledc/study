---
title: Li t-closeness 2007 — 用整体分布约束匿名分组
来源: 'Ninghui Li, Tiancheng Li, and Suresh Venkatasubramanian, "t-Closeness: Privacy Beyond k-Anonymity and l-Diversity", ICDE 2007'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

t-closeness 是一种发布表格数据前的匿名化要求：每个匿名分组里的敏感属性分布，必须和全表的敏感属性分布足够接近。

日常类比：像老师公布全班成绩时，不只把姓名遮住，还要避免某个小组一看就全是低分或全是高分。
如果全班高分率是 10%，某个被匿名的小组却有 80% 高分，别人虽然不知道具体是谁，也会对组里每个人产生很强判断。

k-anonymity 主要管“这条记录像不像至少 k 个人”，l-diversity 继续管“组里敏感值够不够多样”。
t-closeness 再往前走一步：组里不是只要“多样”，还要和总体分布“像”。

这篇论文的核心问题是：只数种类不够，因为敏感值有稀有程度，也有语义距离。
所以作者用 Earth Mover Distance（EMD）衡量两个分布相差多远。

## 为什么重要

不理解 t-closeness，下面这些事很难解释：

- 为什么 k-anonymity 把姓名、邮编、年龄都泛化后，仍然可能让人推断出疾病或收入。
- 为什么 l-diversity 说“每组有 3 种病”仍然不够，因为这 3 种病可能都属于同一类。
- 为什么“50% 阳性”在普通病和罕见病里不是同一件事：总体基线不同，泄漏风险不同。
- 为什么匿名化最终会撞上差分隐私：前者保护发布后的表，后者保护“加入某个人”带来的信息增量。

## 核心要点

1. **先承认总体分布会被释放**：只要你发布数据，全表里疾病、收入、职业的大致比例就会被看见。类比：公布菜市场价格表，大家自然会知道总体均价。

2. **再限制每个分组的额外信息**：观察者知道某人落在哪个匿名组后，不应比看总体分布多学太多。类比：知道同桌在“第三排”不该让你几乎猜中他的成绩。

3. **用 EMD 表达“差得远不远”**：把一个分布搬成另一个分布，搬得越远、搬得越多，距离越大。类比：把一堆土填到一排坑里，最少搬运工作量就是两个形状的距离。

## 实践案例

### 案例 1：l-diversity 为什么挡不住偏度攻击

```python
overall = {"positive": 0.01, "negative": 0.99}
group = {"positive": 0.50, "negative": 0.50}

print(len([v for v in group.values() if v > 0]))  # 2 种值，满足 2-diversity
print(group["positive"] / overall["positive"])    # 风险被放大 50 倍
```

逐部分解释：

- `overall` 是全体人群的基线：阳性只有 1%。
- `group` 是某个匿名分组：阳性变成 50%。
- l-diversity 只看到“有阳性也有阴性”，却没看到“阳性概率从 1% 跳到 50%”。

### 案例 2：用一个简化 EMD 看收入分布

```python
def ordered_emd(p, q):
    carry = 0
    work = 0
    for a, b in zip(p[:-1], q[:-1]):
        carry += a - b
        work += abs(carry)
    return work / (len(p) - 1)

overall = [1/9] * 9              # 3K 到 11K 大致均匀
low_group = [1/3, 1/3, 1/3] + [0] * 6
print(round(ordered_emd(low_group, overall), 3))
```

逐部分解释：

- `overall` 表示全表收入从 3K 到 11K 都有。
- `low_group` 表示某个组只落在 3K、4K、5K。
- `ordered_emd` 会惩罚“都挤在低收入端”的情况，因为质量要搬很远才像总体分布。

### 案例 3：把 t-closeness 当作发布前检查

```python
def is_t_close(group_dist, total_dist, t):
    distance = ordered_emd(group_dist, total_dist)
    return distance <= t, distance

ok, distance = is_t_close(low_group, overall, t=0.2)
print(ok, round(distance, 3))  # False，说明这个组太不像总体
```

逐部分解释：

- `t` 是隐私阈值：越小越严格，数据越难保留细节。
- `distance <= t` 才允许发布这个匿名分组。
- 这不是“完全安全”，而是把每个分组带来的额外推断限制在一个可控范围里。

## 踩过的坑

1. **把 t-closeness 当成 k-anonymity 的替代品**：它主要防属性泄漏，不负责保证每条记录像至少 k 个人，所以常要和 k-anonymity 一起用。

2. **以为 l-diversity 的“种类多”就等于安全**：种类多但都很相似时，攻击者仍然能学到“都是胃部疾病”这类语义信息。

3. **随便选距离函数**：如果距离函数不懂收入顺序或疾病层级，3K 和 11K、感冒和胃癌都会被当成普通不同值，风险判断会失真。

4. **把 t 调得越小越好**：t 越小，分组越要像总体，隐私更强但数据效用下降；过小会让发布结果几乎只剩粗粒度统计。

## 适用 vs 不适用场景

**适用**：

- 医疗、人口普查、工资表这类“行对应个人、列有敏感属性”的微数据发布。
- 已经用泛化和抑制做 k-anonymity，但还担心属性泄漏的场景。
- 敏感值有顺序或层级语义，例如收入区间、疾病类别、职业类别。

**不适用**：

- 需要交互式查询保护的系统；这更接近差分隐私的使用场景。
- 攻击者能把匿名组和外部明细表强行对齐的高关联场景；t-closeness 不能独自解决身份重识别。
- 多个敏感属性强相关时，单独检查每列可能不够；联合分布的距离会更复杂。
- 希望得到数学上可组合隐私预算的场景；t-closeness 没有差分隐私那种组合定理。

## 历史小故事（可跳过）

- **1998-2002 年**：Samarati 和 Sweeney 推动 k-anonymity，核心是用泛化和抑制让每条记录“混在人群里”。
- **2006 年**：l-diversity 指出 k-anonymity 只能挡身份链接，挡不住同质性攻击和背景知识攻击。
- **2007 年**：Li、Li、Venkatasubramanian 在 ICDE 提出 t-closeness，把“组内分布接近总体分布”变成正式要求。
- **同一时期**：差分隐私也在成形，两条路线开始分叉：匿名化发布表格 vs 限制任意个体对输出的影响。
- **后来**：t-closeness 常被放进隐私保护数据发布教材，作为 k-anonymity 到差分隐私之间的重要过渡。

## 学到什么

- 匿名化的风险不是“有没有名字”这么简单，而是观察者看完数据后多学到了多少关于某个人的东西。
- l-diversity 的缺口在于只数敏感值的多样性，不看总体基线，也不看值之间的语义距离。
- EMD 的价值是把“都在低收入端”“都是胃部疾病”这类语义相近性纳入距离。
- t-closeness 很适合解释匿名化模型的天花板：它努力修补发布表格，但仍没有差分隐私的组合保证。

## 延伸阅读

- 论文 PDF：[Li-Li-Venkatasubramanian 2007 t-Closeness](https://www.cs.purdue.edu/homes/ninghui/papers/t_closeness_icde07.pdf)。
- [[sweeney-k-anonymity-2002]] —— 先理解“等价类”和“准标识符”，再看 t-closeness 会轻松很多。
- [[machanavajjhala-l-diversity-2007]] —— t-closeness 直接回应 l-diversity 的偏度攻击和相似性攻击。
- [[dwork-dp-icalp-2006]] —— 差分隐私从另一个角度定义“个体加入数据集到底泄漏多少”。
- [[dwork-calibrating-noise-2006]] —— 用噪声校准敏感度，是理解匿名化局限后的下一站。
- [[privacy-preserving-data-publishing-2010]] —— 后续综述，把 k-anonymity、l-diversity、t-closeness 放进 PPDP 全景。

## 关联

- [[sweeney-k-anonymity-2002]] —— t-closeness 仍建立在等价类和准标识符这套语言上。
- [[machanavajjhala-l-diversity-2007]] —— 这篇论文的主要靶子就是 l-diversity 的不足。
- [[dwork-dp-icalp-2006]] —— 两者都在限制信息增量，但差分隐私不依赖固定发布表。
- [[dwork-calibrating-noise-2006]] —— 噪声机制给出比匿名化更可组合的隐私水位。
- [[dwork-our-data-ourselves-2006]] —— 从“发布数据”转向“保护参与者”的思想背景。
- [[mironov-renyi-dp-2017]] —— 展示差分隐私后来如何细化隐私损失度量。
- [[abadi-dpsgd-2016]] —— 机器学习里的隐私保护继承了差分隐私路线，而不是表格匿名化路线。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
