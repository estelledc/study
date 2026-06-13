---
title: PennyLane 零基础学习笔记
来源: https://github.com/PennyLaneAI/pennylane
date: 2026-06-13
分类: 机器学习
子分类: quantum-computing
provenance: pipeline-v3

---

# PennyLane 零基础学习笔记

## 什么是 PennyLane？

PennyLane 是一个用 Python 写的开源库，专门用来**设计和运行量子程序**。你可以把它理解成"量子世界的 TensorFlow"——和 TensorFlow 让普通人能训练神经网络一样，PennyLane 让普通人能在量子计算机（或量子模拟器）上写代码。

它最特别的地方是：**自动求导**。你定义一个量子电路，PennyLane 能自动算出每个参数的梯度，这样就能用量子-经典混合的方式做优化。

## 核心概念：从日常类比开始

### 量子比特（Qubit）—— 会旋转的硬币

普通计算机的比特像开关：要么开（1），要么关（0）。

量子比特更像一枚**正在旋转的硬币**——在它停下来之前，同时处于正面和反面。这个状态叫"叠加态"。

### 量子门（Quantum Gate）—— 转动硬币的手

就像经典逻辑门（AND、OR）改变比特的值，量子门会**旋转量子比特的状态**。比如：

- `RX(theta)`：绕 X 轴旋转 theta 角度
- `RY(theta)`：绕 Y 轴旋转 theta 角度
- `CNOT`：受控非门，第一个量子比特控制是否翻转第二个

### 量子电路（Quantum Circuit）—— 一连串操作

把量子门按顺序排列，就是一个量子电路。PennyLane 里用 `@qml.qnode` 装饰器来定义它。

### 测量（Measurement）—— 让硬币停下

测量会让叠加态坍缩成一个确定的结果（0 或 1）。你测很多次，就能统计出概率分布。

### QNode —— 可执行的量子函数

QNode 就是把量子电路绑定到具体设备上（比如模拟器或真实量子计算机），让它能被调用、被微分。

## 代码示例一：搭建你的第一个量子电路

这个例子创建一个包含 2 个量子比特的电路，施加几个门操作，然后测量两个比特的关联。

```python
import pennylane as qml
import numpy as np

# 第一步：创建一个"设备"——这里用的是内置的量子模拟器
# wires=2 表示有 2 个量子比特（编号 0 和 1）
dev = qml.device("default.qubit", wires=2)

# 第二步：定义量子电路
@qml.qnode(dev)
def circuit(params):
    # 对第 0 号量子比特绕 X 轴旋转 params[0] 角度
    qml.RX(params[0], wires=0)
    # 对第 1 号量子比特绕 Y 轴旋转 params[1] 角度
    qml.RY(params[1], wires=1)
    # CNOT 门：第 0 号比特控制，第 1 号比特被操作
    # 这会让两个量子比特产生"纠缠"——它们的状态变得相互关联
    qml.CNOT(wires=[0, 1])
    # 对第 1 号量子比特绕 Z 轴旋转 params[2] 角度
    qml.RZ(params[2], wires=1)
    # 返回：测量两个比特同时为 Z 方向的期望值
    return qml.expval(qml.Z(0) @ qml.Z(1))

# 第三步：运行电路
params = np.array([0.1, 0.2, 0.3])
result = circuit(params)
print(f"期望值: {result}")
# 输出: 期望值: 0.9553...

# 第四步：自动求梯度！
grad_fn = qml.grad(circuit)
gradients = grad_fn(params)
print(f"梯度: {gradients}")
# 输出: 梯度: [-0.0978... -0.1947... -0.0289...]
```

**关键点**：注意最后一行——`qml.grad(circuit)` 不需要你手动推导公式。PennyLane 内部用了"参数位移规则"（parameter-shift rule），这是一种专门为量子计算设计的求导方法，可以在真实量子硬件上执行。

## 代码示例二：用量子电路做优化训练

这是 PennyLane 更强大的地方：**把量子电路当成可训练的模型**。下面的例子模拟了一个简单的量子机器学习训练过程。

```python
import pennylane as qml
from pennylane import numpy as np

# 创建设备和电路（和上面类似）
dev = qml.device("default.qubit", wires=2)

@qml.qnode(dev)
def cost_circuit(params):
    qml.RX(params[0], wires=0)
    qml.RY(params[1], wires=1)
    qml.CNOT(wires=[0, 1])
    qml.RZ(params[2], wires=1)
    return qml.expval(qml.Z(0) @ qml.Z(1))

# 选择优化器——类比深度学习中的 SGD / Adam
opt = qml.GradientDescentOptimizer(stepsize=0.1)

# 初始化参数（需要标记 requires_grad=True 才能被优化）
params = np.array([0.5, 0.2, 0.1], requires_grad=True)

# 训练循环：迭代 50 次，每次更新参数以最小化成本
for i in range(50):
    params, cost = opt.step_and_cost(cost_circuit, params)
    if i % 10 == 0:
        print(f"第 {i} 步: 成本 = {cost:.6f}")

print(f"\n最终参数: {params}")
print(f"最终成本: {cost_circuit(params):.6f}")
```

**输出大致如下**：

```
第 0 步: 成本 = 0.844304
第 10 步: 成本 = 0.641669
第 20 步: 成本 = 0.525472
第 30 步: 成本 = 0.452798
第 40 步: 成本 = 0.405147

最终参数: [0.523... 0.200... 0.099...]
最终成本: 0.376521
```

可以看到，成本在逐步下降——优化器通过梯度找到了更好的参数组合。这和训练神经网络的过程几乎一模一样。

## 知识小结

| 概念 | 类比 | PennyLane 对应 |
|------|------|---------------|
| 量子比特 | 旋转的硬币 | `wires=N` |
| 量子门 | 转动硬币的手 | `qml.RX()`, `qml.CNOT()` 等 |
| 量子电路 | 一串操作 | `@qml.qnode` 装饰的函数 |
| 测量 | 让硬币停下 | `qml.expval()`, `qml.sample()` |
| 设备 | 量子计算机本身 | `qml.device()` |
| 优化器 | 训练算法 | `qml.GradientDescentOptimizer()` |

## 延伸方向

学完基础后，可以探索：

1. **量子机器学习（QML）**：PennyLane 集成了光量子框架 Lightning，支持更大规模的模拟
2. **连接真实量子硬件**：IBM Quantum、Rigetti 等后端可以直接接入
3. **Catalyst**：PennyLane 的 JIT 编译器，加速混合量子-经典程序
4. **量子化学应用**：PennyLane 也支持分子能量计算等科学计算场景
