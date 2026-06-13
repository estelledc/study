---
title: Fair Division and Allocation: Algorithms and Theory
来源: https://arxiv.org/abs/2401.00054
日期: 2026-06-13
分类: 其他
子分类: economics-game-theory
provenance: pipeline-v3
---

# 公平分配与资源调配：算法与理论

## 从切蛋糕开始

想象你和两个朋友买了一个蛋糕，要把它公平地分成三份。什么是"公平"？直观上，每个人都觉得自己拿到的那块不小于是总蛋糕的三分之一，这就是公平分配要解决的核心问题。

公平分配（Fair Division）研究的是：**如何在多个参与者之间分配有限资源，使得每个人都感到满意**。它不只是切蛋糕——它还适用于：

- 两个创业伙伴如何分配公司股份
- 多个团队如何共享一台高性能服务器
- 国际河流如何在上下游国家之间分配水量
- 器官移植时如何在等候名单上分配肾源

## 核心概念

### 1. 公平性标准

算法设计者定义了三种逐级增强的公平性标准：

**比例性（Proportionality）**：如果有 n 个人，每个人至少觉得自己拿到了一份之 n。这是最低的公平底线。

**恩维性（Envy-freeness）**：每个人觉得自己的那份至少和别人的同样好。比比例性更强——你不光觉得自己拿得够多，而且不嫉妒别人的那份。

**恩维性加上公平份额（EF1）**：针对离散物品（不能分割的），完美的恩维性可能做不到。EF1 是说：如果去掉某个嫉妒对象的一件物品，你就不会嫉妒了。

### 2. 关键性质

一个公平的分配算法还应该：

- **高效性**：不要浪费资源（帕累托最优）
- **策略证明**：你说了真实偏好不会吃亏
- **计算可行**：算法能在合理时间内完成

## 经典算法

### 算法一：分割与选择（Divide and Choose）

最古老的算法，两人分一份连续资源（如蛋糕）。一人切，另一人选。

切的人为了保证自己不吃亏，一定会切成两份他认为相等的。选的人自然选自己觉得更大的。

扩展到三人？用斯通-塔克伯（Steinhaus-Tucker）的"移动蛋糕"方法，或者更实用的——**最后削减者选择（Last Diminisher）**。

### 算法二：调整赢者（Adjusted Winner Procedure）

由博弈论家布鲁斯·莱德伯曼（Bruce Leinerman）在 1984 年提出。

两人各得 100 个点，分配给多个物品。各自给每个物品打分。然后通过调整谁得到什么来达到"恩维性 + 帕累托最优"。

## 代码示例

### 示例一：分割与选择（两人）

```python
def divide_and_choose(divider_pref, chooser_pref, item_values):
    """
    分割与选择算法
    divider_pref: 切蛋糕者的偏好（对每个物品的估值列表）
    chooser_pref: 选蛋糕者的偏好
    item_values: 物品的价值列表
    
    返回: 两个参与者各自得到的物品
    """
    n = len(item_values)
    
    # 切蛋糕的人把物品分成两份，使得自己觉得价值相等
    # 这里用简化版：从头累加直到达到一半
    mid = n // 2
    pile_a = list(range(0, mid))
    pile_b = list(range(mid, n))
    
    total_a = sum(item_values[i] for i in pile_a)
    total_b = sum(item_values[i] for i in pile_b)
    
    # 选的人选自己觉得价值更大的
    chosen_value_a = sum(chooser_pref[i] for i in pile_a)
    chosen_value_b = sum(chooser_pref[i] for i in pile_b)
    
    if chosen_value_a >= chosen_value_b:
        return {"divider": pile_b, "chooser": pile_a}
    else:
        return {"divider": pile_a, "chooser": pile_b}


# 使用示例
items_value = [30, 20, 25, 25]  # 蛋糕四块
divider_pref = [30, 20, 25, 25]
chooser_pref = [20, 30, 25, 25]

result = divide_and_choose(divider_pref, chooser_pref, items_value)
print(f"切的人得到: {result['divider']}")
print(f"选的人得到: {result['chooser']}")
```

### 示例二：比例性分配（三人，切割法）

```python
import random

def fair_cake_cutting_three(players, cake_length=100):
    """
    三人的比例性分配（自依赖切割法 Self-Cut and Select）
    
    players: 参与者的偏好列表，每个偏好是一个长度为 cake_length 的数组
             表示在每个位置的价值密度
    
    返回: 三个人各自得到的蛋糕区间
    """
    # 第一个人把蛋糕切成三份，自己觉得相等
    # 简化：均匀切（真实场景中应根据偏好切割）
    third = cake_length // 3
    cuts = [third, 2 * third]
    
    # 每个人标注自己在每份中的感受
    for i, player in enumerate(players):
        shares = []
        shares.append(sum(player[0:cuts[0]]))
        shares.append(sum(player[cuts[0]:cuts[1]]))
        shares.append(sum(player[cuts[1]:]))
        print(f"  玩家{i+1} 觉得三份价值: {shares}")
    
    # 第二个人调整：如果他觉得某份太小，可以切小块给第三个人
    # 简化版：直接按顺序分配（实际算法更复杂）
    allocation = [
        (0, cuts[0]),
        (cuts[0], cuts[1]),
        (cuts[1], cake_length)
    ]
    return allocation


# 使用示例
player1 = [1] * 100    # 均匀偏好
player2 = [1, 2, 1] * 33 + [1]  # 中间偏好高
player3 = [2, 1, 1] * 33 + [2]  # 前面偏好高

players = [player1, player2, player3]
print("三人公平分蛋糕：")
result = fair_cake_cutting_three(players)
for i, (start, end) in enumerate(result):
    print(f"  玩家{i+1} 得到区间 [{start}, {end})")
```

### 示例三：加权比例分配（服务器资源）

```python
def weighted_proportional_share(resources, weights, demand):
    """
    加权比例分配：当参与者有权重时（如团队大小不同）
    
    resources: 总资源量（如 CPU 核心数）
    weights: 每个参与者的权重
    demand: 每个参与者的实际需求
    
    返回: 每个人分配到的资源量
    """
    total_weight = sum(weights)
    
    allocated = []
    for i, w in enumerate(weights):
        # 按比例 + 满足需求的调和分配
        fair_share = (w / total_weight) * resources
        allocated.append(min(fair_share, demand[i]))
    
    # 如果超分配了，按比例缩减
    total_allocated = sum(allocated)
    if total_allocated > resources:
        scale = resources / total_allocated
        allocated = [a * scale for a in allocated]
    
    return allocated


# 使用示例
cpu_cores = 32
team_weights = [3, 2, 1]   # 三个团队权重 3:2:1
team_demand = [20, 15, 10] # 各自的 CPU 需求

result = weighted_proportional_share(cpu_cores, team_weights, team_demand)
for i, share in enumerate(result):
    print(f"  团队{i+1}: {share:.1f} 核 (权重 {team_weights[i]}, 需求 {team_demand[i]})")
```

## 为什么这很重要

公平分配不是一个纯理论游戏。它的算法每天都在使用：

- **云资源调度**：AWS、阿里云在多个租户之间分配计算资源
- **频谱拍卖**：各国政府如何把无线电频谱分配给电信运营商
- **课堂时间分配**：多个班级如何公平使用体育馆和实验室
- **离婚财产分割**：通过算法减少情感冲突

## 总结

| 公平标准 | 含义 | 难度 |
|---|---|---|
| 比例性 | 每人至少 1/n | 低 |
| 恩维性 | 不嫉妒任何人 | 中 |
| EF1 | 拿走一件物品后不嫉妒 | 中 |

公平分配理论告诉我们：公平不是模糊的主观感受，而是可以用数学严格定义、用算法精确实现的目标。
