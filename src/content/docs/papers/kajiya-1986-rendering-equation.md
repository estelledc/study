---
title: Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程
来源: James T. Kajiya, "The Rendering Equation", SIGGRAPH 1986
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

**渲染方程**（Rendering Equation）是一条积分方程，把"如何在一个三维场景里算出每个像素的颜色"这件事，写成了一行数学：

```
L(x, ω) = Le(x, ω) + ∫ f_r(x, ω′, ω) · L(x, ω′) · cos θ′ dω′
```

日常类比：你站在一面镜子前，镜子里看到的亮度 = 镜子自己发的光（如果会发光）+ 房间里所有方向射到镜子上的光，按"镜子怎么反射"的规则加权求和。

逐部分翻译：

- `L(x, ω)`：点 x 沿方向 ω 射出的亮度（你眼睛看到的就是这个）
- `Le(x, ω)`：点 x 自己发的光（灯泡是非零，墙壁是零）
- `f_r`：**BRDF**——告诉你"光从 ω′ 进、ω 出"该怎么转（镜面、漫反射各有公式）
- `cos θ′`：几何衰减（光斜着射到表面，单位面积接到的能量更少）
- `∫ ... dω′`：对**所有可能的入射方向**求积分

Kajiya 的贡献不是发明这个方程（物理学早有），而是**指出整个图形学行业在做的事，就是在解它**。

## 为什么重要

1986 年之前，渲染算法是一堆各干各的方法：

- **光线追踪**（Whitted 1980）：从眼睛打射线，碰到镜面继续追——只能处理纯反射 / 折射
- **辐射度算法**（Goral 1984）：建有限元方程组解漫反射间接光——只能处理纯漫反射
- **分布式光线追踪**（Cook 1984）：随机分散射线模拟模糊、景深——经验性

Kajiya 把它们**全部解释成在解同一个方程**：

- 光线追踪 = 只取镜面反射方向那一项
- 辐射度 = 假设 BRDF 是纯漫反射，把积分离散化成线性方程组
- 分布式光线追踪 = 用 Monte Carlo 估积分

更重要的：他直接给出**正确的解法**——**路径追踪**（Path Tracing），从眼睛出发反向递归采样光路，让结果在足够多样本后收敛到真解。

后来 30 年的渲染史，几乎都是在改进"怎么更快地解这个方程"：

- **BDPT**（双向路径追踪，1993）— 从光源和眼睛同时发射线，中间连接
- **光子映射**（Jensen 1995）— 第一遍存光子，第二遍查询近似
- **MLT**（Metropolis Light Transport，1997）— 用 MCMC 在路径空间游走
- **NeRF**（2020）— 用神经网络拟合一个体积版的渲染方程
- **3D Gaussian Splatting**（2023）— 用一堆椭球替代神经网络，更快地解同一类积分

理解这一条方程，等于理解了图形学半个世纪的主线。

## 核心要点

可以拆成 **三个洞见**：

1. **递归性**：要算 x 点出射的光，得先知道**所有送光给 x 的点**它们各自出射多少光——这又要先知道送光给那些点的点。这是一个 **Fredholm 第二类积分方程**：未知量同时出现在等号两边。

2. **维度爆炸**：光从光源到眼睛，可能反弹 N 次。每反弹一次，路径就多 2 个维度（一个方向角）。10 次反弹 = 20 维积分。普通数值积分（梯形 / Simpson）在高维彻底失败。

3. **Monte Carlo 是唯一出路**：随机采样路径，用样本平均估积分。维度灾难对 Monte Carlo 失效——它的误差只看样本数 N，不看维度。代价：图像有噪点，要 1000+ 样本才平。

三个洞见合起来，得到**路径追踪算法**：

```
trace(x, ω):
  if x 是光源: return Le
  ω′ = 按 BRDF 重要性随机采样一个入射方向
  x′ = 从 x 沿 ω′ 射出，找下一个交点
  return f_r * trace(x′, -ω′) * cos θ′ / pdf(ω′)  # Monte Carlo 估计
```

## 实践案例

### 案例 1：为什么"全局光照"是难的

直接照明：光源 → 物体 → 眼睛。一次反射，1 维积分，便宜。

间接照明：光源 → 墙 → 桌面 → 眼睛。两次反射，3 维积分。再多一次反射就 5 维。

辐射度算法把场景切成 N 个面片，建 N×N 方程组——N=10 万时矩阵根本存不下。Kajiya 说：**别离散化，直接 Monte Carlo**。这是路径追踪相对辐射度的根本胜利。

### 案例 2：Russian Roulette 让递归终止

数学上递归是无穷深的（光可以反弹无限次）。代码里必须停。简单截断（"反弹 5 次就 return 0"）会让结果**有偏**——丢掉的能量不见了。

Russian Roulette 的做法：每次以概率 p 继续追，若继续，把贡献除以 p。期望值不变（无偏），但平均路径长度有限。这是论文里直接给出的工程招式，今天每个生产渲染器都还在用。

### 案例 3：NeRF 怎么解同一个方程

NeRF 把"场景里每个点"看成一个函数：输入 (x, y, z, 视角)，输出 (颜色, 密度)。然后用**体积渲染方程**（渲染方程的体积形式）沿光线积分：

```
C(r) = ∫ T(t) · σ(t) · c(t) dt
```

形式不同，本质同样：自发光 + 入射光的加权积分。NeRF 的"贡献"是用一个 MLP 网络拟合 σ 和 c 这两个场，反向传播让渲染结果匹配照片。Kajiya 1986 给方程，NeRF 2020 换了个解法（神经网络 + 梯度下降）。

## 踩过的坑

1. **方差爆炸**：高频材质（金属、玻璃、焦散）让某些路径贡献巨大、概率极低。简单均匀采样会出现"一万个样本里只有 3 个真起作用"，图像出现亮点噪声（fireflies）。**重要性采样**（按 BRDF 形状采样）是标准解药。

2. **维度灾难依然存在**：Monte Carlo 误差是 O(1/√N)，每加一个 0 的精度要 100 倍样本。这是为什么离线渲染一帧要算几小时。

3. **直接照明 vs 间接照明分别处理**：完全靠路径采到光源是低效的（点光源概率为 0）。**Next Event Estimation** 在每次弹射时显式连接光源——这又是论文里直接提示的工程修正。

4. **能量守恒易错**：BRDF 必须满足 ∫ f_r cos θ dω ≤ 1。许多老引擎用的 Phong 模型违反这条，能量越反弹越多，画面越来越亮。现代材质（Disney BRDF / GGX）都先过能量守恒检查。

## 适用 vs 不适用场景

**适用**：

- 离线高质量渲染（电影、广告）— 每帧几分钟到几小时
- 实时渲染的"参考真值"— 用路径追踪算 Ground Truth，再训神经网络逼近
- 任何需要全局光照（间接光、焦散、软阴影）的场合

**不适用**：

- 实时游戏（直到 RTX 出现）— 一帧 16ms 不够算几百路径
- 极简风格化渲染（卡通、像素）— 不需要物理正确
- 需要解析解的场景（积分有闭式）— Monte Carlo 此时反而劣势

## 历史小故事（可跳过）

- **1968 年**：Appel 提出 ray casting（一根射线判可见性），还没有反射递归
- **1980 年**：Whitted 做出递归光线追踪——能镜面反射 / 折射，但漫反射靠 ambient 常数糊弄
- **1984 年**：Cornell 团队（Goral）发明辐射度——能算漫反射间接光，但不能镜面
- **1986 年**：Kajiya 在 Caltech 写出渲染方程，**发现两者只是同一方程的不同近似**，并提出 Monte Carlo 路径追踪
- **1993 年**：Veach 博士论文系统化路径空间理论，给出 BDPT / MLT
- **2020 年**：NeRF 把这套数学搬到神经网络上，引爆 3D 重建领域

Kajiya 1986 这篇论文只有 8 页。它的力量不在算法多复杂，而在**统一视角**——把零散的 hack 提升成一门科学。

## 学到什么

1. **统一视角的力量**：好理论的标志是"原来你们都在做同一件事"。Kajiya 没发明新算法，只是把旧算法翻译到一个共同语言里——这件事本身价值千金。

2. **递归积分方程是普适工具**：渲染方程是 Fredholm 方程的特例。同样数学结构在辐射输运、中子物理、声学传播里反复出现。一份解法（Monte Carlo + Russian Roulette）服务多个领域。

3. **维度灾难下 Monte Carlo 是唯一招**：这个洞见在路径追踪里成立，在金融衍生品定价、贝叶斯推断（MCMC）、强化学习（Policy Gradient）里同样成立。

4. **理论 → 工程要 30 年**：1986 年提出，1990 年代离线电影开始用，2018 年 RTX 让实时光追上消费显卡，2020 年 NeRF 重新激活。每一步隔 5—10 年。

## 延伸阅读

- 论文 PDF：[Kajiya 1986 — The Rendering Equation](https://www.cs.cornell.edu/courses/cs4620/2014fa/lectures/35rendering-equation.pdf)（8 页，前 4 页是大背景，方程在第 5 页）
- 教科书：[PBRT — Physically Based Rendering](https://www.pbr-book.org/)（在线免费，path tracing 章节是路径追踪现代实现的标准参考）
- 视频：[Cem Yuksel — Rendering Equation 课](https://www.youtube.com/watch?v=KqeqWZ-WFGM)（犹他大学公开课，黑板讲解 1 小时）
- Veach 1997 博士论文：[Robust Monte Carlo Methods for Light Transport Simulation](http://graphics.stanford.edu/papers/veach_thesis/)（把路径空间数学化）

## 关联

- [[3d-gaussian-splatting]] —— 3DGS 用一堆 3D 椭球解同一类体积渲染积分，速度比 NeRF 快两个数量级
- [[dijkstra-shortest-path]] —— 同样在解"图上最优路径"的问题，但渲染方程的"路径"是连续高维空间
- [[turing-1936]] —— 可计算性的根；Monte Carlo 是把"算不出来的连续积分"翻译成"采样能跑的算法"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[baraff-witkin-1998-cloth]] —— Baraff-Witkin 1998 — 让布料模拟敢走大时间步
- [[catmull-1974-zbuffer]] —— Catmull 1974 Z-buffer — 用一张深度图解决谁挡谁的问题
- [[catmull-clark-1978]] —— Catmull-Clark 1978 — 让任意拓扑网格收敛成光滑曲面
- [[cohen-1985-hemicube]] —— Cohen-Greenberg 1985 Hemicube — 把渲染硬件挪去算辐射度积分
- [[cook-1986-stochastic-sampling]] —— Cook 1986 — 用噪声换掉锯齿
- [[deering-1988-triangle-processor]] —— Deering 1988 Triangle Processor — 现代 GPU 的祖先架构
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[goral-1984-radiosity]] —— Goral 1984 Radiosity — 把建筑工程的辐射热传导算法搬进图形学
- [[hanrahan-1991-hierarchical-radiosity]] —— Hanrahan 1991 Hierarchical Radiosity — 让 radiosity 从 O(n²) 跌到 O(n)
- [[jensen-1996-photon-mapping]] —— Jensen 光子映射 — 先撒光子再查密度的两 pass 全局光照
- [[karras-2012-parallel-bvh]] —— Karras 2012 — 让每个 BVH 内部节点独立算自己（O(N) 全并行 GPU 构建）
- [[lafortune-1993-bdpt]] —— Lafortune-Willems 1993 — 从相机和光源同时撒光线再"接龙"
- [[liu-2020-dlss]] —— DLSS 2.0 — 把 4K 实时渲染的一半工作量交给神经网络
- [[love2d]] —— LÖVE — Lua 2D 游戏框架
- [[monaghan-1992-sph]] —— SPH — 把流体拆成一群带核的粒子
- [[mueller-2007-pbd]] —— Position Based Dynamics — 跳过力，直接挪位置
- [[nerf-2020]] —— NeRF — 用一个 MLP 把整个场景"背"下来
- [[panda3d]] —— Panda3D — Disney/CMU 出品的开源 3D 游戏引擎
- [[perlin-1985-noise]] —— Perlin Noise — 让计算机生成的图像不再有"机器味"
- [[plenoxels-2022]] —— Plenoxels — 不要神经网络也能渲染辐射场
- [[saito-takahashi-1990-gbuffer]] —— Saito-Takahashi 1990 — 第一次提出 G-buffer 的论文
- [[stam-1999-stable-fluids]] —— Stable Fluids — 让流体模拟时间步随便给都不爆
- [[sulsky-1994-mpm]] —— MPM — 让粒子背着自己的历史，借网格算一遍力
- [[turing-1936]] —— Turing 1936 可计算性
- [[veach-1995-mis]] —— Veach MIS — 用一行加权公式让多种采样策略各取所长
- [[veach-1997-mlt]] —— Veach MLT — 用 Metropolis 在路径空间游走，专攻 BDPT 也算不动的难场景
- [[wald-2007-sah-bvh]] —— Wald 2007 — 把 SAH BVH 构建从分钟级砍到秒级的 binned 近似法

