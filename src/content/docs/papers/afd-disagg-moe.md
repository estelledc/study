---
title: AFD Disagg MoE — 把注意力和 FFN 分开摆的 MoE 推理地图
来源: 'Hanjiang Wu et al., "How Far Can Disaggregation Go? A Design-Space Exploration of Attention-FFN Disaggregation for Efficient MoE LLM Serving", arXiv 2026'
日期: 2026-05-27
分类: distributed-systems
难度: 中级
---

## 是什么

AFD（Attention-FFN Disaggregation）是一种把 MoE 大模型推理里的**注意力计算**和**FFN 专家计算**拆到不同 GPU 组上运行的方法。

日常类比：像一家餐厅把前台点单和后厨炒菜分开排班。前台需要快读菜单、记住客人上下文；后厨需要猛火力、并行炒很多锅。两边如果都按同一个班表排，就会有人闲着、有人排队。

在 MoE LLM 里，注意力更像前台：它常被 KV cache 和内存带宽卡住。FFN 专家更像后厨：它主要做大矩阵乘法，更吃算力。

这篇论文问的不是“AFD 一定更快吗”，而是“拆到多细才值得”：chunked prefill、prefill/decode disaggregation、attention/FFN disaggregation 分别在什么 workload、什么模型、什么网络拓扑下划算。

论文给出的结论很务实：AFD 经常不是最高吞吐的冠军，但在严格 TTFT/TPOT 延迟目标下，它能把很多原本不可行的 MoE serving 配置变成可行。

## 为什么重要

不理解这篇，下面这些事会很难解释：

- 为什么同样 128 张 B200，某些长上下文任务用普通部署会直接违反 SLO，而 AFD 能跑到约 4k tokens/s。
- 为什么“把模型拆开”有时更快，有时反而输给很多完整副本并行跑。
- 为什么 DeepSeek-V3.2 这种 MLA + sparse attention 模型可以只给 attention 很少 GPU，却把大多数 GPU 留给 FFN。
- 为什么机架内 NVLink、机架间 InfiniBand 的摆放顺序，会直接影响 LLM serving 的延迟。

## 核心要点

1. **拆分是为了匹配瓶颈**。类比：前台忙就多配前台，后厨忙就多配厨师；AFD 让 attention GPU 和 FFN GPU 的数量可以独立调，而不是所有 GPU 都干同一整块模型。

2. **通信不是免费午餐**。类比：餐厅分工后，传菜路线变多了；AFD 每层都要把 token 从 attention 发到 FFN，再把结果发回来，所以网络拓扑和拥塞模型必须一起算。

3. **最优答案随 workload 变**。类比：午市快餐、晚宴、外卖高峰不是一套排班；chat、coding、agentic coding 的 prefix、输入长度、输出长度不同，最优 attention/FFN 比例也不同。

## 实践案例

### 案例 1：先把业务请求变成调度输入

```yaml
workload:
  use_case: agentic-coding
  prefix_tokens: 524000
  input_tokens: 256
  output_tokens: 8192
  slo:
    ttft_ms: 150
    tpot_ms: 15
```

**逐部分解释**：

- `prefix_tokens` 是已经复用的上下文，越大越压 KV cache。
- `input_tokens` 和 `output_tokens` 决定 prefill 与 decode 哪边更忙。
- `ttft_ms` 是用户等第一个 token 的时间，`tpot_ms` 是后续 token 的节奏。
- AIC++ 把这些输入和模型结构、GPU 数量一起喂给 design-space search。

### 案例 2：用“产能对齐”理解 attention/FFN GPU 比例

```python
def choose_split(attn_cost, ffn_cost, total_gpus):
    attn_share = attn_cost / (attn_cost + ffn_cost)
    attn_gpus = max(1, round(total_gpus * attn_share))
    ffn_gpus = total_gpus - attn_gpus
    return attn_gpus, ffn_gpus
```

**逐部分解释**：

- 这不是论文的完整算法，只是帮助初学者理解“rate matching”。
- `attn_cost` 越高，attention 需要越多 GPU，不然 FFN 会等它。
- `ffn_cost` 越高，GPU 就应该更多给专家 FFN，不然 attention 侧会空转。
- DeepSeek-V3.2 的 MLA + sparse attention 很省 attention，所以论文里能出现 `2A+126F` 这种极端比例。

### 案例 3：把最频繁的通信放在最快的路上

```text
per_layer_path: attention_gpu -> ffn_gpu -> attention_gpu
once_per_request_path: prefill_gpu -> decode_gpu

placement_policy:
  per_layer_path: same_node_nvlink
  once_per_request_path: cross_node_infiniband
```

**逐部分解释**：

- AFD 每一层都有 attention 到 FFN、FFN 回 attention 的传输。
- P/D disaggregation 的 KV cache 传输通常每个请求发生一次。
- 所以论文建议把高频的 AFD 通信尽量放在节点内 NVLink 上。
- 附录里的 2P2D 示例显示，同节点配对能利用约 450 GB/s NVLink，而跨节点 InfiniBand 约 25 GB/s，差距约 18 倍。

## 踩过的坑

1. **以为 AFD 永远提升吞吐**：错在只看单个请求，忽略完整副本的数据并行并发能力。

2. **只按 GPU 数量平均切 attention 和 FFN**：错在 attention 可能是内存瓶颈，FFN 可能是算力瓶颈，平均切会让一边闲置。

3. **忽略 prefix 和 KV cache**：错在长上下文下，能不能把 KV cache 放进显存本身就会决定配置是否可行。

4. **把网络当成无限快**：错在 AFD 每层都多出 dispatch/combine，通信拥塞会吞掉算力收益。

## 适用 vs 不适用场景

**适用**：

- MoE 模型里 attention 与 FFN 的资源需求差异明显，比如 MLA、GQA、Mamba 混合结构。
- 延迟 SLO 很紧，普通 aggregated 或 P/D disagg 找不到可行配置。
- 长上下文、长 prefix、KV cache 压力大，需要把权重、激活、KV cache 分开放。
- 机架内有高速互连，可以把高频 attention-FFN 通信放在近距离链路上。

**不适用**：

- 目标只是最高系统吞吐，且很多完整副本已经能稳定吃满请求。
- 模型 attention 与 FFN 成本接近，拆开后调度空间变大但收益很小。
- 网络很弱或拓扑不可控，跨 GPU 通信比计算本身还贵。
- 团队没有可靠的 kernel measurement 和 network simulation，只凭直觉调参。

## 历史小故事（可跳过）

- **2022 年**：Orca 等系统把 continuous batching 做成 LLM serving 的核心能力，让多请求混跑更高效。
- **2023 年**：Sarathi 用 chunked prefill 把 prefill 拆小，让 decode 可以插进来，减少互相阻塞。
- **2023 年**：Splitwise / DistServe 把 prefill 和 decode 分到不同 worker，形成 phase-level disaggregation。
- **2025 年**：MegaScale-Infer 等工作强调 MoE 内部 attention 与 expert FFN 的异构性，推动 operator-level 拆分。
- **2026 年**：这篇论文把 AFD、P/D、并行策略、网络拓扑放进同一个搜索框架，系统回答“拆到哪里值得”。

## 学到什么

1. **Serving 优化不是单点技巧，而是资源匹配问题**：算力、显存、带宽、SLO 要一起看。

2. **AFD 的关键收益在低延迟可行性**：它能让某些严格 TTFT/TPOT 场景从“无解”变成“可调”。

3. **最优 attention/FFN 比例由模型和 workload 共同决定**：MLA + sparse attention、dense GQA、Mamba 混合结构会导向不同切法。

4. **拓扑是算法的一部分**：把每层都会发生的通信放在 NVLink，比事后补网络带宽更有效。

## 延伸阅读

- 论文 PDF：[How Far Can Disaggregation Go?](https://arxiv.org/pdf/2605.28302v1.pdf)（本文原文，重点看 Figure 2、Figure 5、Figure 6）
- [[distserve]] —— prefill/decode disaggregation 的代表工作，先理解 phase-level 拆分。
- [[sarathi-serve]] —— chunked prefill 的代表工作，解释为什么 prefill 可以切块。
- [[vllm]] —— 论文原型基于 vLLM AFD 路径验证通信模式。
- [[mixture-of-experts]] —— MoE 专家层为什么让 FFN 侧成本和通信变复杂。
- [[blackwell-architecture-2024]] —— B200/NVLink 背后的硬件背景，帮助理解机架级 serving。

## 关联

- [[distserve]] —— 这篇的 P/D disaggregation baseline。
- [[sarathi-serve]] —— 这篇的 chunked prefill baseline。
- [[orca-continuous-batching]] —— serving 系统为什么要把请求连续拼批。
- [[vllm]] —— AFD 原型和 PagedAttention serving 生态相关。
- [[mixture-of-experts]] —— AFD 主要解决 MoE attention 与 expert FFN 的异构资源问题。
- [[attention]] —— attention 侧为什么会被 KV cache 和内存带宽限制。
- [[blackwell-architecture-2024]] —— 128×B200、NVLink、机架拓扑是实验语境的一部分。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
