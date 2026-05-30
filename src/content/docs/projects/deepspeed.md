---
title: 'DeepSpeed — 微软分布式训练库'
来源: 'https://github.com/microsoft/DeepSpeed'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '高级'
---

## 是什么

DeepSpeed 是微软 2020 年开源的**大模型分布式训练加速库**。它解决一件具体的事：**单张 GPU 装不下的模型，怎么切到 N 张卡上还训得动、训得快**。日常类比：像**集装箱搬家公司**——你家家具一辆卡车装不下，集装箱公司告诉你"沙发拆腿、冰箱躺倒、床垫卷起来"，每件家具切几块装到不同的车上，到目的地还能按指令拼回原样。

最小用法：

```bash
deepspeed --num_gpus=8 train.py --deepspeed ds_config.json
```

`ds_config.json` 里只要写一句 `"zero_optimization": {"stage": 3}`，原本 8 张卡也装不下的 70B 模型就能训起来——这就是 DeepSpeed 的招牌技术 **ZeRO**。

## 为什么重要

不理解 DeepSpeed，下面这些事都没法解释：

- 为什么 BLOOM-176B / Megatron-Turing NLG 530B / GLM-130B 这些万亿级模型训得起——它们底下都是 DeepSpeed
- 为什么 [[accelerate]] / `transformers.Trainer` / [[trl]] 的配置里都有一栏 `deepspeed`——它是这些上层库的事实后端
- 为什么微调一个 7B 模型用 [[torchtune]] 一张卡能跑，但一上 70B 就要 ZeRO-3——参数 + 梯度 + 优化器状态加起来 1.4TB，必须切
- 为什么"3D 并行"（Data / Tensor / Pipeline）会成为大模型训练的事实方案——DeepSpeed 把三种并行揉在一个配置文件里

## 核心要点

记 **ZeRO 三阶段 + Offload + 3D 并行** 这三件事：

1. **ZeRO 三阶段切显存**：训练时每张卡显存装的不只有模型参数，还有"梯度 + 优化器状态（Adam 一份模型 12 倍大小）"。ZeRO 把这三块按阶段切给 N 张卡：
   - **Stage 1**：切 optimizer states（最大头，省 4 倍）
   - **Stage 2**：再切 gradients（再省 2 倍）
   - **Stage 3**：再切 parameters（参数本身也只在卡上存 1/N）
   - 用谁要谁现取（all-gather），用完丢——拿通信换显存

2. **Offload 把卡装不下的扔到 CPU/NVMe**：ZeRO-Offload 把 optimizer 状态搬到 CPU 内存，ZeRO-Infinity 进一步搬到 NVMe SSD。代价是慢（CPU/SSD 慢于 GPU），收益是**单机 8 卡也能训百亿参数**——给穷人的分布式训练。

3. **3D 并行 = DP + TP + PP**：单一切法不够时三种叠加：
   - **Data Parallel (DP/ZeRO)**：每张卡看不同 batch
   - **Tensor Parallel (TP)**：一个矩阵乘法切到 N 张卡（NVIDIA Megatron-LM 强项）
   - **Pipeline Parallel (PP)**：模型按层切段，像流水线传递 activations
   - DeepSpeed 提供 PP / DP，与 Megatron-LM 合体叫 **Megatron-DeepSpeed**，是 530B 模型训练的标配

合起来一句话：**DeepSpeed 让"单卡装不下的模型"能在普通集群上训，而上层应用代码几乎不用动**。

## 实践案例

### 案例 1：ZeRO Stage 3 配置

```json
{
  "train_batch_size": 32,
  "fp16": { "enabled": true },
  "zero_optimization": {
    "stage": 3,
    "offload_optimizer": { "device": "cpu" },
    "offload_param": { "device": "cpu" }
  }
}
```

启动：`deepspeed --num_gpus=4 train.py --deepspeed ds_config.json`

读法：4 张卡 ZeRO-3，参数和优化器状态都切到 4 份；优化器状态再 offload 到 CPU 内存。原本 4×80GB = 320GB 显存装不下的 30B 模型，现在能塞下。

### 案例 2：从 [[accelerate]] 调 DeepSpeed

Accelerate 的配置里只要选 DeepSpeed 后端，业务代码一行不改：

```bash
accelerate config   # 选 deepspeed → stage 3 → cpu offload
accelerate launch train.py
```

`train.py` 里仍然是普通的 PyTorch 训练循环（`accelerator.prepare(...)` / `accelerator.backward(loss)`）。这就是为什么 [[trl]] / `transformers.Trainer` 文档里 DeepSpeed 章节短到只有几行配置——重活全在 DeepSpeed 引擎里。

### 案例 3：与 Megatron-LM 合体训 530B

NVIDIA Megatron-LM 擅长 tensor parallel（把一个 GEMM 切到 8 张 NVLink GPU 上），DeepSpeed 擅长 ZeRO + pipeline。两家合作出 **Megatron-DeepSpeed**：

- TP=8（一台机内 NVLink 切矩阵）
- PP=35（35 段流水线跨机）
- DP/ZeRO=多副本

Microsoft + NVIDIA 用这套方案训出 530B 的 Megatron-Turing NLG，在 2240 张 A100 上跑了 3 个月。

## 踩过的坑

1. **ZeRO-3 比 ZeRO-2 慢**：每个 forward / backward 都要 all-gather 一次参数，通信开销大。**经验法则**：模型能用 ZeRO-2 + offload 装下就别上 ZeRO-3。

2. **CPU offload 拖慢训练 2-5×**：当显存够时千万别开 offload；它是"装不下的备胎"，不是"锦上添花"。监控 GPU 利用率掉到 30% 以下基本就是 offload 在拖。

3. **`stage3_gather_16bit_weights_on_model_save` 必须开**：ZeRO-3 下保存 checkpoint 时参数是切散的，不开这个 flag 存出来的 checkpoint 是碎片，加载会炸。

4. **batch size 算法反直觉**：`train_batch_size = micro_batch_per_gpu × num_gpus × gradient_accumulation_steps`。三个值改任何一个都要对齐另外两个，不然报"batch size mismatch"。

5. **PyTorch / DeepSpeed / CUDA 版本三方对齐**：DeepSpeed 编译期需要匹配的 CUDA toolkit，PyTorch 也要对齐。装错一个就 `undefined symbol`。建议直接用 NVIDIA 官方 NGC 镜像或 HF 的训练镜像。

## 适用 vs 不适用场景

**适用**：

- 模型 ≥ 7B，单卡装不下，需要切
- 多机多卡（≥ 8 卡），有高带宽互联（NVLink / InfiniBand）
- 大规模预训练 / 全量微调（FFT），尤其 70B+ 量级
- 配 [[accelerate]] / [[trl]] / `transformers.Trainer` 做生产级训练

**不适用**：

- 单卡能装下的模型（≤ 7B fp16）→ 直接 [[pytorch]] DDP 或 [[torchtune]] 更省心
- LoRA 微调 7B 这种轻量场景 → 杀鸡用牛刀，配置成本高于收益
- 推理（DeepSpeed-Inference 是另一套子项目，社区已部分被 vLLM / TensorRT-LLM 替代）
- 学习阶段先理解原理 → 先读 [[pytorch]] DDP 和 ZeRO 论文，DeepSpeed 引擎的工程细节会埋住你

## 历史小故事（可跳过）

- **2019 年**：微软训 Turing-NLG 17B 时撞上墙——一张 V100 只有 32GB，模型 + Adam 状态加起来 200GB+ 装不下。Samyam Rajbhandari 等人提出 **ZeRO 论文**（"Memory Optimizations Toward Training Trillion Parameter Models"）。
- **2020 年**：DeepSpeed 开源，第一版只有 ZeRO Stage 1/2。同年训出 Turing-NLG 17B（当时世界最大）。
- **2021 年**：ZeRO-3 + ZeRO-Infinity 论文发布，宣称单张 V100 可微调 13B 模型；与 NVIDIA 合作推 Megatron-DeepSpeed。
- **2022 年**：Megatron-Turing NLG 530B 训练完成，DeepSpeed 成为万亿模型事实标准。
- **2023+**：HuggingFace 把它包进 Accelerate / Transformers，普通用户配置三行就能用。

## 学到什么

1. **显存才是大模型训练的真正瓶颈**——不是 FLOPS，是 GB；ZeRO 用通信换显存的取舍是核心思想
2. **三种并行各有所长**：DP 切 batch、TP 切矩阵、PP 切层；从来不是"选哪个"，而是"几号场景叠几个"
3. **底层引擎 + 上层薄壳** 的分层设计——DeepSpeed 做引擎，[[accelerate]] / [[trl]] / `Trainer` 做薄壳；用户只需要懂壳，专家才碰引擎
4. **大模型 infra 的护城河是工程**：ZeRO 论文 20 页讲清楚了思想，但生产级实现要解决 checkpoint / overlap / NaN / 容错——这是开源 DeepSpeed 的真正价值

## 延伸阅读

- ZeRO 论文：[Rajbhandari et al. 2020 "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models"](https://arxiv.org/abs/1910.02054)
- ZeRO-Infinity 论文：[Rajbhandari et al. 2021](https://arxiv.org/abs/2104.07857)
- 官方 tutorials：[deepspeed.ai/tutorials](https://www.deepspeed.ai/tutorials/)
- HuggingFace 整合文档：[transformers/deepspeed](https://huggingface.co/docs/transformers/deepspeed)
- [[accelerate]] —— 上层抽象，调用 DeepSpeed 后端
- [[pytorch]] —— DeepSpeed 跑在 PyTorch 之上，算子全是 PyTorch 的

## 关联

- [[pytorch]] —— DeepSpeed 是 PyTorch 之上的训练加速层，所有 tensor 操作走 PyTorch
- [[accelerate]] —— HuggingFace 薄壳，把 DeepSpeed 配置抽象成"选个后端"
- [[torchtune]] —— PyTorch 官方微调库；7B 量级用它，70B 量级转 DeepSpeed
- [[trl]] —— RLHF / DPO 训练库，多卡时底层调 DeepSpeed
- [[pytorch-lightning]] —— 同样解"训练循环抽象"的问题，风格不同；也支持 DeepSpeed 后端
- [[jax]] —— Google 阵营的对照组，用 pjit/xmap 做并行，不需要 ZeRO 这种切法
