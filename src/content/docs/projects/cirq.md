---
title: "Cirq — Google 的量子计算编程框架"
来源: https://github.com/quantumlib/Cirq
日期: 2026-06-13
分类: 其他
子分类: quantum-computing
provenance: pipeline-v3
---

## 是什么

**Cirq** 是 Google Quantum AI 团队开源的 Python 框架，用来**编写、编辑和运行量子电路**。它面向当前这一代"含噪声中等规模量子"（NISQ）设备——也就是那些 qubit 数量在几十到几百、但错误率还比较高的量子处理器。Cirq 让你能用熟悉的 Python 语法搭建量子电路、在本地模拟器上调试、然后把电路部署到 Google 的真实量子计算机上。

日常类比：

> 量子电路就像**厨房菜谱**。qubit 是食材，量子门就是切、炒、煮这些操作。传统经典计算机编程像是在按菜谱一步一步做菜（第一步倒油、第二步下蒜），而量子编程更像是在做一道**分子料理**——你先把所有步骤排好序（电路），然后一次性交给厨师（量子计算机）完成，最后尝一口（测量），得到一道菜的味道（结果）。只不过这道菜在做的时候同时处于"放了蒜"和"没放蒜"的叠加态，直到你尝的那一瞬间才"坍缩"成确定状态。

最小上手：

```bash
pip install cirq          # 需要 Python 3.11+
# 或
pip install cirq[deps]    # 包含全部依赖
```

## 为什么重要

理解 Cirq，才能看懂这几年量子软件栈的几个关键问题：

- 为什么量子电路不能像经典代码那样逐行"调试"？因为**测量会破坏量子态**，一旦测量，叠加态就坍缩了，Cirq 通过本地模拟器让你反复"跑 20 次、看分布"来间接观察
- 为什么 Cirq 强调 NISQ 而不是通用容错量子计算？因为当前硬件**有噪声**——每个门操作都有一定出错概率，Cirq 提供了噪声建模（noise modeling），让你在仿真中就能预测硬件上的实际表现
- 为什么 Cirq 提供 `GridQubit` 而不是直接用数字编号？因为**量子芯片的物理布局有拓扑结构**——相邻的 qubit 才能做双量子门操作，Cirq 的网格抽象让开发者不用操心底层布线
- 为什么 Cirq 支持"参数化电路"（symbolic variables）？因为很多算法需要反复运行同一种电路、只是旋转角度不同，Cirq 用 `cirq.GlobalPhaseParameter` 等工具让角度变成**变量而非固定值**，一次编译、反复微调
- Cirq 和 Google 其他量子工具（[qsim](https://github.com/quantumlib/qsim) 高性能模拟器、[Stim](https://github.com/quantumlib/stim) 纠错码模拟、[OpenFermion](https://github.com/quantumlib/openfermion) 量子化学）组成了 Google 完整的量子开发生态

## 核心概念

### 1. Qubit（量子比特）

量子电路的基本单位。Cirq 主要用 `GridQubit(row, col)` 来表示，就像棋盘上的格子：

```python
import cirq

# 创建 3 个量子比特，排成一行
q0 = cirq.GridQubit(0, 0)
q1 = cirq.GridQubit(0, 1)
q2 = cirq.GridQubit(0, 2)
```

类比经典编程：`q0` 就像变量名 `x`，只不过它代表的是一个量子态而不是数字。

### 2. Gate（量子门）与 Operation

量子门是操作量子比特的基本单位。常见的门：

| 门 | 作用 | 类比 |
|----|------|------|
| `cirq.H` | Hadamard 门，制造叠加态 | "把硬币抛到空中"——同时处于正面和反面 |
| `cirq.X` | 量子 NOT 门，翻转 | "把正面翻成反面" |
| `cirq.CNOT` | 受控翻转，两个 qubit | "如果 qubit A 是 1，就把 B 翻转" |
| `cirq.measure` | 测量，坍缩到经典结果 | "看硬币最终是哪一面" |

### 3. Circuit（电路）与 Moment（时刻）

电路是一系列门操作的有序排列。一个电路由多个 **moment** 组成，同一个 moment 中的操作可以并行执行：

```python
# 创建一个包含两个 moment 的电路
circuit = cirq.Circuit(
    cirq.Moment(          # moment 0：并行操作
        cirq.H(q0),
        cirq.H(q1),
    ),
    cirq.Moment(          # moment 1：串行操作
        cirq.CNOT(q0, q1),
    ),
)
```

类比：moment 就像乐谱里的"小节"，同一小节内的音符同时演奏，不同小节先后演奏。

### 4. Simulator（模拟器）

由于量子计算机稀缺且昂贵，Cirq 内置了本地模拟器让你在电脑上运行量子电路：

```python
simulator = cirq.Simulator()
result = simulator.run(circuit, repetitions=20)
print(result)
# 输出类似：00001100101100110010（20 次测量结果）
```

`repetitions` 参数很重要——因为量子测量是概率性的，跑一次只得到一个结果，跑多次才能得到**概率分布**。

## 代码示例

### 示例 1：第一个量子电路 — 叠加态

这是 Cirq 官方教程的"Hello Qubit"：

```python
import cirq

# 1. 选一个量子比特（棋盘上位置 0,0）
qubit = cirq.GridQubit(0, 0)

# 2. 创建电路：先加 Hadamard 门制造叠加态，再测量
circuit = cirq.Circuit(
    cirq.X(qubit) ** 0.5,  # X^0.5 = sqrt(X) = Hadamard 的变体
    cirq.measure(qubit, key='m')
)

# 3. 打印电路结构
print("电路：")
print(circuit)
# 输出：
# (0, 0): ───X^0.5───M('m')───

# 4. 在模拟器上运行 20 次
simulator = cirq.Simulator()
result = simulator.run(circuit, repetitions=20)
print("结果：")
print(result)
# 输出：m=01101001011010010110（每次运行结果不同，因为量子概率）
```

这里 `X**0.5` 是"X 门的平方根"，等价于 Hadamard 门的一种变体，它把 qubit 从确定的 `0` 状态变成**叠加态**——此时 qubit 同时"是 0 又是 1"，测量时以 50% 概率出现 0，50% 概率出现 1。

### 示例 2：贝尔态 — 量子纠缠

贝尔态（Bell State）是最简单的纠缠态，两个 qubit 被"绑"在一起：

```python
import cirq

# 1. 创建两个量子比特
q0 = cirq.GridQubit(0, 0)
q1 = cirq.GridQubit(0, 1)

# 2. 构建贝尔态电路
# 步骤：H 门制造叠加 → CNOT 制造纠缠
circuit = cirq.Circuit(
    cirq.H(q0),           # q0 进入叠加态
    cirq.CNOT(q0, q1),    # 用 q0 控制 q1，产生纠缠
    cirq.measure(q0, q1, key='result')
)

print("贝尔态电路：")
print(circuit)
# 输出：
# (0, 0): ───H───@───M('result')───
#                │
# (0, 1): ──────X───M('result')───

# 3. 运行 10 次，观察纠缠效果
simulator = cirq.Simulator()
result = simulator.run(circuit, repetitions=10)
print("结果（两个 qubit 总是相同）：")
print(result)
# 输出：result=0000000000 或 result=1111111111
# 注意：你永远看不到 01 或 10 的组合——这就是纠缠！
```

在这个电路中，`H` 门让 q0 变成叠加态，然后 `CNOT` 把 q0 的状态"复制"到 q1（量子版本，不是简单的复制）。结果是：两个 qubit 无论相距多远，测量时**永远同步**——这就是爱因斯坦说的"鬼魅般的超距作用"。

### 示例 3：参数化电路 — 变分量子算法

Cirq 支持符号参数，这是变分量子算法（VQE/QAOA）的核心：

```python
import cirq
import numpy as np

q0, q1 = cirq.GridQubit(0, 0), cirq.GridQubit(0, 1)

# 1. 定义符号参数
theta = cirq.GlobalPhaseParameter('theta')

# 2. 创建参数化电路
circuit = cirq.Circuit(
    cirq.H(q0),
    cirq.Rz(theta).on(q1),  # 绕 Z 轴旋转 theta 弧度
    cirq.CNOT(q0, q1),
    cirq.measure(q0, q1, key='m'),
)

# 3. 用不同的 theta 值运行
for angle in [0, np.pi / 2, np.pi]:
    result = cirq.Simulator().run(
        circuit,
        repetitions=20,
        param_resolver={theta: angle}
    )
    print(f"theta = {angle:.2f}: {result}")
```

这种参数化能力让你可以用经典优化器（如 SciPy）自动搜索最佳参数，是连接经典计算和量子计算的关键桥梁。

## 延伸方向

- 噪声建模：`cirq.NoiseModel` 可以模拟真实量子芯片的退相干和门错误
- 设备抽象：`cirq.Device` 定义量子芯片的物理布局和连接关系
- 与 [qsim](https://github.com/quantumlib/qsim) 集成：用 C++ 后端做百万级 qubit 的高性能仿真
- 与 [Stim](https://github.com/quantumlib/stim) 集成：专门加速量子纠错码的模拟

## 参考资料

- GitHub 仓库：https://github.com/quantumlib/Cirq
- 官方文档：https://quantumai.google/cirq
- 教程合集（Colab 可运行）：https://colab.research.google.com/github/quantumlib/Cirq
- YouTube 视频教程：https://www.youtube.com/playlist?list=PLpO2pyKisOjLVt_tDJ2K6ZTapZtHXPLB4
- PyPI：https://pypi.org/project/cirq/
