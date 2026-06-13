---
title: "TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈"
来源: NVIDIA, "TensorRT-LLM", GitHub 开源仓库, 2023-10
日期: 2026-05-31
子分类: ml
分类: 图形学
难度: 中级
provenance: pipeline-v3
---

## 是什么

TensorRT-LLM（**TRT-LLM**）是 NVIDIA 2023 年 10 月开源的**官方大模型推理栈**。日常类比：FasterTransformer 像把"快餐中央厨房" 单做了一道菜（一次前向）；TRT-LLM 把它升级成**整条流水线** —— 中央厨房（kernel） + 排号系统（in-flight batching） + 收银 + 打包（Triton 服务） 一并打通，门口就是客人下单的窗口。

它不是一个新模型，而是把 NVIDIA 三件已有武器拼装：

- **TensorRT**：通用深度学习推理编译器（2017 年起），把模型 AOT 编译成 `engine.plan` 二进制
- **FasterTransformer 的 kernel**：高度优化的 GEMM / attention CUDA kernel
- **Triton Inference Server**：服务层多实例 / 多模型 / HTTP-gRPC 接口

加上 2023 年新写的 **In-Flight Batching（IFB）调度器** 和**分页 KV cache**，组成一套官方能跑、能商用、能在 H100/H200 上吃满 FP8 的整套方案。

## 为什么重要

不理解 TRT-LLM，下面这些事都讲不清：

- 为什么 NVIDIA 会自己出一套和 vLLM "看起来很像" 的引擎 —— 厂商要在自己最新硬件（FP8 / Hopper Transformer Engine） 上拿出**别人短期追不上的数字**
- 为什么 2024 年所有 LLM 推理 benchmark 都要拿 TRT-LLM 当对照 —— 它是 NVIDIA 官方背书的"上限"
- 为什么"continuous batching" 和"PagedAttention" 这些 2022-2023 年开源圈的好点子，到 TRT-LLM 里改名叫 **IFB** 和 **paged KV cache** —— 厂商吸收社区想法是常态，但实现细节差很多
- 为什么有人选 vLLM、有人选 TRT-LLM —— 一边是 Python 友好、易改源码、跨硬件；另一边是 AOT 编译、绑定 NVIDIA、最新 GPU 上更快

## 核心要点

TRT-LLM 把推理拆成 **四层流水线**：

1. **模型定义层（Python DSL）**：你用类 PyTorch 的语法写一遍模型结构（`tensorrt_llm.Module`），但只能用 TRT-LLM 提供的算子。这一层负责**告诉编译器"模型长这样"**。

2. **编译层（TensorRT builder）**：把上面的 Python 描述跑一遍，生成中间网络图，再让 TensorRT 选 kernel、做算子融合、定 GEMM 的 tile 大小、固化精度（FP16/BF16/FP8/INT8/INT4），最后吐出一个 `engine.plan` —— 一个**只能在编译它的那张 GPU 架构上跑**的二进制。

3. **运行时层（C++ runtime）**：加载 engine.plan，管 KV cache 池、跑 attention、收 logits。这一层暴露 Python binding 给你直接调，也可以被 Triton 装载。

4. **服务层（Triton + tensorrtllm_backend）**：Triton 是 NVIDIA 通用推理服务器，tensorrtllm_backend 是它的 LLM 适配。负责 HTTP/gRPC、多实例、metrics —— **IFB 调度器就跑在这一层**：来一条请求立刻插队加入正在跑的 batch，不等老请求结束。

四层中**只有第 2 层（编译）是 AOT 的**，其余都在线。这意味着改模型必须重编译，重编译 7B 模型要十几分钟，70B 半小时往上 —— 是 TRT-LLM 最为人诟病的一点，但也是它能在最新 GPU 上压榨极限性能的代价。

## 实践案例

### 案例 1：一段最小 build + run 流程

build 阶段（CLI 简化示意）：

```bash
python build.py --model_dir ./llama-2-7b-hf \
                --dtype float16 \
                --use_inflight_batching \
                --paged_kv_cache \
                --output_dir ./engines/llama2-7b
```

build 完会得到一个 `engines/llama2-7b/rank0.engine` 文件 —— 这就是 engine.plan。换一张 H100 跑，**必须重 build**（A100 build 的 engine 不能直接拿到 H100 用）。

run 阶段（Python runtime）：

```python
from tensorrt_llm.runtime import ModelRunner

runner = ModelRunner.from_dir('./engines/llama2-7b')
out = runner.generate(['介绍一下量子计算。'], max_new_tokens=128)
print(out)
```

这是 vLLM 用户最不习惯的地方 —— vLLM 是 `LLM(model=...)` 一行起，TRT-LLM 必须先离线 build 再加载。换来的是 H100 上**首 token 延迟可低 30-50%、吞吐高 1.5-2x**（NVIDIA 官方数字，社区复现差距更小）。

### 案例 2：In-Flight Batching 是怎么调度的

IFB 的思路和 Orca / vLLM 的 continuous batching 一样 —— **不等老请求做完，新请求随时挤进 batch**：

- 时间 t0：请求 A、B 在跑（A 已生成 30 token，B 已生成 5 token）
- 时间 t1：请求 C 进来 —— 调度器**直接把 C 拼到下一个 forward 的 batch 维度上**，不等 A 或 B 结束
- 时间 t2：A 生成完毕 —— 把 A 的 KV block 释放回池子，C 接着跟 B 一起跑

关键在 attention kernel 必须支持"batch 里每条 sequence 长度不一样"，而且 KV 必须分页（paged） —— 不分页就只能预留满血长度，浪费显存。这就是为什么 paged KV cache 是 IFB 的前置条件。

### 案例 3：FP8 量化在 Hopper 上的杀招

H100 引入 **Transformer Engine** 硬件单元，原生支持 FP8（E4M3 / E5M2）矩阵乘。TRT-LLM 提供 FP8 量化 + FP8 KV cache：

```bash
python quantize.py --model_dir ./llama-2-70b \
                   --qformat fp8 \
                   --kv_cache_dtype fp8 \
                   --output_dir ./fp8-ckpt
python build.py --checkpoint_dir ./fp8-ckpt --use_fp8 ...
```

效果：70B 模型显存占用从 BF16 的 140GB 砍到 FP8 的 70GB，单机 8×H100 能直接放下，吞吐再涨 1.5-2x。这是 vLLM 短期内追不上的 —— vLLM 的 FP8 路径要等社区写完 kernel，TRT-LLM 直接调 cuBLAS / cuDNN 的官方 FP8 实现。

## 踩过的坑

1. **engine.plan 不可移植**：换 GPU 架构（A100→H100）、换 TRT 主版本、换 GPU 数量、换 batch 上限，**全部要重编译**。CI 上保存 engine 当 artifact 是错的，应该保存 checkpoint + build 脚本。

2. **build 时间长**：7B BF16 大约 5-15 分钟，70B FP8 半小时往上。改一行模型代码就重 build，开发体验比 vLLM "改完即跑" 差很多 —— 这就是为什么研究阶段大家用 vLLM、上线再切 TRT-LLM 是常见路径。

3. **算子覆盖有限**：只支持 TRT-LLM 提供的算子集，自定义 attention 变体（例如学术新 paper） 必须**写 plugin** —— 一段 C++/CUDA 代码注册成 TRT 节点。门槛高于 vLLM 的"改 Python 直接跑"。

4. **Python binding 不等于 Python 实现**：runtime 是 C++ 的，Python 只是一层薄包装。debug 进不去 —— 出问题要看 C++ 日志或 nsys trace，新人常卡在"Python 报错信息无用" 这一步。

## 适用 vs 不适用场景

**适用**：

- 已锁定 NVIDIA GPU（特别是 H100/H200/B100）
- 对吞吐 / 延迟敏感、模型相对稳定（LLaMA 系、GPT 系、Qwen 系等主流）
- 愿意为最后 30-50% 的性能付出 build 复杂度

**不适用**：

- 多硬件后端（要跑 AMD MI300 / TPU / Apple Silicon） → 用 vLLM 或 SGLang
- 研究阶段、模型结构频繁改 → 用 vLLM（改 Python 即跑）
- 需要极高定制（自研 attention、自研采样策略） → vLLM 更易 hack
- 边缘 / 小模型场景（用不上 FP8 / TP） → 用 ONNX Runtime / llama.cpp 更轻

## 历史小故事（可跳过）

- **2017 年**：NVIDIA 发布 TensorRT，主打 CV 模型（ResNet / SSD） 推理加速
- **2021 年**：FasterTransformer 开源，把 Transformer kernel 做到极致，但只是"一次前向" 的库，没有调度
- **2022 年**：Orca 论文提出 continuous batching；2023 年 vLLM 把 PagedAttention + continuous batching 在开源圈普及
- **2023 年 10 月**：NVIDIA 发布 TensorRT-LLM，把 FT 的 kernel + TRT 的编译 + Triton 的服务 + IFB 的调度拼成一整套，开源在 GitHub
- **2024-2025 年**：FP8 / Medusa speculative decoding / multi-LoRA / 长上下文支持持续迭代，成为 NVIDIA 官方推理基线

## 学到什么

1. **厂商整合 vs 开源积木**是 LLM 推理两条主线：TRT-LLM 是垂直整合的极致（编译 + kernel + 服务一条龙），vLLM 是开放积木（Python + 任意硬件 + 任意调度）
2. **AOT 编译换性能**：TRT-LLM 的硬通货是 build 阶段拿到的全图优化机会，代价是开发体验差
3. **好点子开源圈先跑、厂商再吸收**：continuous batching / paged KV 都是开源先趟出来，TRT-LLM 改名叫 IFB / paged KV cache 装进官方栈
4. **"快"的颗粒度不一样**：vLLM 快在改完即跑、跨硬件、调度灵活；TRT-LLM 快在 H100 上单 token 多榨 30%

## 延伸阅读

- 官方仓库：[NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)（看 examples/ 下的 LLaMA / GPT / Mixtral 各家配置）
- 官方博客：[NVIDIA TensorRT-LLM 2023-10 announcement](https://developer.nvidia.com/blog/nvidia-tensorrt-llm-supercharges-large-language-model-inference-on-nvidia-h100-gpus/)
- [[fastertransformer-2021]] —— TRT-LLM 的 kernel 前身
- [[vllm]] —— 开源对照组，理解两条路线对比的关键
- [[orca-continuous-batching]] —— IFB 思想的源头论文
- [[triton-llm]] —— 服务层 Triton Inference Server（注意和 OpenAI Triton 不是一个东西）

## 关联

- [[fastertransformer-2021]] —— FT 的 CUDA kernel 是 TRT-LLM 算子层的根
- [[vllm]] —— PagedAttention / continuous batching 的开源对照，TRT-LLM 后续吸收同类机制
- [[orca-continuous-batching]] —— continuous batching 的学术源头，TRT-LLM 改名 IFB 复现
- [[triton-llm]] —— Triton Inference Server 是 TRT-LLM 的服务层载体
- [[ampere-architecture-2020]] —— Ampere 是 TRT-LLM 早期主力硬件，到 Hopper 才解锁 FP8 全部能力
