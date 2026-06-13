---
title: Langfuse 零基础学习笔记
来源: https://github.com/langfuse/langfuse
日期: 2026-06-13
分类: Agent
子分类: 智能体与 LLM
provenance: pipeline-v3
---

# Langfuse 零基础学习笔记

## 一、什么是 Langfuse？

Langfuse 是一个**开源的 LLM 工程平台**。

用一句话概括：它帮团队**记录、监控、评估和调试**基于大模型（比如 GPT-4）的应用。

## 二、日常类比

想象你在开一家餐厅，厨师（大模型）负责做菜（生成回答）。

过去的问题：你只知道顾客点了一道菜、最后端了什么，但**不知道厨房里发生了什么**——用了什么食材、炒了多久、哪一步出了问题。

Langfuse 就是在厨房里安装了一整套**监控系统**：

- 每一步操作都有记录（输入、输出、耗时、成本）
- 出问题时可以回溯到具体哪一步出错
- 可以对比不同"菜谱"（prompt）的效果
- 可以给每道菜打分评价

这个平台由 Y Combinator 支持，使用 ClickHouse 数据库，可以免费在云端使用，也可以自己部署。

## 三、核心概念

Langfuse 围绕以下概念工作：

| 概念 | 说明 | 类比 |
|------|------|------|
| **Trace（追踪）** | 一次完整的请求从开始到结束的完整记录 | 一桌客人点的一整餐 |
| **Observation（观察）** | 追踪中的具体步骤，包括三种类型 | 每道菜的烹饪过程 |
| **Span（跨度）** | 非 LLM 的一般操作（如数据处理） | 洗菜、切菜 |
| **Generation（生成）** | 具体的 LLM 调用（如发送 GPT-4 请求） | 炒菜这个核心步骤 |
| **Session（会话）** | 同一用户的多次对话/请求关联在一起 | 同一位客人的完整用餐 |
| **Evaluation（评估）** | 对生成的结果打分或评价 | 给菜品打分 |

## 四、快速上手示例

### 示例 1：用 Python 装饰器记录 LLM 调用

这是最简单的接入方式——加一个 `@observe()` 装饰器，Langfuse 就自动追踪了。

```python
from langfuse import observe
from langfuse.openai import openai
import os

# 设置密钥（从环境变量读取）
os.environ["LANGFUSE_PUBLIC_KEY"] = "pk-lf-你的公钥"
os.environ["LANGFUSE_SECRET_KEY"] = "sk-lf-你的密钥"

@observe()
def ask_question(question: str) -> str:
    """用 GPT-4 回答问题的函数"""
    response = openai.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "user", "content": question}],
    )
    return response.choices[0].message.content

@observe()
def main():
    result = ask_question("请解释什么是 Langfuse？")
    print(result)

main()
```

要点：

- `@observe()` 装饰器会自动捕获函数输入、输出、耗时、token 用量
- `from langfuse.openai import openai` 是 Langfuse 的 OpenAI 包装器，比直接 `import openai` 多了自动追踪
- 不需要手动记录任何东西

### 示例 2：手动创建嵌套追踪

如果需要更精细的控制（比如记录多个步骤），可以使用上下文管理器：

```python
from langfuse import get_client

langfuse = get_client()

# 创建一个顶层追踪
trace = langfuse.trace(name="文档问答流程")

# 第一步：搜索相关文档（Span - 非 LLM 操作）
with trace.span(name="搜索文档") as span_search:
    # 模拟搜索逻辑
    documents = ["Langfuse 是开源的 LLM 平台", "它用于追踪和评估 AI 应用"]
    span_search.update(output=f"找到 {len(documents)} 篇文档")

# 第二步：调用大模型生成回答（Generation - LLM 操作）
with trace.generation(
    name="生成回答",
    model="gpt-4o",
    input=f"基于文档回答：{documents}"
) as generation:
    # 这里调用 LLM
    answer = "Langfuse 是一个开源的 LLM 工程平台，用于追踪和评估 AI 应用..."
    generation.update(
        output=answer,
        metadata={"token_count": len(answer.split())}
    )

# 记录用户反馈评分
trace.score(
    name="回答质量",
    value=4.5,
    comment="答案准确但略显简略"
)

# 刷新缓冲区（短生命周期应用必须调用）
langfuse.flush()
```

要点：

- `trace` 是顶层容器，包含所有观察
- `span` 用于一般操作（搜索、数据处理等）
- `generation` 专门用于 LLM 调用，自动记录模型名、token 数、费用
- `score` 给追踪结果打分，用于后续分析和评估
- 调用 `flush()` 确保所有数据发送出去

### 示例 3：JS/TypeScript 版本

```typescript
import { startActiveObservation } from "@langfuse/tracing";

async function main() {
  // 创建追踪
  await startActiveObservation("用户提问流程", async (span) => {
    span.update({
      input: "什么是 Langfuse?",
    });

    // 嵌套的搜索步骤
    await startActiveObservation("搜索相关文档", { type: "span" }, async (searchSpan) => {
      const docs = ["Langfuse 是开源的 LLM 平台"];
      searchSpan.update({ output: `找到 ${docs.length} 篇文档` });
    });

    // LLM 生成步骤
    await startActiveObservation("生成回答", {
      type: "generation",
      model: "gpt-4o",
      input: "基于文档回答问题",
    }, async (genSpan) => {
      const answer = "Langfuse 是一个开源的 LLM 工程平台...";
      genSpan.update({ output: answer });
    });
  });
}

main();
```

## 五、为什么需要 Langfuse？

1. **LLM 输出不可预测**——同一输入可能每次得到不同结果，需要可追溯
2. **调试困难**——问题出在 prompt？模型？还是数据处理？Langfuse 帮你定位
3. **成本透明**——每个请求花费多少 token、多少钱，一目了然
4. **持续改进**——通过评分和评估，找到哪些 prompt 效果更好

## 六、其他关键功能

- **Prompt 管理**：集中管理、版本控制 prompt，无需改代码就能切换不同版本的 prompt
- **数据集与实验**：创建测试数据集，批量评估不同 prompt/模型的效果
- **Playground**：在界面上直接测试 prompt 和模型配置，快速迭代
- **评估方式**：支持 LLM 自动打分、人工标注、用户反馈等多种评估手段

## 七、快速部署

最简单的部署方式：

```bash
git clone --depth=1 https://github.com/langfuse/langfuse.git
cd langfuse
docker compose up
```

大约 5 分钟就能在自己的机器上跑起来。也可以直接注册 Langfuse Cloud（免费套餐）。

## 八、小结

| 你问 | Langfuse 做 |
|------|-------------|
| "我的 AI 应用运行得怎么样？" | 提供 Trace 追踪每一步 |
| "哪里出错了？" | 逐步骤回溯，定位问题 |
| "哪个 prompt 效果更好？" | 评估和实验功能对比 |
| "花了多少钱？" | 自动统计 token 和费用 |

一句话：Langfuse 就是 AI 应用的**黑匣子 + 仪表盘**。
