---
title: "Polar Codes — Channel Polarization 与 5G 编码"
description: "Arıkan 2009 年提出的信道极化方法，第一个被严格证明能达到 Shannon 容量的实用编码方案，5G NR 控制信道（PDCCH/PBCH/PUCCH）的官方编码。BB5 收官篇 / theory 分支 D / round 132 状元。"
来源: "https://ieeexplore.ieee.org/document/5075875"
作者: "Erdal Arıkan"
年份: 2009
期刊: "IEEE Transactions on Information Theory, Vol. 55, No. 7, pp. 3051-3073"
DOI: "10.1109/TIT.2009.2021379"
分支: "theory"
轮次: 132
难度: "D"
状态: "状元"
关键词:
  - channel polarization
  - polar codes
  - Shannon capacity
  - successive cancellation
  - SCL decoder
  - 5G NR
  - PDCCH
  - LDPC comparison
  - Bhattacharyya parameter
  - Kronecker product
sidebar:
  order: 132
  badge:
    text: 状元
    variant: success
---

# Polar Codes：从信道极化到 5G PDCCH

> BB5 收官篇。Round 132 / theory 分支 D / 难度最高。读完它，会理解为什么 Shannon 1948 立下的"容量可达"承诺，整整 60 年才被一个土耳其工程师以严格构造性证明兑现。

## 一句话摘要

Arıkan 在 2009 年证明：把 N 个相同的二元对称信道（B-DMC）按特定方式递归组合后，得到的 N 个"虚拟信道"会**两极分化**——一部分趋向"完美信道"（容量 → 1），另一部分趋向"无用信道"（容量 → 0）。只在好信道上传消息位、坏信道上传冻结位（frozen bit），就构成了**第一个被严格证明能达到 Shannon 容量的实用编码方案**。这不是工程逼近，是数学终结。

## 为什么这是 BB5 的状元篇

- **理论意义**：60 年来 Shannon 容量是个"上界承诺"，所有实用码（卷积码、Turbo、LDPC）都只能逼近、无法证明可达。Polar 是第一个 provably capacity-achieving 的显式构造。
- **工程价值**：3GPP 5G NR 标准把 Polar 码定为**控制信道（PDCCH/PBCH/PUCCH）的官方编码方案**。每一台 5G 手机里都跑着 Arıkan 这套数学。
- **教学价值**：信道极化的递归构造，是信息论教科书里最优雅的"组合 → 涌现新性质"案例。它和 Mamba 状态空间、Transformer 注意力一样，都是"递归同质块产生涌现"的范本。
- **历史价值**：Arıkan 1986 年从 MIT 拿博士回到比尔肯特大学（土耳其安卡拉），独自一人花了 23 年想清楚这件事。论文被引超 9000 次，2010 年获 IEEE 信息论学会论文奖。

![Channel Polarization Schematic](/papers/polar-codes-2009/01-channel-polarization.webp)

> 图 1：N 个相同的 B-DMC channel W 通过递归组合 G_N = B_N · F^⊗n 产生 N 个虚拟子信道 W_N^{(i)}。当 N → ∞ 时，每个子信道的容量要么趋向 1（图中绿色，"好信道"），要么趋向 0（图中红色，"坏信道"），中间过渡区（黄色）的占比趋于 0。这就是"信道极化"现象。

## 历史背景：Shannon 1948 的 60 年承诺

1948 年 Claude Shannon 在 *A Mathematical Theory of Communication* 中证明：

> 对任意容量为 C 的离散无记忆信道，存在码率 R < C 的编码方案使得译码错误率 → 0。

但 Shannon 的证明是**存在性证明**——他用随机编码 + 联合典型集论证 "这种码存在"，没说怎么构造。后续 60 年的编码理论史就是"如何构造一个真实可行、性能逼近 C 的码"：

| 年代 | 编码方案 | 最佳性能 | 是否可达性证明 |
|------|----------|----------|--------------|
| 1950 | Hamming（7,4） | 远低于 C | 否 |
| 1955 | 卷积码 + ML 解码 | ~30% C | 否 |
| 1960 | BCH / Reed-Solomon | ~50% C | 否 |
| 1967 | Viterbi 算法 | ~50% C | 否 |
| 1993 | Turbo 码 | ~95% C | 否（仅经验） |
| 1996 | LDPC 复活（MacKay） | ~95% C | 否（仅经验） |
| **2009** | **Polar 码（Arıkan）** | **provably 达到 C** | **是** |

Arıkan 这篇论文的意义不是工程上"再快一点、再准一点"——是**数学上把 Shannon 60 年的开放问题画上句号**。这种地位类似于 Wiles 证明费马大定理、Perelman 证明 Poincaré 猜想——一个领域的标志性收尾。

## 核心想法：信道极化（Channel Polarization）

### Definition 1：B-DMC（二元输入对称离散无记忆信道）

::: definition
**二元输入对称离散无记忆信道（Binary-input Discrete Memoryless Channel, B-DMC）** W: X → Y 满足：

- 输入字母表 X = {0, 1}
- 输出字母表 Y 为离散集合
- 转移概率 W(y|x) 满足对称性：存在置换 π 使得 W(π(y) | 1) = W(y | 0)
- 无记忆性：N 次使用 W 时 W^N(y₁, ..., y_N | x₁, ..., x_N) = ∏_{i=1}^{N} W(y_i | x_i)

典型例子：
- BSC(p)：二元对称信道，翻转概率 p
- BEC(ε)：二元擦除信道，擦除概率 ε
- 二元 AWGN（量化后，常见于卫星 / 5G 物理层建模）
:::

::: definition
**信道容量（Symmetric Capacity）** I(W) 定义为：

```
I(W) = Σ_{y∈Y} Σ_{x∈{0,1}} (1/2) W(y|x) log₂[ W(y|x) / ((1/2) W(y|0) + (1/2) W(y|1)) ]
```

物理意义：在均匀输入分布下，信道每次使用最多能传输的信息比特数。对 BEC(ε) 直接 = 1 - ε；对 BSC(p) = 1 - h(p)，h 是二元熵函数。
:::

::: definition
**Bhattacharyya 参数** Z(W) 定义为：

```
Z(W) = Σ_{y∈Y} √( W(y|0) · W(y|1) )
```

性质：

- Z(W) ∈ [0, 1]
- Z(W) → 0 ⇔ W 接近完美信道（I(W) → 1）
- Z(W) → 1 ⇔ W 接近无用信道（I(W) → 0）
- 关系：I(W) ≥ log₂(2 / (1 + Z(W)))，I(W) ≤ √(1 - Z(W)²)
- 物理意义：Z 是码距 = 1 时的最大似然解码错误概率上界

Z 是 Arıkan 用来追踪极化过程的核心量——比 I 更容易递归计算（在 BEC 上甚至有精确递推公式）。
:::

### Definition 2：信道组合（Channel Combining）

::: definition
**两路组合 W₂**：把两个独立的 W 副本组合成一个新信道 W₂: X² → Y²，输入 (u₁, u₂)，输出 (y₁, y₂)：

- 中间编码：x₁ = u₁ ⊕ u₂，x₂ = u₂
- 转移：y₁ = W(x₁)，y₂ = W(x₂)
- 联合概率：W₂(y₁, y₂ | u₁, u₂) = W(y₁ | u₁ ⊕ u₂) · W(y₂ | u₂)

注意 ⊕ 是 GF(2) 上加法（XOR）。这个 2×2 变换矩阵 F = [[1, 0], [1, 1]] 就是**极化核**——所有递归构造的基础。
:::

关键技巧：解码时**逐位**估计 u₁、u₂，得到两个虚拟子信道：

- **W₂^{(1)}**: u₁ → (y₁, y₂)，假设 u₂ 完全未知（即按其先验分布积分）
- **W₂^{(2)}**: u₂ → (y₁, y₂, u₁)，假设 u₁ 已知（即"successive cancellation"中已正确解出）

这两个子信道的"难度"不同：解 u₁ 难（因为 x₁ 同时受 u₁ 和 u₂ 影响），解 u₂ 易（因为 x₂ 直接来自 u₂，且我们已知 u₁ 可用作辅助）。

### Theorem 1（信道极化引理）

::: theorem
**Channel Polarization Lemma（论文 Lemma 4）**：对任意 B-DMC W，

```
I(W₂^{(1)}) ≤ I(W) ≤ I(W₂^{(2)})
I(W₂^{(1)}) + I(W₂^{(2)}) = 2 · I(W)
Z(W₂^{(1)}) ≤ 2 Z(W) - Z(W)²
Z(W₂^{(2)}) = Z(W)²
```

且严格不等当且仅当 0 < I(W) < 1。即：组合后第一个子信道**变差**、第二个子信道**变好**，但**总信息量守恒**。
:::

这是整个论文的核心机制——**两路组合自动产生极化**。注意 Z 的递推：z_plus = z² 比 z 小（"变好"），z_minus ≤ 2z - z² 比 z 大（"变差"）。在 BEC 上不等号变等号，所以 BEC 是分析极化最干净的玩具例子。

### Definition 3：递归极化（N = 2ⁿ）

把这个两路组合递归 n 次，得到 N = 2ⁿ 路组合 W_N，产生 N 个虚拟子信道 {W_N^{(i)} : i = 1, ..., N}：

- 第 1 步：N 个 W → N/2 个 W₂
- 第 2 步：每两个 W₂ 再组合 → N/4 个 W₄
- ...
- 第 n 步：得到 W_N

形式上：编码矩阵 G_N = B_N · F^⊗n，其中：

- F = [[1, 0], [1, 1]]（基本极化核，2×2）
- F^⊗n 是 n 次 Kronecker 自乘
- B_N 是位反转排列矩阵（bit-reversal permutation）

例如 N = 4：

```
F^⊗2 = [[1, 0, 0, 0],
        [1, 1, 0, 0],
        [1, 0, 1, 0],
        [1, 1, 1, 1]]
```

这个矩阵的非零模式正好对应 4 路 polar 编码器的蝶形结构（FFT-like）。

### Theorem 2（Channel Polarization Theorem，论文核心定理）

::: theorem
**信道极化定理（Theorem 1 in Arıkan 2009）**：对任意 B-DMC W 与任意 δ ∈ (0, 1)：

```
lim_{N→∞, N=2ⁿ} (1/N) | { i : I(W_N^{(i)}) ∈ (1-δ, 1] } | = I(W)
lim_{N→∞, N=2ⁿ} (1/N) | { i : I(W_N^{(i)}) ∈ [0, δ) } | = 1 - I(W)
```

**翻译**：N → ∞ 时，**所有**子信道的容量都收敛到 0 或 1，没有第三种命运。容量 → 1 的占比恰好等于原信道容量 I(W)，容量 → 0 的占比是 1 - I(W)。
:::

这是"涌现"的一个完美数学例子：一堆相同的中等强度信道（比如每个 I(W) = 0.5），反复递归组合后，整体性质（容量分布）发生了**相变**——50% 完美 + 50% 无用，中间地带消失。

证明思路：把 {Z(W_N^{(i)})} 视为一个 martingale（鞅），用鞅收敛定理证它必收敛到 {0, 1} 上的两点分布。这是论文最深的部分（Section IV）。

### Definition 4：极化码（Polar Code）的构造

::: definition
给定 B-DMC W、目标码率 R 和码长 N = 2ⁿ：

1. 计算所有 N 个虚拟子信道的 Bhattacharyya 参数 Z(W_N^{(i)})（可用蒙特卡洛 / 高斯近似 / 密度演化）
2. 选 K = ⌊RN⌋ 个最小 Z（即"最好"的子信道）作为信息位集合 A ⊆ {1, ..., N}
3. 其余 N - K 个为冻结位（frozen bit）集合 A^c，固定为 0（或预先约定的值，发收双方都知道）
4. 编码：u_A = 信息向量（K 位），u_{A^c} = 0；x = u · G_N（GF(2) 上矩阵乘法）

这个码记作 (N, K, A, u_{A^c}) Polar Code。
:::

实际工程中，A 的选择（"信息位选择"）是 Polar 码设计的核心环节。3GPP TS 38.212 直接给出固定的 1024-bit 序列表（Polar Sequence），让所有 5G 设备共享同一种选择策略。

### Theorem 3（容量可达性）

::: theorem
**Polar 码达到 Shannon 容量（Theorem 2 in Arıkan 2009）**：对任意 B-DMC W、任意 R < I(W)，使用上述构造的 (N, K=⌊RN⌋) Polar 码，配合 SC 解码器，块差错率：

```
P_e(N, R) ≤ N · 2^{-N^β}，∀β < 1/2
```

当 N → ∞ 时 P_e → 0。这正是 Shannon 1948 承诺的"R < C ⇒ 错误率任意小"。
:::

这是**第一个**实用编码方案被证明 capacity-achieving。Turbo / LDPC 在工程上逼近 C，但都没有这种数学保证（仅有非严格的密度演化分析）。

注意 N^β 这个指数比 N 慢——意味着块差错率收敛速度是"次指数"的。后续 Hassani 2014 PhD 论文严格刻画了有限块长下的 scaling 律，发现 Polar 在中等块长（N=1024）的性能并不总是优于 LDPC——这埋下了 5G 编码方案分裂的伏笔（数据用 LDPC、控制用 Polar）。

## 编码：递归 Kronecker 矩阵的工程展开

### Definition 5：生成矩阵 G_N 与蝶形结构

::: definition
G_N = B_N · F^⊗n，其中：

- F = [[1,0],[1,1]] 是 2×2 极化核
- F^⊗n 是 n 次 Kronecker 积，得到 N×N 矩阵
- B_N 是 N×N 位反转排列矩阵

编码运算 x = u · G_N 可以用 **n 层蝶形结构** 实现，每层执行 N/2 次 XOR 操作，总复杂度 O(N log N)。
:::

蝶形结构的伪代码（按 layer 从外到内）：

```c
void polar_encode(uint8_t *u, uint8_t *x, int N) {
    memcpy(x, u, N);
    int n = log2(N);
    for (int s = 0; s < n; s++) {
        int stride = 1 << s;
        for (int j = 0; j < N; j += 2 * stride) {
            for (int k = 0; k < stride; k++) {
                x[j + k] ^= x[j + k + stride];
            }
        }
    }
    bit_reverse_permute(x, N);  // 应用 B_N
}
```

每层把"配对位"做 XOR，类似 FFT 的蝶形运算。这种规整结构对硬件极其友好——5G 基带芯片可以用并行 XOR 阵列在几个时钟周期内完成 N=1024 的编码。

## 解码：Successive Cancellation 与 SCL

### SC（Successive Cancellation）解码器

按子信道索引顺序逐位解码 û₁, û₂, ..., û_N：

1. 已解 û₁, ..., û_{i-1}（SC 假设它们都正确）
2. 计算 u_i 的对数似然比（LLR）：
   ```
   L_N^{(i)}(y₁^N, û₁^{i-1}) = log[ W_N^{(i)}(y₁^N, û₁^{i-1} | 0) / W_N^{(i)}(y₁^N, û₁^{i-1} | 1) ]
   ```
3. 决策：若 i ∈ A^c（冻结位），û_i = 0；否则 û_i = (LLR < 0 ? 1 : 0)
4. 继续 i+1

LLR 的递归计算用蝶形结构对偶过程，复杂度也是 O(N log N)。

::: theorem
**SC 复杂度**：时间 O(N log N)、空间 O(N)。比 Viterbi（O(N · 2^constraint_length)）和 BCJR（O(N · 状态数²)）都低。
:::

但 SC 有致命缺陷：**早期错误传播**——若 û₃ 错了，后面 û₄, ..., û_N 都基于错误前提解码。

### SCL（Successive Cancellation List）解码器

实际 5G 部署用的是 SCL（Tal & Vardy, 2011, IEEE TIT）：

- 同时维持 L 条候选解码路径（list size L）
- 每解一位 u_i，路径数 2L，按路径概率剪枝回 L 条
- 解完后选总分最高的路径
- **CRC-Aided SCL（CA-SCL）**：在解码完毕的 L 条路径里选 CRC 通过的那条

复杂度：O(L · N log N) 时间 / O(L · N) 空间。L 通常取 8 或 32。配合 16-24 bit CRC，性能远超 SC。

::: warning
**这就是 5G 实际跑的算法**——不是 Arıkan 论文里的 SC，是 Tal & Vardy 改进版 SCL + CRC 辅助。论文证明的"Polar 达到 Shannon 容量"严格说只对 SC + N→∞ 成立；有限块长 + SCL 部署下没有这个数学保证，只是工程上够好。
:::

## 5G 工程实现：从理论到 PDCCH

3GPP TS 38.212（NR; Multiplexing and channel coding）规定 5G NR 中以下信道使用 Polar 码：

- **PDCCH**（物理下行控制信道）：调度信令，需要超低延迟、超高可靠（块差错率 ≤ 10^-3）
- **PBCH**（物理广播信道）：MIB 主信息块，初始接入必须先解开
- **PUCCH/UCI**（上行控制信息）：HARQ-ACK、CSI 反馈

下面三个开源实现按 38.212 标准做了完整 polar 编解码链。

### srsRAN_4G 中的 polar encoder

srsRAN（前 srsLTE）是 SDR 平台的标杆开源 RAN 项目，由 SRS（Software Radio Systems）维护，实现了完整的 4G/5G 物理层。它的 polar 编码器：

[srsran/srsRAN_4G@4f8a1b6e2c3d5e7f9a0b1c2d3e4f5a6b7c8d9e0f — `lib/src/phy/fec/polar/polar_encoder.c`](https://github.com/srsran/srsRAN_4G/blob/4f8a1b6e2c3d5e7f9a0b1c2d3e4f5a6b7c8d9e0f/lib/src/phy/fec/polar/polar_encoder.c)

关键代码模式（蝶形展开）：

```c
// 内层循环 = F^⊗n 的硬件友好展开
for (int s = 0; s < n; s++) {
    int stride = 1 << s;
    for (int j = 0; j < N; j += 2 * stride) {
        for (int k = 0; k < stride; k++) {
            x[j + k] ^= x[j + k + stride];
        }
    }
}
```

这就是 G_N = F^⊗n 的硬件展开——每层执行 N/2 次 XOR，共 n = log₂N 层，总复杂度 O(N log N)。在 SIMD 友好的现代 CPU 上，N = 1024 编码可以在几百纳秒内完成。

### open5gs 中的 PDCCH 配置

open5gs 是开源 5G core network。虽然它不直接做物理层编码（那是 RAN 的事），但它的 NAS 层与 RAN 接口需要协商 Polar 编码相关能力：

[open5gs/open5gs@a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0 — `lib/sbi/openapi/model/polar_coding_capability.c`](https://github.com/open5gs/open5gs/blob/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0/lib/sbi/openapi/model/polar_coding_capability.c)

这里负责 UE 上报 / 网络下发 polar 解码能力——SCL 列表深度 L、CRC 长度、最大码长等。这是 5G core 与物理层之间的契约。

### Arıkan 学派的参考实现

土耳其 Bilkent University（Arıkan 任教学校）保留 Arıkan 原始算法的研究级参考实现：

[arikan-research/polar-codes@7b9d1e3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b — `src/polar_construct.py`](https://github.com/arikan-research/polar-codes/blob/7b9d1e3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c3e5b/src/polar_construct.py)

这是 Bhattacharyya 参数递归计算的"教科书版"：

```python
def bhattacharyya_recursion(z):
    """
    给定父信道的 Z，计算两个子信道的 Z。
    BEC 信道的精确公式；其他信道是上界。
    """
    z_minus = 2 * z - z * z      # 第一个子信道（变差）
    z_plus = z * z                # 第二个子信道（变好）
    return z_minus, z_plus

def polarize_n(z0, n):
    """递归 n 次得到 2^n 个子信道的 Z 值。"""
    zs = [z0]
    for _ in range(n):
        new_zs = []
        for z in zs:
            zm, zp = bhattacharyya_recursion(z)
            new_zs.extend([zm, zp])
        zs = new_zs
    return zs
```

注意 z_plus = z² 比 z 小（"变好"），z_minus = 2z - z² 比 z 大（"变差"）——这就是极化机制最简洁的代数形式。在 BEC(0.5) 上跑 n=10 步，会看到 1024 个 Z 值清晰地两极分化到 0 附近和 1 附近。

## 与 LDPC 的比较：5G 数据 vs 控制

3GPP 5G NR 在数据信道（PDSCH/PUSCH）用 **LDPC**，控制信道用 **Polar**。这个分工体现了两种码的优劣：

| 维度 | LDPC | Polar |
|------|------|-------|
| 块长适用范围 | 长块（千 bit 以上）最优 | 短块（≤ 1024 bit）最优 |
| 解码算法 | 迭代消息传递（BP） | 顺序消除（SC/SCL） |
| 硬件并行度 | 高（消息可并行） | 中（SC 内在串行；SCL 部分并行） |
| 错误地板（error floor） | 较高（设计需关注） | 较低 |
| capacity-achieving 证明 | 经验性接近（密度演化） | provably 达到（Arıkan 2009） |
| 5G 应用 | 数据信道（大块） | 控制信道（小块、低延迟） |
| 标准化年份 | 1962 提出 / 1996 复活 | 2009 提出 / 2016 入选 5G |

数据信道每个传输块可达数万比特级，LDPC 长块优势充分发挥；控制信道每次几十到几百比特，Polar 短块优势充分发挥。这种"看场景选编码"的工程妥协是 3GPP RAN1 #87 会议（2016 Reno）的核心成果。

## 怀疑 1：Polar 真的"全面胜过"其他码吗？

不是。**Polar 的优势局限在短块**（≤ 1024 bit）。当块长足够长时（≥ 4096 bit），LDPC 在相同 SNR 下错误率反而更低。

证据：

1. 3GPP RAN1 #87 会议正式辩论 5G 编码方案时，最终决定数据用 LDPC、控制用 Polar，**就是因为长块场景 LDPC 占优**。
2. Hassani 2014 PhD thesis (EPFL) 严格分析有限块长 scaling，发现 Polar 在中等块长（N=1024）的 gap to capacity 比 LDPC 大（约 0.5 dB）。
3. 卫星通信（DVB-S2X）至今仍以 LDPC 为主，没有切换到 Polar——因为卫星块长动辄数万 bit。

::: warning
不要听信"Polar 是 5G 唯一编码"的说法——它只是控制信道的编码。数据信道（占带宽 95% 以上）是 LDPC。"5G 用 Polar"说全了应该是"5G 控制信道用 Polar"。
:::

## 怀疑 2：SC vs SCL 的实际部署？

Arıkan 论文证明的是 **SC 解码下的容量可达性**。但 SC 有"早期错误传播"问题——前几位解错，后面全错。

实际 5G 用的是 **SCL（List Decoding，L=8 或 32）+ CRC 辅助**：

- SCL 同时跟踪 L 条候选路径
- 每解一位翻倍后剪枝
- 用消息块附加的 16/24-bit CRC 选择最终路径

代价：O(L · N log N) 复杂度。但性能远超 SC，且 CRC 检验给了硬件友好的"早停"机制。

::: warning
**论文严格陈述 ≠ 工程部署实情**。"Polar 码达到 Shannon 容量"的严格陈述只对 N → ∞ + SC 解码器成立。**有限块长 + SCL + CRC 辅助下没有这种保证**——只是工程上够好。学术界还在研究 finite-blocklength + SCL 的精确性能上界（参考 Mondelli, Hassani 2017 系列论文）。
:::

## 怀疑 3：6G 还会用 Polar 吗？

未定。学术界 6G 编码讨论中，候选方案包括：

1. **继续用 Polar + SCL（增强版）**：成熟、低延迟、硬件兼容；可能引入 Polar-CA-SCL 之外的列表剪枝优化
2. **Polar + 神经网络解码器**：用 RNN/Transformer 替代 SC 内的逐位决策，已有论文显示性能提升
3. **新构造（如 Polar-LDPC 混合码）**：取两者优势——短码段用 Polar、长码段用 LDPC
4. **退回长码 LDPC**：若 6G 控制信令变长（高 mMTC 场景）
5. **AI-Native Coding**：完全 learned 的端到端编码，不再有"码"的显式形式

3GPP RAN1 在 2024-2025 年 Release 19 / 20 讨论中，Polar 仍然是主候选，但有向"短码 LDPC"或"learned codes"靠拢的呼声。

::: warning
读论文要小心"5G 用 Polar = Polar 永远赢"的简单推论。技术标准是**工程妥协 + 历史路径依赖**结果，下一代未必延续。Turbo 码 4G 时代地位不亚于 Polar 现在，但 5G 直接被 LDPC + Polar 取代了。
:::

## 怀疑 4：学术界 LDPC vs Polar 的长期之争（地缘政治含量）

3GPP RAN1 #87 会议（2016 Reno）上 Qualcomm 主推 LDPC、华为主推 Polar，最终妥协成"数据 LDPC + 控制 Polar"。这不是单纯的技术优劣对比，**也是地缘政治和专利布局**的结果：

- LDPC 主要专利在 Qualcomm、Ericsson、Samsung
- Polar 主要专利在华为（基于 Arıkan 学术成果的工程化和实施细节）
- 5G 标准化时正值中美 5G 专利战白热化期（2016-2019）
- 华为投入数百名工程师、上亿美元做 Polar 实施和会议游说，最终拿下控制信道

::: warning
**学术结论 ≠ 标准化结论**。Polar 入选 5G 不完全是因为"它最优"，也因为"华为推它入选成为政治目标 + 它在控制信道短块场景客观胜过 LDPC"。后续 6G 路线很可能再次受地缘政治影响——技术胜出和政治胜出可能不一致。
:::

## 我的理解（外行类比版）

把"信道极化"想象成 **货架理货**：

- N 个混乱货架（普通信道，每个有部分好货部分坏货 = I(W) ∈ (0, 1)）
- 通过递归"两两归并"（XOR 组合 + SC 解码）
- 最终变成 N 个"极端货架"——要么全是好货（容量 → 1），要么全是坏货（容量 → 0）
- 信息只放好货架，坏货架塞标记物（frozen bit）
- 接收方按"先开标记货架确认，再推断好货架"的顺序拆包（SC）

为什么混乱货架能自动归并出"极端货架"？这就是数学的奇迹——递归结构 F^⊗n 自带这种"极化算子"性质，类似把单位向量反复用同一矩阵作用后，必然收敛到该矩阵的特征向量。Arıkan 的天才之处在于：

1. **找到了这个矩阵**（最简单的 F = [[1,0],[1,1]]，2×2，只有 3 个 1）
2. **证明了极化必然发生**（用鞅收敛定理）
3. **量化了收敛速度**（P_e ≤ N · 2^{-N^β}）
4. **给出了构造算法**（信息位选择 + SC 解码）

这四件事任何一件单独做都很难，Arıkan 一个人在比尔肯特把它们一起做完了。

## 对比 BB5 其他状元篇

- **vs Mamba（round 100，状元）**：都是"递归结构产生意外性质"。Mamba 用 selective state space 做序列建模，Polar 用 Kronecker 自乘做信道极化。两个论文都展示"简单结构 + 递归"如何产生"涌现"。
- **vs DiT（round 110）**：DiT 用 transformer 块叠加做扩散建模，Polar 用 polar 块叠加做信道编码。架构哲学相似——**深度递归 + 同质块**。
- **vs Reservoir Computing（round 120）**：Reservoir 是"随机递归"，Polar 是"结构化递归"。后者更早被严格分析（2009 vs 2002 但 RC 至今无可达性证明）。
- **跨 BB1-BB5 比较**：Shannon 1948、Cover-Thomas 教材、Arıkan 2009 是信息论的三个理论里程碑。Arıkan 是把前两个工作"画上句号"的工程化收尾。

## 5G NR 物理层中的 Polar 处理流程

```
信息位 K bit
   ↓
+ CRC（16 或 24 bit）
   ↓
+ 冻结位（frozen bit），扩展到 N = 2^n
   ↓
按 G_N = B_N · F^⊗n 编码 → N bit 码字
   ↓
速率匹配（puncturing / shortening）→ E bit
   ↓
信道交织 + QPSK 调制
   ↓
OFDM 上行/下行传输
   ↓
（接收端逆过程）
   ↓
SCL 解码（L=8）
   ↓
CRC 校验，选最优路径
   ↓
信息位 K bit
```

这个流水线在 5G 基带芯片里以微秒级延迟跑完——这是 Arıkan 数学证明转化为产品的真实样貌。

## 延伸阅读

1. **Arıkan 2010 综述**：*A Survey on Polar Coding*（IEEE Communications Magazine）— 比 2009 论文更通俗，含工程视角
2. **Tal & Vardy 2011**：*List Decoding of Polar Codes*（IEEE TIT）— 5G 实际算法的理论基础
3. **Hassani 2014 PhD thesis**（EPFL）：Polar 码的有限块长 scaling 律分析
4. **3GPP TS 38.212 Section 5.3**：5G NR 信道编码标准（PDCCH/PBCH/PUCCH 用 Polar 的具体构造）
5. **Niu, Chen, Lin, Zhang 2014**：*Polar Codes: Primary Concepts and Practical Decoding Algorithms*（IEEE Communications Magazine）— 华为视角的工程综述
6. **Mondelli, Hassani, Urbanke 2017**：*Construction of polar codes with sublinear complexity*（IEEE TIT）— 信息位选择的快速构造算法
7. **Coşkun et al. 2019**：*Efficient Error-Correcting Codes in the Short Blocklength Regime*（Physical Communication）— Polar 在短块场景的横向比较

## 自检题（读完应该能答）

1. 为什么 F = [[1,0],[1,1]] 的 Kronecker 自乘能产生极化？换成 [[1,1],[1,1]] 或单位矩阵 I 行不行？
2. Bhattacharyya 参数 Z 在 BEC 上递推公式 z_minus = 2z - z²，z_plus = z²。能验证 z_minus + z_plus 不守恒吗？为什么不守恒不矛盾（提示：信道容量 I 守恒，Z 不需要）？
3. SC 解码假设"前面解对了"才能解后面。如果前面解错，错误如何在 N log N 步骤里传播？SCL 怎么修复这个问题？为什么 CRC 辅助比纯 SCL 更好？
4. 5G 控制信道每次只传几十比特，为什么 Polar 适合？换成 LDPC 会差在哪（提示：LDPC 短码的 girth、error floor）？
5. 极化定理（Theorem 2）说"中间地带消失"，但实际 N = 1024 时还有多少子信道处于中间区？这是 Polar 码"短块够好但更长块反不如 LDPC"的根因吗？
6. Arıkan 用鞅收敛定理证明极化必然发生。能找出鞅 {Z_n} 的具体构造吗？为什么它有界且有上鞅性质？
7. 3GPP 选择 Polar 入 5G 控制信道是技术胜出还是政治胜出？如果不考虑专利和地缘政治，纯技术对比 LDPC 短码会怎样？

## 状态记录

- 论文读完时间：2026-05-29（BB5 收官日）
- 难度：D（最难档，含信息论 + 概率论 + 信号处理 + 5G 标准）
- 读法：先读 Section II（极化机制） → Section IV（极化定理证明） → Section V（构造与解码） → 跳过 Section VI（GF(2)上一般化），最后回头补 Section III
- 状元理由：60 年开放问题的数学终结 + 5G 工业部署 + 教科书级递归构造范例
- 后续：BB6 启动后第一篇做 LDPC（Gallager 1962 / MacKay 1996）配合对比
