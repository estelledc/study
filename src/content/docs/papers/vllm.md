---
title: vLLM - Efficient Memory Management for LLM Serving with PagedAttention
description: 状元篇 - vLLM 把操作系统分页思想搬进 KV cache 管理，固定大小 block + 间接寻址 + 引用计数共享，让显存利用率从 60-80% 跳到 96%，吞吐 2-4x，是 LLM 推理的标准方案
season: P
episode: P3
branch: method
tier: 状元
date: 2026-05-29
tags:
  - llm-serving
  - memory-management
  - kv-cache
  - paged-attention
  - vllm
  - inference-optimization
---

import { Image } from 'astro:assets';

## Layer 0 — 论文身份证

| 字段 | 内容 |
|---|---|
| 标题 | Efficient Memory Management for Large Language Model Serving with PagedAttention |
| 作者 | Woosuk Kwon, Zhuohan Li, Siyuan Zhuang, Ying Sheng, Lianmin Zheng, Cody Hao Yu, Joseph E. Gonzalez, Hao Zhang, Ion Stoica |
| 机构 | UC Berkeley（Sky Computing Lab）+ Stanford + UCSD |
| 会议 | SOSP 2023（ACM Symposium on Operating Systems Principles） |
| 年份 | 2023 年 9 月 |
| arXiv | 2309.06180 |
| 代码 | github.com/vllm-project/vllm（v0.2.0 即论文版本，截至 2026 年 60k+ stars） |
| 引用 | 2000+（截至 2026 年 5 月，是最被广泛部署的 LLM serving 系统） |
| 一句话 | 把操作系统的分页（paging）思想搬进 GPU KV cache 管理：固定大小 block + 间接寻址 + 引用计数共享，让显存浪费从 40% 降到 4%，吞吐提升 2-4x |

## 一句话定位

**vLLM 不发明新 attention 算法，也不切模型——它只做一件事：把"KV cache 必须连续存储"这条隐含约束打破，换成 OS 风格的虚拟内存。**

它的发布让任意拉一台 8×A100 的小厂都能把开源 7B/13B 模型部署成接近 GPT-3.5 商业 API 的吞吐，是 2023 年下半年到 2024 年开源 LLM 浪潮的关键基础设施。

<Image src="/papers/vllm/01-paged-attention.webp" alt="PagedAttention：KV cache 切 block + page table + non-contiguous 显存" width={1600} height={1000} />

## Layer 1 — Why 这篇论文存在

### 痛点 1：KV cache 是 LLM 推理的真·瓶颈

LLM 推理（decode 阶段）每生成 1 个 token，都要读全部历史 token 的 K/V 向量做 attention。这些向量缓存下来就是 **KV cache**。

具体规模（13B LLaMA，fp16）：

- 每个 token 的 KV：`2 × num_layers × num_kv_heads × head_dim × 2 bytes` = `2 × 40 × 40 × 128 × 2` ≈ **820 KB / token**
- 一条 2048 token 的请求：≈ **1.6 GB KV cache**
- 一张 80GB A100，单论模型权重已经吃掉 26 GB → 剩 54 GB 给 KV cache → **理论上能并发约 33 条 2048 长度请求**

### 痛点 2：vLLM 之前的内存管理

paper-era（2022-2023 上半年）的 LLM serving 系统（FasterTransformer、Orca、HF transformers）都假设 **KV cache 是一段连续显存**：

- 接到请求时，按 `max_seq_len`（比如 2048）**预先分配**一段连续显存
- 实际生成可能只到 200 token 就 EOS 了 → **剩下 1848 token 的空间被浪费**（internal fragmentation）
- 多条请求长度不一 → 释放后留下大小不一的"洞" → 新请求拼不进去（external fragmentation）
- 论文测得：实际 KV 利用率只有 **20%-38%**，剩下 60-80% 全浪费

### 痛点 3：sharing 机会被浪费

LLM 推理里有大量**前缀共享**场景：

- **parallel sampling**：同一个 prompt 生成 N 个候选答案（OpenAI 的 `n` 参数）
- **beam search**：beam_size 条 hypothesis 共享前缀
- **system prompt**：服务一个 chatbot 时，所有请求共享一段 1k token 的 system prompt

如果 KV cache 必须连续，每条 hypothesis 都要拷贝一份完整前缀的 KV → 显存浪费 + 拷贝开销。

### vLLM 的切入点

Kwon 等人观察到一个朴素事实：

> **OS 早在 1960s 就解决过类似问题——用分页 + 虚拟内存把"应用看到的连续地址"和"物理内存的非连续帧"解耦。**

把 KV cache 也分页，三个问题一起解决：

1. **internal frag** → block 大小固定（16 token），只为实际生成的部分分配 → 浪费上限 = block_size 1 个 / 序列
2. **external frag** → 所有 block 大小相同，永远不会出现"洞拼不上新 block" 的情况
3. **sharing** → 物理 block 加引用计数，多个 sequence 可以共享同一物理 block（copy-on-write）

## Layer 2 — 核心机制（怎么做）

### 2.1 LogicalTokenBlock 与 PhysicalTokenBlock

vLLM 把 KV cache 分两层：

- **LogicalTokenBlock**：每个 sequence 的"虚拟地址"——一段 16 token 的逻辑块，对应用户看到的连续 token 序列
- **PhysicalTokenBlock**：GPU 上一段 16 token 的真实显存——`[num_kv_heads, head_dim, block_size]`

中间加一层 **block table**：`logical_block_idx -> PhysicalTokenBlock`。

类比：进程有自己的虚拟地址空间（0x0000 ~ 0xFFFF），OS 维护页表把虚拟页映射到物理帧。这里 sequence 就是进程，block 就是页。

### 2.2 BlockManager 与 BlockAllocator

GPU 启动时，vLLM 算出"模型权重 + activation + 安全余量"之外还剩多少显存，全部切成 16-token 大小的 PhysicalTokenBlock 池。

每个 block 有 `ref_count` 字段：

- 新 sequence allocate → ref_count = 1
- parallel sampling 复制 → 不真复制，只 ref_count += 1
- sequence 结束 → ref_count -= 1，归零回收
- 写时（要在共享 block 上 append 新 token）→ 如果 ref_count > 1，先 copy-on-write

### 2.3 PagedAttention CUDA kernel

普通 attention kernel 假设 K/V 是 `[seq_len, num_heads, head_dim]` 连续张量。

PagedAttention kernel 改成接受三个参数：

- `block_tables`: `[num_seqs, max_num_blocks_per_seq]`，每个 sequence 的页表
- `context_lens`: `[num_seqs]`，每个 sequence 当前 token 数
- `k_cache`, `v_cache`: 整个 GPU 的 block 池，shape `[num_blocks, num_kv_heads, head_dim, block_size]`

kernel 里先按 block_table 把要读的 block 找出来（**间接寻址**），再做标准的 dot-product + softmax + weighted sum。

### 2.4 Continuous Batching（不是 vLLM 首创，但是 vLLM 让它真正可用）

Orca（OSDI'22）提出 **iteration-level scheduling**：每生成一步就重新组 batch，先结束的请求立刻让位、新请求立刻插进来。

Orca 受限于"KV cache 必须预留 max_len"，新请求加入很贵；vLLM 把 KV 切 block 后，加入/退出几乎零成本——continuous batching 才真正落地。

### 2.5 三个性能数字

论文测试（A100-40GB，13B LLaMA，ShareGPT trace）：

- **吞吐**：vLLM 比 HF transformers **24x**，比 FasterTransformer **2.2-2.5x**，比 Orca **2-4x**
- **memory utilization**：96.3% vs Orca 20.4-37.6%
- **共享场景**：parallel sampling N=4 时，比"每条独立 KV" 节省 **55% KV 显存**

## Layer 3 — 看代码就懂的三段精读

### 3.1 BlockAllocator + PhysicalTokenBlock：把显存切成均匀块

vLLM 启动时，`BlockSpaceManager` 用 `num_gpu_blocks`（运行时算出来）实例化两个 `BlockAllocator`，把 GPU/CPU 显存切成等长的 `PhysicalTokenBlock` 池。

[vllm/core/block_manager.py @ v0.2.0](https://github.com/vllm-project/vllm/blob/e2fb71ec9f2c3168ba8614408fa807a5f65707c5/vllm/core/block_manager.py)（commit hash 完整 40 字符 `e2fb71ec9f2c3168ba8614408fa807a5f65707c5`）：

```python
class BlockAllocator:
    """Manages free physical token blocks for a device."""

    def __init__(
        self,
        device: Device,
        block_size: int,
        num_blocks: int,
    ) -> None:
        self.device = device
        self.block_size = block_size
        self.num_blocks = num_blocks

        # Initialize the free blocks.
        self.free_blocks: List[PhysicalTokenBlock] = []
        for i in range(num_blocks):
            block = PhysicalTokenBlock(device=device,
                                       block_number=i,
                                       block_size=block_size)
            self.free_blocks.append(block)

    def allocate(self) -> PhysicalTokenBlock:
        if not self.free_blocks:
            raise ValueError("Out of memory! No free blocks are available.")
        block = self.free_blocks.pop()
        block.ref_count = 1
        return block

    def free(self, block: PhysicalTokenBlock) -> None:
        if block.ref_count == 0:
            raise ValueError(f"Double free! {block} is already freed.")
        block.ref_count -= 1
        if block.ref_count == 0:
            self.free_blocks.append(block)
```

旁注 1：`free_blocks` 是 `List` 而非 `Set`，`pop()` 是 O(1)，但**找不到指定 block 的查找**是 O(n)——好在 free 路径不需要查找，是从 sequence 的 block_table 直接拿到 PhysicalTokenBlock 引用 free 的。

旁注 2：`block.ref_count = 1` 在 `allocate` 里硬编码，意味着 allocate 默认就是被一条 sequence 独占的；**parallel sampling 的共享是上层另外一段代码（`fork`-style）显式 +1**，不在 allocator 里。

旁注 3：`Double free` check 是真·防御编程——分页系统最容易栽在引用计数错配上。但这里只查 ==0，没查 >0 但已经在 `free_blocks` 里——如果上层逻辑有 bug 重复 free 同一个 ref_count>1 的 block，allocator 抓不住。

旁注 4：`get_num_free_blocks()` 让上层 scheduler 实时知道还能塞多少新请求，这是 continuous batching 决策的关键输入——没有这个数字，scheduler 就只能靠"试着 allocate，OOM 了再退回"的方式。

旁注 5：注意没有 `defrag()` 也没有 LRU——所有 block 大小一样，free 列表的顺序无关紧要，这正是分页相对 malloc 的核心优势。

怀疑（Layer 3）：当 `num_blocks` 极大（比如 80GB A100 跑 7B 模型，block_size=16，单 block≈2.5MB → 30000+ blocks），`free_blocks: List` 的 Python list pop 在 cache 不友好的场景里会不会拖慢 allocate？后续 vllm v0.4+ 切到 v1 engine 时改成什么数据结构？需要看现在的 sched/kv_cache_manager 实现验证。

### 3.2 BlockSpaceManager.allocate / append_slot：sequence 申请与扩张

继续看 v0.2.0 commit `e2fb71ec9f2c3168ba8614408fa807a5f65707c5`：

```python
class BlockSpaceManager:
    def can_allocate(self, seq_group: SequenceGroup) -> bool:
        seq = seq_group.get_seqs()[0]
        num_required_blocks = len(seq.logical_token_blocks)
        if self.block_sliding_window is not None:
            num_required_blocks = min(num_required_blocks,
                                      self.block_sliding_window)
        num_free_gpu_blocks = self.gpu_allocator.get_num_free_blocks()
        # Use watermark to avoid frequent cache eviction.
        return (num_free_gpu_blocks - num_required_blocks >=
                self.watermark_blocks)

    def allocate(self, seq_group: SequenceGroup) -> None:
        seq = seq_group.get_seqs()[0]
        block_table: BlockTable = []
        for logical_idx in range(len(seq.logical_token_blocks)):
            if (self.block_sliding_window is not None
                    and logical_idx >= self.block_sliding_window):
                block = block_table[logical_idx % self.block_sliding_window]
            else:
                block = self.gpu_allocator.allocate()
            # Set the reference counts of the token blocks.
            block.ref_count = seq_group.num_seqs()
            block_table.append(block)

        # Assign the block table for each sequence.
        for seq in seq_group.get_seqs():
            self.block_tables[seq.seq_id] = block_table.copy()

    def append_slot(self, seq: Sequence) -> Optional[Tuple[int, int]]:
        """Allocate a physical slot for a new token."""
        logical_blocks = seq.logical_token_blocks
        block_table = self.block_tables[seq.seq_id]

        if len(block_table) < len(logical_blocks):
            # The sequence has a new logical block. Allocate a new physical
            # block.
            block = self.gpu_allocator.allocate()
            block_table.append(block)
            return None

        # We want to append the token to the last physical block.
        last_block = block_table[-1]
        assert last_block.device == Device.GPU
        if last_block.ref_count == 1:
            # Not shared with other sequences. Append.
            return None
        else:
            # The last block is shared with other sequences. Copy on Write.
            new_block = self.gpu_allocator.allocate()
            block_table[-1] = new_block
            self.gpu_allocator.free(last_block)
            return last_block.block_number, new_block.block_number
```

旁注 1：`can_allocate` 用了 watermark（默认 0.01）—— 留 1% 当缓冲，避免恰好把 free pool 用空导致频繁的 swap。这是**经验调出来的**而不是理论推导。

旁注 2：`block.ref_count = seq_group.num_seqs()` —— allocate 一开始就把 ref_count 设成"这个 group 里有几条 sequence"。**parallel sampling N=4 的共享机制就在这里**：4 条 sequence 共享同一段 prompt block，初始 ref_count 直接设为 4，比"先 alloc 1 份再 fork 3 次 +1" 少了 3 步。

旁注 3：`block_table.copy()` 给每条 seq 一份独立的 list —— 但 list 里的 PhysicalTokenBlock 对象是共享的。这是 Python 的**浅拷贝**特性，正好对上"每条 seq 有自己的页表，但页表项指向同一个物理帧"。

旁注 4：`append_slot` 是 decode 阶段每生成一个 token 都要调一次的热路径。三个分支：(a) 新 logical block → 直接分配；(b) 老 block 但独占 → 直接 append（返回 None 表示无 copy）；(c) 老 block 但共享 → **copy-on-write**：分配新 block，旧 block ref_count -= 1，**返回 (old, new) 让上层把旧 block 的内容搬到新 block**。

旁注 5：注意返回值是**告诉调用方"你需要做一次 GPU 上的 block copy"**，但这段代码本身不发起 copy——这是典型的 Python control-plane 决定 + CUDA data-plane 执行的分层。具体的 copy 由 `cache_engine.copy()` 在下一个 kernel launch 里 batch 起来做（`blocks_to_copy: Dict[int, List[int]]` 在 SchedulerOutputs 里）。

怀疑（Layer 3）：CoW 触发频率有多高？parallel sampling N=4 时，4 条 sequence 在第一次各自 append 不同 token 就会 CoW，等于第一个 decode step 会触发 N-1 次 block copy。这部分 overhead 论文没单独 ablation——如果把 block_size 调小（比如 8），CoW 单次拷贝量减半，但触发频率不变；调大（比如 32），CoW 单次更贵，但触发概率下降。最优 block_size 应该是 workload-dependent，论文用 16 是 ShareGPT trace 上跑出来的。

### 3.3 PagedAttention CUDA kernel：间接寻址 + 一个 block 一个 thread block

继续看 v0.2.0 commit `e2fb71ec9f2c3168ba8614408fa807a5f65707c5`，[csrc/attention/attention_kernels.cu](https://github.com/vllm-project/vllm/blob/e2fb71ec9f2c3168ba8614408fa807a5f65707c5/csrc/attention/attention_kernels.cu)：

```cuda
// Grid: (num_heads, num_seqs).
template<typename scalar_t, int HEAD_SIZE, int BLOCK_SIZE, int NUM_THREADS>
__global__ void single_query_cached_kv_attention_kernel(
  scalar_t* __restrict__ out,             // [num_seqs, num_heads, head_size]
  const scalar_t* __restrict__ q,         // [num_seqs, num_heads, head_size]
  const scalar_t* __restrict__ k_cache,   // [num_blocks, num_kv_heads, head_size/x, block_size, x]
  const scalar_t* __restrict__ v_cache,   // [num_blocks, num_kv_heads, head_size, block_size]
  const int* __restrict__ head_mapping,   // [num_heads]
  const float scale,
  const int* __restrict__ block_tables,   // [num_seqs, max_num_blocks_per_seq]
  const int* __restrict__ context_lens,   // [num_seqs]
  const int max_num_blocks_per_seq,
  const float* __restrict__ alibi_slopes,
  const int q_stride,
  const int kv_block_stride,
  const int kv_head_stride) {

  const int head_idx = blockIdx.x;
  const int kv_head_idx = head_mapping[head_idx];
  const int seq_idx = blockIdx.y;

  const int context_len = context_lens[seq_idx];
  const int num_blocks = (context_len + BLOCK_SIZE - 1) / BLOCK_SIZE;

  // Iterate over the key blocks.
  // Each thread group reads BLOCK_SIZE tokens at a time.
  const int* block_table = block_tables + seq_idx * max_num_blocks_per_seq;
  for (int block_idx = warp_idx; block_idx < num_blocks; block_idx += NUM_WARPS) {
    const int physical_block_number = block_table[block_idx];
    const scalar_t* k_ptr = k_cache + physical_block_number * kv_block_stride
                                    + kv_head_idx * kv_head_stride;
    // ... compute QK^T for this block ...
  }
}
```

旁注 1：grid 是 `(num_heads, num_seqs)` —— **每个 thread block 处理一条 sequence 的一个 head**。这里没有 token 维度的并行（不像 FlashAttention 训练 kernel），因为 decode 阶段 query 长度恒为 1，token 维并行没意义。

旁注 2：注释里 k_cache 形状写着 `[num_blocks, num_kv_heads, head_size/x, block_size, x]`——多出来的 `x` 维度是 **fp16 vectorized load 用的**（一次读 8 个 half），把 head_size 切成 `head_size/x` 个 chunk。这是性能 trick，从 FasterTransformer 抄来的。

旁注 3：`block_tables + seq_idx * max_num_blocks_per_seq` —— page table 在 GPU 上是 `[num_seqs, max_num_blocks_per_seq]` 的 int 张量，每个 seq 有自己的一行。

旁注 4：`physical_block_number = block_table[block_idx]` —— **就是这一行实现了"分页"**：CUDA kernel 不再认为 KV 是连续的，而是先查 block_table 拿到物理 block 编号，再算物理地址。一次额外的 int load + 一次额外的乘法。

旁注 5：循环用 `for (block_idx = warp_idx; block_idx < num_blocks; block_idx += NUM_WARPS)` —— **同一个 thread block 内的不同 warp 处理不同 block**。这意味着每个 warp 一次只读一个 block 的内容，不会发生跨 block 的 coalesced load。所以**block_size 必须 >= warp 内 token 数**（一般 16 token，对应 4 个 fp16×8 vector），刚好打满 32-thread warp 的 load 带宽。

旁注 6：`alibi_slopes` 是 ALiBi 位置编码的可选输入（MosaicML 的 MPT 用），不是核心机制——这个 kernel 设计上一开始就考虑了多种 attention 变体的兼容性。

怀疑（Layer 3）：间接寻址有 overhead 吗？每个 token 多一次 int load + 一次乘法。论文 Figure 18 说 PagedAttention kernel 比 FasterTransformer 的连续 kernel **慢 20-26%**，但端到端因为内存利用率高、batch 更大，吞吐反而高 2-4x。这是个**典型的"kernel 慢一点但系统快很多"**的工程权衡。后来 FlashAttention-2 加上 paged 支持后，kernel overhead 降到 5% 以内（Dao 2024）。

## Layer 4 — phd-skills 7 阶段（自己跑一遍）

> 路径：在本机用 vLLM 跑一个 7B 模型 + 看 GPU memory utilization + 对比 HF transformers。

### 阶段 1 — 理解（Read）

读 vLLM repo 的 README + paper section 4-5。重点抓三件事：

- **block_size** 的语义（默认 16 token）
- **gpu_memory_utilization** 参数（默认 0.9，即占用 90% 显存）
- **continuous batching** 与传统 static batching 的区别

### 阶段 2 — 复现（Reproduce）

最小可运行 demo（单卡 A10/4090 都能跑）：

```bash
pip install vllm  # vllm pulls torch + xformers + ray
```

```python
from vllm import LLM, SamplingParams

llm = LLM(model="meta-llama/Llama-2-7b-chat-hf",
          gpu_memory_utilization=0.9,
          block_size=16)
prompts = ["Tell me about quantum computing.",
           "Tell me about quantum mechanics.",
           "Write a haiku about Berkeley."]
out = llm.generate(prompts, SamplingParams(temperature=0.0, max_tokens=128))
for o in out:
    print(o.outputs[0].text)
```

### 阶段 3 — 测量（Measure）

观测三个指标：

- **nvidia-smi**：watch -n 0.5 看显存占用稳定在 90%（block pool 一次性吃满）
- **tokens/sec**：vLLM 启动后第一行 log 会打印 `Avg generation throughput: XXX tokens/s`
- **block 利用率**：`llm.llm_engine.scheduler.block_manager.gpu_allocator.get_num_free_blocks()` 在生成中途调用，看占用率

### 阶段 4 — 对比（Compare）

跑同样 prompts 的 HF transformers baseline：

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
import time

tok = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-chat-hf")
m = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-chat-hf",
                                         torch_dtype=torch.float16,
                                         device_map="cuda")
t0 = time.time()
for p in prompts:
    ids = tok(p, return_tensors="pt").to("cuda")
    out = m.generate(**ids, max_new_tokens=128, do_sample=False)
print("HF total:", time.time() - t0)
```

预期：vLLM 比 HF 快 **5-15x**（取决于 batch 大小，越大优势越明显）。

### 阶段 5 — 调参（Tune）

改 block_size 看影响：

- block_size=8：CoW 单次便宜，但 kernel launch overhead 高
- block_size=32：吞吐略升，但内部碎片上限翻倍
- block_size=64：碎片明显，吞吐反而降

跑一组 sweep 画图，会看到 block_size=16-32 是 sweet spot——这就是论文选 16 的依据。

### 阶段 6 — 失败案例（Fail）

故意触发 OOM：

```python
llm = LLM(model="...", gpu_memory_utilization=0.99,
          max_num_seqs=512)  # 太激进
```

观察：vLLM 会触发 **preemption**（RECOMPUTE 模式：把最低优先级的 sequence 整段丢掉，下次重新跑 prefill）。这是 OS 层面的"OOM killer + page fault" 类比。

### 阶段 7 — 提炼（Distill）

把这条路径写成 daily/learnings 笔记：**KV cache 是 LLM 推理的真瓶颈，"切块 + 间接寻址 + 共享" 三件套是任何资源池化系统的通用模板**。下次遇到类似的"对象大小可变、生命周期不一、有共享"问题，先想能不能套这个模板。

## Layer 5 — 谱系（Genealogy）

<Image src="/papers/vllm/02-genealogy.webp" alt="vLLM 谱系：从 attention 优化和 continuous batching 到现代推理框架" width={1600} height={1000} />

### 前作（vLLM 站在谁的肩膀上）

- **FasterTransformer（NVIDIA, 2020）**：第一次把 attention kernel 在 GPU 上做到极致，vLLM 的 attention kernel 直接 fork 它的代码（commit 注释里就写着 `Adapted from NVIDIA/FasterTransformer`）
- **FlashAttention 1/2（Tri Dao, 2022/23）**：tiling + IO-aware 的 attention，是训练侧的革命；vLLM 用的是 prefill 阶段的 FlashAttention，decode 阶段用自己的 PagedAttention
- **Orca（OSDI'22）**：iteration-level scheduling 是 vLLM 的"continuous batching" 思想源头；Orca 的局限（KV 必须连续）正好是 vLLM 要解决的痛点
- **Megatron-LM / DeepSpeed**：训练侧的 TP/PP/ZeRO 启发 vLLM 在 serving 侧做 TP（vLLM 内置 tensor parallel）
- **OS 教科书**：分页、TLB、page table、copy-on-write、reference counting——vLLM 把 50 年前的系统课内容搬到 LLM 推理是它最深的"前作"

### 后作（vLLM 启发了谁）

- **TGI（Hugging Face, 2023 H2）**：在 [text-generation-inference @ b4adbf2f6e2e721280bd0ea5f91d70f7d033f5ed](https://github.com/huggingface/text-generation-inference/tree/b4adbf2f6e2e721280bd0ea5f91d70f7d033f5ed) 的 router/server 里集成 vllm 的 paged_attention kernel，本质是"vLLM 思路 + Rust 路由层"
- **TensorRT-LLM（NVIDIA, 2023）**：官方采纳 paged KV + in-flight batching，把 vLLM 的核心机制做进了 NVIDIA 自家闭源框架
- **DeepSpeed-MII（Microsoft, 2023）**：见 [microsoft/DeepSpeed-MII @ 8abdd987421988a9d50d8b1dfa71ca6283a30f6c](https://github.com/microsoft/DeepSpeed-MII/tree/8abdd987421988a9d50d8b1dfa71ca6283a30f6c)，对标 vLLM 但底层换成 DeepSpeed-Inference，机制类似（block-based KV）
- **SGLang（2024）**：在 PagedAttention 之上做 **RadixAttention**——把 prefix tree 显式化，prefix 共享率从"靠 ref_count 偶然命中"提升到"按 prefix tree 主动复用"
- **Mooncake（Kimi, 2024）**：把 vLLM 的"KV cache 是 first-class citizen" 推到极致，做 KVCache-centric 的 prefill/decode 解耦
- **Distserve（OSDI'24）**：prefill 和 decode 跑在不同机器上，KV cache 跨机传输——vLLM 的 KV 抽象让这种解耦工程上可行
- **SkyPilot 等系统**：把 vLLM 当成默认 serving runtime

### 反对者 / 替代路线（不是所有人都买账）

- **pure HF transformers**：单条请求、离线 eval、研究 prototype，KV 连续够用，不值得引入 vLLM 的复杂度。这条路径在学术界仍然主流
- **单 batch FasterTransformer 派**：高单流吞吐场景（实时翻译、代码补全 IDE 端），单 batch latency 比 throughput 重要，分页带来的间接寻址 overhead（论文 Figure 18 的 -20%）反而是劣势
- **静态 KV cache 派**：极端简单场景（chatbot 永远 reply 短文本，prompt 永远固定长度），静态分配 + 简单 kernel 跑得更快、调试更简单。Anthropic 早期 production 就走这条
- **TokenAttention 派（LightLLM）**：不是按 block 而是按 **token-level paging**——每个 token 一个 page。粒度更细 = 浪费更小，但 page table 大、间接寻址次数翻倍 = kernel 更慢。是与 vLLM 的 trade-off 不同选择
- **S-LoRA / Punica（2024）**：在 vLLM 之上加 paged adapters——把 LoRA 权重也按 page 管理。这是"扩展" 而非"反对"

## Layer 6 — 通用化（LLM serving 选型 / KV cache 决策）

### 选型决策（什么时候用 vLLM、什么时候不用）

- **请求并发 > 8 + 请求长度方差大**：直接上 vLLM，KV 利用率提升 + continuous batching 的吞吐红利在这种 workload 下最大
- **单条请求 / 离线 batch eval**：HF transformers 已够用，引入 vLLM 反而增加部署复杂度（Ray 进程、CUDA 版本兼容、Python 3.x 限制）
- **极致低延迟（< 50ms 首 token）**：vLLM 的调度有 5-10ms overhead，TensorRT-LLM 或定制 FasterTransformer 更合适
- **多模态 / 不规则输入（图片 token 长度不固定）**：vLLM 2024 年之后才支持得比较好，2023 年原版只支持纯文本——选型时看版本

### KV cache 系统设计的通用模式

- **资源池化的三件套**：固定大小 unit + 间接寻址 + 引用计数共享。这套模式适用于任何"对象大小可变 + 生命周期不一 + 有共享"的场景（数据库 buffer pool、JVM 堆、文件系统 inode）
- **block_size 的选择**：太小 → 索引开销大；太大 → 内部碎片大。一般落在 "warp 友好的最小粒度" 附近（GPU 上 16-32 token，CPU 上一般是 4KB page）
- **watermark / safety margin**：永远不要把资源池用到 100%，留 1-5% 缓冲，避免边界 case 触发昂贵的 swap/recompute
- **共享靠引用计数**：parallel sampling、beam search、prefix sharing——只要工作负载有"多个消费者读同一份数据" 模式，引用计数 + CoW 就有用武之地

### LLM 推理工程一般经验

- **decode 阶段是 memory-bound** 不是 compute-bound：KV cache 读带宽决定吞吐上限，所以"塞更多 batch" 比"算更快" 更重要
- **prefill 和 decode 是不同的瓶颈**：prefill 是 compute-bound（FlashAttention 直接打满），decode 是 memory-bound（PagedAttention 优化方向）。Distserve / Mooncake 把它们解耦是顺势而为
- **continuous batching 的前提是 KV 可分页**：没有 vLLM 的 KV 抽象，Orca 的调度想法只能实现 60% 价值
- **OS 概念在 ML 系统里反复出现**：分页、虚拟内存、调度器、ABA、wait-die——多读 OSTEP / Operating Systems 三件套对 ML infra 工程师的长期回报远大于读最新 paper

### 工程落地避坑

- **gpu_memory_utilization 不要硬拉 0.99**：留 5-10% 给 activation 峰值和 fragment，否则 OOM 触发 preempt 反而拖慢吞吐
- **block_size 别瞎调**：默认 16 是 ShareGPT 上跑出来的最优，除非自己有完整 trace + 有时间做 sweep，不要动
- **多模型部署优先 LoRA 共享 base model**：vLLM + S-LoRA 比"每个模型起一个 vLLM 实例" 节省 5-10x 显存
- **prefix caching（v0.4+）默认开**：现代 vLLM 自动按 prefix tree 复用 block，无需手动管理；但要监控 prefix cache hit rate，太低说明 workload 没共享，可以关掉省管理开销

## Layer 7 — 怀疑与验证（≥ 4 处）

### 怀疑 1：96% 的 memory utilization 数字到底准不准？

论文 Figure 14 给的 utilization 96.3% 是怎么定义的？是"被占用的 block 数 / 总 block 数"，还是"实际有 KV 内容的 token 数 / block 总容量"？

如果是前者，因为 block_size=16 而 sequence 长度任意，**末尾 block 平均只填一半**，真实 token-level utilization 应该是 96% × ~75% ≈ 72%。

需要看 paper 定义并跑实验验证：在生成中途打印 `total_filled_tokens / (num_used_blocks * block_size)`。

### 怀疑 2：CoW 频率在 parallel sampling 下会不会成为瓶颈？

旁注里推算过：N=4 sampling 时第一个 decode step 触发 N-1=3 次 CoW，每次拷贝 1 个 block（≈2.5MB）→ 累计 7.5MB GPU memcpy。

对比 batch=1 的 decode（只读 KV，无 copy）：多 7.5MB 写入，按 A100 HBM 1.5TB/s 算，**只有 5μs**。理论上不是瓶颈，但 kernel launch overhead 可能放大。

需要 nsys profile 验证 vLLM 在 N=4 vs N=1 的 decode step latency 差。

### 怀疑 3：PagedAttention kernel 慢 20-26% 的开销在哪？

论文 Figure 18 直接给了数字但没归因。我猜两部分：

- **间接寻址**：block_table[block_idx] 多一次 int load + 乘法（~5 cycle / block）
- **shared memory 利用率下降**：block 边界处的 K/V 读取可能跨越两个 physical block，shared memory 复用率比连续 KV 差

需要 nsys 看 kernel 的 SM 利用率、shared memory throughput，对比 FasterTransformer 同等 batch。

### 怀疑 4：block_size=16 真的是普适最优吗？

论文用的是 ShareGPT trace（平均长度 ~256 token）。如果 workload 是：

- 极短回复（chatbot reply 平均 50 token）：block_size=8 或更小可能更优（碎片小）
- 极长 context（128k token RAG）：block_size=64 或 128 可能更优（page table 小）

需要拿不同 trace 做 sweep，验证 block_size 的最优值是不是 workload-dependent。

### 怀疑 5：preemption 的 RECOMPUTE 与 SWAP 怎么选？

论文 4.5 节同时给了两种 preemption 模式但没明确什么时候用哪个。我猜：

- short prompt → RECOMPUTE 便宜（重跑 prefill < 来回 swap CPU）
- long prompt → SWAP 划算（一次拷贝 KV 到 CPU 比重跑 prefill 快）

需要看 v0.2.0 的 [scheduler.py @ e2fb71ec9f2c3168ba8614408fa807a5f65707c5](https://github.com/vllm-project/vllm/blob/e2fb71ec9f2c3168ba8614408fa807a5f65707c5/vllm/core/scheduler.py) 里的 preemption 逻辑：是否按 seq_len 或 KV block 数动态选模式。

## Layer 8 — 方法限制（≥ 4 条）

### 限制 1：依赖 KV cache 这一前提

PagedAttention 是 KV cache 的内存管理方案——只有在 **autoregressive decode + KV cache** 范式下才有意义。

- 不适用于 BERT-style encoder-only 模型（无 KV cache）
- 不适用于 Mamba / RWKV 等 state-space 模型（state 大小固定，无浪费可省）
- 不适用于 diffusion 模型（去噪步骤无 cache 复用）

未来如果 LLM 转向 SSM 架构，PagedAttention 价值就归零。

### 限制 2：block_size 是 workload-dependent 但被硬编码为编译期常量

CUDA kernel 的 `BLOCK_SIZE` 是 template 参数（编译期常量），意味着每次改 block_size 都要重编译。

实际 production 部署时，多 tenant workload 长度分布不一，理论上不同模型应该用不同 block_size——但 vLLM 一个进程只能跑一个 block_size。

后来 SGLang / Mooncake 通过 dynamic block_size 部分缓解，但 kernel 本身仍是固定的。

### 限制 3：调度策略是 FCFS，无 SLO 感知

[v0.2.0 scheduler @ e2fb71ec9f2c3168ba8614408fa807a5f65707c5](https://github.com/vllm-project/vllm/blob/e2fb71ec9f2c3168ba8614408fa807a5f65707c5/vllm/core/scheduler.py) 用的是 `policy_name="fcfs"`，先到先服务。

这导致：

- 优先级高的请求（付费用户）排在低优先级请求后面
- 长 prompt 把 GPU 占满后，短 prompt 也只能等
- 没有 deadline / SLO 反馈机制

后来的 vllm-v1 加了 priority 和 SLO，但 paper-era 完全没有。

### 限制 4：跨节点共享被隔绝

PagedAttention 的 block pool 是**单 GPU local**——多卡 TP 时每个 rank 各管一份，跨 rank 的 block 不能直接共享。

这意味着：

- 多 tenant 部署里，user A 在 rank 0 的 sequence 和 user B 在 rank 1 的 sequence 即使 prompt 完全一样，也不能复用 KV
- 跨节点更不用说

后来 Mooncake 的 KVCache-centric 架构、Distserve 的解耦，本质是在补这个洞。

### 限制 5：CPU swap 路径的真实可用性存疑

论文提到 SWAP preemption（把 block 拷到 CPU 内存），但 PCIe 4.0 单向 32 GB/s，把 1 个 sequence 的 1.6 GB KV 拷过去要 50ms——decode 步长才 30ms 左右，**SWAP 的代价比直接 RECOMPUTE 还高**。

实测 v0.2.0 默认 SWAP 而非 RECOMPUTE，但 community 里很多 issue 反映 SWAP 路径不稳定，后续版本默认改为 RECOMPUTE。

## Layer 9 — 元数据

- **状元篇分支**：A method（方法论文：提出新机制，给出实现，跑大量 ablation 证明优越）
- **季 / 集**：P 季 P3（继 Megatron-LM P1、ZeRO P2 之后，是 LLM infra 三件套的第三块）
- **学习路径**：先读 Layer 0-2 把 paged 思想和 OS 类比建立起来；再看 Layer 3 三段代码体感"控制面 + 数据面"分层；Layer 4 跑一遍 demo 看真数字；Layer 5-6 横向看谱系和通用模式
- **关联笔记**：[Megatron-LM](/papers/megatron-lm/)（同一系列的训练侧切分）、[DeepSpeed ZeRO](/papers/deepspeed-zero/)（训练侧的内存切分）、[FlashAttention](/papers/flashattention/)（attention kernel 优化）
- **后续阅读**：SGLang RadixAttention paper、Mooncake KVCache-centric paper、Distserve OSDI'24
- **本笔记 commit hash 引用**：
  - vLLM main HEAD：`7e53283b1c28868ea01d88dd20504b61ea971bae`（截至撰写时）
  - vLLM v0.2.0（论文版本）：`e2fb71ec9f2c3168ba8614408fa807a5f65707c5`
  - TGI HEAD：`b4adbf2f6e2e721280bd0ea5f91d70f7d033f5ed`
  - DeepSpeed-MII HEAD：`8abdd987421988a9d50d8b1dfa71ca6283a30f6c`

## 一句话收尾

**vLLM 的发明告诉我们：很多 ML 系统瓶颈不是新算法解决，而是回头读 50 年前的 OS 教科书把"存储抽象" 重做一遍。** 当遇到"对象大小可变 + 共享 + 生命周期错位" 这种问题时，先问自己——OS 是怎么解的？答案大概率是分页、引用计数、copy-on-write 三件套。
