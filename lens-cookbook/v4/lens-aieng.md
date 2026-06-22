---
schema_version: 4
lens_id: aieng
title: lens-aieng
domain: lens
layer: app
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: TS+Py 双栈 1-20 人；Anthropic+OpenAI+Gemini
ring_summary: { adopt: 9, trial: 4, assess: 1, hold: 4 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
provider_coverage_checklist:
  - LiteLLM (Py proxy) — adopt
  - OpenRouter (SaaS) — adopt
  - Vercel AI SDK (TS 进程内) — adopt
  - LangChain Router — trial
  - Portkey (企业 audit) — trial
sources:
  - modelcontextprotocol.io spec (2025-03 Streamable HTTP)
  - docs.anthropic.com / platform.openai.com prompt-caching
  - langchain-ai.github.io/langgraph / openai.github.io/openai-agents-python
  - docs.litellm.ai / openrouter.ai/docs / sdk.vercel.ai
  - promptfoo.dev / docs.smith.langchain.com
open_questions:
  - cache_control 第 4 节点放置无 benchmark
  - MCP host list_changed+重连跨家不一致
  - router cache/reasoning tokens 字段口径分歧
  - 三家 HITL 恢复语义不互通
  - structured output 跨 provider 表达力差异
  - LLM-judge 跨家校准协议无标准
---

## 1. 选型铁律

1. 编排默认 LangGraph；锁 provider 才上 OpenAI/Claude Agent SDK
2. Router：Py LiteLLM / TS Vercel AI SDK / 零运维 OpenRouter
3. ≥1k 稳定前缀必上 prompt cache
4. MCP 本地 stdio；远端 Streamable HTTP+OAuth 2.1
5. 长对话 sliding+80% summary
6. JSON：TS generateObject+zod / Py with_structured_output
7. PR promptfoo；线上 trace+1% 回流

## 2. 候选表

verified 2026-05-31。layer 全部 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| LangGraph | adopt | 编排默认 | HITL+多 step | app |
| OpenAI Agents SDK | adopt | OpenAI 锁 | handoff | app |
| Claude Agent SDK | adopt | Claude 锁 | cache+memory | app |
| LiteLLM | adopt | Py router | 自托管 | app |
| OpenRouter | adopt | SaaS | 零运维 | app |
| Vercel AI SDK | adopt | TS 进程内 | Next.js | app |
| LangChain Router | trial | 已全栈 | 复用 | app |
| Portkey | trial | 企业 audit | virtual key | app |
| MCP SDK | adopt | spec | 工具集成 | app |
| stdio | adopt | 本地 | IDE | app |
| Streamable HTTP | adopt | 远端 | 多租户 | app |
| Anthropic cache | adopt | 长 system | 多轮 | app |
| outlines/xgrammar | assess | grammar | 自托管 | app |
| mem0/Letta | trial | 跨 session | 个性化 | app |
| promptfoo | adopt | offline CI | PR 回归 | app |
| LangSmith | adopt | online trace | LangGraph | app |

hold：CrewAI / AutoGen / 自研 loop / 旧 SSE

## 3. 迷你 ADR

**ADR-1 编排 LangGraph** (vendor-selection)
## context
要 multi-step+tool+HITL+跨 provider。Py 主，双家模型。
## decision
LangGraph(Py)；Agents SDK 仅 OpenAI demo；Claude Agent SDK 仅 Claude Code。
## alternatives
Mastra（TS-only）；CrewAI（观测弱）；自研 loop（HITL 重写贵）。
## consequences
拿 HITL+重放+分支；学习 1-2 周；改 graph 迁 checkpoint；切走 ≈ 重写编排。

**ADR-2 Router 双轨** (vendor-selection)
## context
五家 provider 切换+fallback+对账。Py 托管收益高，TS 进程内顺手。
## decision
Py LiteLLM；TS Vercel AI SDK；早期 OpenRouter；不混。
## alternatives
Portkey（audit 才用）；LangChain Router（全栈才用）；自研（字段归一贵）。
## consequences
cache_read 跨家需 callback 归一；OpenRouter 加 1 跳；切换改 base_url。

**ADR-3 长对话三段式** (architecture)
## context
session 30-100 turn。sliding 丢上下文，compaction 让 cache 失效，mem0 +两次调用。
## decision
sliding(n=20)+80% ctx summary；跨 session +mem0；复用上次 summary。
## consequences
sliding cache 命中最高；compaction 吃 1× 长 prompt；mem0 +200-500ms。
## rollback
cache_hit_rate <30% 或 mem0 故障；关 summary 改阈值；关 mem0 删 retrieve。

**ADR-4 Anthropic cache 放置** (implementation-tuning)
## context
cache_control ≤ 4 节点；ephemeral 5min，1h beta。
## decision
cache_nodes = 3；cache_ttl = 5min；one_hour_beta = false。
## rationale
5min 配在线；write 1.25× 命中 0.1×，命中 ≥2 划算；1h 写 2× 贵。
## consequences
之前内容须字节稳定，加 timestamp 即 miss；跨家字段不同；回滚去 cache_control。

## 4. 决策树

```
Q1 多步+HITL→LangGraph(ADR-1) / 单步→Vercel AI SDK
Q2 ≥2 provider→Py LiteLLM / TS Vercel AI SDK(ADR-2)
Q3 稳定前缀+反复→prompt cache(ADR-4)
Q4 工具：本地 stdio / 远端 Streamable HTTP
Q5 长对话→sliding+summary+mem0(ADR-3)
Q6 JSON→generateObject+zod / with_structured_output
Q7 PR promptfoo；线上 trace+1% 回流；judge 异构
```

## 5. 缺口与待补

1. cache_control 第 4 节点放置无 benchmark
2. MCP host list_changed+重连跨家不一致
3. router cache/reasoning tokens 字段口径分歧
4. 三家 HITL 恢复语义不互通
5. structured output 跨家表达力差异
