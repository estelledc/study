---
title: Thrust — 让 GPU 编程像写 STL 一样一行调用
来源: 'Hoberock & Bell, "Thrust: A Productivity-Oriented Library for CUDA", NVIDIA 2010'
日期: 2026-05-31
分类: GPU 与并行
难度: 中级
---

## 是什么

Thrust 是 NVIDIA 给 CUDA 写的一个 **C++ 库**，把 C++ 标准库（STL）里那一套大家熟的算法——`sort`、`reduce`、`scan`、`transform`——**原样搬到 GPU 上**。

日常类比：你以前用 STL 写 CPU 排序：

```cpp
std::sort(v.begin(), v.end());
```

用 Thrust 写 GPU 排序：

```cpp
thrust::sort(d_v.begin(), d_v.end());
```

**长得几乎一样，只是数据在显存里**。Thrust 内部替你挑 kernel、分 block/thread、管 host-device 拷贝，你完全看不到 CUDA 那一套 `<<<grid, block>>>` 语法。

## 为什么重要

不理解 Thrust 解决什么，看不懂这些事：

- 为什么 NVIDIA 自己说 GPU 编程"应该像写 STL"——这是十多年前定下的接口哲学
- 为什么 PyTorch / RAPIDS / cuDF 这些库底下能"无脑"调到高性能并行原语——Thrust 是其中一层
- 为什么 GPU 上的 `sort`、`scan`、`reduce` 这种"老掉牙"算法值得发一篇论文——把它们做成可组合、可分派、可零拷贝的迭代器接口才是难点
- 为什么 C++17 的 `std::execution::par` 能在 GPU 上跑——NVIDIA 的 NVC++ 用 `-stdpar` 把并行算法接到 Thrust 一类后端（不是 nvcc 默认行为）

## 核心要点

Thrust 的接口设计可以拆成 **三块**：

1. **容器（container）**：`host_vector<T>` 和 `device_vector<T>`。日常类比：两个一模一样的购物袋，一个放厨房（CPU 内存）、一个放冰箱（显存）。把厨房袋赋给冰箱袋，**自动**完成跨设备拷贝。

2. **迭代器（iterator）**：算法不直接吃容器，吃的是迭代器（`begin()` / `end()`）。这层抽象关键在哪？库看迭代器的**类型**判断"数据在 host 还是 device"，再**分派**（dispatch）到对应 GPU/CPU 实现——像快递按地址选仓库。

3. **算法（algorithm）**：`sort` / `reduce` / `scan` / `transform` / `unique` / `partition`，名字和 STL 一一对应。内部按类型选实现：数值键走**基数排序**（radix，按位桶分，近似线性），自定义比较走归并排序。

加上一个**杀手锏**：**fancy iterator**——`counting_iterator(0)` 不占显存，按需生成 0,1,2,...；`transform_iterator(it, f)` 不存数据，迭代时算 `f(*it)`。这让你能写出**零拷贝、零中间分配**的流水线。

## 实践案例

### 案例 1：一行 GPU 排序

```cpp
#include <thrust/host_vector.h>
#include <thrust/device_vector.h>
#include <thrust/sort.h>
thrust::host_vector<int> h_v(3); h_v[0]=3; h_v[1]=1; h_v[2]=2;
thrust::device_vector<int> d_v = h_v;        // host->device 拷贝
thrust::sort(d_v.begin(), d_v.end());        // GPU 上排
h_v = d_v;                                   // device->host 拷贝
```

**逐部分解释**：先在 CPU 侧准备 `h_v`；赋值给 `d_v` 触发一次显存拷贝；`sort` 在 GPU 上排好；再赋回 `h_v` 取回结果。block 大小、共享内存、warp 同步等 CUDA 细节**全藏在 sort 里面**。

### 案例 2：fancy iterator 做"零拷贝"求 1..N 的平方和

```cpp
#include <thrust/iterator/counting_iterator.h>
#include <thrust/iterator/transform_iterator.h>
auto sq = [] __host__ __device__ (int x) { return x * x; };
auto first = thrust::make_counting_iterator(1);
auto last  = thrust::make_counting_iterator(N + 1);
int s = thrust::reduce(
    thrust::make_transform_iterator(first, sq),
    thrust::make_transform_iterator(last,  sq));
```

整个过程**没有分配 N 个 int 的显存**——`counting_iterator` 凭空生成 1..N，`transform_iterator` 边读边平方，最后 `reduce` 累加。这就是迭代器作为"流水管道"的力量。

### 案例 3：functor + transform 做向量乘加

```cpp
struct saxpy {
    float a;
    saxpy(float a_) : a(a_) {}
    __host__ __device__ float operator()(float x, float y) const {
        return a * x + y;
    }
};
thrust::transform(x.begin(), x.end(), y.begin(), z.begin(), saxpy(2.0f));
```

`__host__ __device__` 是关键标注：告诉编译器"这个函数能在 CPU 也能在 GPU 上调"。早年 CUDA 不支持 device 侧 lambda，所以必须手写仿函数 struct；约 CUDA 7.x 起才能写成 lambda，Thrust 才真正"像 STL"。

## 踩过的坑

1. **functor 必须 device-callable**：忘写 `__device__` 标注，NVCC 编译就报"can not be called from device code"。
2. **device_vector 不是 std::vector**：能 push_back 但**慢**——每次都触发 host-device 同步。预分配 `resize(N)` 再写。
3. **临时 host_vector 拷贝陷阱**：`thrust::host_vector<int> h = d_v;` 看起来一行，背后是 `cudaMemcpy` + 同步。循环里反复写就是性能杀手。
4. **误以为 Thrust 总比手写慢**：sort/scan 这类通用原语，Thrust 常调底层库 CUB（更贴硬件的积木），往往**比新手手写更快**——warp 内交换、共享内存冲突都调过了。
5. **fancy iterator 不能取 `&*it` 当指针**：它根本没有底层内存，地址没有意义。只能在算法里用、不能强转 raw pointer。
6. **sort 自定义比较器慢于默认**：默认走 radix sort（O(N)），自定义比较强制走 merge sort（O(N log N)）。能用默认就别传 comp。
7. **execution policy 容易忘**：`thrust::sort(thrust::device, ...)` 显式指定后端，不指定时由迭代器类型推；混迭代器（host + device）会出意想不到的 dispatch。

## 适用 vs 不适用

**适用**：
- 数据并行的"教科书算法"——排序、前缀和、reduce、map、filter
- 不想（或不会）手写 CUDA kernel 但要 GPU 加速
- 数据已在 GPU 上的后处理（比如推理后的非极大值抑制 NMS、取前 k 名 topk）

**不适用**：
- 算法本质串行或依赖复杂（动态规划、图遍历某些场景）
- 极致性能场景——手写 kernel + CUB + 共享内存调优能比 Thrust 再快 10–30%
- 需要 fine-grained 控制 stream / 多 GPU 调度——直接用 CUDA Runtime API 或 CUB

## 历史小故事（可跳过）

- **2008 年**：Hoberock 和 Bell 在 NVIDIA Research 内部写了个叫 Komrade 的小库，灵感就是 Stepanov 1994 的 STL。
- **2009 年**：开源，改名 Thrust。
- **2010 年**：随 CUDA 4.0 进官方发行包，本论文/章节正式介绍设计哲学。
- **约 2014–2015**：CUDA 7.x 引入可用的 `__device__` lambda，Thrust 才真正"像 STL"——之前每个小操作都得写仿函数 struct。
- **同期**：Duane Merrill 写了 CUB，更底层、性能更极致；Thrust 的很多算法后来直接调 CUB。
- **2023 年**：NVIDIA 宣布把 Thrust + CUB + libcu++ 合并进 CCCL（CUDA C++ Core Libraries）统一仓库。

## 学到什么

1. **接口哲学比算法更值钱**——sort/scan/reduce 的 GPU 实现 1990 年代就有了；Thrust 的贡献是把它们包成 STL 风格、可组合、可分派的接口
2. **迭代器是抽象的边界**——算法不看容器、不看后端，只看迭代器类型；这让同一份代码能跑 CUDA / OpenMP / TBB
3. **fancy iterator = 免分配的 view**——`counting_iterator` / `transform_iterator` / `zip_iterator` 把"流水线计算"在类型系统里表达
4. **productivity 不是性能的对立面**——通用原语用得多了，Thrust/CUB 这种库的实现常常比新手手写更快
5. **后端可换是设计红利**——同一份用户代码切到 CUDA / OpenMP / TBB，是因为算法-迭代器-后端三层解耦在最初就分清了

## 延伸阅读

- 官方文档：[NVIDIA Thrust](https://docs.nvidia.com/cuda/thrust/index.html)
- 升级版：[CCCL — CUDA C++ Core Libraries](https://github.com/NVIDIA/cccl)（Thrust + CUB + libcu++ 整合）
- 前驱：Stepanov & Lee, "The Standard Template Library", 1994 —— STL 接口哲学源头
- GPU scan 算法源头：Sengupta, Harris, Garland, "Scan Primitives for GPU Computing", 2007
- [[opencl-2010]] —— 同年另一条路线（厂商中立、贴硬件）
- [[sycl-cpp-2020]] —— 十年后的演化版，STL 风格 + 多后端

## 关联

- [[ampere-architecture-2020]] —— Thrust 跑在的 GPU 硬件代次
- [[opencl-2010]] —— 同代另一种 GPU 抽象，厂商中立但更底层
- [[sycl-cpp-2020]] —— 后续把"STL 风格 + 多后端"做成 ISO 标准
- [[kokkos-2014]] —— 美国实验室同思路竞品，MDSpan + 执行策略
- [[mapreduce]] —— 更早的"高阶函数包并行"思想源头

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[kokkos-2014]] —— Kokkos — 一份 C++ 代码同时跑 CPU、GPU、Xeon Phi
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点

