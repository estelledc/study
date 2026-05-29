---
title: 论文候选 — GPU / 异构计算 / 计算机体系结构
description: 60 篇候选，由 research subagent 整理，待主 CC 排期写入正式 papers/
日期: 2026-05-29
---

# GPU / 异构计算 / 计算机体系结构主题候选

候选 60 篇，按 12 个子主题分组。覆盖 1967-2024，避开 study 站现有 4 篇 GPU/分布式训练论文（megatron-lm / deepspeed-zero / vllm / flash-attention）。重点补强：GPU 硬件代际、GPGPU 编程语言谱系、推理 / 量化工程化、RISC 体系结构经典、异构与持久内存。

## GPU 硬件架构演进（10 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `tesla-architecture-2008` | NVIDIA Tesla: A Unified Graphics and Computing Architecture | 2008 | Lindholm 等 IEEE Micro 文章，G80 把图形管线统一为 SM 阵列；CUDA 与现代 GPU 的奠基论文，没有它无法理解后续所有代际 | https://ieeexplore.ieee.org/document/4523358 |
| `fermi-architecture-2010` | NVIDIA's Fermi: The First Complete GPU Computing Architecture | 2010 | 第一代支持 ECC + L1/L2 cache + 双精度的 GPU，把 GPGPU 从 demo 变成 HPC 工具；理解"GPU 为什么能跑科学计算"必读 | https://www.nvidia.com/content/PDF/fermi_white_papers/NVIDIA_Fermi_Compute_Architecture_Whitepaper.pdf |
| `kepler-architecture-2012` | NVIDIA Kepler GK110 Architecture Whitepaper | 2012 | 引入 SMX + Hyper-Q + Dynamic Parallelism；K80 是第一代被深度学习广泛采用的 GPU，AlexNet 后训练黄金期就靠它 | https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/tesla-product-literature/NVIDIA-Kepler-GK110-GK210-Architecture-Whitepaper.pdf |
| `maxwell-architecture-2014` | NVIDIA GeForce GTX 980 Maxwell GM204 Whitepaper | 2014 | SM 重设计 + 能效翻倍，桌面级首次进入深度学习视野；GTX Titan X 让个人开发者也能跑 ResNet | https://www.nvidia.com/content/dam/en-zz/Solutions/geforce/maxwell/pdf/GeForce_GTX_980_Whitepaper_FINAL.PDF |
| `pascal-architecture-2016` | NVIDIA Tesla P100 Whitepaper | 2016 | NVLink 1.0 + HBM2 首次落地 + FP16 加速；理解"为什么深度学习从 GTX 转向 Tesla"的工程拐点 | https://images.nvidia.com/content/pdf/tesla/whitepaper/pascal-architecture-whitepaper.pdf |
| `volta-architecture-2017` | NVIDIA Tesla V100 GPU Architecture Whitepaper | 2017 | 第一代 Tensor Core + 独立线程调度 + NVLink 2.0；现代 LLM 训练硬件的奠基代际，所有后续 GPU 都向后兼容它 | https://images.nvidia.com/content/volta-architecture/pdf/volta-architecture-whitepaper.pdf |
| `turing-architecture-2018` | NVIDIA Turing GPU Architecture Whitepaper | 2018 | 引入 RT Core 做光追 + 第二代 Tensor Core 支持 INT8/INT4；理解"图形与计算两条路线如何在同一硅片上共存" | https://images.nvidia.com/aem-dam/Solutions/design-visualization/technologies/turing-architecture/NVIDIA-Turing-Architecture-Whitepaper.pdf |
| `ampere-architecture-2020` | NVIDIA A100 Tensor Core GPU Architecture | 2020 | 第三代 Tensor Core + TF32 + 结构化稀疏 + MIG 多实例；2020-2023 大模型训练的事实硬件 | https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf |
| `hopper-architecture-2022` | NVIDIA H100 Tensor Core GPU Architecture | 2022 | Transformer Engine + FP8 + TMA + DPX 指令 + Thread Block Cluster；理解"硬件如何为 LLM 量身定制"的关键 | https://resources.nvidia.com/en-us-tensor-core/gtc22-whitepaper-hopper |
| `blackwell-architecture-2024` | NVIDIA Blackwell Architecture Technical Brief | 2024 | 双 die NVLink 桥接 + 第二代 Transformer Engine + FP4 + 第五代 NVLink；2025+ LLM 训练事实硬件 | https://resources.nvidia.com/en-us-blackwell-architecture |

## GPGPU 编程模型（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `brook-2004` | Brook for GPUs: Stream Computing on Graphics Hardware | 2004 | Stanford Buck 等 SIGGRAPH 论文，把 GPU 抽象成 stream 处理器；CUDA 的直接思想前身，Buck 后来加入 NVIDIA 主导 CUDA | https://graphics.stanford.edu/papers/brookgpu/brookgpu.pdf |
| `opencl-2010` | OpenCL: A Parallel Programming Standard for Heterogeneous Computing Systems | 2010 | Khronos 跨厂商异构编程标准；与 CUDA 并行的开放路线，AMD/Intel/移动端 GPU 至今依赖它 | https://ieeexplore.ieee.org/document/5457293 |
| `sycl-cpp-2020` | SYCL: A Single-Source C++ Standard for Heterogeneous Computing | 2020 | Khronos 把 OpenCL 升级成现代 C++ 单源编程；Intel oneAPI / DPC++ 都基于它，理解"为什么 CUDA 想被替代" | https://dl.acm.org/doi/10.1145/3388333.3388651 |
| `kokkos-2014` | Kokkos: Enabling manycore performance portability through polymorphic memory access patterns | 2014 | Sandia 实验室的 C++ 性能可移植库，一份代码跑 CPU/GPU/Xeon Phi；HPC 圈"写一次跑各处"的标杆方案 | https://www.osti.gov/biblio/1106969 |
| `thrust-2010` | Thrust: A Productivity-Oriented Library for CUDA | 2010 | NVIDIA 把 STL 风格搬到 GPU，sort/scan/reduce 一行调用；理解 GPU 通用算法库的接口设计哲学 | https://research.nvidia.com/publication/thrust-productivity-oriented-library-cuda |

## GPU 内存与执行模型（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gpu-microbenchmarking-2010` | Demystifying GPU Microarchitecture through Microbenchmarking | 2010 | Wong 等 ISPASS 用微基准逆向 GPU cache/TLB/warp 调度；理解"如何科学测量 GPU 真实行为"的方法论奠基 | https://ieeexplore.ieee.org/document/5452013 |
| `unified-memory-2014` | Pascal Unified Memory: Reduce Programming Complexity | 2016 | Page-fault driven oversubscription + 自动迁移；理解"CPU/GPU 共享地址空间"如何从手工 cudaMemcpy 演进而来 | https://developer.nvidia.com/blog/unified-memory-cuda-beginners/ |
| `gpu-cache-coherence-2013` | Cache Coherence for GPU Architectures | 2013 | Singh 等 HPCA 系统分析 GPU 共享内存一致性；为后续 multi-GPU 共享内存（NVSwitch）打基础 | https://ieeexplore.ieee.org/document/6522348 |
| `cuda-streams-concurrency-2018` | A Quantitative Study of GPU Concurrent Kernel Execution | 2018 | 量化分析 streams 并发执行的真实增益与限制；理解"为什么大多数应用拿不到理论 SM 利用率"的工程必读 | https://ieeexplore.ieee.org/document/8525447 |

## 训练并行策略（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `gpipe-2019` | GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism | 2019 | Google 提出 micro-batch 流水线并行；与 Megatron 张量并行互补，是现代 3D 并行的奠基 | https://arxiv.org/abs/1811.06965 |
| `pipedream-2019` | PipeDream: Generalized Pipeline Parallelism for DNN Training | 2019 | Microsoft SOSP 论文，1F1B 调度 + weight stashing；解决 GPipe bubble 问题，是 PyTorch 流水线后端的思想源头 | https://arxiv.org/abs/1806.03377 |
| `gshard-2020` | GShard: Scaling Giant Models with Conditional Computation and Automatic Sharding | 2020 | Google 用 MoE + 自动分片把模型推到 600B；XLA 跨设备自动并行的奠基，T5/Switch Transformer 都基于它 | https://arxiv.org/abs/2006.16668 |
| `fsdp-2023` | PyTorch FSDP: Experiences on Scaling Fully Sharded Data Parallel | 2023 | Meta 工程笔记，FSDP API 设计 + ZeRO-3 思路在 PyTorch 的官方落地；现代开源 LLM 训练的事实选型 | https://arxiv.org/abs/2304.11277 |
| `alpa-2022` | Alpa: Automating Inter- and Intra-Operator Parallelism for Distributed Deep Learning | 2022 | UC Berkeley OSDI，把张量/流水/数据并行统一为搜索问题自动求解；理解"自动并行编译器"必读 | https://arxiv.org/abs/2201.12023 |

## 推理优化（6 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `orca-2022` | Orca: A Distributed Serving System for Transformer-Based Generative Models | 2022 | Seoul Nat'l Univ + FriendliAI OSDI 论文，提出 iteration-level scheduling + selective batching；continuous batching 思想源头，比 vLLM 早 | https://www.usenix.org/conference/osdi22/presentation/yu |
| `fastertransformer-2021` | NVIDIA FasterTransformer Technical Documentation | 2021 | NVIDIA 第一代生产级 LLM 推理引擎，开源 CUDA kernel 的工业标杆；理解 TensorRT-LLM 之前的优化基线 | https://github.com/NVIDIA/FasterTransformer/blob/main/docs/gpt_guide.md |
| `tensorrt-llm-2023` | TensorRT-LLM: A TensorRT Toolbox for Large Language Models | 2023 | NVIDIA 整合 FT + Triton + IFB 的官方推理栈；与 vLLM 形成厂商 vs 开源两条主线，理解工程权衡必读 | https://nvidia.github.io/TensorRT-LLM/ |
| `specinfer-2023` | SpecInfer: Accelerating Generative LLM Serving with Speculative Inference and Token Tree Verification | 2023 | CMU/UCSD 提出树状投机解码 + 多路径验证；现代投机推理（包括 Medusa/EAGLE）的算法奠基 | https://arxiv.org/abs/2305.09781 |
| `medusa-2024` | Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads | 2024 | Princeton + Together 提出多 head 并行预测；不需要 draft model 的投机解码，工程极其简单 | https://arxiv.org/abs/2401.10774 |
| `sglang-2024` | SGLang: Efficient Execution of Structured Language Model Programs | 2024 | LMSYS 团队 RadixAttention + 结构化生成；理解"为什么 vLLM 在结构化任务上不够快"的对照系统 | https://arxiv.org/abs/2312.07104 |

## 稀疏与量化（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `llm-int8-2022` | LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale | 2022 | Tim Dettmers 发现 LLM 激活值有 outlier 通道 + 提出混合精度方案；bitsandbytes 库的核心，量化领域必读 | https://arxiv.org/abs/2208.07339 |
| `sparsegpt-2023` | SparseGPT: Massive Language Models Can Be Accurately Pruned in One-Shot | 2023 | Frantar & Alistarh 用近似二阶法做 175B 一次性 50% 剪枝；后训练剪枝路线的代表 | https://arxiv.org/abs/2301.00774 |
| `gptq-2023` | GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers | 2023 | 同一作者把 OBQ 推到 175B，4-bit 几乎无损；2023 年开源 LLM 部署最常用量化方案 | https://arxiv.org/abs/2210.17323 |
| `awq-2023` | AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration | 2023 | MIT Han 团队，按 activation 重要性保护 1% 关键通道；推理速度比 GPTQ 更快，移动端部署首选 | https://arxiv.org/abs/2306.00978 |
| `smoothquant-2023` | SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models | 2023 | 把激活的 outlier 数学等价迁移到权重；W8A8 全 INT8 推理实用化的关键技术 | https://arxiv.org/abs/2211.10438 |

## 算子与编译器（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cudnn-2014` | cuDNN: Efficient Primitives for Deep Learning | 2014 | NVIDIA Chetlur 等论文，第一代深度学习专用 GPU 库；所有现代框架的底层 conv/RNN 都走它 | https://arxiv.org/abs/1410.0759 |
| `triton-2019` | Triton: An Intermediate Language and Compiler for Tiled Neural Network Computations | 2019 | OpenAI Tillet MAPL 论文，让 Python 写出接近手工 CUDA 性能的 kernel；FlashAttention/PyTorch 2.0 编译都基于它 | https://www.eecs.harvard.edu/~htk/publication/2019-mapl-tillet-kung-cox.pdf |
| `cutlass-2020` | CUTLASS: CUDA Templates for Linear Algebra Subroutines | 2020 | NVIDIA C++ 模板库，把 GEMM 拆成可组合的 tile/warp/thread 层级；理解"如何写 SOTA 矩阵乘"必读 | https://github.com/NVIDIA/cutlass/blob/main/media/docs/efficient_gemm.md |
| `tvm-2018` | TVM: An Automated End-to-End Optimizing Compiler for Deep Learning | 2018 | Chen 等 OSDI，把 Halide 思想搬到 DL，调度与计算分离 + auto-tuning；现代 DL 编译器（如 IREE）的奠基 | https://arxiv.org/abs/1802.04799 |
| `taso-2019` | TASO: Optimizing Deep Learning Computation with Automatic Generation of Graph Substitutions | 2019 | Stanford SOSP，自动搜索图重写规则；XLA/PyTorch 2.0 的 graph fusion 思想源头 | https://cs.stanford.edu/~zhihao/papers/sosp19.pdf |

## 通信与互连（5 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `ring-allreduce-2017` | Bringing HPC Techniques to Deep Learning | 2017 | Baidu Gibiansky 把 ring all-reduce 引入深度学习；NCCL 与 Horovod 的算法基础，所有数据并行的核心 | https://andrew.gibiansky.com/blog/machine-learning/baidu-allreduce/ |
| `nvlink-nvswitch-2018` | NVIDIA NVLink Fabric for High-Performance Computing | 2018 | NVLink 2.0 + NVSwitch 形成全互连 GPU pod；DGX-2 是第一台 16-GPU all-to-all 服务器 | https://images.nvidia.com/content/pdf/nvswitch-technical-overview.pdf |
| `gpudirect-rdma-2014` | GPUDirect RDMA: Toward Efficient PCIe Networking for GPU Clusters | 2014 | NVIDIA + Mellanox 让 GPU 内存直接走 InfiniBand RDMA，绕过 CPU；多机训练通信的奠基技术 | https://developer.nvidia.com/gpudirect |
| `blink-2020` | Blink: Fast and Generic Collectives for Distributed ML | 2020 | UC Berkeley MLSys，按拓扑动态选择 spanning tree；解决异构 GPU 集群里 NCCL ring 性能塌方 | https://arxiv.org/abs/1910.04940 |
| `aurora-exascale-2024` | The Aurora Exascale System | 2024 | Argonne 实验室 2 EFLOPS Intel GPU 系统总览；理解 NVIDIA 之外的另一条 exascale 路线 | https://www.alcf.anl.gov/aurora |

## 计算机体系结构经典（8 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `tomasulo-1967` | An Efficient Algorithm for Exploiting Multiple Arithmetic Units | 1967 | IBM Tomasulo 提出寄存器重命名 + 保留站，乱序执行的祖宗算法；现代所有超标量 CPU 的核心 | https://ieeexplore.ieee.org/document/5391985 |
| `amdahl-law-1967` | Validity of the Single Processor Approach to Achieving Large Scale Computing Capabilities | 1967 | Amdahl 定律的原始论文，并行加速比上界的数学证明；理解所有"加速到 N×"广告的免疫力 | https://dl.acm.org/doi/10.1145/1465482.1465560 |
| `risc-i-1981` | RISC I: A Reduced Instruction Set VLSI Computer | 1981 | Patterson & Sequin ISCA 论文，提出 RISC 设计哲学 + 寄存器窗口；现代 ARM/RISC-V 都源于此 | https://dl.acm.org/doi/10.1145/800052.801871 |
| `case-for-risc-1980` | The Case for the Reduced Instruction Set Computer | 1980 | Patterson & Ditzel 的纲领性论文，与 IBM 801 共同奠定 RISC 思想；体系结构入门必读 | https://dl.acm.org/doi/10.1145/641914.641917 |
| `mips-1981` | MIPS: A VLSI Processor Architecture | 1981 | Hennessy 在 Stanford 的 MIPS 项目，RISC 第二个工业实现；现在的 RISC-V 设计哲学一脉相承 | https://dl.acm.org/doi/10.5555/800232.807125 |
| `branch-prediction-yeh-patt-1991` | Two-Level Adaptive Training Branch Prediction | 1991 | Yeh & Patt MICRO 论文，全局历史 + 模式表的两级预测；现代分支预测器的算法基础 | https://dl.acm.org/doi/10.1145/123465.123475 |
| `mcfarling-bp-1993` | Combining Branch Predictors | 1993 | DEC WRL 技术备忘录，gshare + 锦标赛预测；理解"为什么单一预测器永远不够"必读 | https://www.hpl.hp.com/techreports/Compaq-DEC/WRL-TN-36.pdf |
| `moesi-cache-coherence-1986` | A Class of Compatible Cache Consistency Protocols and their Support by the IEEE Futurebus | 1986 | Sweazey & Smith ISCA，系统化 MESI/MOESI 协议族；多核 CPU 缓存一致性的奠基 | https://dl.acm.org/doi/10.1145/17407.17404 |

## 异构系统（4 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `cell-be-2005` | The Design and Implementation of a First-Generation CELL Processor | 2005 | Sony/IBM/Toshiba 的 PS3 异构芯片，1 PPE + 8 SPE；GPGPU 之前最激进的异构尝试，ROCm 的史前史 | https://ieeexplore.ieee.org/document/1418985 |
| `dash-numa-1992` | The Stanford Dash Multiprocessor | 1992 | Lenoski 等 IEEE Computer，CC-NUMA 的奠基系统；现代多 socket 服务器（包括 Epyc/Xeon）的拓扑思想源头 | https://web.stanford.edu/class/cs315a/papers/dash-computer92.pdf |
| `big-little-2011` | big.LITTLE Technology: The Future of Mobile | 2011 | ARM 异构核架构白皮书，高性能 + 低功耗核混合调度；Apple Silicon / Snapdragon 都基于它 | https://developer.arm.com/documentation/den0024/a/big-LITTLE-Technology |
| `fpga-hls-2011` | High-Level Synthesis for FPGAs: From Prototyping to Deployment | 2011 | Cong 等 IEEE TCAD 综述，把 C/C++ 编译成 FPGA 比特流的范式；Vivado HLS / Vitis 的奠基 | https://ieeexplore.ieee.org/document/5737850 |

## 存储与持久内存（2 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `nvme-protocol-2017` | NVMe and PCIe SSDs: A Modern Look at Storage Performance | 2017 | NVMe 协议设计动机 + 与 SATA/SAS 的性能差距分析；理解现代云盘 / 数据库存储栈必读 | https://www.usenix.org/conference/atc17/technical-sessions/presentation/cao |
| `persistent-memory-2014` | System Software for Persistent Memory | 2014 | Dulloor 等 EuroSys，PMFS 文件系统 + DAX；Optane 与现代 CXL persistent memory 的软件栈奠基 | https://dl.acm.org/doi/10.1145/2592798.2592814 |

## 量子-经典异构（1 篇）

| Slug | 论文 | 年份 | 为什么仍该读 | URL |
|---|---|---|---|---|
| `quantum-supremacy-2019` | Quantum Supremacy Using a Programmable Superconducting Processor | 2019 | Google Sycamore 53-qubit 处理器，200 秒完成经典超算 1 万年的任务；量子-经典异构计算的里程碑 | https://www.nature.com/articles/s41586-019-1666-5 |

---

## 备注

- 全部 60 篇均有公开 arXiv / IEEE / ACM / NVIDIA 官网 / 实验室技术报告 URL
- 时间跨度 1967-2024，涵盖 12 个子主题
- 已避开 study 站现有 4 篇 GPU/分布式训练论文（megatron-lm / deepspeed-zero / vllm / flash-attention）
- 选择策略：硬件代际全谱（Tesla → Blackwell 10 代）+ 编程模型谱系（Brook → SYCL）+ 工程化前沿（量化 / 推理 / 编译器）+ 体系结构祖宗（Tomasulo / RISC-I / Amdahl / Yeh-Patt）三线并进
- 偏向工业级白皮书与系统会议论文（OSDI / SOSP / ISCA / MICRO / SIGGRAPH / MAPL），不收纯理论 paper
