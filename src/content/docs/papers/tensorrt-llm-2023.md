---
title: TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈
来源: NVIDIA, "TensorRT-LLM", GitHub 开源仓库, 2023-10
日期: 2026-05-31
分类: GPU 架构
难度: 中级
---

## 是什么

TensorRT-LLM（**TRT-LLM**）是 NVIDIA 2023 年 10 月开源的**官方大模型推理栈**。日常类比：FasterTransformer 像"快餐中央厨房"只做一道菜（一次前向）；TRT-LLM 升级成**整条流水线** —— 厨房（kernel）+ 排号（in-flight batching）+ 收银打包（Triton），门口就是下单窗口。

它不是新模型，而是拼装三件已有武器：

- **TensorRT**：2017 年起的推理编译器，把模型**提前编译**（AOT，像把菜谱烤成固定流程卡）成 `engine.plan`
- **FasterTransformer 的 kernel**：高度优化的矩阵乘（GEMM，大矩阵乘法）/ attention CUDA 算子
- **Triton Inference Server**：HTTP/gRPC、多实例服务层

再加 2023 年新写的 **In-Flight Batching（IFB）** 与**分页 KV cache**（把每条请求的键值缓存切成可回收小块，像停车场按车位租，而不是整层包场），组成能在 H100/H200 上吃满 FP8 的官方方案。

## 为什么重要

不理解 TRT-LLM，下面这些事都讲不清：

- 为什么 NVIDIA 要出一套和 vLLM "看起来很像" 的引擎 —— 要在自家最新硬件（FP8 / Hopper）上拿出别人短期难追的数字
- 为什么 2024 年 LLM 推理 benchmark 常拿 TRT-LLM 当对照 —— 它是官方背书的"上限"
- 为什么 continuous batching / PagedAttention 到 TRT-LLM 里改叫 **IFB** / **paged KV cache** —— 厂商吸收社区想法是常态，实现细节差很多
- 为什么有人选 vLLM、有人选 TRT-LLM —— 一边 Python 友好、跨硬件；另一边 AOT 编译、绑 NVIDIA、新卡上更快

## 核心要点

TRT-LLM 把推理拆成 **四层流水线**：

1. **模型定义层（Python DSL）**：用类 PyTorch 语法写结构（`tensorrt_llm.Module`），但只能用官方算子。类比：只能用中央厨房现成刀具，不能自带菜刀。

2. **编译层（TensorRT builder）**：生成网络图，选 kernel、融合算子、定精度（FP16/BF16/FP8/INT8/INT4），吐出**只在编译时那张 GPU 架构上能跑**的 `engine.plan`。类比：菜谱烤成流程卡，换灶台要重烤。

3. **运行时层（C++ runtime）**：加载 engine，管 KV cache 池、跑 attention、收 logits（下一词打分表）。可 Python 调，也可被 Triton 装载。

4. **服务层（Triton + tensorrtllm_backend）**：**IFB 调度器**跑在这里 —— 新请求立刻挤进正在跑的 batch，不等老请求结束。

只有第 2 层是 AOT；改模型必须重编译（7B 约十几分钟，70B 半小时往上）—— 最被诟病，也是压榨极限性能的代价。研究阶段大家常用 vLLM 改完即跑，模型冻结后再切 TRT-LLM 上线。

## 实践案例

### 案例 1：最小 build + run

```bash
# 旧示例入口；新版本常用 trtllm-build CLI，语义相同
python build.py --model_dir ./llama-2-7b-hf \
                --dtype float16 \
                --use_inflight_batching \
                --paged_kv_cache \
                --output_dir ./engines/llama2-7b
```

```python
from tensorrt_llm.runtime import ModelRunner
runner = ModelRunner.from_dir('./engines/llama2-7b')
print(runner.generate(['介绍一下量子计算。'], max_new_tokens=128))
```

**逐部分解释**：

- `--use_inflight_batching` 打开 IFB；`--paged_kv_cache` 分页存 KV
- 得到 `rank0.engine` 后才能 run；A100 编的 engine **不能**直接上 H100
- 官方数字常称 H100 上首 token 延迟低约 30–50%、吞吐高约 1.5–2×（视模型与负载而定；社区复现差距更小）

### 案例 2：IFB 怎么插队

```text
t0: batch=[A(30 tok), B(5 tok)]
t1: C 到达 → 下一 forward 变成 [A, B, C]   # 不等 A/B 结束
t2: A 结束 → 释放 A 的 KV block → batch=[B, C]
```

**逐部分解释**：

1. 调度器按 **token 步** 组 batch，不是按"整段生成完"
2. 新请求拼到下一 forward 的 batch 维 —— 这就是 IFB / continuous batching
3. 结束请求的 KV block 立刻还池；attention 必须支持**变长序列**，故 paged KV 是前置条件

### 案例 3：Hopper 上的 FP8

```bash
python quantize.py --model_dir ./llama-2-70b \
                   --qformat fp8 \
                   --kv_cache_dtype fp8 \
                   --output_dir ./fp8-ckpt
python build.py --checkpoint_dir ./fp8-ckpt --use_fp8 ...
```

**逐部分解释**：`--qformat fp8` 把权重量到 FP8；`--kv_cache_dtype fp8` 让缓存也用半精度字节。H100 的 **Transformer Engine**（矩阵乘硬件单元）原生吃 FP8（E4M3/E5M2）。70B 显存约从 BF16 的 140GB 砍到 ~70GB，单机 8×H100 可放下，吞吐常再涨约 1.5–2×。2023–2024 年这条官方路径比社区引擎更早落地。

## 踩过的坑

1. **engine.plan 不可移植**：换 GPU 架构、TRT 主版本、GPU 数或 batch 上限都要重编译；CI 应存 checkpoint + build 脚本，不要存 engine。
2. **build 时间长且入口易漂**：7B BF16 约 5–15 分钟，70B FP8 半小时往上；`build.py` 与 `trtllm-build` 并存于不同发行版，跟教程前先核对 major 版本 examples。
3. **算子覆盖有限**：自定义 attention 必须写 C++/CUDA plugin，门槛高于改 Python。
4. **Python 只是薄包装**：runtime 是 C++；报错常无用，要看 C++ 日志或 nsys（NVIDIA 性能探针）trace。

## 适用 vs 不适用场景

**适用**：

- 已锁定 NVIDIA（尤其 H100/H200/B100），模型结构冻结、日请求量高
- 愿为最后约 30–50% 性能付出 10–30 分钟 rebuild
- 主流结构（LLaMA / GPT / Qwen 系）且要吃 FP8 / Transformer Engine

**不适用**：

- 要跑 AMD / TPU / Apple → vLLM 或 SGLang
- 研究阶段、结构频繁改 → vLLM（改完即跑）
- 自研 attention / 采样 → vLLM 更易 hack
- 边缘小模型 → ONNX Runtime / llama.cpp 更轻

## 历史小故事（可跳过）

- **2017**：TensorRT 发布，主打 CV 推理
- **2021**：FasterTransformer 开源，kernel 极致但无调度
- **2022–2023**：Orca continuous batching；vLLM 普及 PagedAttention
- **2023-10**：TensorRT-LLM 开源，把 FT kernel + TRT 编译 + Triton 服务 + IFB 拼成官方整栈
- **2024–2025**：FP8 / speculative decoding / multi-LoRA / 长上下文持续迭代

## 学到什么

1. **厂商整合 vs 开源积木**：TRT-LLM 垂直一条龙；vLLM 开放积木
2. **AOT 换性能**：全图优化机会换开发体验
3. **开源先跑、厂商吸收**：IFB / paged KV 同源异名
4. **"快"的颗粒度不同**：vLLM 快在改完即跑；TRT-LLM 快在新卡上多榨 token

## 延伸阅读

- 官方仓库：[NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)（看 examples/ 下各模型配置）
- 官方博客：[TensorRT-LLM 2023-10 announcement](https://developer.nvidia.com/blog/nvidia-tensorrt-llm-supercharges-large-language-model-inference-on-nvidia-h100-gpus/)
- [[fastertransformer-2021]] —— kernel 前身
- [[vllm]] —— 开源对照
- [[orca-continuous-batching]] —— IFB 思想源头
- [[triton-llm]] —— 服务层（非 OpenAI Triton）

## 关联

- [[fastertransformer-2021]] —— FT 的 CUDA kernel 是算子层的根
- [[vllm]] —— PagedAttention / continuous batching 的开源对照
- [[orca-continuous-batching]] —— continuous batching 学术源头
- [[triton-llm]] —— Triton Inference Server 是服务层载体
- [[ampere-architecture-2020]] —— 早期主力硬件；Hopper 才解锁完整 FP8
- [[hopper-architecture-2022]] —— H100 Transformer Engine / FP8 的硬件背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[medusa-2024]] —— Medusa — 让大模型自己同时猜好几个 token
- [[orca-2022]] —— Orca — Transformer 生成模型的分布式推理调度
- [[rtp-llm-alibaba]] —— RTP-LLM — 把大模型推理服务做成分阶段工厂
- [[sglang-2024]] —— SGLang — 把 LLM 程序当成共享前缀的树来跑
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[projects/vllm]] —— vLLM — 高吞吐 LLM 推理引擎
