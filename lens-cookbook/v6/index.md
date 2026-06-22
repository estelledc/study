---
project: lens-cookbook
version: 6
status: active
date: 2026-05-31
---

# Lens Cookbook v6

7 个 lens，schema v6，9 条 lint 规则。每个 lens 一张候选表 + 多条 ADR + 决策树（首节点是成本/规模门）+ 4 类 excludes 外迁。

## v4 → v6 关键改动

5 项 fix（F5–F9，含 v5 中转）：

- **F6（v5）立场列锁定**：候选表"立场"列改 `<候选名>: <≤20 字短语>`，跨 lens 对比无须人脑归一化。
- **F7（v6）wikilinks 字段**：frontmatter 必填 `wikilinks: [...]`，≥5 项，取代 meter 二次正则推断。
- **F8（v6）ADR 段升 `###`**：与候选表同级 `##` 冲突让 citation-meter v1 误判，统一三级标题。
- **F9（v6）决策树首层门控**：第一节点必须是成本/规模/合规门，不能直接 "vLLM vs SGLang"。
- **dogfood 闭环**：v4 dogfood useful_rate 0.4，v6 新增 lens-media-storage + frontend 流式 UI 段 + aieng ADR-5（LangGraph TS/Py 拆分）+ devops Q0 PaaS 门 + backend Auth 段。

## 决策表 1：lens 路由（任务 → lens）

| 任务关键词 | lens | layer |
|---|---|---|
| React/Vue/Svelte/流式 UI/SSE | [lens-frontend](lens-frontend.md) | app |
| LangGraph/agent/RAG/embedding 选型 | [lens-aieng](lens-aieng.md) | app |
| 部署/CI/PaaS/容器/IaC | [lens-devops](lens-devops.md) | app |
| API server/Auth/ORM/消息队列 | [lens-backend](lens-backend.md) | app |
| 视频/音频/对象存储/CDN/转码 | [lens-media-storage](lens-media-storage.md) | app |
| LLM 推理/KV cache/PagedAttention | [lens-vllm](lens-vllm.md) | serving |
| 数据仓/ETL/lakehouse/列存 | [lens-data](lens-data.md) | app |

## 决策表 2：v4 vs v6 关键指标

| 指标 | v4 | v6 |
|---|---|---|
| lens 数 | 6 | 7（+media-storage） |
| dogfood useful_rate | 0.4 | 期望 ≥0.7 |
| citation coverage | 部分 lens 缺 wikilinks | 全 lens frontmatter 必填 ≥5 |
| 决策树首层 | 直接技术 | 成本/规模门 |
| ADR 段标题 | `##` | `###` |
| 立场列规范 | 自由文本 | `候选: 短语` 正则 |

## 决策表 3：schema 版本史

| 版本 | 关键引入 | SC 通过率 | dogfood 验收 |
|---|---|---|---|
| v2 | 候选表 + ADR 雏形 | — | 未跑 |
| v3 | F1-F4：layer / decision 正则 / excludes 外迁 / 列序锁定 | 5/5 lens 通过 | dossier × 5 |
| v4 | F5：ADR subtype 段白名单 | 5/5 + lens-aieng | dossier-aieng |
| v5 | F6：立场列 `候选: 短语` | 6/6 dry-run | fb2 reflection |
| v6 | F7-F9：wikilinks / ADR `###` / 决策树门控 | 7/7 enforcing | fb3 dogfood（本轮） |

## 7 lens 链接

- [lens-frontend](lens-frontend.md)
- [lens-aieng](lens-aieng.md)
- [lens-devops](lens-devops.md)
- [lens-backend](lens-backend.md)
- [lens-media-storage](lens-media-storage.md)
- [lens-vllm](lens-vllm.md)
- [lens-data](lens-data.md)

## 配套

- [paradigm/lens-schema-v6.md](paradigm/lens-schema-v6.md) — schema 全文（8 节）
- [paradigm/lint-rules-v6.md](paradigm/lint-rules-v6.md) — 9 条 lint 规则（R1-R9）
- [paradigm/CHANGELOG-v4-to-v6.md](paradigm/CHANGELOG-v4-to-v6.md) — 触发/改动/不兼容/落地序
- [glossary.md](glossary.md) — 术语候选
- [excludes-stubs/](excludes-stubs/) — 4 类 stub 模板（sources/reading_list/getting_started/what_is_not）
- [tools/citation-meter-v2.mjs](tools/citation-meter-v2.mjs) — citation 度量器
