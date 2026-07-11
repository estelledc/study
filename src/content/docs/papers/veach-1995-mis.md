---
title: Veach MIS — 用一行加权公式让多种采样策略各取所长
来源: Eric Veach & Leonidas J. Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering", SIGGRAPH 1995
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

**多重重要性采样**（Multiple Importance Sampling，**MIS**）是一招让你**同时跑多种采样策略、再按各自靠谱程度加权合起来**的技巧。一行公式：

```
w_i(x) = (n_i · p_i(x))^β / Σ_j (n_j · p_j(x))^β
```

日常类比：你在不同天气预报 App 之间不知道信哪个，干脆**全都看一遍**，然后按"哪个 App 在这种天气下最准"加权平均。Veach 给的就是这个加权公式。

放到渲染里：算一个像素颜色，要对所有入射光求积分（见 [[kajiya-1986-rendering-equation]]）。可以**按光源方向**采样（"光从哪儿来"），也可以**按 BSDF**（表面怎么反射光的模型）采样（"表面爱反射到哪儿"）。两种各有死穴。MIS 让你同时跑、合权重，方差比单跑任何一个都低。

这里的 **pdf** 可以先记成"这个方向被抽中的概率密度"——数字越大，说明该策略越"认准"这个方向。

## 为什么重要

不理解 MIS，下面这些事都没法解释：

- 为什么小光源打在漫反射墙上，只按表面反射方向采样会噪点炸裂
- 为什么大面积光打在镜子上，只按光源采样几乎贡献为 0
- 为什么工程师不能"看场景类型二选一"，硬平均也会在边界场景翻车
- 为什么今天 Arnold / Cycles / PBRT / Mitsuba 的 path tracer 不写 MIS 等于没写

Veach 的洞察：**两种估计都无偏，差别只在方差**。按"哪种 pdf 在该样本上更高"加权合并，几乎每种场景都接近最优。代价只是每条路径多算一次另一种策略的 pdf——几乎零开销。

## 核心要点

1. **加权和必须等于 1**：w_1 + w_2 + ... = 1，不然估计器有偏。类比：几家 App 的信任度加起来必须是 100%，不能超也不能缺。
2. **balance heuristic（β=1）**：方差离理论最优只差一个常数因子。类比：按"谁更准"线性分票，公平但不够狠。
3. **power heuristic（β=2）**：更激进地把权重压给 pdf 大的那一项。**工程默认 β=2**。类比：谁明显更准就几乎只听谁的。

**直观理解 power**：light 的 pdf=100、BSDF 的 pdf=1 → 权重比 100²:1² = 10000:1，几乎只用 light 那一项；弱策略被自动边缘化，不会拖累整体。

**为什么不直接 max**：maximum heuristic 在权重归一时**仍无偏**，但函数不连续，方差往往更差，所以工程上不推荐——不是"数学上不可用"。

## 实践案例

### 案例 1：玻璃球被小光源照射

```python
# 伪代码：估计点 x 上的反射光（此处 n_light=n_bsdf=1）
def estimate_radiance(x, normal):
    light_dir, p_light = sample_light()
    p_bsdf_at_light_dir = bsdf_pdf(light_dir)  # 另一种策略采到同方向的概率
    contribution_light = bsdf(light_dir) * cos(light_dir, normal) * Le
    w_light = p_light**2 / (p_light**2 + p_bsdf_at_light_dir**2)

    bsdf_dir, p_bsdf = sample_bsdf()
    p_light_at_bsdf_dir = light_pdf(bsdf_dir)
    contribution_bsdf = bsdf(bsdf_dir) * cos(bsdf_dir, normal) * Le_at(bsdf_dir)
    w_bsdf = p_bsdf**2 / (p_light_at_bsdf_dir**2 + p_bsdf**2)

    return w_light * contribution_light / p_light + w_bsdf * contribution_bsdf / p_bsdf
```

逐步看：

1. 两条策略都跑，最后加权合并，不是二选一
2. 每条都要算"另一种策略会以多大概率采到这个点"（交叉 pdf）
3. 权重之和 = 1；若 light 采 4 次、BSDF 采 1 次，公式里还要乘 n_i（见踩坑 2）

### 案例 2：换 β，权重怎么变

设 p_light=10、p_bsdf=1（各采 1 次），用同一行算权重：

```python
def w(p_i, p_other, beta):
    return p_i**beta / (p_i**beta + p_other**beta)

# β=0 → 0.5；β=1 → 10/11；β=2 → 100/101；β→∞ → 1.0
```

逐步看：

1. β=0：两边权重各 0.5 → 弱策略拖后腿
2. β=1（balance）：权重比 10:1 → 强策略主导但仍留一点弱策略
3. β=2（power）：权重比 100:1 → 几乎只听强的；**生产默认**
4. β→∞（maximum）：退化成只取 pdf 最大者；论文讨论过、仍无偏，但不连续、方差常更差，工程上不推荐

PBRT / Mitsuba / Cycles 默认 β=2。

### 案例 3：今天 GPU path tracer 里的同一行

```cpp
// next event estimation：light 与 BSDF 两条贡献合权重
float misWeight = (pLight * pLight) / (pLight * pLight + pBsdf * pBsdf);
radiance += misWeight * contrib / pLight;  // 乘到对应贡献上
```

逐步看：

1. `pLight*pLight` 就是 β=2 的 power（谁 pdf 大，谁权重接近 1）
2. 分母是两种策略的 power 之和，保证归一（两权重加起来 = 1）
3. 结果乘到对应贡献上；30 年前的公式，原样进 OptiX / Falcor 一类实时管线

## 踩过的坑

1. **pdf 度量空间要统一**：light 常给面积空间密度，BSDF 给**立体角**空间密度（把方向想成球面上的一块面积）；必须先把 light 换成立体角（除以距离平方、乘 cos）再比，否则权重错乱。
2. **n_i 是策略总样本数**：light 采 4 次、BSDF 采 1 次时 n_light=4、n_bsdf=1；写成 1 和 1 等于无视配比，方差反而升。
3. **delta 分布要单独处理**：完美镜面 / 点光源的 pdf 是 delta（无穷大），直接代入会炸；specular bounce **不进 MIS**，用 isDelta 拐弯单独累加。
4. **权重任意但 Σ=1**：w_i 可以是任何函数，只要加起来 = 1 且 p_i=0 时 w_i=0；balance/power 只是常用实例，工程上 power β=2 用了 30 年。

## 适用 vs 不适用场景

**适用**：
- 多种采样策略互补、各擅长积分子区域的蒙特卡洛（渲染里的 next event estimation **必装**）
- 金融定价、贝叶斯推断里"好几个提议分布各有死角"的同类问题
- 两种策略方差差一个数量级以上时，MIS 通常比硬平均明显降噪

**不适用**：
- 只有一种合理策略，或两种 pdf 几乎处处相等 → MIS 收益接近 0，白算一遍交叉 pdf
- 全是 delta（纯镜面世界）→ 走 specular path 单独累加
- 策略 pdf 很难解析求 → 凑不出权重就没法 MIS

## 历史小故事（可跳过）

- **1986**：Kajiya 提渲染方程，路径追踪诞生（见 [[kajiya-1986-rendering-equation]]），小光源噪点劝退。
- **1993**：Lafortune 双向路径追踪减方差（见 [[lafortune-1993-bdpt]]），但路径对仍要决定怎么合权重。
- **1995**：Veach（Stanford）把"如何合权重"数学化，给出 power heuristic；这篇 9 页 SIGGRAPH 是博士论文预演。
- **1997**：博士论文完整版（BDPT、MLT、MIS）获 SIGGRAPH 最佳论文。
- **2014**：相关蒙特卡洛光传输工作获 Academy Sci-Tech（Technical Achievement）奖；工业界广泛采用同类方法，并非单篇 9 页论文的直接产物。

Veach 后来去 Google，主导过 AdSense 拍卖系统设计。

## 学到什么

1. **多种采样策略各有死穴 → 加权合并即可，不必择优**——这是 MC 估计的通用思想，不止渲染
2. **balance/power 的核心是 pdf 比**——pdf 高的策略权重高，自动让"对的人"主导
3. **β=2 比 β=1 工程上更好用**：理论最优附近 vs 生产更稳
4. 与 [[kajiya-1986-rendering-equation]] 互补：Kajiya 给方程、Veach 给"怎么解最不噪"

## 延伸阅读

- 论文 9 页：[Optimally Combining Sampling Techniques](https://dl.acm.org/doi/10.1145/218380.218498)
- Veach 博士论文（1997）：[Robust Monte Carlo Methods for Light Transport Simulation](https://graphics.stanford.edu/papers/veach_thesis/)
- PBRT 第 13 章：[Light Transport I: Surface Reflection](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection)
- 视频：[Cem Yuksel — Multiple Importance Sampling](https://www.youtube.com/watch?v=qJ5KKMeJibc)
- 相关实现笔记：[[nimier-david-2019-mitsuba2]]（现代渲染器里 MIS 是标配）

## 关联

- [[kajiya-1986-rendering-equation]] — 给出要解的方程，MIS 是怎么解最不噪
- [[lafortune-1993-bdpt]] — BDPT 是 MIS 最早的客户之一，路径连接都要权重
- [[disney-brdf-2012]] — BRDF 是 MIS 中"BSDF 采样"那一支的 pdf 来源
- [[jensen-1996-photon-mapping]] — 另一条降噪路线，常与路径追踪/MIS 对照理解
- [[veach-1997-mlt]] — 同一作者后续的马尔可夫链光传输，仍依赖好的采样权重直觉
- [[nimier-david-2019-mitsuba2]] — 现代开源渲染器把 power heuristic 写进默认管线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
