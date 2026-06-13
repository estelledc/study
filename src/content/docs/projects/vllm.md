---
title: vLLM — 高吞吐 LLM 推理引擎
来源: https://github.com/vllm-project/vllm
日期: 2026-05-29
子分类: ai-infra
分类: 机器学习
难度: 中级
provenance: pipeline-v3
---

## 是什么

**vLLM** 是 UC Berkeley 2023 年开源的一个 LLM 推理服务器，核心创新叫 **PagedAttention**，把 GPU 显存利用率从其他引擎的 ~25% 提到了 96%。

日常类比：

- **以前的 LLM 推理引擎**：像每个客户进停车场就独享整间停车场。一次对话最多可能写 4096 个 token，引擎就**预留 4096 个 token 的 KV cache 显存**——哪怕这个用户只说了 "你好"。
- **vLLM**：像精确分配车位——KV cache 切成固定大小的"块"（比如每块 16 个 token），按需分配。用户说几个 token 就占几块，剩下的留给别人。

结果：同一张 GPU 能同时服务的并发请求数翻 5-10 倍。

## 为什么重要

不理解 vLLM，下面这些事都没法解释：

- **吞吐量**：vLLM 是开源 LLM 推理目前的事实标准。比 HuggingFace Transformers 高 24 倍吞吐，比 HuggingFace TGI 高 2-3 倍
- **学术分量**：背后论文 [SOSP 2023 PagedAttention](https://arxiv.org/abs/2309.06180) 是系统会议顶会论文；OpenAI / Anthropic 内部推理栈也参考了类似思路
- **生态默认**：你下载 Llama-3 / Mistral / Qwen，部署到生产，默认推荐的服务器就是 vLLM
- **OpenAI API 兼容**：起一个 vLLM server，任何写过 OpenAI SDK 调用的代码不改一行就能跑——本地大模型瞬间替代 GPT API

## 核心要点

vLLM 的"快"来自三个发明叠加：

### PagedAttention（分页注意力）

LLM 推理时每一步都要查"之前所有 token 的 KV"（Key-Value 缓存）。传统做法把 KV cache 存成一整块连续显存——为了能放下"最长可能"的对话，必须按最大长度预留。

vLLM 把 KV cache **切成固定大小的块**（block，默认 16 个 token），用一张"块表"（block table）记录"这个请求用了哪些块"。新 token 来了再分新块。这是直接照搬操作系统 **虚拟内存分页**（paging）的思路。

### Continuous Batching（连续批处理）

传统批处理：凑够 8 个请求一起跑，跑完再凑下 8 个。慢请求堵死整批。

vLLM 的做法：每生成完一个 token，就检查"哪些请求结束了"，让结束的请求出列、新请求**立即加入**。批次永远满，GPU 永远不闲。

### Tensor Parallelism + Speculative Decoding

- **Tensor Parallelism**：把模型的大矩阵切成若干份，跨多张 GPU 并行算。70B 模型放不下单卡？切成 4 张 A100。
- **Speculative Decoding**：用一个**小模型**先猜接下来 5 个 token，**大模型**一次性验证猜对了几个。猜对一半就省一半算力。

## 实践案例

### 起一个 OpenAI 兼容的 server

```bash
pip install vllm
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3.1-70B-Instruct \
    --tensor-parallel-size 4 \
    --gpu-memory-utilization 0.9
```

四张 GPU 切分 70B 模型，预留 90% 显存给 KV cache（剩下 10% 给模型权重和激活）。

### 任何 OpenAI client 通用

```bash
curl http://localhost:8000/v1/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "meta-llama/Llama-3.1-70B-Instruct",
        "prompt": "Once upon a time",
        "max_tokens": 100
    }'
```

把 `OPENAI_BASE_URL` 改成 `http://localhost:8000/v1`，原本调 GPT 的代码原样跑——不用改一行。

### 吞吐量参考

A100 80GB 单卡跑 Llama-7B：稳定 200+ tokens/s 的总输出速率（多请求并发汇总）。换成 HuggingFace 原生 `model.generate()` 大约只有 30-40 tokens/s。

## 踩过的坑

- **显存预算**：vLLM 启动时要预申请 KV cache，`--gpu-memory-utilization` 默认 0.9。设太高 OOM，设太低浪费。20GB 卡跑 7B 模型至少要 `0.85`
- **Multi-LoRA serving**：同一个 base 模型挂多个 LoRA adapter（一个客户一个微调版本）需要显式 `--enable-lora --max-loras 4`，否则 LoRA 不生效
- **量化方案选错很卡**：AWQ / GPTQ / FP8 性能差异大。FP8 在 H100 / Ada 卡上最快；AWQ 兼容性最好但慢一档；GPTQ 老但稳。选错某些算子会落到 CPU 后处理
- **vs TensorRT-LLM**：NVIDIA 官方推理引擎，编译期优化更狠，单请求延迟更低，但是闭源、调试黑盒、改代码靠 trial and error。vLLM 更适合"快速迭代 + 多模型"，TensorRT-LLM 更适合"单一模型极致优化"

## 适用 vs 不适用场景

**适用**：

- 部署开源 LLM（Llama / Mistral / Qwen / DeepSeek）做服务化推理
- 多并发 chat / completion API 服务，需要高吞吐
- 需要 OpenAI API 兼容性的内部替代部署
- 多 LoRA 多租户场景

**不适用**：

- 单卡、单请求、追求最低 latency → 试试 TensorRT-LLM 或 llama.cpp
- 训练或微调（vLLM 只做推理）
- 极轻量边缘部署（树莓派、手机）→ 用 llama.cpp / Ollama
- 闭源模型（GPT / Claude / Gemini）→ 直接调它们的 API，vLLM 只跑权重可下载的开源模型

## 历史小故事（可跳过）

- **2023-06**：UC Berkeley 的 Sky Computing Lab 发布 vLLM v0.1.0，同年 SOSP 发表 PagedAttention 论文。当时的对照组是 HuggingFace Transformers 和 NVIDIA FasterTransformer
- **2023 下半年**：加 OpenAI API 兼容层。这一步让大量"已经写好 GPT 代码"的产品可以无痛切到本地模型，奠定了生态地位
- **2024 上半年**：加入 speculative decoding（推测解码）和 multi-LoRA serving
- **2024 年中（v0.6）**：加入 prefix caching——多个请求共享同一个系统提示时，前缀的 KV cache 算一次就行
- **2025**：v1.0 发布，调度器重写、性能再翻一档；社区贡献者超过 1000 人，成为开源 LLM serving 的**默认基础设施**

## 学到什么

- **OS 思想能直接搬到 ML 基建**：PagedAttention 就是把 1960 年代的虚拟内存分页搬到 2023 年的 GPU 显存
- **吞吐 vs 延迟是两个目标**：vLLM 优化的是吞吐（单位时间总 token 数），不是单请求延迟。两者经常冲突
- **OpenAI API 是事实标准**：不管底下跑什么模型，对外暴露 OpenAI 接口，生态就能直接复用
- **学术 → 工程 → 生态**只用了 18 个月。系统论文不再是写完就归档，而是直接转化成生产基建

## 延伸阅读

- 论文：[Efficient Memory Management for LLM Serving with PagedAttention (SOSP 2023)](https://arxiv.org/abs/2309.06180)
- 官方仓库：[vllm-project/vllm](https://github.com/vllm-project/vllm)
- [[ollama]] —— 轻量本地 LLM 推理（互补，不竞争）
- [[continue]] —— 编辑器 AI 助手，可以接 vLLM 当后端

## 关联

- [[ollama]] —— 同样跑开源 LLM，但定位是单机轻量；vLLM 定位是服务端高吞吐
- [[continue]] —— IDE 端 AI assistant；可以把 vLLM 当成 OpenAI-compatible backend
- [[claude-code]] —— Anthropic 的官方编码助手；vLLM 偏向"自己部署开源模型替代闭源 API"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[awq]] —— AWQ — 看激活脸色给权重打折
- [[awq-2023]] —— AWQ 2023 — 让 70B 大模型住进 RTX 4090
- [[bentoml]] —— BentoML — 模型打包部署
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[continue]] —— Continue — 让 AI code review 跑成 git 跟踪的 PR status check
- [[crewai]] —— CrewAI — 把多 Agent 编排做成"组团队"
- [[ctranslate2]] —— CTranslate2 — Transformer 模型推理的 C++ 加速引擎
- [[distserve]] —— DistServe — 把 prefill 和 decode 拆到不同 GPU 上跑
- [[eagle]] —— EAGLE — 让大模型先在"特征层"猜下一步而不是猜 token
- [[fastertransformer-2021]] —— FasterTransformer 2021 — NVIDIA 第一代开源 LLM 推理引擎
- [[gptq-2023]] —— GPTQ — 把 175B 大模型压成 4-bit 还几乎不掉点
- [[lapce]] —— Lapce — 把编辑器搬到 GPU 上的 Rust 实验
- [[litellm-proxy]] —— LiteLLM Proxy — 自托管的 LLM 统一网关
- [[llama-cpp]] —— llama.cpp — 让 LLM 在你电脑里直接跑
- [[lm-evaluation-harness]] —— lm-evaluation-harness — LLM 基准评测底座
- [[medusa-2024]] —— Medusa — 让大模型自己同时猜好几个 token
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[nvidia-mig]] —— NVIDIA MIG — 把一张 GPU 物理切成 7 张小卡
- [[ollama]] —— Ollama — 本地跑 LLM 的工具
- [[orca-2022]] —— Orca — Transformer 生成模型的分布式推理调度
- [[orca-continuous-batching]] —— Orca — 让一批 LLM 请求随到随走，不再排队等最长那个
- [[sarathi-serve]] —— Sarathi-Serve — 让长 prompt 不再卡住所有人的流式回复
- [[sglang]] —— SGLang — 结构化推理运行时
- [[sglang-2024]] —— SGLang — 把 LLM 程序当成共享前缀的树来跑
- [[smoothquant-2023]] —— SmoothQuant 2023 — 把激活的烫手山芋扔给权重
- [[specinfer-2023]] —— SpecInfer — 让大模型一次"猜一棵树"再并行验证
- [[tensorrt-llm-2023]] —— TensorRT-LLM — NVIDIA 把 FT 升级成可调度的官方推理栈
- [[tensorrt-llm-overview]] —— TensorRT-LLM — NVIDIA 开源 LLM 推理优化库零基础笔记
- [[transformers-video]] —— Transformers Video — HuggingFace 视频处理器与多模态输入管线
- [[triton-2019]] —— Triton 2019 — 让 Python 写出贴近 cuBLAS 的 GPU kernel
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[triton-llm]] —— Triton — 让 Python 程序员也能写出贴近 cuBLAS 的 GPU kernel
- [[videochat2]] —— VideoChat2 — OpenGVLab 三阶段训练 Video-LLM 官方实现
- [[vllm-multimodal]] —— vLLM Multimodal — 多模态与视频 URL 高吞吐推理服务
- [[zero-2020]] —— ZeRO 2020 — 把训练状态切成 N 份让万亿参数成为可能

