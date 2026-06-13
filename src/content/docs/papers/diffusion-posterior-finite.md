---
title: 扩散后验采样何时失败？——有限样本透镜（Finite-Sample Lens）
来源: https://arxiv.org/abs/2605.30330
日期: 2026-06-13
分类: 机器学习
子分类: 模型与训练
provenance: pipeline-v3
---

## 从日常类比开始：侦探拼图 vs 蒙眼猜形状

想象你是侦探，手里有一张**模糊的监控截图**（测量值 \(y\)），要在**嫌疑人名单**里找出最像真凶的人（后验 \(p(x \mid y)\)）。

名单上每个人长相、身高、习惯都不同——这就是**先验** \(p_{\text{pr}}(x)\)，往往很复杂、多峰（有人像猫、有人像狗、有人像鸟）。

**扩散后验采样（Diffusion Posterior Sampling, DPS）** 的做法像：

1. 先把所有嫌疑人照片**故意弄糊**（加噪到中间时刻 \(x_t\)）；
2. 每一步根据「模糊照片 + 监控截图」微调，让轨迹逐渐变清晰；
3. 最后得到一张「既像名单里某人、又符合监控」的清晰照片。

问题在于：中间每一步，算法**不能精确算**「给定当前模糊图，真凶可能是谁、概率多大」——只能**近似**（常见做法：把可能性压成**一个点**，忽略 spread）。论文问的就是：

> **这种近似什么时候会把侦探带偏？为什么？怎么诊断？**

作者给出的答案不是再发明一个新 sampler，而是换一副**有限样本透镜（Finite-Sample Lens, FSR）**：把连续先验换成 \(N\) 张真实训练样本组成的离散分布，于是**中间任意时刻 \(t>0\) 的后验可以解析算出来**，当作「标准答案」去对比 DPS、ΠGDM、TMPD 等流行方法哪里错了。

---

## 是什么

**When, Why, and How Do Diffusion Posterior Samplers Fail? A Finite-Sample Lens**（Burns & Fridovich-Keil，arXiv:[2605.30330](https://arxiv.org/abs/2605.30330)，2026）研究**成像逆问题**里用预训练扩散模型做**零样本后验采样**时的失败模式。

| 项目 | 内容 |
|------|------|
| 问题 | 现有方法在**中间时间步**对似然 \(p(y \mid x_t)\) 做近似以求可算；近似误差如何传导到最终后验，缺乏系统理解 |
| 方法 | **FSR**：先验 \(p_N^{\text{pr}}(x) = \frac{1}{N}\sum_i \delta(x - x^{(i)})\)，推导 \(p_{t\mid y}^N(x_t \mid y)\) 的闭式（高斯混合） |
| 用途 | **即插即用诊断工具**：对比任意 likelihood 近似、线性/非线性前向模型 \(\mathcal{A}\) |
| 核心发现 | 流行近似常**低估或高估**中间后验的 spread → 早停敏感、模态权重错、**幻觉**（prior 模态 / likelihood 模态） |

---

## 为什么重要

不理解这篇论文，下面现象只能「调参碰运气」：

- DPS 重建图像**看起来不错**，但换测量噪声、换 early stopping 就崩
- **多模态先验**（如 GMM、离散类别）下，采样总偏向某一个「像训练集」的模式，却**不是**真后验该重的模态
- \(\zeta\)-DPS 调大 \(\zeta\) 有时更好、有时**模态坍缩**——没有 principled 解释
- 终端样本 \(t=0\) 很 sharp，但轨迹曾经过**无条件边缘 \(p_t(x_t)\) 的低概率区域**，学到的 score 不可靠——换任务可能翻车

论文说明：**失败不必来自非线性测量或多模态后验**；**多模态先验 + 中间 spread 算错**就够了。

---

## 核心概念

### 1. 逆问题与后验采样

观测模型：

\[
y = \mathcal{A}(x_0) + \eta, \quad \eta \sim \mathcal{N}(0, \Sigma_y)
\]

目标：从 \(p(x_0 \mid y) \propto p_{\text{pr}}(x_0)\, p(y \mid x_0)\) 采样。扩散模型学的是先验的 score；**后验采样**要在去噪过程中注入 **likelihood guidance**。

### 2. 为什么中间步必须近似？

真后验满足 Bayes：

\[
p(x_t \mid y) \propto p(x_t)\, p(y \mid x_t)
\]

但 \(p(y \mid x_t) = \int p(y \mid x_0)\, p(x_0 \mid x_t)\, dx_0\) 一般**没有闭式**。DPS 等用 **Tweedie 均值** \(m_{0|t}(x_t)\) 把 \(p(x_0 \mid x_t)\) **压成 Dirac**，得到 tractable guidance——代价是丢掉**方差/多模态结构**。

### 3. 有限样本透镜（FSR）

把先验换成经验分布：

\[
p_N^{\text{pr}}(x) = \frac{1}{N}\sum_{i=1}^{N} \delta(x - x^{(i)})
\]

在 VP-SDE 下（\(\bar{\alpha}(t)\) 为噪声 schedule）：

- **边缘** \(p_t^N(x_t)\)：对每个训练点 \(x^{(i)}\) 加噪后的高斯混合
- **去噪** \(p_{0|t}^N(x_0 \mid x_t)\)：离散权重 \(w_i(x_t,t)\) 在 \(\{x^{(i)}\}\) 上的组合
- **似然** \(p_{y|t}^N(y \mid x_t)\)：对 \(i\) 混合 \(\mathcal{N}(y; \mathcal{A}(x^{(i)}), \Sigma_y)\)
- **后验** \(p_{t|y}^N(x_t \mid y)\)：再乘上 measurement 权重 → **仍是高斯混合，可算、可采**

\(N \to \infty\) 时以 Monte Carlo 率 \(O(N^{-1/2})\) 逼近真后验（固定 \(t>0\)）；\(t \to 0\) 时需要更大的 \(N\)。

### 4. 被诊断的近似族

| 方法族 | 代表 | 对 \(p(x_0 \mid x_t)\) 的近似 | 特点 |
|--------|------|------------------------------|------|
| Dirac | **σ-DPS**, **ζ-DPS** | \(\delta(x_0 - m_{0|t})\) | 最简单；spread 全丢 |
| Gaussian | **ΠGDM**, **TMPD** | 高斯，TMPD 协方差用真 \(C_{0|t}\) | 线性问题更准；仍可能错 spread |

### 5. 论文归纳的失败模式

1. **中间 spread 错误**：σ-DPS 全程方差偏；均值在中间 \(t\) 也可能偏
2. **模态权重错**：该重的后验模态权重低，不该出现的 prior 模态被采样（**prior 幻觉**）
3. **likelihood 幻觉**：测量一致但先验极不可能的模式
4. **早停敏感**：spread 错 → 最优 stopping time 依赖任务，无通用默认值
5. **ζ 调参权衡**：大 \(\zeta\) 加强似然可能减幻觉，也可能**单模态坍缩**

---

## 代码示例 1：有限样本后验权重（玩具 GMM 先验 + 线性测量）

下面用 NumPy 实现 FSR 在**单个** \(x_t, t\) 上的后验混合权重（1D 示意）：

```python
import numpy as np

def vp_alpha_bar(t, beta_max=20.0):
    """简化的 VP schedule：返回 sqrt(ᾱ(t)) 与 (1-ᾱ(t))。"""
    # 连续近似：ᾱ(t) = exp(-0.5 * beta_max * t^2)，t ∈ [0,1]
    alpha_bar = np.exp(-0.5 * beta_max * t ** 2)
    return np.sqrt(alpha_bar), 1.0 - alpha_bar

def fsr_posterior_weights(x_train, x_t, t, y, A, sigma_y=0.1):
    """
    x_train: (N,) 有限样本先验支撑
    x_t: 当前噪声状态（标量）
    y: 观测 A @ x0 + noise（标量线性 A）
    返回: 对 x_train 每个点的后验 responsibility（未归一化可再归一化）
    """
    sqrt_ab, one_minus_ab = vp_alpha_bar(t)
    N = len(x_train)
    # p(x_t | x^{(i)}) ∝ N(x_t; sqrt(ᾱ) x^{(i)}, (1-ᾱ))
    log_px_t_given_i = -0.5 * (x_t - sqrt_ab * x_train) ** 2 / one_minus_ab
    log_px_t_given_i -= 0.5 * np.log(2 * np.pi * one_minus_ab)

    # p(y | x^{(i)}) ∝ N(y; A * x^{(i)}, sigma_y^2)
    pred_y = A * x_train
    log_py_given_i = -0.5 * (y - pred_y) ** 2 / sigma_y ** 2
    log_py_given_i -= 0.5 * np.log(2 * np.pi * sigma_y ** 2)

    log_joint = log_px_t_given_i + log_py_given_i
    log_joint -= log_joint.max()  # 数值稳定
    w = np.exp(log_joint)
    w /= w.sum()
    return w

# 双模态先验：两团训练点
rng = np.random.default_rng(0)
x_train = np.concatenate([
    rng.normal(-2.0, 0.2, 500),
    rng.normal(+2.0, 0.2, 500),
])
A = 1.0
x0_true = -2.0
y = A * x0_true + rng.normal(0, 0.1)

for t in [0.8, 0.4, 0.1]:
    w = fsr_posterior_weights(x_train, x_t=0.0, t=t, y=y, A=A)
    left_mass = w[x_train < 0].sum()
    print(f"t={t:.1f}  P(模态 x<0 | y) ≈ {left_mass:.3f}")
```

**读输出**：在 \(t=0.8\) 测量已把权重推向 \(x<0\) 模态；若某 DPS 近似在中间 \(t\) spread 过窄，轨迹可能提前锁死在错误模态或漏掉正确模态——FSR 的 `w` 就是对照 ground truth。

---

## 代码示例 2：Dirac（DPS 式）vs 完整 FSR  spread

第二个例子比较 **Dirac 近似均值** 与 **FSR 真后验均值/方差**：

```python
def fsr_mean_var(x_train, w):
    mu = (w * x_train).sum()
    var = (w * (x_train - mu) ** 2).sum()
    return mu, var

def dirac_dps_mean(x_train, x_t, t):
    """σ-DPS 思路：p(x0|xt) ≈ δ(m_{0|t})，m_{0|t} 为 Tweedie 均值。"""
    sqrt_ab, one_minus_ab = vp_alpha_bar(t)
    # 权重仅来自 p(x_t | x^{(i)})，无 y
    log_w = -0.5 * (x_t - sqrt_ab * x_train) ** 2 / one_minus_ab
    log_w -= log_w.max()
    w_prior = np.exp(log_w)
    w_prior /= w_prior.sum()
    return (w_prior * x_train).sum()

t = 0.5
x_t = 0.5
w_post = fsr_posterior_weights(x_train, x_t, t, y, A)
mu_fsr, var_fsr = fsr_mean_var(x_train, w_post)
mu_dirac = dirac_dps_mean(x_train, x_t, t)

print(f"FSR  E[x0|xt,y] = {mu_fsr:.3f},  Var = {var_fsr:.4f}")
print(f"Dirac m_{0|t}   = {mu_dirac:.3f}  （不含 y 的 Tweedie 均值）")
print(f"真 x0 = {x0_true},  观测 y = {y:.3f}")
```

**要点**：

- Dirac 用的 \(m_{0|t}\) **不看 \(y\)**；DPS 的 guidance 另加梯度项，但 spread 仍像 Dirac 一样缺失
- FSR 的 `var_fsr` 告诉你**此刻**后验还有多宽——σ-DPS 若 implicit 方差更小，就会 **under-spread** → 模态权重失真

---

## 实验与诊断工作流（论文做法）

1. **选先验**：离散 / 高斯 / GMM 等可解析对照
2. **建 FSR**：从 \(N\) 个 i.i.d. 样本构造 \(p_N^{\text{pr}}\)
3. **固定 \(t\)**：算 \(p_{t|y}^N\) 与 moment（均值、协方差、模态 mass）
4. **跑 σ-DPS / ζ-DPS / TMPD**：在同一 \((y, t)\) 记录近似 posterior 的 moment
5. **对比 gap**：spread 低估 → 查 prior 幻觉；spread 高估 → 查 likelihood 幻觉与早停

论文报告：FSR 在**中等较大 \(t\)** 精度高；\(t \to 0\) 需增大 \(N\)。σ-DPS 常在中间步均值、方差都偏；ζ 调参只能部分缓解，无法消除所有幻觉类型。

---

## 与其他工作的关系

| 方向 | 代表 | 与本文关系 |
|------|------|------------|
| DPS 原论文 | Chung et al., 2023 | 被诊断的 Dirac 近似来源 |
| Feynman-Kac 偏差分析 | arXiv:2605.06538 | 从 PDE/路径期望解释 DPS 偏差；本文从**有限样本可算后验**给工程诊断 |
| FPS / 粒子滤波 | Dou & Song, ICLR 2024 | 渐近正确但贵；FSR 是**解析** surrogate 而非采样算法 |
| 计算不可 tractability | ICML 2024 等 | 说明精确后验采样难；本文在**可算 toy / FSR** 上隔离近似误差 |

---

## 局限与后续

- **\(N\) 与 \(t\)**：越接近 \(t=0\)，准确评估所需样本数越大
- **学出来的先验**：FSR 用经验点集；真实扩散 prior 是神经网络 score，诊断需用训练集或 coreset 近似
- **未覆盖**：prior 学习误差、极低 \(p_t(x_t)\) 区域的 score 质量

---

## 给实践者的三条建议

1. **不要只看最终图**：对关键 \(t\) 用 FSR（或小型验证集）检查 posterior spread 是否合理
2. **多模态先验要格外小心**：即使测量线性、后验单模态，**先验多峰 + Dirac** 仍可能 hallucinate
3. **把 FSR 当单元测试**：新 guidance 公式上线前，在 GMM/离散先验上对比 moment，比只盯 PSNR 更可靠

---

## 小结

| 问题 | 答案 |
|------|------|
| **When** 失败？ | 中间 timestep 的 likelihood/denoiser 近似导致 spread 错时 |
| **Why**？ | Dirac/Gaussian 矩匹配丢失多模态与方差 → 模态权重与轨迹偏 |
| **How**？ | 用 **Finite-Sample Lens** 构造可解析后验，对比 moment 与样本 |
| **意外结论** | 非线性 \(\mathcal{A}\)、多模态后验**不是必要条件**；多模态先验即可 |

---

## 延伸阅读

- [DPS 原论文](https://arxiv.org/abs/2209.14687) — Diffusion Posterior Sampling for General Noisy Inverse Problems
- [ΠGDM / TMPD 等矩匹配方法](https://arxiv.org/abs/2305.08995) — 高斯近似族
- [Feynman-Kac 偏差分析](https://arxiv.org/abs/2605.06538) — 路径级解释 DPS 偏差的互补视角
- [[paged-attention-vllm]] — 推理系统侧优化；与「采样是否正确」正交但同属生成栈
