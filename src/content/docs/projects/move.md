---
title: Qiskit 零基础学习笔记
来源: https://github.com/Qiskit/qiskit
日期: 2026-06-13
分类: 其他
子分类: quantum-computing
provenance: pipeline-v3
---

# Qiskit 零基础学习笔记

## 什么是 Qiskit

Qiskit 是 IBM 主导开源的一套量子计算软件开发工具包（SDK）。核心功能包括：创建和操作量子电路、优化编译（transpiler）、以及通过 primitives（Sampler / Estimator）运行电路。它同时提供 Python API 和 C API，底层用 Rust 实现（Rust 占代码量约 29%）。

你可以把它理解成"量子世界的 LEGO 积木"——你用 Python 搭好一套电路，然后交给真正的量子计算机去跑。

## 先搞懂：量子比特是什么

经典计算机用的是"比特"（bit），就像开关，要么 0，要么 1。

量子计算机用的是"量子比特"（qubit），它不一样——在测量之前，它可以同时处于 0 和 1 的"叠加态"。

打个比方：经典比特像一枚放在桌上的硬币，正面朝上就是 1，反面朝上就是 0。量子比特则像一枚正在旋转的硬币——在你伸手按住它之前，它既是正面又是反面。

## 核心概念

### 叠加（Superposition）

量子比特可以同时表示 0 和 1。这是量子计算并行的基础。

### 纠缠（Entanglement）

两个量子比特可以产生"纠缠"关系——无论它们相距多远，测量其中一个的状态会瞬间决定另一个的状态。爱因斯坦称之为"鬼魅般的超距作用"。

### 量子门（Quantum Gate）

就像经典电路有与门、或门、非门，量子电路也有量子门，用来操作量子比特的状态。

### 量子电路（Quantum Circuit）

把量子门按顺序排列，就构成了一个量子电路——这就是你要写的"程序"。

### 测量（Measurement）

量子态在被测量时会"坍缩"成一个确定的经典值（0 或 1）。这是量子计算结果输出的唯一方式。

### Primitives：Sampler 与 Estimator

Qiskit 2.x 引入了 primitives 抽象：
- **Sampler**：运行电路，采样测量结果（比如 1000 次里有 500 次 `00`，500 次 `11`）。
- **Estimator**：计算量子态下某个物理量的期望值（比如能量、贝尔不等式关联值）。

## 安装

```bash
pip install qiskit
```

## 代码示例一：创建你的第一个量子电路（GHZ 态）

GHZ 态是最简单的纠缠态之一——多个量子比特纠缠在一起，测量时要么全 0，要么全 1。

```python
from qiskit import QuantumCircuit

# 创建一个包含 2 个量子比特的电路
qc = QuantumCircuit(2)

# 第 0 号量子比特施加 Hadamard 门，让它进入叠加态
qc.h(0)

# 用 CNOT 门将 0 号和 1 号量子比特纠缠在一起
qc.cx(0, 1)

# 在所有量子比特上添加测量操作
qc.measure_all()

# 打印电路的可视化
print(qc.draw())
```

输出类似这样：

```
     ┌───┐     ┌─┐
q_0: ┤ H ├──■──┤M├
     └───┘┌─┴─┐└╥┘
q_1: ─────┤ X ├─╫─
          └───┘ ║
             c: ╩═
                   0
```

这个电路做了什么？

1. `qc.h(0)`：让第 0 号量子比特进入叠加态——它现在是"既是 0 又是 1"。
2. `qc.cx(0, 1)`：CNOT 门，以 0 号为控制、1 号为目标。如果 0 号是 1，就把 1 号翻转。因为 0 号处于叠加态，结果就是两个比特被"纠缠"了——它们的状态完全关联。
3. `qc.measure_all()`：对所有量子比特做测量，把量子结果变成经典的 0/1 记录。

如果你运行这个电路 1000 次，你会看到大约 500 次结果是 `00`，500 次结果是 `11`——永远不会出现 `01` 或 `10`。这就是纠缠的力量。

## 代码示例二：用 Estimator 估算贝尔不等式算子的期望值

除了采样测量结果，Qiskit 的 Estimator 可以计算量子态的数学性质，这在量子化学、优化问题中非常有用。

```python
import numpy as np
from qiskit import QuantumCircuit
from qiskit.quantum_info import SparsePauliOp
from qiskit.primitives import StatevectorEstimator

# 创建一个 3 量子比特的 GHZ 态电路（不含测量）
qc = QuantumCircuit(3)
qc.h(0)              # 第 0 号比特进入叠加态
qc.p(np.pi / 2, 0)   # 施加相位门（乘以虚数单位 i）
qc.cx(0, 1)          # 纠缠 0 号和 1 号
qc.cx(0, 2)          # 纠缠 0 号和 2 号

# 定义一个算子（operator），描述我们要测量的物理量
# XXY + XYX + YXX - YYY 是一个著名的贝尔不等式相关算子
operator = SparsePauliOp.from_list([
    ("XXY", 1),
    ("XYX", 1),
    ("YXX", 1),
    ("YYY", -1)
])

# 使用 Estimator 运行
estimator = StatevectorEstimator()
job = estimator.run([(qc, operator)], precision=1e-3)
result = job.result()

print(f"期望值: {result[0].data.evs}")
```

输出：

```
期望值: 4.0
```

这段代码背后的直觉：

- `SparsePauliOp` 定义了一个"测量目标"。XXY 的意思是：在第 0、1、2 号量子比特上分别测量 Pauli-X、Pauli-Y、Pauli-Z 这三个算子，然后把它们乘起来。
- Estimator 会计算这个测量目标在当前量子态下的"期望值"（平均值）。
- 结果 4.0 违反了经典物理能达到的上限——这正是贝尔不等式的精髓，证明量子世界确实存在"鬼魅般的超距作用"。

## 编译与传输（Transpilation）

量子计算机不是想跑就能跑的——每个真实的量子芯片都有特定的"基门集合"和"连接拓扑"。Qiskit 的 Transpiler 负责把你的电路转换成目标硬件能执行的格式。

```python
from qiskit import transpile
from qiskit.transpiler import Target, CouplingMap

# 模拟一个基门集合和 3 量子比特的线性连接拓扑
target = Target.from_configuration(
    basis_gates=["cz", "sx", "rz"],
    coupling_map=CouplingMap.from_line(3),
)
qc_transpiled = transpile(qc, target=target)

print(qc_transpiled.draw())
```

Transpiler 做的事情包括：

1. **基门分解**：把高级门（如 CNOT）拆成硬件支持的基门（如 CZ、SX、RZ）。
2. **路由映射**：根据量子比特的物理连接方式，插入 SWAP 门来移动量子信息。
3. **电路优化**：合并相邻的相同门、消除冗余操作。

## 运行在真机上

Qiskit 通过 Provider 接口连接各种量子硬件后端，比如 IBM Quantum、IonQ、Quantinuum 等。Qiskit 的核心定位是抽象层——同一份电路代码，从模拟器切到真机几乎不用改。

```python
from qiskit_ibm_runtime import QiskitRuntimeService, SamplerV2 as IBMSampler

# 连接到 IBM Quantum 云平台
service = QiskitRuntimeService()
backend = service.least_busy(n_qubits=133, simulator=False)

# 在实际硬件上运行
sampler = IBMSampler(backend=backend)
job = sampler.run([qc_measured])
result = job.result()
print(result[0].data.meas.get_counts())
```

## 总结

| 概念 | 类比 | Qiskit 对应 |
|------|------|-------------|
| 量子比特 | 旋转中的硬币 | `QuantumCircuit(n)` |
| 叠加态 | 硬币正反面同时存在 | `.h(qubit)` |
| 纠缠 | 两颗同步旋转的硬币 | `.cx(control, target)` |
| 量子门 | 操作硬币状态的指令 | `.h()`, `.cx()`, `.p()` |
| 测量 | 用手按住硬币 | `.measure_all()` |
| 传输编译 | 翻译成特定语言 | `transpile(circuit, backend)` |
| 执行器 | 让硬币真正转起来 | `Sampler` / `Estimator` |

Qiskit 的核心价值在于：它让你能用熟悉的 Python 语言，去编写和操作量子电路，而不用关心底层量子硬件的复杂细节。从模拟器到真机，代码几乎不用改。
