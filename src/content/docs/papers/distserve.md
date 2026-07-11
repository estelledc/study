---
title: DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
来源: 'Zhong et al., "DistServe: Disaggregating Prefill and Decoding for Goodput-optimized Large Language Model Serving", OSDI 2024'
日期: 2026-05-31
分类: data-science-ai
难度: 中级
---

## 是什么

DistServe 是一套**把 LLM 推理两个阶段物理拆到不同 GPU 上服务**的系统。

日常类比：一家厨房原本同一台炉子既炒大锅菜（prefill：一次处理几千 token 的 prompt，火力全开）又煎小蛋（decode：一次出一个 token，需要稳定的低延迟）。两件事互相挤——大锅一开，小蛋全凉；小蛋慢慢煎，大锅又点不起火。DistServe 做的事是：**两口炉灶拆到两个屋**，prefill 屋只炒大锅，decode 屋只煎小蛋，菜（KV cache）通过传送带（NVLink / InfiniBand）从 prefill 屋送到 decode 屋。

它的核心观察是：prefill 是 **compute-bound**（瓶颈是算力），decode 是 **memory-bound**（瓶颈是显存带宽），两个阶段对延迟的指标完全不同——prefill 看 **TTFT**（Time-To-First-Token），decode 看 **TPOT**（Time-Per-Output-Token）。把它们捆在一起，就是**永远在用同一套配置救两种病**。

实测：同样的 SLO 达成率下，DistServe 比 vLLM 多服务 **4.48x** 的请求；或者在同流量下把 SLO 收紧 **10.2x**。OPT-13B / 66B / 175B 三档模型都成立。

## 为什么重要

不理解 prefill / decode 拆分，下面这些事都没法解释：

- 为什么 vLLM 把 KV 内存碎片解决了，吞吐却还是被 TTFT SLO 掐住——内存不浪费了，但**调度仍把两阶段挤一起**
- 为什么 2024 年后 Mooncake / NVIDIA Dynamo / DeepSeek 服务栈都长成"一组 prefill 卡 + 一组 decode 卡"——继承的就是 DistServe 范式
- 为什么 prefill batch 和 decode batch 的最佳并行策略**不同**——prefill 适合 TP（吃算力），decode 适合 PP/replica（吃显存带宽）
- 为什么"goodput"（同时满足两个 SLO 的 req/s）才是真指标——裸吞吐高但 TTFT 拉爆，线上等于全废

## 核心要点

DistServe 用三件事把 prefill 和 decode 解耦：

1. **阶段拆分消干扰**：prefill 实例只跑 prefill，decode 实例只跑 decode，没有混批。这样 prefill 大批不再卡 decode（消除 head-of-line blocking），decode 的小步也不再拖慢 prefill 吞吐。

2. **独立资源 / 并行度**：每阶段按自己的 SLO 独立选并行策略。常用三种原语——**TP**（Tensor Parallelism，把一层算子横切到多卡同步算）、**PP**（Pipeline Parallelism，把网络纵切到多卡流水接力）、**replica**（整模型复制多份独立服务）。prefill 实例倾向更高 TP（一次大 prompt 切多卡一起算），decode 实例倾向更多 replica（每条流水都吃显存带宽，复制更划算）。一个模型可能 prefill 用 4 卡 TP、decode 用 2 卡 PP × 多副本。

3. **Placement 算法**：给定模型大小、流量分布、TTFT/TPOT SLO 预算，搜出最优部署方案——同时建模 prefill→decode 之间的 KV cache 搬运成本（受 NVLink / IB 带宽限制）。这是离线一次性算的，不在请求路径上。

KV cache 怎么搬？prefill 算完后，把生成的 KV 张量通过高速互联推到 decode 实例。论文测得搬运耗时比一次 decode 步小一个数量级，所以净增益依然是正的。

## 实践案例

### 案例 1：为什么 prefill 一来 decode 全卡住

假设单卡同时跑 prefill 和 decode：

1. 来一条新请求，prompt 2048 token——prefill 一下要算 2048 个位置的 attention，可能花 200ms
2. 这 200ms 里，所有正在 decode 的请求**全停**——因为 GPU 同一时刻只能跑一个 kernel
3. 用户感受：原本每秒出 50 token，突然 200ms 一个 token 都没出——TPOT 直接爆

DistServe 把 prefill 拆走后，decode 实例不受干扰，TPOT 稳定。

### 案例 2：两个阶段的并行度选择不同

OPT-66B 模型：

- **prefill 实例**：一次进来一个 4096 token 的 prompt，算量巨大 → 选 8 卡 TP（张量并行），把 attention 矩阵切到 8 卡上**一起算**，TTFT 从 800ms 压到 150ms
- **decode 实例**：每步只算 1 个新 token，瓶颈在 KV cache 的读带宽 → 选 2 卡 TP × 4 副本，每副本独立服务一组 batch，**总 throughput 比 8 卡 TP 高**

如果 prefill / decode 共卡，只能选一种配置——要么 prefill 慢，要么 decode 慢。DistServe 让你**两个都最优**。

### 案例 3：goodput 比 throughput 更重要

某场景 SLO：TTFT < 500ms，TPOT < 50ms。

- 系统 A（vLLM）：throughput 100 req/s，但其中只有 60 req/s 同时满足两个 SLO → goodput = 60
- 系统 B（DistServe）：throughput 90 req/s，但 88 req/s 都达 SLO → goodput = 88

线上付费用户感知的是 goodput，不是 throughput。DistServe 的优化目标从一开始就盯 goodput。

### 案例 4：placement 算法在搜什么

输入：模型权重大小、流量分布（请求到达率、prompt 长度直方图、generation 长度直方图）、TTFT/TPOT SLO 预算、机器拓扑（卡数 / NVLink / IB 带宽）。

搜索空间：

- prefill 实例数 × 每实例并行度（TP 几路、PP 几段）
- decode 实例数 × 每实例并行度
- 谁连谁（哪几台 prefill 卡把 KV 推给哪几台 decode 卡）

目标：goodput 最大化，约束是单卡显存 + 互联带宽不超限。

输出一份"部署蓝图"——上线前一次性算，运行时按蓝图布卡。

## 踩过的坑 / 限制

1. **小流量不划算**：至少要两组 GPU，请求少时反而浪费——一组 prefill 卡空着、一组 decode 卡空着。论文建议达到一定 QPS 才上 disaggregation。

2. **互联带宽敏感**：KV 搬运依赖 NVLink（机内）或 InfiniBand（跨机）。如果机房只有 PCIe 或普通以太，搬运成本可能吃掉收益甚至倒挂。

3. **placement 是离线的**：流量分布大变（突发热点 / 长 prompt 浪潮）需要重新搜索方案，DistServe 没做在线自适应。

4. **极短 prompt 收益小**：prefill 本身就只花 10ms，搬一次 KV 也要 5ms，相对开销变大。论文承认对短上下文场景拆分意义有限。

5. **和 chunked prefill 是路线之争**：Sarathi-Serve（同年 OSDI）选了相反方向——把 prefill 切成小 chunk 和 decode 混批，让两阶段在**同卡**下不互相伤害。两条路至今并存，工程选择看流量特征。

6. **不解决推理算法本身**：DistServe 是调度层创新，不改 attention 算子、不改模型权重。如果你的瓶颈在 kernel 层（如 attention 实现慢），DistServe 帮不上忙，需要叠 FlashAttention / xFormers 等算子优化。

## 适用 vs 不适用场景

**适用**：

- 大模型在线服务，有明确双 SLO（TTFT + TPOT），流量稳定且足够大
- 机房有 NVLink / InfiniBand，KV 搬运代价小
- prompt 长度中等以上（>512 token），prefill 本身不是 10ms 级

**不适用**：

- 离线 batch 推理——只看 throughput，不看 TTFT/TPOT，没必要拆
- 流量极小或波动剧烈——两组卡都会有空转
- 极短 prompt（如纯 chat 短问答）——prefill 太快，搬运开销占比变大
- 没高速互联的环境——PCIe 搬 KV 会成新瓶颈
- BERT-style encoder-only——没 decode 阶段，整篇论文不适用

## 历史小故事（可跳过）

- **2022 OSDI Orca**：提出 iteration-level scheduling，让 prefill 和 decode 能在同一 batch 里逐 token 重组，但仍然同卡共跑
- **2023 SOSP vLLM**：用 PagedAttention 把 KV cache 内存碎片解决，但调度层面 prefill/decode 还是混批，干扰仍在
- **2024.01 DistServe arXiv**：北大 + UCSD 团队提出物理拆分，把 vLLM 之后的下一个瓶颈点出
- **2024.04 OSDI 录用**；同期 Microsoft **Splitwise**（ISCA 2024）独立提出非常相近的方案——两支团队互不知情同时收敛，是范式成熟的信号
- **2024.06 Sarathi-Serve**（OSDI 2024）选择相反路径 chunked prefill，路线之争开始
- **2024.10 Mooncake**：Moonshot AI 把 disaggregation 工业化部署，KV pool 抽象进一步演化
- **2025 NVIDIA Dynamo**：把 prefill/decode 拆分做成产品级 serving 框架，DistServe 的设计语言成为行业默认

## 学到什么

1. **同一资源服务不同 SLO，迟早要拆**——prefill 看 TTFT、decode 看 TPOT，捆一起永远在折中。识别出"两件事根本不是同一个优化目标"是设计的起点。
2. **goodput > throughput**：线上服务质量看双 SLO 同时达成率，不是裸吞吐。指标设计错了，所有优化方向都偏。
3. **compute-bound 和 memory-bound 应分开调度**：这是数据库领域 30 年前的经验（OLTP / OLAP 拆库），LLM serving 重新走了一遍。
4. **范式演进的节奏**：内存对了（vLLM）→ 调度也得拆（DistServe）→ KV 池化（Mooncake）→ 产品化（Dynamo）。每一步都在前一步的基础上识别新瓶颈，不要指望一次解决所有问题。

## 延伸阅读

- 论文 PDF：[DistServe (arXiv 2401.09670)](https://arxiv.org/abs/2401.09670)
- 同期方案：[Splitwise (ISCA 2024)](https://arxiv.org/abs/2311.18677) —— 微软独立提出的近似方案
- 路线之争：[Sarathi-Serve (OSDI 2024)](https://arxiv.org/abs/2403.02310) —— chunked prefill 的反方向
- 工业演进：[Mooncake](https://arxiv.org/abs/2407.00079) —— Moonshot AI 把 disaggregation 工业化
- [[vllm]] —— 上一代瓶颈：KV 内存碎片，是 DistServe 的前置工作
- [[attention]] —— prefill 和 decode 都基于 attention，但负载特性截然不同

## 关联

- [[vllm]] —— DistServe 在 vLLM 解决 KV 内存碎片之后，识别出调度层的下一个瓶颈
- [[attention]] —— 两阶段都跑 attention，但 prefill 是 N×N 全计算、decode 是 1×N 单步增量
- [[flash-attention]] —— prefill 阶段的算力优化，与 DistServe 互补（DistServe 拆阶段，FlashAttention 优化单阶段算子）
- [[megatron-lm]] —— TP/PP 并行原语来自训练侧，DistServe 让两阶段独立选最优并行度
- [[volcano-1994]] —— 数据库的 iterator 抽象同样把执行计划和资源解耦，思想血缘相近
- [[lampson-hints]] —— "把不同 workload 隔离到不同资源池" 是 OS 经典经验，DistServe 是教科书示范

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[afd-disagg-moe]] —— AFD Disagg MoE — 把注意力和 FFN 分开摆的 MoE 推理地图
- [[paged-attention]] —— PagedAttention — 把 KV cache 当虚拟内存页来管理
- [[paged-attention-vllm]] —— PagedAttention — 以页替代整段内存的显存管理
- [[rtp-llm-alibaba]] —— RTP-LLM — 把大模型推理服务做成分阶段工厂
