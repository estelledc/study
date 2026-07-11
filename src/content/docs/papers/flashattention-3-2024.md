---
title: FlashAttention-3 — 面向 H100 的异步与低精度注意力
来源: 'Jay Shah, Ganesh Bikshandi, Ying Zhang, Vijay Thakkar, Pradeep Ramani, Tri Dao, "FlashAttention-3: Fast and Accurate Attention with Asynchrony and Low-precision", arXiv 2407.08608 (2024)'
日期: 2026-07-10
分类: ml-systems
难度: 进阶
---

## 是什么

FlashAttention-3（**FA3**）是 2024 年面向 **NVIDIA Hopper（H100 等）** 的新一代 FlashAttention：仍算精确（或可控低精度）attention，但把 Hopper 的**异步拷贝（TMA）**、**Warpgroup MMA（WGMMA）** 和 **FP8** 用进同一条流水线。

日常类比：FA2 像把厨房排班优化到极致；FA3 换到新厨房——传送带（TMA）能自己送菜，炉灶（Tensor Core）和切菜（softmax）可以交错干，还多了「半精度进货通道」（FP8）。旧排班原样搬过来，新厨房也只能发挥约 **35%** 潜力。

```python
# 官方 hopper 子目录（beta）：需 H100/H800 + CUDA ≥ 12.3
from flash_attn_interface import flash_attn_func
out = flash_attn_func(q, k, v, causal=True)
```

论文数字：H100 上相对 FA2 约 **1.5–2.0×**；FP16 可达约 **740 TFLOPs/s（~75% utilization）**；FP8 接近 **1.2 PFLOPs/s**；其 FP8 路径数值误差可比朴素 FP8 attention 低约 **2.6×**。

## 为什么重要

不理解 FA3，下面这些事很难解释：

- 为什么 FA2 在 A100 上很能打，原样搬到 H100 却吃不满新硬件
- 为什么「异步」对 attention 这么关键——softmax 指数和 matmul 速度差一大截，不重叠就互相等
- 为什么 FP8 不是「把 dtype 改成 float8」一行搞定，而要 block quantization / 布局约束
- 为什么 2024 后 Hopper 训练/推理栈开始单独维护 `hopper/` 内核，而不是只 bump FA2 版本号

## 核心要点

FA3 的三板斧对应论文三项技术：

1. **Warp specialization + TMA**：一部分 warp 专职搬数，一部分专职算，用异步拷贝重叠「数据运动 ↔ Tensor Core」。类比：跑堂和厨师分工，上菜不用等炉灶空转。

2. **块级 matmul 与 softmax 交错**：不再「整块 GEMM 做完再做指数」；把 softmax 塞进流水线空隙。类比：炉灶轰鸣时顺便切下一盘菜，而不是炉子熄火再切菜。

3. **FP8 + block quantization / incoherent processing**：吃 Hopper FP8 Tensor Core 的 2× 吞吐，同时用分块量化等技巧压低误差。类比：用更窄的货箱进货，但每箱单独标定重量，避免整仓用错秤。

合起来：目标不是改 attention 公式，而是**让 Hopper 的异步与低精度能力真正进到 attention kernel**。

## 实践案例

### 案例 1：确认你在 Hopper 上跑 FA3 路径

```python
import torch
assert torch.cuda.get_device_capability(0)[0] >= 9  # Hopper = sm90
print(torch.cuda.get_device_name(0))  # 期望含 H100 / H800 等

# 安装见官方 README：cd hopper && python setup.py install
from flash_attn_interface import flash_attn_func
q = torch.randn(1, 2048, 16, 64, device="cuda", dtype=torch.bfloat16)
k, v = torch.randn_like(q), torch.randn_like(q)
out = flash_attn_func(q, k, v, causal=True)
print(out.shape)
```

**逐部分解释**：

- FA3 公开发布路径针对 Hopper；在 A100 上硬跑「FA3 专用包」通常无意义或不可用。
- `bfloat16`/`float16` 是常见前向配置；FP8 另有接口与布局约束，不要假设「改 dtype 就自动 FP8 WGMMA」。
- 先验证 `device_capability`，再谈吞吐数字，避免把错设备上的慢归因于算法。

### 案例 2：同一输入对比「利用率叙事」

```python
# 伪测思路：固定 B,S,H,D，分别跑 FA2 与 FA3，记录 ms
# 论文设定下 FA3 在 H100 上约 1.5–2×；你的形状不同比例会变

def sync_ms(fn, warmup=10, iters=50):
    for _ in range(warmup):
        fn()
    torch.cuda.synchronize()
    t0 = torch.cuda.Event(enable_timing=True); t1 = torch.cuda.Event(enable_timing=True)
    t0.record()
    for _ in range(iters):
        fn()
    t1.record(); torch.cuda.synchronize()
    return t0.elapsed_time(t1) / iters
```

**逐部分解释**：对比必须固定序列长度、head_dim、causal、dtype。只报「快了 2 倍」却不写 S=4k 还是 512，工程上无法复现论文图。

### 案例 3：FP8 先做数值体检再追峰值

```python
# 概念步骤（具体 API 随 flash-attn hopper 版本变化）：
# 1) 用 BF16/FP16 FA3 算出 out_ref
# 2) 用 FP8 FA3 算出 out_fp8
# 3) 看 max|out_fp8-out_ref| / 相对误差，而不是只看 TFLOPs/s
err = (out_fp8.float() - out_ref.float()).abs().max().item()
print("max abs err", err)
```

**逐部分解释**：论文强调 FA3 的 FP8 路径比朴素 FP8 attention **更准**（约 2.6× 更低误差）。上线低精度前，先定误差预算（例如相对下游 loss / 困惑度），再开 FP8。

## 踩过的坑

1. **非 Hopper 硬上**：FA3 的卖点是 TMA/WGMMA/FP8；在 A100 上应继续用 FA2。
2. **CUDA 版本不够**：官方要求 CUDA ≥ 12.3，并常建议更新的 12.8 以拿满性能。
3. **只测吞吐不测误差**：FP8 峰值好看，尾部任务（长上下文、logits 敏感）可能先坏。
4. **把 FA2 的布局/包装假设原样搬来**：hopper 接口与安装路径（`hopper/` 子目录）与主包不完全同一套。

## 适用 vs 不适用

**适用**：

- H100/H800 等 Hopper GPU 上追求 attention 峰值与高利用率
- 长上下文训练/推理，愿意维护较新的 CUDA 与内核版本
- 接受 FP8 时有数值回归流程（对照 BF16 基线）

**不适用**：

- 非 Hopper 平台（先用 FA2 / SDPA Flash）
- 极小 batch、极短序列、且要绝对确定性延迟的场景——异步流水线收益有限
- 无法升级 CUDA / 无法编译自定义扩展的受限环境
- 需要随意改 attention 数学（额外 bias、奇异 mask）又没有能力改 kernel

## 历史小故事（可跳过）

- **2022**：FA1 证明「不改公式、改 IO」路线。
- **2023**：FA2 把并行与工作划分补齐，A100 世代接近 GEMM 效率。
- **2024-07**：Shah / Dao 等发布 FA3（arXiv 2407.08608），专攻 Hopper 异步与 FP8。
- **之后**：官方以 `hopper/` beta 形式发布；社区开始把「Flash 版本」按 GPU 世代分流。

## 学到什么

1. **换代硬件不会自动变快**——旧内核搬到新 GPU，利用率可能反而更难看。
2. **异步的本质是重叠等待**：softmax 与 GEMM 速度不匹配时，交错比单干更重要。
3. **低精度是系统问题**：量化、布局、误差预算要一起设计，不是改个 dtype。
4. **优化叙事要带平台标签**：谈 FA3 数字时默认语境是 H100，不是「泛 GPU」。

## 延伸阅读

- 论文：[arXiv 2407.08608](https://arxiv.org/abs/2407.08608)
- 博客：[FlashAttention-3](https://tridao.me/blog/2024/flash3/)
- 代码：[Dao-AILab/flash-attention](https://github.com/Dao-AILab/flash-attention)（见 `hopper/`）
- [[flashattention-2]] —— FA2：A100 世代的工作划分基线
- [[flash-attention]] —— FA1：IO-aware 精确 attention 的原点
- [[hopper-architecture-2022]] —— TMA / 第 4 代 Tensor Core 的硬件背景

## 关联

- [[flashattention-2]] —— 直接前作；先懂为何 FA2 在 H100 上只有约 35% 利用率
- [[flash-attention]] —— tiling + online softmax 的共同祖先
- [[hopper-architecture-2022]] —— FA3 依赖的硬件原语词典
- [[paged-attention]] —— 推理 KV cache 管理，常与 Flash 内核组合
- [[gptq-2023]] —— 另一条低精度路线（权重量化），对照 FA3 的激活/注意力 FP8
- [[fastertransformer-2021]] —— 厂商推理引擎传统，对照开源 Flash 内核演进
- [[attention]] —— 数学定义未变：变的是执行与数值格式

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
