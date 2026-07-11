---
title: 'Colossal-AI — 大模型训练系统'
来源: 'https://github.com/hpcaitech/ColossalAI'
日期: '2026-05-30'
分类: '数据科学与 AI'
难度: '高级'
---

## 是什么

Colossal-AI 是 HPC-AI Tech（创始人尤洋，新加坡国立 / 伯克利背景）2022 年开源的**大模型训练系统**。目标和 [[deepspeed]] 类似——把单卡装不下的模型拆到多张卡上训——但路子不同：DeepSpeed 主打 ZeRO + Pipeline，Colossal-AI 把**多维张量并行 + 异构内存**做成了招牌。日常类比：像家具搬运分工——DeepSpeed 是"把每件家具切片，每张卡拿一片"，Colossal-AI 是"沙发横切纵切都试，再把扛不动的暂时搬去隔壁邻居家（CPU / NVMe）"。

最小启动：

```bash
colossalai run --nproc_per_node 4 train.py --config config.py
```

`config.py` 里挂一个 `plugin = GeminiPlugin()`，原本 4 张卡也装不下的 13B 模型就能训起来——这是 Colossal-AI 招牌技术 **Gemini**。

## 为什么重要

不理解 Colossal-AI，下面这些事都没法解释：

- 为什么国内大模型团队的公开项目里能看到 Colossal-AI 的影子——它是华人社区影响最大的开源训练系统
- 为什么"3D 并行"在它这里更细：除了 Megatron-LM 的 1D 张量并行，还有 2D / 2.5D / 3D 切法，针对不同集群拓扑
- 为什么 Gemini 不是 ZeRO-3 的换名——它做了 chunk-based 内存管理 + 异构（GPU / CPU / NVMe）自动调度，hot / warm / cold 分层
- 为什么 Colossal-Chat 在 LLaMA 开源一周内就复现了完整 RLHF 三阶段——端到端训练 + 推理工具是 Colossal-AI 的差异化

## 核心要点

记 **Gemini + 多维张量并行 + Booster** 三件事：

1. **Gemini 异构内存**：把模型参数 / 梯度 / 优化器状态切成 chunk（默认 32MB 一块），运行时按 hot / warm / cold 状态在 **GPU 显存 ↔ CPU 内存 ↔ NVMe SSD** 三级里换。和 ZeRO-3 + Offload 的区别：chunk 粒度更小、调度 placement-aware（看哪张卡空就放哪），单卡可训百亿参数。

2. **多维张量并行（1D / 2D / 2.5D / 3D）**：[[megatron-lm]] 的张量并行是 1D（沿一个维度切），通信量随 N 线性增长。Colossal-AI 实现 2D（Optimus）/ 2.5D / 3D（基于 SUMMA / SCAN 算法），通信量降到 √N 或 ³√N，集群越大优势越明显。代价：实现复杂、需要拓扑匹配（典型 16 / 64 张卡）。

3. **Booster API + Plugin**：上层用户不直接调 ZeRO / TP / PP，而是 `booster.boost(model, optimizer)`，背后挂 plugin（`GeminiPlugin` / `HybridParallelPlugin` / `TorchDDPPlugin`）。这层抽象类似 [[accelerate]] 之于 [[deepspeed]]，但**官方原生而非外挂**。

合起来一句话：**Colossal-AI 把多维并行 + 异构内存 + 用户友好 API 揉成同一栈**，定位是"开源社区版的 Megatron-DeepSpeed"。

## 实践案例

### 案例 1：Gemini 训 13B 模型

```python
from colossalai.booster import Booster
from colossalai.booster.plugin import GeminiPlugin

plugin = GeminiPlugin(placement_policy='auto', precision='bf16')
booster = Booster(plugin=plugin)
model, optimizer, _, _, _ = booster.boost(model, optimizer)

for batch in loader:
    loss = model(batch)
    booster.backward(loss, optimizer)
    optimizer.step()
```

`placement_policy='auto'` 让 Gemini 自己判断每个 chunk 该放 GPU 还是 CPU，4 张 24GB 显卡训 13B 模型也能塞下。

### 案例 2：HybridParallel 四种并行叠加

```python
plugin = HybridParallelPlugin(
    tp_size=2, pp_size=4, zero_stage=1,
    enable_sequence_parallelism=True,
)
```

读法：tensor parallel 切 2 路 + pipeline parallel 切 4 段 + ZeRO-1 切优化器状态 + 序列并行（长上下文用）。32 张卡训 70B 时这种四维组合比纯 ZeRO-3 通信量小得多——和 [[deepspeed]] + [[megatron-lm]] 合体方案对标。

### 案例 3：Colossal-Chat 复现 RLHF 三阶段

```bash
torchrun --nproc_per_node=8 train_sft.py     # SFT 监督微调
torchrun --nproc_per_node=8 train_reward.py  # 奖励模型
torchrun --nproc_per_node=8 train_rl.py      # PPO 强化学习
```

LLaMA 开源后一周内 Colossal-AI 给出 SFT + RM + PPO 完整训练脚本，单机 8 卡 A100 跑通 7B。和 HuggingFace `trl` 同期但更端到端，工具链不用拼装。

### 案例 4：从 [[pytorch-lightning]] 迁移

如果你已经在用 [[pytorch-lightning]]，迁移到 Colossal-AI 时不用重写训练循环——把 `Trainer(strategy='colossalai', ...)` 一句话替换 strategy 即可。代价是 Lightning 的回调系统在 Booster 下部分钩子失效，logging 要自己接。这种"上层 API + 下层引擎可换"的解耦，是当前大模型 infra 的典型设计——和 [[accelerate]] 调 [[deepspeed]] 同思路。

## 踩过的坑

1. **2D / 3D 张量并行需要拓扑匹配**：`tp_size` 必须能开方（2D）或开三次方（3D）。8 卡可以 1D（tp=8）但不能 2D，16 卡可以 2D（4×4），64 卡可以 3D（4×4×4）。配错直接 assert。

2. **Gemini 的 chunk_size 反直觉**：默认 32MB 不一定最优。模型大时调到 128MB 通信开销小，碎片严重时调到 8MB 调度更灵活。需要结合 `gemini_search` 工具试参数。

3. **Booster 不兼容部分 PyTorch 钩子**：`register_forward_hook` / `register_full_backward_hook` 在 Gemini 下被重写过。第三方库装钩子做 logging 会发现钩子根本没触发，调试时容易归错锅。

4. **CPU offload 和 NVMe offload 要看磁盘 IOPS**：消费级 SSD 跑 NVMe offload 性能崩盘；生产环境必须 NVMe + PCIe 4.0。否则一个 step 卡 30 秒，GPU 利用率掉到个位数。

5. **与 [[pytorch]] / CUDA 版本绑定紧**：`colossalai` 安装时编译多个 CUDA kernel（fused adamw / ChunkOps），版本不匹配直接 `undefined symbol` 起不来。建议用官方 docker 镜像或 conda 锁版本。

6. **placement_policy='auto' 不一定最优**：自动调度策略偶尔判断失误，把 hot chunk 放到 CPU。生产训练前用 `static` 策略加上手工 placement 跑一遍 profile，再决定要不要回到 auto。

## 适用 vs 不适用场景

**适用**：

- 中文社区项目（文档双语、社区中文 issue 响应快）
- 需要 2D / 2.5D / 3D 张量并行的超大集群（≥ 64 卡）
- 想训 LLM + RLHF 又不想拼 [[deepspeed]] / Megatron-LM / `trl` 多套栈
- 单机多卡 + 异构内存场景（消费级 RTX 4090 训 13B）

**不适用**：

- 7B 以下模型，单卡能跑 → 直接 [[pytorch]] DDP / [[accelerate]] 更轻
- 已经深度绑定 HuggingFace 生态 → [[accelerate]] + [[deepspeed]] 路径更顺
- JAX / TPU 用户 → Colossal-AI 不支持 JAX / TPU
- 推理生产部署 → 用 vLLM / TensorRT-LLM，不要用 Colossal-AI 推理子模块

## 历史小故事（可跳过）

- **2021 年**：尤洋（伯克利博士、LARS / LAMB 优化器作者）从 NUS 教职出来创办 HPC-AI Tech
- **2022 年 1 月**：Colossal-AI 第一版开源，主打多维并行（1D / 2D / 2.5D / 3D 张量并行系列论文背景）
- **2022 年下半年**：发布 Gemini 异构内存系统，对标 ZeRO-Infinity
- **2023 年 3 月**：LLaMA 开源后一周内 Colossal-Chat 给出完整 RLHF 复现，社区影响力爆发
- **2023-2024 年**：被国内大量大模型团队用作训练底座；GitHub 星标突破 39k
- **2024+**：和 vLLM / SGLang 推理栈整合，转向"训练 + 推理 + 部署"一体化

## 学到什么

1. **同一个问题有多条路**：大模型训不动，DeepSpeed 选 ZeRO + offload，Megatron 选 TP + PP，Colossal-AI 选多维 TP + Gemini；路线之争背后是工程权衡（通信量 vs 实现复杂度 vs 拓扑约束）
2. **多维张量并行的数学美**：1D 通信 O(N)、2D O(√N)、3D O(³√N)，理论早就有，工程化才是难点
3. **异构内存不止"卸到 CPU"**——chunk 粒度 + placement 策略 + hot/warm/cold 分层才是 Gemini 比 ZeRO-Offload 多出来的工程量
4. **开源社区的本土化机会**：DeepSpeed / Megatron 由微软 / 英伟达主导，Colossal-AI 用快速迭代 + 中文文档 + 端到端 RLHF 抓住了中文社区窗口
5. **学习路径**：先理解 [[pytorch]] DDP（数据并行最朴素形态），再读 ZeRO 论文（看显存怎么切），再看 Megatron-LM 1D 张量并行（看矩阵怎么切），最后才碰 Colossal-AI 的 2D / 3D。跳过基础直接读多维并行会一脸懵

## 延伸阅读

- 论文：[Bian et al. 2021 "Colossal-AI: A Unified Deep Learning System For Large-Scale Parallel Training"](https://arxiv.org/abs/2110.14883)
- Gemini / Elixir 论文：[Fang et al. 2022](https://arxiv.org/abs/2202.05924)
- 官方文档：[colossalai.org](https://colossalai.org/)
- 2D 张量并行 Optimus：[Xu et al. 2021](https://arxiv.org/abs/2104.05343)
- [[deepspeed]] —— 微软同类系统，对照学习
- [[megatron-lm]] —— NVIDIA 1D 张量并行起源

## 关联

- [[pytorch]] —— Colossal-AI 在 PyTorch 之上，所有 tensor 算子走 PyTorch
- [[deepspeed]] —— 同类系统，ZeRO + offload 路线；Colossal-AI Gemini 是其异构内存对照
- [[megatron-lm]] —— 1D 张量并行起源，Colossal-AI 把它扩展到 2D / 2.5D / 3D
- [[accelerate]] —— HuggingFace 上层抽象，与 Colossal-AI Booster 思路对应
- [[pytorch-lightning]] —— 训练循环抽象，与 Colossal-AI 高层 API 风格类似
- [[jax]] —— Google 阵营的对照组，pjit/xmap 走另一条路，不需要 ZeRO / Gemini 这种内存切分

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[open-sora]] —— Open-Sora — 把 Sora 路线开源对标的视频生成项目
