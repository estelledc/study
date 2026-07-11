---
title: Kokkos — 一份 C++ 代码同时跑 CPU、GPU、Xeon Phi
来源: 'H. Carter Edwards, Christian Trott, Daniel Sunderland, "Kokkos: Enabling manycore performance portability through polymorphic memory access patterns", JPDC 2014'
日期: 2026-05-31
分类: GPU 架构
难度: 中级
---

## 是什么

Kokkos 是 Sandia 国家实验室搞的一套 **纯 C++ 模板库**，让你写一份代码，就能在普通 CPU、NVIDIA GPU、Intel Xeon Phi 这三种完全不同的硬件上跑出接近手写的性能。

日常类比：以前你想给三种硬件都跑同一个数值模拟，得**写三份代码**——一份 OpenMP（CPU 多核）、一份 CUDA（NVIDIA GPU）、一份 OpenMP offload（Xeon Phi）。每升级一次硬件就得重写一遍。Kokkos 说："不行，国家超算每三年换一代，我们维护不动。给你一套抽象，写一次，编译时再决定跑哪个后端。"

最关键的创新一句话：**多维数组的内存排布方式（行主序还是列主序）是模板参数，编译期根据目标硬件自动切换**。这样同一段 kernel，在 GPU 上自动获得列主序（GPU 喜欢 coalesced），在 CPU 上自动获得行主序（CPU 喜欢 cache-friendly）。

## 为什么重要

不理解 Kokkos，下面这些事都没法解释：

- 为什么美国能源部（DOE）三大 exascale 超算（Frontier、Aurora、El Capitan）的科学软件能"买谁家 GPU 都通用"——AMD、Intel、NVIDIA 三家 GPU 它都支持
- 为什么 LAMMPS（分子动力学界的"PyTorch"）从 2017 年起把 GPU 后端从手写 CUDA 全切到了 Kokkos
- 为什么 ISO C++ 委员会 2024 年把 `std::mdspan` 写进标准——这就是 Kokkos View 的简化版上墙
- 为什么"性能可移植性 (performance portability)"这个词被 HPC 圈普遍接受——Kokkos 是这个术语的代表作

## 核心要点

Kokkos 的抽象可以拆成 **四块**：

1. **execution space**：代码跑在哪。`Kokkos::OpenMP` / `Kokkos::Cuda` / `Kokkos::Serial`，编译期选一个或几个。

2. **memory space**：数据存在哪。`HostSpace`（普通 RAM）/ `CudaSpace`（GPU 显存）/ `CudaUVMSpace`（统一寻址）。execution 和 memory 是两个独立维度——你可以在 GPU 上跑 kernel 但数据放在 UVM 里。

3. **View<T\*\*, Layout, Space>**：Kokkos 自己的多维数组。`Layout` 是模板参数（`LayoutLeft` 列主序 / `LayoutRight` 行主序），不写就**默认按目标 space 自动选**。这就是论文标题里"polymorphic memory access patterns"的意思——同一份 kernel 代码，layout 多态。

4. **三种并行模式**：`parallel_for`（每个 i 独立干活）/ `parallel_reduce`（求和、求最大值）/ `parallel_scan`（前缀和）。这三种覆盖了 90% 的科学计算 kernel。

## 实践案例

### 案例 1：一份 SAXPY 跑 CPU 和 GPU

SAXPY 就是 `Y[i] = a*X[i] + Y[i]`，BLAS 入门题。

```cpp
using ExecSpace = Kokkos::DefaultExecutionSpace;  // 编译时选
Kokkos::View<double*, ExecSpace> X("X", N), Y("Y", N);

Kokkos::parallel_for("saxpy", N, KOKKOS_LAMBDA(int i) {
    Y(i) = a * X(i) + Y(i);
});
```

编译时加 `-DKokkos_ENABLE_CUDA=ON` 这段就跑在 GPU；加 `-DKokkos_ENABLE_OPENMP=ON` 就跑在 CPU 多核。**lambda 一个字没改**。

`KOKKOS_LAMBDA` 是个宏，展开成 `[=] __host__ __device__`——告诉 NVCC 这个 lambda 在 host 和 device 都能调。

### 案例 2：layout 自动切换的魔法

二维矩阵 `View<double**>`，访问 `A(i, j)`：

- 编译到 CPU：自动选 `LayoutRight`（j 是连续维度），符合 cache line 顺序读
- 编译到 GPU：自动选 `LayoutLeft`（i 是连续维度），让相邻 thread 读相邻地址（coalesced 访存）

你的 kernel 代码 `A(i, j) = ...` 一字未改，但生成的访存模式完全不同。这就是 polymorphic 的关键：**索引语义不变，物理排布随硬件变**。

### 案例 3：HostMirror — 在 host 上读 GPU 数据

GPU 数据想 print 出来看？不能在 GPU 上 `std::cout`，要先搬回 host：

```cpp
auto h_Y = Kokkos::create_mirror_view(Y);    // host 上的镜像
Kokkos::deep_copy(h_Y, Y);                    // 显存 -> 内存
for (int i = 0; i < 10; i++) std::cout << h_Y(i);
```

mirror 是引用计数 View，host space 上跑就和 Y 共享内存（零拷贝），device space 上跑就分配新内存。**编译期决定，运行期零开销**。

### 案例 4：reduce 求 dot product

```cpp
double sum = 0.0;
Kokkos::parallel_reduce("dot", N, KOKKOS_LAMBDA(int i, double& s) {
    s += X(i) * Y(i);
}, sum);
```

第二个参数 `s` 是局部累加器，Kokkos 在每个 thread 维护一份，最后帮你 reduce 合起来。CPU 上是 OpenMP reduction，GPU 上是 warp shuffle + block reduction，**完全不同的实现，同一份代码**。

## 踩过的坑

1. **lambda 必须用 KOKKOS_LAMBDA**：直接写 `[=](int i){...}` 在 CUDA 后端会编译失败，因为它不是 `__device__` 的。新人最常忘。

2. **View 是引用计数的**：`auto B = A;` 不是拷贝数据，是共享底层指针。要真拷贝得 `Kokkos::deep_copy(B, A)`。这点和 std::vector 行为不一样，新手写串了。

3. **GPU kernel 里不能用 std::*、不能 new、不能抛异常**：CUDA 设备代码限制全部继承下来。kernel 里只能用 Kokkos 自己的 atomic、`Kokkos::Array` 这种特供品。

4. **initialize / finalize 必须配对**：`Kokkos::initialize(argc, argv)` 在 main 里调，`finalize()` 退出前调。不配对会 leak GPU 上下文。

5. **跨 Host/Device 时 layout 默认不同**：未指定 layout 时，Host/OpenMP 默认 `LayoutRight`，Cuda 默认 `LayoutLeft`（这正是案例 2 的自动切换）。坑在于你在 host 上按行主序手工填好多维数组，再 `deep_copy` 到 GPU View——若两边 layout 不一致，同一套 `(i,j)` 会读到不同物理地址。跨 space 共享同一逻辑数组时，要么两端都让 Kokkos 按 space 默认，要么显式指定同一 `LayoutLeft`/`LayoutRight`。

6. **MDRangePolicy 才是多维并行**：`parallel_for(N, ...)` 是一维。多维想要 `parallel_for(MDRangePolicy<Rank<2>>({0,0}, {Nx,Ny}), ...)`，不然只能手动 `i = idx / Ny; j = idx % Ny`，丢访存友好性。

7. **TeamPolicy 用于 GPU 共享内存**：想用 GPU 上的 shared memory（block 内 thread 共享），得切到 hierarchical 并行 `TeamPolicy`，写法和 `RangePolicy` 完全不同。从一维 `parallel_for` 升到 team 这一跳是新人学习曲线最陡的一段。

## 适用 vs 不适用场景

**适用**：

- HPC 数值模拟（CFD、分子动力学、有限元、辐射输运）——三大 exascale 超算的主流方案
- 想一份代码同时支持 NVIDIA / AMD / Intel GPU 的科研项目
- 写大型 C++ 库，要求未来 5-10 年新硬件出来不重写

**不适用**：

- 深度学习训练——直接用 PyTorch / JAX，GPU 抽象人家做好了
- Python 优先的项目——Kokkos 是 C++ 模板重度依赖，绑 Python 不轻松
- 小规模 GPU 试验——上手成本明显高于直接写 CUDA
- Windows 桌面应用——Kokkos 主战场是 Linux + 超算调度系统

## 历史小故事（可跳过）

- **2011 年**：Sandia 国家实验室面对一个真问题——Trilinos（数值算法库）要跑下一代超算（Titan、Sequoia），但每代硬件架构不一样。立项做"performance portability"。
- **2014 年**：JPDC 论文发表，三作者 Edwards / Trott / Sunderland 把 View 多态、execution/memory space 分离这套抽象写清楚。
- **2017 年**：Kokkos 3.0 重写，加了 USM、改了 build 系统，开始被 LAMMPS / SPARTA / Cabana 大规模采用。
- **2022 年**：Frontier 超算（全球首台 exascale，AMD GPU）上线，DOE 大量科学软件靠 Kokkos 跑通。
- **2024 年**：Kokkos View 的简化版 `std::mdspan` 进 ISO C++23，多维数组终于成标准。

## 学到什么

1. **抽象的边界要踩在编译期**——layout 是模板参数（编译期），不是 runtime 字段，所以零开销。这是 C++ 模板做 zero-cost abstraction 的典范。
2. **execution space ⊥ memory space**——把"跑在哪"和"存在哪"解耦，是异构计算抽象的关键设计。SYCL、OpenMP target 后来都学了。
3. **performance portability 不是免费午餐**——你得用人家定义好的 View / parallel_for，自己手写 raw 指针就脱抽象了。这是工程上的明确取舍。
4. **大型科学软件的复利**——Sandia 一开始为 Trilinos 一个库做的事，10 年后变成整个 DOE 生态的基础设施。

## 延伸阅读

- 论文 PDF：[Kokkos JPDC 2014](https://www.osti.gov/biblio/1106969)（25 页，前 10 页讲设计、后面是性能数据）
- 官方教程：[Kokkos Lectures](https://kokkos.org/kokkos-core-wiki/)（视频 + slides，从 0 到能写 kernel）
- 源码：[github.com/kokkos/kokkos](https://github.com/kokkos/kokkos)（C++17，模板地狱预警）
- [[sycl-cpp-2020]] —— SYCL 是另一条路线，标准化优先；Kokkos 是工程优先
- [[opencl-2010]] —— Kokkos 早期后端之一，2014 年论文里还作为对比

## 关联

- [[sycl-cpp-2020]] —— 同主题不同思路：SYCL 押注 ISO 标准化，Kokkos 押注 C++ 模板和实战迭代
- [[opencl-2010]] —— Kokkos 设计时的对手之一，OpenCL 用字符串 kernel，Kokkos 用 lambda
- [[ampere-architecture-2020]] —— Kokkos 跑的硬件之一；2014 年时还是 Kepler/Maxwell
- [[jax]] —— 思路相通：单源 Python，编译期 JIT 切硬件后端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jax]] —— JAX — Google 函数式数值计算
- [[thrust-2010]] —— Thrust — 让 GPU 编程像写 STL 一样一行调用

