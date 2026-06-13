---
title: "FlashAttention-2: 用更好的并行策略让 Attention 快两倍"
来源: https://arxiv.org/abs/2307.08691
日期: 2026-06-13
分类: 机器学习
子分类: ml-deep
provenance: pipeline-v3
---

## 从日常类比开始：图书馆里做「全班成绩统计」

想象一个班级有 1000 个学生（sequence length = 1000），每个学生有一张 100 题的考卷（embedding dimension = 100）。老师想算出「每个学生对其他学生的关注分数」——这就是 Transformer 里的 **Attention 机制**。

传统做法像一个同学一本本翻别人的卷子，把分数记在大黑板上。黑板很小（GPU 显存），卷子太多时，黑板放不下，就得擦掉一部分、去书架拿下一批——来回搬运非常耗时。

**FlashAttention（原版）** 的发现是：你根本不需要把整本卷子搬到黑板上。你只需要把卷子分批次拿进来，在手里算完一小部分再写黑板。这样黑板（**SRAM/on-chip memory**）不用反复去书架（**HBM/显存**）搬卷子。

**FlashAttention-2** 进一步发现：原版虽然减少了搬运次数，但图书馆里 10 个老师（GPU 上的线程/线程块）在干活时，有人忙死、有人闲着——因为任务分得不均匀。FlashAttention-2 做了两件事：

1. **让每个老师少做「跑腿」的杂活**（减少非矩阵乘法运算）
2. **重新分配任务**——不再让一个老师管 100 个学生，而是 5 个老师合作管 100 个学生，有人负责前半段、有人负责后半段，最后汇总

结果：速度翻倍，而且达到了 GPU 理论算力的 50-73%。

---

## 是什么

**FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning**（Tri Dao，**arXiv:2307.08691, 2023-07-17**）是对 FlashAttention 的改进版。核心贡献有三：

1. **减少非 GEMM 操作的 FLOPs**：FlashAttention 原版中，softmax 和逐元素乘法占了不少运算，FlashAttention-2 通过调整算法减少这些「杂活」
2. **跨线程块并行**：原版中一个 Attention head 只由一个线程块处理，FlashAttention-2 让多个线程块合作计算同一个 head，提高 GPU 占用率
3. **线程块内按 Warp 分工**：在同一个线程块里，不同 Warp 分担不同任务，减少 Shared Memory 中的读写冲突

效果：相比原版 FlashAttention **约 2× 加速**，在 A100 上达到理论最大 FLOPs/s 的 **50-73%**，训练 GPT 模型时单卡可达 **225 TFLOPs/s**（72% 模型 FLOPs 利用率）。

---

## 为什么重要

- **Attention 是 Transformer 的瓶颈**：计算和显存随序列长度呈**二次方增长**（O(n²)），限制模型处理长文本
- **没有近似，完全精确**：不同于 ALBERT / Linformer 等通过近似降低复杂度，FlashAttention 是**精确计算**，不影响模型精度
- **即插即用**：替换 PyTorch 中的 Attention 实现即可，无需改模型架构
- **为更长序列铺路**：让 10K+ token 的训练变得可行，解锁代码生成、视频理解等新应用

---

## 核心概念

### 1. GPU 内存层次结构

理解 FlashAttention 的关键是理解 GPU 的「三层仓库」：

| 层级 | 名称 | 大小 | 速度 | 类比 |
|------|------|------|------|------|
| 最上层 | HBM（High Bandwidth Memory） | 40-80GB | 快（~2TB/s） | 图书馆书架 |
| 中间层 | Shared Memory（SRAM） | ~100KB per block | 极快 | 老师手里的草稿纸 |
| 最内层 | Register | 极小 | 最快 | 老师的大脑 |

传统 Attention 把 Q、K、V 全放在 HBM 里反复读写，而 FlashAttention 利用 SRAM 做「中转站」。

### 2. I/O 感知计算（I/O-Aware Computation）

FlashAttention 的核心洞察：

> **在 GPU 上，搬数据的代价远大于计算本身。**

算一个 1000×1000 的 Attention 矩阵需要约 n²d 次乘加运算（~2×10⁹ FLOPs），但如果每次搬运只搬小 tile（如 64×64），HBM 访问次数从 O(n²) 降到 O(n² / sqrt(SRAM_size))。

### 3. FlashAttention-2 的三个优化

**优化 1 — 减少非矩阵乘法的 FLOPs**

FlashAttention 原版在每个 tile 上都要做 softmax。FlashAttention-2 发现：**多个 tile 的 softmax 可以累积后一起做**。相当于把「算完一批就公布成绩」改成「全部考完再统一公布」。

**优化 2 — 跨线程块并行（Inter-thread-block Parallelism）**

原版：1 个线程块管 1 个 head。
新版：N 个线程块一起管 1 个 head，每个管一部分行。最后用 `atomicAdd` 汇总。

**优化 3 — 块内 Warp 分工**

原版中，Warp 之间要通过 Shared Memory 频繁交换中间结果。
新版：每个 Warp 专注自己的 tile 计算，只在最后一步汇总，减少 Shared Memory 通信。

---

## 代码示例

### 示例 1：用 FlashAttention-2 替代原生 Attention

```python
import torch
from flash_attn import flash_attn_func

# 假设 seq_len = 2048, hidden = 4096, num_heads = 32, head_dim = 128
query = torch.randn(1, 2048, 32, 128, device="cuda")  # (batch, seq_len, heads, head_dim)
key   = torch.randn(1, 2048, 32, 128, device="cuda")
value = torch.randn(1, 2048, 32, 128, device="cuda")

# 原生 PyTorch Attention — O(n²) 显存
# output = torch.softmax(
#     (query @ key.transpose(-2, -1)) / (128 ** 0.5),
#     dim=-1
# ) @ value

# FlashAttention-2 — O(n) 显存，精确计算，~2× 更快
output = flash_attn_func(query, key, value)
```

对比：

| 指标 | 原生 `scaled_dot_product_attention` | FlashAttention-2 |
|------|-------------------------------------|-------------------|
| 显存复杂度 | O(n² × d) | O(n × d) |
| 速度（A100, seq=4096） | 基准 | ~4× 更快 |
| 精度 | 精确 | 精确（无近似） |
| 需要改模型吗 | 不需要 | 不需要 |

### 示例 2：在 HuggingFace Transformer 中启用

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained(
    "meta-llama/Llama-2-7b-chat-hf",
    torch_dtype=torch.float16,
    device_map="auto",
    # 关键：启用 FlashAttention-2
    attn_implementation="flash_attention_2",
)

tokenizer = AutoTokenizer.from_pretrained("meta-llama/Llama-2-7b-chat-hf")

messages = [{"role": "user", "content": "explain GPU memory hierarchy"}]
text = tokenizer.apply_chat_template(messages, tokenize=False)
inputs = tokenizer(text, return_tensors="pt").to("cuda")

# 这段 inference 会自动使用 FlashAttention-2，无需改动 prompt
outputs = model.generate(**inputs, max_new_tokens=512)
```

---

## 核心算法：FlashAttention-2 的工作流程

```
输入：Q, K, V（各形状 [batch, heads, seq_len, head_dim]）
输出：Attention 输出矩阵

步骤：
1. 将 K 和 V 分块为 tile（如 64×64 的小块），放入 Shared Memory
2. Q 也在 Shared Memory 中，每次取一个 tile
3. 对每个 Q_tile 和 K_tile/V_tile 对：
   a. 计算部分 attention score: Q_tile @ K_tile^T
   b. 累积求 softmax（多个 tile 的中间结果先攒着）
   c. 与 V_tile 相乘，得到部分输出
4. 所有 tile 遍历完后，统一做一次 softmax（关键优化！）
5. 多个线程块并行计算同一 head 的不同行，最后 atomicAdd 汇总
```

---

## 局限性

- **只在训练和首次推理（prefill）中受益最大**：自回归生成阶段（每次只生成一个 token）的收益相对较小
- **需要支持 CUDA 的计算能力 8.0+**（Ampere 架构及更新，如 A100/H100）
- **数值精度**：在 fp16 下可能有微小数值差异（但论文验证了不影响模型质量）
- **依赖 flash-attn 库**：增加了依赖管理复杂度

---

## 关键公式

FlashAttention 不改变 Attention 的数学定义：

```
Attention(Q, K, V) = softmax(QK^T / sqrt(d)) · V
```

区别在于**计算方式**——不是直接算完整的 QK^T 矩阵（O(n²) 显存），而是**逐 tile 计算并在线性空间内累积结果**。

---

## 延伸阅读

- **FlashAttention-1**（Dao et al., ICML 2022）：arXiv:2205.14135 — 提出 I/O-aware 的 Attention 基础框架
- **xFormer**（Microsoft）：arXiv:2305.16222 — 统一了 FlashAttention / Ring Attention 等多种变体
- **FlashAttention-3**（Dao, 2024）：进一步利用 H100 的 Nano Core 做 tile 级并行，理论加速约 3×

---

## 一句话总结

**FlashAttention-2 不改 Attention 的数学，只改「谁在 GPU 上怎么搬数据」——让计算贴近数据，减少搬运，重新分配工作量，结果就是快两倍。**
