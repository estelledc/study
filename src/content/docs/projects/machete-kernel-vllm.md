---
title: vLLM Machete W4A16 Kernel 学习笔记
来源: https://github.com/vllm-project/vllm/blob/main/csrc/quantization/machete/README.md
日期: 2026-06-13
分类_原始: AI / 大模型
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

# vLLM Machete W4A16 Kernel 学习笔记

## 一、为什么要学这个？

大语言模型推理很慢。一个 70B 参数的模型，一次推理要做上万亿次矩阵乘法。Machete 就是 vLLM 里专门加速这些矩阵乘法的"特种部队"。

简单类比：普通矩阵乘法像是在菜市场一个一个挑菜称重，Machete 是先把菜按种类分好盒、排好序，然后用传送带一次搬运一整批。

## 二、核心概念

### 2.1 矩阵量化（Quantization）

GPU 的 Tensor Core 最擅长做 FP16 或 BF16 矩阵乘法。但模型参数太大，存不下也搬不动。于是把权重从高精度压缩到低精度——比如从 FP16（16 位）压缩成 INT4（4 位）。

- W4A16 的意思：**W**eight 用 4-bit 量化，**A**ctivation 保持 16-bit
- 量化后参数体积缩小 4 倍，但计算会变"粗糙"
- 为了补偿精度损失，每个量化组乘以一个**缩放系数（scale）**拉回来

类比：就像把高清照片缩小成缩略图，scale 就是"还原时的放大倍数"。

### 2.2 混合精度 GEMM（Mixed Precision GEMM）

Machete 的全称是 **Mixed Precision Cutlass-Based GEMM**。GEMM 就是通用矩阵乘法（General Matrix Multiply）的缩写。

核心计算公式：

```
output = (W_quant × scales - zero_points) @ activation
```

其中：
- `W_quant` — 量化后的 4-bit 权重
- `scales` — 每组权重的缩放系数
- `zero_points` — 零点偏移（补偿量化误差）
- `activation` — 保持 16-bit 精度的激活值

### 2.3 Prepacking（预打包）

这是 Machete 最核心的优化。

普通的 GPU 矩阵库（如 cuBLAS）假设数据是整齐排列的。但量化权重是"碎片化"的——4 个 int4 值塞进 1 个 byte。Tensor Core 不认识这种格式。

Prepacking 就是**在调用 kernel 之前，把权重从"存储格式"重新排列成"Tensor Core 喜欢的格式"**。这样 kernel 运行时可以直接用宽度的 shared memory 读取，不用逐 bit 解析。

类比：快递仓库的货本来乱七八糟堆着，prepacking 就是按目的地分类、装箱、贴好标签，卡车一到直接上车拉走。

### 2.4 Hopper 架构专用

Machete 是为 NVIDIA Hopper（H100）架构设计的。它是 Marlin kernel 的精神继任者，但基于 CUTLASS 构建，所以：
- 更容易添加新的类型组合
- 更容易支持新的 epilogue（计算后的操作）

## 三、代码示例

### 示例 1：基本用法

这是 vLLM README 中展示的最简调用方式。核心分两步：先打包，再计算。

```python
from vllm import _custom_ops as ops

# 假设这些变量已经准备好了：
#   a        — activation 矩阵，shape (M, K)，dtype=BF16
#   w_q      — 量化后的权重矩阵，shape (K, N)，int4
#   w_s      — 量化缩放系数，shape 取决于 group_size
#   group_size — 每个量化组的权重数量，常用 128

# 第一步：预打包权重
# 把 int4 权重重排成 Tensor Core 能直接用的格式
W_q_packed = ops.machete_prepack_B(w_q, wtype)

# 第二步：执行矩阵乘法
output = ops.machete_gemm(
    a,                        # 激活值
    b_q=W_q_packed,           # 预打包的量化权重
    b_type=wtype,             # 权重类型，如 uint4b8
    b_scales=w_s,             # 缩放系数
    b_group_size=group_size   # 量化组大小
)
```

`output` 的形状是 `(M, N)`，结果默认是 BF16/FP16 精度。

### 示例 2：完整量化流水线（含零点）

实际应用中，量化通常带有零点补偿和多种缩放。vLLM 的测试代码展示了完整流程：

```python
import torch
from vllm import _custom_ops as ops
from vllm.model_executor.layers.quantization.utils.quant_utils import (
    quantize_weights,
    pack_rows,
)
from vllm.scalar_type import ScalarType

# 输入：FP16 的原始权重
w_fp16 = torch.randn(4096, 4096, dtype=torch.float16, device="cuda")
a      = torch.randn(64, 4096, dtype=torch.float16, device="cuda")

# 量化权重（INT4，group_size=128）
wtype = ScalarType.uint4b8
group_size = 128
w_ref, w_q, w_s, w_zp = quantize_weights(
    w_fp16, wtype, group_size=group_size,
    ref_zero_points_after_scales=True
)

# 打包 int4 行（每 byte 存 2 个 int4 值）
w_q = pack_rows(w_q, wtype.size_bits, *w_q.shape)
w_q = w_q.t().contiguous().t()  # 转成列主序

# Machete 预打包
W_q_packed = ops.machete_prepack_B(w_q, a.dtype, wtype, w_s.dtype)

# 零点预处理：Machete 的零点是"在 scale 之后"应用的
# 所以要把 zp 乘以 scale 并取反，合并到 kernel 内部
w_g_zp = -1 * w_s * (w_zp.to(w_s.dtype))

# 执行 GEMM
output = ops.machete_mm(
    a=a,
    b_q=W_q_packed,
    b_type=wtype,
    b_group_scales=w_s,      # 组缩放系数
    b_group_zeros=w_g_zp,    # 组零点（已预处理）
    b_group_size=group_size,
    out_type=torch.float16    # 输出精度
)
```

这里要注意一个细节：`w_g_zp = -1 * w_s * (w_zp.to(w_s.dtype))`。

为什么？因为 Machete 的 kernel 内部执行顺序是 `scale * (quant_weight - zero_point)`，所以传入的零点需要先乘以 scale 再取反，才能等价于标准的 `(weight - zp) * scale`。

### 示例 3：对比基准测试

vLLM 内置了完整的 benchmark 脚本，对比 Machete、Marlin、cuBLAS 和 PyTorch 原始实现的性能：

```python
from vllm import _custom_ops as ops
import torch

# 准备测试数据
M, N, K = 64, 4096, 4096
a = torch.randn(M, K, dtype=torch.float16, device="cuda")
w = torch.randn(K, N, dtype=torch.float16, device="cuda")

# 量化 + 打包
wtype = ScalarType.uint4b8
group_size = 128
_, w_q, w_s, w_zp = quantize_weights(w, wtype, group_size=group_size)
w_q = pack_rows(w_q, wtype.size_bits, *w_q.shape)
W_q_packed = ops.machete_prepack_B(w_q.t().contiguous().t(), a.dtype, wtype, w_s.dtype)

# 方法1：PyTorch 原始 BF16 矩阵乘法（baseline）
output_torch = torch.matmul(a, w.to(torch.bfloat16))

# 方法2：Machete 量化矩阵乘法
output_machete = ops.machete_mm(
    a=a, b_q=W_q_packed, b_type=wtype,
    b_group_scales=w_s, b_group_zeros=None,
    b_group_size=group_size
)

# 验证精度
diff = torch.abs(output_machete - output_torch).mean()
print(f"平均误差: {diff:.6f}")

# 用 torch.benchmark 跑性能测试
import torch.utils.benchmark as tb
timer = tb.Timer(
    stmt="for _ in range(100): fn()",
    globals={"fn": lambda: ops.machete_mm(
        a=a, b_q=W_q_packed, b_type=wtype,
        b_group_scales=w_s, b_group_zeros=None,
        b_group_size=group_size
    )}
)
result = timer.blocked_autorange()
print(f"Machete W4A16 GEMM 平均耗时: {result.median * 1000:.3f} ms")
```

## 四、Schedule（调度器）概念

Machete 支持多种 schedule，每种针对不同的矩阵形状做了优化。

```python
# 查看当前类型组合支持哪些 schedule
schedules = ops.machete_supported_schedules(
    a_type=torch.float16,
    b_type=ScalarType.uint4b8,
    group_scales_type=torch.float16,
    out_type=torch.float16
)
# 可能返回: ["2x1024x128", "4x512x128", "1x2048x128"] 等

# 手动指定 schedule 使用
output = ops.machete_mm(
    a=a, b_q=W_q_packed, b_type=wtype,
    b_group_scales=w_s, b_group_size=128,
    schedule="2x1024x128"  # 指定 tile 形状
)
```

如果没有指定 schedule，Machete 内部会有一个启发式算法（heuristic）自动选择。

不同 schedule 的 `MxNxTileSize` 组合适合不同大小的矩阵。就像不同的齿轮传动比——小矩阵用低档（小 tile），大矩阵用高档（大 tile）。

## 五、关键架构总结

用一张图理解整个数据流：

```
原始 FP16 权重
       │
       ▼
 quantize_weights()      ← 从 16-bit 压到 4-bit，产出 W_quant + scales + zero_points
       │
       ▼
 pack_rows()             ← 把 int4 值打包进 byte，产出紧凑的 int 张量
       │
       ▼
 machete_prepack_B()     ← 重排成 Tensor Core 友好的格式（核心优化！）
       │
       ▼
 machete_mm()            ← 在 GPU 上做混合精度矩阵乘法
       │
       ▼
     输出结果
```

## 六、学习要点回顾

1. **W4A16** = 权重 4-bit 量化 + 激活 16-bit，是推理中性价比最高的量化配置
2. **Prepacking** = 把碎片化的 int4 数据重排成 Tensor Core 能直接"吞"的格式
3. **scale + zero_point** = 量化后拉回正确数值的两个校准参数
4. **Schedule** = tile 形状的预设组合，自动或手动选择以适配不同矩阵大小
5. Machete 面向 Hopper（H100+）GPU，是 Marlin 的继任者，基于 CUTLASS 构建

## 七、延伸阅读方向

- CUTLASS 库：Machete 的底层基础，理解 CUTLASS 的 tile 概念会帮助理解 schedule
- GPTQ 量化算法：W4A16 最常用的量化方法
- Tensor Core 的 PTX 指令：理解 shared memory 宽加载为什么比逐 bit 解析快
- Marlin kernel：Machete 的前身，对比阅读能理解设计演进
