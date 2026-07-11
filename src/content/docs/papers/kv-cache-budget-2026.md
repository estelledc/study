---
title: KVBudget — 给每条请求划一块 KV cache 预算
来源: 'Systems topic: per-request KV cache budgeting in vLLM-style serving; cf. Kwon et al., PagedAttention, SOSP 2023; Feng et al., Ada-KV, arXiv:2407.11550'
日期: 2026-07-08
分类: 机器学习
难度: 中级
---

## 是什么

**KVBudget（per-request KV cache budgeting）** 说的是：在 vLLM 这类 LLM 推理服务里，**每条请求进场前先算清它大概要占多少 KV cache，再决定收不收、收多少**。

日常类比：停车场不是来一辆车就随便塞——先看这辆车要几个车位、场里还剩多少，不够就排队或拒收，而不是让车开进去再卡死整条车道。

大模型生成时，每个已生成 token 都要在 GPU 上留一份 Key/Value（合称 **KV cache**）。请求越长、并发越多，这块显存就越紧。vLLM 用 **PagedAttention** 把 KV 切成固定大小的 block（像操作系统分页）；**预算**则是调度器在 admission 时问的那句："这条请求最多需要几个 block？"

说明：原笔记把来源写成 arXiv:2605.30821，但该条目实际是图谱 spectral inducibility，与本题无关。本篇按题名主题，结合 vLLM 系 serving 与自适应预算分配研究来写。

## 为什么重要

不理解 per-request KV 预算，下面这些事会反复踩坑：

- 为什么 GPU 显存还没满，服务却开始排队或抢占——**逻辑预算**和**物理占用**不是一回事
- 为什么把 `max_model_len` 开很大，并发立刻掉——每条请求的 admission 预算按最坏长度预留
- 为什么 Sliding Window / 混合注意力模型特别容易"假饿死"——按全长预算会**过度预留**
- 为什么只调 `gpu_memory_utilization` 不够——那是**整池子大小**，不是单请求怎么切蛋糕

## 核心要点

1. **先有池子，再有预算**。类比：先划好停车场总车位（`gpu_memory_utilization` 或 `kv_cache_memory_bytes`），再给每辆车发临时车位票。池子通常在引擎启动时预分配；运行中主要变的是占用，不是反复 malloc。

2. **admission 按请求算 block 数**。调度器看 prompt 长度、还要生成多少、`block_size`，算出需要的 `num_blocks`；池子不够就等待或抢占。类比：订座时按"最多几人"留桌，而不是客人到了再拼桌。

3. **预算可以分层，不必均匀**。研究侧（如 Ada-KV）发现不同 attention head 对 cache 的需求差很多，均匀压缩预算会伤质量；serving 侧则要区分"全注意力层随序列长增长"和"滑动窗口层稳态只需窗口大小"。类比：有的柜台只要小抽屉，却按大保险柜预留——浪费的是并发。

4. **预算 ≠ 永久占用**。前缀缓存命中、抢占重算、窗口回收，都会让**实际持有**低于当初 admission 数字；但若 admission 口径和回收口径不一致，会出现死锁或中途 OOM。

一句话串起来：**总池定容量 → 每请求算峰值 block → 调度按预算收流 → 运行中再回收/共享**。缺任何一环，都会表现为"看着还有显存，却服务不了更多人"。

## 实践案例

### 案例 1：用池子大小估算并发上限

```text
KV_tokens ≈ (GPU显存 × util - 模型权重等固定开销) / 每token的KV字节
并发上限粗算 ≈ KV_tokens / 每请求平均(prompt + output)
```

**逐部分解释**：

- ① 先量出 KV 池大概能装多少 token（这是总预算）
- ② 再除以单请求平均长度，得到"同时能养几条请求"
- ③ 若目标 QPS 需要的并发高于这个数，就要减长度、加卡，或上压缩/驱逐——而不是只把 batch 调大

### 案例 2：admission 时少预留（滑动窗口）

```text
# 错误：对每一层都按全长预留
blocks = ceil(seq_len / block_size)

# 更贴 SWA 层稳态的预留
blocks ≈ ceil((sliding_window + chunk_size) / block_size)
```

**逐部分解释**：

- 全注意力层仍可能随长度涨，按 `seq_len` 预留合理
- SWA 层稳态只需窗口附近的 KV；再额外留一个 prefill chunk 的余量即可
- 若对每层都按全长要 block，会把池子订满、真实占用却半空——并发被**假预算**掐死

### 案例 3：区分"池子打满"和"预算打满"

```bash
# 概念检查清单（vLLM 风格 serving）
# 1) 引擎 init 后，KV 池大小是否符合预期
# 2) 长请求进场时，free blocks 是否骤降
# 3) 不够时是排队 / preempt+recompute，还是显存曲线继续爬升
```

**逐部分解释**：

- ① 池子大小在 init 基本定死（util / 显式字节数）
- ② 新请求 admission 会扣逻辑预算（block 数）
- ③ 若显存曲线平坦却大量 preempt，瓶颈在**预算与调度**；若显存仍在涨，才更像泄漏或池外分配

也可以把同一检查写成值班口令：先看 free blocks，再看 waiting / preempt 计数，最后才怀疑"是不是 GPU 坏了"。

## 踩过的坑

1. **把池子利用率当唯一旋钮**：把 `gpu_memory_utilization` 调高只加大总池，不修正"按全长乱预留"。
2. **按 `max_model_len` 给每条请求留满**：短问答也被按最长上下文订座，并发立刻崩。
3. **忽略前缀缓存**：共享前缀已占 block，再按全额预算会双重计数或误判空闲。
4. **admission 口径与回收口径漂移**：窗口层已回收 block，admission 仍按旧峰值——容易饿死或中途 OOM。
5. **把研究里的"压缩预算"直接当 serving admission**：Ada-KV 一类谈的是驱逐时每个 head 留多少 token；serving admission 谈的是进场时预留多少 block——相关但不是同一个旋钮。

## 适用 vs 不适用场景

**适用**：

- 多租户 / 高并发 LLM API，长短请求混部
- 混合注意力（SWA + full）需要按层类型正确预留
- 要解释"显存没满却上不去并发 / 大量 preempt"的现场

**不适用**：

- 单机单请求调试（预算问题几乎不出现）
- 离线吞吐且长度几乎固定
- 已在更高层做硬隔离（每租户独立引擎）且不关心池内切分

## 历史小故事（可跳过）

- **2023**：PagedAttention / vLLM（SOSP）把 KV 变成可分页 block，serving 才有精细预算的地基
- **2024**：连续批处理普及后，瓶颈从"算得慢"更多转向"KV 怎么切、怎么收回"
- **2024–2025**：Ada-KV 等把"预算"从均匀切块推进到按 head 自适应；工程上则出现按层类型 cap admission 的修复
- **今日**：生产里常同时谈三件事——总池大小、每请求 admission、驱逐/压缩策略

## 学到什么

1. **KV cache 是工作集，不是附属数组**——并发上限首先是内存预算问题
2. **先预算再进场**比进场后再救火更稳——admission 是第一道闸
3. **不同层/头的需求不均匀**——均匀预留会浪费并发或伤害质量
4. **口径一致最重要**——admission、占用、回收必须用同一套峰值假设

若只能记住一句：先问"这条请求最坏要占几个 block"，再问"池子还剩多少"——比先问"GPU 利用率多少"更接近真相。

## 延伸阅读

- Kwon et al., Efficient Memory Management for LLM Serving with PagedAttention, SOSP 2023（[[vllm]]）
- Feng et al., Ada-KV: Optimizing KV Cache Eviction by Adaptive Budget Allocation, arXiv:2407.11550
- vLLM 文档：Optimization and Tuning（`gpu_memory_utilization` / preemption）
- [[paged-attention]] —— block 分页的算法侧
- [[kv-fold]] —— 另一类 KV 结构优化
- [[prefix-cache-policy-2026]] —— 前缀缓存策略如何影响有效预算

## 关联

- [[vllm]] —— per-request 预算落地的主流开源引擎
- [[paged-attention]] —— 把 KV 切成 block 的基础机制
- [[flash-attention]] —— 算子侧降低显存带宽压力
- [[kv-fold]] —— 结构上折叠 KV 占用
- [[oscar-int2-kv]] —— 量化压缩 KV 的另一条路
- [[nestedkv]] —— 层次化 KV 组织
- [[prefix-cache-policy-2026]] —— 共享前缀如何改变有效占用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->


