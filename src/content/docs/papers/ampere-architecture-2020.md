---
title: NVIDIA Ampere — 第三代 Tensor Core 加 TF32 / BF16 / FP64，结构化稀疏 + MIG 重写大模型时代硬件假设
来源: 'NVIDIA, "NVIDIA A100 Tensor Core GPU Architecture", Whitepaper v1.0, 2020'
日期: 2026-05-30
子分类: GPU 架构
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

Ampere 是 NVIDIA 2020 年发布的第八代 GPU 架构，旗舰是 **GA100（A100）**——一颗专为数据中心训练 / 推理 / HPC 三合一设计的硅片。它在一代之内做了**四件改写假设**的事：**第三代 Tensor Core 加 TF32 / BF16 / FP64 + 2:4 结构化稀疏 + MIG 多实例 GPU + 第三代 NVLink 600 GB/s**——最直接的后果是 **GPT-3（2020）/ PaLM / LLaMA-1 训练的事实硬件**就是 A100 集群。

日常类比：[[volta-architecture-2017]] 在数据中心车间装了第一台拼乐高 4×4 的机器（Tensor Core FP16）；[[turing-architecture-2018]] 把它小型化下放消费市场加 INT8。**Ampere 是把这台机器升级成"自带四种乐高规格 + 能切成 7 台小机器"——既可以一颗芯片跑 GPT-3 训练，也可以切成 7 份给 7 个推理客户**。Volta 让"训练用 GPU"成立，Ampere 让"训练 / 推理 / 多租户切片"在同一颗硅片上同时成立。

落到硅片：**GA100 = 542 亿晶体管、TSMC 7nm N7、826 mm²、108 SM × 64 FP32 = 6912 FP32 核 + 432 第三代 Tensor Core、40 / 80 GB HBM2 / HBM2e、显存带宽 1555 / 2039 GB/s、NVLink 3.0 600 GB/s、PCIe Gen4、SXM4 400 W / PCIe 250 W**。代表卡：**A100 SXM4 80GB（DGX A100 标配）、A100 PCIe、A30、A40、GeForce RTX 3090 / 3080（GA102）**，**Compute Capability sm_80**（GA100）/ sm_86（消费 GA10x）。

## 为什么重要

不理解 Ampere，下面这些事都没法解释：

- 为什么 **2020-2023 大模型训练默认用 A100 集群**——TF32 + BF16 + 600 GB/s NVLink 是事实门槛
- 为什么 **PyTorch 1.7+ 默认 matmul 走 TF32**——不改一行代码 FP32 训练快 8×
- 为什么 **云厂商出现"1/7 A100"实例**（AWS / Azure / GCP）——MIG 把单卡按硬件切成 7 份
- 为什么 **LLM 训练用 BF16 而不是 FP16**——A100 起 BF16 算力 = FP16，且动态范围 ×256
- 为什么 **HPC（流体 / 气候 / 量子化学）2021 后大量上 GPU**——FP64 Tensor Core 让双精度也能用 Tensor Core，HPC 算力 ×2

## 核心要点

Ampere 在 [[volta-architecture-2017]] / [[turing-architecture-2018]] 之上做了 **四件事**：

1. **第三代 Tensor Core**：在 V100 第一代 FP16/FP32、Turing 第二代 INT8/INT4 之上，**新增 TF32 / BF16 / FP64**。FP16 算力对 V100 ×2.5（312 vs 125 TFLOPS）；INT8 ~624 TOPS。**TF32（19-bit）= 8-bit 指数 + 10-bit 尾数 + 1 符号**——指数和 FP32 一样、尾数和 FP16 一样，**作为 FP32 的硬件替身自动跑**，用户代码 `torch.matmul(a, b)` 不改但走 Tensor Core，156 TFLOPS vs 19.5 TFLOPS FP32 = ×8。

2. **2:4 结构化稀疏**：每 4 个权重必须有 2 个为零（训练时 mask），推理时硬件跳过零值，**Tensor 算力直接 ×2**——TF32 312 / BF16 624 / INT8 1248 TOPS。意义：**首次硬件化稀疏**，但要求训练阶段就引入 2:4 约束，不是"训完压缩"的免费午餐。

3. **MIG（Multi-Instance GPU）**：单 A100 硬件分区成最多 **7 个独立实例**——SM、L2 cache、显存控制器、显存全部物理切分，每个实例对客户端表现为独立 GPU，QoS 互不干扰。意义：数据中心 GPU 第一次像 CPU 一样能"切片售卖"——云厂商 1/7 A100 实例由此而来，把推理客户的成本门槛降到 1/7。

4. **第三代 NVLink + HBM2e + Async Copy**：NVLink 3.0 **12 链 × 50 GB/s = 600 GB/s**（V100 NVLink 2.0 是 300 GB/s），DGX A100 8 卡全互联；HBM2e 80GB 版**带宽 2039 GB/s**（V100 是 900 GB/s）；新增 `cp.async` 指令让显存 → shared memory 拷贝**绕过寄存器文件**，重叠计算与搬运。意义：**显存墙在 LLM 时代被这三件事一起推开**。

### 这四件事怎么互为支柱

- 没 **第三代 Tensor Core TF32 / BF16**，GPT-3 175B 训练精度选不下来
- 没 **结构化稀疏**，推理端无法在同硬件再翻倍吞吐
- 没 **MIG**，A100 卖不进多租户云市场，单价撑不起 R&D
- 没 **NVLink 3.0 600 GB/s**，1024 卡集群训练 GPT-3 通信成瓶颈

## 实践案例

### 案例 1：TF32 让 PyTorch FP32 训练免改代码加速 8×

```python
import torch
torch.backends.cuda.matmul.allow_tf32 = True  # PyTorch 1.7+ 默认 True
a = torch.randn(8192, 8192, device="cuda", dtype=torch.float32)
b = torch.randn(8192, 8192, device="cuda", dtype=torch.float32)
c = a @ b   # 在 A100 上自动走 TF32 Tensor Core, 156 TFLOPS
            # V100 / Turing 上仍走 FP32 CUDA Core, 19.5 TFLOPS
```

意义：**老代码、老 dtype、新硬件**——这是"硬件兼容性"的教科书示例，也是 A100 上市后立刻被 PyTorch / TF / JAX 默认采纳的关键。

### 案例 2：BF16 训练 GPT-3 / LLaMA

```python
# Megatron-LM / DeepSpeed on A100
model = GPT(...).to(dtype=torch.bfloat16)   # BF16 而非 FP16
optimizer = torch.optim.AdamW(model.parameters())
# A100: BF16 312 TFLOPS = FP16 312 TFLOPS, 但动态范围 1e-38 ~ 1e38 (FP16 是 6e-5 ~ 6e4)
# 结果: 大模型训练不再需要 loss scaling 调参, 收敛更稳
```

意义：**BF16 是 LLM 训练事实标准**——根因就是 Ampere 让 BF16 与 FP16 算力齐平，且免去 FP16 loss scaling 这个工程坑。

### 案例 3：MIG 切片把 A100 当 7 张卡卖

```bash
# 把 A100 切成 7 个 1g.5gb 实例 (每实例 1/7 SM + 1/7 显存)
nvidia-smi mig -cgi 19,19,19,19,19,19,19 -C
nvidia-smi -L
# GPU 0: A100-SXM4-40GB (UUID: ...)
#   MIG 1g.5gb Device 0: ...   <- 7 个独立 GPU
#   MIG 1g.5gb Device 1: ...
#   ...
```

意义：**GPU 进入"硬件级多租户"时代**——AWS p4d / GCP a2-highgpu / Azure NDA100 的 1/7 A100 实例由此而来，推理客户花 1/7 价格独占 1/7 卡。

### 案例 4：A100 vs V100 同代对比

```
V100 SXM2 (Volta):    32GB HBM2  900 GB/s, 125 FP16 Tensor TFLOPS, 0  TF32, 0  BF16, NVLink 300 GB/s
A100 SXM4 80GB:       80GB HBM2e 2039 GB/s, 312 FP16/BF16 Tensor,    156 TF32, 19.5 FP64 Tensor, NVLink 600 GB/s, +MIG +2:4 稀疏
GPT-3 175B 训练:        V100 估算 > 100 天 / 千卡;  A100 实测 34 天 / 1024 卡 (OpenAI)
```

意义：**V100 → A100 的代差不在 FP32 算力（19.5 vs 15.7）**，而在 Tensor Core 新增四种规格 + 显存带宽 ×2.3 + NVLink ×2——**LLM 时代由 A100 开启**。

## 踩过的坑

1. **TF32 ≠ FP32**：尾数 10 bit（FP32 是 23 bit），梯度累积久了会发散。强收敛任务（科学计算 / 收敛阈值严的优化）需 `torch.backends.cuda.matmul.allow_tf32 = False` 关闭。

2. **结构化稀疏不是"训完压缩"**：必须**训练时**就插 2:4 mask（如 `apex.contrib.sparsity`），fine-tune 后再启用 sparse Tensor Core。直接把训好的稠密权重塞进去精度大跌。

3. **MIG 切完 NVLink 失效**：MIG 实例之间**不共享 NVLink**——切了 1/7 就只能用那 1/7 的显存带宽，需要单卡满算力的训练任务千万别开 MIG。

4. **BF16 vs FP16 选错**：FP16 mantissa 10 bit 精度高但范围窄；BF16 mantissa 7 bit 精度低但范围宽。**LLM 选 BF16，CV 旧代码选 FP16**——硬背规则会翻车。

5. **FP64 Tensor Core 仅 sm_80+**：CUDA 11 起 `wmma::fragment<..., double>` 才合法；旧 CUDA 10 代码不会自动用上，HPC 库（cuBLAS / cuSOLVER）需重新链接 11.0+。

6. **SXM4 vs PCIe 形态差极大**：A100 PCIe 版 NVLink 只 **64 GB/s**（两卡桥接），SXM4 才有 **600 GB/s** 全互联。多卡训练买 PCIe 版会撞通信墙——DGX A100 / HGX A100 都是 SXM4。

## 适用 vs 不适用场景

**适用**：

- 大模型训练 —— GPT-3 / PaLM / LLaMA-1 / OPT / BLOOM 都在 A100 集群
- 大模型推理 —— BF16 / INT8 + 2:4 稀疏吞吐够支撑 GPT-3 在线服务
- HPC 双精度 —— FP64 Tensor Core 让 LAMMPS / OpenFOAM / 量子化学包速度 ×2
- 多租户云 GPU —— MIG 把推理 SaaS 成本切到 1/7
- TF32 自动加速 —— 老 FP32 训练代码免改获得 ×8

**不适用**：

- FP8 训练 —— Hopper H100 起才有，A100 仅到 BF16
- Transformer Engine —— H100 专用，A100 无
- 消费图形 / 光追 —— GA100 无 RT Core，消费 GA102（RTX 3090）才有第二代 RT Core
- 极致单卡推理延迟 —— L4 / L40S（Ada）SM 频率更高、能效更优
- 千亿参数稠密推理 —— 80 GB 不够，H100 80GB / Grace Hopper / B100 才舒服

## 历史小故事（可跳过）

- **2020-05 GTC（线上）**：黄仁勋"厨房演讲"发布 A100，疫情中云端首发
- **2020-05 DGX A100**：8 × A100 SXM4 + 第三代 NVLink Switch，单机 5 PFLOPS BF16
- **2020-06 MLPerf 0.7**：A100 把 ResNet-50 训练时间纪录推到分钟级
- **2020-06 GPT-3 论文**：1024 × V100 集群训练（论文写于 A100 发布前后）；后续千亿模型训练全切 A100
- **2020-09 RTX 3090 / 3080**：GA102 消费版上市，第二代 RT Core + 第三代 Tensor Core 下放
- **2021-06 A100 80GB**：HBM2e 升级，2039 GB/s 带宽，配合 GPT-3 时代显存压力
- **2022-03 Hopper H100 发布**：第四代 Tensor Core + Transformer Engine + FP8，A100 让位但兼容性长尾延续到 2024+

## 学到什么

1. **专用化继续深化**：[[volta-architecture-2017]] 加 Tensor Core、[[turing-architecture-2018]] 加 RT Core，Ampere 给 Tensor Core **再加四种规格 + 稀疏**——专用化不止"加新单元"，也包括"现有单元加规格"
2. **硬件兼容性的"自动加速"模板**：TF32 让 FP32 老代码免改获得 8×——这是黄金硬件升级路径，后续 H100 FP8 / Blackwell FP4 都试图复制（但难度更大）
3. **多租户切片是 GPU 商业模式转折**：MIG 让 A100 进入"按 1/7 卖"的云市场，单卡 ROI 模型彻底改变；后续 H100 沿用、AMD MI300X 跟进
4. **显存墙是 LLM 时代主矛盾之一**：HBM2e ×2.3 带宽、NVLink ×2、`cp.async`——A100 把"显存喂不饱算力"的窗口推后两年，给 GPT-3 / PaLM 时代留出空间
5. **架构师为 18-24 个月后铺路**：A100 上市时 GPT-3 还没正式发，TF32 / BF16 / 600 GB/s NVLink 是为"还没出现的千亿模型"提前埋的路。**架构决策永远超前于应用 18 个月**

## 延伸阅读

- 白皮书：[NVIDIA A100 Tensor Core GPU Architecture](https://images.nvidia.com/aem-dam/en-zz/Solutions/data-center/nvidia-ampere-architecture-whitepaper.pdf)（83 页，2020）
- 第三代 Tensor Core 详解：[NVIDIA Ampere Architecture In-Depth](https://developer.nvidia.com/blog/nvidia-ampere-architecture-in-depth/)（NVIDIA Blog 2020-05）
- TF32 / BF16 PyTorch 文档：[Numerical accuracy](https://pytorch.org/docs/stable/notes/numerical_accuracy.html)
- MIG 用户指南：[NVIDIA Multi-Instance GPU User Guide](https://docs.nvidia.com/datacenter/tesla/mig-user-guide/)
- [[turing-architecture-2018]] —— 直接前代消费线，第二代 Tensor Core + RT Core
- [[volta-architecture-2017]] —— Tensor Core 第一代发源地，A100 直接继承数据中心定位
- [[pascal-architecture-2016]] —— HBM2 + NVLink 第一代鼻祖
- [[maxwell-architecture-2014]] —— SMM 4 分区骨架延续到 Ampere SM
- [[kepler-architecture-2012]] —— SMX 大分区组织
- [[fermi-architecture-2010]] —— ECC + L1/L2 cache 起点
- [[tesla-architecture-2008]] —— SIMT + warp = 32 鼻祖

## 关联

- [[tesla-architecture-2008]] —— SIMT 鼻祖，Ampere 沿用 warp = 32
- [[fermi-architecture-2010]] —— ECC + L1/L2 cache 在 Ampere 全面继承
- [[kepler-architecture-2012]] —— SMX 4 分区组织延续到 Ampere SM
- [[maxwell-architecture-2014]] —— SMM 4 分区骨架被 Ampere SM 直接继承
- [[pascal-architecture-2016]] —— HBM2 + NVLink 1.0 起点，Ampere 升 HBM2e + NVLink 3.0
- [[volta-architecture-2017]] —— Tensor Core 第一代，Ampere 第三代加 TF32/BF16/FP64 + 稀疏
- [[turing-architecture-2018]] —— 第二代 Tensor Core 加 INT8/INT4，Ampere 在数据中心继续扩展规格
- [[attention]] —— GPT-3 / Transformer 训练在 A100 上跑得动靠 BF16 + 600 GB/s NVLink
- [[chinchilla]] —— Chinchilla 实验也是 A100 集群跑出来
- [[cuda]] —— Compute Capability 8.0 = Ampere，CUDA 11 起支持 TF32 / BF16 / FP64 Tensor
