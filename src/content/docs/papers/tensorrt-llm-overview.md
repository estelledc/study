---
title: TensorRT-LLM — NVIDIA 开源 LLM 推理优化库零基础笔记
来源: https://github.com/NVIDIA/TensorRT-LLM
日期: 2026-06-13
分类: 机器学习
子分类: ML 系统
provenance: pipeline-v3
---

## 从日常类比开始：连锁奶茶店的后厨

把 LLM 推理想成一家连锁奶茶店。

- **原始 PyTorch 推理**像家庭厨房：一个师傅从头做到尾，杯子、茶叶、冰块各放各的抽屉，客人一多就排队。
- **TensorRT-LLM**像中央厨房 + 智能叫号系统：茶叶提前拼好（kernel 融合）、冰块按块冷冻（paged KV cache）、新客人不用等前一位喝完就能插队（in-flight batching）、大杯小杯共用一条流水线（continuous batching），门口还能挂 Triton 收银台对外接单。

你端给客人的还是同一杯奶茶（数学结果不变），但后厨的组织方式彻底换了。

**TensorRT-LLM**（全称 *NVIDIA TensorRT-LLM: An Open-Source Library for Optimizing LLM Inference*）就是这套后厨系统：不是新模型，而是把 Hugging Face 权重、PyTorch 算子和 NVIDIA GPU 硬件焊在一起的**推理工程栈**——目标是在 NVIDIA GPU 上跑得更快、更省显存、扛更多并发。

## 为什么重要

零基础学 LLM 部署，绕不开 TensorRT-LLM，原因很实在：

- **厂商官方背书**：NVIDIA 在 H100 / B200 上的 FP8、FP4、Transformer Engine 优化，往往**最先**出现在 TensorRT-LLM，而不是等社区框架慢慢追。
- **性能天花板对照组**：2024 年后的推理 benchmark（Llama、DeepSeek、Qwen 等）几乎都会列 TRT-LLM 一行——它是"在 NVIDIA 自家硬件上能跑到多快"的参考上限。
- **生态接口**：和 [[vllm]]、[[sglang-2024]] 并列，但 TRT-LLM 和 **Triton Inference Server**、**NVIDIA Dynamo**、**NeMo** 绑得更紧，适合要上生产的 NVIDIA 栈。
- **架构已进化**：2023 年刚开源时以"离线编译 TensorRT engine"为主；2025-2026 年的主线已是 **PyTorch-native LLM API**——`LLM(model=...)` 一行起，开发体验和 vLLM 接近，但底层仍是 NVIDIA 定制 kernel。

不理解它，就很难解释：为什么同样一张 H100，不同框架吞吐能差 2-5 倍；为什么 FP8 KV cache 在 TRT-LLM 上"开箱即用"，别的框架却要等社区补 kernel。

## 核心概念

TensorRT-LLM 把推理拆成 **五层积木**，从外到内：

### 1. LLM API（你写的 Python）

高层入口，用法接近 vLLM：

```python
from tensorrt_llm import LLM, SamplingParams

llm = LLM(model="TinyLlama/TinyLlama-1.1B-Chat-v1.0")
sampling = SamplingParams(temperature=0.8, top_p=0.95)
for out in llm.generate(["Hello, my name is"], sampling):
    print(out.outputs[0].text)
```

接受 Hugging Face 模型 ID、本地路径、或 NVIDIA 量化 checkpoint（如 `nvidia/Llama-3.1-8B-Instruct-FP8`）。单卡到多卡、多节点都走同一套 API。

### 2. 执行后端（Backend）

TRT-LLM 支持三种后端，选型决定"灵活 vs 极致性能 vs 零实现"：

| 后端 | 状态 | 特点 |
|------|------|------|
| **PyTorch** | 默认 ✅ | 无需离线编译，灵活，性能优秀 |
| **TensorRT** | Legacy | AOT 编译 `engine.plan`，极致性能，改模型要重编 |
| **AutoDeploy** | Beta | 自动图变换，Day-0 支持新 HF 模型 |

```python
# 默认 PyTorch 后端（推荐）
llm = LLM(model="meta-llama/Llama-3.1-8B", backend="pytorch")

# 旧路径：TensorRT 编译引擎（适合模型结构已冻结的生产）
llm = LLM(model="./engines/llama-8b", backend="tensorrt")
```

### 3. 运行时调度器（Runtime）

负责"怎么同时服务很多用户"：

- **In-Flight Batching（IFB）**：也叫 continuous batching。新请求不必等旧请求生成完，下一步 forward 直接拼进 batch。和 [[orca-continuous-batching]]、[[vllm]] 的调度思想同源。
- **Paged KV Cache**：把 KV cache 切成固定大小 block，用 page table 间接寻址——显存利用率从"每人预留满血上下文"变成"按需开房"。
- **Chunked Prefill**：长 prompt 分块做 prefill，避免单次 forward 撑爆显存。
- **Disaggregated Serving（Beta）**：prefill 和 decode 拆到不同 GPU，类似"点菜厨房"和"出杯窗口"分离。

### 4. 优化 Kernel 层

NVIDIA 手写或生成的 CUDA kernel，吃满硬件特性：

- **Kernel Fusion**：LayerNorm + GEMM + bias + activation 合成一次 launch，少写 HBM。
- **Custom Attention**：Flash Attention 变体、FP8 attention（Hopper+）、GQA/MQA 专用路径。
- **量化 Kernel**：FP8 / FP4 / INT8 SmoothQuant / INT4 AWQ，权重和 KV cache 都可降精度。
- **MoE 优化**：Wide Expert Parallelism，大专家模型跨卡切分。

### 5. 服务层（Triton / Dynamo）

生产部署时，TRT-LLM 常挂在 **Triton Inference Server** 后面，对外暴露 HTTP/gRPC。`tensorrtllm_backend` 把 IFB 调度嵌进 Triton 的多模型、多实例框架。NVIDIA Dynamo 则做更大规模的分布式推理编排。

---

**三条主线串起来**：LLM API 让你**用起来简单** → Runtime 让你**并发高** → Kernel 让你**单 token 快** → 服务层让你**能上线**。

## 实践案例

### 案例 1：最小可运行推理（LLM API）

官方 Quick Start 的精简版，适合第一次验证环境：

```python
from tensorrt_llm import LLM, SamplingParams


def main():
    llm = LLM(model="TinyLlama/TinyLlama-1.1B-Chat-v1.0")

    prompts = [
        "Hello, my name is",
        "The capital of France is",
        "The future of AI is",
    ]
    sampling_params = SamplingParams(temperature=0.8, top_p=0.95)

    for output in llm.generate(prompts, sampling_params):
        print(f"Prompt: {output.prompt!r}")
        print(f"Generated: {output.outputs[0].text!r}\n")


if __name__ == "__main__":
    main()
```

注意：`LLM` 会拉起后台线程和 MPI 进程，**必须把逻辑包在函数里**，并用 `if __name__ == "__main__"` 保护入口，否则多卡时 `mpi4py` 可能递归 spawn 挂死。

### 案例 2：多卡张量并行（Tensor Parallelism）

单机多 GPU 时，不必手写 `mpirun` 前缀——LLM API 内部处理：

```python
from tensorrt_llm import LLM, SamplingParams

# tp_size=4 表示 4 张 GPU 做张量并行，把大模型切开
llm = LLM(
    model="meta-llama/Llama-3.1-70B",
    tensor_parallel_size=4,
)

outputs = llm.generate(
    ["用三句话解释量子纠缠。"],
    SamplingParams(max_tokens=128, temperature=0.7),
)
print(outputs[0].outputs[0].text)
```

张量并行（TP）把每一层的权重矩阵按列或按行切到多张卡；流水线并行（PP）按层切；专家并行（EP）专给 MoE 模型。TRT-LLM 的 Model Definition API 和 LLM API 都内置这些策略。

### 案例 3：Legacy 路径——离线 build TensorRT 引擎

如果你走旧版 TensorRT 后端，流程是"先编译、再加载"：

```bash
# 1. 量化（可选，H100 上 FP8 收益大）
python quantize.py \
  --model_dir ./llama-2-7b-hf \
  --qformat fp8 \
  --kv_cache_dtype fp8 \
  --output_dir ./fp8-ckpt

# 2. 编译 engine（耗时：7B 约 5-15 分钟，70B 可达半小时）
python build.py \
  --checkpoint_dir ./fp8-ckpt \
  --use_inflight_batching \
  --paged_kv_cache \
  --output_dir ./engines/llama2-7b-fp8
```

```python
from tensorrt_llm.runtime import ModelRunner

runner = ModelRunner.from_dir("./engines/llama2-7b-fp8")
result = runner.generate(["介绍一下量子计算。"], max_new_tokens=128)
print(result)
```

`engine.plan` **绑定编译时的 GPU 架构**——A100 编的不能直接拿到 H100 跑，换卡要重编。这是 TensorRT 后端和 PyTorch 后端最大的体验差异。

### 案例 4：投机解码（Speculative Decoding）

用草稿模型或小模型先猜几个 token，大模型一次验证多个，降低每 token 延迟：

```python
from tensorrt_llm import LLM, SamplingParams

llm = LLM(
    model="meta-llama/Llama-3.1-8B",
    speculative_model="meta-llama/Llama-3.2-1B",  # 草稿模型
    speculative_decode_max_draft_len=5,
)

out = llm.generate(
    "写一首关于星空的短诗：",
    SamplingParams(max_tokens=200),
)
print(out[0].outputs[0].text)
```

TRT-LLM 支持 EAGLE、MTP、N-gram 等多种投机策略；在延迟敏感场景（聊天机器人首字后的流式输出）收益明显。

## 和 vLLM 怎么选

| 维度 | TensorRT-LLM | vLLM |
|------|--------------|------|
| 硬件 | NVIDIA GPU 专属 | NVIDIA 为主，也支持 AMD 等 |
| 上手 | LLM API 已简化；Legacy 路径仍要 build | `LLM(model=...)` 改完即跑 |
| 极致性能 | H100/B200 上 FP8/FP4 官方路径成熟 | 社区驱动，追得快但厂商特性滞后 |
| 可 hack 性 | PyTorch 后端改善中；深定制仍要 C++ plugin | Python 改调度/kernel 门槛低 |
| 生产配套 | Triton + Dynamo + NeMo 一条龙 | 自带 OpenAI 兼容 server，生态广 |

常见路径：**研究 / 快速迭代用 vLLM，上线 NVIDIA 集群再切 TRT-LLM 榨最后 30-50% 性能**。

## 踩过的坑

1. **engine 不可移植**：TensorRT 后端的 `engine.plan` 和 GPU 架构、TRT 版本、TP/PP 配置绑定。CI 应存 checkpoint + build 脚本，而不是存 engine 二进制。

2. **mpi4py 入口保护**：多卡必须把 `LLM(...)` 放在函数内，并加 `if __name__ == "__main__"`，否则 Slurm / Docker 环境容易挂死或 `MPI_ABORT`。

3. **Docker 网络**：`docker run --net=host` 有时和 MPI 冲突，可改 `--ipc=host` 或设 `OMPI_MCA_btl_tcp_if_include=lo`。

4. **进程退不干净**：`LLM` 实例持有后台线程，引用计数可能不归零。用 `with LLM(...) as llm:` 上下文管理器，或把推理包在函数里让对象析构。

5. **别把 Triton 和 OpenAI Triton 搞混**：服务层的 Triton Inference Server 是 NVIDIA 推理服务器；[[triton-2019]] 是 GPU kernel 语言 DSL——名字像，完全不是一回事。

## 历史脉络（可跳过）

- **2017**：TensorRT 发布，主攻 CV 模型推理编译。
- **2021**：[[fastertransformer-2021]] 开源，提供极致 Transformer CUDA kernel，但没有调度层。
- **2023-10**：TensorRT-LLM 开源，整合 TRT 编译 + FT kernel + IFB + Triton 服务。
- **2024**：吸收社区 PagedAttention 思路；FP8、投机解码、多 LoRA 持续迭代。
- **2025-2026**：架构转向 **PyTorch-native**，LLM API 成为默认入口；AutoDeploy 实验后端追求 Day-0 新模型支持；Blackwell（B200）上 FP4、DeepSeek-R1 等成为 showcase。

## 学到什么

1. **TensorRT-LLM 是"推理工程栈"，不是模型**：它优化的是同一份权重在 GPU 上怎么跑、怎么调度、怎么服务。
2. **性能来自三层叠加**：kernel 级（融合、量化、定制 attention）+ 运行时级（IFB、paged KV、投机解码）+ 系统级（多卡并行、disaggregated serving）。
3. **后端选型决定开发体验**：PyTorch 后端适合日常；TensorRT 后端适合冻结模型后的极致压榨。
4. **开源社区和厂商互相借力**：continuous batching、paged KV 等思想先在 Orca / vLLM 趟路，TRT-LLM 以 IFB / paged KV cache 集成进官方栈并叠加硬件特化。

## 延伸阅读

- 官方仓库：[NVIDIA/TensorRT-LLM](https://github.com/NVIDIA/TensorRT-LLM)
- 官方文档：[Overview](https://nvidia.github.io/TensorRT-LLM/latest/overview.html) · [LLM API](https://nvidia.github.io/TensorRT-LLM/latest/llm-api/index.html) · [Execution Backends](https://nvidia.github.io/TensorRT-LLM/latest/concepts/backends.html)
- NVIDIA 技术博客：[Optimizing Inference on LLMs with TensorRT-LLM](https://developer.nvidia.com/blog/optimizing-inference-on-llms-with-tensorrt-llm-now-publicly-available/)
- [[tensorrt-llm-2023]] —— 本仓库内 2023 年视角的 TRT-LLM 笔记（偏 Legacy build 流程）
- [[vllm]] —— 开源对照组，PagedAttention 与 continuous batching 的标杆实现
- [[fastertransformer-2021]] —— TRT-LLM kernel 层的重要前身
- [[flash-attention]] —— attention kernel 优化的理论基础，TRT-LLM 内置多种变体
- [[orca-continuous-batching]] —— IFB 调度思想的学术源头

## 关联

- [[tensorrt-llm-2023]] —— 同主题早期笔记，侧重 AOT 编译与 IFB 初版
- [[vllm]] —— PagedAttention 开源实现，TRT-LLM 运行时吸收同类机制
- [[fastertransformer-2021]] —— CUDA kernel 遗产，构成 TRT-LLM 算子层底座
- [[sglang-2024]] —— 另一套高性能 LLM 服务框架，常与 TRT-LLM 并列 benchmark
- [[triton-2019]] —— GPU kernel DSL（勿与 Triton Inference Server 混淆）
- [[eagle]] —— 投机解码代表算法，TRT-LLM 已内置 EAGLE 路径
