---
title: HyperPlonk: PLONK with Linear-time Prover and High-degree Custom Gates
来源: https://eprint.iacr.org/2022/1355
日期: 2026-06-13
分类: 安全与隐私
子分类: 密码与零知识
provenance: pipeline-v3
---

# HyperPlonk：线性时间证明者与高阶自定义门

## 什么是零知识证明？

先从一个日常类比开始。

想象你在厨房里做了一道菜。朋友不希望你直接把配方给他，但他想确认你确实做了一道符合规则的菜——用了正确的食材、正确的步骤。

零知识证明（ZKP）就是：你能向朋友证明"我做的菜是合法的"，而不透露任何配方的细节。

在区块链技术中，零知识证明最常见的用途是：**证明一笔交易有效，但不公开交易金额、发送方和接收方。**

## PLONK 是什么？

PLONK 是一种零知识证明系统，由 2019 年的一组研究者提出。你可以把它想象成一种"万能证明模板"——无论你证明什么计算（转账、智能合约执行、加密运算），都用同一套模板来生成证明。

PLONK 有两个核心组件：

1. **电路（Circuit）**：把你要证明的计算拆成一个个小步骤，每步就是一个"门"（gate），就像乐高积木。
2. **多项式承诺（Polynomial Commitment）**：把电路的值打包成多项式，像把乐高说明书折起来放进一个密封信封，别人能验证信封没被动过，但看不到里面的内容。

### PLONK 的问题：FFT 瓶颈

PLONK 在生成证明时，需要用到一种叫 **FFT（快速傅里叶变换）** 的数学工具。FFT 的复杂度是 O(n log n)，其中 n 是电路的大小。

当电路变大（比如以太坊的每笔交易涉及几十个操作），FFT 就成了瓶颈——就像你有一台打印机，但每次打印前都要先花大量时间预热机器。

HyperPlonk 就是为了解决这个问题而诞生的。

## HyperPlonk 的核心改进

HyperPlonk 由 Binyi Chen、Benedikt Bünz、Dan Boneh、Zhenfei Zhang 于 2022 年提出，发表于 EUROCRYPT 2023。它做了两件关键的事：

### 改进一：去掉 FFT，实现线性时间证明者

HyperPlonk 把计算从"整个域"搬到了 **布尔超立方体（Boolean Hypercube）** 上。

布尔超立方体是什么？想象一个 n 维的立方体，每个顶点代表一组 n 位二进制数。比如 3 维超立方体有 8 个顶点：(0,0,0)、(0,0,1)、(0,1,0)、...、(1,1,1)。

在传统 PLONK 中，多项式是在整个有限域上操作的，需要 FFT。HyperPlonk 则只在布尔超立方体上操作多项式，用 **多线性多项式（Multilinear Polynomial）** 来替代。

多线性多项式长什么样？它是一个多项式，每个变量最多出现一次：

```
f(x, y, z) = a + b·x + c·y + d·z + e·x·y + f·y·z + g·x·z + h·x·y·z
```

注意：没有 x²、y³ 这样的项——每个变量的最高次数是 1。这就是"多线性"的含义。

在布尔超立方体上，x、y、z 只能取 0 或 1，所以 x² = x，y³ = y，天然满足多线性。

**结果：证明者的工作量从 O(n log n) 降到了 O(n)，也就是真正的线性时间。**

### 改进二：支持更高阶的自定义门

传统 PLONK 中，每个自定义门的多项式度数受到限制。如果你的门需要计算 x³ + y²，这个门的度数就变高了，PLONK 的处理效率会下降。

HyperPlonk **没有这个限制**。它支持高阶自定义门，同时证明者的运行时间不变。这对于需要复杂运算的场景（比如 zkEVM，即零知识以太坊虚拟机）非常重要。

## 核心概念详解

### 概念一：多线性多项式承诺（MLPC）

在传统 PLONK 中，证明者对每个多项式做 FFT，然后给出承诺（commitment）。在 HyperPlonk 中，承诺是在多线性多项式上做的。

最常用的是 **KZG 承诺方案**（Kate-Zaverucha-Goldberg）。它的核心思想是：

- 证明者有一个多项式 f(x)
- 证明者给出一个"承诺" C = f(s) · G（s 是秘密，G 是椭圆曲线上的生成元）
- 验证者无法从 C 反推 f(x)，但可以验证 f(r) = v 这个声明

```python
# 伪代码：多线性多项式承诺（简化版）
from hashlib import sha256

class MultilinearPolynomial:
    def __init__(self, coefficients):
        # coefficients: 每个顶点的多项式系数值
        # 对于 n 个变量的多线性多项式，有 2^n 个系数
        self.coeffs = coefficients
        self.num_vars = len(coefficients).bit_length() - 1

    def evaluate(self, point):
        """在布尔超立方体的一个点上求值"""
        # point 是一个二元组，如 (0, 1, 1)
        result = 0
        for i, coeff in enumerate(self.coeffs):
            # 把索引 i 转成二进制，决定每个变量取 0 还是 1
            product = 1
            for j, bit in enumerate(point):
                bit_in_point = (i >> j) & 1
                # 如果该位为 1，乘 x；如果为 0，乘 (1-x)
                if bit_in_point:
                    product *= bit
                else:
                    product *= (1 - bit)
            result += coeff * product
        return result

# 示例：2 变量多线性多项式 f(x, y) = 3 + 2x + 5y + 7xy
# 系数按 (0,0), (1,0), (0,1), (1,1) 排列
f = MultilinearPolynomial([3, 2, 5, 7])
print(f.evaluate((1, 0)))  # 3 + 2*1 + 5*0 + 7*1*0 = 5
print(f.evaluate((1, 1)))  # 3 + 2*1 + 5*1 + 7*1*1 = 17
```

### 概念二：ZeroCheck 协议

ZeroCheck 是 HyperPlonk 验证电路正确性的核心协议。它回答的问题是：

> "这个多项式在布尔超立方体的所有顶点上，都等于 0 吗？"

在电路中，这意味着：每个门（gate）的计算是否正确。如果每个门的输出多项式为 0，说明所有门都满足约束。

ZeroCheck 的做法是递归降维：

1. 验证者随机选一个点 r₁，问证明者："f(r₁, x₂, ..., xₙ) 关于 x₂...xₙ 的多线性部分是什么？"
2. 证明者给出一个新的、少一个变量的多项式
3. 重复这个过程，直到只剩一个值
4. 验证者用概率方法确认每一步都一致

这个过程不需要 FFT，只需要 O(n) 次场运算。

### 概念三：SumCheck 协议

SumCheck 回答的问题是：

> "这个多项式在布尔超立方体所有顶点上的和，等于某个值 S 吗？"

在 HyperPlonk 中，SumCheck 用来验证**连线约束（Wiring Constraints）**——即电路中不同门之间的信号连接是否正确。

想象电路中有三个门，门 A 的输出要连到门 B 的输入和门 C 的输入。SumCheck 保证这三个连接的信号值是同一个数。

```rust
// 伪代码：SumCheck 验证电路连线（简化版）

struct CircuitWiring {
    /// 门的列表，每门有多个端子（输入和输出）
    gates: Vec<Gate>,
    /// 连线表：(门索引, 端子索引) -> (门索引, 端子索引)
    wires: Vec<WiringConstraint>,
}

struct Gate {
    /// 门的类型：ADD, MUL, 或自定义高阶门
    gate_type: GateType,
    /// 门的端子值
    values: Vec<FieldElement>,
}

struct WiringConstraint {
    /// 约束编号
    constraint_idx: usize,
    /// 参与连线的端子对
    terminals: Vec<(GateIndex, TerminalIndex)>,
}

/// 连线验证：所有端子对的值必须相等
fn verify_wiring_sumcheck(wiring: &CircuitWiring) -> bool {
    // 对每个约束，把所有端子值加起来
    // 然后验证：sum(端子值的乘积) == 预期值
    // 这利用了数学恒等式：
    // 如果 a=b=c，则 (a-b)² + (b-c)² + (c-a)² = 0
    for constraint in &wiring.wires {
        let mut sum_of_squares = FieldElement::ZERO;
        for i in 0..constraint.terminals.len() {
            for j in (i+1)..constraint.terminals.len() {
                let (gi, ti) = constraint.terminals[i];
                let (gj, tj) = constraint.terminals[j];
                let diff = wiring.gates[gi].values[ti] - wiring.gates[gj].values[tj];
                sum_of_squares += diff * diff;
            }
        }
        // 如果所有端子值都相等，sum_of_squares 必须为 0
        if sum_of_squares != FieldElement::ZERO {
            return false;
        }
    }
    true
}
```

### 概念四：Batch Opening（批量打开）

在实际电路中，证明者需要打开（揭示）大量多项式在同一个点上的值。如果一个个开，效率很低。

HyperPlonk 提出了 **批量打开协议**：

- 把多个多项式随机线性组合成一个多项式
- 只对组合后的多项式做一次打开
- 验证者用相同的随机数做相同的线性组合来验证

这就像你有一堆信封，不用一个一个拆——把它们塞进一个大信封，用随机权重混合后只开一次。

## HyperPlonk vs PLONK 对比

| 特性 | PLONK | HyperPlonk |
|------|-------|------------|
| 证明者时间复杂度 | O(n log n) | O(n) |
| 多项式类型 | 单变量多项式 | 多线性多项式 |
| 核心数学结构 | 整个有限域 | 布尔超立方体 |
| 是否使用 FFT | 是 | 否 |
| 自定义门度数限制 | 低 | 无限制 |
| 证明大小 | 约 400 字节 | 类似（可进一步优化） |
| 验证时间 | O(1)（常数级） | O(1)（常数级） |

## 代码示例：从零构建一个 HyperPlonk 风格的约束系统

```rust
// 示例：用 HyperPlonk 思想构建一个简单的算术电路证明

/// 字段元素（简化版，实际使用 256 位椭圆曲线场）
#[derive(Clone, Copy, Debug)]
struct FieldElement(u64);

impl FieldElement {
    const fn add(self, other: FieldElement) -> FieldElement {
        FieldElement((self.0 + other.0) % 7)  // 模 7 简化运算
    }
    const fn mul(self, other: FieldElement) -> FieldElement {
        FieldElement((self.0 * other.0) % 7)
    }
}

/// 三端子门：a * b - c = 0，即 c = a * b
struct MultiplicationGate {
    a: FieldElement,
    b: FieldElement,
    c: FieldElement,
}

impl MultiplicationGate {
    /// 验证门约束：a * b - c == 0
    fn satisfies_constraint(&self) -> bool {
        self.a.mul(self.b) == self.c
    }
}

/// 超立方体上的多线性多项式
/// 对于 3 个变量 x, y, z，有 2^3 = 8 个顶点
struct MultilinearPoly3 {
    /// f(x,y,z) = c000 + c100*x + c010*y + c001*z + c110*xy + c101*xz + c011*yz + c111*xyz
    coeffs: [FieldElement; 8],
}

impl MultilinearPoly3 {
    /// 在顶点 (x, y, z) 处求值，x, y, z 为 0 或 1
    fn evaluate(&self, x: u8, y: u8, z: u8) -> FieldElement {
        let xi = x & 1;
        let yi = y & 1;
        let zi = z & 1;

        let mut sum = FieldElement(FieldElement(0));

        // 组合所有 8 个顶点的贡献
        sum = sum.add(self.coeffs[0]);                          // 000
        sum = sum.add(self.coeffs[1].mul(FieldElement(xi)));   // 100
        sum = sum.add(self.coeffs[2].mul(FieldElement(yi)));   // 010
        sum = sum.add(self.coeffs[3].mul(FieldElement(zi)));   // 001
        sum = sum.add(self.coeffs[4].mul(FieldElement(xi).mul(FieldElement(yi))));  // 110
        sum = sum.add(self.coeffs[5].mul(FieldElement(xi).mul(FieldElement(zi))));  // 101
        sum = sum.add(self.coeffs[6].mul(FieldElement(yi).mul(FieldElement(zi))));  // 011
        sum = sum.add(self.coeffs[7].mul(
            FieldElement(xi).mul(FieldElement(yi)).mul(FieldElement(zi))  // 111
        ));

        sum
    }

    /// SumCheck：计算所有顶点上的和
    fn sum_over_hypercube(&self) -> FieldElement {
        let mut total = FieldElement(FieldElement(0));
        for x in 0..2 {
            for y in 0..2 {
                for z in 0..2 {
                    total = total.add(self.evaluate(x, y, z));
                }
            }
        }
        total
    }
}

fn main() {
    // 构建一个简单电路：2 * 3 = 6
    let gate = MultiplicationGate {
        a: FieldElement(2),
        b: FieldElement(3),
        c: FieldElement(6),
    };
    assert!(gate.satisfies_constraint(), "门约束不满足");

    // 构建对应的多线性多项式（表示 a*b-c 在超立方体上的值）
    // 在这个简化示例中，我们只需验证门是正确的
    // 实际 HyperPlonk 中，证明者会通过 ZeroCheck + SumCheck 协议
    // 向验证者证明：多项式在所有顶点上都满足约束
    println!("门约束验证通过: {} * {} = {}", 2, 3, 6);
}
```

## HyperPlonk+ 和 Orion+

论文还提出了两个扩展：

**HyperPlonk+**：增加了查找门（Lookup Gate）的支持。查找门允许证明者说："这个值在我的预定义表中存在"。这在实现 zkEVM 时特别有用——你可以把整个以太坊虚拟机指令集做成一张表。

**Orion+**：改进了多线性承诺方案，将证明大小从约 5MB 压缩到约 7KB（对于 27 个变量的多项式），提升了近 1000 倍。同时保持了线性时间的证明者效率。

## 为什么 HyperPlonk 重要？

1. **zkEVM 的催化剂**：Espresso Systems 基于 HyperPlonk 构建了 ZK 以太坊虚拟机，允许以太坊交易在链下证明、链上验证，大幅提高吞吐量。

2. **证明者效率的质的飞跃**：从 O(n log n) 到 O(n)，当电路规模达到百万级时，速度差异是数量级的。

3. **硬件友好**：没有 FFT 意味着更简单的硬件实现，更适合 ASIC 加速。

4. **高阶门支持**：对于需要复杂运算的证明系统（如整数除法、哈希函数），高阶级自定义门避免了将一个大运算拆成许多小运算的开销。

## 总结

HyperPlonk 的核心思想可以浓缩为一句话：**把 PLONK 从"整个有限域"搬到"布尔超立方体"上，用多线性多项式替代单变量多项式，从而去掉 FFT 瓶颈。**

它保留了指令系统（PLONK 的所有门和连线约束都在），但换了一套更高效的数学基础。这就像一个城市保留了原有的街道规划，但把马车换成了高铁——路线不变，速度翻倍。

---

**延伸思考**：HyperPlonk 的 O(n) 证明者已经很快了，但证明大小（7KB）对于某些移动端场景还是偏大。Plonky2 等后续工作在此基础上进一步使用了 hash-based 承诺方案，把证明压到了几百字节。如果你对这条演进路线感兴趣，可以接着研究 Plonky2 和 Plonkup。
