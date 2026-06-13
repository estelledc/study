---
title: MCP-Solver: Integrating Language Models with Constraint Programming Systems
来源: https://arxiv.org/abs/2501.00539
日期: 2026-06-13
分类_原始: AI
分类: 机器学习
子分类: 约束求解
provenance: pipeline-v3
---

# MCP-Solver: 把大语言模型和约束求解器连起来

## 一、从日常类比开始

想象你在玩数独游戏。

你靠直觉填了几个格子，但很快发现有些格子怎么都不对。这时候你有两个选择：

1. 继续凭直觉猜 —— 可能猜错，也可能蒙对，但效率很低
2. 找一个严格的逻辑推理助手，让它告诉你哪些数字绝对不能填

MCP-Solver 做的事情就是第 2 种。它让大语言模型（LLM）能够调用一个"严格的逻辑推理助手"——约束求解器。

为什么需要这样做？因为 LLM 有一个根本弱点：它的推理是基于概率的。给它一个逻辑谜题，LLM 可能会自信地给出错误答案。而约束求解器完全不同——它像一个数学证明机器，要么给出绝对正确的解，要么证明无解。

MCP-Solver 的关键创新在于：它通过一个叫 **MCP（Model Context Protocol）** 的标准协议，把 LLM 和求解器连接起来。LLM 负责理解人类语言、构建问题模型，求解器负责严格求解。两者各取所长。

## 二、核心概念拆解

### 2.1 什么是约束求解？

约束求解的核心思想很简单：

- 你有一组**变量**（比如"每个城市在行程中的第几个被访问"）
- 你有一组**约束条件**（比如"不能重复访问同一个城市""总距离要最短"）
- 求解器的工作就是找到一组变量的值，同时满足所有约束

这就像拼图：你有若干块拼图（变量），还有一些规则（约束），求解器帮你找出唯一合法的拼法。

### 2.2 MCP 协议是什么？

MCP 是一个开源标准协议，让 AI 应用可以像"插 U 盘"一样连接外部工具。你可以把它理解为一个通用的"翻译层"：

- LLM 说："我想求解这个问题"
- MCP 协议把它翻译成标准化的工具调用
- 后端求解器执行计算，返回结果
- MCP 再把结果翻译回 LLM 能理解的格式

### 2.3 MCP-Solver 支持的三种求解器

论文实现了三种求解后端，每种适合不同类型的问题：

| 求解器 | 全称 | 适合的问题 | 类比 |
|--------|------|-----------|------|
| MiniZinc | 约束规划语言 | 调度、路由、排班 | 最接近自然语言的建模方式 |
| PySAT | 命题可满足性求解 | 布尔逻辑问题 | 纯粹的"真/假"推理 |
| Z3 | SAT Modulo Theories | 带数据类型的问题 | 支持整数、数组、位向量等丰富类型 |

### 2.4 增量验证机制

这是 MCP-Solver 最有意思的设计之一。

当你让 LLM 构建一个求解模型时，它是一行一行写的。MCP-Solver 采用"边写边检查"的策略：

1. LLM 添加一段代码（比如一个约束条件）
2. MCP-Solver 立即验证这段代码是否正确
3. 如果正确，保存；如果有错误，立即告诉 LLM 哪里错了
4. LLM 根据反馈修正，然后继续

这就像老师批改作业——不是等整份卷子写完才给分数，而是每写一步就指出错误，避免最后全盘推翻重来。

验证方式因求解器而异：
- MiniZinc：语法解析 + 类型检查
- PySAT/Z3：使用 Python 的抽象语法树（AST）进行静态分析，能精确到行号和列号

## 三、代码示例

### 示例 1：旅行商问题（MiniZinc 模式）

这是论文附录中的经典案例：一位女商人要从维也纳出发，访问奥地利全部 9 个省会城市后返回，求最短路线。

```minizinc
% 引入全局约束库
include "globals.mzn";

% 城市数量：9 个省会
int: n = 9;

% 距离矩阵：dist[i, j] 表示城市 i 到城市 j 的距离（公里）
array[1..n, 1..n] of int: dist =
|[ 0,  65,  60, 184, 195, 319, 299, 478, 631|
 |65,   0, 125, 119, 130, 254, 234, 413, 566|
 |60, 125,   0, 184, 157, 281, 261, 440, 593|
 |184,119, 184,   0, 208, 252, 136, 315, 468|
 |195,130, 157, 208,   0, 136, 280, 459, 629|
 |319,254, 281, 252, 136,   0, 217, 391, 566|
 |299,234, 261, 136, 280, 217,   0, 188, 343|
 |478,413, 440, 315, 459, 391, 188,   0, 157|
 |631,566, 593, 468, 629, 566, 343, 157,   0]|;

% 变量：tour[i] 表示行程中第 i 个城市是哪个（编号 1-9）
array[1..n] of var 1..n: tour;

% 约束 1：所有城市不能重复访问
constraint alldifferent(tour);

% 约束 2：从维也纳（城市 1）出发
constraint tour[1] = 1;

% 计算总距离
var int: total_distance =
    sum(i in 1..n-1) (dist[tour[i], tour[i+1]])
  + dist[tour[n], tour[1]];

% 目标：最小化总距离
solve minimize total_distance;
```

运行后，求解器返回最优解：

```
路线：维也纳 → 艾森施塔特 → 格拉茨 → 克拉根福 → 因斯布鲁克 → 布雷根茨 → 萨尔茨堡 → 林茨 → 圣珀尔滕 → 返回维也纳
总距离：1,564 公里
```

注意：LLM 在这里的角色是——你只用自然语言说"帮我找一个最短路线"，LLM 会自动生成上面的 MiniZinc 代码，提交给求解器，再把结果翻译回人话告诉你。

### 示例 2：6 皇后 + 5 骑士（PySAT 模式）

这是一个棋盘上的组合难题：在 6x6 棋盘上放置 6 个皇后和 5 个骑士，要求互不攻击。

```python
from pysat.formula import CNF
from pysat.solvers import Glucose3
from pysat.card import *
import itertools

# 棋盘尺寸
board_size = 6

# 为每个格子的"是否有皇后/骑士"创建布尔变量
var_count = 1
var_mapping = {}

def create_var(name):
    global var_count
    var_mapping[name] = var_count
    var_count += 1
    return var_mapping[name]

queen_at = {}   # queen_at[(r, c)] = 变量：(r,c) 位置是否有皇后
knight_at = {}  # knight_at[(r, c)] = 变量：(r,c) 位置是否有骑士

for r in range(board_size):
    for c in range(board_size):
        queen_at[(r, c)] = create_var(f"queen_at_{r}_{c}")
        knight_at[(r, c)] = create_var(f"knight_at_{r}_{c}")

formula = CNF()

# 约束 1：每个格子不能同时有皇后和骑士
for r in range(board_size):
    for c in range(board_size):
        formula.append([-queen_at[(r, c)], -knight_at[(r, c)]])

# 约束 2：棋盘上恰好有 6 个皇后
all_queens = [queen_at[(r, c)] for r in range(board_size) for c in range(board_size)]
for clause in exactly_k(all_queens, 6):
    formula.append(clause)

# 约束 3：棋盘上恰好有 5 个骑士
all_knights = [knight_at[(r, c)] for r in range(board_size) for c in range(board_size)]
for clause in exactly_k(all_knights, 5):
    formula.append(clause)

# 约束 4：皇后之间不能互相攻击（除非中间有骑士挡着）
def are_aligned(r1, c1, r2, c2):
    return r1 == r2 or c1 == c2 or abs(r1 - r2) == abs(c1 - c2)

def positions_between(r1, c1, r2, c2):
    positions = []
    if r1 == r2:
        for c in range(min(c1, c2) + 1, max(c1, c2)):
            positions.append((r1, c))
    elif c1 == c2:
        for r in range(min(r1, r2) + 1, max(r1, r2)):
            positions.append((r, c1))
    elif abs(r1 - r2) == abs(c1 - c2):
        steps = abs(r1 - r2) - 1
        r_step = 1 if r2 > r1 else -1
        c_step = 1 if c2 > c1 else -1
        for i in range(1, steps + 1):
            positions.append((r1 + i * r_step, c1 + i * c_step))
    return positions

for (r1, c1), (r2, c2) in itertools.combinations(
    [(r, c) for r in range(board_size) for c in range(board_size)], 2):
    if are_aligned(r1, c1, r2, c2):
        between = positions_between(r1, c1, r2, c2)
        if not between:
            formula.append([-queen_at[(r1, c1)], -queen_at[(r2, c2)]])
        else:
            knight_vars = [knight_at[pos] for pos in between]
            if knight_vars:
                formula.append([-queen_at[(r1, c1)], -queen_at[(r2, c2)]] + knight_vars)

# 约束 5：骑士和皇后互不攻击
knight_moves = [(-2,-1),(-2,1),(-1,-2),(-1,2),(1,-2),(1,2),(2,-1),(2,1)]
for r1 in range(board_size):
    for c1 in range(board_size):
        for dr, dc in knight_moves:
            r2, c2 = r1 + dr, c1 + dc
            if 0 <= r2 < board_size and 0 <= c2 < board_size:
                formula.append([-knight_at[(r1, c1)], -queen_at[(r2, c2)]])
                formula.append([-queen_at[(r1, c1)], -knight_at[(r2, c2)]])

# 约束 6：骑士之间互不攻击
for r1 in range(board_size):
    for c1 in range(board_size):
        for dr, dc in knight_moves:
            r2, c2 = r1 + dr, c1 + dc
            if (0 <= r2 < board_size and 0 <= c2 < board_size and (r1, c1) < (r2, c2)):
                formula.append([-knight_at[(r1, c1)], -knight_at[(r2, c2)]])

# 求解
solver = Glucose3()
solver.append_formula(formula)
if solver.solve():
    model = solver.get_model()
    # 打印棋盘布局...
else:
    print("无解")
```

这个例子展示了 PySAT 模式的特点：把问题转化为 CNF（合取范式），然后用 SAT 求解器找出一组使公式为真的变量赋值。

### 示例 3：Z3 模式简介

Z3 模式适合需要丰富数据类型的场景。比如验证处理器奇偶校验逻辑：

```python
from z3 import *

# 定义一个 32 位的位向量
data = BitVec('data', 32)

# 定义奇偶校验位
parity_bit = BitVec('parity', 1)

# 约束：数据中 1 的个数应该与奇偶校验位匹配
# 这里用 Z3 内置的 popcount（计算 1 的个数）
pop = Sum([Extract(i, i, data) for i in range(32)])
solver = Solver()
solver.add(Xor(pop % 2, parity_bit) == 0)

# 给一个具体的数据值
solver.add(data == 0xDEADBEEF)

if solver.check() == sat:
    m = solver.model()
    print(f"奇偶校验位应为: {m[parity_bit]}")
else:
    print("无解 - 约束冲突")
```

Z3 的优势在于它能处理整数、位向量、数组、实数等多种类型，还能表达量词（forall/exists），适合更复杂的验证场景。

## 四、系统架构要点

MCP-Solver 的整体架构可以用一句话概括：**LLM 是人，求解器是计算器。**

```
┌─────────────┐     MCP 协议      ┌──────────────┐
│  AI 聊天应用  │ ◄──────────────► │  MCP-Solver  │
│  (Claude等)   │   工具调用       │   Server     │
└─────────────┘                  └──────┬───────┘
                                       │
                    ┌────────────────────┼────────────────────┐
                    │                    │                      │
              ┌─────▼─────┐      ┌──────▼──────┐    ┌─────────▼─────────┐
              │  MiniZinc  │      │    PySAT    │    │      Z3           │
              │  约束规划   │      │  SAT 求解器  │    │  SMT 求解器       │
              └───────────┘      └─────────────┘    └───────────────────┘
```

MCP-Solver 提供了 6 个标准工具：

- `clear_model` — 清空当前模型
- `add_item` — 在指定位置添加一段代码
- `replace_item` — 替换指定位置的代码
- `delete_item` — 删除指定位置的代码
- `get_model` — 查看当前模型（带编号）
- `solve_model` — 求解模型，返回结果

每个操作后都会自动验证，确保模型一致性。

## 五、两种使用场景

### 场景 1：对话式建模（集成到 AI 聊天应用）

用户在 Claude Desktop 里说："帮我规划一个从维也纳出发访问所有奥地利省会的旅行路线"。LLM 自动：
1. 理解需求
2. 通过 MCP 工具调用构建 MiniZinc 模型
3. 提交求解
4. 把结果翻译回人话

用户还可以随时修改需求："加一个条件，我在格拉茨要待两天"，LLM 自动调整模型并重新求解。

### 场景 2：自主多智能体系统

MCP-Solver 还包含一个轻量级客户端，实现了 ReAct 代理模式：

- ReAct 代理：自动决定是否需要调用求解器，自行迭代修正
- Reviewer 代理：专门检查求解结果是否正确，给出"正确/错误/未知"的判断

这种双代理设计提高了可靠性——即使 LLM 第一次建模范式有误，Reviewer 也能发现并触发重新求解。

## 六、为什么这件事重要

LLM 的能力边界很清晰：

- 擅长：理解自然语言、创意生成、代码编写、模式识别
- 不擅长：严格逻辑推理、数学证明、组合优化

MCP-Solver 的意义在于提供了一个**通用的桥接框架**：

1. **标准化**：通过 MCP 协议，任何支持 MCP 的 LLM 应用都能接入求解能力
2. **通用性**：支持三种不同的求解范式，覆盖从简单布尔逻辑到复杂约束优化的广泛问题
3. **交互性**：增量验证让 LLM 能在构建过程中获得即时反馈，而不是一次性提交后才发现错误
4. **教育价值**：用户可以观察到自然语言如何被形式化为求解模型，是一种很好的学习方式

## 七、局限与展望

论文也坦诚了当前的限制：

- 求解是同步进行的，长时间求解会阻塞（计划中添加异步求解）
- 复杂问题的自动编码仍需人工干预
- 目前每轮会话只使用一种求解器后端（未来可能加入路由代理自动选择）

作者提到的未来方向包括：MaxSAT 支持、异步求解接口、更多后端（如模型计数器）、以及支持实例数据处理（如图表或表格数据）。

## 八、我的理解总结

用一句话概括：**MCP-Solver 让 LLM 从"猜测者"变成了"协调者"**——LLM 不需要自己算出正确答案，它只需要把问题正确地描述给求解器，然后解读结果。这就像从"让学生自己解题"变成了"让学生学会使用计算器"。

对于学习者来说，这个项目也是一个极好的理解"形式化方法"的入口——通过自然语言到求解模型的转换过程，你能直观地看到如何将模糊的现实问题转化为精确的数学约束。
