---
title: ai-dynamo / Dynamo — 数据中心级分布式 LLM 推理编排
来源: https://github.com/ai-dynamo/dynamo
日期:2026-06-13
子分类: 模型与训练
分类: 机器学习
provenance:pipeline-v3
---

## 是什么

**NVIDIA Dynamo**（PyPI 包名 `ai-dynamo`，仓库 [ai-dynamo/dynamo](https://github.com/ai-dynamo/dynamo)）是一个面向**多 GPU / 多节点**的生成式 AI 推理编排框架。它**不替代** vLLM、SGLang 或 TensorRT-LLM，而是站在这些推理引擎之上，把一堆 GPU 协调成一套可扩展的推理系统。

日常类比：

- **vLLM / SGLang**：像一家餐厅里**单条流水线厨房**——一个厨师（一块 GPU）把点菜、备料、炒菜、装盘全包了，单店效率很高。
- **Dynamo**：像**连锁餐饮集团的调度中心**——前台接单后，把「大量备料」（prefill）派给备菜间，把「逐盘小炒」（decode）派给炒锅间；还知道哪个分店已经备过同样的料（KV cache 命中），新单直接路由过去，避免重复切菜。

如果你只在**单卡单模型**上跑推理，直接用 vLLM 往往就够。当你要跨机架、按 SLA 自动扩缩、或把 prefill 与 decode 拆开扩时，才需要 Dynamo 这一层。

> **易混淆名字**：本文的 Dynamo ≠ Amazon DynamoDB 数据库 ≠ SOSP 2007 的 Amazon Dynamo KV 存储 ≠ PLDI 2000 的 HP Dynamo 动态优化系统。它们只是同名不同物。

## 为什么重要

不理解 Dynamo，下面这些事很难讲清楚：

- **多节点推理怎么编排**：单机引擎优化的是「一块 GPU 怎么快」；Dynamo 优化的是「几十上百块 GPU 怎么一起干活、谁接哪类请求」
- **Prefill/Decode 分离（Disaggregated Serving）**：长 prompt 的 prefill 是计算密集型，逐 token 的 decode 是内存带宽密集型；绑在同一池 GPU 上经常互相拖累
- **KV-aware 路由**：两个用户带着相同系统提示来聊天时，若路由到已缓存前缀的 worker，可跳过重复 prefill——官方与 Baseten 等案例报告 TTFT 可接近 **2×** 提升
- **与 Triton 的关系**：Dynamo 被 NVIDIA 定位为面向 GenAI 的分布式推理栈，承接并扩展了 Triton Inference Server 在模型服务化上的积累（见 [NVIDIA Developer — Dynamo](https://developer.nvidia.com/dynamo)）

## 核心概念

Dynamo 把「调度、路由、内存、传输、扩缩、容错」拆成可独立安装的模块（Rust crate + Python wheel），常见组件如下。

### 1. 推理引擎后端（Backend）

Dynamo **引擎无关**，当前主要支持：

| 后端 | 典型场景 |
|------|----------|
| **vLLM** | 开源生态最广，PagedAttention |
| **SGLang** | RadixAttention、结构化生成 |
| **TensorRT-LLM** | NVIDIA 栈内极致单请求延迟 |

你选 backend，Dynamo 负责在上层做集群级决策。

### 2. Disaggregated Prefill / Decode（P/D 分离）

一次 chat 分两段：

1. **Prefill**：读入整段 prompt，并行算 attention，生成 KV cache——像「把剧本通读一遍」
2. **Decode**：每次只生成 1 个 token，反复读 KV cache——像「照着笔记逐句接龙」

Dynamo 可把 prefill worker 池与 decode worker 池**独立扩缩**，让两类硬件特性不同的负载各就其位。

### 3. KV-Aware Router（KV 感知路由）

Router 不只看「哪台机器 CPU 空闲」，还看**请求前缀与哪台 worker 已有 KV 重叠**。命中则避免重复 prefill，降低 **TTFT（Time To First Token）**。

### 4. KV Block Manager（KVBM）

KV cache 不必全钉在 GPU 显存。KVBM 可在多级存储间搬运块：

```
G1 GPU 显存 → G2 CPU 内存 → G3 本地 SSD → G4 远程（S3 / Azure Blob 等，经 NIXL）
```

效果：在显存预算内支撑更长上下文或更高并发，代价是 offload 时的带宽与延迟权衡。

### 5. NIXL（数据传输）

**NIXL** 是 Dynamo 生态里的低延迟点对点传输库，负责 GPU 之间、以及 GPU 与各级存储之间的 KV / 权重块搬运，是 P/D 分离与 KV offload 的「数据平面高速公路」。

### 6. Planner（SLA 驱动扩缩）

Planner 根据 **TTFT**、**ITL/TPOT（每 token 间隔）** 等 SLA 目标，结合负载画像，自动调整 prefill / decode 池规模，在延迟与 TCO 之间找平衡点。

### 7. Grove（Kubernetes 拓扑调度）

[Grove](https://github.com/ai-dynamo/grove) 是 K8s operator，做**拓扑感知**的 gang scheduling——例如 NVL72 机架内，把需要 NVLink 紧耦合的 worker 放到正确的 rack / NUMA 域。

### 8. 部署模式：Standalone vs Gateway (GAIE)

| 模式 | 请求路径 | 适用 |
|------|----------|------|
| **Standalone** | `client → Frontend → Router → workers` | 本地开发、单集群、Dynamo 端到端托管入口 |
| **Gateway (GAIE)** | `client → K8s Inference Gateway → EPP → Frontend sidecar → workers` | 已有 Gateway API、需要网关级鉴权/限流/可观测 |

两种模式对外都暴露 **OpenAI 兼容 HTTP API**。

### 9. 服务发现（本地 vs K8s）

- **本地开发**：`--discovery-backend file`，通常**不需要** etcd / NATS
- **Kubernetes**：用 CRD + EndpointSlice 做原生发现，同样可不依赖外部消息中间件

## 架构一图流

```text
                    ┌─────────────────┐
                    │  OpenAI API     │
                    │  /v1/chat/...   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Frontend     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
     ┌────────▼────────┐ ┌───▼───┐ ┌────────▼────────┐
     │  KV-Aware       │ │Planner│ │  KVBM + NIXL    │
     │  Router         │ │       │ │  (多级 KV)      │
     └────────┬────────┘ └───────┘ └────────┬────────┘
              │                                │
     ┌────────┴────────┐              ┌───────┴───────┐
     │ Prefill Workers │              │ Decode Workers │
     │ (vLLM/SGLang/   │              │ (同左后端)     │
     │  TRT-LLM)       │              │                │
     └─────────────────┘              └────────────────┘
```

## 实践案例

### 案例 1：容器内最快体验（SGLang 后端）

官方 Quick Start 的典型流程：拉预构建镜像，起 Frontend + Worker，用 curl 打 OpenAI 兼容接口。

```bash
# 拉取 SGLang 运行时镜像（版本以 NGC 当前 tag 为准）
docker run --gpus all --network host --rm -it \
  nvcr.io/nvidia/ai-dynamo/sglang-runtime:1.2.0

# 容器内：后台起 Frontend
python3 -m dynamo.frontend --http-port 8000 --discovery-backend file \
  > /dev/null 2>&1 &

# 起 SGLang worker（小模型便于本地试）
python3 -m dynamo.sglang \
  --model-path Qwen/Qwen3-0.6B \
  --discovery-backend file &

# 发请求
curl -s localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen/Qwen3-0.6B",
    "messages": [{"role": "user", "content": "用三句话解释 KV cache"}],
    "max_tokens": 128
  }' | jq
```

要点：`--discovery-backend file` 让本地单机无需 etcd；Frontend 与 worker 通过 Dynamo 的发现机制互相注册。

### 案例 2：PyPI 安装 + vLLM 后端

```bash
# 推荐用 uv 管理环境
curl -LsSf https://astral.sh/uv/install.sh | sh

uv venv .venv && source .venv/bin/activate
uv pip install --prerelease=allow "ai-dynamo[vllm]"

# 起 Frontend
python3 -m dynamo.frontend --http-port 8000 --discovery-backend file &

# vLLM worker 示例（模型与并行度按你的 GPU 调整）
python3 -m dynamo.vllm \
  --model-path meta-llama/Llama-3.1-8B-Instruct \
  --discovery-backend file \
  --kv-events-config '{"enable_kv_cache_events": false}' &
```

vLLM 后端本地试跑时，官方建议关闭或简化 KV events，避免为路由状态引入额外基础设施；上 K8s 生产再按需打开 KV 事件与 KV-aware 路由的完整链路。

### 案例 3：Kubernetes 零配置部署（DGDR，beta）

生产向路径：声明模型、后端与 SLA，由 **AIConfigurator** 画像、**Planner** 定拓扑、**Grove** 等组件落地。

```yaml
apiVersion: nvidia.com/v1beta1
kind: DynamoGraphDeploymentRequest
metadata:
  name: qwen3-0.6b-serving
spec:
  model: Qwen/Qwen3-0.6B
  backend: vllm
  sla:
    ttft: 200.0   # 首 token 延迟目标（毫秒）
    itl: 20.0     # 逐 token 间隔目标（毫秒）
  autoApply: true
```

仓库 `recipes/` 目录提供 Llama-3-70B、DeepSeek-R1、Qwen3-32B-FP8 等现成配方，可直接对照改模型名与 disaggregated / aggregated 模式。

### 案例 4：用 Python OpenAI SDK 调用（与 vLLM 单机用法相同）

Dynamo Frontend 兼容 OpenAI API，业务代码通常**不用改**：

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="not-needed",  # 本地部署常可占位
)

stream = client.chat.completions.create(
    model="Qwen/Qwen3-0.6B",
    messages=[
        {"role": "system", "content": "你是推理系统助教。"},
        {"role": "user", "content": "Dynamo 和 vLLM 的分工是什么？"},
    ],
    max_tokens=256,
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

Dynamo 的价值体现在**集群侧**（路由、P/D 池、KV 多级缓存），客户端仍按标准 OpenAI 协议说话。

## 与 vLLM 的分工（一张表记住）

| 维度 | vLLM（单机引擎） | Dynamo（编排层） |
|------|------------------|------------------|
| 优化目标 | 单 GPU / 单节点吞吐与显存利用率 | 多节点 SLA、池化扩缩、全局 KV 复用 |
| 是否跑模型 | 是，直接执行 forward | 否，调度后端 worker |
| P/D 分离 | 需自行拼基础设施 | 一等公民 |
| KV 跨节点 | 非核心能力 | Router + KVBM + NIXL |
| 典型入口 | `python -m vllm.entrypoints...` | `python -m dynamo.frontend` + backend worker |

二者关系是**叠加**而非替代：生产里常见组合是 **Dynamo + vLLM backend**。

## 踩过的坑

- **名字撞车**：搜 "Dynamo" 会冒出 Amazon、PyTorch `torch.compile`/dynamo、数据库等结果；LLM 推理请认准 `ai-dynamo` 与 `docs.nvidia.com/dynamo`
- **单卡没必要上全套**：单 GPU 本地试模型，直接 vLLM 更简单；Dynamo 的组件（Router、Planner、Grove）在集群才有收益
- **本地发现后端**：忘记 `--discovery-backend file` 时，可能去连并不存在的 etcd/NATS
- **vLLM KV events**：本地开发按 README 关闭 `enable_kv_cache_events`，否则路由状态与事件总线配置会对不上
- **TensorRT-LLM 安装**：需额外 `--extra-index-url https://pypi.nvidia.com`，与纯 PyPI 的 vLLM/SGLang 路径不同
- **特性矩阵因后端而异**：例如 KVBM 在部分后端仍标为 🚧，部署前查 [Feature Matrix](https://docs.nvidia.com/dynamo/resources/feature-matrix)

## 适用 vs 不适用

**适用**：

- 多 GPU / 多节点 LLM 服务，需要统一 OpenAI API 入口
- 长上下文、高并发，需要 KV offload 与跨 worker 复用
- 明确 TTFT / TPOT SLA，需要 Planner 自动调池
- 已在 Kubernetes 上跑 AI 负载，希望用 Grove / DGDR 声明式部署
- 多模态、Agent、视频生成等扩展负载（1.0+ 持续加特性）

**不适用**：

- 笔记本单卡跑个小模型玩玩 → [[ollama]] 或裸 vLLM
- 只做模型训练 / 微调 → Dynamo 是**推理 serving** 栈
- 不想碰 K8s 且只有一台机器 → 编排层收益有限
- 闭源 API（GPT-4 等）→ 直接调云厂商接口

## 性能数字怎么读

官方 README 与 NVIDIA 博客常引用的量级（具体模型与硬件见原文）：

| 指标 | 量级 | 语境 |
|------|------|------|
| 吞吐 | 最高约 **7×** / **750×**（不同基准） | 相对未编排基线，GB200/GB300 等大集群 |
| 冷启动 | 约 **7×** 更快 | ModelExpress 经 NIXL 流式传权重 |
| TTFT | 约 **2×** | KV-aware routing |
| SLA 违约 | 约 **80%** 减少 | Planner 扩缩（某云厂商案例） |

读 benchmark 时务必核对：**模型、卡型、是否 disaggregated、是否 KV 路由、流量模式**——AIPerf 是仓库推荐的对比工具（见 `docs/benchmarks/benchmarking.md`）。

## 学到什么

- **推理优化分两层**：引擎层（怎么算得快）与编排层（算力放哪、缓存放哪、请求给谁）
- **Prefill 与 Decode 是两种负载**：拆开池化是数据中心 LLM serving 的主流方向之一
- **KV cache 是跨请求的资产**：路由算法和存储层级与 attention 算法本身同样重要
- **模块化开源**：`ai-dynamo`、`kvbm`、`nixl` 可拆开装，便于渐进式采用
- **OpenAI API 再次成为集成标准**：上层业务无感，底层可从单机 vLLM 迁到 Dynamo 集群

## 延伸阅读

- 官方文档：[docs.nvidia.com/dynamo](https://docs.nvidia.com/dynamo/)
- 架构总览：[Overall Architecture](https://docs.nvidia.com/dynamo/design-docs/overall-architecture)
- 仓库：[github.com/ai-dynamo/dynamo](https://github.com/ai-dynamo/dynamo)
- 博客：[Introducing NVIDIA Dynamo (2026-03)](https://developer.nvidia.com/blog/introducing-nvidia-dynamo-a-low-latency-distributed-inference-framework-for-scaling-reasoning-ai-models/)
- [[vllm]] —— 常用 backend，单机推理引擎
- [[kubernetes]] —— 生产部署载体；Grove / DGDR 依赖 K8s
- [[sglang]] —— 另一主流 backend（RadixAttention）
- 论文向：[[paged-attention-vllm]]、[[sglang-radixattention]]、[[nexus-prefill-decode-intra-gpu]]（理解 P/D 与 KV 路由背景）

## 关联

- 上游生态：NVIDIA GPU、TensorRT-LLM、Triton 传统模型服务经验
- 横向对比：llm-d、AIBrix 等 K8s 原生 LLM 编排方案（仓库 benchmark 文档有对比场景）
- 下游用户：云推理平台、企业私有化大模型网关、Agent 平台（LangChain / NeMo Agent Toolkit 集成）
