---
title: Langfuse — LLM 应用可观测性
来源: https://github.com/langfuse/langfuse
日期: 2026-05-29
分类: AI
难度: 中级
---

## 是什么

**Langfuse** 是德国团队 2023 年开源的「LLM 应用专用监控与追踪平台」——把每次 LLM 调用、token 用量、prompt 版本、用户反馈都记录下来可视化。

日常类比：[[prometheus]] 监控服务器的 CPU 和内存（基础设施层），Langfuse 监控的是 LLM 应用层——prompt 是什么、模型回了什么、花了多少 token、用户给了几分。

举个例子：你在线上跑一个客服机器人，用户问了 100 个问题。Langfuse 让你看到：

- 每个问题走的是哪个 prompt 模板（带版本号）
- 模型回答用了几秒、花了多少美元
- 用户对这个回答打了几分（1-5 星）
- 哪些问题模型答错了

没有 Langfuse 时，这些数据要么在 OpenAI dashboard 看个总数，要么自己写日志逐行 grep。

## 为什么重要

`LLM 可观测性` 这个赛道在 2023-2024 年才出现，Langfuse 是几个标杆之一：

1. **赛道头部**：和 Helicone（代理模式）、LangSmith（LangChain 自家闭源）一起被讨论
2. **集成简单**：与 [[langchain]] / [[llamaindex]] / OpenAI SDK 一行代码集成
3. **一站式**：Prompt 管理 + 数据集 + 自动评测都在同一个平台
4. **双轨开源**：MIT 协议 + 自托管 + 官方 Cloud——企业可选

## 核心要点

Langfuse 的数据模型只有 4 个核心概念，看懂这 4 个就懂了：

1. **Trace（追踪）**：一次完整的 LLM 应用调用。比如「用户问问题 → 检索文档 → 调用 GPT-4 → 返回答案」整条链就是一个 Trace。
2. **Generation（生成）**：Trace 里某一次具体的 LLM API 调用，记录 prompt + 输出 + token 用量 + 模型名 + 耗时 + 成本。
3. **Score（评分）**：人工或自动给某个 Trace 或 Generation 打的分。比如「这次回答的相关度 0.8」「用户给的星数 4」。
4. **Prompt（带版本的 prompt 仓库）**：把 prompt 文本本身当作可版本化的资产管理——v1 / v2 / v3 都留着，可以回滚。

类比：Trace 像一次手术的整体记录，Generation 是手术里某个具体步骤，Score 是术后评估表，Prompt 是医生用的 SOP 模板（有版本）。

## 实践案例

### 案例 1：Python 一行集成 OpenAI

最常见的用法——把 `openai` 的 import 换成 `langfuse.openai`，业务调用几乎不动：

```python
# pip install langfuse openai
# export LANGFUSE_PUBLIC_KEY=pk-lf-...
# export LANGFUSE_SECRET_KEY=sk-lf-...
# export LANGFUSE_HOST=https://cloud.langfuse.com  # 自托管改成你的地址

from langfuse.openai import openai  # 原来是: import openai

completion = openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "用一句话解释 Trace"}],
)
print(completion.choices[0].message.content)
```

之后所有 OpenAI 调用都被自动记成 Generation，UI 里能看到 prompt、输出、token、成本。**零业务逻辑改动**。

### 案例 2：自托管一键起

```bash
git clone https://github.com/langfuse/langfuse
cd langfuse
docker compose up -d   # 起 web + worker + Postgres + ClickHouse + Redis
open http://localhost:3000
```

约一分钟起一套生产形态的 Langfuse。Postgres 装元数据（用户、项目、prompt 版本），ClickHouse 装 trace 时序数据（高写入 + 聚合查询），Redis 做异步队列。

### 案例 3：用 LLM 给 LLM 打分（LLM-as-judge）

跑完一批 trace 后，让 GPT-4 当裁判给每条打「相关度」分：

```
你是一个评分助手。下面是用户问题和 AI 回答。
请给相关度打 0-1 分，只输出数字。
问题：{trace.input}
回答：{trace.output}
```

Langfuse 自动跑这套评分，分数回流到 Score 字段——后续可以按分数过滤、按 prompt 版本对比平均分、看某次改动是变好了还是变差了。生产里常见做法是：先人工标 50–100 条当金标准，再让 judge prompt 对齐这批分数。

## 踩过的坑

1. **默认 retention 短，要配长期存储**：Cloud 版的免费档只保留 30 天 trace，超期就被清。生产用要么升级套餐、要么自托管 + 接 S3 长期归档。
2. **大量 trace 写入要调 ClickHouse 批量参数**：默认配置在每秒几百条 trace 时还行，到几千条要把 batch size + async flush interval 调起来——不然会触发 ClickHouse 的「Too many parts」报错。
3. **与 Helicone 的区别**：Langfuse 走 SDK 主动推送（要改一行 import），Helicone 走 HTTP 代理（不改代码但只支持 OpenAI 这种直连场景）。Langfuse 主打 prompt 管理 + 自托管，Helicone 主打零侵入。
4. **自托管的 Cloud 版本对齐时差 1-2 月**：Cloud 跑的是更新版本，自托管 OSS 版有时晚一两个 release。新功能发布时不要立刻假设自托管能用。
5. **成本字段依赖价目表**：模型单价表要自己维护或跟官方同步，否则 Generation 上的「美元成本」会对不齐账单。

## 适用 vs 不适用

**适用**：

- 团队级 LLM 应用，有调试 / 评测 / 成本归因需求
- 要 self-host 不锁定 SaaS 的场景
- 用 [[langchain]] / [[llamaindex]] / OpenAI SDK 直接调用 LLM 的项目

**不适用**：

- 个人小项目（OpenAI dashboard 看 token 数就够）
- 完全没有 LLM 调用的传统 web 应用（用 Datadog / Sentry）
- 必须零代码改动接入的场景（用 Helicone 这种代理模式）

## 历史小故事（可跳过）

- **2023 初**：Langfuse GmbH 在柏林创立；同期进入 Y Combinator Winter 2023（W23），在旧金山把产品从计费工具转向 LLM 可观测性
- **2023-08**：v1 开源（MIT 协议），定位「LLM observability」
- **2024**：v2 加入 Datasets（测试集管理）+ LLM-as-Judge（自动评测）
- **2025**：v3 加入多模态 trace 支持（图像 / 音频 trace）
- **旁注**：同一时期 Helicone / LangSmith 也在抢 LLMOps 心智，Langfuse 靠 MIT + 自托管把开源心智占住

40 年前没人监控 web 应用，20 年前 [[prometheus]] 让监控基础设施变成基本盘——Langfuse 在做的事是把同样的工作搬到 LLM 应用层。

## 学到什么

1. **可观测性赛道总会从基础设施层往应用层延伸**——先有 [[prometheus]] 监控机器，再有 Langfuse 监控 LLM
2. **多存储分层是规模逼出来的**——Langfuse 用 ClickHouse + Postgres + Redis 三件套，不是设计美感，是因为 trace 时序数据和元数据查询模式根本不同
3. **「engineering platform」不等于「monitoring tool」**——前者驱动迭代（prompt 版本、数据集、A/B 对比），后者只看「现在挂没挂」。LLM 应用的可观测性需求天然偏前者

## 延伸阅读

- 官方文档：[langfuse.com/docs](https://langfuse.com/docs) — 集成 / SDK / self-host 详细指南
- GitHub 仓库：[github.com/langfuse/langfuse](https://github.com/langfuse/langfuse) — 源码 + Issues + Roadmap
- 数据模型说明：[langfuse.com/docs/tracing](https://langfuse.com/docs/tracing) — Trace / Generation / Score 怎么嵌套

## 关联

- [[langchain]] —— 主流 LLM 应用框架，与 Langfuse 一行集成
- [[llamaindex]] —— RAG 框架，同样支持 Langfuse 钩子
- [[prometheus]] —— 基础设施监控的标杆，Langfuse 是 LLM 层的对应物

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argilla]] —— Argilla — 给 LLM 训练数据做人工反馈的开源标注平台
- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
