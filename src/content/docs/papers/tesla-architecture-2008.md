---
title: NVIDIA Tesla — 把显卡改造成通用并行计算机
来源: 'Lindholm, Nickolls, Oberman, Montrym, "NVIDIA Tesla: A Unified Graphics and Computing Architecture", IEEE Micro 2008'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Tesla 是 NVIDIA 2006 年发布的 G80 显卡背后那套**新架构**——它做了一件听起来简单、做起来轰动的事：**把显卡里原本分工明确的几种小专用核心，合并成一种"什么都能干"的小核心，然后造一大堆**。

日常类比：你开餐厅，原本厨房分成"炒锅区 / 凉菜区 / 烤箱区"，每个区只能做一类菜，午饭高峰时炒锅累死、烤箱闲着。Tesla 的做法是——把所有人都训练成全能厨师，扔到一个大池子里，谁有空谁接单。结果同样的人手能多产出 2-3 倍的菜。

落到硅片上：G80 有 **128 个相同的小核心**（叫 SP，Streaming Processor），分组到 **16 个 SM**（Streaming Multiprocessor，每个 SM 8 个 SP）。同一份硬件既能跑游戏画面，也能跑物理模拟、视频编解码、后来甚至跑神经网络训练。

配套发布的 **CUDA** 编程模型让 C 程序员第一次能直接给 GPU 写代码——不用伪装成"画三角形"。

## 为什么重要

不理解 Tesla，下面这些事都没法解释：

- 为什么 2012 年 AlexNet 用两块 GTX 580（Tesla 的孙辈）就把 ImageNet 砸穿
- 为什么今天所有 [[pytorch]] / TensorFlow 训练默认 `cuda()` 而不是别的——CUDA 在 G80 同步发布
- 为什么 NVIDIA 从一家显卡公司变成万亿美元 AI 基建公司，故事的拐点就在 2006
- 为什么后续每代 GPU（Fermi / Kepler / Volta / Hopper / Blackwell）的白皮书都长得像同一个模板——它们都是 Tesla 的迭代

## 核心要点

Tesla 的关键设计可以拆成 **四件事**：

1. **统一着色器**：之前 GPU 里 vertex / pixel / geometry 三种 shader 用三种不同硬件。Tesla 全都换成同一种 SP，谁忙派谁。资源利用率从 30% 跳到接近 100%。

2. **SIMT 执行模型**：32 个线程编成一个 **warp**，硬件让它们**同时执行同一条指令**（Single Instruction, Multiple Threads）。程序员**写起来像写 32 条独立线程**，硬件偷偷把它们捆成一束跑——这是 Tesla 最聪明的一招。

3. **三层存储**：每线程独占的**寄存器**（最快）/ 每 block 共享的 **shared memory**（16KB，软件管的高速缓存）/ 全局**显存**（GB 级，慢但大）。程序员显式控制数据放哪一层，是性能的命门。

4. **硬件多线程隐藏延迟**：每个 SM 同时挂着 **768 个活跃线程**，访存等待时立刻切到别的 warp 接着算。CPU 用大缓存对付延迟，GPU 用大并行度盖过延迟——两条不同路线。

### 这四件事为什么必须一起出现

任意拿掉一个，整个架构就塌：

- 没有**统一着色器**，资源利用率就上不去，性价比打不过 CPU 集群
- 没有 **SIMT**，128 个 SP 之间要写显式向量代码，程序员根本不愿意用
- 没有**显式三层存储**，所有访存都要走 DRAM，算术密度再高也喂不饱核心
- 没有**硬件多线程**，单 warp 一旦碰到 cache miss，整个 SM 立刻空转

四件事互为支柱，这也是为什么之后 18 年没有任何竞品（Intel Larrabee / AMD GCN / Google TPU）能完整复制——它们各自只学了一两件。

## 实践案例

### 案例 1：CUDA Hello World

```cuda
__global__ void add(int *a, int *b, int *c) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    c[i] = a[i] + b[i];
}
// host 端调用：1024 线程，分 4 个 block 每 block 256 线程
add<<<4, 256>>>(d_a, d_b, d_c);
```

**逐部分解释**：

- `__global__` 告诉编译器："这函数在 GPU 上跑，从 CPU 调用"
- `blockIdx / threadIdx` 是硬件给每个线程的"我是谁"坐标，让 1024 个线程各干各的活
- `<<<4, 256>>>` 是 grid + block 的尺寸——这是 CUDA 引入的新语法

### 案例 2：warp 分支发散的代价

```cuda
if (threadIdx.x < 16) { do_A(); }
else                  { do_B(); }
```

一个 warp 32 线程，前 16 走 A、后 16 走 B。SIMT 硬件**没办法同时跑两条路**，只能：先让前 16 跑 A（后 16 阻塞），再让后 16 跑 B（前 16 阻塞）。**总耗时 = A + B**，不是 max(A, B)。这是 GPU 编程头号坑。

### 案例 3：[[flash-attention]] 为什么要用 shared memory

Transformer 的 attention 矩阵 `Q·K^T` 中间结果太大，写回显存再读回来是性能杀手。FlashAttention 把整个块塞进 SM 的 16KB shared memory 里算完再写出去——**这层存储正是 Tesla 引入的**。没有 G80 这个三层结构，FlashAttention 就不存在。

### 案例 4：[[pytorch]] `.cuda()` 背后

```python
x = torch.randn(1024, 1024).cuda()
y = x @ x.T   # 矩阵乘
```

`.cuda()` 把张量数据搬到 GPU 显存；`@` 触发 cuBLAS 的 GEMM kernel。这个 kernel 内部会启动几千个 thread block，每 block 把一小块矩阵搬进 shared memory，128 个 SP 同时算。**整条调用链从 Python 到电子流，每一层都是 Tesla 模板**。

## 踩过的坑

1. **warp 大小必须是 32 的倍数**：写循环展开 `if (i < n)` 留尾巴时，最后那个 warp 大半线程在打酱油却照样占资源。性能数据看着诡异，根因是 warp 利用率。

2. **shared memory bank conflict**：16KB 被切成 16 个 bank，同 warp 32 线程同时访问同 bank 不同地址会被序列化。教科书的"转置矩阵"加 1 列 padding 就为了避开这个。

3. **寄存器压力 → occupancy 下降**：每 SM 寄存器总数固定（G80 是 8K 个），kernel 用太多寄存器，能同时挂的线程数就少，隐藏延迟能力变差。这条编译器自己看不出来，要看 `nvcc -Xptxas -v`。

4. **CPU 思维带过来全错**：CPU 上"分支预测 + 大缓存 + ILP"那套优化在 GPU 上全部失效。GPU 的根优化是**让所有线程做同样的事，访存连续**。

5. **PCIe 拷贝吃掉加速比**：GPU 算得再快，CPU<->GPU 之间的 H2D/D2H 拷贝走 PCIe，单方向几个 GB/s，远低于显存带宽。小 kernel 拷贝来回的时间常常超过计算时间——必须把数据"放上去后多算几轮"才划算。

## 适用 vs 不适用场景

**适用**：

- 海量同质化并行（矩阵乘 / 卷积 / 排序 / 蒙特卡洛）
- 数据局部性可由程序员显式控制（能塞进 shared memory）
- 算术密度高（**算术密度** = 每从内存读一个字节后做多少次浮点运算；高密度才喂得饱核心）
- 批量推理 / 训练（把多个样本拼成大 batch 喂满 warp）

**不适用**：

- 串行依赖重的任务（递归遍历不规则树）→ CPU 更好
- 分支发散严重的任务（每线程走不同路径）→ warp 利用率崩
- 数据量小但需要低延迟单次响应 → CPU + 大缓存赢
- 频繁动态内存分配 → GPU malloc 开销巨大，需预分配池

## 历史小故事（可跳过）

- **2003 年**：斯坦福 Ian Buck 的 Brook 语言尝试让 GPU 跑通用计算，但要伪装成"画图"，编程像走迷宫
- **2004 年**：NVIDIA 雇下 Buck，让他来设计真正的通用 GPU 编程接口
- **2006 年 11 月**：G80 + CUDA 1.0 同时发布。第一次 GPU 有 C 编译器、有 printf、有线程同步原语
- **2007 年**：金融、量化、流体仿真社区第一个发现"这卡跑我们代码快 10-50 倍"
- **2012 年**：AlexNet 用两块 GTX 580 砸穿 ImageNet，深度学习浪潮起点。两块卡是 G80 设计的直系后代
- **2024 年**：Hopper / Blackwell 单卡千亿次浮点，但**SM + warp + shared memory** 三件套从 2006 没变

## 学到什么

1. **硬件统一比专用更值**——同样的硅片资源，能动态调度的总比固定分工的产出高。这条规律在 CPU 历史也反复出现（统一寄存器 vs 专用累加器）
2. **SIMT 是 SIMD 的人性化包装**：底层还是一束指令同时打 32 份数据，但程序员能写像普通线程的代码，编译器和硬件帮你捆束
3. **存储层次显式化**：CPU 把缓存藏起来让你"别管"，GPU 把每层都摊开让你"必须管"。代价是难写，回报是性能上限高一个量级
4. **配套软件决定生死**：H100 比 G80 强 1000 倍，但 G80 影响更深远——因为 CUDA 同期发布，建立了**生态护城河**
5. **18 年代际兼容是奇迹**：Tesla 的 PTX 中间码到今天 Blackwell 上仍能跑，老 CUDA 代码不改也能加速——这种向前兼容是 NVIDIA 让对手 catch up 不了的根本原因

## 延伸阅读

- 论文 PDF：[NVIDIA Tesla: A Unified Graphics and Computing Architecture](https://ieeexplore.ieee.org/document/4523358)（17 页，IEEE Micro 2008）
- CUDA 编程入门：[CUDA C++ Programming Guide](https://docs.nvidia.com/cuda/cuda-c-programming-guide/)（官方手册，前 4 章看完能写 kernel）
- 视频讲解：[GTC Keynote — From G80 to Hopper](https://www.nvidia.com/en-us/on-demand/)（黄仁勋自己讲架构演进）
- [[attention]] —— Transformer 的 attention 算法是 GPU 矩阵乘的最大客户
- [[flash-attention]] —— 利用 Tesla 引入的 shared memory 把 attention 写成 IO-aware 算法

## 关联

- [[attention]] —— Transformer 注意力机制；GPU 矩阵乘是它的执行底座
- [[flash-attention]] —— 直接利用 Tesla 三层存储里的 shared memory 重写 attention
- [[pytorch]] —— 默认后端是 CUDA，张量 `.cuda()` 落到 SM 上执行
- [[deepspeed-zero]] —— 多卡训练框架，把 Tesla 系单卡组成集群
- [[mapreduce]] —— 同样讲"把大计算切成同质小块"，但走集群方向；GPU 走单卡内 SIMT 方向
- [[llvm]] —— NVIDIA 的 nvcc 后端基于 LLVM；CUDA 的中间表示 PTX 由 LLVM 生成
