---
title: PagedAttention — 把 KV cache 当虚拟内存页来管理
来源: 'Kwon et al., "Efficient Memory Management for Large Language Model Serving with PagedAttention", SOSP 2023'
日期: 2026-07-09
分类: LLM 推理
难度: 中级
---

## 是什么

日常类比：自助餐厅以前给每位客人提前留一整张大桌子，客人只坐一半，剩下座位也不能给别人；PagedAttention 像把餐厅拆成很多单人座，谁来就按需拿座位，走了马上归还。

PagedAttention 是一篇 2023 年论文提出的 LLM 推理内存管理方法：把每个请求的 **KV cache** 切成固定大小的块，再用一张 block table 记录“逻辑第几块”对应 GPU 显存里的“物理第几块”。

它的核心不是让模型更聪明，而是让服务系统更会省显存。论文里的 vLLM 借它把 KV cache 像操作系统虚拟内存页一样管理，从而减少碎片、扩大 batch、提升吞吐。

## 为什么重要

不理解 PagedAttention，下面这些事都没法解释：

- 为什么 LLM serving 的瓶颈经常不是矩阵乘法，而是 KV cache 放不下更多请求。
- 为什么连续批处理有调度想法还不够，显存碎片会把可并发请求数卡住。
- 为什么同一个 prompt 生成多个候选时，不应该复制多份完整 KV cache。
- 为什么论文能在单个 attention kernel 多一点开销的情况下，让端到端吞吐提升 2-4 倍。

## 核心要点

1. **KV cache 是“随生成增长的行李”**。类比：旅客越走越买东西，行李箱会越来越大，而且不知道最后有多大。LLM 每生成一个 token，就要把这个 token 的 key/value 保存下来，后面生成时还要反复读取。

2. **分页把“连续大房间”改成“小房间清单”**。类比：订酒店不用包下一整层，只拿若干房间号。PagedAttention 让一个 sequence 看到连续的逻辑 block，但物理显存可以不连续。

3. **共享和 copy-on-write 让重复 prompt 少占显存**。类比：几个人先共用一份讲义，谁要写笔记才复印自己的那一页。parallel sampling、beam search、共享系统提示词都能用这种方式省 KV cache。

## 实践案例

### 案例 1：先算 KV cache 为什么吓人

```python
layers = 40
hidden = 5120
bytes_fp16 = 2
kv_per_token = 2 * layers * hidden * bytes_fp16
print(kv_per_token / 1024, "KB per token")
print(kv_per_token * 2048 / 1024**3, "GB per request")
```

**逐部分解释**：

- `2` 表示 key 和 value 两份状态。
- `layers` 和 `hidden` 决定每个 token 在所有层里要留下多少信息。
- 论文用 OPT-13B 举例，一个 token 的 KV cache 约 800 KB，2048 token 接近 1.6 GB。

### 案例 2：block table 怎么把逻辑块映射到物理块

```python
block_size = 16
block_table = [7, 1, 3]  # 逻辑块 -> 物理块

def locate(token_index):
    logical = token_index // block_size
    offset = token_index % block_size
    physical = block_table[logical]
    return physical, offset

print(locate(34))  # 第 34 个 token 在物理块 3 的偏移 2
```

**逐部分解释**：

- `logical` 是 sequence 自己看到的第几块。
- `physical` 是真实 GPU 显存池里的块编号。
- attention kernel 多查一次表，就能从不连续显存里读出连续上下文。

### 案例 3：copy-on-write 怎么服务多个候选

```python
ref_count = {"prompt_block": 4}

def append_token(block):
    if ref_count[block] > 1:
        ref_count[block] -= 1
        block = "copied_block"
        ref_count[block] = 1
    return block

print(append_token("prompt_block"))
```

**逐部分解释**：

- `ref_count = 4` 表示 4 条候选共享同一块 prompt KV。
- 第一条候选要写新 token 时，先复制一块再写，避免污染其他候选。
- 复制粒度是一块，不是整段 prompt，所以长 prompt 的收益特别明显。

## 踩过的坑

1. **把 PagedAttention 当成模型算法**：它不改变模型权重和输出概率，只改变 KV cache 的存放和读取方式。
2. **以为 block 越小越好**：块太小会增加查表、复制和 kernel 管理开销，论文默认 16 token 是折中。
3. **忽略单请求低延迟开销**：间接寻址让 attention kernel 慢 20-26%，只有多并发吞吐场景才明显回本。
4. **把 preemption 当正常路径**：swap 或 recompute 是显存不够时的兜底，频繁触发说明容量或并发配置过激。

## 适用 vs 不适用场景

**适用**：

- 在线 LLM serving，请求持续到达，且每条请求生成长度不同。
- decoder-only 模型的 decode 阶段，因为每步都要读历史 KV cache。
- parallel sampling、beam search、共享 system prompt 等有前缀共享的场景。
- 显存容量限制 batch size，吞吐比单请求延迟更重要的服务。

**不适用**：

- 单请求离线推理，几乎没有并发，也没有显存复用机会。
- encoder-only 分类或 embedding 模型，没有长时间增长的 KV cache。
- 张量形状固定的训练任务，内存生命周期可提前规划，分页反而增加间接寻址。
- 极致低延迟首 token 服务，调度和查表开销可能比省显存更敏感。

## 历史小故事（可跳过）

- **1960s**：操作系统提出虚拟内存和分页，让程序看到连续地址，物理内存可以分散摆放。
- **2022**：Orca 提出 iteration-level scheduling，让 LLM 请求按 token step 重新组 batch，但 KV cache 仍是关键瓶颈。
- **2023**：Berkeley Sky Computing Lab 把分页、引用计数、copy-on-write 搬进 GPU KV cache，形成 PagedAttention 和 vLLM。
- **2023 年 SOSP**：论文把这件事放在操作系统会议发表，说明贡献重点是资源管理抽象，而不是新模型结构。
- **2024 以后**：SGLang、TensorRT-LLM、TGI 等 serving 系统继续围绕 KV cache 管理扩展 prefix cache、分离式 serving 和更复杂调度。

## 学到什么

- **LLM 推理的吞吐问题常常是内存问题**：decode 每步算得少、读得多，显存能装多少有效 KV 直接决定 batch 能多大。
- **一层间接寻址可以换来系统级自由度**：物理块不连续，逻辑上仍可当成连续上下文使用。
- **共享必须有写时复制兜底**：不共享浪费显存，直接共享又会互相污染，copy-on-write 是中间解。
- **局部慢一点可能换来整体快很多**：attention kernel 有额外查表开销，但减少碎片后能并发更多请求。

## 延伸阅读

- 论文 PDF：[Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/pdf/2309.06180v1.pdf)
- 论文页：[arXiv 2309.06180](https://arxiv.org/abs/2309.06180)
- [[vllm]] —— 这篇论文对应的开源 serving 系统实现。
- [[orca-continuous-batching]] —— PagedAttention 解决的是 Orca 调度之外的 KV 内存瓶颈。
- [[flash-attention]] —— 关注 attention 计算和显存 IO，和 PagedAttention 分别优化不同阶段。

## 关联

- [[vllm]] —— vLLM 是 PagedAttention 的系统载体，把分页 KV 管理做成可用服务。
- [[orca-continuous-batching]] —— Orca 负责“谁下一步进 batch”，PagedAttention 负责“KV 放哪里”。
- [[flash-attention]] —— FlashAttention 优化单次 attention 的 IO，PagedAttention 优化历史 KV 的布局。
- [[fastertransformer-2021]] —— 论文对比的高性能 baseline，代表连续 KV 和定制 kernel 的路线。
- [[megatron-lm]] —— 多 GPU 张量并行让大模型能部署，PagedAttention 还要在每个分片上同步 KV 映射。
- [[distserve]] —— 后续把 prefill 和 decode 分离，继续沿着 serving 系统调度方向推进。
- [[sglang-2024]] —— 后续系统在 PagedAttention 基础上进一步做 radix cache 和结构化推理优化。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

