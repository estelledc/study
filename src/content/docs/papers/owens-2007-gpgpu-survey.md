---
title: Owens 2007 GPGPU 综述 — CUDA 之前 GPU 通用计算的黑魔法时代
来源: Owens et al., "A Survey of General-Purpose Computation on Graphics Hardware", Computer Graphics Forum 26(1), 2007
日期: 2026-05-31
分类: 硬件/异构计算
难度: 中级
---

## 是什么

这篇是 **2007 年初**七位作者（Owens、Luebke、Govindaraju、Harris、Kruger、Lefohn、Purcell）在 Eurographics 的 STAR（State of the Art Report）综述。它把当时所有"用显卡跑非画图任务"的工作打包整理成一份 30 多页的全景图。

时间点很关键——**CUDA 1.0 是 2007 年中才发布**。这篇综述定稿时，CUDA 还没量产，业界的 GPU 通用计算全靠**伪装成画图**：

- 数据 → 伪装成 **纹理**（texture，本质是一张图）
- 算子 → 伪装成 **像素着色器**（pixel/fragment shader，本来用来算每个像素颜色）
- 跑一次 → **画一个铺满屏幕的矩形**，让显卡对每个像素跑一次着色器
- 结果 → **render-to-texture**，把"画出来的图"读回来当作结果数组

日常类比：你想用面包机做蛋糕，但面包机只接受面粉。你只好把蛋糕原料伪装成面粉投进去，跑面包程序，再把出来的"面包"切片当蛋糕用。能做，但荒唐。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 CUDA 一出现就横扫学术界——它把上面那套伪装全砍了，写并行代码就像写 C
- 为什么后来的并行模型（CUDA thread / OpenCL work-item）都长得像 stream programming——抽象是 GPGPU 时代留下来的（注意：CUDA 里另有「异步 stream」，同名不同义，见关联）
- 为什么早期深度学习（2006-2010 年的 RBM / DBN）跑得那么慢——还没用上 GPU，或者用的就是这种伪装版
- 为什么 NVIDIA 当年敢押注通用计算——这篇综述说明学界已经在硬撬 GPU 做非图形计算，缺的是一把好钥匙
- 为什么"GPU 友好"的算法设计原则（无副作用、规则访问、SIMD）今天还在用——硬件形态变了，这条约束没变

## 核心要点

### 1. 流式编程模型（stream programming）

GPU 的本质抽象是：**对一串相同结构的数据，每个元素跑同一段代码，元素之间不能互相看**。

类比：流水线 200 个工人，每人桌前来一个零件，做完传走。**工人之间不能互通消息**——这是为了硬件能猛塞 200 个工人。

这个抽象后来直接进了 CUDA（thread）、OpenCL（work-item）、SYCL（参见 [[sycl-cpp-2020]]）。

### 2. 把数组装进纹理（gather 可以、scatter 不行）

| 你想做的事 | GPGPU 时代的做法 | CUDA 之后 |
|---|---|---|
| 存 1024 个 float | 用一张 16×16 RGBA 纹理（4 个 float/像素 × 256 像素 = 1024）| 直接 `cudaMalloc(1024 * 4)` |
| 读 `arr[i]` | shader 里 `tex2D(input, uv)`，uv 是计算出的纹理坐标 | `arr[i]` |
| 写 `arr[i] = x` | **不可能任意写**，只能写当前 fragment 的像素位置 | `arr[i] = x` |

最后一行是关键。**没有 scatter（任意位置写）** 让很多算法（hash、histogram、某些 sort）只能用很绕的方式实现。这是 GPGPU 时代最大的痛点。

### 3. shader 语言：Cg / GLSL / HLSL / Brook / Sh

综述里列了一堆当时的工具：

- **Cg**（NVIDIA）：C-like 语法，编译到 OpenGL/DirectX 各种后端
- **GLSL**（OpenGL Shading Language）：跨 GPU 厂商，但绑死 OpenGL
- **HLSL**（DirectX）：微软家的，绑 Windows
- **Brook**（Stanford 2004）：第一次提出"用流式语言写、编译到 shader"，是 CUDA 的精神祖先
- **Sh**（Waterloo）：用 C++ 模板做元编程生成 shader

这些工具的**共同问题**：你写一个加法，但你不能假装这是 CPU——必须懂图形管线在干什么，否则性能完全不可预测。

## 实践案例

### 案例 1：在 GPGPU 时代写一个向量加法

CPU 写法（10 秒搞定）：

```c
for (int i = 0; i < N; i++) c[i] = a[i] + b[i];
```

2006 年 GPGPU 写法（半天起步）：

```cpp
// 1. 创建两张 N 像素的 float 纹理 A、B，把数据上传
// 2. 创建第三张纹理 C 作为渲染目标（FBO）
// 3. 写一个 fragment shader（Cg）
float4 main(float2 uv : TEXCOORD0,
            uniform sampler2D A,
            uniform sampler2D B) : COLOR {
    return tex2D(A, uv) + tex2D(B, uv);
}
// 4. C++ 端：bind FBO、设 viewport 为 N 像素、glDraw 一个铺满屏幕的 quad
// 5. 把 C 纹理 read back 到 CPU
```

**FBO**（Framebuffer Object）可以想成：把画布绑到一张纹理上，画完就能把结果当数组读回。**对比 CUDA**（2008）：`c[i] = a[i] + b[i];` 写在 kernel 里，启动 `<<<grid, block>>>`，完。

### 案例 2：调试只能"看像素颜色"

GPGPU 时代没有 `printf`、没有断点、没有变量监视。你只能：

1. 把"想看的中间变量"塞进输出像素的 RGBA
2. render-to-texture 把它存下来
3. 用 PIX / glIntercept 抓帧，把那张图放大，**用肉眼读颜色值**

如果你的中间变量是负数或大于 1.0，会被自动 clamp 到 \[0,1]——你还看不到原值。所以大家都得手写"normalize 一下再输出"。

### 案例 3：histogram 为什么必须绕路

CPU 一行 `hist[arr[i]]++` 完事。GPGPU 时代**没有 scatter**，不能任意写 `hist[k]`，只能：

1. 把输入数组装进纹理，每个 fragment 读自己的 `arr[i]`
2. 先 **sort**（把相同 key 聚到一起），再做 **segment reduction**（每段求和）
3. 输出仍是一张纹理，read back 后才是 histogram

综述里同类应用还有稠密矩阵乘、FFT、数据库 sort/join、流体等，常报相对 CPU **5–30×**。**没有人在 2007 年觉得这是搞 AI**——大家想的是科学计算和图形相关任务。

## 踩过的坑

1. **stream model 不是万能**：需要全局通信的算法（图遍历、不规则稀疏）在 GPGPU 时代基本死路一条。CUDA 加 shared memory 才让这类问题有救。

2. **没有 scatter 的代价**：很多算法要"重新设计"成 gather 形式。比如 histogram，CPU 一行 `hist[arr[i]]++` 完事，GPU 上得搞 sort + segment reduction，复杂度暴涨。

3. **精度坑**：早期 GPU 只有 fp24 或 fp32（看厂商心情），没有 fp64。科学计算社区抗拒了好几年才接受"先 fp32 跑、关键步骤 CPU 验"。

4. **API 不稳定**：Cg / GLSL / HLSL 三家语法不同；DirectX 9 → 10 大改；驱动 bug 多。学术论文里的 trick 经常**换显卡就失效**。

## 适用 vs 不适用场景

**适用**（理解这篇有用）：
- 学 CUDA / OpenCL 时想搞清"为什么是这种抽象"
- 读 2005–2010 年图形/HPC 论文（语境完全是 shader-based；精读这篇约 30 页综述即可建立语境）
- 理解为什么 [[sycl-cpp-2020]] / Vulkan compute 的设计跟 CUDA 都长得像

**不适用**：
- 写新 kernel——请直接看 CUDA / OpenCL；文中 trick 在 2007 年后已被淘汰
- 现代 LLM 训练优化——参考 [[nickolls-dally-2010-cuda-era]] 之后的工作

## 历史小故事（可跳过）

- **2002-2003 年**：Mark Harris（NVIDIA）建 GPGPU.org，开始系统整理"用 shader 算非图形"的工作。这是 GPGPU 这个词的起点。
- **2004 年**：Brook 论文发布（Buck et al.），第一次把 stream programming 抽象出来。Buck 后来去了 NVIDIA，成为 CUDA 主架构师之一。
- **2006-2007 年**：本文作者们写综述（Eurographics 2005 STAR 是初版，2007 CGF 是扩充版）。
- **2007 年中**：CUDA 1.0 发布，**这篇综述里的所有 shader 黑魔法瞬间过时**。但它作为历史档案的价值反而升高——它告诉你"为什么 CUDA 是革命，不是迭代"。

## 学到什么

1. **抽象是有代价的**：stream model 让 GPU 能猛塞算力，但牺牲了灵活性（无 scatter、无全局通信）。后来 CUDA 加 shared memory + atomics 是在松绑，但**核心 SIMT 假设没变**。
2. **硬件决定算法形态**：算法不是抽象的——同一个 histogram，CPU 上和 GPU 上是两种代码。学并行计算要先理解硬件能做什么。
3. **过渡期工具的命运**：Cg / Brook / Sh 这些"在伪装时代尝试更好抽象"的项目大多被 CUDA 淹没。但它们的设计思想活了下来——**Brook 的作者就是 CUDA 的作者**。
4. **综述论文的价值**：有些综述是历史档案——后来工具变了，但它告诉你"为什么会变成这样"。这篇就是。

## 延伸阅读

- 论文 PDF（公开版）：[John Owens 主页](https://www.idav.ucdavis.edu/publications/print_pub?pub_id=907)（去 idav.ucdavis.edu 搜 GPGPU survey 2007）
- 时代相册：[GPGPU.org 存档](https://gpgpu.org/)（Mark Harris 维护过的资源站）
- 后来发生了什么：[[nickolls-dally-2010-cuda-era]] —— CUDA 把伪装时代终结了
- 现代统一抽象：[[sycl-cpp-2020]] —— 一份 C++ 跑 GPU/CPU/加速器，stream model 的精神继承人
- Brook 论文：Buck et al., "Brook for GPUs: Stream Computing on Graphics Hardware", SIGGRAPH 2004（CUDA 的精神祖先）

## 关联

- [[nickolls-dally-2010-cuda-era]] —— 这篇的"续集"：CUDA 怎么把 GPGPU 时代的痛点全砍掉
- [[sycl-cpp-2020]] —— stream programming 的现代统一接口
- [[cuda-streams-concurrency-2018]] —— CUDA 自己的 stream 概念（异步执行流，与本文 stream model 同名但不同义）
- [[gpu-microbenchmarking-2010]] —— 同时代用微基准反推 GPU 内部架构
- [[lindholm-2008-tesla]] —— CUDA 背后的 Tesla 硬件：伪装时代结束后的第一代通用 GPU 架构

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
