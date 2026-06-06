---
title: Brook for GPUs — 让显卡第一次能用人话编程
来源: 'Buck, Foley, Horn, Sugerman, Fatahalian, Houston, Hanrahan, "Brook for GPUs: Stream Computing on Graphics Hardware", SIGGRAPH 2004'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Brook 是 2004 年 Stanford 一群人造的一种 **C 语言扩展**，目的只有一个——**让普通 C 程序员能给 GPU 写程序，不用伪装成"我在画三角形"**。

日常类比：2003 年想用 GPU 算物理模拟的科学家，处境像"想用洗衣机做奶昔的人"——洗衣机马达转得飞快，但你只能塞衣服进去，必须把香蕉伪装成毛巾。Brook 做的事是给洗衣机外面套一层"奶昔机外壳"——你按"打奶昔"按钮，它内部偷偷把香蕉伪装成毛巾塞进去。

落到代码上，Brook 给 C 加了**两个新关键字**：

- `stream`——"一大批同类型数据"（像数组，但暗示要并行处理）
- `kernel`——"对 stream 每个元素独立执行的函数"

编译器（BrookGPU）把这种代码翻译成当时 GPU 看得懂的 Cg/HLSL shader + 一坨 C++ 胶水，跑在 GeForce / Radeon 上。**这是历史上第一次** GPU 通用编程有了一套像样的语言抽象，而不是手写 shader。

## 为什么重要

不理解 Brook，下面这些事都没法解释：

- 为什么 [[cuda]] 的核心概念（kernel、grid、并行映射）和 Brook 几乎一一对应——CUDA 的总设计师 Ian Buck 就是这篇论文的一作
- 为什么 NVIDIA 2004 年底立刻把 Buck 招进公司，2006 年和 [[tesla-architecture-2008]] 一起发布 CUDA——架构和编程模型必须配套出
- 为什么 OpenCL / Metal / SYCL 至今还在用 stream/kernel 这套词汇——Brook 的命名成了行业方言
- 为什么 2004 年之前 GPGPU 论文极少、之后井喷——抽象一旦立住，研究门槛断崖下降

## 核心要点

Brook 的设计可以拆成 **四件事**：

1. **stream 抽象数据**：把"一大批要并行处理的数据"打包成一个 stream（语法上像数组）。程序员不用关心它实际存在 GPU 的哪块 texture 里——编译器自动搬。

2. **kernel 抽象计算**：写一个普通 C 函数，加上 `kernel` 关键字。它必须**对每个元素独立计算**（无副作用、不访问全局变量）。这种"洁癖"让编译器敢自动并行——成千上万个元素同时跑。

3. **reduce / gather 两个高阶操作**：reduce 把整个 stream 折成单值（求和、求最大）；gather 让 kernel 在计算时**随机读**其它 stream（"我要第 7 个元素"）。这两个 + map（kernel 本身）覆盖了大部分数值计算模式。

4. **编译器隐藏图形 API**：BrookGPU 编译器把 `.br` 源码翻译成 Cg fragment shader + OpenGL 调用。程序员**完全不用知道** texture / framebuffer / draw quad 这些图形概念——它们成了实现细节。

### 这四件事为什么必须一起出现

任意拿掉一个，整套抽象就塌：

- 没有 **stream**，数据传输得手写 `glTexImage2D`，痛苦回到 2003
- 没有 **kernel 的纯函数限制**，编译器没法保证并行安全，只能保守串行
- 没有 **reduce / gather**，只剩 map，很多算法（如归约求和）写不出来
- 没有**编译器自动翻译**，每行代码还是要伪装成画三角形

## 实践案例

### 案例 1：Brook 写 SAXPY（两向量相加乘标量）

```c
kernel void saxpy(float a, float x<>, float y<>, out float result<>) {
  result = a * x + y;
}

float a = 2.0;
float X<100>, Y<100>, Z<100>;  // 三个长度 100 的 stream
streamRead(X, host_x);          // 从 CPU 内存搬进 GPU
streamRead(Y, host_y);
saxpy(a, X, Y, Z);              // 100 个元素并行算
streamWrite(Z, host_z);         // 搬回 CPU
```

注意 `<>` 是 stream 标记，`<100>` 是 stream 长度。整段没有任何 OpenGL 调用——全是 C。

### 案例 2：Brook 与今天 CUDA 的对应关系

| Brook (2004) | CUDA (2006+) |
|---|---|
| `kernel void f(...)` | `__global__ void f(...)` |
| `float X<1024>` (stream) | `float* X` + `cudaMalloc` |
| `streamRead/Write` | `cudaMemcpy` |
| `f(X, Y, Z)`（隐式并行） | `f<<<grid, block>>>(X, Y, Z)`（显式 grid/block） |
| `reduce float sum<> r;` | `__shared__` + 手写归约树 |

CUDA 把 Brook 的"隐式并行"改成"显式 grid/block"，多了控制力但也多了心智负担。这个交换是 2006 年硬件已经强到值得让程序员管细节。

**为什么 Brook 没显式 grid/block**：2004 年 fragment shader 的并行粒度由硬件决定（每个像素一个线程），程序员根本控制不了。CUDA 加 grid/block 是因为 G80 第一次让程序员**显式**配并行结构。

### 案例 3：Brook 论文里的 benchmark 数字（2004 年 Radeon 9800 vs 3GHz P4）

- 线性代数 SGEMV：**7.3 倍** CPU
- FFT 1D：**5.6 倍** CPU
- 流体模拟：**11 倍** CPU
- 光线追踪：**3 倍** CPU

这些数字在 2004 年震动学界——之前 GPGPU 是"勉强能跑"，Brook 第一次让 GPGPU 变成"显著更快"。

## 踩过的坑

1. **scatter 缺失**：2004 年 fragment shader 不能写到任意位置（每个 fragment 只能写它自己那个像素）。Brook 想模拟 scatter 只能用多 pass 排序，慢到没意义。这个洞要等 2006 年 G80 + CUDA 才补上——这也是为什么 Brook 跑不了哈希表 / 排序 / 图算法。

2. **kernel 不能调用 kernel**：每个 kernel 是独立的 fragment shader pass，中间结果必须**写回 texture 再读出来**。这让"分阶段 kernel"开销巨大。CUDA 用 shared memory + `__syncthreads` 把它修了。

3. **调试基本靠运气**：kernel 跑在 GPU 上，没有 printf、没有断点。论文作者老老实实承认"调试是 future work"。这个问题 CUDA 早期也没解决，到 2010 年 Fermi 加了硬件断点才好（见 [[fermi-architecture-2010]]）。

4. **跨厂商不兼容**：Brook 同时支持 NVIDIA / ATI，但 ATI 那边稳定性差。这预示了后来 OpenCL 想做的事——可惜 NVIDIA 自己搞 CUDA 后再没动力推开放标准。

## 适用 vs 不适用场景

**适用**（Brook 当年的甜蜜区）：

- 数据并行的数值计算——线性代数、信号处理、图像滤波
- 元素之间无依赖的 map / reduce 模式
- 算术密集型（每个数据被反复算多次），访存少的算法
- 学术原型——证明某算法能在 GPU 跑
- 教学场景——讲解 GPU 并行模型时，Brook 比 CUDA 干净，没有 grid/block/warp 这些工程细节干扰

**不适用**：

- 需要 scatter 的算法（哈希、排序、图） → 等 CUDA
- 需要 kernel 间细粒度通信 → 等 CUDA shared memory
- 控制流复杂（深嵌套分支 / 不规则循环） → fragment shader 天生差
- 需要 ECC / 双精度 / 工业可靠性 → 等 [[fermi-architecture-2010]]
- CPU 任务（单线程逻辑、I/O） → 永远别上 GPU

## 历史小故事（可跳过）

- **2000-2003**：早期 GPGPU 论文必须写"我把矩阵伪装成 RGBA texture，把乘法伪装成混色 shader"。一篇论文一半篇幅在解释怎么作弊
- **2003**：Stanford 的 Pat Hanrahan（图灵奖 2019）让博士生 Ian Buck 想办法，**给 GPU 一个像样的编程模型**
- **2004 年 8 月**：Brook for GPUs 论文在 SIGGRAPH 发表。共同作者还有 Kayvon Fatahalian（后来 CMU/Stanford 教授，写了著名的并行计算课）
- **2004 年底**：NVIDIA CEO 黄仁勋读完论文，把 Buck 招进公司
- **2006 年 11 月**：NVIDIA 发布 G80 + CUDA 1.0。CUDA 的每个核心概念都能在 Brook 里找到对应。Brook 完成历史使命，论文成了 CUDA 的"原始设计文档"

## 学到什么

1. **抽象先于硬件**：Brook 在 2004 年的硬件上实现得很拧巴（没 scatter、没共享内存），但抽象本身正确——硬件追上来后（2006 G80）抽象立刻发光
2. **学术原型的真正价值**：Brook 商业上没成功（编译器停止维护），但它**证明了一种编程模型可行**，这就够 NVIDIA 押 10 亿美元做 CUDA
3. **C 扩展 vs 新语言**：Brook 选了"加两个关键字"而不是"造一门新语言"，门槛极低——任何 C 程序员看 5 分钟就懂。这是 CUDA、OpenCL 后来都沿用的策略
4. **作者→工业链路**：Buck 从论文一作变 CUDA 总架构师，是"学术 idea → 工业产品"最干净的一个案例。Hanrahan 当年坚持让学生做能落地的研究，赌赢了
5. **限制即接口**：Brook 强制 kernel 是纯函数——这看起来是束缚，但正是这个束缚让编译器敢自动并行。后来 CUDA、Halide、JAX `jit` 都沿用同一思路：限制越严，自动化越多

## 延伸阅读

- 论文 PDF：[Brook for GPUs (Stanford)](https://graphics.stanford.edu/papers/brookgpu/brookgpu.pdf)（10 页，例子很多）
- BrookGPU 项目页（已停更）：[Sourceforge BrookGPU](http://brookgpu.sourceforge.net/)
- Ian Buck 后续访谈：搜 "Ian Buck CUDA origin story"——他多次讲 Brook → CUDA 的过渡
- 配套阅读：[[tesla-architecture-2008]]（CUDA 落地的硬件）/ [[fermi-architecture-2010]]（修了 Brook 时代的工业可靠性短板）

## 关联

- [[tesla-architecture-2008]] —— G80 是 Brook 抽象第一次有匹配硬件的时刻；SIMT 让 kernel 真正变成并行单元
- [[fermi-architecture-2010]] —— ECC + cache + 双精度补齐 Brook 时代的工业短板
- [[cuda]] —— Brook 的直接精神后继，多了 shared memory 和 scatter
- [[ampere-architecture-2020]] —— Brook 抽象 16 年后仍未过时；硬件更新但编程模型只是微调
- [[blackwell-architecture-2024]] —— 同一抽象走到 2024 年，stream/kernel 仍是顶层 API
