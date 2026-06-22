---
schema_version: 3
lens_id: frontend
title: lens-frontend
domain: lens
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: Vercel/Cloudflare/Netlify Edge + Node 20 LTS；浏览器 evergreen 近两年
ring_summary: { adopt: 8, trial: 5, assess: 2, hold: 2 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
provider_coverage_checklist:
  - Next.js (App Router + Pages Router) — adopt
  - Astro (islands) — adopt
  - Remix (loader/action) — trial
  - SvelteKit (adapter) — trial
  - SolidStart — assess
  - Qwik City (resumability) — assess
sources:
  - nextjs.org/docs / react.dev / docs.astro.build
  - remix.run/docs / kit.svelte.dev
  - tanstack.com/query v5 / sdk.vercel.ai
  - tailwindcss.com v4 / vanilla-extract.style
  - conform.guide / react-hook-form.com
open_questions:
  - RSC 在 SvelteKit/SolidStart/Qwik 等价路线无收敛
  - Server Actions 多 mutation 无统一回滚原语
  - RSC + 大型 client store 水合时序无范式
  - 流式 SSR 在非 Google 爬虫表现无公开数据
  - Tailwind v4 CSS-first 在大型 token 系统未达共识
  - Edge runtime Node API 残缺边界跨框架不一致
---

## 1. 选型铁律

1. 内容 + 高 SEO → Astro
2. 应用 + React → Next App Router；嵌套强 → Remix
3. 默认 server component，'use client' 下放最小叶子
4. 跨页 state ≤ 3 → Context；> 3 → Zustand
5. LLM 流式 → SSE + AI SDK，WS 仅协作光标
6. Server Action 表单 → Conform；client wizard → RHF+Zod
7. 跨框架 token → Vanilla Extract + Tailwind

## 2. 候选表

verified 2026-05-31。

| 类目 | 候选 | ring | 触发 |
|---|---|---|---|
| 渲染 | Next App Router | adopt | 应用默认 |
| 渲染 | Astro Islands | adopt | 内容默认 |
| 渲染 | Remix | trial | 嵌套强 |
| 渲染 | SvelteKit | trial | Svelte 团队 |
| 渲染 | SolidStart | assess | 性能优小众 |
| 渲染 | Qwik City | assess | resumability |
| 数据 | RSC fetch | adopt | App Router |
| 数据 | TanStack Query | adopt | CSR/混合 |
| 状态 | Zustand | adopt | store 默认 |
| 状态 | Jotai | trial | 原子粒度 |
| 流式 | AI SDK+SSE | adopt | LLM token |
| 流式 | WebSocket | trial | 协作光标 |
| 表单 | Conform | adopt | PE+Action |
| 表单 | RHF+Zod | adopt | client wizard |
| 样式 | Tailwind+shadcn | adopt | 业务页 |
| 样式 | Vanilla Extract | trial | 类型 token |
| 测试 | Vitest+Playwright+MSW | adopt | Vite |

hold：Formik / styled-components（RSC 不友好）。

## 3. 迷你 ADR

**ADR-1 Next App Router vs Astro**（vendor-selection）
Context：混合站点 = 营销（高 SEO 低交互）+ 控制台（强交互登录态）。Astro 静态 JS 近零，dashboard 需 React + 实时。两套部署 vs 合一是首要决定。
Decision：营销走 Astro 子域，控制台 Next App Router 主域，共享 token 包。
Consequences：营销 LCP 优于单 Next；代价双仓 + 双 CI + auth session 同步；回滚 Astro 迁回 static export 一周。Alt：单 Next static export（LCP 输 30%）。

**ADR-2 流式 LLM SSE vs WebSocket**（architecture）
Context：聊天应用在 Next App Router 串 LLM 网关需 token 级流式。前端在 Cloudflare Workers 后，企业客户自有代理，WS 常被掐链。
Decision：Server Action 走 SSE + AI SDK useChat，WS 仅协作光标。
Consequences：SSE 穿透 7 成代理，AI SDK 抽象 token 拼接；代价不支持 client→server 流式；回滚 WS 重写 transport 约两周。Rollback：保 WS interface 切 parser。

**ADR-3 RSC 'use client' 边界规约**（implementation-tuning）
Context：App Router 默认 server，工程师惯性全加 'use client'，bundle 不降反增。需 boundary。
Decision：默认 server，下放最小叶子；react-server lint 防 store 被 server 误 import。
Consequences：bundle 降 30-50%；代价 fetch 在 server、handler 在 client，跨边界非序列化 build error；回滚全开几小时。

**ADR-4 表单 Conform vs RHF**（vendor-selection）
Context：App Router + Server Actions 项目，部分表单需 PE（无 JS 可提交），部分是高交互 wizard。Zod 是 schema 标准。
Decision：Server Action 触达用 Conform，client wizard 用 RHF + zodResolver。
Consequences：PE 获 no-JS fallback 利 SEO/a11y；代价双心智、error 需封装；2-3 天单边迁移。Alt：TanStack Form（assess）、Formik（hold）。

## 4. 决策树

```
Q1 内容 vs 应用？
  内容 → Astro → ADR-1 → Q3
  应用 → Q2
Q2 React vs 非 React？
  React → Next App Router/Remix → ADR-1 → Q3
  非 React → SvelteKit/SolidStart → Q3
Q3 RSC/loader 覆盖页面数据？
  能 → 不引 client query → Q4
  否 → TanStack Query → Q4
Q4 跨页 state > 3？
  否 → Context → Q5
  是 → Zustand/Jotai → Q5
Q5 LLM 流式？
  是 → AI SDK+SSE → ADR-2 → Q6
  否 → Q6
Q6 表单需 PE？
  是 → Conform → ADR-4
  否 → RHF+Zod → ADR-4，配 ADR-3
```

## 5. 缺口与待补

1. RSC 在 SvelteKit/SolidStart/Qwik 等价无收敛。
2. Server Actions 多 mutation 无回滚原语。
3. RSC + 大型 client store 水合靠经验。
4. 流式 SSR 在非 Google 爬虫表现无数据。
5. Tailwind v4 @theme 取代 JS config 未达共识。
6. Edge runtime Node API 跨框架标列不一致。
