---
title: LiteLLM — 统一 AI 网关，一个接口调用 100+ LLM
来源: https://github.com/BerriAI/litellm
日期: 2026-06-13
分类: 机器学习
子分类: 数据科学与 AI
provenance: pipeline-v3
---

# LiteLLM — 统一 AI 网关，一个接口调用 100+ LLM

## 日常类比

想象你要去很多地方办事：银行、邮局、医院、学校……每个地方都有自己的窗口、排队方式和表格格式。

LiteLLM 就像一个「一站式政务服务中心」——你把申请表放在同一个统一的柜台上，它就帮你搞定所有地方的不同要求。你不用每个地方都跑一遍，只要在一个窗口提交一次就够了。

在编程世界里，「不同的政务窗口」就是 OpenAI、Anthropic、Google Gemini、AWS Bedrock 等等。它们的 API 各不相同，每个都要学一遍。LiteLLM 让你只用一种「通用语言」（OpenAI 格式）跟所有 LLM 打交道。

## 核心概念

### 1. 统一 API（Unified API）

所有 LLM 提供商的 API 调用方式都不一样。LiteLLM 把它们全部标准化，对外只提供 OpenAI 的格式。这意味着你写一次代码，可以调用任何支持的 LLM。

支持的模型超过 100 种，包括：

- OpenAI（GPT-4o 等）
- Anthropic（Claude 系列）
- Google（Gemini、Vertex AI）
- AWS（Bedrock、SageMaker）
- Azure
- Mistral、Cohere、Groq 等

### 2. 两种使用模式

**模式一：Python SDK** — 直接在代码里引入 LiteLLM 库，像普通 Python 包一样用。适合个人项目或小团队。

**模式二：AI Gateway / Proxy Server** — 部署一个中心化服务，团队里所有人都通过它访问 LLM。带虚拟 API Key、费用追踪、负载均衡、仪表盘等生产级功能。适合中大型组织。

### 3. Router（路由）

自动在多个模型部署间分配流量。某个模型超预算或出错了，自动切换到备用模型。

### 4. 成本追踪

每个请求都记录花了多少钱，按项目或用户统计总支出。

## 代码示例

### 示例一：Python SDK 直接调用多个 LLM

这是最基础的用法。关键点是 `model` 参数的写法：`提供商/模型名`。

```python
from litellm import completion
import os

# 设置各提供商的 API Key
os.environ["OPENAI_API_KEY"] = "sk-your-openai-key"
os.environ["ANTHROPIC_API_KEY"] = "sk-ant-your-anthropic-key"
os.environ["GEMINI_API_KEY"] = "your-gemini-key"

messages = [{"role": "user", "content": "用一句话解释什么是人工智能"}]

# 调用 OpenAI
response = completion(model="openai/gpt-4o", messages=messages)
print("GPT-4o 回答:", response.choices[0].message.content)

# 调用 Anthropic（只需改 model 参数，其余完全不变）
response = completion(model="anthropic/claude-sonnet-4-20250514", messages=messages)
print("Claude 回答:", response.choices[0].message.content)

# 调用 Google Gemini（同样只需改 model）
response = completion(model="gemini/gemini-2.0-flash", messages=messages)
print("Gemini 回答:", response.choices[0].message.content)
```

关键点：三个调用除了 `model` 字符串不同，其他代码完全一样。这就是「统一 API」的威力。

### 示例二：启动 Proxy Server 作为中心化网关

先启动服务：

```bash
pip install litellm
export OPENAI_API_KEY=sk-your-key
litellm --model gpt-4o --port 4000
```

然后任何支持 OpenAI 格式的客户端都能通过网关访问：

```python
import openai

# 用原生 OpenAI 客户端，但指向 LiteLLM 网关
client = openai.OpenAI(
    api_key="any-key-here",
    base_url="http://localhost:4000"
)

response = client.chat.completions.create(
    model="gpt-4o",
    messages=[{"role": "user", "content": "今天天气怎么样？"}]
)

print(response.choices[0].message.content)
```

这里 `api_key` 填什么都行，因为真正验证的是网关自己管理的虚拟 Key。

## 关键总结

| 概念 | 一句话 |
|------|--------|
| 统一 API | 一个接口调用 100+ 模型，只用 OpenAI 格式 |
| Python SDK | 直接 `from litellm import completion` 使用 |
| Proxy Server | 部署中心网关，团队共用，带费用追踪和仪表盘 |
| Router | 自动在多个模型间路由和故障切换 |
| 安装 | `pip install litellm` 或 `uv add litellm` |

## 延伸阅读

- 官方文档：[docs.litellm.ai](https://docs.litellm.ai/docs/simple_proxy)
- 支持的完整模型列表：[models.litellm.ai](https://models.litellm.ai/)
- 支持的提供商文档：[docs.litellm.ai/docs/providers](https://docs.litellm.ai/docs/providers)
