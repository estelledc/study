---
title: Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复
来源: Agrawal et al., "Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve", OSDI 2024
日期: 2026-05-31
分类: 大模型服务
难度: 中级
---

## 是什么

Sarathi-Serve 是一套**让大模型推理服务在高吞吐和低延迟之间不再二选一**的调度方法。日常类比：餐厅里来了一桌新客人点菜（要花 5 分钟备餐），同时已经在吃的客人需要不断上下一道菜——传统做法是"先把新客人的备餐做完再继续上菜"，结果在吃的人全卡住等。Sarathi-Serve 的做法是"把新客人的备餐切成 5 份，每份只占 1 分钟，穿插着上菜"，所有人体验都顺。

技术上的两个关键词：

- **chunked prefill**（切块预填充）：把长 prompt 的处理切成等大小的小块
- **stall-free batching**（无卡顿批处理）：每个 GPU 前向都同时携带一块预填充和所有正在生成的回复

## 为什么重要

不理解这篇论文，下面这些事都说不清：

- 为什么 2024 年起 vLLM 对长上下文逐步默认开 `enable_chunked_prefill`
- 为什么 ChatGPT 即使后台来了个 8K 长 prompt，你这边的字仍然一个个稳定吐出来
- 为什么"throughput 高"和"TBT（每 token 间隔）低"过去被当成矛盾，现在不再是
- 为什么 SLO 优化论文从 2024 年开始几乎都把 Sarathi-Serve 当 baseline

## 核心要点

LLM 推理有**两个性质完全相反的阶段**：

1. **prefill（预填充）**：处理你输入的整段 prompt，一次性算出所有位置的 key-value cache。**计算密集**——GPU 算力打满，batch 多大都没用。
2. **decode（解码）**：根据已有 KV cache 一次生成一个 token。**显存带宽密集**——计算量很小，瓶颈在反复读 KV cache，batch 越大越省。

Orca / 早期 vLLM 的做法是**iteration-level scheduling**：每个 GPU 前向只做"一组 prefill"或"一组 decode"，两者轮流。问题是 prefill 一旦上场，所有 decode 用户就等着——长 prompt 来了卡几百毫秒，用户感知就是卡顿。

Sarathi-Serve 三步解决：

1. **切块**：长 prefill 切成固定 chunk（比如 512 token 一块）
2. **混搭**：每个前向 = 1 个 prefill chunk + 所有进行中的 decode
3. **调 chunk 大小**：让"1 chunk + N decodes"的耗时刚好等于"纯 decode 一轮"的耗时——decode 用户察觉不到

## 实践案例

### 案例 1：vLLM 里你能直接看到这个开关

```python
from vllm import LLM
llm = LLM(
    model="meta-llama/Llama-2-7b-hf",
    enable_chunked_prefill=True,  # 长上下文 / V1 起常默认开
    max_num_batched_tokens=2048,  # token budget ≈ chunk 上限
)
```

`max_num_batched_tokens` 就是论文里调的 chunk 边界。你把它从 4096 调到 512，会观察到：吞吐稍降，但**P99 TBT 显著变平**。

### 案例 2：为什么不"全 prefill 一起做"

朴素想法：把多个用户的 prefill 攒成大 batch 一起算，吞吐应该高吧？

错。prefill 已经把 GPU 算力打满，batch=2 和 batch=1 在 prefill 阶段几乎一样快。"攒 batch"对 prefill 几乎无收益，但对正在 decode 的人**100% 是停顿**。这就是 Sarathi 切块而不是攒批的核心理由。

### 案例 3：chunk 大小怎么定

论文给了一个简单公式：

- 测出"纯 decode batch=N 的耗时"= T_decode
- 测出"prefill chunk size=C 的耗时" + "decode batch=N 的耗时" = T_total
- 调 C 让 T_total ≈ T_decode（差的部分被算力空闲填满，不影响 decode）

实际部署用 profiling 表查，不是每次现算。

### 案例 4：用户视角能感知的差别

- **关掉 chunked prefill**：你正在让模型写一段长代码，突然另一个用户提交了一份 16K token 的长文档让总结，你这边的字流停 800ms 才继续
- **打开 chunked prefill**：同样情况下，你这边的字流间隔从平均 30ms 微微抖到 50ms，几乎察觉不到——长文档被切成了 16 块，每块只占一个 forward 的余量

工程师看监控的差别：**P99 TBT 从 1500ms 降到 80ms**，吞吐反而上涨，因为不用为追求 TBT 而留 GPU 闲置。

## 踩过的坑

1. **chunk 切太小，attention 开销爆炸**：每个 chunk 都要重新读一遍前面所有 token 的 KV，chunk 越小重复越多。论文里 Yi-34B 上 chunk=128 比 chunk=512 慢 30%。

2. **chunk 切太大，又回到老问题**：如果 1 chunk 的耗时 > 1 decode 轮的耗时，decode 还是会感知到卡顿。SLO 越严，chunk 必须越小。

3. **纯 prefill 或纯 decode 工作负载用不上**：如果你的服务只跑离线 batch（全 prefill）或只跑短 prompt 长生成（decode 占绝大多数），Sarathi 增益接近零。

4. **混合 attention kernel 要支持 mixed batch**：一个 kernel 同时处理 "prefill 那部分要算 self-attention" + "decode 那部分要拿历史 KV"——FlashAttention 2.5+ / xFormers 才完整支持。

5. **GPU 型号差异巨大**：A100 / H100 上算力 / 显存比例不同，最优 chunk size 也不同。换卡了必须重新 profile，不能复用别家给的配置。

## 适用 vs 不适用场景

**适用**：

- 在线对话服务（ChatGPT 类）——prompt 长度差异大、要求流畅吐字
- 多用户并发、TBT SLO < 100ms 的场景
- prefill / decode 比例混合的工作负载

**不适用**：

- 离线批处理（数据集打 embedding 之类）——只追求吞吐，不在意 TBT
- 非常短 prompt（< 一个 chunk size）——切不切都一样
- 模型小到 prefill 比 decode 还便宜的场景（罕见）

## 数字直觉（小段算术）

论文测的是 Mistral-7B / Yi-34B 等（不是随便编的 13B 毫秒表）。核心算术强度直觉：

- decode batch 访存等权重时，GPU 算力大量闲置
- 往同一 forward 塞进一小块 prefill（token budget 如 512），两者瓶颈互补
- 结果：decode 用户几乎不感知卡顿，却多干了一份 prefill——**几乎免费塞进去**

所谓 stall-free，本质是**用 decode 的访存等待时间偷偷做 prefill 的算力**。论文报告：Mistral-7B 单卡 A100 上，相对 vLLM 最高约 **2.6× serving capacity**（严格 TBT SLO 下）。

## 历史小故事（可跳过）

- **2022 年**：Orca（OSDI 2022）提出 iteration-level scheduling，是连续 batch 化的鼻祖，但 prefill / decode 分轮跑。
- **2023 年**：vLLM（SOSP 2023）用 PagedAttention 解决 KV cache 内存碎片，调度仍沿用 Orca 模式，长 prompt 仍卡顿。
- **2024 年**：Sarathi-Serve 上 OSDI；同年 7 月起 vLLM 对 >32K 上下文默认开 chunked prefill，V1 调度里几乎总开。
- **2024-2025**：DistServe / Splitwise 走另一条路（prefill 和 decode 分到不同 GPU）；Sarathi 更适合**单 GPU 内**优化，两条路并存。

## 学到什么

1. **两阶段瓶颈不一样，就别用同一个调度策略**——prefill 算力瓶颈、decode 显存瓶颈，是 LLM 推理调度的第一性原理
2. **切块 + 混搭** 比 "等大 batch 攒齐" 更适合"成员计算特性差异大"的工作负载
3. **延迟 SLO 是约束、吞吐是目标**——先满足 TBT 再最大化 throughput，论文整套设计都是这个顺序
4. **理论 → 默认配置很快**：OSDI 同年起 vLLM 逐步默认 chunked prefill，工程化落地极快
5. **不堆硬件也能涨约 2.6× 服务容量**（论文：Mistral-7B / A100 vs vLLM）——纯调度优化最值得学
6. **找闲置资源就是优化**：decode 访存等待时算力闲置，Sarathi 把这块"暗物质"利用起来

## 延伸阅读

- 论文 PDF：[OSDI 2024 Sarathi-Serve](https://www.usenix.org/conference/osdi24/presentation/agrawal)
- vLLM 文档里的 chunked prefill 开关：[vLLM Performance Guide](https://docs.vllm.ai/en/latest/models/performance.html)
- 对照另一条路线：DistServe（OSDI 2024）—— prefill / decode 跨 GPU 拆分
- [[vllm]] —— PagedAttention 的母系统，Sarathi-Serve 在其上做调度优化
- [[attention]] —— prefill / decode 的计算差异源于 attention 在两阶段访问模式不同

## 关联

- [[vllm]] —— Sarathi-Serve 的最知名宿主，2024 年起作为默认调度器
- [[attention]] —— prefill 算的是 self-attention 全量，decode 只对最新 token 查 KV cache，是切块策略的物理基础
- [[flash-attention]] —— 支持 prefill+decode 混合 batch 的 kernel 实现
- [[transformer]] —— 整个推理计算图的来源，prefill / decode 划分由其自回归性质决定
- [[paged-attention]] —— vLLM 的 KV cache 内存管理，与 Sarathi 调度正交但常一起用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[attention]] —— Attention Is All You Need
- [[flash-attention]] —— FlashAttention — 不改算法，只改数据怎么进 GPU
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

