---
title: Ollama — 本地跑 LLM 的工具
来源: https://github.com/ollama/ollama
日期: 2026-05-29
分类: AI / 推理
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/ollama/ollama
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 13f2fb8c99278469b954429d5541019f4d83a4d0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: v0.33.1
---

## 是什么

Ollama 是**本地大语言模型的“Docker”**。日常类比：以前想在自己电脑跑一个 LLM，要装 Python、装 CUDA、装推理框架、对齐一堆依赖版本；Ollama 把这些打包成一个 Go 编写的服务加一行命令。

实际操作长这样：

```bash
ollama pull llama3.1      # 下载模型
ollama run llama3.1       # 进入对话
```

服务默认监听 `127.0.0.1:11434`。更关键的是：固定 v0.33.1 在同一个端口上同时提供三套 HTTP API——自家原生 `/api/*`、OpenAI 兼容 `/v1/chat/completions` 等、以及 Anthropic Messages 兼容 `/v1/messages`。你之前写给 OpenAI 或 Claude 的客户端代码，把 base URL 一改就能打到本地模型。

## 为什么重要

不理解 Ollama 的分层，下面这些事说不清：

- 为什么“本地跑 LLM”从一件需要工程师折腾环境的事，变成了一行命令的事——变化在安装与分发工程，不在模型本身
- 为什么 LangChain / LlamaIndex 这类框架都默认支持 Ollama——它同时讲 OpenAI 和 Anthropic 两种“方言”，存量客户端零改动
- 为什么 `ollama create` 基于已有模型做定制几乎不占额外磁盘——和 Docker layer 复用是同一招
- 为什么模型第一次请求慢、过几分钟再问又要重新加载——服务、调度器与推理子进程是三层

## 核心要点

固定 v0.33.1 的架构可以拆成三层：

1. **Modelfile（Dockerfile 风格的模型配置 DSL）**：parser 接受 `FROM`、`PARAMETER`、`TEMPLATE`、`SYSTEM`、`ADAPTER`、`LICENSE`、`MESSAGE`、`RENDERER` 等指令。写一个声明文件“基于 llama3.1，加一段 system prompt，温度 0.7”，`ollama create` 出一个新名字的模型。类比：Dockerfile 基于基础镜像加几层。

2. **内容寻址存储**：模型数据放在 `<models>/blobs/sha256-<摘要>`，名字与版本由 `<models>/manifests/` 里的清单指向这些 blob——和 Docker/Git 一样“内容定址、清单引用”。所以 `ollama create` 不复制权重，只新建一份 manifest 复用既有 blob；同一权重被多个自定义模型共享。

3. **服务与推理引擎分离**：HTTP 层（原生 + OpenAI + Anthropic 三套 API）→ 调度器（按 `OLLAMA_NUM_PARALLEL`、`OLLAMA_KEEP_ALIVE` 管理加载与并发）→ 推理子进程。该版本源码明确：**所有 GGML/GGUF 模型由上游 `llama-server` 子进程推理**（仓库根 `LLAMA_CPP_VERSION` 锁定 b10630）；Apple MLX 路径走独立的 `--mlx-engine` runner。Ollama 不再自己重写推理循环，而是把上游引擎当成可替换的子进程。

三个关键默认值（envconfig）：监听 `127.0.0.1:11434`；`OLLAMA_NUM_PARALLEL=1`（单模型并发请求数）；`OLLAMA_KEEP_ALIVE=5m`（模型空闲 5 分钟后卸载）。

## 实践示例

### 案例 1：两行命令 + 一个 curl

```bash
ollama pull llama3.1
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.1",
  "messages": [{"role": "user", "content": "用一句话解释相对论"}]
}'
```

**逐部分**：`pull` 把模型 blob 下载进内容寻址存储并写 manifest；`/api/chat` 是原生对话端点，默认流式返回。首次请求会触发模型加载（调度器拉起推理子进程），空闲超过 keep-alive 后卸载，下次请求再加载。

### 案例 2：用 Modelfile 做个“古文先生”

```bash
cat > Modelfile <<'EOF'
FROM llama3.1
SYSTEM "你是一位读过四书五经的先生。无论问什么都用古文回答，每句不超过 12 字。"
PARAMETER temperature 0.6
EOF

ollama create sage -f Modelfile
ollama run sage "如何学好编程？"
```

**逐部分**：`FROM` 指向已有模型；`SYSTEM` 与 `PARAMETER` 是 parser 支持的指令。`create` 不会重新下载 llama3.1 的权重——它复用既有 blob，只新建一份 manifest 指向同一文件，这就是“像 Docker”的 layer 复用。

### 案例 3：OpenAI / Anthropic 客户端零改动打到本地

```python
from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")
resp = client.chat.completions.create(
    model="llama3.1",
    messages=[{"role": "user", "content": "Go 的 channel 一句话讲清"}],
)
```

**逐部分**：`/v1/chat/completions`、`/v1/completions`、`/v1/embeddings`、`/v1/models`、`/v1/responses` 是 OpenAI 兼容层；同版本还挂了 Anthropic Messages 兼容的 `/v1/messages`——两大主流客户端生态的存量代码都只改 base URL。`api_key` 本地不校验，但多数 SDK 要求非空。

## 踩过的坑

1. **内存由模型大小决定**：模型文件多大，加载进内存/显存就大致要多大，超了就加载失败或落到极慢路径。下载前用 `ollama list` 看体积，跑起来用 `ollama ps` 看实际占用，别靠经验数字猜。

2. **量化档位是质量 vs 体积的取舍**：同一模型有 Q2/Q4/Q5/Q8 等量化版本，位宽越低体积越小、质量损失越大。具体损失多少因模型与任务而异——本轮未做量化质量测量，选档位要自己对任务试。

3. **并发默认是 1，不是“开箱高并发”**：固定 v0.33.1 的 `OLLAMA_NUM_PARALLEL` 默认值是 `1`，同一模型同时只处理一个请求，其余排队。小团队共用要显式调大，生产高并发场景该看 [[vllm]] 这类专职 serving 引擎。

4. **keep-alive 让“第二次请求变快”也让“闲置后变慢”**：模型空闲 5 分钟（默认）后卸载，下次请求重新加载。演示前先热身一次，或调 `OLLAMA_KEEP_ALIVE`。

5. **模型必须是 GGUF（走 llama-server 路径）**：HuggingFace 上的 safetensors 权重要先转换成 GGUF 才能导入；Apple 侧另有 MLX 引擎路径。转换工具链在 Ollama 之外，新手容易卡在这一步。

## 适用 vs 不适用场景

**适用**：

- 个人本地试模型、调 prompt——不烧云端 token，数据不出本机
- 小团队内部共享一个推理服务——OpenAI/Anthropic 双兼容层接现有客户端
- LLM 应用开发期的本地 mock 与离线演示
- 用 Modelfile 把“模型 + system prompt + 参数”打包成可版本化、可分享的配置

**不适用**：

- 生产高并发推理——默认单请求并发的调度模型不是为千 QPS 设计的，选 vLLM / 专职 serving
- 需要直接控制推理引擎细节——那不如直接用 [[llama-cpp]] 的 `llama-server`，少一层管理面
- 完全不碰命令行的用户——GUI 优先的桌面工具更合适
- 训练 / fine-tune——Ollama 只做推理与分发，训练在别处完成后转 GGUF 导入

## 固定版本边界

- 本文绑定 `ollama/ollama@13f2fb8c...`，即 release tag `v0.33.1`（lightweight tag，Ollama 不发 npm 包）。
- 推理引擎：GGML/GGUF 模型统一由上游 `llama-server` 子进程服务（`LLAMA_CPP_VERSION` 锁 `b10630`）；MLX 引擎（`MLX_VERSION c793734e...`）经 `--mlx-engine` 独立入口，面向 Apple 平台。
- API 面：原生 `/api/*`（含 experimental `web_search` / `web_fetch` / `model-recommendations`）、OpenAI 兼容 `/v1/*`（含 `/v1/responses`）、Anthropic 兼容 `/v1/messages`；cloud passthrough 可把 cloud 模型转发到 ollama.com。
- 默认值：`OLLAMA_HOST=127.0.0.1:11434`、`OLLAMA_NUM_PARALLEL=1`、`OLLAMA_KEEP_ALIVE=5m`、`OLLAMA_MODELS` 可配置。
- 本文未运行 Ollama 服务、未拉取模型、未做推理速度或量化质量测量；registry 上各模型默认量化档位以其页面为准，本文不绑定。状态保持 `UNVERIFIED`。

## 学到什么

1. **易用性本身是产品力**——把“装环境”变成“拉二进制”，这层分发工程与模型能力无关，却决定了普及速度
2. **兼容层是采纳策略**——同时讲 OpenAI 与 Anthropic 两种 API 方言，存量生态零改动迁移，比“更好的自有 API”更有效
3. **content-addressed storage 是通用套路**——Docker、Git、Nix、Ollama 都是“blob 定址 + 清单引用”，配置变更不复制数据
4. **子进程边界让引擎可替换**——把上游 `llama-server` 当子进程用并锁版本，上游演进与管理面解耦，MLX 这类新引擎也能并排挂

## 应用型自测

1. 固定 v0.33.1 里，同一个模型默认能同时处理几个请求？
2. `ollama create sage -f Modelfile`（FROM llama3.1）会把 llama3.1 的权重复制一份吗？
3. 一个 GGUF 模型的推理发生在 Ollama 主进程里吗？

检查点：

1. 1 个（`OLLAMA_NUM_PARALLEL` 默认 1），其余排队；要并发得显式调大。
2. 不会。只新建 manifest 指向既有 `blobs/sha256-*`，权重 blob 被复用。
3. 不在。由上游 `llama-server` 子进程服务（llama.cpp 锁 b10630），主进程负责 HTTP、调度与存储。

## 延伸阅读

- 官方安装与 Quick Start：[ollama.com](https://ollama.com)
- 固定源码：[ollama/ollama](https://github.com/ollama/ollama) —— 本文绑定提交 `13f2fb8c99278469b954429d5541019f4d83a4d0`
- Modelfile 参考：仓库内 `docs/` 目录
- [[llama-cpp]] —— 上游推理引擎，Ollama 把它的 `llama-server` 当子进程用
- [[mcp-ts-sdk]] —— agent 栈的协议层；Ollama 是其下的本地推理层

## 关联

- [[llama-cpp]] —— GGUF 模型的实际推理引擎（`llama-server` 子进程，版本被锁定）
- [[langchain]] —— 上层应用框架，经 OpenAI 兼容层对接 Ollama
- [[vllm]] —— 生产 serving 引擎，与 Ollama 形成“个人/小团队 vs 生产”分工
- [[transformers]] —— HuggingFace 训练与推理库，权重多经 GGUF 转换后进 Ollama
- [[mcp-ts-sdk]] —— 协议层与推理层：agent 栈两块互补地基
