---
title: 差分隐私（Differential Privacy）学习笔记
来源: https://link.springer.com/chapter/10.1007/11681878_14
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# 差分隐私（Differential Privacy）学习笔记

## 论文信息

- 标题：Calibrating Noise to Sensitivity in Private Data Analysis
- 作者：Cynthia Dwork, Frank McSherry, Kobbi Nissim, Adam Smith
- 发表：TCC 2006, Lecture Notes in Computer Science, vol 3876, pp 265-284
- DOI: 10.1007/11681878_14

---

## 一、什么是差分隐私？（从日常类比开始）

### 1.1 鸡尾酒会的类比

想象你在一个鸡尾酒会上。主持人要统计"有多少人喜欢喝红酒"。

最简单的做法：每个人举手说"喜欢"或"不喜欢"，然后主持人数一数。

问题来了：如果你其实不喜欢红酒，但看到大家都举手了，你怎么办？你是如实说"不喜欢"，还是也跟着举手以"融入群体"？

差分隐私的做法是：**给每个回答加一点随机性。**

主持人给每个人发一张纸条，上面写着：

- 有 50% 的概率如实回答（喜欢/不喜欢）
- 有 50% 的概率抛硬币决定——正面就说"喜欢"，反面就说"不喜欢"

这样，即使有人看到你说"喜欢"，他也无法确定你是真的喜欢红酒，还是刚好抛到了正面。

对单个人的保护：别人很难从你的回答推断你的真实偏好。

对整体统计的保护：因为很多人参与了，随机噪声会相互抵消，主持人依然能大概估算出喜欢红酒的人数比例。

**这就是差分隐私的核心思想——用可控的随机噪声，保护个体的隐私，同时保持统计结果的有效。**

---

## 二、核心概念

### 2.1 为什么需要差分隐私？

在差分隐私出现之前，保护隐私的主流方法是 k-匿名（k-anonymity）。

k-匿名说："如果你的记录和另外 k-1 个人的记录长得一样，你的隐私就安全了。"

但这有个致命问题：攻击者如果知道一些额外的信息（比如"Jason 住在某栋楼、30 岁、是程序员"），即使数据做了 k-匿名处理，也能从"看起来一样的记录"中把 Jason 单独揪出来。这就是"链接攻击"。

差分隐私的强大之处：**它的保护不依赖于攻击者知道什么。** 无论攻击者掌握多少背景信息，差分隐私都保证——无论该人是否在数据库中，查询结果几乎不会改变。

### 2.2 形式化定义（ε-差分隐私）

一个随机化算法 M 满足 ε-差分隐私，如果对于所有可能的输出集合 S，以及所有相邻数据库 D1 和 D2（相邻意味着只有一行数据不同），都有：

    Pr[M(D1) ∈ S] ≤ exp(ε) × Pr[M(D2) ∈ S]

翻译成中文：

- "相邻数据库"：两个数据库只有一个用户的记录不同（比如 Jason 在或不在）。
- "ε（隐私预算）"：ε 越小，隐私保护越强。ε = 0 表示完全噪声，没有任何有用信息；ε 越大，噪声越小，但隐私越差。
- 实际应用中，ε 通常取 0.1 到 10 之间的值。

直观理解：**加了噪声后，无论 Jason 是否在数据库里，查询结果看起来几乎一样。攻击者无法区分。**

### 2.3 灵敏度（Sensitivity）

论文的关键贡献之一：**噪声的量应该根据查询的"灵敏度"来校准。**

灵敏度定义了：当数据库里的一行数据发生变化时，查询结果最大能改变多少。

举个例子：

- 查询"数据库中所有人的年龄之和"。
- 如果每个人的年龄在 0-100 之间，那么删掉一个人最多改变 100。
- 所以，这个查询的灵敏度 Δf = 100。

灵敏度越高，需要的噪声就越多。

### 2.4 Laplace 机制

论文提出了最著名的差分隐私机制：**Laplace 机制**。

做法很简单：给真实答案加上一个服从 Laplace 分布的随机噪声。

噪声的尺度 = 灵敏度 / ε

Laplace 分布像一个尖顶的钟形曲线，中间高、两边低——噪声值靠近 0 的概率大，远离 0 的概率小。

---

## 三、代码示例

### 3.1 示例 1：带噪声的平均工资查询

假设有一个员工数据库，我们想查询平均薪资，但不想暴露任何人的工资。

```python
import numpy as np

# 模拟一个数据库（每个员工的名字和工资）
employees = [
    {"name": "Alice", "salary": 80000},
    {"name": "Bob", "salary": 95000},
    {"name": "Charlie", "salary": 70000},
    {"name": "Diana", "salary": 110000},
]

def average_salary(database):
    """真实平均工资"""
    total = sum(e["salary"] for e in database)
    return total / len(database)

def laplace_noise(sensitivity, epsilon):
    """从 Laplace 分布采样噪声"""
    scale = sensitivity / epsilon
    return np.random.laplace(0, scale)

def private_average_salary(database, epsilon=1.0):
    """差分隐私保护的工资查询"""
    n = len(database)
    # 灵敏度：修改一个人的工资，总和最多改变 max_salary - min_salary
    # 平均值 = 总和 / n，所以灵敏度的上界 = (max - min) / n
    salary_range = 150000  # 假设工资在 0-150000 之间
    sensitivity = salary_range / n
    true_avg = average_salary(database)
    noise = laplace_noise(sensitivity, epsilon)
    return true_avg + noise

# 执行查询
true_avg = average_salary(employees)
private_avg = private_average_salary(employees, epsilon=1.0)

print(f"真实平均工资: {true_avg:.2f}")
print(f"差分隐私查询结果: {private_avg:.2f}")
```

运行结果类似：

```
真实平均工资: 88750.00
差分隐私查询结果: 88612.43
```

可以看到，加了噪声后的结果依然接近真实值，但每个人的工资没有被直接暴露。

### 3.2 示例 2：带噪声的计数查询与隐私预算累积

差分隐私有一个重要性质：**组合性（Composition）**。

每做一次查询，就要消耗一部分隐私预算 ε。查得越多，ε 累积越大，隐私越差。

```python
def private_count(database, epsilon=1.0):
    """差分隐私保护的计数查询（统计工资 > 80000 的人数）"""
    true_count = sum(1 for e in database if e["salary"] > 80000)
    # 计数查询的灵敏度 = 1（删除一个人，最多改变 1 个计数）
    sensitivity = 1
    noise = laplace_noise(sensitivity, epsilon)
    # 计数不能是负数，所以用 max 钳制
    return max(0, int(round(true_count + noise)))

def private_sum(database, epsilon=1.0):
    """差分隐私保护的求和查询"""
    true_sum = sum(e["salary"] for e in database)
    # 求和查询的灵敏度 = max salary（一个人最多贡献 150000）
    sensitivity = 150000
    noise = laplace_noise(sensitivity, epsilon)
    return max(0, int(true_sum + noise))

# 多次查询，累积隐私预算
epsilon_per_query = 0.5
n_queries = 5

total_epsilon = 0
for i in range(n_queries):
    count = private_count(employees, epsilon=epsilon_per_query)
    total = private_sum(employees, epsilon=epsilon_per_query)
    total_epsilon += epsilon_per_query
    print(f"查询 {i+1}: 高收入人数={count}, 总薪资={total}, "
          f"累积预算 ε={total_epsilon:.1f}")
```

输出示例：

```
查询 1: 高收入人数=2, 总薪资=385104, 累积预算 ε=0.5
查询 2: 高收入人数=2, 总薪资=391278, 累积预算 ε=1.0
查询 3: 高收入人数=3, 总薪资=378952, 累积预算 ε=1.5
查询 4: 高收入人数=2, 总薪资=402165, 累积预算 ε=2.0
查询 5: 高收入人数=1, 总薪资=365043, 累积预算 ε=2.5
```

可以看到，每次查询的结果都有波动——这就是噪声在起作用。但更重要的是：**累积的 ε 在增长**。如果我们要做太多查询，隐私就会变得很差。这就是为什么差分隐私系统需要精心设计"预算分配"。

---

## 四、论文的核心贡献总结

1. **灵敏度校准框架**：把噪声添加到"根据查询函数的灵敏度来调整"，不再是之前那种对所有查询一刀切的方式。

2. **通用函数支持**：之前的工作主要处理"求和"这一种查询，这篇论文把它扩展到了"任何函数"。

3. **更少的噪声**：因为灵敏度校准，实际需要的噪声比之前理解的要少得多。这意味着在同样隐私水平下，数据更有用。

4. **互动 vs 非互动**：论文证明了交互式 sanitize（用户可以多次查询）比非交互式（只给一次清理后的数据集）更强——但这也意味着隐私预算消耗更快。

---

## 五、学习要点回顾

- 差分隐私 = 随机噪声 + 灵敏度校准
- ε 是隐私预算：越小越保护隐私，越大有用
- 灵敏度 = 一个人对查询结果的"最大影响"
- Laplace 机制是最经典的实现方式
- 组合性：查得越多，ε 累积越大，隐私越差
- 差分隐私不依赖攻击者的背景知识，这是它比 k-匿名更强的原因
