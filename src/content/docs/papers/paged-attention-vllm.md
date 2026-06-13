---
title: PagedAttention 与 vLLM — 零基础学习笔记
来源: https://arxiv.org/abs/2309.06180
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：自习室长桌 vs 分页笔记本

想象你经营一家**共享自习室**（GPU 显存），同时服务很多来写论文的学生（推理请求）。每个学生写到哪里，就要把**前面所有页的笔记**摊在桌上——因为写新句子时，得回头查阅之前写过的每一个词（这就是 Transformer **自回归 attention**）。这些摊开的笔记，就是 **KV cache**。

**旧系统的做法**像给每位学生划一整条**连续长桌**：

- 前台说：「你最多写 2048 页，桌子先占好。」
- 学生只写了 30 页，后面 2018 页空着，也不能借给别人（**内部碎片**）。
- A 同学占 100 页、B 占 500 页，中间空出来的「已预订但未用」区域互相填不满（**外部碎片**）。
- 高峰时明明还有很多空椅子，却因为凑不出**一整条**连续空桌，新学生进不来——GPU 算力闲着，batch 却上不去。

**PagedAttention 的做法**像操作系统里的**分页内存**：

- 把笔记切成固定大小的**块（block）**，每块装固定数量 token 的 Key/Value。
- 每个学生拿一张**块表（block table）**：逻辑上的第 1、2、3…块对应仓库里哪几个物理抽屉，抽屉**不必相邻**。
- 写满一块再领下一块；最后一块装不满时，最多浪费「不到一整块」——论文称整体浪费 **< 4%**。
- 两个学生写了相同开头（相同 prompt），可以**共享**前几块的物理副本；谁要改自己的分支时再**写时复制**（copy-on-write）。

一句话：**KV cache 不再是一块连续大数组，而是「页表 + 物理页帧池」——这就是 vLLM 能把吞吐拉高 2–4× 的根因。**

---

## 是什么

**Efficient Memory Management for Large Language Model Serving with PagedAttention**（Kwon 等，**SOSP 2023**，arXiv:[2309.06180](https://arxiv.org/abs/2309.06180)）提出：

1. **PagedAttention**：借鉴 OS 虚拟内存与分页，把 attention 的 KV cache 存成**非连续**的固定大小块，用 block table 做逻辑到物理的映射。
2. **vLLM**：在其上实现的分布式 LLM **推理 serving 引擎**，与块级内存管理、抢占式调度（preemption）协同设计。

| 项目 | 内容 |
|------|------|
| 会议 | SOSP 2023（系统顶会） |
| 机构 | UC Berkeley Sky Computing Lab 等 |
| 开源 | [github.com/vllm-project/vllm](https://github.com/vllm-project/vllm) |
| 对比基线 | FasterTransformer、Orca 等 |
| 效果 | 同延迟下吞吐约 **2–4×**；序列更长、模型更大、解码越复杂，优势越明显；**不改变模型精度** |

---

## 为什么重要

不理解 PagedAttention / vLLM，下面几件事很难讲清楚：

- 为什么 **vLLM** 一度成为开源 LLM 服务的默认底座，而 HuggingFace `generate()` 在并发场景下慢一个数量级
- 为什么 **batch size** 能直接决定推理吞吐——KV cache 管不好，GPU 算力再强也在「等显存」
- 为什么 **beam search、parallel sampling（best-of-n）** 以前很吃内存，在 vLLM 里变得生产可用
- 为什么这篇论文发在 **SOSP** 而不是纯 ML 会——它本质是**操作系统式内存管理**问题
- 为什么后来的 **SGLang（RadixAttention）、prefix caching、speculative decoding** 都要和「KV 怎么存、怎么共享」一起想

---

## 核心概念

### 1. KV cache：推理时真正吃显存的大户

自回归解码时，每生成一个新 token，都要对**之前所有 token** 做 attention。为免重复算 K/V，每层会把历史 token 的 **Key、Value** 向量缓存下来，称为 **KV cache**。

特点：

- 大小随**已生成长度**线性增长（每层、每 token 存一份 K 和 V）
- batch 推理时**每个请求各有一份**
- 粗略量级：7B 模型、FP16、32 层、hidden 4096，**每 token 约 0.5MB**；生成 2048 token 约 **1GB/请求**

权重是静态的；KV 是**动态变长**的——这才是 serving 的内存难题。

### 2. 两类碎片 + 冗余复制

| 问题 | 含义 | 后果 |
|------|------|------|
| **内部碎片** | 按 `max_seq_len` 预留槽位，实际只用一小段 | 大量空白 KV 槽无法给别人 |
| **外部碎片** | 多请求释放后留下无法合并的「空洞」 | 总空闲显存够，却放不下新的**连续**分配 |
| **冗余复制** | beam / 多采样各复制一份相同 prompt 的 KV | 相同前缀被存多份 |

### 3. PagedAttention 的三件套

借鉴 OS **虚拟内存 + 分页**：

| OS 概念 | PagedAttention 对应 |
|---------|---------------------|
| 虚拟页 | **逻辑 block**（固定 token 数，如 16） |
| 物理页帧 | **物理 block**（GPU 池里等大槽位） |
| 页表 | **Block table**（每请求：逻辑 block → 物理 block id） |
| 进程 | **Request / Sequence** |

Attention kernel 按 block table **gather** 非连续的 K/V，再计算 attention。逻辑序列连续可读；物理上可在显存池**任意位置**。

### 4. vLLM 系统架构（与算法协同）

- **Centralized scheduler**：决定哪些请求进 batch、何时 **preempt**（抢占）换出 KV block
- **KV cache manager**：维护 block pool、block table、**引用计数**
- **Continuous batching**（延续 Orca 思路）：请求随时加入/完成，不等整批齐
- **块级共享 + COW**：parallel sampling / beam search 共享前缀 block，分叉写入时再复制

论文称复杂采样场景内存可降约 **55%**，吞吐最高约 **2.2×**。

### 5. 与 FlashAttention 的分工（初学者易混）

| | 解决什么 |
|---|----------|
| **FlashAttention** | attention **怎么算快**（IO 友好、分块 softmax） |
| **PagedAttention** | KV **怎么存**（分页、共享、少浪费） |

现代 vLLM **两者都用**；本篇贡献在后者。

---

## 代码示例

### 示例 1：用「块表」理解逻辑 token → 物理 block

下面不是 vLLM 源码，而是用 Python 模拟 **PagedAttention 的核心数据结构**：每个请求一张 block table，读 KV 时先查表再取块。

```python
BLOCK_SIZE = 4  # 每 block 存 4 个 token 的 K/V（示意）

# 物理池：physical_block_id -> 该块内容（真实系统存 tensor）
physical_pool = {
    0: ["你", "好", "世", "界"],
    1: ["！", "今", "天", "天"],
    2: ["气", "不", "错", "<pad>"],  # 最后一块可能未满
}

# 请求 A：10 个 token -> ceil(10/4)=3 个逻辑 block
block_table_a = [0, 1, 2]  # 逻辑 block i -> 物理 block id

def gather_kv(block_table, num_tokens):
    """模拟 attention 前按块表拼出逻辑序列上的 KV"""
    tokens = []
    for logical_idx, phys_id in enumerate(block_table):
        block = physical_pool[phys_id]
        start = logical_idx * BLOCK_SIZE
        end = min(start + BLOCK_SIZE, num_tokens)
        tokens.extend(block[: end - start])
    return tokens

print(gather_kv(block_table_a, num_tokens=10))
# ['你', '好', '世', '界', '！', '今', '天', '天', '气', '不']
```

新 token 生成时：若当前最后一块已满，向 pool **申请新 physical block**，追加到 block table——**无需**为整段 `max_model_len` 预留连续显存。

### 示例 2：连续预留 vs 分页的显存浪费

```python
import math

MAX_SEQ = 2048
BLOCK_SIZE = 16
actual_lens = [32, 128, 512, 1800]  # 四个并发请求的真实长度

contiguous_slots = len(actual_lens) * MAX_SEQ
contiguous_used = sum(actual_lens)

def paged_slots(length):
    return math.ceil(length / BLOCK_SIZE) * BLOCK_SIZE

paged_total = sum(paged_slots(L) for L in actual_lens)
paged_waste = paged_total - contiguous_used
contiguous_waste = contiguous_slots - contiguous_used

print(f"连续预留: 槽位 {contiguous_slots}, 浪费 {contiguous_waste}")
print(f"分页:     槽位 {paged_total}, 浪费 {paged_waste}")
print(f"分页浪费约为连续方案的 {paged_waste / contiguous_waste:.1%}")
```

当 `actual_len << max_seq_len` 时，连续预留浪费是 **O(batch × max_seq)**；分页浪费约 **O(batch × block_size)**（每序列最后一个 block 的尾部）。

### 示例 3：vLLM 真实 API（引擎内部自动分页）

```python
from vllm import LLM, SamplingParams

# 内部：block pool + block table + PagedAttention CUDA kernel
llm = LLM(model="meta-llama/Llama-2-7b-chat-hf", tensor_parallel_size=1)

prompts = [
    "用三句话解释 PagedAttention：",
    "写一首关于分页内存的五言绝句：",
]
outputs = llm.generate(
    prompts,
    SamplingParams(temperature=0.8, max_tokens=128),
)

for out in outputs:
    print(out.outputs[0].text)
```

安装：`pip install vllm`（需 CUDA）。你无需手动管理 block table——**PagedAttention 在引擎内部生效**。

---

## 实践案例

### 案例 1：在线 API（长短请求混杂）

100 个用户同时聊天，有的 20 token、有的 2000 token。

- **连续 KV**：常按 `max_model_len` 划区 → 内部碎片大，batch 可能只有 8
- **vLLM**：按真实长度块式增长 → 同样 24GB 卡 batch 可能 32+，吞吐近线性提升

### 案例 2：Parallel sampling（同一 prompt 4 个回答）

四个 completion **共享 prompt 前缀**的 KV blocks，仅在后缀 COW 分叉。旧系统常 **4 份全量复制** prefix；PagedAttention **块级共享**，parallel sampling 从「演示」变「生产可用」。

### 案例 3：与 Continuous Batching 配合

请求 A 完成 → 释放 block → 立刻分配给新请求 D。分页使释放粒度从「整段 max_len」变成「若干 block」，**周转更快**，GPU 少空转。

---

## 踩过的坑

1. **PagedAttention ≠ FlashAttention**：前者管**存储布局**，后者管**计算融合**。
2. **block_size 要权衡**：太小 → 块表/metadata 开销大；太大 → 最后一块内部碎片上升（常见 16/32）。
3. **max_model_len 仍要设**：分页不是无限长度，总 block 数受**显存**限制；只是不再为短请求白占长槽。
4. **「block」一词多义**：vLLM 的 KV **block** ≠ CUDA **thread block**（官方文档专门提醒）。
5. **代码演进快**：vLLM 后续有 prefix caching、Chunked Prefill、speculative decoding 等；PagedAttention 仍是 KV 管理的根思路，细节以 [docs.vllm.ai](https://docs.vllm.ai/) 为准。

---

## 适用 vs 不适用

**适用**：

- 高并发 **LLM API**（Chat 类产品）
- **长上下文**生成（KV 随长度暴涨）
- **beam search / best-of-n / parallel sampling**
- 固定 GPU 上把**吞吐**压到极限

**收益较小**：

- 单次本地一条短句、batch=1——瓶颈可能在加载模型
- **训练**阶段——KV 分页是 **推理 serving** 问题，训练用不同优化栈

---

## 与相关工作的关系

```text
Orca (OSDI'22)          → continuous batching，KV 仍易碎片
FasterTransformer       → 高性能 kernel，内存管理较传统
PagedAttention / vLLM   → 分页 KV + 块共享 + 抢占调度
FlashAttention-2        → 计算侧加速，常集成进 vLLM
SGLang RadixAttention   → 前缀树共享 KV（思路互补）
```

---

## 历史小故事（可跳过）

- **2023-06**：vLLM 博客首次公开 PagedAttention，特定 benchmark 下相对 HF Transformers 吞吐最高约 **24×**。
- **2023-09**：arXiv 2309.06180；**SOSP 2023** 发表；作者含 Ion Stoica、Joseph Gonzalez 等系统方向学者。
- **之后**：vLLM 成为 vllm-project 核心项目，被大量 OpenAI 兼容 API 栈与云厂商集成。

---

## 自测题

1. KV cache 为什么比模型权重更「动态」、更难管？
2. 内部碎片和外部碎片分别是什么？PagedAttention 主要消哪种？
3. block table 和 OS 页表各对应什么？
4. beam search 在旧系统里为什么特别吃显存？vLLM 怎么缓解？
5. PagedAttention 和 FlashAttention 是不是同一层问题？

<details>
<summary>参考答案（先自己做）</summary>

1. 权重固定；KV 随**已生成 token 数**增长，且每请求长度未知、完成时间不同。
2. 内部：为 max_len 预留未用槽；外部：释放后无法合并的空洞。分页把浪费压到**每序列最后一个 block 尾部**，并消除大块外部碎片。
3. block table ≈ 页表；logical block ≈ 虚拟页；physical block pool ≈ 物理页帧。
4. 每个 beam 复制一份 KV；**块级共享前缀 + 写时复制**。
5. 不是。PagedAttention = **KV 存储与共享**；FlashAttention = **attention 计算 IO 优化**。

</details>

---

## 延伸阅读

- 论文：[arXiv:2309.06180](https://arxiv.org/abs/2309.06180)
- 博客：[vLLM: Easy, Fast, and Cheap LLM Serving with PagedAttention](https://vllm.ai/blog/2023-06-20-vllm)
- 代码：[github.com/vllm-project/vllm](https://github.com/vllm-project/vllm)
- 设计背景：[vLLM PagedAttention design note](https://docs.vllm.ai/en/latest/design/paged_attention/)
- 前置：[[attention]]（Transformer 与 KV 从哪来）、[[gpt-3]]（自回归解码）
