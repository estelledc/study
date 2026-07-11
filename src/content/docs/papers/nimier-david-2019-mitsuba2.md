---
title: Mitsuba 2 — 一份渲染代码同时编出 CPU / GPU / 可微版
来源: 'Nimier-David, Vicini, Zeltner, Jakob, "Mitsuba 2: A Retargetable Forward and Inverse Renderer", SIGGRAPH Asia 2019'
日期: 2026-05-31
分类: 图形学
难度: 高级
---

## 是什么

Mitsuba 2 是一个**物理渲染器**（输入：3D 场景描述；输出：照片级图像），最大特点是：**同一份 C++ 算法源码，按需编译成不同后端**——标量 CPU、向量化 SIMD、CUDA GPU、甚至带**自动求导**的"可微版"。

日常类比：菜谱和厨具解耦。以前一道菜换厨具就重写菜谱；Mitsuba 2 让你写一份抽象菜谱，按需翻译成手抓饭、流水线工厂、教学慢动作——做出来都是同一道菜，差别只在速度和"能不能告诉你每一步对最终味道贡献了多少"（这就是梯度）。

它的"可微版"是关键。给一张目标照片，它能反推：场景里那块墙的材质应该长什么样，光源该多亮——这件事叫**逆向渲染**（inverse rendering）。

## 为什么重要

不理解 Mitsuba 2，下面这些事都没法解释：

- 为什么 2019 前后可微渲染从论文原型变成工程默认选项——Mitsuba 2 是物理可微渲染把门槛砸到 Python 的代表作（NeRF / 3DGS 走自研可微路线，同属这波浪潮，但不依赖 Mitsuba）
- 为什么 2019 年之后逆向渲染从 CUDA 专家活变成 Python 一行能跑——同一份算法可选带梯度的 variant
- 为什么"算法 + 后端解耦"成了 ML / 图形学共识——同一时期 JAX、Triton 在做类似的事
- 为什么 Wenzel Jakob 实验室之后的 Dr.Jit、Mitsuba 3 仍是物理可微渲染默认栈

## 核心要点

Mitsuba 2 的 retargetable 架构有 **三根支柱**：

1. **Variant（变体）**：编译期选好的"渲染器套装"。一个 variant 决定四件事：数值类型（float32 / 双精度）、颜色空间（RGB / 光谱）、是否启用 **AD（自动求导：电脑替你算"拧哪个旋钮画面变多少"）**、运行后端（CPU / GPU）。同一个 path tracer（光线追踪积分器）源文件，按 variant 不同会被特化成约 11 种二进制。

2. **Enoki JIT**：[[enoki-jit]] 是 Mitsuba 2 的"翻译器"。用模板元编程 + 记录-重放，把你写的标量代码追踪成 SIMD intrinsic 或 CUDA kernel。代码看起来像普通 C++ `+ - * /`，但在 GPU variant 下编译后是融合的 CUDA。

3. **反向 path tracing**：要算"图像误差对场景参数的梯度"，就让光线**反向**走一次——从像素倒推到光源，像把做菜录像倒放，看哪一步最影响最终味道。AD 先记下正向计算图，再反向 traverse 拿到梯度。

三根支柱合起来：用户写一遍算法，编译时选 variant，得到对应能力的渲染器。

## 关键事实

- **作者团队**：Merlin Nimier-David / Delio Vicini / Tizian Zeltner / Wenzel Jakob，全部来自 EPFL Realistic Graphics Lab
- **发表场合**：ACM Transactions on Graphics（SIGGRAPH Asia 2019）
- **代码量**：核心 C++ 约 50k 行，Enoki 模板库另算
- **支持 variant 数**：标准发行版编 6-8 个，研究分支可达 11+
- **License**：BSD-3，从一开始就开源
- **后续替代**：2022 年起官方推荐用 Mitsuba 3 + Dr.Jit；Mitsuba 2 仍可用，但不再主开发

## 实践案例

### 案例 1：从一张照片反推材质

你有一张陶瓷茶杯照片，想知道粗糙度 α。下面用 **Mitsuba 3 继任 Python API**（`import mitsuba as mi`）示意——思路与 Mitsuba 2 的可微 variant 一脉相承，绑定写法以 3.x 为准：

```python
import mitsuba as mi
scene = mi.load_file('teapot.xml')          # 1) 读场景
params = mi.traverse(scene)                 # 2) 取出可调参数表
mi.set_grad_enabled(params['cup.bsdf.alpha'], True)  # 3) 打开 α 的梯度

for it in range(100):
    image = mi.render(scene)                # 4) 正向渲染出图
    loss = ((image - target) ** 2).sum()    # 5) 和目标照片比误差
    mi.backward(loss)                       # 6) 反传：α 该往哪拧
    params['cup.bsdf.alpha'] -= lr * params.grad['cup.bsdf.alpha']
```

逐步在干嘛：加载 → 暴露参数 → 声明"我要梯度" → 渲染 → 算误差 → 反向更新。100 次后 α 收敛——**没写 CUDA、没手推梯度**。

### 案例 2：一份算法编多种 variants

`path.cpp` 是个普通 path tracer，里面写：

```cpp
Spectrum L = throughput * emission;  // throughput / emission 是 Enoki 模板类型
```

编译时打开多个 variant（2.x 用项目 CMake 的 variants 列表；3.x 常见 `MI_VARIANTS=scalar_rgb;cuda_ad_rgb;...`），同一文件被特化成：标量 CPU、CUDA 并行、CUDA+AD 等二进制。**算法没变，只是模板参数换了**。

### 案例 3：边界不连续这道老题

可微渲染最难的不是 AD 本身——是**积分边界不连续**。日常类比：调窗帘位置时，光斑突然从"打在墙上"跳到"打在窗外"，中间没有平滑过渡，普通 AD 会以为"怎么拧都没影响"（梯度≈0）。Mitsuba 2 用 **reparameterization**：把边界位置写成参数的可微函数，让"边界本身"也可微。后续 Loubet 2019 / Bangaru 2020 把这个思想做得更彻底。

## 与同代作品对比

- **vs pbrt-v3（2016）**：pbrt 是教科书式的"一份代码、一个 CPU 后端"，注释优先于性能；Mitsuba 2 反过来——注释少但**一份代码 N 个后端**。学习用 pbrt，做研究用 Mitsuba。
- **vs redner（2018）**：redner 提出可微 path tracer，但只支持 CPU + 自家 AD；Mitsuba 2 把可微做成 variant 之一，工程化更彻底。
- **vs Taichi（2019）**：Taichi 也是"DSL + 多后端"思路，但定位是通用并行编程语言，Mitsuba 2 专注渲染。两者哲学接近、应用场景不同。

## 踩过的坑

1. **Variant 数量爆炸**：每加一种 variant，编译时间叠加。开发期 11 个 variants 全编要小时级。生产里通常只编 2-3 个。

2. **AD 内存爆炸**：反向 PT 要存正向所有中间状态。1024×1024 图像、最大反弹深度 8 的场景，单次反向能吃掉几十 GB GPU 内存。

3. **JIT 调试难**：错误信息发生在 Enoki 生成的匿名 kernel 里，行号对不上你写的源码。需要用 dump kernel 模式手动定位。

4. **可见性边界仍是开放问题**：Mitsuba 2 处理基础情况；遮挡边、阴影边的高质量梯度要靠后续工作（[[3d-gaussian-splatting]] 之所以采用各向异性高斯，部分原因就是绕过这个难题）。

## 适用 vs 不适用场景

**适用**：

- 学术研究的可微渲染原型
- 材质 / 光照 / 形状的逆向估计
- 给 NeRF 类神经渲染做物理基线对比
- 同时需要"图像 + 对参数梯度"的训练数据生成

**不适用**：

- 实时游戏渲染（吞吐不够，且不需要梯度）
- 工业级影视产品渲染（Arnold / Renderman 更稳）
- 入门学习物理渲染（pbrt-v3 更线性、注释更详细）

## 历史小故事（可跳过）

- **1997-2003**：pbrt（Pharr & Humphreys）奠定研究型物理渲染器范式——一切公开、可读、可改
- **2010**：Wenzel Jakob 博士期间发布 Mitsuba 1，成为 BRDF / 采样器研究标准平台
- **2018**：Li et al. 发布 redner，第一个真正端到端可微的 path tracer，但只是论文原型
- **2019**：Mitsuba 2 把可微 + 多后端做成工程平台，门槛降到 Python 一行
- **2022**：Mitsuba 3 + Dr.Jit 完全 Python 优先重写，Enoki 退役

## 学到什么

1. **算法和后端可以解耦**——模板元编程 + JIT 是把"一份代码 N 个目标"落地的工程范式，和 JAX / Triton 同一时代的共识

2. **降门槛能催生生态**——Mitsuba 2 把物理可微渲染从 CUDA 专家任务降到 Python 任务；同期神经渲染（NeRF 等）也在用自研可微渲染起飞，同属可微浪潮而非直接依赖关系

3. **可微渲染的难点不在 AD**——而在"积分有边界不连续"这件 1990 年代图形学就在啃的旧账。新工具来了，老问题还在

4. **学术工程化的范式**——一篇论文 + 一份开源代码 + 一个持续迭代的实验室，能撑起一整个子领域 5-10 年

## 延伸阅读

- 论文 PDF：[Mitsuba 2 SIGGRAPH Asia 2019](https://rgl.epfl.ch/publications/NimierDavid2019Mitsuba2)
- 源码：[mitsuba-renderer/mitsuba2](https://github.com/mitsuba-renderer/mitsuba2)
- 继任者：[mitsuba3](https://github.com/mitsuba-renderer/mitsuba3) + [Dr.Jit](https://github.com/mitsuba-renderer/drjit)
- [[redner-2018]] —— 第一个端到端可微 path tracer
- [[pbrt]] —— 物理渲染器范式的源头

## 关联

- [[redner-2018]] —— 可微 path tracer 的开拓者，Mitsuba 2 的直接前身
- [[3d-gaussian-splatting]] —— 可微渲染思想的另一条工程实现路线
- [[nerf]] —— 神经渲染代表作，靠"可微渲染"这条底座立起来
- [[jax]] —— 同时代用 trace + JIT 做多后端的另一案例
- [[triton]] —— DSL + JIT 多后端的 GPU 内核版本
- [[pbrt]] —— 物理渲染器开放范式的源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[veach-1995-mis]] —— Veach MIS — 用一行加权公式让多种采样策略各取所长
- [[appleseed]] —— appleseed — 物理渲染器
- [[luxcorerender]] —— LuxCoreRender — 物理光线追踪
- [[mitsuba3]] —— Mitsuba 3 — 研究向可微渲染器
