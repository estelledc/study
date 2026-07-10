---
title: Deering 1988 Triangle Processor — 现代 GPU 的祖先架构
来源: 'Deering, Winner, Schediwy, Duffy, Hunt, "The Triangle Processor and Normal Vector Shader: A VLSI System for High Performance Graphics", SIGGRAPH 1988'
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

1988 年 SIGGRAPH 上，Schlumberger 实验室的 Deering 团队发表了一套**专门跑实时 3D 图形的两颗芯片**：

- **Triangle Processor**：把三角形顶点变成屏幕上的像素，并自带"谁挡谁"判断
- **Normal Vector Shader**：在每个像素上现场算光照（不是预先算好再涂）

日常类比：以前画 3D 是手工流水线——一个工人画完轮廓，另一个人手动算阴影。Deering 这套相当于**第一条专门为三角形设计的自动化流水线**，每个工位一颗芯片，并且能并联多条线一起干活。

这是后来 NVIDIA / AMD GPU 在**像素端 + 隐藏面消除**这条线上的关键祖先之一（几何变换端另有 SGI Geometry Engine 祖谱）。

## 为什么重要

不理解这篇论文，下面这些事都没法解释：

- 为什么"GPU"长这个样子——几何阶段 + 像素阶段两段式，而不是一颗大芯片包打天下
- 为什么 z-buffer 几乎是图形硬件的"出厂标配"，连最便宜的手机 GPU 都有
- 为什么现代 fragment shader（像素着色器）能"每像素跑一段代码"——Normal Vector Shader 是它的祖师爷
- 为什么"deferred shading"（延迟着色）这个 2000 年代才热起来的技术，论文骨架里其实早就埋了

## 核心要点

整套系统可以拆成 **三件事**：

1. **Triangle Processor 做光栅化 + z-buffer**：每颗芯片负责屏幕上一组扫描线（比如第 0、4、8…行）。三角形顶点送进来，芯片自己算"这一行哪些像素属于这个三角形"，并把每个像素的深度值（z 值）和已存的比较——近的留下，远的丢掉。隐藏面消除做在硬件里。

2. **Normal Vector Shader 做每像素 Phong 着色**：传统的 Gouraud 着色是在三个顶点算好颜色再线性插值——便宜但圆球看起来像多边形。Phong 着色是**插值法线**，每个像素拿到一个新法线后再现场跟光源算，效果远好。1988 年第一次被做进硬件。

3. **几何 / 像素 解耦**：Triangle Processor 只关心"哪些像素属于这个三角形 + 它们的属性（z、法线）"；Normal Vector Shader 只关心"给我一堆像素和它们的法线，我返回颜色"。这种**先收集属性、再统一着色**的两段式，正是 2004 年后流行的 deferred shading 雏形。

## 实践案例

### 案例 1：z-buffer 在硬件里干什么

软件版 z-buffer（1974 Catmull）：每画一个像素，先去内存读旧 z，比较，再决定写不写。每秒上百万次内存访问，CPU 顶不住。

Triangle Processor 把它做成**芯片内的小 SRAM**：

```
读旧 z → 比较新 z → 写新 z（如果近）
       ↓ 一颗芯片三个时钟周期搞定
```

代价：每颗芯片只能管屏幕一小条带（如 4 行）；多条带就堆多颗芯片。这种"按扫描线切片"的并行策略，今天的 GPU tile-based renderer（Apple / 高通 GPU 主流）思路完全一致。

### 案例 2：Phong vs Gouraud 一眼就能看出来

```
顶点 A 法线 = ↑   顶点 B 法线 = →   顶点 C 法线 = ↗

Gouraud：在 A、B、C 算好亮度，三角形内部线性插值亮度
       → 圆球边缘"亮度带"明显，看起来像多边形

Phong：把法线本身插值（每像素一个法线），再算光照
     → 高光（specular）位置准确，圆球真的圆
```

Normal Vector Shader 把"插值法线"和"算光照"全做进硬件——前者是几个加法器，后者是 dot product + 查找表。1988 年的硅工艺刚好够用。

### 案例 3：现代 fragment shader 的家谱

```
1988 Normal Vector Shader  → 固定功能"插值法线 + Phong 光照"
1990s SGI RealityEngine    → 多纹理 / 可配置组合
2001 NVIDIA GeForce 3      → 第一个可编程 vertex shader + 受限 pixel shader
2002 ATI Radeon 9700       → 通用浮点 pixel shader（Shader Model 2.0）
2006 Unified Shader (G80)  → vertex / pixel 用同一种处理器
2010s 至今                  → fragment shader 跑任意 SIMT 程序
```

1988 年那个"每像素一段固定逻辑"的硬件位置，一路演化成"每像素一段任意代码"。位置没变，只是固定→可编程。

### 案例 4：多芯片并行怎么协作

论文给的拓扑：多颗 Triangle Processor 并联，每颗负责屏幕上一组扫描线（按行号取模分配），下游接 Normal Vector Shader。

```
顶点流 ──┬─→ TP-0  (扫描线 0,N,2N,…)  ┐
         ├─→ TP-1  (扫描线 1,N+1,…)   │
         ├─→ TP-2  (扫描线 2,N+2,…)   ├─→ NVS → 帧缓冲
         └─→ ...                        ┘
```

每颗 TP 只看自己那组扫描线。所有 TP 都收到同一份顶点流——便宜的广播式分发。NVS 在下游收齐属性后批量着色。后来 SGI / NVIDIA 都把这个结构沿用，只是数量从几颗变成几千个 SIMD 通道。

## 踩过的坑

1. **不是 GPU 的唯一起点**：SGI 的 Geometry Engine（1982 Clark）早 6 年把"几何变换"做进硬件。Deering 这篇赢在**像素端 + 隐藏面消除一起做**，两条祖谱合流才成现代 GPU。

2. **Phong 硬件代价太高**：1990s 大部分商用图形卡退回 Gouraud + 纹理贴图，Phong 着色直到 2002 年可编程 pixel shader 出来才大规模回归。技术领先太多年也是一种坑。

3. **z-buffer 精度问题**：浮点 z 在远处分布稀疏，远处物体会出现"z-fighting"（两个面闪烁交替）。论文当时已暴露，但完整解法（W-buffer / logarithmic z）是后续 5-10 年的工作。

4. **并行扫描线分配的负载不均**：屏幕上方天空像素少、下方建筑像素多——按扫描线切的话，下方芯片忙死、上方闲死。后来的 GPU 改成 tile-based 才把这事压平。

## 适用 vs 不适用场景

**适用**：
- 学 GPU 体系结构，想知道"为什么长这样"——这篇是必读
- 设计图形管线（哪怕是软件渲染器），两段式 + z-buffer 仍是默认骨架
- 理解 deferred rendering / tile-based GPU 的历史动因

**不适用**：
- 学现代实时图形 API（Vulkan / Metal / DirectX 12）的细节——它们已经远远超出 1988 年的视野
- 学光线追踪（ray tracing）—— 那是 1980 Whitted 的另一条线，与光栅化平行发展
- 学神经渲染（NeRF / Gaussian Splatting）——那是 2020 年代的新范式，和这篇硬件思路差很远

## 历史小故事（可跳过）

- **1974**：Ed Catmull 博士论文里提出 z-buffer 算法——纯软件，每像素一次内存读写，慢到没人用
- **1982**：Jim Clark 的 SGI Geometry Engine 把矩阵变换做进硬件，几何端硬件化第一步
- **1988**：Deering 团队把光栅化 + z-buffer + Phong 全做进 VLSI；Deering 后来加入 Sun，参与 GT / ZX 等工作站显卡架构（思路延续，GT 并未直接复用那两颗芯片）
- **1996**：3dfx Voodoo 把同样思路压到消费级 PCI 卡，399 美元
- **1999**：NVIDIA GeForce 256 加上硬件 T&L（变换和光照），第一次自称"GPU"

之后的故事大家都熟。这条路从 1988 那两颗芯片走到今天的 H100，硬件位置基本没动，只是每个位置都从"固定逻辑"变成了"可编程处理器"。

## 学到什么

1. **解耦是体系结构的灵魂**：把"哪些像素属于三角形"和"像素该是什么颜色"拆开，两边独立优化、独立堆并行——deferred shading 的胚胎
2. **专用硬件能让"算法上行得通但跑不动"的东西真正实用**：z-buffer 1974 年就有，1988 年才能真跑实时；Phong 1975 年就有，2002 年才大规模回归
3. **并行不是免费午餐**：扫描线切片简单但负载不均；后来 tile-based 才解决，是 20 年的迭代
4. **早 10 年的工作往往要等工艺跟上才落地**：Phong 硬件 1988 太贵，等到 2002 年硅工艺翻了若干倍才划算

## 延伸阅读

- 论文 PDF：[Deering 1988 SIGGRAPH](https://dl.acm.org/doi/10.1145/54852.378468)（10 页，体系结构图清晰）
- David Kirk / NVIDIA 写的 GPU 历史综述：[A Brief History of GPU](https://www.cs.cmu.edu/afs/cs/academic/class/15462-f12/www/lec_slides/gpu-history.pdf)
- 现代 deferred shading 教程：[LearnOpenGL — Deferred Shading](https://learnopengl.com/Advanced-Lighting/Deferred-Shading)（看完会发现思路和 1988 年没本质区别）
- [[kajiya-1986-rendering-equation]] —— 光照方程，告诉你"为什么 Phong 是个近似"
- [[owens-2007-gpgpu-survey]] —— GPU 通用计算综述，能看到从 Triangle Processor 演化到 GPGPU 的另一条线

## 关联

- [[kajiya-1986-rendering-equation]] —— 渲染方程是理论模型，Triangle Processor 是工程实现
- [[owens-2007-gpgpu-survey]] —— GPGPU 时代回头看，固定管线如何变成通用计算
- [[gpu-microbenchmarking-2010]] —— 现代 GPU 微基准，能验证 1988 年的两段式仍在
- [[ampere-architecture-2020]] —— NVIDIA Ampere，看 30 年后的同一个架构位置长什么样
- [[3d-gaussian-splatting]] —— 反例：神经渲染绕开了光栅化，是这条祖谱的"另一条岔路"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[3d-gaussian-splatting]] —— 3D Gaussian Splatting — 用一堆 3D 模糊光斑重建场景
- [[gpu-microbenchmarking-2010]] —— GPU 微基准 — 用秒表把闭源芯片"戳"出真相
- [[kajiya-1986-rendering-equation]] —— Kajiya 渲染方程 — 把所有渲染算法统一成一个积分方程

