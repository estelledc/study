---
lens: frontend
version: 6
status: active
layer: app
schema_version: 6
lens_id: frontend
title: lens-frontend
domain: lens
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
ring_summary: { adopt: 8, trial: 5, assess: 2, hold: 2 }
wikilinks: [react, react-server-components, next-js, http-2, websocket-rfc-6455, tailwind, web-vitals, react-hook-form]
excludes: [sources, reading_list, getting_started, what_is_not]
---

## 候选表

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| Next App Router | adopt | Next: React RSC 默认 | 应用+React | app |
| Astro Islands | adopt | Astro: 内容站零 JS | 内容+SEO | app |
| RSC fetch | adopt | RSC: 服务端取数零 client | 覆盖页 | app |
| TanStack Query | adopt | TanStack: 客户端缓存 | CSR/混合 | app |
| Zustand | adopt | Zustand: 跨页 store | state>3 | app |
| AI SDK useChat | adopt | useChat: LLM 流式默认 | token+tool | app |
| Tailwind+shadcn | adopt | Tailwind: 业务样式 | 业务 UI | app |
| RHF+Zod | adopt | RHF: client wizard | 高交互表单 | app |
| Remix | trial | Remix: 嵌套 loader | 嵌套强 | app |
| SvelteKit | trial | SvelteKit: Svelte 首选 | Svelte 栈 | app |
| Conform | trial | Conform: PE Action | 无 JS 兜底 | app |
| Jotai | trial | Jotai: 原子粒度 | 细粒度订阅 | app |
| Vanilla Extract | trial | VE: 类型 token | 跨框架 token | app |
| SolidStart | assess | SolidStart: 信号性能 | 性能极致 | app |
| Qwik City | assess | Qwik: resumability | 巨型站冷启 | app |
| Formik | hold | Formik: RSC 不友好 | 旧项目 | app |
| styled-components | hold | sc: RSC 运行时差 | 旧项目 | app |

## 流式 UI

token / tool_use / thinking 三流并存，断流可恢复。

- **传输**：useChat > RSC streaming > 自建 SSE。useChat 抽象 chunked tool_use + thinking + replay。WS 仅协作光标。
- **tool_use partial**：`input_json_delta` 按 tool_call_id 累加，渲染前 partial JSON 容错。
- **thinking 折叠**：默认 `<details>` 折叠，token 流入展开。
- **断流恢复**：携 `idempotency_key` 断线 replay，前端按 key 去重。
- **SSE 心跳**：30s comment 防代理断。

## SSR/SSG/ISR/CSR 决策树

```
Q0 成本/规模门：月预算 < $100 且 QPS < 5？
  是 → 静态导出+CDN（SSG）
  否 → Q1
Q1 内容 vs 应用？
  内容+SEO → Astro SSG/ISR → ADR-1
  应用 → Q2
Q2 数据时效 < 1 min？
  是 → SSR/RSC（Next/Remix）→ ADR-1
  否 → ISR(revalidate=60)
Q3 登录态？
  是 → Edge SSR + cookie → ADR-2
  否 → 边缘 KV
Q4 LLM 流式？
  是 → useChat + SSE → ADR-2
  否 → Q5
Q5 表单 PE 必需？
  是 → Conform + Server Action → ADR-3
  否 → RHF + Zod → ADR-3
```

## ADR

### ADR-1 Astro+Next 拆双站

subtype: architecture

### context
营销（高 SEO 低交互）+ 控制台（强交互登录态）。Astro 零 JS 优 LCP，dashboard 需 RSC + 流式。

### decision
营销 Astro 子域 SSG/ISR，控制台 Next App Router 主域 RSC，共享 token 包。

### consequences
营销 LCP 优单 Next 30%；代价双仓 + 双 CI + cookie 跨子域同步。

### rollback
条件：双 CI 维护 > 1 人周/月。操作：Astro 迁回 Next 静态路由 static export，约 1 周。

### ADR-2 流式 useChat vs 自建 SSE

subtype: vendor-selection

### context
Claude/DeepSeek 网关需 token 流 + tool_use partial + thinking + 断流恢复。Workers 后置，企业代理掐 WS。

### decision
adopt Vercel AI SDK useChat；transport=SSE；WS 仅协作光标。

### alternatives
RSC streaming：树流好但 tool_use 拼接手写、断流无原语，拒。自建 SSE：parser/重连/心跳/idempotency 全自己写，拒。

### consequences
内置 chunked tool_use + partial JSON + replay；代价锁 SDK 升级；换 transport 约 2 周。

### ADR-3 RSC 'use client' 边界参数

subtype: implementation-tuning

### context
App Router 默认 server，惯性全加 'use client' bundle 反增。需量化阈值。

### decision
默认 server，下放最小叶子。`use_client_leaf_max_kb = 50`，`rsc_payload_warn_kb = 80`，`hydration_islands_max = 8`。

### rationale
50KB 来自实测：叶子 ≤50KB 时 hydration < 80ms（INP 预算）。Islands > 8 主线程串行 > 200ms。

### consequences
bundle 降 30-50%；代价跨边界非序列化 build error，需培训。
