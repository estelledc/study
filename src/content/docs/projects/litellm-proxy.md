---
title: LiteLLM Proxy — 自托管的 LLM 统一网关
来源: BerriAI/litellm 官方文档 https://docs.litellm.ai/docs/simple_proxy
日期: 2026-05-31
分类: ai-eng
难度: 中级
---

## 是什么

LiteLLM Proxy 是一个**装在你自己机器上的"LLM 总机小姐"**。你的程序只对它说一种话（OpenAI 协议），它替你转身去找 OpenAI、Anthropic、Bedrock、Azure、本地 Ollama 等 100+ 个真实模型，再把答案搬回来。

日常类比：办公室的总机分机表。员工只记一个总机号，总机后台维护着"市场部转 8001、财务部转 8002"。员工换工作不用重学新分机；公司换电信运营商也不用通知所有员工。

它本质有两层：

- **SDK**：一行 `litellm.completion(model="anthropic/claude-3-haiku", ...)` 就在 Python 里抹平厂商差异
- **Proxy**：把 SDK 包成一个 FastAPI 服务，监听 OpenAI 兼容端口，所有客户端（包括 Cursor、Continue、curl、OpenAI SDK 本身）都能直连

本笔记重点讲 Proxy，因为它才是被当成"网关基建"用的那一层。

## 为什么重要

不理解 LiteLLM Proxy，下面这些事不好解释：

- 为什么很多 AI 团队工程化第一步是『搭一个 LLM 网关』而不是直接调 OpenAI
- 为什么有人把 LiteLLM 配在 vLLM 前面——明明 vLLM 自己就是 OpenAI 兼容
- 为什么"我们的 prompt 不能让 OpenAI 看到"和"我们就想用 GPT-4"可以同时成立
- 为什么 OpenAI 单点限流不会让整个产品崩——背后大概率有一层 fallback 路由

它在『AI 工程基础设施』这一格子里的位置：客户端 ↔ **网关（LiteLLM Proxy）** ↔ 多厂商。这个位置过去由公司自己写的 FastAPI 占着，LiteLLM 把它做成了配置驱动的开源标准件。

## 核心要点

Proxy 的全部能力可以拆成 **五块原语**：

1. **model_list（别名表）**：给一个 `model_name` 绑一个或多个真实部署。调用方永远只看到别名 `gpt-4o`，背后可能是 `azure/my-deployment-east` + `azure/my-deployment-west` + `openai/gpt-4o` 三副本。

2. **router（路由器）**：决定一次调用打到哪个副本。策略可选 simple-shuffle / least-busy / latency-based / usage-based。配 `fallbacks: [{"gpt-4o": ["claude-3-opus"]}]` 表示『gpt-4o 失败转 claude』。

3. **virtual key（虚拟密钥）**：管理员发短期 `sk-xxx` 给团队，每把 key 可设 budget（USD 上限）、rpm/tpm（限速）、可用 model 白名单。真正的厂商 key 永远只在 proxy 里，不外发。

4. **callbacks（钩子）**：请求前后挂 hook，把 prompt/response/cost/latency 推到 Langfuse、Helicone、Datadog、Prometheus、自建 webhook。

5. **caching（缓存）**：按 prompt 哈希命中 Redis/S3/内存，重复 prompt 直接返回，省真金白银。

五块原语 + 一份 `config.yaml` = 一个生产级 LLM 网关。

## 实践案例

### 案例 1：最小可跑配置

```yaml
# config.yaml
model_list:
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY
  - model_name: claude
    litellm_params:
      model: anthropic/claude-3-haiku-20240307
      api_key: os.environ/ANTHROPIC_API_KEY
```

```bash
litellm --config config.yaml --port 4000
```

客户端**完全不用改**——把 OpenAI SDK 的 `base_url` 指到 `http://localhost:4000`，就能用 `model="claude"` 调 Claude。

### 案例 2：多副本 + fallback 容灾

```yaml
model_list:
  - model_name: gpt-4o
    litellm_params: {model: azure/east, api_base: ...}
  - model_name: gpt-4o
    litellm_params: {model: azure/west, api_base: ...}
  - model_name: gpt-4o
    litellm_params: {model: openai/gpt-4o}

router_settings:
  routing_strategy: latency-based-routing
  fallbacks: [{gpt-4o: [claude-3-opus]}]
```

逻辑：先在三个『gpt-4o』副本里挑最快的；三个全挂才换 claude-3-opus。**应用层一行代码不用改**。

### 案例 3：发 virtual key 给同事

```bash
curl -X POST http://localhost:4000/key/generate \
  -H "Authorization: Bearer $MASTER_KEY" \
  -d '{"models": ["gpt-4o"], "max_budget": 10, "duration": "30d"}'
# → {"key": "sk-litellm-xxx", "expires": "..."}
```

同事拿到 `sk-litellm-xxx`，就能像调 OpenAI 一样调，但**只能用 gpt-4o、最多花 10 USD、30 天后失效**。预算耗尽时 proxy 直接拒绝请求。

## 踩过的坑

1. **别名和真实模型名混淆**：`model_name: gpt-4o` 在 config 里可以指向 `azure/my-deployment`，日志里看到的可能是别名也可能是真实名，跨团队对账时容易吵。约定：**别名永远以业务用途命名**（如 `chat-fast`、`extract-cheap`），不要复用厂商名。

2. **fallback 顺序基于声明顺序，不是显式优先级**：同一个 `model_name` 出现 3 次，路由策略决定挑哪个；想精准控制必须写 `fallbacks` 字段，否则下一次重试可能还是同一个挂掉的副本。

3. **成本统计依赖内置价格表**：`litellm.model_cost` 是写死的 JSON。OpenAI 凌晨改价、新模型上线、自建 vLLM 算不出钱——这三种情况会让账面失真。修法：在 `general_settings` 配 `custom_pricing` 覆盖。

4. **stream=True 时 callback 在流结束才触发**：中途客户端断开，cost log 可能漏记。如果用 Langfuse 做计费源头，要确认它的 partial-stream 处理。

5. **默认 timeout 600s**：长上下文 + 慢模型（Opus/Sonnet 长 prompt）容易超时。在 `router_settings.timeout` 调到 1200 以上，并把客户端超时也调长，否则 proxy 还在等、客户端先放弃。

## 适用 vs 不适用场景

**适用**：

- 团队多人共用 LLM，需要集中发 key、集中算账、集中审计
- 同时用 3+ 家厂商，希望应用代码不耦合具体厂商
- 想做 A/B 评测、灰度切流，把流量按比例分到不同模型
- dev/prod 隔离：dev 走 ollama 不烧钱，prod 走 OpenAI，靠 config 切换

**不适用**：

- 只用一家厂商、单人项目——直接 SDK 即可，proxy 反而多一跳延迟
- 极致低延迟场景（< 50ms 增量）——proxy 一来一回至少加 5-20ms
- 需要厂商独有功能（OpenAI Assistants API 全套、Anthropic 计算机使用工具等深度耦合的能力）——proxy 只覆盖 chat/completions/embeddings 这一层
- 强合规要求"必须走某厂商私有 SDK"——比如某些金融监管，proxy 不一定是认证路径

## 历史小故事（可跳过）

- **2023 年初**：Ishaan Jaffer 与 Krrish Dholakia 在做应用时受困于"每接一家 LLM 重写一遍调用代码"，开源了 LiteLLM SDK。
- **2023 年夏**：社区反复要"一个服务器版本"——团队不想每个客户端都装 SDK。Proxy 诞生。
- **2023 年（YC W23）**：进入 Y Combinator Winter 2023。YC/官网等公开材料里常提到 Adobe、Lemonade、Samsara 等作为采用方。
- **2024-2025**：加入 virtual key、budget、guardrails，从『协议转换器』演进成『AI 网关』。

## 学到什么

1. **协议层抹平 vs 服务层抹平**：SDK 抹平在调用方进程内（每个客户端都得装），Proxy 抹平在网络上（客户端零依赖）。一旦团队 > 1 人，Proxy 几乎一定胜出。

2. **配置驱动 > 代码驱动**：换厂商、加副本、改路由都改 yaml，不发版。这是把『运维问题』和『应用问题』解耦的经典做法。

3. **网关是最佳观测点**：所有 LLM 流量必经此处，cost / latency / error / prompt 都能集中采。比在每个应用里埋点轻得多。

4. **fallback 是 LLM 时代的"重试"**：传统服务重试是同一个后端再试一次，LLM 时代的重试经常是『换一家厂商』，因为故障原因常是限流而不是网络抖动。

## 延伸阅读

- 官方文档：[LiteLLM Proxy Server](https://docs.litellm.ai/docs/simple_proxy)（部署、配置、virtual key 全套）
- GitHub 仓库：[BerriAI/litellm](https://github.com/BerriAI/litellm)（源码、issue、release notes）
- 路由进阶：[Router strategies](https://docs.litellm.ai/docs/proxy/reliability)（latency-based、usage-based 实现细节）
- [[fastapi]] —— LiteLLM Proxy 的底层 web 框架
- [[vllm]] —— 本地推理服务，常被 LiteLLM 当作一个 deployment

## 关联

- [[fastapi]] —— Proxy 用 FastAPI 实现，理解 FastAPI 有助于读 LiteLLM 源码
- [[vllm]] —— 本地推理后端，配在 LiteLLM 后面做"私有 GPT-4o"
- [[ollama]] —— 本地小模型，dev 环境常用 LiteLLM 路由到 Ollama 节省成本
- [[langchain]] —— 上层应用框架，通过 LiteLLM 一次接多家
- [[claude-code]] —— 官方 CLI，可把 base_url 指到 LiteLLM Proxy 反代到任意模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aichat]] —— AIChat — 终端里的多模型 LLM 客户端
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[fastapi]] —— FastAPI — 用 Python 类型注解写 API
- [[lm-evaluation-harness]] —— lm-evaluation-harness — LLM 基准评测底座
- [[vllm]] —— vLLM — 高吞吐 LLM 推理引擎

