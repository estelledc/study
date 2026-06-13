---
title: Q# 零基础学习笔记
来源: https://github.com/microsoft/qsharp
日期: 2026-06-13
分类: 编程语言
子分类: quantum-computing
provenance: pipeline-v3
---

# Q# 零基础学习笔记

## 一句话概括

Q# 是微软为量子计算专门设计的高级编程语言，名字里的 # 不代表它和 Ruby 是一家的，而是暗示"量子哈希"——量子计算用的专属语言。

## 从日常类比开始

想象你在玩一个硬币游戏。经典计算机的比特就像桌面上放的硬币——要么是正面（0），要么是反面（1），清清楚楚。

量子计算机的量子比特（qubit）则像一枚正在旋转的硬币。在硬币停止旋转之前，它同时处于正面和反面的"叠加"状态。只有当你用手按停它（测量）的那一刻，它才会随机倒向正面或反面。

Q# 就是用来"指挥"这些旋转硬币的游戏规则说明书。

## Q# 是什么？

Q#（读作 "Q sharp"）是微软 Quantum Development Kit（QDK）的核心组成部分，2018 年开源在 GitHub 上（github.com/microsoft/qdk）。它不是用来替代 Python 或 JavaScript 的——Q# 专注于一件事：写量子算法。

它有几个重要特点：

- **硬件无关**：你写的量子程序不绑定某一台具体的量子计算机，编译器会自动把你的量子比特映射到不同的硬件上
- **混合计算**：Q# 可以跟 Python、C#、TypeScript 一起用，经典部分用宿主语言写，量子部分用 Q# 写
- **遵守物理定律**：Q# 不能直接复制量子态（不可克隆定理），也不能随意查看量子态的数值——这是设计上强制遵守量子力学规则的

## 核心概念

### 1. Qubit（量子比特）

这是量子计算的基本单位。跟经典比特不同，Qubit 在被测量之前可以同时处于 0 和 1 的叠加态。在 Q# 中，用 `use` 关键字来分配一个量子比特，它默认处于 |0⟩ 状态。

### 2. Operation（量子操作）

Q# 中的基本执行单元叫 "operation"（量子操作），类似于其他语言中的 "function" 或 "method"。但它能做量子力学允许的事情：改变量子比特的状态、创建叠加、制造纠缠。

### 3. Superposition（叠加）

用 H（Hadamard）操作可以让量子比特进入叠加态。此时测量它，有 50% 概率得到 0，50% 概率得到 1。

### 4. Entanglement（纠缠）

两个量子比特可以被纠缠在一起，测量其中一个会瞬间影响另一个的状态，无论它们相隔多远。这是量子计算最神奇的地方。

### 5. Measurement（测量）

测量量子比特会"坍缩"它的叠加态，得到确定的 0 或 1。在 Q# 中用 `M` 操作来测量，返回 `Result` 类型（`Zero` 或 `One`）。

### 6. Reset（重置）

在 Q# 中，量子比特释放前必须回到 |0⟩ 状态，否则会产生运行时错误。用 `Reset` 操作来完成。

## 代码示例一：量子随机数生成器

经典计算机产生的都是"伪随机数"——基于某个种子计算的确定性结果。量子计算机则可以产生真正的随机数，因为量子测量的结果本质上是随机的。

```qsharp
import Std.Convert.*;
import Std.Math.*;

/// 生成一个 0 到 max 之间的随机整数
operation GenerateRandomNumberInRange(max : Int) : Int {
    mutable bits = [];
    let nBits = BitSizeI(max);

    // 生成足够位数的随机比特
    for idxBit in 1..nBits {
        bits += [GenerateRandomBit()];
    }

    // 把比特数组转成整数
    let sample = ResultArrayAsInt(bits);

    // 如果超出范围，重新生成
    return sample > max ? GenerateRandomNumberInRange(max) | sample;
}

/// 生成一个随机比特（0 或 1）
operation GenerateRandomBit() : Result {
    // 分配一个量子比特，默认在 |0> 状态
    use q = Qubit();

    // 施加 Hadamard 操作，进入叠加态
    H(q);

    // 测量量子比特，得到 Zero 或 One（各 50%）
    let result = M(q);

    // 重置量子比特回 |0> 状态（必须做！）
    Reset(q);

    return result;
}

@EntryPoint()
operation Main() : Int {
    let max = 100;
    Message($"生成 0 到 {max} 之间的随机数: ");
    return GenerateRandomNumberInRange(max);
}
```

这段代码做了什么事？

1. `GenerateRandomBit` 分配一个 qubit → 用 H 操作让它进入叠加态 → 测量得到随机 0/1 → 重置 qubit
2. `GenerateRandomNumberInRange` 循环调用上面的函数生成足够位数，拼成一个随机整数
3. 如果结果超出范围，递归重试
4. 每次运行结果都不同，因为是量子级别的随机

## 代码示例二：量子纠缠（贝尔态）

两个纠缠的量子比特就像一对"心灵感应"的骰子：无论相距多远，掷出一个为 6 时，另一个也会变成对应的状态。

```qsharp
import Std.Diagnostics.*;

@EntryPoint()
operation Main() : (Result, Result) {
    // 分配两个量子比特，都在 |0> 状态
    use (q1, q2) = (Qubit(), Qubit());

    // 对 q1 施加 Hadamard 操作，进入叠加态
    H(q1);

    // 用 CNOT 操作把两个量子比特纠缠在一起
    // q1 是控制比特，q2 是目标比特
    CNOT(q1, q2);

    // 打印当前量子态，验证纠缠是否成功
    DumpMachine();

    // 分别测量两个量子比特
    let (m1, m2) = (M(q1), M(q2));

    // 两个量子比特都必须重置回 |0> 状态
    Reset(q1);
    Reset(q2);

    return (m1, m2);
}
```

运行后你会看到类似这样的输出：

```
DumpMachine:

 Basis | Amplitude      | Probability | Phase
 -----------------------------------------------
  |00> |  0.7071+0.0000i |    50.0000% |   0.0000
  |11> |  0.7071+0.0000i |    50.0000% |   0.0000

Result: "(Zero, Zero)"
```

关键观察：

- 只有 |00⟩ 和 |11⟩ 两种结果，各占 50%
- 不可能出现 |01⟩ 或 |10⟩（这就是纠缠：两个比特永远同步）
- 每次运行结果可能不同（Zero, Zero 或 One, One），但两个结果永远一致

## Q# 程序的基本结构

一个 Q# 程序通常包含以下部分：

| 组件 | 说明 |
|------|------|
| `namespace` | 可选，用于组织代码（类似 Python 的 module） |
| `@EntryPoint()` | 标记程序的入口点，也可以直接命名 `Main` |
| `operation` | 量子操作的定义，有输入参数和返回值 |
| `use` | 分配量子比特 |
| `let` | 声明不变变量 |
| `mutable` | 声明可变变量 |
| `import` | 导入标准库命名空间 |

Q# 的编译和执行流程：

1. 用 VS Code 的 Q# 扩展或 Jupyter Notebook 编写
2. Q# 编译器将代码编译成量子操作
3. 本地模拟器或云端量子硬件执行
4. 返回经典结果

## 如何上手运行

最简单的路径：

1. 安装 Visual Studio Code
2. 安装 Q# 扩展（搜索 "Q#" 或 "QDK"）
3. 新建 `.qs` 文件，粘贴上面的代码
4. 点击代码上方的 "Run" 按钮即可运行

也可以跟 Python 一起用：

```python
from qdk import qsharp
qsharp.run("Main()", shots=100)
```

## 总结

Q# 的核心思路就一句话：用专门的语法来描述对量子比特的操作。它不需要你懂量子力学的数学推导——编译器帮你处理底层细节。对于学习者来说，先理解 qubit、叠加、纠缠、测量这四个概念，就掌握了 Q# 的灵魂。
