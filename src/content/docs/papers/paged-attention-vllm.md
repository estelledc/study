---
title: PagedAttention — 以页替代整段内存的显存管理
来源: 'Kwon et al., "Efficient Memory Management for Large Language Model Serving with PagedAttention", SOSP 2023'
日期: 2026-07-11
分类: LLM 推理
难度: 中级
---

## 是什么

日常类比：旅馆以前给每位客人预留一整层楼（按最大入住天数算），哪怕他只住一晚、只占一间——空房间也不能给别人。PagedAttention 把楼层拆成固定大小的小房间（block），客人按需开房；vLLM 则是前台：拿着房间号清单调度谁进谁出。

这篇 SOSP 2023 论文同时交出两样东西：**PagedAttention**（把 KV cache 切成非连续页、用 block table 间接寻址的 attention）和 **vLLM**（建在其上的高吞吐 LLM serving 引擎）。核心不是改模型权重，而是让显存像操作系统虚拟内存一样按页分配、共享与回收。

## 为什么重要

不理解这篇「算法 + 系统」合稿，下面这些事都没法解释：

- 为什么 A100 上 13B 模型权重只占约 65%，真正卡住 batch 的往往是动态增长的 KV cache（约 30% 显存预算）
- 为什么已有 continuous batching（Orca）仍不够：连续预分配会把有效 KV 利用率压到约 20–38%
- 为什么同一 prompt 做 parallel sampling / beam search 时，旧系统会复制多份完整 KV，而分页后可以按块共享
- 为什么论文能在 attention kernel 多一次查表的前提下，端到端吞吐相对 FasterTransformer / Orca 提升约 2–4×

## 核心要点

1. **KV cache 像「边走边涨的行李」**。类比：旅客每买一件纪念品，行李箱就多一格，出发前不知道最终多重。decode 每步都要把新 token 的 key/value 存下，长度事先未知，连续大块预分配必然留空。

2. **分页 + block table = 逻辑连续、物理可散**。类比：你的进程地址空间看起来连续，物理页帧可以东一块西一块。默认约 16 token/block；请求按需从空闲池取块，消除外部碎片，内部碎片最多一个未填满的尾块。

3. **vLLM 把调度和内存共设计**。类比：前台不只登记房间，还决定谁先入住、显存紧时谁被换出。引用计数 + copy-on-write 让多序列共享 prompt 块；显存不够时用 swap/recompute 做抢占，而不是一上来就拒掉整个 batch。

## 实践案例

### 案例 1：先算清「为什么预留整段会炸」

```python
# OPT-13B 量级：论文给出约 800KB KV / token
kb_per_token = 800
max_len = 2048
print(kb_per_token * max_len / 1024 / 1024, "GB reserved if pre-allocate max")
# ≈ 1.6 GB —— 实际只生成 200 token 时，大半显存空着却不能借给别人
```

**逐部分解释**：

- `800KB/token` 来自论文对 OPT-13B 的估算（含各层 K/V）。
- 旧系统常按 `max_len` 连续预留，短请求造成严重内部碎片。
- 分页后只为已生成 token 分配块，空闲块立刻回池。

### 案例 2：block table 怎么定位第 34 个 token

```python
block_size = 16
block_table = [7, 1, 3]  # 逻辑块号 -> 物理块号

def locate(token_idx):
    logical = token_idx // block_size
    offset = token_idx % block_size
    return block_table[logical], offset

print(locate(34))  # (3, 2)：物理块 3，块内偏移 2
```

**逐部分解释**：

- `logical` 是这条 sequence「自己眼里」的第几块。
- `physical` 是 GPU 显存池里的真实块编号，不必连续。
- PagedAttention kernel 先查表再读 K/V，换来灵活布局。

### 案例 3：共享 prompt 时的写时复制

```python
ref = {"prompt_blk": 4}  # 4 条候选共用同一 prompt 块

def write_new_token(blk):
    if ref[blk] > 1:
        ref[blk] -= 1
        blk = "private_copy"
        ref[blk] = 1
    return blk

print(write_new_token("prompt_blk"), ref)
```

**逐部分解释**：

- 多候选先共享，不复制整段 prompt KV。
- 某条要追加自己的 token 时才复制该块，避免污染兄弟序列。
- 复制粒度是 block，不是整条序列，长 prompt 收益最大。

## 踩过的坑

1. **当成新模型结构**：PagedAttention / vLLM 不改输出分布，只改 KV 存放与调度；精度对比应与同权重基线一致。
2. **block 越小越好**：块太小会放大查表、复制与 kernel 管理开销；论文默认 16 是吞吐与碎片的折中。
3. **只看单请求延迟**：间接寻址让 attention kernel 大约慢 20–26%，收益主要来自更大有效 batch。
4. **把 preemption 当日常路径**：频繁 swap/recompute 说明并发或上下文配得过满，应先降负载再谈「灵活调度」。

## 适用 vs 不适用

**适用**：

- 在线 LLM serving：请求持续到达，生成长度差异大，显存决定能塞进多少并发。
- decoder-only 的 decode 阶段：每步都要读历史 KV，分页与共享直接放大 batch。
- parallel sampling、beam search、共享 system prompt 等前缀可复用场景。
- 需要在相同延迟目标下把吞吐抬到接近 FasterTransformer / Orca 的 2–4× 的服务。

**不适用**：

- 单请求离线推理：几乎无并发、无共享，分页的间接开销难回本。
- encoder-only 分类 / embedding：没有随 decode 增长的 KV 行李。
- 形状固定、生命周期可静态规划的训练任务：连续分配往往更简单。
- 极致优化首 token 延迟、且 batch 本来就很小的场景：调度与查表可能得不偿失。

## 历史小故事（可跳过）

- **1960s**：操作系统用虚拟内存与分页解决碎片和共享；论文明确把 block≈page、token≈byte、request≈process。
- **2022**：Orca 提出 iteration-level scheduling，按 token 步重组 batch，但 KV 仍多是连续预留。
- **2023**：Berkeley 团队把分页、引用计数、CoW 搬进 GPU KV，并实现开源系统 vLLM。
- **SOSP ’23（Koblenz）**：放在操作系统会议发表，强调资源管理抽象，而非新网络结构。
- **2024 以后**：SGLang、TensorRT-LLM、TGI 等继续在「可分页 KV」上做 prefix cache 与分离式 serving。

## 学到什么

- **LLM serving 的吞吐常常是内存问题**：decode 算得少、读得多，有效 KV 能装多少直接决定 batch。
- **算法与系统要一起设计**：只会分页不会调度，或只会调度不会分页，都吃不到论文里的 2–4×。
- **一层间接寻址换系统自由度**：物理块可散、可共享、可抢占，逻辑上仍是连续上下文。
- **局部慢一点可以整体快很多**：kernel 多一次查表，换来近零 KV 浪费和更大并发。

## 延伸阅读

- 论文 PDF：[Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/pdf/2309.06180.pdf)
- 论文页：[arXiv 2309.06180](https://arxiv.org/abs/2309.06180)
- 开源实现：[vllm-project/vllm](https://github.com/vllm-project/vllm)
- [[paged-attention]] —— 更聚焦分页算法与 block table 心智模型的姊妹笔记
- [[vllm]] —— 从 serving 系统视角看同一套抽象如何落地
- [[orca-continuous-batching]] —— 调度侧前史：有 iteration batching 仍会被连续 KV 卡住

## 关联

- [[paged-attention]] —— 同一论文的算法特写：碎片、映射、CoW
- [[vllm]] —— 同一论文的系统特写：引擎、调度与工程默认值
- [[orca-continuous-batching]] —— 「谁下一步进 batch」；本文补「KV 放哪里」
- [[flash-attention]] —— 优化单次 attention 的 IO；本文优化历史 KV 的布局与复用
- [[fastertransformer-2021]] —— 论文对比的高性能连续 KV 基线之一
- [[sglang-2024]] —— 后续在可分页 KV 上做 radix/prefix cache
- [[distserve]] —— 把 prefill/decode 分离，继续沿着 serving 调度推进

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[orca-2022]] —— Orca — Transformer 生成模型的分布式推理调度
- [[prefix-cache-policy-2026]] —— Beyond LRU — 混杂负载下的 LLM 前缀缓存淘汰（UniCache）
- [[vericache]] —— VeriCache: Turning Lossy KV Cache into Lossless LLM Inference — 有损压缩草稿，无损输出验收
