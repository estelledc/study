---
title: "Veach MLT — 用 Metropolis 在路径空间游走，专攻 BDPT 也算不动的难场景"
来源: Eric Veach & Leonidas J. Guibas, "Metropolis Light Transport", SIGGRAPH 1997
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 进阶
provenance: pipeline-v3
---

## 是什么

**Metropolis Light Transport**（**MLT**）是把 1953 年物理学家算原子核能量的 **Metropolis-Hastings MCMC** 搬到渲染上的一招——在所有可能的光路组成的"路径空间"里做随机游走，亮的路径周围被反复采样，暗的地方少去。

日常类比：你想找城市里最值得吃的馆子，但城市太大、不知道哪儿好吃。

- 随便挑一家（**起步**）
- 吃完觉得还行，下次就在附近巷子里再找一家试（**局部扰动**）
- 偶尔抽风去十公里外（**大跳**）确保没漏掉新区
- 难吃的也按一定概率"将就再来一次"，不能完全不去（**接受概率**）

跑几万次后，地图上"好吃区域"被你密集打卡，差区域几乎没去——但不是零次（不然估计有偏）。MLT 干的事一模一样，只是把"馆子"换成"光路"，"好吃"换成"路径对像素的贡献"。

## 为什么重要

到 1995 年 Veach 发了 [[veach-1995-mis]] 和 [[lafortune-1993-bdpt]] 之后，路径追踪还剩一类硬骨头：

- **强 caustic**：玻璃球聚焦在桌面上的光斑、水池底部斑驳的光纹
- **缝隙后的房间**：点光源透过钥匙孔照进密闭空间
- **高度间接照明**：阳光通过几面镜子才照到目标

这些场景的共同点是：**贡献大的路径只占路径空间极小一坨**，BDPT 即便从两端发光仍要靠运气撞上一条；撞上之后这条路径就被丢掉，下一帧从头再来。

Veach 的关键洞察：**找到一条好路径就别浪费**——做小幅扰动（动一动方向、换一段子路径），让"亮的路径"周围被密集采样。只要扰动满足 detailed balance（去-回概率对称），整套估计仍然无偏。

效果：原本 BDPT 跑一夜还满屏噪点的玻璃球 caustic 场景，MLT 几分钟收敛。

## 核心要点

**算法骨架**（伪代码）：

```python
x = sample_initial_path_via_bdpt()  # 用 BDPT 当种子
for i in range(N):
    y = mutate(x)                   # 在 x 周围扰动出新路径 y
    a = min(1, (f(y) * T(y, x)) / (f(x) * T(x, y)))
    if random() < a:
        x = y
    splat_to_image(x, contribution = f(x) / pdf_target(x))
```

三个关键概念：

1. **f(x) 是路径贡献**——这条光路最终会给屏幕加多亮一份能量。MLT 的目标分布正比于 f
2. **T(x, y) 是从 x 变到 y 的提议密度**——为了满足 detailed balance，必须可计算正反两向
3. **接受概率 a 的形式来自 Metropolis-Hastings 1970**——保证长期访问频率正比于 f

**为什么这能无偏**：detailed balance 数学上保证 Markov 链的平稳分布正比于 f。简单讲，从亮路径 x 到暗路径 y 的"流量"，等于从 y 回到 x 的"流量"——长期来看，每个区域被访问的次数正比于它的"亮度"。这是 1953 年物理学就证明过的事，Veach 直接搬过来用。

**多种 mutation 策略并存**（论文里同时用）：

- **bidirectional mutation**：砍掉一段子路径，用 BDPT 重新接出来；用于探索新拓扑
- **lens perturbation**：微调相机射出的第一段方向；专攻光泽反射
- **caustic perturbation**：镜面反射链上做小角度抖动；专攻 caustic
- **multi-chain perturbation**：多次扰动叠加，对玻璃路径有效

不同 mutation 之间用 [[veach-1995-mis]] 合权重——MIS 又被嵌套用了一层。

## 实践案例

### 案例 1：玻璃球聚焦的 caustic

桌面上一个玻璃球，灯光打过来在桌面上聚出一片亮斑。

- BDPT：从相机或从光源走，要撞中"光→玻璃折射→桌面亮斑→相机"这种 4-bounce 路径全靠运气，每万条路径才能命中几条
- MLT：一旦运气好命中一条，**caustic perturbation** 在玻璃折射点附近抖动，邻近的亮斑像素同时被采到。亮斑区域被密集打卡，方差骤降

### 案例 2：钥匙孔房间

一个门关着，门上有个钥匙孔，外面有点光源；房间里要算间接照明。

- BDPT：从相机出发的路径几乎不可能挤过钥匙孔；从光源出发的路径又很难找到相机方向
- MLT：bidirectional mutation 一旦撞中一条穿孔路径，反复在它周围扰动，整个房间慢慢被照亮

### 案例 3：β=2 power heuristic 在 mutation 之间继续用

不同 mutation 策略各擅一类——caustic 的扰动对漫反射没用，lens 扰动对纯镜面无效。论文里直接把 [[veach-1995-mis]] 的 power heuristic 套上来：每条路径贡献按各 mutation 在该路径上的提议密度加权合并。

### 案例 4：起步阶段（warmup）的工程实现

```python
# 用 BDPT 找 N_seed 条路径，按贡献加权抽一条当起点
seeds = []
for _ in range(N_seed):  # 比如 N_seed = 10000
    path = bdpt_sample()
    seeds.append((path, contribution(path)))
# 按贡献加权抽一条作为 Markov 链起点
x_init = weighted_choice(seeds)
# 估算总能量 b = mean(contribution)，用于后期 splat 归一化
b = sum(c for _, c in seeds) / N_seed
```

这个 b 叫 **normalization constant**，最终图像每个像素值要乘 b。少了它整张图会按未知系数偏暗或偏亮。

## 踩过的坑

1. **种子分布要正比于 f**：起步阶段（warmup）用 BDPT 找几千条路径并按贡献加权抽一条当起点。不做这步，前几千次迭代会漂移到"局部亮但全局暗"的区域。这叫 **startup bias**

2. **Stratification 丢失**：MCMC 链上相邻样本高度相关，传统的 stratified sampling / Sobol 序列那一套没法直接用。简单场景上 BDPT 反而比 MLT 更快收敛——MLT 不是万金油

3. **暗区域永远采不到 → "亮的更亮、暗的更暗"**：接受概率天生压低低贡献路径。一个房间地下室角落本来就暗，MLT 跑完角落几乎纯黑甚至有色块伪影。生产里要混合一定比例的均匀采样兜底

4. **每种 mutation 都要算正反向 pdf**：detailed balance 要求 T(x→y) 和 T(y→x) 都能数值算出来。lens perturbation / caustic perturbation 的反向 pdf 推导是论文最难的部分，代码量是纯 BDPT 的 2-3 倍

5. **mutation 大小要场景级调参**：扰动太小 → 链卡在局部亮区出不来；扰动太大 → 接受率暴跌、退化成纯随机。Veach 论文里给了一组经验值，但生产场景几乎都要重调

## 适用 vs 不适用场景

**适用**：
- 强 caustic（玻璃、水、金属反射聚焦）
- 复杂间接照明 / 缝隙透光 / 钥匙孔房间
- 场景几何巨复杂，但贡献集中在小区域时——MLT 的复杂度由 f 决定，不由几何决定

**不适用**：
- 简单漫反射场景——BDPT 更快收敛，MLT 是杀鸡用牛刀
- 大面积平均照明（户外白天阴天）——没有"高贡献小区域"，MCMC 优势消失
- 实时渲染（游戏、交互预览）——MLT 收敛过程不能"边跑边看"，画面会先有色块再变干净
- 需要严格 unbiased 帧间一致性的动画——MCMC 帧间方差结构不平稳，相邻两帧的噪声 pattern 不连续，看着像在抖

## 历史小故事（可跳过）

- **1953**：Metropolis、Rosenbluth 等人在 Los Alamos 算原子核能量分布，发明 Metropolis 算法。物理界用了 40 年
- **1970**：Hastings 把它推广成 Metropolis-Hastings，成为 MCMC 的标准接受准则
- **1986**：Kajiya 提渲染方程（[[kajiya-1986-rendering-equation]]），路径追踪诞生
- **1993-1995**：BDPT 和 MIS 出现，但 caustic 仍噪
- **1997**：Veach 在 Stanford 读博，把 Metropolis 搬到路径空间。SIGGRAPH 1997 论文 + 博士论文同年——博士论文 500 页，奥斯卡级别的工程
- **2002**：Kelemen 等人提 PSSMLT——把 mutation 搬到底层随机数空间，代码量降一个数量级，但难场景效果不如原版 path-space MLT
- **2014**：Veach 与 Guibas 凭 BDPT/MIS/MLT 这套组合拿**奥斯卡科学技术成就奖**，电影《阿凡达》《冰雪奇缘》水下场景用过
- **2014-2025**：Multiplexed MLT、Manifold Exploration、Gradient-Domain MLT 等改进出现，但"用 MCMC 攻克 hard light transport"这个最高观点 30 年没人超越

Veach 后来去 Google 主导广告拍卖系统设计，又是另一段传奇。

## 学到什么

1. **MCMC 是对采样不均的终极武器**——只要"重要的地方"占比小，就考虑用 Metropolis 把样本聚过去
2. **detailed balance 是无偏的密码**——别管扰动多花哨，正反向 pdf 算得出来 + 接受概率按公式给，估计就无偏
3. **找到一条好路径就别浪费**——这是 MLT 区别于所有"独立采样"渲染算法的本质洞察
4. **多种 mutation 各司其职 + MIS 合权重**——单一 mutation 总有死穴，组合才稳。和 [[veach-1995-mis]] 一脉相承
5. **MLT 是保险丝不是主路**：生产里默认 BDPT，遇到 caustic 重场景再切 MLT。这种"难场景特化算法"思路在很多领域都通用

## 延伸阅读

- 论文 12 页：[Metropolis Light Transport (SIGGRAPH 97)](https://graphics.stanford.edu/papers/metro/)
- Veach 博士论文（1997）第 11 章：[Robust Monte Carlo Methods for Light Transport Simulation](https://graphics.stanford.edu/papers/veach_thesis/)（500 页里讲 MLT 最清楚的章节）
- PBRT 第 16 章：[Light Transport III: Bidirectional Methods](https://pbr-book.org/4ed/Light_Transport_III_Bidirectional_Methods)（含 PSSMLT 实现，代码可跑）
- Mitsuba 渲染器 [文档](https://mitsuba.readthedocs.io/) 的 path-space MLT 章节——目前唯一开源的原版实现

## 关联

- [[kajiya-1986-rendering-equation]] — 给出要解的方程，MLT 是怎么解亮度集中的难场景
- [[lafortune-1993-bdpt]] — MLT 的种子和 bidirectional mutation 都用 BDPT
- [[veach-1995-mis]] — MLT 内部多种 mutation 之间还用 MIS 合权重
