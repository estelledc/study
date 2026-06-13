---
title: FlashInfer — LLM 推理的「万能 attention 引擎」零基础笔记
来源: https://arxiv.org/abs/2501.01005
日期: 2026-06-13
子分类: ml
分类: 机器学习
provenance: pipeline-v3
---

## 从日常类比开始：外卖平台的「中央厨房 + 现炒档口」

想象你经营一家**大型外卖平台**（LLM 推理服务），同时接很多订单：

- 有的顾客要**整桌宴席**（prefill：一次吃进几千 token 的长 prompt）；
- 有的只要**加一道菜**（decode：每步只生成 1 个 token，但要回头翻整本菜谱）；
- 有的订单**开头完全一样**（共享 system prompt / RAG 文档前缀）；
- 有的走**猜菜再确认**流程（speculative decoding：先草稿、再并行验证）。

厨房如果只备**一种灶台**、**一种切菜规则**，要么宴席档口闲着、要么快餐档口排队——这就是早期 LLM serving 里 attention kernel 的困境：**每个框架（vLLM、SGLang、MLC）各自写一套 CUDA，维护成本高，还吃不满 GPU**。

**FlashInfer**（Ye 等，MLSys 2025，arXiv [2501.01005](https://arxiv.org/abs/2501.01005)）的做法像建一座**中央厨房基础设施**：

1. **统一食材摆放标准**（block-sparse KV cache 格式）——分页表、Radix 树、树形 speculative mask，都能映射成同一种「块稀疏矩阵」；
2. **现炒档口按订单定制**（JIT 编译 attention 变体）——滑动窗口、logit soft-cap、FlashSigmoid 等，不必为每种变体手写全套 kernel；
3. **调度员动态分锅**（负载均衡调度）——batch 里谁长谁短随时变，仍尽量让每个 SM 都有活干，且能和 **CUDA Graph**（要求静态配置）和平共处。

一句话：**FlashInfer 不是又一个 FlashAttention，而是把「推理场景里所有 attention 怎么存、怎么算、怎么调度」收成一套可定制、可生成的引擎**——已被 vLLM、SGLang、MLC-Engine、TensorRT-LLM 等集成。

---

## 是什么

| 项目 | 内容 |
|------|------|
| 论文 | *FlashInfer: Efficient and Customizable Attention Engine for LLM Inference Serving* |
| 作者 | Zihao Ye, Lequn Chen, Ruihang Lai, Wuwei Lin 等（UW / CMU / NVIDIA 等） |
| 会议 | MLSys 2025 |
| 开源 | [github.com/flashinfer-ai/flashinfer](https://github.com/flashinfer-ai/flashinfer) |
| 定位 | **推理专用** attention kernel 库 + **代码生成 / JIT** 引擎 |
| 效果（论文） | 相对编译器后端：**29–69%** 词间延迟下降；长上下文：**28–30%**；并行生成：**13–17%** 加速 |

论文要解决的核心矛盾：

- **工作负载多样**：prefill、decode、增量 prefill、prefix 共享、speculative 树 attention……
- **硬件与格式多样**：PagedAttention、RadixAttention、GQA/MQA、不同 GPU 架构（Turing → Blackwell）、不同 mask / score 变体。

过去每个 serving 框架各写一套 kernel → 重复劳动、难以跟上新模型特性。FlashInfer 用 **「统一数据抽象 + 模板 JIT + 动态调度」** 把维护面收成一层。

---

## 为什么重要

不理解 FlashInfer，下面几件事很难串起来：

- 为什么 **vLLM / SGLang** 近年把 attention 底层迁到 FlashInfer，而不只依赖 FlashAttention-2 单体库
- 为什么 **PagedAttention**（块表）和 **RadixAttention**（前缀树）在实现上可以共用同一套 kernel 接口
- 为什么推理要单独谈 **decode tile size = 1**、**prefill tile size = 128**——训练 kernel 直接搬过来会慢
- 为什么 **CUDA Graph** 能显著降延迟，却又和「动态 batch、变长序列」冲突——FlashInfer 的调度是为这个张力设计的
- 为什么新模型一出 **sliding window、MLA、logit soft-cap**，框架能快速跟上是 JIT 变体在起作用

它和 **FlashAttention** 的关系：FlashAttention 优化的是「单次 attention 的 IO」；FlashInfer 站在 **serving 系统** 视角，把 KV 怎么摆、batch 怎么切、变体怎么编译、SM 怎么分活，一起解决。

---

## 核心概念

### 1. Block-Sparse Row（BSR）统一 KV 存储

KV cache 在 serving 里往往不是连续大数组：

- **PagedAttention**：逻辑块 → 物理块，通过 page table 索引；
- **RadixAttention**：共享前缀在树上复用物理块；
- **Speculative decoding**：树形 attention mask。

FlashInfer 证明：这些都能看成 **块稀疏矩阵（BSR）**：

- 行块大小 \(B_r\)：通常对齐 **query tile**（一次几个 query 一起算）；
- 列块大小 \(B_c\)：由 KV 管理策略决定（常为 1 个 token 一块，或更大块）。

非零块 = 真正要读的 KV 页；零块直接跳过。这样 **一种 kernel 读写逻辑** 就能覆盖多种 serving 内存布局。

### 2. Composable Formats（可组合格式）

同一 batch 里，不同请求对 KV 的访问模式不同：

- 共享前缀部分：多行 query 读**同一段** KV → 适合大 \(B_r\)，在 shared memory 里复用；
- 各自后缀部分：每行独立 → 适合 \(B_r=1\)。

FlashInfer 把 KV **拆成多个 BSR 子矩阵**（不必搬数据，只拆 index），分别用最优块大小计算，再用 **Attention State 组合**（见下）合并结果——类似「大锅炖公共汤底 + 小炒锅炒个性配菜」。

### 3. Attention State 与 \(\oplus\) 组合算子

来自 online softmax / Flash-Decoding 思想：attention 不必一次算完，可以分块算 **局部状态**，再合并。

对每个 index 集合 \(\mathcal{I}\)，保存二元组：

- \(\mathbf{LSE}(\mathcal{I})\)：log-sum-exp of scores（logits 的「归一化分母」的对数形式）；
- \(\mathbf{O}(\mathcal{I})\)：加权 value 输出。

两块 \(\mathcal{I}, \mathcal{J}\) 的结果用 \(\oplus\) 合并（与 FlashAttention 的 online softmax 更新同源）。**可结合、可交换** → 适合：

- 长 KV 分 chunk 并行；
- composable format 多子矩阵；
- cascade / 分层 KV。

FlashInfer 把 **Attention State** 当作 attention op 的标准输出类型（类似 GEMM 里的累加器）。

### 4. 多 Tile 尺寸 + 架构感知模板

训练向 prefill 优化，推理还要照顾 **decode（\(l_{qo}=1\)）**：

- query tile \(T_q \in \{1,16,32,64,128\}\)；
- KV tile 多种组合；
- \(T_q=1\) 走 **CUDA Core**（tensor core 最小行宽 16，单 token decode 用不上）；
- Hopper 上 FA3 路径用 WGMMA，tile 为 64 的倍数。

根据 **平均 query 长度、寄存器/共享内存预算、SM 占用率** 启发式选 tile——同一套模板，编译期定参数。

### 5. JIT 可定制 Attention 变体

维护「每个模型一种手写 CUDA」不可持续。FlashInfer 提供 **变体规约（variant specification）**，用户用 CUDA 片段定义 functor：

| Functor | 作用 |
|---------|------|
| `QueryTransform` / `KeyTransform` / `ValueTransform` | 算分前对 Q/K/V 变换（可融合 RoPE、RMSNorm） |
| `LogitsTransform` / `LogitsMask` | softmax 前改 logits（滑动窗口、soft-cap） |
| `OutputTransform` | 输出后处理 |

JIT 把变体 **填进 FlashAttention 骨架模板**，PyTorch extension 编译注册为 custom op。灵感来自 **FlexAttention**，但面向 **推理 serving + block-sparse KV**。

### 6. 负载均衡调度 + CUDA Graph 兼容

Serving batch 里每个请求的 \(l_{qo}, l_{kv}\) 时刻在变。FlashInfer 运行时：

1. 按 query tile \(T_q\) 切 tile，估算每 tile 代价 \(\text{cost} = \alpha l_q + \beta l_{kv}\)；
2. 把 KV 再切成 chunk，**贪心 / 优先队列** 分给各 CTA，平衡 SM 负载；
3. **编译期** 定 tile 配置，**运行期** 只喂序列长度——满足 CUDA Graph「图结构静态、张量地址固定」的要求。

受 **Stream-K** 启发，但 **不用原子累加**（避免非确定性输出，serving 要可复现）。

### 7. 与 FlashAttention-2/3 的分工

| 层次 | FlashAttention | FlashInfer |
|------|----------------|------------|
| 主要场景 | 训练 / 通用前向 | **LLM inference serving** |
| KV 布局 | 多为稠密或简单 mask | **Paged / Radix / 树 / 稀疏** 统一 BSR |
| 变体扩展 | 相对固定 | **JIT 模板** |
| 调度 | 较少涉及 batch 动态 | **CTA 级负载均衡** |
| 集成 | PyTorch SDPA 后端 | vLLM、SGLang、MLC 等 **引擎内核** |

FlashInfer 内部可选用 FA2（Ampere 及以前）或 FA3（Hopper）作为微内核，外面再包 serving 语义。

---

## 代码示例

### 示例 1：单请求 decode — `single_decode_with_kv_cache`

最基础的推理形态：query 只有 **当前 1 个 token**，KV 是历史 cache。

```python
import torch
import flashinfer

# q: [num_qo_heads, head_dim] — decode 时通常只有 1 个 query token
# k, v: [kv_len, num_kv_heads, head_dim] — 历史 KV（或本步 append 前）
q = torch.randn(32, 128, device="cuda", dtype=torch.float16)
k = torch.randn(2048, 32, 128, device="cuda", dtype=torch.float16)
v = torch.randn(2048, 32, 128, device="cuda", dtype=torch.float16)

output = flashinfer.single_decode_with_kv_cache(q, k, v)
# output.shape == q.shape
```

对比朴素 PyTorch attention，FlashInfer 在 **小 query、长 KV** 的 decode  regime 下用对 tile 与内存访问模式，这正是 serving 里占大头的路径。

### 示例 2：Paged KV batch decode — `BatchDecodeWithPagedKVCacheWrapper`

与 **vLLM PagedAttention** 同构：每个序列的 KV 存在 **非连续物理块** 里，用 `indptr` / `indices` 描述块表。

```python
import torch
import flashinfer

num_layers = 32
num_heads = 32
head_dim = 128
page_size = 16          # 每块存 16 个 token 的 KV
max_num_pages = 1024
batch_size = 8

# 物理 KV 池：[num_pages, 2, page_size, num_heads, head_dim]（2 = K 与 V）
kv_cache = torch.randn(
    max_num_pages, 2, page_size, num_heads, head_dim,
    device="cuda", dtype=torch.float16,
)

# 块表：indptr 长度 batch+1，indices 列出每个序列占用的物理页号
kv_page_indptr = torch.tensor(
    [0, 3, 5, 8, 10, 12, 15, 18, 20], device="cuda", dtype=torch.int32
)
kv_page_indices = torch.randint(
    0, max_num_pages, (20,), device="cuda", dtype=torch.int32
)
# 每个序列最后一页用了几个 slot（未满页）
kv_last_page_len = torch.tensor(
    [16, 8, 12, 16, 4, 16, 10, 16], device="cuda", dtype=torch.int32
)

# 当前步要 attend 的 query：[batch, num_heads, head_dim]
q = torch.randn(batch_size, num_heads, head_dim, device="cuda", dtype=torch.float16)

wrapper = flashinfer.BatchDecodeWithPagedKVCacheWrapper(
  torch.empty(128 * 1024 * 1024, dtype=torch.uint8, device="cuda")  # workspace
)
wrapper.plan(
    kv_page_indptr, kv_page_indices, kv_last_page_len,
    num_heads, num_heads, head_dim, page_size, causal=True,
)
output = wrapper.run(q, kv_cache)
```

`plan()` 阶段根据 batch 的序列长度做 **调度与 tile 选择**；`run()` 执行 kernel。同一 `plan` 可配合 **CUDA Graph 捕获**，降低每 token 的 CPU launch 开销——这是论文强调的工程点。

### 示例 3（补充）：prefill + decode 混合 — POD-Attention 思路

生产 batch 常 **prefill 与 decode 混在同一 forward**。FlashInfer 提供 **POD-Attention** 等融合路径，避免为两类请求各跑一遍完整 kernel 流水线。概念上：

```python
# 伪代码：同一 batch 内 ragged Q，BSR 格式 KV，一次 launch 覆盖多 phase
# flashinfer 高层 API 随版本演进，核心是「ragged query + block-sparse KV」统一入口
outputs, lse = flashinfer.prefill_with_paged_kv_cache(
    q_ragged, kv_cache, kv_page_indptr, kv_page_indices, kv_last_page_len,
    causal=True,
)
```

具体函数名以 [docs.flashinfer.ai](https://docs.flashinfer.ai) 为准；论文贡献在于 **数据结构与调度** 支持这种混合，而非单一函数名。

---

## 论文实验结果（精读摘要）

| 场景 | 对比对象 | 主要结论 |
|------|----------|----------|
| LLM serving benchmark | 编译器类后端（如 torch.compile 路径） | 词间延迟 **↓29–69%** |
| 长上下文推理 | 同类 serving 方案 | 延迟 **↓28–30%** |
| Parallel generation（beam / 多分支） | 基线引擎 | **13–17%** 端到端加速 |
| Kernel micro-benchmark | FlashAttention-2、xformers 等 | 多配置下吞吐领先或持平，优势在 **异构 batch + paged KV** |

评估覆盖 **kernel 级** 与 **端到端 serving**；集成框架包括 vLLM、SGLang、MLC-Engine。

---

## 与相关工作的关系

```text
FlashAttention (IO-aware 精确 attention)
        ↓ 微内核算法
FlashInfer (serving 层：BSR KV + JIT 变体 + 调度)
        ↓ 被集成
vLLM (PagedAttention) / SGLang (RadixAttention) / MLC-Engine / TensorRT-LLM
```

- **[PagedAttention / vLLM](paged-attention-vllm.md)**：解决 KV **怎么分页**；FlashInfer 解决 **分页后 attention 怎么快算**。
- **[SGLang / RadixAttention](sglang-radixattention.md)**：解决前缀 **怎么共享**；FlashInfer 用 composable BSR **吃共享前缀**。
- **FlashAttention-2/3**：单算子极致；FlashInfer **包一层 serving 语义** 并 JIT 变体。
- **FlexAttention**：训练侧灵活 mask；FlashInfer 把类似 **functor** 思想带到 **CUDA JIT + 推理 KV**。

---

## 安装与验证（工程向）

```bash
pip install flashinfer-python
# 可选：预编译 cubin / jit-cache，减少首次编译等待
pip install flashinfer-cubin
pip install flashinfer-jit-cache --index-url https://flashinfer.ai/whl/cu129

flashinfer show-config   # 确认 CUDA arch、缓存路径
```

支持 GPU：SM75（Turing）至 Blackwell；CUDA 12.6+。日志调试：`FLASHINFER_LOGLEVEL=3`。

---

## 局限与后续方向（论文自述）

- 更高层 DSL（如 TensorIR 类）编译到 FlashInfer 规约，降低手写 functor 成本；
- 更多后端（Triton、其他厂商 NPU）的代码生成；
- 新 attention（MLA、FP8/FP4 KV）需持续扩展模板与调度启发式。

---

## 自测题

1. 为什么 PagedAttention 的 page table 可以看成 BSR 稀疏矩阵？\(B_c=1\) 时列块代表什么？
2. decode 阶段为什么常用 \(T_q=1\) 的 tile，且走 CUDA Core 而非 Tensor Core？
3. Attention State 的 \(\oplus\) 运算解决了什么问题？和 online softmax 有何联系？
4. FlashInfer 如何在「动态序列长度」与「CUDA Graph 静态图」之间折中？
5. 若两个请求共享 4k token 前缀，composable format 如何减少重复 KV 读取？

<details>
<summary>参考答案（要点）</summary>

1. 每个物理 KV 块是 \((H,D)\) 张量；page table 指出哪些块被访问 → 非零块；\(B_c=1\) 时常对应 **每列一块 token** 的细粒度 paging。
2. decode 每次只有 1 个 query token，用大 query tile 浪费；Tensor Core 最小行 16，单 token 不适配。
3. 分块算 attention 后 **确定性合并** 局部结果；\(\oplus\) 等价于分段 online softmax 的合并公式。
4. **编译期** 固定 tile / kernel 配置；**运行期** 只变序列长度与调度映射；图结构不变。
5. 共享前缀对应稠密子矩阵，用大 \(B_r\) 存 BSR，多 query 在 shared memory 共读一段 KV；独有后缀用小 \(B_r\) 分开算再 \(\oplus\) 合并。

</details>

---

## 延伸阅读

- 论文 PDF：[arXiv:2501.01005](https://arxiv.org/abs/2501.01005)
- 官方文档：[docs.flashinfer.ai](https://docs.flashinfer.ai)
- 本库笔记：[FlashAttention](flash-attention.md)、[PagedAttention / vLLM](paged-attention-vllm.md)、[SGLang / RadixAttention](sglang-radixattention.md)

---

## 引用

```bibtex
@article{ye2025flashinfer,
  title   = {FlashInfer: Efficient and Customizable Attention Engine for LLM Inference Serving},
  author  = {Ye, Zihao and Chen, Lequn and Lai, Ruihang and others},
  journal = {arXiv preprint arXiv:2501.01005},
  year    = {2025},
  url     = {https://arxiv.org/abs/2501.01005}
}
```
