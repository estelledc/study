---
title: Stable Fluids — 让流体模拟时间步随便给都不爆
来源: Stam, "Stable Fluids", SIGGRAPH 1999
日期: 2026-05-31
子分类: 渲染与图形
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Stable Fluids 是 Jos Stam 1999 年在 SIGGRAPH 提出的**一套解 Navier-Stokes 方程的数值方法**，专门给图形学用——它最大的卖点是**时间步可以调到任意大都不会爆炸**。

日常类比：以前的求解器像走钢丝，步子稍大就摔下去（数值发散）；Stam 给你一根扶手，你就算大跨步也只会晃一下、不会摔。

具体落地：你看到的所有游戏烟雾、火焰、河流，迪士尼/皮克斯电影里的爆炸尘云，Houdini / Blender 里的流体节点，骨架都是这 4 步。

## 为什么重要

不理解 Stable Fluids，下面这些事都没法解释：

- 为什么 1999 年之前的 CG 烟雾都得离线渲染好几天，1999 年之后突然能实时
- 为什么浏览器里那些拖鼠标搅动的烟雾 demo 几乎长得一模一样——因为大家都抄这 4 步
- 为什么 Houdini 的 fluid solver 节点就叫 `Smoke Solver` 但参数有 `advection / diffusion / projection`——直接对应论文里的子步
- 为什么"无条件稳定"在工程里值得单独写一篇论文——它把流体从科学计算搬到了消费端

## 核心要点

Navier-Stokes 方程长这样（不必看懂）：

```
∂u/∂t = -(u·∇)u  - ∇p   + ν∇²u   + f
         平流     压力    扩散    外力
```

Stam 把这一坨拆成 **4 个子步**串联，每步只处理一项，每步都挑"天然稳定"的离散方式：

1. **加力**（add force）：直接 `u = u + dt·f`。最朴素，无脑。

2. **平流**（advection）：用 **semi-Lagrangian**——反向追迹。问题"现在这格的速度从哪儿来"→ 沿速度场倒退一个 dt → 在新位置插值取值。**这是论文最核心的创新**：因为结果一定落在已有值的凸包里，不可能凭空放大，所以**无条件稳定**。

3. **扩散**（diffusion）：用**隐式格式** `(I − νdt∇²)u_new = u_old`，解一个稀疏线性方程组（Gauss-Seidel 或共轭梯度）。隐式 = 不受 CFL 时间步限制。

4. **投影**（projection）：流体不可压（体积守恒）要求 `∇·u = 0`。前 3 步出来的速度场不一定满足，于是解 Poisson 方程 `∇²p = (1/dt)∇·u`，把压力梯度从速度里减掉，强行压回零散度。数学上叫 **Helmholtz-Hodge 分解**。

四步合起来叫**算子分裂**（operator splitting）——把一个又难又耦合的偏微分方程拆成 4 道小菜分别做。

## 实践案例

### 案例 1：semi-Lagrangian 到底在干什么

经典显式平流的写法是"我这一格的水流到哪儿去"，往前推一步：

```text
u_new[x] = u_old[x] - dt · u·∇u   // 显式，dt 大了就爆
```

semi-Lagrangian 反过来问"我这一格的水从哪儿来"：

```text
x_prev   = x - dt · u_old[x]      // 沿速度场倒退一格
u_new[x] = interpolate(u_old, x_prev)  // 在过去那个位置插值
```

`interpolate` 是双线性/三线性插值，**结果必定夹在邻居 4/8 个采样值的最大值和最小值之间**——所以新值不可能超出旧值的范围，能量不会被算法本身放大。

### 案例 2：投影步在做什么——把发散的速度场拍成无散

想象一个二维网格，某一格的速度是 `(2, 0)` 流出去 2，左边那格只补回 1。这格丢了 1 单位流体——**违反了不可压**。投影步会算出一个压力场 `p`，让 `u_new = u - ∇p`，把这 1 单位的"亏空"用压力梯度补回来。

物理直觉：水池里某处水多了，压力就高，把水往四周推。

### 案例 3：Stam 自己写的 70 行 C 代码

Stam 在 2003 年的"Real-Time Fluid Dynamics for Games"里把整个求解器写成大约 70 行 C，关键循环就 3 个函数：`advect()`、`diffuse()`、`project()`，对应核心要点的第 2、3、4 步。这是入门最好的代码——比读论文快得多。

主循环长这样（伪代码）：

```text
for each time step:
    add_force(u, dt)           // 子步 1
    advect(u, u, dt)           // 子步 2：semi-Lagrangian
    diffuse(u, viscosity, dt)  // 子步 3：隐式扩散
    project(u)                 // 子步 4：解 Poisson 投影
    advect(density, u, dt)     // 烟雾密度也用同样的 advect 跟着流场跑
```

`density` 字段被同样的速度场带着走——这就是为什么烟雾能"被流场吹动"的视觉效果。

### 案例 4：为什么浏览器烟雾 demo 都长得很像

打开任何"WebGL fluid"demo，你会发现：手指/鼠标拖动 = 加力（子步 1），颜色被涡流卷起来 = 平流（子步 2），慢慢散开 = 扩散（子步 3），不会塌成一个点 = 投影（子步 4）。整个交互体验**就是 Stable Fluids 的 4 步循环**，区别只在于 GPU 上用 fragment shader 把 Poisson 求解写成多遍 Jacobi 迭代。

## 踩过的坑

1. **数值耗散重，漩涡会消失**：semi-Lagrangian 的插值天然是低通滤波，几步之后小漩涡都被抹平。Fedkiw 等后来加 vorticity confinement 强行把漩涡补回来。

2. **网格法不擅长破碎拓扑**：水花飞溅、液滴分离这类，Eulerian 网格抓不住自由表面。后来用 PIC/FLIP/MPM 的 hybrid 方法补。

3. **Poisson 方程是性能瓶颈**：4 步里前 3 步都很便宜，第 4 步要解全局线性方程组。GPU 实现里大半时间花在这。Multigrid / FFT / preconditioned CG 都是为了加速这一步。

4. **"无条件稳定"≠"无条件准确"**：dt 调太大，烟雾飞起来像幻灯片——稳定不代表物理对。视觉效果好就行的图形学接受这个 trade-off，做工程仿真的（CFD）不能这么用。

## 适用 vs 不适用场景

**适用**：

- 实时 / 准实时 CG 烟雾、火焰、薄雾、气体
- 离线影视渲染的体积流体（被 Houdini 工业化）
- 教学 / 浏览器 demo 里的交互流体玩具
- 任何"视觉合理就够，不追求科学精度"的场合

**不适用**：

- 工程 CFD（飞机翼、汽车风洞）—— 需要守恒律精确，Stable Fluids 的耗散不可接受
- 强烈破碎/飞溅的水（FLIP / MPM 更合适）
- 多相流、燃烧化学反应耦合（需要专门求解器）
- 高雷诺数湍流细节（耗散把湍流抹掉了）
- 极薄的边界层（网格分辨率不够，需要自适应网格）

## 历史小故事（可跳过）

- **1980 年代**：图形学的流体几乎全是显式有限差分 + 极小 dt，要么算很久要么爆。
- **1999 年**：Stam 在 Alias|Wavefront（后来的 Autodesk Maya 团队）做研究，把数值天气预报里早就在用的 semi-Lagrangian + 投影方法搬到图形学，写了 8 页 SIGGRAPH 论文。
- **2003 年**：Stam 发"Real-Time Fluid Dynamics for Games"——同样的算法，70 行 C，专写给游戏开发者。这篇被引比正经论文还多。
- **2001-至今**：Fedkiw 团队用同套骨架做了水、火、烟、爆炸的工业级版本，拿了奥斯卡科学技术奖。

## 学到什么

1. **算子分裂 = 复杂方程的拆分艺术**：一个耦合 PDE 拆成 4 个解耦子步，每步挑最稳的格式——这套思路在很多领域都能用（比如 ADMM、proximal methods）。
2. **反向追迹比正向推进稳**：因为新值落在旧值凸包里，天然有界。这条洞察跨学科（数值天气预报里早就有，Stam 把它带进图形学）。
3. **"不可压"靠投影一步搞定**：Helmholtz-Hodge 分解把"任意速度场"= "无散部分 + 有散部分"，丢掉有散部分就不可压。这是个很优雅的数学工具。
4. **图形学和科学计算的目标不同**：稳定 + 视觉合理 > 严格守恒。论文之所以革命性，是因为它**在图形学的目标函数下**做了正确权衡。
5. **8 页 SIGGRAPH 论文也能定一个领域**：和 Kajiya 渲染方程一样，写得短、抽象到位、给一个能跑的算法骨架，效果比厚书还持久。

## 延伸阅读

- 论文 8 页 PDF：[Stable Fluids - Stam 1999](https://www.dgp.toronto.edu/public_user/stam/reality/Research/pdf/ns.pdf)
- 70 行 C 代码版本：[Real-Time Fluid Dynamics for Games (Stam 2003)](https://www.researchgate.net/publication/2560062_Real-Time_Fluid_Dynamics_for_Games)
- WebGL 交互 demo：[GPU Fluid Simulation - Pavel Dobryakov](https://paveldogreat.github.io/WebGL-Fluid-Simulation/)（拖鼠标就能玩）
- Bridson 教科书：*Fluid Simulation for Computer Graphics*（图形学流体的标准入门书，第 3-5 章就是 Stable Fluids 的工业化讲解）
- [[kajiya-1986-rendering-equation]] —— 同样几页纸定一个领域的图形学论文
- [[blinn-1977]] —— 图形学传统：用近似换实时

## 关联

- [[kajiya-1986-rendering-equation]] —— 渲染方程 vs 流体方程：图形学两根支柱，一个管光怎么走、一个管流体怎么动
- [[catmull-clark-1978]] —— SIGGRAPH 经典短论文范式：8 页改变一个领域
- [[blinn-1977]] —— 早期图形学：宁可近似、宁可看起来对，也要实时
- [[3d-gaussian-splatting]] —— 现代图形学的另一种"稳"：用大量小高斯近似复杂场景，求解上比解 PDE 简单
- [[loop-1987-subdivision]] —— SIGGRAPH 短论文范式的另一例：定义清楚、算法可跑、影响 30 年
