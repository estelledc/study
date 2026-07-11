---
title: vLLM — 高吞吐 LLM 推理引擎
来源: https://github.com/vllm-project/vllm
日期: 2026-05-29
分类: AI / 推理
难度: 中级
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
- **学术分量**：背后论文 [SOSP 2023 PagedAttention](https://arxiv.org/abs/2309.06180) 是系统会议顶会；分页 KV 思路后来成了业界开源推理栈的常见做法
- **生态默认**：你下载 Llama-3 / Mistral / Qwen，部署到生产，默认推荐的服务器就是 vLLM
- **OpenAI API 兼容**：起一个 vLLM server，任何写过 OpenAI SDK 调用的代码不改一行就能跑——本地大模型瞬间替代 GPT API

## 核心要点

vLLM 的"快"来自三个发明叠加：

1. **PagedAttention（分页注意力）**：推理时每一步都要查"之前所有 token 的 KV"（Key-Value 缓存，像对话的短期记忆）。传统做法按最长可能长度预留一整块显存。vLLM 把 KV 切成固定大小的块（默认 16 个 token），用块表按需分配——直接照搬操作系统的**虚拟内存分页**。

2. **Continuous Batching（连续批处理）**：传统批处理凑满 8 个请求一起跑，慢请求堵死整批。vLLM 每生成完一个 token 就让结束的请求出列、新请求立即加入。类比：餐厅不等整桌吃完才换下一桌，谁吃完谁走、谁来谁坐。

3. **张量并行 + 推测解码**：大矩阵切到多张 GPU 上并行算（70B 放不下单卡就切 4 张）；再用小模型先猜接下来几个 token，大模型一次验证——猜对一半就省一半算力。

## 实践案例

### 案例 1：单卡起一个最小 server

```bash
pip install vllm
vllm serve meta-llama/Llama-3.1-8B-Instruct \
    --gpu-memory-utilization 0.9
```

**逐部分解释**：

1. `pip install vllm` 装推理引擎（旧写法也可用 `python -m vllm.entrypoints.openai.api_server`）
2. `vllm serve <模型名>` 拉起 OpenAI 兼容 HTTP 服务，默认监听 `8000`
3. `--gpu-memory-utilization 0.9` 把约 90% 显存留给 KV cache；8B 单卡即可跟做

### 案例 2：用 curl 打一次补全

```bash
curl http://localhost:8000/v1/completions \
    -H "Content-Type: application/json" \
    -d '{"model":"meta-llama/Llama-3.1-8B-Instruct","prompt":"Once upon a time","max_tokens":100}'
```

**逐部分解释**：

1. 路径 `/v1/completions` 与 OpenAI 同款，客户端几乎不用改
2. `model` 必须和启动时的模型名一致
3. 把环境变量 `OPENAI_BASE_URL` 设成 `http://localhost:8000/v1`，原有 SDK 代码可原样跑

### 案例 3：看吞吐差在哪

```bash
# 多请求压测时观察总输出 tokens/s（示意）
# A100 80GB 单卡 Llama-7B：vLLM 常到 200+ tokens/s
# 同卡 HuggingFace model.generate()：大约 30-40 tokens/s
```

**逐部分解释**：数字比的是**多请求汇总吞吐**，不是单条延迟；vLLM 靠分页 KV + 连续批处理把 GPU 填满，所以并发一上来差距才明显。

## 踩过的坑

1. **显存预算**：启动时预申请 KV cache，`--gpu-memory-utilization` 默认 0.9；设太高 OOM，设太低浪费，20GB 卡跑 7B 至少要约 `0.85`
2. **Multi-LoRA serving**：同一 base 挂多个 LoRA（一个客户一个微调版）必须显式 `--enable-lora --max-loras 4`，否则 adapter 不生效
3. **量化方案选错很卡**：FP8 在 H100/Ada 最快，AWQ 兼容最好但慢一档，GPTQ 老但稳；选错算子可能落到 CPU 后处理
4. **vs TensorRT-LLM**：官方引擎单请求延迟常更低，但闭源难调试；vLLM 更适合快速迭代多模型，TensorRT-LLM 更适合单一模型极致优化

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
- **2025**：发布 **V1 引擎**（调度器等核心重写，包版本仍多为 0.x）；社区贡献者过千，成为开源 LLM serving 的默认基建

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
- [[sglang]] —— 另一条高吞吐推理路线，偏结构化生成与前缀共享
- [[tensorrt-llm-2023]] —— NVIDIA 官方极致优化栈；单模型延迟常更低，但迭代成本更高
- [[llama-cpp]] —— CPU/边缘友好的本地推理；和 vLLM 的 GPU 服务端定位互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[projects/bentoml]] —— BentoML — 模型打包部署
- [[crewai]] —— CrewAI — 把多 Agent 编排做成"组团队"
- [[ctranslate2]] —— CTranslate2 — Transformer 模型推理的 C++ 加速引擎
- [[litellm-proxy]] —— LiteLLM Proxy — 自托管的 LLM 统一网关
- [[llama-cpp]] —— llama.cpp — 让 LLM 在你电脑里直接跑
- [[lm-evaluation-harness]] —— lm-evaluation-harness — LLM 基准评测底座
- [[nvidia-gpu-operator]] —— NVIDIA GPU Operator — K8s 上自动装 GPU 软件栈
- [[nvidia-mig]] —— NVIDIA MIG — 把一张 GPU 物理切成 7 张小卡
- [[ollama]] —— Ollama — 本地跑 LLM 的工具
- [[sglang]] —— SGLang — 结构化推理运行时
- [[triton-inference-server]] —— Triton Inference Server — NVIDIA 多框架推理服务化标杆
- [[unstructured]] —— Unstructured — 把任意文档解析成 LLM 能吃的元素列表
