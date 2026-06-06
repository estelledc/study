---
title: k-匿名 — 发布数据时让攻击者无法锁定你是谁
来源: 'Latanya Sweeney, "k-Anonymity: A Model for Protecting Privacy", IJUFKS 2002'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 初级
---

## 是什么

k-匿名（k-Anonymity）是一种**发布数据前的保护规则**：在一张表里，任何一行记录至少和另外 k-1 行"长得一样"，让攻击者就算拿到外部信息也没法把你从人群里认出来。

日常类比：想象学校把成绩单贴在走廊，但每个分数段至少有 k 个人，外人无法知道"89 分"这一行写的到底是你还是班里另外几个人。

Sweeney 在 2002 年正式提出这个模型，并做了一个令人震惊的实验：用美国人口普查数据的**5 位邮编 + 出生日期 + 性别**三个字段组合，可以在美国选民登记数据里唯一定位出 87% 的美国人。医院以为"去掉姓名就匿名了"，但结合这三个"准标识符"（quasi-identifier），病历仍能被一一还原。k-匿名就是为了堵住这个洞。

实现方式有两种：**泛化**（把"1980-03-15"变成"1980 年代出生"）和**抑制**（直接删掉该行或该字段），两者结合使数据集中每个等价类至少含 k 条记录。

## 为什么重要

不理解 k-匿名，这些事都没法解释：

- 为什么医院把病历"脱敏"后公开，还是可能被人肉出特定病人
- 为什么 GDPR 第 89 条和各国数据保护法把"匿名化"作为豁免条件，却对"匿名化的定义"极度谨慎
- 为什么差分隐私（Differential Privacy）会在 2006 年出现——正是因为 k-匿名有致命弱点没解决
- 为什么数据共享、医学研究、联邦学习里的隐私保证都需要一套形式化模型做基线

## 核心要点

1. **准标识符（Quasi-Identifier，QI）**：不是唯一 ID，但组合起来就能识别个人的字段集合。比如邮编、年龄、性别单独看没问题，拼在一起就成了精准定位器。选哪些字段是 QI，是整个方案最主观也最关键的决策，没有"正确答案"，需要对攻击者知识建模。

2. **等价类（Equivalence Class）**：把所有 QI 字段值相同的行归为一组。k-匿名要求每个等价类的大小 ≥ k。k 越大隐私保护越强，但数据信息损失也越大——这就是经典的**隐私-效用权衡**（privacy-utility tradeoff）。泛化层级（generalization hierarchy）定义了"怎么把精确值变成宽泛值"，类似一棵决策树：1980-03-15 → 1980年3月 → 1980年代 → 1980-1990年代。

3. **再识别攻击（Re-identification Attack）**：攻击者手里有两张表——一张是发布的"匿名"数据，另一张是来自其他渠道的背景知识（如选民登记）。把两张表按 QI 字段联表（join）就能还原身份。Sweeney 把这个过程称为"联结攻击"（linkage attack）。k-匿名的核心目标就是让这个 join 结果不唯一——攻击者顶多能圈出 k 个候选人，但不能确认是哪一个。

## 实践案例

### 案例 1：检验一张表是否满足 k=3

```python
import pandas as pd
from itertools import combinations

def check_k_anonymity(df, quasi_identifiers, k):
    """检查数据集是否满足 k-匿名：所有等价类大小 >= k"""
    groups = df.groupby(quasi_identifiers).size().reset_index(name='count')
    violations = groups[groups['count'] < k]
    if violations.empty:
        print(f"满足 {k}-匿名：所有等价类大小 >= {k}")
        return True
    else:
        print(f"不满足 {k}-匿名，违规等价类：")
        print(violations)
        return False

# 示例数据
data = {
    'zip':    ['13053', '13053', '13053', '13068', '13068'],
    'age':    [28, 29, 28, 35, 36],
    'gender': ['M', 'M', 'M', 'F', 'F'],
    'disease':['flu', 'cold', 'flu', 'cancer', 'flu']
}
df = pd.DataFrame(data)
qi = ['zip', 'age', 'gender']

check_k_anonymity(df, qi, k=3)
# 不满足 3-匿名：{'zip':'13068', 'age': 35/36, 'gender':'F'} 各只有 1 条
```

**逐步解释**：

- `groupby(quasi_identifiers)` 把 QI 字段相同的行分到同一等价类
- `size() < k` 找出"人太少、可能被识别"的组
- 修复方法：把 age 泛化为年龄段（28→20-30）让更多行落入同一组

### 案例 2：用泛化把数据集变成 2-匿名

```python
def generalize_age(age):
    """把年龄泛化到 10 年区间"""
    lower = (age // 10) * 10
    return f"{lower}-{lower+9}"

df['age_gen'] = df['age'].apply(generalize_age)
df['zip_gen'] = df['zip'].str[:3] + '**'   # 邮编只保留前 3 位

qi_gen = ['zip_gen', 'age_gen', 'gender']
check_k_anonymity(df, qi_gen, k=2)
# 泛化后：zip_gen='130**', age_gen='20-29' 的有 3 行，满足 2-匿名
```

泛化带来的代价：原本能知道"患者住在 13053、28 岁"，现在只知道"住在 130** 区域、20-29 岁"——信息损失了，但隐私也保住了。

### 案例 3：GDPR 场景下的匿名化评估

```python
def assess_re_identification_risk(df, qi_cols, k_threshold=5):
    """
    评估数据集的再识别风险
    返回：风险指标字典
    """
    groups = df.groupby(qi_cols).size()
    
    unique_records = (groups == 1).sum()        # 完全唯一（最高风险）
    low_k_records = (groups < k_threshold).sum() # k < 5 的等价类数量
    total_groups = len(groups)
    
    risk_score = unique_records / len(df)       # 唯一记录占比
    
    return {
        'total_records': len(df),
        'equivalence_classes': total_groups,
        'unique_classes': unique_records,
        'risk_score': round(risk_score, 3),
        'gdpr_compliant_estimate': risk_score < 0.05  # 欧盟工作组 5% 门槛
    }
```

**应用场景**：医院在向第三方分享病历前，先用这个函数测风险分数；若 `risk_score > 0.05`，则继续泛化或抑制，直到满足要求后再发布。

## 踩过的坑

1. **同质性攻击（Homogeneity Attack）**：一个等价类里所有 k 条记录的**敏感字段值完全相同**（比如 k=3 的一组，全都是"癌症"），攻击者虽然不知道是哪一个人，但可以确定"这组里的人都有癌症"——k-匿名没有保护敏感属性的分布，只保护了身份。l-多样性（l-diversity）就是为了解决这个问题。

2. **背景知识攻击（Background Knowledge Attack）**：攻击者知道"张三不可能患心脏病（他是素食主义者）"，即使张三落在一个 k=3 的等价类里，攻击者仍能缩小范围。k-匿名模型假设攻击者只有 QI 知识，这个假设在实践中很容易被打破。

3. **维度灾难**：QI 字段越多，等价类越碎，几乎每个人都唯一——k-匿名要求就算有 20 个维度也能满足，但代价是要把数据泛化到几乎无用的粒度。高维稀疏数据场景下，k-匿名无法作为唯一防护手段。

4. **最优 k-匿名是 NP-hard 问题**：在最小化信息损失的前提下找到满足 k 的最优泛化方案，已被证明是 NP-hard。实践中用 Datafly、Mondrian、Incognito 等启发式算法近似求解，但并非最优。

## 适用 vs 不适用场景

**适用**：
- 向外部共享医疗、人口普查等结构化表格数据时的基础检查
- 监管要求"匿名化"豁免（GDPR 第 89 条、HIPAA Safe Harbor）时的合规文档依据
- 字段数量较少（≤ 10 个 QI）、数据量较大的发布场景
- 与差分隐私联合使用：先 k-匿名降低直接识别风险，再加噪声抵御统计攻击

**不适用**：
- 高维数据（用户行为日志、基因数据）：维度灾难使 k-匿名形同虚设
- 需要精确分析的场景：泛化会破坏统计准确性（平均年龄从 28 变成 20-30）
- 动态更新的数据集：新加一行可能打破已有等价类，需要增量重计算
- 对手拥有丰富背景知识的场景：应直接使用差分隐私（[[dwork-calibrating-noise-2006]]）

## 历史小故事（可跳过）

- **1997 年**：Sweeney 在 MIT 读博，看到马萨诸塞州保险委员会发布的"匿名"医院记录，她只花了 20 美元买了选民登记名单，再用邮编 + 生日 + 性别联表，成功找到了时任州长 William Weld 的病历。这次演示引爆了学界。
- **1998-2001 年**：Sweeney 在博士论文中将这种攻击形式化，提出"准标识符"概念，并发现 87% 的美国人可被三字段唯一识别——这个数字后来被反复引用，直接推动美国 HIPAA 法规收紧。
- **2002 年**：论文正式发表在 IJUFKS，k-匿名成为隐私保护数据发布（PPDP）领域的奠基性框架，催生了后续 Datafly、mu-Argus、k-Similar 等系统。
- **2006 年**：Machanavajjhala 等人指出同质性攻击，提出 l-多样性；同年 Dwork 提出差分隐私，提供了信息论意义上更强的保证。
- **GDPR 时代（2018-至今）**：k-匿名仍是数据脱敏合规的基线参考，但监管机构通常要求和差分隐私等技术结合使用，不再接受单独的 k-匿名作为充分保护。

## 学到什么

1. **去掉名字 ≠ 匿名**：准标识符的联结攻击证明，"匿名"必须是形式化定义的属性，而不是"看起来没有姓名"的直觉判断
2. **k-匿名只保护身份，不保护属性**：如果需要保护敏感字段的分布，k-匿名是不够的，l-多样性和 t-closeness 是后继改进
3. **隐私-效用权衡无法消除**：k 越大数据越安全，但信息损失越多；选 k 是业务决策，不是技术决策
4. **形式化模型的力量**：Sweeney 把"匿名化"变成可量化、可验证的数学定义，这才让后续的攻击分析和改进成为可能——模糊的目标无法被严格保护，也无法被严格攻破

## 延伸阅读

- 论文 PDF：[Sweeney 2002 原文](https://dataprivacylab.org/dataprivacy/projects/kanonymity/kanonymity.pdf)（14 页，第 2-3 节是核心定义）
- 演讲：[Latanya Sweeney — Data Privacy Lab 讲座](https://www.youtube.com/watch?v=l6qxS3h5Jqg)（演示再识别攻击全过程）
- 后继工作：[[dwork-calibrating-noise-2006]] —— 差分隐私，从信息论角度提供更强保证
- 后继工作：[[abadi-dpsgd-2016]] —— 差分隐私梯度下降，机器学习场景的隐私保护
- 扩展阅读：Machanavajjhala et al., "l-Diversity: Privacy Beyond k-Anonymity", ICDE 2006

## 关联

- [[dwork-calibrating-noise-2006]] —— 差分隐私的诞生，直接回应了 k-匿名的不足；两者是匿名化技术演进的前后关系
- [[abadi-dpsgd-2016]] —— 将差分隐私引入深度学习训练，是 k-匿名思想在 ML 场景的延伸
- [[codd-1970]] —— 关系模型的奠基，k-匿名的等价类定义直接依赖关系代数中的投影与分组操作
- [[fielding-rest-2000]] —— REST API 设计中数据最小化原则与 k-匿名的发布者视角相呼应
- [[cook-levin]] —— NP 完全性定理：最优 k-匿名被证明是 NP-hard 的理论根基

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
