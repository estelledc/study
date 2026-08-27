# LLM pipeline and observability source review

> 用途：记录 Haystack、Langfuse 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- evidence：GitHub metadata、固定提交静态源码、LICENSE 与部署清单阅读
- not executed：未安装两仓依赖，未运行 Pipeline、Docker 栈、数据库或任何 LLM 调用，未做吞吐/延迟/成本测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## Haystack

- canonical source：`https://github.com/deepset-ai/haystack`
- revision：`859a6eb3ac4d0bd33f069bab57fb041e3434a353`
- release：`v3.1.0`（annotated tag 解引用；`VERSION.txt` 与 `pyproject.toml`（package `haystack-ai`）一致）
- inspected：
  - `pyproject.toml`、`VERSION.txt`
  - `haystack/core/pipeline/base.py`
  - `haystack/core/pipeline/pipeline.py`
  - `haystack/core/component/component.py`
  - `haystack/components/agents/`
  - `haystack/components/generators/__init__.py`、`haystack/components/generators/chat/`
  - `haystack/components/builders/`
  - `haystack/components/embedders/__init__.py`
  - `haystack/tools/`
  - `haystack/skill_stores/`
  - `haystack/document_stores/`
- observed：
  - `PipelineBase.connect(sender, receiver)` 在装配期做 socket 名称与类型匹配校验，多 socket 时必须写全 `component.socket` 形式；
  - `Pipeline` 单类同时提供 `run`（同步）、`run_async`、`run_async_generator`（流式）入口；执行调度按连通分量给环内组件分配同等优先级——图**允许环**，只有环内连接属于不受支持的形态时才抛错（`base.py` 用 `networkx.is_directed_acyclic_graph` 区分处理路径）；
  - `@component` 装饰器 + `@component.output_types` / `set_output_types` 声明输出 socket；
  - Agent 位于核心包 `haystack.components.agents`（`agent.py`、`tool_calling.py`、`state/`），工具层 `haystack/tools/` 提供 `Tool`、`ComponentTool`、`PipelineTool`、`Toolset`、`from_function` 等；`haystack/skill_stores/`（file_system 后端）是该版本的 agent skills 存储；
  - Pipeline 可序列化：`to_dict` / `dumps` / `loads` 走 Marshaller（默认 YAML）；
  - 核心包只内置 `in_memory` document store 与 types 协议，外部向量库经独立 integration 包接入；`requires-python >=3.10`。
  - 核心 `haystack.components.generators` 只导出 `OpenAIImageGenerator`；文本 LLM 是 `haystack.components.generators.chat.OpenAIChatGenerator`，`run(messages=...)` 输入 socket 为 `messages`，输出 `replies`。与之配对的是 `ChatPromptBuilder`（输出 socket 仍名 `prompt`，类型 `list[ChatMessage]`），连接为 `prompt.prompt → llm.messages`。已删除的 `OpenAIGenerator` / `prompt` completion 口不是该 pin 的当前 API。
  - 核心 `haystack.components.embedders` 导出 `OpenAIDocumentEmbedder`、`OpenAITextEmbedder`、`AzureOpenAIDocumentEmbedder`、`AzureOpenAITextEmbedder`、`MockDocumentEmbedder`、`MockTextEmbedder`；`SentenceTransformersDocumentEmbedder` 不在该 revision 的核心树。
- provenance note：
  - GitHub release `v3.1.0`（2026-08-24）为 annotated tag `26b9a845...`，解引用到提交 `859a6eb3...`（"bump version to 3.1.0"）；PyPI 包名为 `haystack-ai`；
  - 旧正文的 “v2 架构（2024-03）”“Pipeline 不能有环，循环要用 haystack-experimental 的 Agent”“大约 17k stars” 在该 revision 均已过时或不可绑定，已由上述观察替换。

## Langfuse

- canonical source：`https://github.com/langfuse/langfuse`
- revision：`362ef39abb298824b187e8e964d21460a1d03e98`
- release：`v4.21.0`（lightweight tag；根 `package.json` version 一致）
- inspected：
  - `package.json`
  - `docker-compose.yml`
  - `LICENSE`、`ee/`
  - `packages/shared/prisma/schema.prisma`
  - `packages/shared/clickhouse/migrations/unclustered/`
  - `web/src/pages/api/public/`
- observed：
  - 自托管栈由 `docker-compose.yml` 定义六个服务：`langfuse-web`、`langfuse-worker`、`postgres`、`clickhouse`、`redis`、`minio`（S3 兼容 blob 存储）；
  - 核心遥测数据表在 ClickHouse：迁移 0001/0002/0003 分别建 `traces`、`observations`、`scores`；Postgres（Prisma schema）承载项目/用户/prompt/数据集/会话等元数据（`TraceSession`、`ScoreConfig`、`TraceMedia`、`ObservationMedia` 等模型）；
  - 公共 API 面在 `web/src/pages/api/public/`：`ingestion`、`observations`、`generations`、`metrics`、`datasets`、`experiments`、`annotation-queues`、`media`、`mcp`、`llm-connections` 等，另有 OTLP 端点 `api/public/otel/v1/traces`；
  - LICENSE 分层：`ee/`、`web/src/ee/`、`worker/src/ee/` 目录内容按 `ee/LICENSE` 商业许可，其余内容为 MIT（Expat）；LICENSE 版权行为 "Copyright (c) 2023-2026 ClickHouse, Inc."。
- provenance note：
  - GitHub release `v4.21.0`（2026-08-26）指向 `362ef39a...`（"chore: release v4.21.0"）；
  - 旧正文的 “v3 多模态 trace”“Cloud 免费档 30 天 retention”“自托管晚 1-2 个 release”“ClickHouse Too many parts 调参建议” 与 YC 创业史在该 revision 无法从仓库绑定，已由上述观察替换；LICENSE 版权主体（ClickHouse, Inc.）按仓库现状披露。
