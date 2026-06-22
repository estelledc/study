---
schema_version: 6
lens_id: aieng
title: lens-aieng
domain: lens
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: TS+Py 双栈 1-20 人；Anthropic+OpenAI+Gemini
ring_summary: { adopt: 11, trial: 6, assess: 2, hold: 4 }
wikilinks: [langchain, openai-agents-sdk, claude-agent-sdk, mcp-spec, mcp-ts-sdk, litellm-proxy, vercel-ai, promptfoo, langfuse, ollama, llama-cpp]
out_of_corpus: [langgraph, openrouter, portkey, stdio, streamable-http, mem0, pyodide, deno, e2b, firecracker]
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
sources: [mcp, anthropic, openai, langgraph, litellm, vercel, promptfoo, pyodide, deno, e2b]
open_questions:
  - cache_control 4 节点放置无 benchmark
  - MCP list_changed 跨家不一致
  - router cache/reasoning tokens 字段口径
  - 三家 HITL 恢复语义不互通
  - structured output 跨家差异
  - sandbox cold-start vs 隔离强度
---

## 候选表

verified 2026-05-31。OOG = out_of_corpus（行业事实标准 / ADR 终点，study 仓未写笔记）。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| LangGraph (OOG) | adopt | LangGraph: 编排默认 | HITL | app |
| OpenAI Agents SDK | adopt | OpenAI: handoff | 锁 | app |
| Claude Agent SDK | adopt | Claude: cache | 锁 | app |
| LiteLLM | adopt | LiteLLM: Py router | 自托管 | app |
| OpenRouter (OOG) | adopt | OpenRouter: SaaS | 零运维 | app |
| Vercel AI SDK | adopt | Vercel: TS 进程内 | Next.js | app |
| LangChain Router | trial | LCR: 全栈 | 复用 | app |
| Portkey (OOG) | trial | Portkey: audit | virtual key | app |
| MCP spec | adopt | MCP: 工具协议 | 工具 | app |
| stdio (OOG) | adopt | stdio: 本地 | IDE | app |
| Streamable HTTP (OOG) | adopt | SH: 远端 | 多租户 | app |
| Anthropic cache | adopt | cache: 长 sys | 多轮 | app |
| mem0/Letta (OOG) | trial | mem0: 跨 session | 个性化 | app |
| promptfoo | adopt | promptfoo: offline | PR | app |
| Pyodide (OOG) | trial | Pyodide: 浏览器 | 前端 | app |
| Deno (OOG) | adopt | Deno: permission | TS | app |
| E2B (OOG) | adopt | E2B: microVM | 多语言 | app |
| Firecracker 自托管 (OOG) | assess | FC: 自管 | 合规 | app |

hold：CrewAI / AutoGen / 自研 / 旧 SSE

## 离线 LLM 调用（不走 cloud router）

无 API key、本地推理、隐私优先（笔记应用 / 本地 CLI / 边缘）场景。layer = app（调用方层）。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| Ollama | adopt | Ollama: 一行起、生态最广 | 主选离线 | app |
| llama.cpp | trial | llama.cpp: C++ 极致性能 | 嵌入二进制 | app |
| Transformers.js | trial | Tj: 浏览器内 wasm | 前端纯客户端 | app |
| mlx | trial | mlx: Apple Silicon 原生 | M 系列优化 | app |
| candle | assess | candle: Rust 推理 | Rust 项目嵌入 | app |

hold：自编译 GGUF（运维重）。

## ADR 索引

**ADR-1 编排** (vendor-selection)
### context
multi-step+HITL+跨 provider。
### decision
LangGraph(Py)；Agents SDK 仅 OpenAI；Claude SDK 仅 CC。
### alternatives
Mastra（TS）；CrewAI（观测弱）；自研（HITL 贵）。
### consequences
HITL+重放+分支；学 1-2 周；切走 ≈ 重写。

**ADR-2 Router** (vendor-selection)
### context
五家切换+fallback。
### decision
Py LiteLLM；TS Vercel；OpenRouter。
### alternatives
Portkey（audit）；LCR（全栈）。
### consequences
cache_read 归一；OpenRouter +1 跳。

**ADR-3 长对话** (architecture)
### context
30-100 turn；sliding 丢上下文，compaction 失 cache。
### decision
sliding(n=20)+80% summary；+mem0。
### consequences
sliding 命中最高；mem0 +200-500ms。
### rollback
cache_hit <30% 或 mem0 故障 → 关。

**ADR-4 cache 放置** (implementation-tuning)
### context
cache_control ≤ 4 节点；5min ephemeral。
### decision
cache_nodes = 3；cache_ttl = 5min；one_hour_beta = false。
### rationale
write 1.25× 命中 0.1×；≥2 划算。
### consequences
字节稳定；timestamp 即 miss；回滚去 cache_control。

**ADR-5 语言栈** (architecture)
### context
TS 项目直嵌 LangGraph.js vs 拆 Py 后端。
### decision
工具 ≤5 且 HITL <1/会话 且 不依赖 Py-only → 直嵌；否则拆 Py FastAPI+LangGraph，TS 走 SSE。
### consequences
直嵌 TS 贯通但 checkpoint 弱+无 Py；拆 +1 跳+跨语言调试，拿 Py 全集。
### rollback
Py 工具<2 真用 或 跨语言 trace >1 周维护 → 退回直嵌。

**ADR-7 离线 LLM 主选 Ollama** (vendor-selection)
### context
用户希望无 API key / 离线 / 隐私优先；走 cloud router（LiteLLM/OpenRouter）需联网+key。
### decision
默认 Ollama；前端纯客户端 → Transformers.js；M 系列极致性能 → mlx；Rust 二进制嵌入 → llama.cpp/candle。
### alternatives
llama.cpp（拒：CLI 原始、模型管理手工）；vLLM（拒：server 化、不嵌入式）；自编译 GGUF（拒：运维重）。
### consequences
模型一行 pull、OpenAI 兼容 API；首次下模型 GB 级、量化版精度损失；冷启 1-3s。
### rollback
本地推理质量不达标 → 切回 cloud router（LiteLLM）+ Ollama 兜底缓存。

**ADR-6 Sandbox** (vendor-selection)
### context
code-interpreter 隔离。
### decision
浏览器 Pyodide；TS Deno；多语言 E2B；合规 Firecracker 自托管。
### alternatives
Docker exec（隔离弱）；nsjail（运维重）。
### consequences
Pyodide 包限；Deno 无 Py；E2B +1 跳；Firecracker SRE 高。

## 决策树

```
Q0 成本/规模门控：
  团队 ≤3 或 月预算 <$500 → 全 SaaS
  4-20 人 → Q1
  合规本地化 → LiteLLM+Firecracker
Q1 多步+HITL→LG(ADR-1) / 单步→Vercel
Q2 TS+工具≤5→LG.js / 否则拆 Py(ADR-5)
Q3 ≥2 provider→ADR-2
Q4 稳定前缀→ADR-4
Q5 stdio / SH
Q6 sandbox(ADR-6)
Q7 长对话(ADR-3)
Q8 zod / structured
Q9 promptfoo+trace
```

## 外迁 excludes

stub: sources / reading_list / getting_started / what_is_not (`<slug>/aieng.md`)。
