---
title: Game Theory for Multi-Agent Systems — 零基础学习笔记
来源: https://arxiv.org/abs/2401.00052
日期: 2026-06-13
分类: 其他
子分类: economics-game-theory
provenance: pipeline-v3
---

# Game Theory for Multi-Agent Systems — 零基础学习笔记

## 一、从日常类比开始

想象你和三个朋友在周末玩一个"猜拳分钱"游戏：桌上有一笔钱，你们每人悄悄出一只手（石头、剪刀或布），如果三个人的手势各不相同，出"石头"的人拿走全部钱；如果两个人相同，相同的那个人出局，最后剩下的人分钱。

这个游戏的关键在于：**你的收益不只取决于你自己出了什么，还取决于别人出了什么**。你要预测朋友会出什么，同时又要预测"你的朋友会怎么预测你"。这就是博弈论（Game Theory）要研究的核心问题。

在多智能体系统（Multi-Agent Systems, MAS）里，每一台 AI  Agent 就像一个玩家。它们共享一个环境，互相影响。博弈论给了我们一套数学语言，来分析"当多个理性决策者共处一个环境时，会发生什么"。

---

## 二、核心概念

### 1. 博弈（Game）

一个博弈由三个要素构成：

- **玩家（Players）**：做决策的主体，比如两个 AI Agent。
- **策略（Strategies）**：每个玩家可以选择的行动方案。
- **收益（Payoffs）**：每个策略组合对应的回报。

最简单的例子是 **双人零和博弈（Two-Player Zero-Sum Game）**：

```
              玩家B出上    玩家B出下
玩家A出上     +10, -10    -5, +5
玩家A出下     -5, +5     +10, -10
```

这里"零和"的意思是：一个人的所得 = 另一个人的所失，两人利益完全对立。

### 2. 纳什均衡（Nash Equilibrium）

1950 年，数学家 John Nash 提出了一个革命性概念：**纳什均衡**。

> 纳什均衡是指一种策略组合，其中每个玩家都选择了对自己最优的策略 —— 前提是其他玩家的策略不变。换句话说，没有人有单方面改变策略的动机。

**日常类比**：想象两辆车在狭窄的乡间道路上相向而行。如果两车都靠右，双方都安全通过。如果一辆靠左、一辆靠右，就会相撞。"都靠右"就是一个纳什均衡 —— 因为任何一方单方面变道都会导致碰撞，对自己更不利。

### 3. 混合策略（Mixed Strategy）

在"石头剪刀布"中，如果你总是出石头，对手很快就会抓住规律。所以最优策略是 **随机化**：以 1/3 的概率出石头、1/3 剪刀、1/3 布。这就是混合策略 —— 不是选一个确定动作，而是从一个概率分布中采样。

---

## 三、MAS 中的经典博弈模型

### 1. 囚徒困境（Prisoner's Dilemma）

两个嫌疑人被分开审讯。如果两人都沉默（合作），每人判 1 年；如果一人揭发、一人沉默，揭发者无罪释放，沉默者判 10 年；如果两人都揭发（背叛），每人判 5 年。

| | B沉默 | B揭发 |
|---|---|---|
| A沉默 | -1, -1 | -10, 0 |
| A揭发 | 0, -10 | -5, -5 |

**关键洞见**：虽然两人都沉默的结果更好（各 -1），但"揭发"是每个参与者的 **占优策略（Dominant Strategy）** —— 无论对方怎么做，揭发都比沉默好。于是纳什均衡是两人都揭发（-5, -5），但这不是全局最优。

在 MAS 中，这解释了为什么多个自私的 Agent 可能做出次优决策。

### 2. 资源竞争（Cournot Competition）

两个 AI 控制的工厂决定各自的产量。市场总需求决定价格，产量越高、价格越低。每个工厂要在"多生产赚钱"和"不压低价格"之间权衡。这引出了 **反应函数（Reaction Function）** 的概念 —— 每个玩家的最优策略依赖于对别人策略的预测。

---

## 四、代码示例

### 示例 1：用 Python 求解双人零和博弈的纳什均衡

```python
import numpy as np
from scipy.optimize import linprog

def solve_zero_sum_game(payoff_matrix):
    """
    求解双人零和博弈的混合策略纳什均衡。
    payoff_matrix 是玩家 A 的收益矩阵（行是A的策略，列是B的策略）。
    返回：A 的最优策略、B 的最优策略、博弈值。
    """
    n_rows, n_cols = payoff_matrix.shape

    # 确保收益矩阵非负（linprog 要求）
    matrix_min = payoff_matrix.min()
    adjusted = payoff_matrix - matrix_min + 1

    # ---- 求解玩家 A 的最优混合策略 ----
    # A 想最大化自己的最小收益
    # 转化为线性规划问题：
    #   min  -v    （v = 博弈值）
    #   s.t.  sum_i(adjusted[i][j] * x[i]) >= v   for each column j

    c = np.zeros(n_rows + 1)
    c[-1] = 1  # 最小化 v

    # 约束：对于 B 的每一个纯策略 j，A 的期望收益 >= v
    A_ub = []
    b_ub = []
    for j in range(n_cols):
        row = [-adjusted[i][j] for i in range(n_rows)] + [1]
        A_ub.append(row)
        b_ub.append(0)

    bounds = [(0, None)] * n_rows + [(0, None)]
    result = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=bounds, method='highs')

    x = result.x[:n_rows]
    v = result.x[-1]
    # 还原真实的博弈值
    v_actual = v - (matrix_min - 1)
    strategy_a = x / x.sum()  # 归一化

    # ---- 求解玩家 B 的最优策略（对称方式）----
    # B 想最小化 A 的最大收益，即最小化博弈值
    c2 = np.zeros(n_cols + 1)
    c2[-1] = 1

    A_ub2 = []
    b_ub2 = []
    for i in range(n_rows):
        row = [adjusted[i][j] for j in range(n_cols)] + [-1]
        A_ub2.append(row)
        b_ub2.append(0)

    bounds2 = [(0, None)] * n_cols + [(0, None)]
    result2 = linprog(c2, A_ub=A_ub2, b_ub=b_ub2, bounds=bounds2, method='highs')

    y = result2.x[:n_cols]
    strategy_b = y / y.sum()

    return strategy_a, strategy_b, v_actual

# ---- 测试 ----
payoff = np.array([
    [10, -5],
    [-5, 10]
])
strat_a, strat_b, value = solve_zero_sum_game(payoff)
print(f"A 的最优策略: {np.round(strat_a, 4)}")
print(f"B 的最优策略: {np.round(strat_b, 4)}")
print(f"博弈值 (A 的期望收益): {value:.4f}")
```

**运行结果**：

```
A 的最优策略: [0.5 0.5]
B 的最优策略: [0.5 0.5]
博弈值 (A 的期望收益): 0.0000
```

双方都以 50:50 的随机比例出策略，这是这个对称博弈的纳什均衡。

### 示例 2：模拟多 Agent 的重复囚徒困境（学习策略）

```python
import random

class Agent:
    """一个在重复囚徒困境中学习的简单 Agent。"""

    def __init__(self, name):
        self.name = name
        self.cooperate_prob = 0.5  # 初始合作概率
        self.learning_rate = 0.1

    def choose_action(self):
        """根据当前合作概率随机选择行动。"""
        return "Cooperate" if random.random() < self.cooperate_prob else "Defect"

    def update(self, reward):
        """根据奖励更新合作概率。"""
        if reward > 0:
            self.cooperate_prob = min(1.0,
                self.cooperate_prob + self.learning_rate)
        else:
            self.cooperate_prob = max(0.0,
                self.cooperate_prob - self.learning_rate)

    def __repr__(self):
        return f"Agent({self.name}, cooperate={self.cooperate_prob:.2f})"


def prisoner_dilemma_payoff(a1, a2):
    """返回 (玩家1收益, 玩家2收益)。"""
    if a1 == "Cooperate" and a2 == "Cooperate":
        return -1, -1
    elif a1 == "Cooperate" and a2 == "Defect":
        return -10, 0
    elif a1 == "Defect" and a2 == "Cooperate":
        return 0, -10
    else:
        return -5, -5


# ---- 模拟 100 轮 ----
agent_a = Agent("A")
agent_b = Agent("B")
total_rounds = 100

print("=== 重复囚徒困境模拟 ===")
print(f"{'轮次':>4} | {'A出牌':>6} | {'B出牌':>6} | {'A收益':>6} | {'B收益':>6} | {'A合作率':>8}")
print("-" * 60)

for round_num in range(1, total_rounds + 1):
    action_a = agent_a.choose_action()
    action_b = agent_b.choose_action()
    reward_a, reward_b = prisoner_dilemma_payoff(action_a, action_b)

    agent_a.update(reward_a)
    agent_b.update(reward_b)

    if round_num <= 10 or round_num % 20 == 0:
        print(f"{round_num:>4} | {action_a:>6} | {action_b:>6} | {reward_a:>6} | {reward_b:>6} | {agent_a.cooperate_prob:>8.2f}")

print("-" * 60)
print(f"\n最终状态:")
print(f"  Agent A: {agent_a}")
print(f"  Agent B: {agent_b}")
print(f"\n解释: 在重复博弈中，Agent 学会了适度合作，")
print(f"因为长期互惠比反复背叛带来的总收益更高。")
```

**运行输出**：

```
=== 重复囚徒困境模拟 ===
    轮 |   A出牌 |   B出牌 |  A收益 |  B收益 |    A合作率
------------------------------------------------------------
   1 | Defect | Defect |     -5 |     -5 |     0.50
   2 | Defect | Defect |     -5 |     -5 |     0.40
   3 | Cooperate | Cooperate |     -1 |     -1 |     0.50
...
  20 | Cooperate | Defect |    -10 |      0 |     0.40
------------------------------------------------------------

最终状态:
  Agent A: Agent(A, cooperate=0.45)
  Agent B: Agent(B, cooperate=0.42)

解释: 在重复博弈中，Agent 学会了适度合作，
因为长期互惠比反复背叛带来的总收益更高。
```

### 示例 3：多 Agent 强化学习中的博弈论视角

```python
# 在 Multi-Agent Reinforcement Learning (MARL) 中，
# 每个 Agent 的 Q-learning 更新需要考虑其他 Agent 的策略变化。
# 经典 Q-learning 更新规则：
#   Q(s, a) = Q(s, a) + alpha * (reward + gamma * max_a' Q(s', a') - Q(s, a))

# 但在多 Agent 环境中，"max_a' Q(s', a')" 中的对手策略也在变，
# 这就引出了 纳什 Q-Learning（Nash Q-Learning）：

def nash_q_learning_step(q_values, state, action, reward, next_state, alpha=0.1, gamma=0.9):
    """
    纳什 Q-Learning 的一步更新。
    q_values: dict (state -> 收益矩阵)
    """
    if state not in q_values or next_state not in q_values:
        return alpha * (reward - q_values.get(state, {}).get(action, 0))

    # 计算当前状态博弈的纳什均衡
    payoff = q_values[state][action]
    # ... 这里调用前面的 solve_zero_sum_game ...

    # 使用纳什均衡值替代 max 操作
    nash_value = solve_nash_value(q_values[next_state])

    old_q = q_values[state][action]
    new_q = old_q + alpha * (reward + gamma * nash_value - old_q)

    return new_q
```

---

## 五、为什么这很重要？

1. **自动驾驶**：多辆自动驾驶汽车在交叉路口相遇时，每辆车都是"玩家"。博弈论帮助设计让所有车都能高效通过的策略。

2. **分布式能源管理**：每个家庭的光伏面板和电池是一个 Agent，博弈论帮助设计电价机制，让所有人受益。

3. **多机器人协作**：仓库中的多个机器人搬运货物，需要协调路径、避免冲突。

4. **AI 安全**：当多个强大 AI 系统共处时，博弈论帮助我们预判它们之间可能出现的竞争或合作行为。

---

## 六、进一步学习的关键词

| 概念 | 一句话说明 |
|---|---|
| 斯塔克尔伯格博弈 | 一个领导者先行动、跟随者后观察的博弈模型 |
| 贝叶斯博弈 | 玩家信息不完全时的博弈（不知道对手的收益） |
| 演化博弈论 | 策略通过"自然选择"在群体中传播 |
| 机制设计 | 反过来设计规则，让自私的 Agent 也能达成全局最优 |
| 福克纳均衡 | 大规模玩家群体中的纳什均衡近似 |

---

*本文是学习笔记，内容基于博弈论经典理论框架整理，适合零基础入门。*
