---
title: "Veach MIS — 用一行加权公式让多种采样策略各取所长"
来源: Eric Veach & Leonidas J. Guibas, "Optimally Combining Sampling Techniques for Monte Carlo Rendering", SIGGRAPH 1995
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**多重重要性采样**（Multiple Importance Sampling，**MIS**）是一招让你**同时跑多种采样策略、再按各自靠谱程度加权合起来**的技巧。一行公式：

```
w_i(x) = (n_i · p_i(x))^β / Σ_j (n_j · p_j(x))^β
```

日常类比：你在不同天气预报 App 之间不知道信哪个，干脆**全都看一遍**，然后按"哪个 App 在这种天气下最准"加权平均。Veach 给的就是这个加权公式。

放到渲染里：算一个像素颜色，需要对所有入射光求积分（见 [[kajiya-1986-rendering-equation]]）。可以**按光源方向**采样（"光从哪儿来"），也可以**按 BSDF 方向**采样（"表面爱反射到哪儿"）。两种各有死穴。MIS 让你同时跑、合权重，方差比单跑任何一个都低。

## 为什么重要

1995 年之前，路径追踪两个最痛的场景：

- **小光源 + 漫反射表面**：BSDF 采样几乎打不中那一小坨光源 → 噪点炸裂
- **大光源 + 镜面表面**：light 采样能命中光源，但反射方向几乎不对应入射方向 → 贡献几乎为 0

工程师只能"看场景类型决定哪种采样"，或者各跑一半再硬平均——两种方式都会在边界场景出问题。

Veach 的洞察是：**两种估计都是无偏的，差别只在方差**。把它们按"哪种 pdf 在该样本上更高"加权合并，就能在每一种场景下都接近最优。代价：每条路径多算一次另一种策略的 pdf，**几乎零开销**。

效果：
- 玻璃球被小面光源照射这种"两种策略各崩一半"的场景，噪点直接降一个数量级
- 今天 Arnold / Cycles / RenderMan / PBRT / Mitsuba 全都内置 MIS，path tracer 不写 MIS 等于没写

## 核心要点

**三个关键设计**：

1. **加权和必须等于 1**：w_1 + w_2 + ... + w_n = 1，不然估计器有偏。
2. **balance heuristic**：β=1 时叫 balance heuristic，Veach 在论文里证明它的方差离理论最优只差一个常数。
3. **power heuristic**：β=2 时叫 power heuristic，更激进地把权重压给 pdf 大的那一项。**Veach 推荐 β=2**，工程上更稳。

**直观理解 power heuristic**：

- 如果 light sampling 给的 pdf 是 100，BSDF sampling 是 1，那这个样本"应该听 light 的"
- 权重比 100^2 : 1^2 = 10000:1，等于几乎只用 light 那一项
- pdf 一旦被某个策略压得很低，它在 MIS 里就被自动边缘化，**不会拖累整体**

**为什么不 max 取最大那个**：max 不是连续函数、会让估计器偏差。MIS 的妙处是平滑过渡。

## 实践案例

### 案例 1：玻璃球被小光源照射

```python
# 伪代码：估计点 x 上的反射光
def estimate_radiance(x, normal):
    # 策略 1：按光源采样
    light_dir, p_light = sample_light()
    p_bsdf_at_light_dir = bsdf_pdf(light_dir)
    contribution_light = bsdf(light_dir) * cos(light_dir, normal) * Le
    w_light = p_light**2 / (p_light**2 + p_bsdf_at_light_dir**2)

    # 策略 2：按 BSDF 采样
    bsdf_dir, p_bsdf = sample_bsdf()
    p_light_at_bsdf_dir = light_pdf(bsdf_dir)
    contribution_bsdf = bsdf(bsdf_dir) * cos(bsdf_dir, normal) * Le_at(bsdf_dir)
    w_bsdf = p_bsdf**2 / (p_light_at_bsdf_dir**2 + p_bsdf**2)

    return w_light * contribution_light / p_light + w_bsdf * contribution_bsdf / p_bsdf
```

注意三件事：
- 两条路径都跑，最后**加权合并**
- 每条路径都要算"另一种策略**会以多大概率采到这个点**"——这就是 p_bsdf_at_light_dir 那一行
- 权重之和 = 1

### 案例 2：β 不同的效果对比

| β 值 | 名字 | 行为 | 适用 |
|------|------|------|------|
| 0 | 平均 heuristic | 完全平均，等价不带权重 | 几乎没人用 |
| 1 | balance heuristic | Veach 证明方差离最优差常数 | 理论分析 |
| 2 | power heuristic | 工程默认，pdf 高的几乎独占 | **生产环境** |
| ∞ | maximum heuristic | 退化成 max（不连续） | 不可用 |

PBRT / Mitsuba / Cycles 默认 β=2。

### 案例 3：今天还在用

打开任何一个 GPU path tracer（如 OptiX / Falcor），grep "MIS" 或 "power heuristic" 都能在 next event estimation 那一段命中这一行公式：

```cpp
float misWeight = (pLight * pLight) / (pLight * pLight + pBsdf * pBsdf);
```

30 年前的 SIGGRAPH 论文，原样进了 2026 年的实时渲染管线。

## 踩过的坑

1. **pdf 度量空间要统一**：light sampling 一开始给的是**面积空间** pdf（"光源表面单位面积的密度"），BSDF 给的是**立体角空间** pdf。必须先把 light 的换算成立体角（除以距离平方、乘 cos），才能放进同一个 MIS 公式比。新人最容易在这里翻车。

2. **n_i 是策略总样本数、不是 1**：如果 light 采 4 次、BSDF 采 1 次，公式里 n_light=4、n_bsdf=1。常见 bug：写成 1 和 1，等于无视采样配比，方差反而上升。

3. **delta 分布要单独处理**：完美镜面（mirror）和点光源的 pdf 是 delta 函数（无穷大）。MIS 公式里直接代入会爆炸。处理方法：specular bounce 那一段路径**不进 MIS**，单独累加。今天的 path tracer 都有 isDelta 标志位专门拐弯。

4. **权重函数任意但要 Σ=1**：理论上 w_i 可以是任何函数，只要加起来 = 1 且 p_i=0 时 w_i=0。balance/power 只是其中两种实例。学术界还在研究"哪种 heuristic 在哪种场景下最优"——但工程上 power β=2 是 30 年没动的默认。

## 适用 vs 不适用场景

**适用**：
- 任何要把多种采样策略合一的蒙特卡洛积分（不只渲染、金融定价、贝叶斯也用）
- 渲染里的 next event estimation —— **必装**
- 每种策略各擅长一类积分子区域、互补但都不完美的情况

**不适用**：
- 只有一种合理采样策略 —— 直接用就行，没必要 MIS
- 全是 delta 分布（纯镜面世界） —— pdf 退化，要走 specular path 单独累加
- 策略 pdf 很难解析地求 —— 要凑个公式估 pdf 才行，否则没法算权重

## 历史小故事（可跳过）

- **1986**：Kajiya 提渲染方程，路径追踪诞生（见 [[kajiya-1986-rendering-equation]]）。但小光源场景噪点劝退。
- **1993**：Lafortune 双向路径追踪用"两端发光"减方差（见 [[lafortune-1993-bdpt]]），但每一对路径仍要决定怎么合权重。
- **1995**：Veach 在 Stanford 读博，把这个"如何合权重"的问题数学化，给出 power heuristic。SIGGRAPH 这篇 9 页论文是博士论文的预演。
- **1997**：Veach 博士论文完整版（含 BDPT、MLT、MIS），拿 SIGGRAPH 最佳论文，**2014 年获奥斯卡技术成就奖**——电影工业把这套方法用在《阿凡达》、皮克斯所有片子上。

Veach 后来去了 Google，主导了 AdSense 拍卖系统的设计，是另一段传奇。

## 学到什么

1. **多种采样策略各有死穴 → 加权合并即可，不必择优**——这是 MC 估计的通用思想，不止渲染
2. **balance/power heuristic 的核心是 pdf 比**——pdf 高的策略权重高，自动让"对的人"主导
3. **β=2 比 β=1 工程上更好用**：理论 vs 实践之间的微妙差距
4. **9 页 SIGGRAPH 论文 + 30 年生产环境零修改** —— 工程界少有的"一次写对、终身受用"
5. 与 [[kajiya-1986-rendering-equation]] 互补：Kajiya 给方程、Veach 给"怎么解最不噪"

## 延伸阅读

- 论文 9 页：[Optimally Combining Sampling Techniques](https://dl.acm.org/doi/10.1145/218380.218498)
- Veach 博士论文（1997）：[Robust Monte Carlo Methods for Light Transport Simulation](https://graphics.stanford.edu/papers/veach_thesis/)（500 页，但前 100 页讲 MIS 极清楚）
- PBRT 第 13 章：[Light Transport I: Surface Reflection](https://pbr-book.org/4ed/Light_Transport_I_Surface_Reflection)（含可跑代码）
- 视频：[Cem Yuksel — Multiple Importance Sampling](https://www.youtube.com/watch?v=qJ5KKMeJibc)（30 分钟从零讲到 power heuristic）

## 关联

- [[kajiya-1986-rendering-equation]] — 给出要解的方程，MIS 是怎么解最不噪
- [[lafortune-1993-bdpt]] — BDPT 是 MIS 最早的客户之一，每对路径连接都要权重
- [[disney-brdf-2012]] — BRDF 是 MIS 中"BSDF 采样"那一支的 pdf 来源
