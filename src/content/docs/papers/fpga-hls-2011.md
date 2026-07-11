---
title: FPGA HLS 2011 — 把 C 代码自动翻译成芯片电路的范式
来源: 'Jason Cong et al., "High-Level Synthesis for FPGAs: From Prototyping to Deployment", IEEE TCAD 2011'
日期: 2026-05-31
分类: gpu-architecture
难度: 中级
---

## 是什么

**HLS（High-Level Synthesis，高层次综合）**是一类编译器，输入是普通的 C/C++ 代码，输出是能直接烧到 FPGA 芯片上跑的电路描述（Verilog/VHDL）。日常类比：像把一份普通的菜谱（C 代码，按步骤做）翻译成一张工厂流水线图（电路，多个工位同时干活）——同一道菜，但执行方式从"一个厨师按顺序做"变成"十个工位同时做"。

你写一段 C：

```c
for (int i = 0; i < 1024; i++)
  out[i] = (in[i] + in[i+1]) >> 1;
```

HLS 编译器读完，自动生成一个 200 行 Verilog 模块——里面有寄存器、加法器、移位器、流水线控制信号——下一秒就能上 FPGA 板子跑，每周期吐一个结果。

这篇 IEEE TCAD 2011 综述是 **Jason Cong**（UCLA）等人对 HLS 走向工业化的总结：是 AutoESL（后被 Xilinx 收购成 Vivado HLS、又演化到 Vitis HLS）的奠基文献。

## 为什么重要

不理解 HLS，下面这些事都没法解释：

- 为什么 2010 年后 FPGA 突然能被算法工程师用——而不再只是硬件工程师专属
- 为什么 Xilinx 2011 年收购一家小公司 AutoESL（金额未公开），结果做出了 Vivado HLS
- 为什么"用 Python/C 写算子跑在 FPGA"是真的（背后是 HLS）而不是噱头
- 为什么写硬件的生产力常提数倍，但自动生成电路的质量仍要和手写 RTL 逐案比

## 核心要点

HLS 把"C 翻译成电路"拆成 **三步**，每步都对应 60 年编译器经典理论：

1. **前端降级（用 LLVM）**：先把 C 编译到 [[llvm]] 的中间表示（IR）。这一步和你跑 `clang` 一样——把循环、函数调用、数组访问标准化。类比：把各种方言菜谱先翻成普通话。

2. **三大优化：调度 / 分配 / 绑定**：
   - **调度（scheduling）**：决定每条 IR 指令在第几个时钟周期执行——类比"流水线第几个工位"
   - **分配（allocation）**：决定用几个加法器、几块片上 RAM——类比"工厂买几台机器"
   - **绑定（binding）**：把每条指令绑到具体硬件单元——类比"把第 7 步派给 3 号工位的 1 号机器"

3. **生成 RTL**：输出 Verilog/VHDL 文件，交给逻辑综合工具（如 Vivado）继续把 RTL 编译成比特流。HLS 不直接生成芯片，它只到 RTL 这一层。

三步合起来，**用户只写 C + 几行 #pragma 注释**（告诉编译器哪些循环要展开、哪些数组要分块），剩下的全自动。

## 实践案例

### 案例 1：一行 #pragma 让循环跑得快 10 倍

```c
void filter(int in[1024], int out[1024]) {
  for (int i = 0; i < 1023; i++) {
    #pragma HLS PIPELINE II=1
    out[i] = (in[i] + in[i+1]) >> 1;
  }
}
```

`#pragma HLS PIPELINE II=1` 告诉 HLS：把这个循环排成流水线，**每周期吐一个结果**（II = Initiation Interval）。

不加这行：循环每次要 3 周期（读、算、写），1023 次 = 3000+ 周期。
加了：流水线后稳定每周期一个，1023 次 ≈ 1023 周期。**10 倍加速**，C 代码只多了一行。

### 案例 2：数组分块——让 4 个加法器同时干活

```c
int sum = 0;
for (int i = 0; i < 100; i++) {
  #pragma HLS UNROLL factor=4
  sum += data[i];
}
```

加 `UNROLL factor=4`：HLS 把循环展开 4 倍，**生成 4 个并行的加法器**。原本要 100 周期的累加，4 路并行后 ≈ 25 周期。

但有个前提：`data[]` 数组必须能同时被 4 个加法器读到。所以还要：
```c
#pragma HLS ARRAY_PARTITION variable=data cyclic factor=4
```
告诉 HLS 把数组拆成 4 块物理 RAM（不再是一整块）。

### 案例 3：什么样的 C 翻不动

```c
struct Node { int val; struct Node *next; };
int sum_list(struct Node *head) {
  int s = 0;
  while (head) { s += head->val; head = head->next; }
  return s;
}
```

这段在 CPU 上正常，但 HLS 几乎无法优化：
- **指针 `next`** 编译期不知道指向哪——硬件没法预取
- **循环次数动态**——流水线深度不能固定
- **链表结构**让"数组分块"完全无效

实际操作：把链表预先转成数组，再跑 HLS。**HLS 工具不喜欢动态形状**。

## 踩过的坑

1. **C 不是硬件语言**：指针、递归、动态 `malloc`、虚函数，HLS 要么禁用要么严重劣化——必须按"HLS-friendly C 子集"写。

2. **没 #pragma 就只有 1x**：纯 C 不加注释，HLS 默认串行翻译，跑得比 CPU 还慢；流水线 / 展开 / 分块的 #pragma 才是性能源头。

3. **QoR 要逐案比，别默认输手写**：工程里常见"HLS 面积/频率差一截"的经验，但本篇 sphere decoder 等案例也显示调好的 HLS 可在资源上优于手写 RTL——关键路径仍要会读生成 RTL。

4. **验证两套，CI 时间炸**：C 仿真（cosim）跑分钟级，但 RTL co-simulation 跑小时级，每改一行 C 都要重跑整套——CI 时间从分钟变小时。

## 适用 vs 不适用场景

**适用**：
- 数据流类算法：信号处理、视频编解码、加密、CNN 推理算子
- 需要快速从 C 原型到 FPGA 的迭代——5 倍开发效率提升
- 算法工程师主导、不想学 Verilog 的项目
- 数据并行循环（map / reduce / stencil）

**不适用**：
- 控制流密集：解析器、编译器、状态机——HLS 调度难以优化
- 极致性能 / 极小面积：很多场景手写 RTL 仍更稳，但要以时序报告为准，不要先验认定 HLS 必输
- 动态形状数据结构：链表、树、图（指针追踪硬件不友好）
- 不规则随机访存（哈希表、稀疏图遍历）

## 历史小故事（可跳过）

- **1980 年代末**：Carnegie Mellon 的 CMU-DA 学术原型，第一次尝试自动综合，但只能跑玩具例子
- **1990 年代**：Synopsys Behavioral Compiler 商业化失败——技术不够成熟，工程师不买账
- **2006 年**：Cong 在 UCLA 把多年研究分拆成创业公司 **AutoESL**，主打 C-to-RTL
- **2011 年**：Xilinx 收购 AutoESL，整合成 **Vivado HLS**——HLS 第一次有了顶级 EDA 厂商背书
- **2019 年**：Xilinx 把 Vivado HLS 改名 **Vitis HLS**，并推 Vitis AI——HLS 成为 FPGA AI 加速的官方路径
- **2020 年代**：Intel/Altera 跟进 oneAPI HLS、Microchip SmartHLS、AMD 收 Xilinx 后继续推 Vitis——HLS 成为 FPGA 主流入口

## 学到什么

1. **抽象层级提升的代价**：从 RTL 升到 C，开发效率常提数倍，QoR 则高度依赖 #pragma 与算法形态——这是工程史的常见 tradeoff
2. **#pragma 注释是真正的接口**：纯 C 不够，注释才是用户和编译器谈判的语言——告诉它"这里我允许你怎么变"
3. **理论 → 工具 → 工业**：1980s 学术 → 1990s 失败 → 2000s 创业 → 2011 收购，30 年才落地
4. **HLS vs CUDA/OpenCL**：都是"高级语言写加速器"思路，但目标硬件不同——CUDA 编 GPU，HLS 编 FPGA/ASIC

## 延伸阅读

- 视频教程：[Xilinx Vitis HLS 入门](https://www.xilinx.com/video/hardware/getting-started-with-vitis-hls.html)（30 分钟动手第一个 HLS 工程）
- 综述论文：[Cong et al., "High-Level Synthesis for FPGAs", IEEE TCAD 2011](https://ieeexplore.ieee.org/document/5737850)（本篇，30 页，技术与工业并重）
- 入门书：Kastner et al., *Parallel Programming for FPGAs*（开源 PDF，用 Vivado HLS 实战）
- [[llvm]] —— HLS 前端基本都用 LLVM IR 做中间表示
- [[feautrier-polyhedral]] —— 多面体模型是 HLS 循环调度的理论基础
- [[ssa]] —— LLVM IR 用 SSA 形式，HLS 调度就在 SSA 上做

## 关联

- [[llvm]] —— HLS 把 C 降到 LLVM IR 再做调度/分配/绑定
- [[feautrier-polyhedral]] —— 多面体模型给嵌套循环的并行化提供数学基础
- [[ssa]] —— LLVM IR 的 SSA 形式让数据依赖一目了然
- [[opencl-2010]] —— OpenCL 也想"一份代码跑 GPU/CPU/FPGA"，Xilinx 后来支持 OpenCL→HLS
- [[sycl-cpp-2020]] —— SYCL 是 C++ 版加速器编程，与 HLS 同源不同分支
- [[case-for-risc-1980]] —— RISC 是"少而精"的 CPU，HLS 是"按需定制"的电路，殊途同归
- [[nickolls-dally-2010-cuda-era]] —— CUDA 用同期同代论文论证了 GPU 路径，HLS 是 FPGA 路径

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[case-for-risc-1980]] —— Case for RISC 1980 — 一篇没有芯片的论文，掀起 CPU 半世纪革命
- [[feautrier-polyhedral]] —— Feautrier 多面体调度 — 把循环并行化变成解几何方程
- [[llvm]] —— LLVM — 模块化编译器框架
- [[nickolls-dally-2010-cuda-era]] —— Nickolls-Dally 2010 — GPU 怎么从画三角形变成跑 AI
- [[ssa]] —— SSA — 静态单赋值形式

