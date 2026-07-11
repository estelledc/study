---
title: RTP-LLM — 把大模型推理服务做成分阶段工厂
来源: 'Boyu Tan et al., "RTP-LLM: High-Performance Alibaba LLM Inference Engine", arXiv 2026'
日期: 2026-05-29
分类: distributed-systems
难度: 中级
---

## 是什么

RTP-LLM 是一套**面向工业级大模型在线推理的服务引擎**：它不只让单个模型跑得快，还要让几十亿到几百亿参数的模型在真实流量里稳定服务上亿用户。

日常类比：普通推理框架像一间万能厨房，切菜、炒菜、装盘都挤在同一张台子上；RTP-LLM 更像大型中央厨房，把备菜、热炒、冷链仓库、调度员拆开，每个岗位按自己的节奏跑，最后仍然把一份菜准时送到用户手里。

这篇论文的重点不是发明新模型，而是回答一个工程问题：当请求长度、模型大小、GPU 类型、缓存命中率都在变时，推理系统怎样把 **TTFT**（Time To First Token，用户等到第一个字出现的时间）、吞吐、显存和上线速度一起管住。

## 为什么重要

不理解 RTP-LLM，下面这些事都很难解释：

- 为什么 [[vllm]] 解决了 KV cache 碎片后，线上服务仍然会被 prefill / decode 互相干扰拖慢
- 为什么大模型上线不是“把权重读进 GPU”这么简单，235B 模型加载从 200 秒降到 33 秒本身就是系统能力
- 为什么相同吞吐下，TTFT P95 能差 4-5 倍，关键常常是调度和 cache 命中，而不是模型更聪明
- 为什么多模态、MoE、长上下文、推测解码不能各做一个孤岛，生产引擎必须把它们放进同一套运行时

## 核心要点

1. **把 prefill 和 decode 拆开**：prefill 像一次性读完整份试卷，计算量大；decode 像逐字写答案，主要卡在读历史 KV cache。**PD-Fusion** 是两阶段仍在同一组机器上协同；**PD-Disaggregation** 是物理拆到不同机器，各自按瓶颈扩容。

2. **把 KV cache 做成分层仓库**：GPU memory、local CPU memory、remote CPU memory、分布式存储按速度分层。类比：热菜放灶台边，半成品放冰箱，冷冻库存放仓库；命中越近，响应越快。

3. **把生产变化纳入调度**：Master 根据队列、worker 负载、cache 命中长度、chat ID 亲和性来决定请求去哪台机器。它不只问“哪台空”，还问“哪台已经有这位用户前缀的 KV”。线上还常盯 **TPOT**（Time Per Output Token，每个后续字要等多久）。

一句话总结：RTP-LLM 的价值在于把“单次推理优化”升级成“集群级推理运营”。

它关心的是一条请求从入口、分词、调度、缓存命中、prefill、decode、回收 cache 到返回结果的完整路径。任何一段慢了，用户看到的都是同一个现象：首 token 慢、后续 token 卡、或者服务成本变高。

## 实践案例

### 案例 1：把一次请求拆成 prefill 和 decode

```python
def serve(prompt):
    kv = prefill_node.run(prompt)      # 一次处理整段输入，偏计算
    for _ in range(max_tokens):
        token, kv = decode_node.step(kv)  # 每次生成一个 token，偏显存带宽
        yield token
```

**逐部分解释**：

- `prefill_node.run` 处理用户输入里的所有 token，产出第一步需要的 KV cache——用户要等这一步结束才看到第一个字，这就是 TTFT
- `decode_node.step` 每轮只处理新 token，但要不断读历史 KV cache
- 两者瓶颈不同，所以 RTP-LLM 可以让 prefill 节点更重吞吐，让 decode 节点更重低延迟

### 案例 2：调度时优先找“已经有缓存”的 worker

```python
def choose_worker(req, workers):
    scores = []
    for w in workers:
        hit = prefix_match(req.blocks, w.cache_keys)
        wait = predict_latency(w.queue)
        scores.append((hit * 0.7 - wait * 0.3, w))
    return max(scores)[1]
```

**逐部分解释**：

- `prefix_match` 估计这条请求有多少前缀 KV 可以复用
- `predict_latency` 估计排队等待，避免为了 cache 命中去一台特别忙的机器
- 论文里的真实实现还会合并本地和远端 cache 命中，并对 chat ID 做亲和性路由

### 案例 3：模型加载时边读边广播

```python
for file in checkpoint_files:
    tensors = read_file_in_order(file)      # 顺序读，照顾云存储预取
    broadcast_async(tensors, tp_group)      # 读下一份时广播上一份
reuse_shared_buffer()
```

**逐部分解释**：

- `read_file_in_order` 从“按模型结构读”改成“按文件顺序读”，减少随机 I/O
- `broadcast_async` 让一个进程读到 tensor 后发给同组 GPU，避免每张卡重复读全部文件
- `reuse_shared_buffer` 避免每个大文件都重新申请 pinned memory，省掉反复分配的开销

## 踩过的坑

1. **只看 tokens/s 会误判系统好坏**：RTP-LLM 在 Qwen3-Coder-480B 上 tokens/s 和基线接近，但 TTFT 快 4.72x-5.33x，原因是线上交互首先怕首 token 慢。
2. **把 PD 拆开不等于一定赚钱**：如果 prompt 很短或互联很慢，搬 KV cache 的成本可能抵消拆分收益，所以需要看流量长度和网络拓扑。
3. **cache 命中不是越远越好**：远端 CPU 或分布式存储能救回计算，但比 GPU / 本地 CPU 慢很多，调度要把命中长度和等待时间一起算。
4. **模型加载不是一次性小事**：生产模型频繁更新，加载慢会拖住灰度、回滚和弹性扩容；RTP-LLM 把加载时间当核心指标是因为线上真的会被它卡住。

## 适用 vs 不适用场景

**适用**：

- 大模型在线推理，既有 TTFT / TPOT SLO，又有高并发和长上下文（论文里长 prompt + 前缀复用收益最大）
- 多业务共用 GPU 集群，需要按请求长度、cache 命中和队列状态动态调度
- MoE、长上下文、多模态、量化模型混合部署，不能只靠单节点优化
- 需要快速加载大模型（如 235B 分钟级上线），支持滚动更新、故障恢复和频繁模型迭代

**不适用**：

- 单机实验或离线小批量评测，直接用 transformers / [[vllm]] 更简单
- 极低流量或 prompt 很短的服务：PD 拆分可能空转，搬 KV 的成本还可能亏本
- 没有高速网络的跨机部署，KV cache 传输可能变成新瓶颈
- 只关心模型算法质量，不需要生产级调度、缓存和运维能力

## 历史小故事（可跳过）

- **2022 年**：[[orca-continuous-batching]] 把 LLM 请求按 iteration 动态组 batch，说明推理服务需要新的调度粒度。
- **2023 年**：[[vllm]] 用 PagedAttention 把 KV cache 管得像虚拟内存，解决显存碎片和共享问题。
- **2024 年**：[[distserve]] 系统化提出 prefill / decode 物理拆分，指出两阶段的 SLO 和资源瓶颈不同。
- **2024 年**：[[sglang-2024]] 从语义前缀复用切入，把共享 prompt 做成 radix tree，说明 cache 不只是内存问题。
- **2026 年**：RTP-LLM 把这些路线组合进一个生产引擎，并用真实业务流量证明它们能一起工作。

## 学到什么

1. **推理系统的核心矛盾是“同一请求里有不同工作负载”**：prefill 吃算力，decode 吃显存带宽，加载吃 I/O，调度吃全局信息。
2. **KV cache 是生产推理的中心资产**：它不是临时中间结果，而是能跨请求、跨 worker、跨层级复用的资源。
3. **工业系统常靠组合取胜**：RTP-LLM 没押单点奇招，而是把加载、调度、cache、量化、推测解码、多模态一起打通。
4. **评测要贴近真实业务**：论文同时用 Qwen3-Coder-480B、DeepSeek-V3、GQA、WikiText-2 和真实线上流量，避免只在一个 benchmark 上赢。

最值得带走的判断标准：如果一个 serving 优化只能解释“单卡 benchmark 变快”，还不能解释“线上 P95 为什么稳定”，那它还没有到 RTP-LLM 这篇论文关心的层级。

## 延伸阅读

- 论文 PDF：[RTP-LLM: High-Performance Alibaba LLM Inference Engine](https://arxiv.org/abs/2605.29639)
- [[vllm]] —— PagedAttention 是 RTP-LLM 继续优化 KV cache 的重要前置知识
- [[distserve]] —— prefill / decode disaggregation 的直接背景，解释为什么要拆阶段
- [[sglang-2024]] —— 从语义前缀复用角度理解 prefix cache 命中为什么值钱
- [[orca-continuous-batching]] —— continuous batching 是现代 LLM serving 调度的源头之一
- [[tensorrt-llm-2023]] —— NVIDIA 的内核和服务栈路线，可和 RTP-LLM 的系统路线对比

## 关联

- [[vllm]] —— 解决 KV cache 分页和共享，是 RTP-LLM 对比的核心 baseline
- [[distserve]] —— 同样强调 prefill / decode 拆分，RTP-LLM 把它放进生产集群调度
- [[sglang-2024]] —— 两者都重视前缀复用，只是 SGLang 更偏语义树，RTP-LLM 更偏集群调度
- [[orca-continuous-batching]] —— RTP-LLM 的动态 batching 思路继承了 iteration-level scheduling 的方向
- [[flash-attention]] —— 优化 attention I/O，是 prefill 阶段常见的底层算子背景
- [[eagle]] —— 推测解码家族代表，帮助理解 RTP-LLM 的多算法 speculative sampling 模块
- [[tensorrt-llm-2023]] —— 另一条工业推理路线，更靠近 NVIDIA kernel 与部署生态

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
