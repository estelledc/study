---
schema_version: 4
title: lens-cookbook v4 索引
verified_at: 2026-05-31
review_quarter: 2026Q2
---

# lens-cookbook v4

## 总览

lens 是把一个技术领域压成 ≤ 3000 字、可在 30 分钟内读完的"决策图鉴"——按 Thoughtworks Tech Radar 四环（adopt / trial / assess / hold）排开候选项，每项给出适用条件、坑点、替代方案。

为什么这么切：以"今天动手要做的事"为维度，避开学院派分类。本卷 6 个 lens：底座推理（vllm）、应用前端（frontend）、应用后端（backend）、数据检索（data）、平台运维（devops）、AI 工程化（aieng）——共同覆盖一个现代 AI 产品从 GPU 到 UI 的完整栈。

怎么用：按下方"决策表 1"路由到目标 lens；正文读 ring_summary 拿到选型骨架；`provider_coverage_checklist` 验证你的方案没漏厂商；`open_questions` 是公开未收敛点，不要假装已解决。

## 决策表 1：lens 路由表

| 任务关键词 | 路由到 |
|---|---|
| serving / KV / 调度 / 量化 / 投机解码 | [lens-vllm](lens-vllm.md) |
| 路由 / SSR / 表单 / 流式 UI / SDK 客户端 | [lens-frontend](lens-frontend.md) |
| API / ORM / 队列 / 鉴权 / 限流 | [lens-backend](lens-backend.md) |
| 向量库 / 检索 / ETL / OLAP / RAG 索引 | [lens-data](lens-data.md) |
| K8s / GPU operator / 监控 / IaC / 弹性 | [lens-devops](lens-devops.md) |
| 模型路由 / prompt 缓存 / agent 框架 / eval | [lens-aieng](lens-aieng.md) |
| 跨 lens 名词不一致 | [glossary](glossary.md) |

## 决策表 2：跨 lens 引用矩阵

| 主题 | vllm | aieng | backend | frontend | data | devops |
|---|---|---|---|---|---|---|
| serving 协议 / OpenAI 兼容 | 出 | 用 | — | — | — | — |
| prompt cache / KV 复用 | 出（KV） | 用（cache_control） | — | — | — | — |
| 流式 token / SSE | 出 | 出（router） | 转发 | 用（AI SDK） | — | — |
| 模型路由 / 多 provider | — | 出 | 调用 | — | — | — |
| 检索 + 生成 (RAG) | — | 编排 | API 层 | UI | 出（向量+混合） | — |
| GPU 资源 / autoscale | 用 | 用 | — | — | — | 出 |
| eval / 监控 trace | — | 出（promptfoo/LangSmith） | 用 | — | — | 用（OTel） |

## 决策表 3：schema 版本历史

| 版本 | 主要改动 | SC 通过率 |
|---|---|---|
| v2 (2026-05-29) | 6 字段 front-matter + ring 四象限 | 3/5（vllm pilot） |
| v3 (2026-05-30) | 加 `excludes` + 4 stub 模板 + `provider_coverage_checklist` + `open_questions` | 5/5（vllm/frontend） |
| v4 (2026-05-31) | 加 `layer` enum + `tuning` 可调参 regex + ADR whitelist + 跨 lens 引用规范 + lint 规则 | 5/5（backend/data/devops/aieng） |

完整 diff：[paradigm/CHANGELOG-v3-to-v4](paradigm/CHANGELOG-v3-to-v4.md)。

## 6 个 lens

| lens | ring_summary | 链接 |
|---|---|---|
| vllm | adopt 5 / trial 4 / assess 2 / hold 1 | [lens-vllm](lens-vllm.md) |
| frontend | adopt 5 / trial 6 / assess 2 / hold 2 | [lens-frontend](lens-frontend.md) |
| backend | adopt 9 / trial 7 / assess 1 / hold 4 | [lens-backend](lens-backend.md) |
| data | adopt 7 / trial 6 / assess 2 / hold 2 | [lens-data](lens-data.md) |
| devops | adopt 9 / trial 8 / assess 0 / hold 3 | [lens-devops](lens-devops.md) |
| aieng | adopt 9 / trial 4 / assess 1 / hold 4 | [lens-aieng](lens-aieng.md) |

## paradigm/

- [lens-schema-v4](paradigm/lens-schema-v4.md)：front-matter 字段定义 + 必填/可选 + 枚举值
- [lint-rules](paradigm/lint-rules.md)：CI 可执行的检查项（schema_version、layer、ring 计数、跨链）
- [CHANGELOG-v3-to-v4](paradigm/CHANGELOG-v3-to-v4.md)：本次升级具体改动

## excludes-stubs/

每个 lens 通过 `excludes:` 字段声明把 4 类正文外内容外置——`getting_started` / `reading_list` / `sources` / `what_is_not`——以便正文严守 ≤ 3000 字预算。本目录收 4 份模板，新建 lens 时直接 cp 改写。

## glossary

跨 lens 候选术语清单，来自 v3 抽样：[glossary](glossary.md)。下一卷计划升级为正式 entries（每个词一个段落 + 出处 lens）。
