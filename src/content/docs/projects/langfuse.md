---
title: Langfuse — LLM 应用可观测性
来源: https://github.com/langfuse/langfuse
日期: 2026-05-29
分类: AI
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/langfuse/langfuse
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 362ef39abb298824b187e8e964d21460a1d03e98
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: v4.21.0
---

## 是什么

**Langfuse** 是一个开源的「LLM 应用追踪与评测平台」——把每次 LLM 调用、token 用量、prompt 版本、评分反馈记录下来可视化。

日常类比：[[prometheus]] 监控服务器的 CPU 和内存（基础设施层），Langfuse 监控的是 LLM 应用层——prompt 是什么、模型回了什么、花了多少 token、这次回答被打了几分。

举个例子：你在线上跑一个客服机器人，用户问了 100 个问题。Langfuse 让你看到：

- 每个问题走的是哪条调用链、哪个 prompt 版本
- 每次模型调用的耗时、token 与成本归因
- 人工或自动评分对每条回答的判断
- 哪些问题的链路出了错

没有这类平台时，这些数据要么在各家模型厂商的控制台看个总数，要么自己写日志逐行 grep。

## 为什么重要

不理解 Langfuse 的架构，下面这些事说不清：

- 为什么 LLM 可观测性不能只靠“打日志”——调用链是嵌套结构（一次会话 → 多步检索/生成），要专门的数据模型
- 为什么它的自托管栈要同时上 Postgres 和 ClickHouse——元数据与遥测时序的查询模式根本不同
- 为什么“遥测平台”都在拥抱 OpenTelemetry——固定 v4.21.0 直接暴露 OTLP traces 端点，SDK 之外多了标准接入路
- 为什么开源核心 + `ee/` 商业目录的分层许可成了这类平台的常见形态

## 核心架构与数据流程

固定 v4.21.0 可以拆成数据模型与部署栈两条线：

1. **数据模型（遥测三件套 + 元数据）**：核心遥测是 **traces**（一次完整调用链）、**observations**（链内的每一步——span / generation / event，LLM 调用是其中的 generation 类型）与 **scores**（人工或自动评分）——这三张表建在 ClickHouse（迁移 0001/0002/0003）。prompt 版本、数据集、实验、会话、项目/用户等元数据在 Postgres（Prisma schema）。类比：trace 像一次手术的整体记录，observation 是手术里的每个步骤，score 是术后评估表，prompt 库是带版本的 SOP 模板。

2. **部署栈（六个服务）**：`docker-compose.yml` 定义 `langfuse-web`（Next.js 应用与 API）、`langfuse-worker`（异步摄取与处理）、`postgres`、`clickhouse`、`redis`（队列/缓存）、`minio`（S3 兼容 blob，存原始事件与多媒体）。写入路径是“API 收事件 → 队列 → worker 落库”，读写分离扛高写入。

3. **接入面**：公共 API 在 `api/public/*`（ingestion、observations、metrics、datasets、experiments、annotation-queues、media 等），另有 **OTLP 端点 `api/public/otel/v1/traces`**——除官方 SDK 外，任何 OpenTelemetry 导出器都能把 trace 打进来。

## 实践示例

### 案例 1：Python 一行集成 OpenAI

把 `openai` 的 import 换成 `langfuse.openai`，业务调用几乎不动：

```python
# pip install langfuse openai
# export LANGFUSE_PUBLIC_KEY=pk-lf-...
# export LANGFUSE_SECRET_KEY=sk-lf-...
# export LANGFUSE_HOST=http://localhost:3000  # 自托管地址

from langfuse.openai import openai  # 原来是: import openai

completion = openai.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "用一句话解释 Trace"}],
)
```

之后所有 OpenAI 调用都被记成 observation（generation 类型），UI 里能看到 prompt、输出、token 与成本归因。SDK 的具体行为以其自身版本文档为准，本文只绑定平台侧。

### 案例 2：自托管一键起

```bash
git clone https://github.com/langfuse/langfuse
cd langfuse
docker compose up -d
```

固定 v4.21.0 的 compose 会起六个服务：web + worker + Postgres + ClickHouse + Redis + MinIO。Postgres 装元数据（项目、prompt 版本、数据集），ClickHouse 装 traces/observations/scores 时序数据（高写入 + 聚合查询），Redis 做异步队列，MinIO 存原始事件与媒体 blob。

### 案例 3：OpenTelemetry 标准接入

```text
POST <你的 langfuse>/api/public/otel/v1/traces   # OTLP/HTTP
```

已经用 OTel 埋点的应用（或任何带 OTLP exporter 的 agent 框架）可以不接 Langfuse SDK，直接把 spans 导到这个端点，由平台映射成 trace/observation 模型。对“observability 已有一套 OTel 管线”的团队，这是增量最小的接入路。

## 踩过的坑

1. **别把所有东西塞进一个 trace**：trace 是“一次完整调用链”的边界。把整个批处理任务塞成一条 trace，UI 和聚合查询都会难用；按用户请求或任务实例切 trace，链内步骤用 observation 表达。

2. **成本字段依赖模型价目**：token 成本换算需要模型单价映射（平台带 models 配置面）；自定义或新模型要自己维护单价，否则成本归因对不上账单。

3. **自托管不是单容器**：六服务栈意味着要照看 Postgres/ClickHouse/Redis/MinIO 四个有状态组件的存储与备份；试用可以 compose 一把起，生产要按各组件自己的运维实践来。

4. **`ee/` 目录不是 MIT**：`ee/`、`web/src/ee/`、`worker/src/ee/` 下的功能按商业许可（`ee/LICENSE`），其余 MIT。自托管选型时按 LICENSE 分层核对功能边界，别默认“仓库里有的都能随便用”。

5. **版本迭代快，教程易过期**：绑定的 v4.21.0 与网上大量 v2/v3 教程在部署栈与功能面上已有差异；对任何操作步骤先核对目标版本。

## 适用 vs 不适用

**适用**：

- 团队级 LLM 应用，有调试 / 评测 / 成本归因需求
- 要 self-host、数据不出自己基础设施的场景
- 已有 OTel 管线、想用标准协议接入 LLM 遥测的团队
- 需要 prompt 版本管理 + 数据集 + 实验评测在同一平台闭环

**不适用**：

- 个人小项目——模型厂商控制台看用量就够，六服务栈过重
- 完全没有 LLM 调用的传统 web 应用——用通用 APM
- 只想要“零代码改动”的代理式记录——那是 HTTP proxy 型工具的形态，Langfuse 主路径是 SDK/OTLP 上报
- 不能运维有状态服务的环境——自托管栈含四个有状态组件

## 固定版本边界

- 本文绑定 `langfuse/langfuse@362ef39a...`，即 release tag `v4.21.0`；根 `package.json` 版本一致。
- 部署栈：web、worker、Postgres、ClickHouse、Redis、MinIO 六服务（`docker-compose.yml`）；traces/observations/scores 建在 ClickHouse，元数据在 Postgres。
- 接入面：`api/public/*` 公共 API + `api/public/otel/v1/traces` OTLP 端点。
- 许可：核心 MIT，`ee/` 及 `web/src/ee/`、`worker/src/ee/` 按 `ee/LICENSE` 商业许可；该 revision 的 LICENSE 版权行为 "Copyright (c) 2023-2026 ClickHouse, Inc."。
- 本文未部署平台、未运行摄取链路、未测写入吞吐或查询延迟；SDK 行为、Cloud 定价与 retention 策略均不在绑定范围。状态保持 `UNVERIFIED`。

## 学到什么

1. **可观测性总会从基础设施层爬到应用层**——先有 Prometheus 监控机器，再有 LLM trace 平台监控调用链
2. **存储分层是查询模式逼出来的**——元数据（关系查询）进 Postgres，遥测时序（高写入聚合）进 ClickHouse，队列与 blob 各归其位
3. **标准协议是平台的护城河也是逃生门**——暴露 OTLP 端点意味着接入不锁定自家 SDK，用户迁移成本双向降低
4. **开源核心 + ee 分层是这类平台的常见商业形态**——读 LICENSE 的目录边界，比读官网定价页更接近事实

## 应用型自测

1. 固定 v4.21.0 的自托管 compose 栈有哪六个服务？
2. traces / observations / scores 存在哪个数据库里，为什么不放 Postgres？
3. 不用 Langfuse SDK，还有什么标准方式把调用链打进平台？

检查点：

1. langfuse-web、langfuse-worker、Postgres、ClickHouse、Redis、MinIO。
2. ClickHouse（迁移 0001/0002/0003 建表）；遥测是高写入 + 聚合查询的时序负载，与 Postgres 里的关系型元数据查询模式不同。
3. OpenTelemetry：把 OTLP traces 导出到 `api/public/otel/v1/traces` 端点。

## 延伸阅读

- 官方文档：[langfuse.com/docs](https://langfuse.com/docs) — 集成 / SDK / self-host 指南
- 固定源码：[github.com/langfuse/langfuse](https://github.com/langfuse/langfuse) —— 本文绑定提交 `362ef39abb298824b187e8e964d21460a1d03e98`
- 数据模型说明：[langfuse.com/docs/tracing](https://langfuse.com/docs/tracing)
- [[haystack]] —— 管线框架视角：先把链路搭出来，再谈观测

## 关联

- [[langchain]] —— 主流 LLM 应用框架，Langfuse 提供集成
- [[llamaindex]] —— RAG 框架，同样支持 Langfuse 钩子
- [[haystack]] —— LLM 管线编排；跑起来之后的追踪与评测正是 Langfuse 的位置
- [[prometheus]] —— 基础设施监控的标杆，Langfuse 是 LLM 层的对应物
- [[clickhouse]] —— Langfuse 遥测存储的底座，也是其 LICENSE 版权主体

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[argilla]] —— Argilla — 给 LLM 训练数据做人工反馈的开源标注平台
- [[botpress]] —— Botpress — 把对话画成流程图加 LLM 节点的开源 chatbot 平台
- [[midscene]] —— midscene — 用自然语言代替 selector 的浏览器自动化框架
