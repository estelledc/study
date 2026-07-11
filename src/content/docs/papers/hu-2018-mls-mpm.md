---
title: MLS-MPM — 把 MPM 重写到"几百行能跑实时"的现代版本
来源: Hu, Fang, Ge, Qu, Zhu, Pradhana, Jiang, "A Moving Least Squares Material Point Method with Displacement Discontinuity", SIGGRAPH 2018
日期: 2026-05-31
分类: 计算机图形学
难度: 中级
---

## 是什么

MLS-MPM 是 [[sulsky-1994-mpm]] 的现代化重写：把 MPM 里那一套 B-spline 形函数换成**移动最小二乘**（Moving Least Squares）拟合，再把 APIC（仿射粒子网格法，Jiang 2015）的仿射速度场吃进同一个公式里，得到一份**短、快、GPU 友好**的新内核。

日常类比：原版 MPM 像在每个粒子周围摆 27 个砝码（quadratic B-spline），先称重再平均；MLS-MPM 改成"在粒子周围用一张小桌子做最小二乘拟合"——拟合本身天然给出权重和导数，少算一遍、还更准。

MPM 每步都在两套表示之间倒腾：**P2G**（Particle-to-Grid，粒子→网格，像把散落的沙倒进格子称重）和 **G2P**（Grid-to-Particle，网格→粒子，再把格子上的力发回每粒沙）。APIC 还给每粒沙记一张小"速度倾斜表"（仿射矩阵 C），描述它附近谁快谁慢。

配套的工程产物是 **Taichi**——Hu 为这类"循环 + 稀疏网格"仿真写的领域特定语言，目标是 Python 写、CUDA 跑。论文配套的 88 行 Taichi 版 MLS-MPM 成了之后五年图形学课的入门样本。

## 为什么重要

不理解 MLS-MPM，下面这些事都没法解释：

- 为什么 2018 年之后 MPM 突然从"工业界离线渲染才用得起"变成"本科生周末跑得动"
- 为什么 DiffTaichi / DiffMPM / ChainQueen 这一波**可微仿真**几乎都建在 MLS-MPM 之上
- 为什么 Taichi 能从 2018 的配套库长成 SIGGRAPH Asia 2019 的独立语言论文——MLS-MPM 是它最早的硬核客户
- 为什么"切割""断裂""材料分层"这些以前 MPM 做得很别扭的事，现在能直接跑

一句话：**MLS-MPM 是把 1994 年的固体力学算法压到"实时 + 可微 + 易写"的临门一脚**。

## 核心要点

论文有 **三个并列贡献**，不是一个递进结构：

1. **MLS 形函数替 B-spline**：原版 MPM 在 P2G/G2P 时用 B-spline 权重 + 单独算梯度。MLS-MPM 用一次最小二乘拟合**同时**得到权重和速度梯度，省一遍计算。

2. **把 APIC 的仿射矩阵 C 吃进 P2G**：APIC（Jiang 2015）用一个 3×3 矩阵 C 记每个粒子的局部仿射速度场，能量守恒比 PIC/FLIP 都好。MLS-MPM 发现 **C 可以直接和应力张量合并到一次 P2G 里**——P2G 公式从两项变一项。这是 2× 加速的来源。

3. **CPIC（Compatible PIC）处理位移不连续**：在网格点附近放一面"薄片"（thin shell），让薄片两侧的粒子**只看自己这边的网格**——切割、断裂、薄壁这些"网格点附近材料应该不连续"的场景终于能干净建模。

把三件事缝起来，结果是：同一个 P2G 内核既快、又支持切割、还能直接微分。

## 实践案例

### 案例 1：88 行 Taichi 跑出果冻

论文附录给出的 88 行 Taichi 程序，是 MLS-MPM 最出圈的产物。结构大致是：

```python
# 极简伪代码（P2G 核心）
@ti.kernel
def substep():
    for p in particles:
        base = (x[p] / dx - 0.5).cast(int)
        fx = x[p] / dx - base.cast(float)
        w = [0.5*(1.5-fx)**2, 0.75-(fx-1)**2, 0.5*(fx-0.5)**2]
        affine = stress + p_mass * C[p]  # MLS-MPM 关键合并
        for i, j in ti.static(ti.ndrange(3, 3)):
            offset = ti.Vector([i, j])
            dpos = (offset.cast(float) - fx) * dx
            weight = w[i].x * w[j].y
            grid_v[base + offset] += weight * (p_mass * v[p] + affine @ dpos)
```

**逐部分解释**：

- `base` / `fx`：粒子落在哪个 3×3 网格邻域、相对格子中心偏了多少
- `w = [...]`：二次权重（同时隐含梯度），替代原版 B-spline 的"先权重再单独求导"
- `affine = stress + p_mass * C[p]`：把应力和 APIC 的仿射表 C **合成一项**——这就是 2× 加速的来源
- 内层循环：按权重把动量撒到周围格子（一次 P2G 干完以前两遍的活）

### 案例 2：和 [[sulsky-1994-mpm]] 的差距在哪

- **1994 原版**：B-spline 形函数 + PIC 转移，能量耗散严重；每步 P2G 要做"插值速度"和"插值动量"两遍
- **2015 APIC**（Jiang）：加入仿射矩阵 C，能量守恒大改；但 C 还是单独维护
- **2018 MLS-MPM**：C 和 stress 合并到一项 P2G；同时 MLS 形函数让 G2P 的速度梯度免费拿到

代码量从几百行压到不到 100 行，速度快 2×，能量守恒还更好。

### 案例 3：可微仿真的基座

DiffTaichi（Hu 2020）、ChainQueen（Hu 2019）、DiffMPM 这一系列**让仿真可微**的工作几乎都用 MLS-MPM 当物理后端。原因：

- 计算图短（公式合并后中间变量少）
- 形式干净（MLS 拟合的导数解析可写）
- Taichi 自动微分天然适配

机器人控制、材料反演（"给一段目标动画，反推这块橡皮泥的弹性参数"）这一波研究都建在 MLS-MPM 上。

### 案例 4：CPIC 让切割不再尴尬

原版 MPM 切一刀豆腐，刀片附近的粒子会"跨过刀片"互相影响，因为它们共享网格点。CPIC 给刀片建一张**薄片网格**，薄片两侧粒子各自维护自己看得见的网格点——切口附近的速度/应力不会泄漏过去。论文里演示了切橡皮泥、撕布、切苹果。

## 关键事实

- **2× 加速来自公式合并**——不是 SIMD/GPU 调优，是数学层把两次 P2G 合一
- **MLS 拟合给出导数"免费"**——这是和 B-spline 最大的差别；B-spline 也能算导数但要单独写
- **CPIC 是"薄片"机制**——不是改 MPM 主循环，是在网格附近加一层不连续面
- **88 行 Taichi 是论文的二级产物**——但反而比正文更出圈，进入了多个图形学课程
- **Taichi 是配套语言**——Hu 自己设计，目标就是让稀疏网格 + 粒子循环在 Python 写出来还能跑得快

## 踩过的坑

1. **MLS-MPM 不是任何场景都比原版快**：当形函数选 cubic B-spline 时，MLS 二次拟合的精度未必更高，纯密集材料里差异不大。2× 加速主要在 quadratic 设定下。

2. **CPIC 的薄片建模有几何门槛**：切割路径必须显式给出（一组三角片），不是从粒子破坏自动涌现。如果想要"自动断裂"还得配 phase-field 或 peridynamics。

3. **GPU 上的稀疏网格依然挑战**：MLS-MPM 公式简化了，但稀疏网格的内存布局、原子操作、负载均衡都是工程难点。Taichi 提供了 SNode 抽象帮忙，但真要跑到 1000 万粒子还是要调。

4. **本构方程的耦合**：MLS-MPM 的形函数改了，部分原版本构（如某些粘塑性模型）的离散化要重推。论文给了几种常见本构（neo-Hookean、雪、流体）的 MLS 版本，但不在论文表里的需要自己推。

5. **"88 行就能跑"是有前提的**：那 88 行假设你已经装好 Taichi、理解 P2G/G2P、知道 quadratic B-spline 怎么写。零基础硬看会卡在仿射矩阵那一行。

## 适用 vs 不适用场景

**适用**：

- 大变形固体仿真要从 1× 提到 2× 速度——公式层换 MLS-MPM 即可
- 想做切割 / 断裂 / 薄壁 / 多物质接触——CPIC 是目前最干净的方案
- 想做可微仿真 / 学习材料参数——MLS-MPM 几乎是默认后端
- 教学 / 原型 / 周末项目——88 行 Taichi 直接抄

**不适用**：

- 极致守恒要求（航天器、长时间预报）——MLS-MPM 仍非严格守恒
- 极薄壳 / 布料 / 绳索——MPM 系列对各向异性都不友好
- 流体为主的场景——Stable Fluids [[stam-1999-stable-fluids]] 或 FLIP 仍更轻
- 不会写 Taichi / CUDA——CPU 单线程 MLS-MPM 不快，加速主要靠 GPU 并行

## 历史小故事（可跳过）

- **1994**：Sulsky 等定义 MPM [[sulsky-1994-mpm]]，固体力学界用了近 20 年
- **2013**：Stomakhin 等用 MPM 做《冰雪奇缘》的雪，图形学一夜爆红
- **2015**：Jiang 等提出 APIC，修 PIC/FLIP 的能量噪声两难
- **2018**：Hu 等提出 MLS-MPM（SIGGRAPH）；同期开源早期 Taichi 库（arXiv），用 88 行演示把"快"和"易写"绑在一起
- **2019**：Taichi 语言论文发在 SIGGRAPH Asia；ChainQueen 等把可微仿真推向机器人
- **2020**：DiffTaichi（ICLR）等继续把 MLS-MPM 当可微物理后端
- **2021 至今**：Taichi 独立成开源项目，MLS-MPM 成为本科生图形学课样例

从 1994 固体力学论文到 2018 图形学现代化重写，跨度 24 年；语言论文则晚一年才独立成篇。

## 学到什么

1. **公式合并比指令调优更值**——MLS-MPM 的 2× 不是 GPU 调优，是数学层把 stress 和 C 合到一项
2. **配套语言放大算法影响**——MLS-MPM 单独发也是好论文，配上 Taichi 才能让"88 行就能跑"成为新基线
3. **可微是新的合作通道**——把仿真写成可微后，机器学习、机器人控制、材料学都能挂上来
4. **不连续性要显式建模**——CPIC 的"加一层薄片"是个反直觉但好用的设计模式：不强行让主循环处理一切

## 延伸阅读

- 论文 PDF：[Hu et al, MLS-MPM with Displacement Discontinuity, SIGGRAPH 2018](https://yuanming.taichi.graphics/publication/2018-mlsmpm/mls-mpm-cpic.pdf)
- 88 行 Taichi 实现：[GitHub yuanming-hu/taichi_mpm](https://github.com/yuanming-hu/taichi_mpm)
- Taichi 语言主页：[taichi-lang.org](https://www.taichi-lang.org/)
- DiffTaichi 论文：[Hu et al, DiffTaichi, ICLR 2020](https://arxiv.org/abs/1910.00935)
- [[sulsky-1994-mpm]] —— MLS-MPM 的母方法，先读这篇再看 MLS 改造
- [[stam-1999-stable-fluids]] —— 同时代图形学物理仿真奠基
- [[disney-brdf-2012]] —— Disney 同期渲染管线的另一环

## 关联

- [[sulsky-1994-mpm]] —— 24 年前的母论文；MLS-MPM 是它的现代化重写
- [[stam-1999-stable-fluids]] —— 流体奠基，和 MPM 互补：流体走 Eulerian，MPM 走粒子 + 网格混合
- [[disney-brdf-2012]] —— 同属 Disney/UCLA 图形学体系；Frozen 团队后续工作之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[disney-brdf-2012]] —— Disney Principled BRDF 2012 — 11 个滑块封装 Cook-Torrance 全家桶
- [[sulsky-1994-mpm]] —— MPM — 让粒子背着自己的历史，借网格算一遍力

