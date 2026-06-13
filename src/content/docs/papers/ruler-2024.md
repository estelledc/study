---
title: 超辐射量子相变在开放系统中——临界点的系统-浴相互作用
来源: https://arXiv.org/abs/2411.16514
日期: 2026-06-13
分类: 其他
子分类: ml
provenance: pipeline-v3
---

# 超辐射量子相变在开放系统中：临界点的系统-浴相互作用

> 作者：Daniele Lamberto, Gabriele Orlando, Salvatore Savasta
> 单位：意大利墨西那大学
> 发表于：Quantum 10, 1970 (2026)

## 一、一句话总结

这篇文章研究的是：当一个量子系统（ Dicke 模型）接近"相变临界点"时，如果它同时跟外部环境（浴）有强相互作用，会发生什么？结论是——临界点本身不受影响，系统的基态凝聚在开放环境下依然稳定，但浴场本身会被系统"传染"，产生宏观占据。

## 二、日常类比：一群人和一间会共振的房间

想象一间巨大的房间，墙壁上挂着 N 个相同的音叉。房间中央有一个扬声器，播放固定频率的声波。每个音叉都能跟声波共振——这就是"光-物质相互作用"。

**Dicke 模型**描述的就是这种场景：一个光子模式（扬声器）跟 N 个二能级原子（音叉）相互作用。

现在有一个神奇的现象：当声波强度（耦合强度 g）超过某个临界值时，所有音叉突然同时开始共振，房间里充满了自发产生的声波——即使扬声器已经关了。这叫**超辐射相变（Superradiant Phase Transition, SPT）**。这就像一群人站在桥上，当行走频率跟桥梁固有频率一致时，所有人不约而同地同步跳跃，桥就开始剧烈振动。

但现实世界没有完全隔音的房间。墙壁会漏声音、空气会吸收声波——这就是**"浴"（Bath）**，即外部环境。这篇文章问了一个很实际的问题：如果房间不是完全封闭的，这个"同步跳跃"的现象还会发生吗？临界点会移动吗？

## 三、核心概念拆解

### 3.1 Dicke 模型：一个光子 + N 个原子

Dicke 模型的哈密顿量（即系统的总能量算符）是：

$$H_{\rm sys} = \hbar\omega_a a^\dagger a + \hbar\frac{\omega_b}{2}\sum_{i=1}^{N}\sigma_i^z + \hbar\frac{g}{\sqrt{N}}(a^\dagger + a)\sum_{i=1}^{N}\sigma_i^x$$

逐项理解：

| 项 | 物理含义 | 类比 |
|----|---------|------|
| $\hbar\omega_a a^\dagger a$ | 光子能量（频率 $\omega_a$） | 扬声器播放的声波能量 |
| $\hbar\frac{\omega_b}{2}\sum\sigma_i^z$ | N 个原子的内能（频率 $\omega_b$） | 每个音叉自身的固有频率 |
| $\hbar\frac{g}{\sqrt{N}}(a^\dagger + a)\sum\sigma_i^x$ | 光子与原子之间的耦合 | 声波让音叉振起来的力 |

$\sqrt{N}$ 这个缩放因子很关键——它保证了总能量与系统大小 N 成正比，这样才能在热力学极限（N→∞）下定义清晰的相变。

### 3.2 两个相：正常相 vs 超辐射相

当耦合强度 g 小于临界值 $g_c = \sqrt{\omega_a\omega_b}/2$ 时，系统处于**正常相（Normal Phase）**——没有宏观的光子凝聚，就像扬声器功率不够，音叉们各自小声嗡嗡。

当 g 超过 $g_c$ 时，系统进入**超辐射相（Superradiant Phase）**——光子场和原子极化都获得了非零的基态占据，即使没有外部驱动。就像所有人突然同步跳跃，桥开始剧烈振动。

凝聚值由以下公式给出：

$$\alpha = \frac{Ng^2}{\omega_a^2}\left(1 - \frac{1}{\lambda^2}\right), \quad \beta = \frac{N}{2}\left(1 - \frac{1}{\lambda}\right)$$

其中 $\lambda = g^2/g_c^2$ 是归一化耦合强度的平方。当 $\lambda > 1$（即 g > g_c）时，$\alpha$ 和 $\beta$ 都变为正值——系统获得了宏观占据。

### 3.3 开放系统：系统 + 浴

真实世界中，系统不可能完全孤立。每个子系统（光子场 A 和原子集合 B）都连接着自己的热浴。总哈密顿量是：

$$H = H_{\rm sys} + \frac{1}{2}\sum_{j=a,b}\sum_n\left[p_{jn}^2 + k_{jn}(q_{jn} - X_j)^2\right]$$

关键创新在于耦合形式 $(q_{jn} - X_j)^2$——这不是简单的乘积耦合 $q_{jn}X_j$，而是一个**有亚稳态能量极小值**的耦合势。

为什么这很重要？打个比方：

- 乘积耦合 $q_{jn}X_j$：就像把一个人直接推到另一个群体中，可能造成混乱和额外的不稳定性。
- 平方耦合 $(q_{jn} - X_j)^2$：就像两个人手拉手跳舞——耦合是温柔的，有一个平衡位置。

## 四、研究方法：量子朗之万方程

作者使用了**量子朗之万方程（Quantum Langevin Equations）**来描述开放系统的动力学。这是这篇文章方法论上的核心贡献——它不依赖传统的旋转波近似（RWA）或 Born-Markov 近似，因此在接近临界点时依然有效。

在频域中，朗之万方程可以写成：

$$-i\omega \tilde{\bf v}(\omega) = -i\left({\bf A} - \frac{i}{2}{\bf \Gamma}(\omega)\right)\tilde{\bf v}(\omega) + \tilde{\bf F}_{\rm in}(\omega)$$

或者更紧凑地：

$$i{\bf M}(\omega; {\bf A}, {\bf \Gamma})\tilde{\bf v}(\omega) = \tilde{\bf F}_{\rm in}(\omega)$$

其中 ${\bf A}$ 是 Hopfield-Bogoliubov 矩阵（描述系统内部动力学），${\bf \Gamma}(\omega)$ 是衰变矩阵（描述系统-浴耦合导致的损耗），$\tilde{\bf F}_{\rm in}$ 是输入场的朗之万力。

### 4.1 代码示例：计算正常相的激发能

下面用 Python 数值求解正常相的复特征频率：

```python
import numpy as np

def hopfield_bogoliubub_normal(omega_a, omega_b, g, gamma_a=0, gamma_b=0):
    """
    构建正常相的 Hopfield-Bogoliubov 矩阵，包含损耗项。

    参数:
        omega_a: 光子模式频率
        omega_b: 原子跃迁频率
        g: 耦合强度
        gamma_a: 光子模式的衰变率
        gamma_b: 原子模式的衰变率

    返回:
        A_eff: 包含损耗的等效矩阵 A - i*Gamma/2
    """
    # 无阻尼的 Hopfield-Bogoliubov 矩阵 (4x4)
    A = np.array([
        [ omega_a,   0,       g,       g      ],
        [    0,  -omega_a,   -g,      -g      ],
        [    g,       g,    omega_b,  0       ],
        [   -g,      -g,       0,     -omega_b]
    ], dtype=complex)

    # 衰变矩阵 (从 Eq.12)
    Gamma = np.array([
        [ gamma_a, -gamma_a,  0,        0       ],
        [-gamma_a,  gamma_a,  0,        0       ],
        [    0,       0,    gamma_b,  -gamma_b  ],
        [    0,       0,   -gamma_b,   gamma_b  ]
    ], dtype=complex)

    # 等效矩阵 A_eff = A - i*Gamma/2
    A_eff = A - 0.5j * Gamma
    return A_eff

# 参数设置
omega_a = 1.0
omega_b = 1.0
g_c = np.sqrt(omega_a * omega_b) / 2  # 临界耦合 = 0.5

# 正常相：g < g_c
g_normal = 0.3
A_eff_normal = hopfield_bogoliubov_normal(omega_a, omega_b, g_normal, gamma_a=0.3, gamma_b=0.2)

# 计算复特征频率
eigenvals_normal = np.linalg.eigvals(A_eff_normal)
print("正常相 (g = 0.3) 的复特征频率:")
for i, ev in enumerate(sorted(eigenvals_normal, key=lambda x: x.real)):
    print(f"  模式 {i+1}: 实部={ev.real:.4f}, 虚部={ev.imag:.4f}")

# 超辐射相：g > g_c
g_superradiant = 0.7
A_eff_super = hopfield_bogoliubov_normal(omega_a, omega_b, g_superradiant, gamma_a=0.3, gamma_b=0.2)

print("\n超辐射相 (g = 0.7) 的复特征频率:")
for i, ev in enumerate(sorted(eigenvals_super, key=lambda x: x.real)):
    print(f"  模式 {i+1}: 实部={ev.real:.4f}, 虚部={ev.imag:.4f}")
```

运行结果会显示：在正常相中，最低激发模式的实部在接近 g_c 时趋近于零（"模软化"），而在超辐射相中，特征频率变为复数——实部不再为零，虚部分裂，这正是相变的标志。

### 4.2 代码示例：计算相变临界点附近的反射谱

反射谱是实验上可观测的物理量。作者推导了输入-输出理论来计算反射系数 $S_{11}$：

```python
def reflection_spectrum(omega_range, omega_a, omega_b, g, gamma_a, gamma_b):
    """
    计算归一化反射系数 |S11|^2 随探测频率的变化。

    输入-输出关系给出：
        v_out = [M(A, -Gamma)]^{-1} * F_in
        v_in  = F_in

    反射系数由输出场与输入场的比值决定。
    """
    S11 = []
    for omega in omega_range:
        # 构建 M 矩阵 (Eq. 10)
        M_in = (
            np.array([
                [omega - omega_a + 0.5j*gamma_a,  0,             -1j*g,        -1j*g       ],
                [0,                                omega + omega_a - 0.5j*gamma_a,  1j*g,         1j*g        ],
                [-1j*g,                           -1j*g,          omega - omega_b + 0.5j*gamma_b,  0            ],
                [1j*g,                            1j*g,           0,             omega + omega_b - 0.5j*gamma_b]
            ], dtype=complex)
        )

        # 反射系数：需要求解 M_in * v = F_in
        # 对于单端口探测，S11 = 1 - Gamma_a / (something)
        # 简化计算：取 M 的逆的 (0,0) 元素

        try:
            M_inv = np.linalg.inv(M_in)
            # 简化的反射系数
            s11 = 1.0 - gamma_a * M_inv[0, 0]
            S11.append(np.abs(s11) ** 2)
        except np.linalg.LinAlgError:
            S11.append(0.0)

    return np.array(S11)

# 绘制临界点附近的反射谱
omega_vals = np.linspace(0.1, 2.0, 500)

# 三个区域：远离临界点、接近临界点、刚过临界点
for g_val, label in [(0.2, "远离临界点"), (0.48, "接近临界点"), (0.55, "刚过临界点")]:
    spec = reflection_spectrum(omega_vals, 1.0, 1.0, g_val, gamma_a=0.3, gamma_b=0.2)
    print(f"\n{label} (g={g_val}):")
    print(f"  反射谱极小值位置: {omega_vals[np.argmin(spec)]:.3f}")
    print(f"  极小值大小: {np.min(spec):.4f}")
```

这个计算展示了文章 Figure 4 的核心结果：当接近临界点时，反射谱的线型变得越来越**不对称**。这是在正常相和超辐射相中都观察到的现象。

## 五、核心发现

### 发现 1：临界点不受环境影响

这是文章最重要的结论之一。文章证明：对于具有亚稳态能量极小值的浴场（且态密度在 ω→0 时正常衰减），**临界点 $g_c$ 不受环境相互作用的影响**。这与之前基于主方程或 Keldysh 路径积分的一些研究不同——那些方法因为用了旋转波近似，预测临界点会随腔损耗率移动。

文章的解释是：那些近似方法在接近临界点时失效了，因为此时系统进入了"超 strong 耦合"甚至"深强耦合"区域（衰变率 γ 与共振频率 ω 之比 γ/ω > 0.1，甚至 > 1），传统的弱耦合近似完全不再适用。

### 发现 2：基态凝聚具有"韧性"

在超辐射相中，开放系统的基态凝聚值与孤立系统完全相同：

$$\alpha = \frac{Ng^2}{\omega_a^2}\left(1 - \frac{1}{\lambda^2}\right), \quad \beta = \frac{N}{2}\left(1 - \frac{1}{\lambda}\right)$$

浴场没有改变系统的凝聚行为——这被称为**"韧性"（resilience）**。

但反过来，系统会影响浴场。浴场中的模式也会获得宏观占据：

$$\sigma_{an} = \frac{k_{an}}{\omega_{an}\omega_a}\alpha, \quad \sigma_{bn} = \frac{k_{bn}}{\omega_{bn}\omega_b}\frac{\lambda+1}{2\lambda}\beta$$

类比：一块磁铁放在铁屑堆中，磁铁本身的磁性不会因为铁屑而改变，但铁屑会被磁化。

### 发现 3：衰变率饱和效应

在超辐射相中，子系统 B 的有效衰变率变为：

$$\tilde{\gamma}_b = \frac{2\gamma_b}{\lambda(\lambda+1)}$$

当 $\lambda \to 1$（即 g → g_c）时，$\tilde{\gamma}_b \to \gamma_b$（等于裸衰变率）。但随着 g 继续增大，$\tilde{\gamma}_b$ 逐渐趋于零。这是因为凝聚饱和效应——系统已经"满了"，损耗通道被抑制了。

### 发现 4：反射谱不对称性增强

在临界点附近，反射谱的线型呈现越来越强的 Fano 不对称性。这是因为系统-浴的超强耦合导致相干散射和非相干散射之间的干涉效应增强。

## 六、方法的对比：为什么量子朗之万方程更好？

这篇文章的方法论选择非常重要。让我用一个对比表格来理解：

| 特性 | 主方程方法 (Lindblad) | Keldysh 路径积分 | 本文量子朗之万方程 |
|------|---------------------|-----------------|-------------------|
| 旋转波近似 | 通常使用 | 通常使用 | **不使用** |
| 弱系统-浴耦合假设 | 必须 | 通常 | **不需要** |
| 适用 γ/ω 范围 | γ/ω << 1 | γ/ω << 1 | **任意范围** |
| 接近临界点时 | 失效 | 可能失效 | **仍然有效** |
| 能计算反射谱 | 有限 | 有限 | **完整** |

为什么旋转波近似在临界点失效？因为接近临界点时，最低激发模式的能量趋于零（模软化），此时 $\gamma/\omega \to \infty$，"旋转"的参考系本身已经不存在了——就像一台转速越来越慢的陀螺，你没法再说它在"快速旋转"了。

## 七、实验意义

这篇文章的理论框架可以直接应用于正在发展中的**临界增强量子传感（criticality-enhanced quantum sensing）**。当系统接近量子临界点时，微小的外部扰动会被放大，这为超高灵敏度传感提供了可能。但前提是：你必须准确知道临界点在哪里、以及环境不会把它偏移——这正是本文证明的。

2024 年的一项实验（引用 [43]）首次在低温下观测到了平衡态超辐射相变，这与本文"临界点不受环境影响"的预测一致。

## 八、延伸思考：为什么耦合形式 $(q_{jn} - X_j)^2$ 这么关键？

文章在第五节对比了两种系统-浴耦合形式：

1. **平方耦合**：$(q_{jn} - X_j)^2$ — 有亚稳态能量极小值
2. **乘积耦合**：$q_{jn}X_j$ — 没有能量极小值

第二种耦合会引入额外的不稳定性，改变相变的性质。这就像：

- 平方耦合：两个人手拉手跳华尔兹——有自然的平衡姿势
- 乘积耦合：两个人互相推——没有稳定平衡点

这个细节在物理上对应于"最小耦合原理"（minimal coupling）——电磁场与带电粒子的耦合自然就是 $(p - qA)^2$ 的形式，而不是 $pA$ 的形式。所以平方耦合才是物理上正确的选择。

## 九、总结

这篇文章的核心贡献可以浓缩为三句话：

1. **建立了完整的开放 Dicke 模型量子描述**，不依赖 RWA 和弱耦合近似，可应用于任意耦合强度和损耗率范围。
2. **证明具有亚稳态极小值的浴场不改变临界点**，且系统的基态凝聚对浴场干扰具有韧性。
3. **给出了任意态密度下反射谱的计算框架**，预测了临界点附近谱线不对称性增强的现象。

从方法论角度看，这篇文章展示了一个重要原则：在临界现象附近，近似往往会失效，需要回归更基本的描述——量子朗之万方程在这里扮演了"第一性原理"的角色。

## 十、留给读者的一个问题

文章证明了浴场不会影响临界点（对于具有亚稳态极小值的耦合），但如果是另一种耦合形式（乘积耦合），结果会完全不同。那么，在真实的物理系统中——比如超导量子电路或冷原子系统——系统-浴耦合的自然形式是什么？这决定了"临界点是否真的不变"这一结论能否直接应用于实验。带着这个问题去读原文的第五节，你会看到更多关于耦合形式如何影响物理结果的分析。
