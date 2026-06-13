---
title: 原子晶格上的位错动力学模拟——碰撞规则的影响
来源: https://arxiv.org/abs/2605.30682
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# 原子晶格上的位错动力学模拟——碰撞规则的影响

## 一、从"一群走路的人"说起

想象一条环形跑道，上面有一群人正在走动。每个人有两种身份：红色（正电荷）或蓝色（负电荷）。

- 同样颜色的人互相排斥——看到同色的人会绕着走
- 不同颜色的人互相吸引——看到异色的人想靠近
- 当两个不同颜色的人在同一个位置相遇时，他们会"抵消"——两个人一起消失

这听起来像什么？这正是这篇论文研究的**一维周期性晶格上位错（dislocation）的运动模型**。

位错是金属晶体中的线缺陷。它们的运动决定了金属的塑性和强度。每个位错携带一个拓扑荷（Burgers vector），取值为 +1 或 -1。当正负位错相遇时会相互湮灭，修复晶格。

这篇论文的核心问题是：**微观层面如何处理"碰撞"，会如何影响宏观层面的演化规律？**

## 二、两个模型：保存 vs 湮灭

作者提出了两种离散模型，唯一的区别就是碰撞规则：

### 模型 A：`(P_n^csv)` — 碰撞后全部保存

- 位错碰撞时不做特殊处理
- 即使两个位错在同一位置，它们仍然各自存在
- 正负位错的总数都守恒

### 模型 B：`(P_n^ann)` — 碰撞后异号湮灭

- 当正负位错碰撞时，两者立即从系统中移除
- 只有同号位错会继续存在
- 净 Burgers 向量（正减负）守恒，但总数量减少

## 三、从微观到宏观：为什么这个问题重要

你可以把这个问题理解为"还原论"的一个具体例子：

> 微观粒子的行为规则，如何决定宏观物质的演化方程？

具体来说，作者想验证：

| 离散模型 | 对应的连续 PDE 模型 |
|----------|---------------------|
| `(P_n^csv)` | Groma-Balogh 方程 `(P_∞^csv)` |
| `(P_n^ann)` | 带湮灭项的守恒律 `(P_∞^ann)` |

如果离散模型确实收敛到对应的连续模型，我们就建立了"原子尺度"和"材料尺度"之间的数学桥梁。

## 四、核心概念详解

### 4.1 晶格与参数

考虑一个一维周期晶格 `Λ_ε = {0, ε, 2ε, ..., 1-ε}`，其中 `ε` 是晶格间距与宏观周期的比值。

三个关键参数：

- **ε** — 晶格精细程度（越小越精细）
- **n** — 位错数量（越大密度越高）
- **β** — 相互作用能与热能之比（越大温度越低）

渐近 regime 的要求：`n ≫ 1`, `1/ε ≫ 1`, `n ≪ 1/ε`（稀疏缩放）, `β → ∞`（低温）

### 4.2 跳跃速率公式

每个位错 `i` 可以向左或向右跳到相邻格点，速率由 Kramers 公式给出：

```
r_±,i(L) = (1 / (βε²)) × exp( ±½ βε F_i(L) )
```

其中 `F_i(L)` 是作用在位错 `i` 上的合力，来自所有其他位错的弹性相互作用：

```
F_i(L) = (1/n) Σ_j b_i·b_j · f(L_i - L_j)
```

这里的 `f(x) = π / tan(πx)` 是 Volterra 公式的无量纲形式，描述了位错间的长程相互作用。

### 4.3 连续极限方程

**(P_∞^csv) — Groma-Balogh 方程：**

```
∂_t ρ⁺ = -∂ₓ(ρ⁺ · v[κ])
∂_t ρ⁻ = +∂ₓ(ρ⁻ · v[κ])
v[κ] = f * κ       （卷积）
```

其中 `κ = ρ⁺ - ρ⁻` 是净 Burgers 向量密度。这是一个连续性方程组，`ρ⁺` 和 `ρ⁻` 各自守恒。

**(P_∞^ann) — 带湮灭的守恒律：**

```
∂_t κ = -∂ₓ(|κ| · v[κ])
```

这里没有分别追踪 `ρ⁺` 和 `ρ⁻`，而是直接追踪净密度 `κ`。`|κ|` 项体现了湮灭效应——当正负位错共存时，它们的"绝对密度"大于"净密度"，差值就是已经湮灭的部分。

## 五、代码示例

### 示例 1：离散位错系统的 Kinetic Monte Carlo 模拟

```python
import numpy as np

class DislocationSystem:
    """一维周期晶格上的位错系统"""

    def __init__(self, positions, signs, epsilon, beta, annihilate=True):
        """
        positions: 位错在一维环上的位置 [0, 1)
        signs:     每个位错的 Burgers 向量 (+1 或 -1)
        epsilon:   晶格间距
        beta:      相互作用能/热能比
        annihilate: 是否启用碰撞湮灭规则
        """
        self.positions = np.array(positions, dtype=float)
        self.signs = np.array(signs, dtype=int)
        self.epsilon = epsilon
        self.beta = beta
        self.annihilate = annihilate
        self.time = 0.0

    def _force(self, i):
        """计算作用在位错 i 上的合力"""
        n = len(self.positions)
        force = 0.0
        for j in range(n):
            if i == j:
                continue
            dx = (self.positions[i] - self.positions[j]) % 1.0
            # Volterra 相互作用力
            if dx == 0.0:
                dx = 0.5  # 碰撞时力为零
            force += self.signs[i] * self.signs[j] * np.pi / np.tan(np.pi * dx)
        return force / n

    def _jump_rates(self):
        """计算所有可能的跳跃速率"""
        total_rate = 0.0
        rates = []
        n = len(self.positions)
        for i in range(n):
            fi = self._force(i)
            for sign in [+1, -1]:
                r = (1.0 / (self.beta * self.epsilon**2)) * np.exp(
                    0.5 * self.beta * self.epsilon * sign * fi
                )
                rates.append((i, sign, r))
                total_rate += r
        return rates, total_rate

    def step(self):
        """执行一步 Kinetic Monte Carlo 迭代"""
        rates, total_rate = self._jump_rates()
        if total_rate == 0:
            return

        # 采样等待时间（指数分布）
        dt = np.random.exponential(1.0 / total_rate)
        self.time += dt

        # 采样选择哪个位跳、往哪跳
        probs = [r / total_rate for _, _, r in rates]
        idx = np.random.choice(len(rates), p=probs)
        i, direction, _ = rates[idx]

        # 执行跳跃
        old_pos = self.positions[i]
        self.positions[i] = (old_pos + direction * self.epsilon) % 1.0

        # 检查碰撞：如果有湮灭规则且遇到异号位错
        if self.annihilate:
            collided = False
            for j in range(len(self.positions)):
                if i != j:
                    dist = abs(self.positions[i] - self.positions[j])
                    if dist < self.epsilon or dist > (1.0 - self.epsilon):
                        if self.signs[j] == -self.signs[i]:
                            # 湮灭：移除两个位错
                            self.positions = np.delete(self.positions, j)
                            self.signs = np.delete(self.signs, j)
                            self.positions = np.delete(self.positions, i if i < j else i - 1)
                            self.signs = np.delete(self.signs, i if i < j else i - 1)
                            collided = True
                            break
            if collided:
                return

        # 更新跳跃速率（增量更新，节省 O(n) 开销）
        # 这里简化为完全重算
```

### 示例 2：连续 PDE 的有限体积数值求解

```python
class PDVSolver:
    """Groma-Balogh 方程的有限体积求解器"""

    def __init__(self, N, T_final, scheme='csv'):
        """
        N:   空间网格数
        T_final: 模拟终止时间
        scheme: 'csv' (守恒) 或 'ann' (湮灭)
        """
        self.N = N
        self.dx = 1.0 / N
        self.T_final = T_final
        self.scheme = scheme
        self.x = np.arange(N) * self.dx  # 网格点
        self.dt = self.dx ** 2  # CFL 条件

    def _velocity(self, kappa):
        """计算速度场 v[kappa] = f * kappa（卷积）"""
        v = np.zeros(self.N)
        for i in range(self.N):
            for j in range(self.N):
                dx = (i - j) * self.dx
                if abs(dx) < 1e-10 or abs(abs(dx) - 1.0) < 1e-10:
                    continue  # 奇异点跳过
                mj = (j + 0.5) * self.dx  # 单元中点
                d = ((i * self.dx) - mj) % 1.0
                v[i] += (np.pi / np.tan(np.pi * d)) * kappa[j] * self.dx
        return v / self.N

    def solve_csv(self, rho_plus_0, rho_minus_0):
        """求解 (P_∞^csv) — Groma-Balogh 方程"""
        rho_plus = rho_plus_0.copy()
        rho_minus = rho_minus_0.copy()
        t = 0.0

        while t < self.T_final:
            kappa = rho_plus - rho_minus
            v = self._velocity(kappa)

            # 迎风格式：根据速度方向选择上游值
            for i in range(self.N):
                v_left = v[i]
                v_right = v[(i + 1) % self.N]

                # rho⁺ 的通量
                if v_left >= 0:
                    rho_plus_at_left = rho_plus[(i - 1) % self.N]
                else:
                    rho_plus_at_left = rho_plus[i]

                if v_right >= 0:
                    rho_plus_at_right = rho_plus[i]
                else:
                    rho_plus_at_right = rho_plus[(i + 1) % self.N]

                # rho⁻ 类似
                if v_left >= 0:
                    rho_minus_at_left = rho_minus[(i - 1) % self.N]
                else:
                    rho_minus_at_left = rho_minus[i]

                if v_right >= 0:
                    rho_minus_at_right = rho_minus[i]
                else:
                    rho_minus_at_right = rho_minus[(i + 1) % self.N]

                # 更新密度
                rho_plus[i] -= (self.dt / self.dx) * (
                    rho_plus_at_right * v_right - rho_plus_at_left * v_left
                )
                rho_minus[i] += (self.dt / self.dx) * (
                    rho_minus_at_right * v_right - rho_minus_at_left * v_left
                )

            t += self.dt

        return rho_plus, rho_minus

    def solve_ann(self, kappa_0):
        """求解 (P_∞^ann) — 带湮灭的守恒律"""
        kappa = kappa_0.copy()
        t = 0.0

        while t < self.T_final:
            v = self._velocity(kappa)

            for i in range(self.N):
                v_left = v[i]
                v_right = v[(i + 1) % self.N]

                # |kappa| 的迎风取值
                if v_left >= 0:
                    abs_kappa_left = abs(kappa[(i - 1) % self.N])
                else:
                    abs_kappa_left = abs(kappa[i])

                if v_right >= 0:
                    abs_kappa_right = abs(kappa[i])
                else:
                    abs_kappa_right = abs(kappa[(i + 1) % self.N])

                kappa[i] -= (self.dt / self.dx) * (
                    abs_kappa_right * v_right - abs_kappa_left * v_left
                )

            t += self.dt

        return kappa
```

## 六、主要发现

通过大量数值模拟，作者得到了以下关键结果：

1. **带湮灭的模型收敛良好** — `(P_n^ann)` 随着 `n → ∞` 确实收敛到 `(P_∞^ann)`，即带湮灭项的连续 PDE。

2. **无湮灭模型的收敛不一致** — `(P_n^csv)` 的表现令人意外：在某些参数范围内它收敛到预期的守恒 PDE `(P_∞^csv)`，但在其他参数范围内，它反而表现出类似湮灭的行为，收敛到 `(P_∞^ann)` 的形式。

3. **碰撞规则至关重要** — 微观层面的碰撞处理方式（保存 vs 湮灭）会导致完全不同的宏观极限方程。这意味着在构建离散位错动力学模型时，不能忽略碰撞的细节。

## 七、直观理解：为什么两种模型表现不同？

回到"跑步的人"的类比：

- **保存模型**：红蓝两人擦肩而过，继续各跑各的。长期来看，红色和蓝色的"总量"都不变。
- **湮灭模型**：红蓝两人相遇就一起消失。红色总量和蓝色总量都在减少，但"红色减蓝色"的差值保持不变。

关键发现是：**即使在"保存模型"中，如果参数设置不当，相同位置的异号位错会因为强烈的相互吸引而快速靠近、重叠，使得宏观密度看起来就像在"湮灭"一样。** 这不是真正的湮灭，而是模型参数导致的表观现象。

## 八、方法论要点

### 8.1 Kinetic Monte Carlo（动力学蒙特卡洛）

这是模拟随机过程的标准方法：

1. 计算所有可能事件的总速率
2. 从指数分布采样等待时间
3. 按概率选择下一个事件
4. 更新状态，重复

### 8.2 有限体积法（Finite Volume Method）

用于求解 PDE：

1. 将空间划分为小单元
2. 在每个单元上积分方程
3. 用迎风格式近似边界通量
4. 时间推进

### 8.3 离散到连续的量化收敛

作者设计了专门的指标来量化离散模拟结果与连续 PDE 解之间的差异，包括 L1 误差、密度剖面比较等。

## 九、总结与延伸思考

这篇论文的核心贡献不在于提出新模型，而在于**通过数值证据回答了"离散模型是否真的收敛到我们期望的连续方程"这一基本问题**。

几个值得深入思考的问题：

1. **参数选择的敏感性** — `(P_n^csv)` 在不同参数下的不同行为，暗示了离散-连续极限可能存在"相变"式的转变。

2. **物理真实性** — `(P_n^ann)` 更接近真实金属中的位错行为（异号位错确实会湮灭），因此其对应的 `(P_∞^ann)` 可能是更好的宏观描述。

3. **计算效率** — 湮灭减少了粒子数量，但需要额外的碰撞检测逻辑；保存模型粒子数不变但可能出现数值奇异性。

4. **高维推广** — 本文是一维模型，实际金属中的位错是三维曲线。高维情况下的碰撞规则和收敛性问题更加复杂。

## 十、参考文献

- Hudson, T., Jantaraphum, A., & van Meurs, P. (2026). *Simulations of dislocation dynamics on an atomic lattice: the effect of collision rules*. arXiv:2605.30682.
- Groma, I., & Balogh, L. (1999). Dislocation density formulation for the theory of plasticity. *Acta Metallurgica*.
- Blesgen, T. (2010). On the continuum theory of moving dislocations.
- Voter, A. F. (2007). Introduction to the kinetic monte carlo method. *Computational Microscopy*.
