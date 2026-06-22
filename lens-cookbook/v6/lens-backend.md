---
schema_version: 6
lens_id: backend
title: lens-backend
domain: lens
layer: app
status: active
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 单 region；Node 18+/Py 3.11+/Go 1.22+/Rust 2026
ring_summary: { adopt: 10, trial: 8, assess: 1, hold: 5 }
excludes: [sources, reading_list, getting_started, what_is_not]
wikilinks: [postgresql, redis, fastapi, fastify, drizzle, auth-js, lucia, clerk, better-auth, supabase, oauth-2.1-rfc, jwt-rfc-7519, bullmq, celery, token-bucket-stripe, axum, hono, valkey, cockroachdb, prisma, trpc]
out_of_corpus: [workos, sqlalchemy, gcra]
sources:
  - postgresql.org / drizzle / sqlalchemy
  - bullmq / pg-boss / River
  - oauth.net 2.1 / RFC 7636 PKCE
  - authjs / lucia / clerk / workos / supabase auth
  - better-auth / redis-cell / Stripe rate limiter
open_questions:
  - PG queue 吞吐基准散乱
  - tRPC 跨仓 schema 演化协商不熟
  - Auth 自建 vs 托管成本拐点缺基准
  - Edge runtime PG 连接演化中
  - K8s SIGTERM 队列在途任务无 pattern
---

## 候选表

| 候选 | ring | 立场 | 触发 |
|---|---|---|---|
| Postgres | adopt | 主库 事务+JSON | 复合查询 |
| Redis | adopt | KV+队列+限流 | 跨实例缓存 |
| Valkey | trial | RSAL 替代 | 许可敏感 |
| Drizzle | adopt | TS ORM 贴 SQL | 新 TS |
| FastAPI | adopt | pydantic+OAS | Py 框架 |
| Fastify | adopt | 性能+插件 | Node |
| Hono | trial | edge 跑得动 | Workers |
| Axum | trial | Tower 生态 | Rust 高吞吐 |
| Auth.js | adopt | TS provider 全 | Next |
| Lucia | hold | 维护放缓 | — |
| Clerk | adopt | 托管最快 | 团队≤3 |
| WorkOS | trial | 企业 SSO+SCIM | B 端 SSO |
| Supabase Auth | trial | 与 PG 同栈 | Supabase |
| Better Auth | trial | 自管 TS | 拒托管 |
| OAuth 2.1 | adopt | 第三方 SSO | 微信/Google |
| JWT | trial | 机机短 token | 服务间 |
| pg-boss | trial | 复用主库 | <1k jobs/s |
| BullMQ | adopt | Node 高吞吐 | >1k jobs/s |
| Celery | adopt | Py 工业默认 | Py 长任务 |
| token bucket | adopt | 突发友好 | 公网限流 |
| GCRA | trial | 单 key O(1) | 精度敏感 |
| CockroachDB | assess | 跨 region | 多区强一致 |

hold：TypeORM / Memcached / fixed window / MongoDB。

## ADR 索引

**ADR-1 主库 PG** (vendor-selection)
- ctx: 中等量需事务+JSON+向量
- dec: PG 单实例；Mongo 不进
- alt: MySQL（JSON 弱）；Mongo（事务弱）
- con: pgvector 覆盖；JSONB 吃漂移

**ADR-2 server session** (architecture)
- ctx: 改密即下线；JWT 撤销退化
- dec: Web cookie+session；机机短 JWT
- con: 撤销=一行 SQL；多 region store 复制
- rb: store P0 >30min → 切 JWT+黑名单

**ADR-3 Auth 选型** (vendor-selection)
- ctx: 团队≤3 上线快 → 托管优先
- dec: Next→Auth.js；托管→Clerk；SSO→WorkOS；自管→Better Auth
- alt: Lucia（放缓）；Auth0（陡）
- con: 托管省 6-8 周但绑定价

**ADR-4 ORM Drizzle** (vendor-selection)
- ctx: Prisma 重；TypeORM 装饰器坑
- dec: TS→Drizzle；Py→SQLAlchemy
- alt: Prisma（edge 限）；TypeORM
- con: 心智=SQL；auto-diff 补手写

**ADR-5 token bucket** (implementation-tuning)
- ctx: fixed window 双倍突刺
- dec: cap=100, refill=10/s, ttl=600
- rat: Lua 原子；GCRA 可平移
- con: 漂移可接受；redis-cell 单装

## 决策树

```
Q1 ≤3 人无运维？Y→Supabase+Clerk / N→Q2
Q2 月 <$200？  Y→PG+Auth.js / N→Q3
Q3 QPS <50？   Y→单机 PG+BullMQ / N→Q4
Q4 全栈 TS？   Y→tRPC+Drizzle / N→REST
Q5 撤销快？    Y→session / N→JWT
Q6 队列<1k+PG？Y→pg-boss / N→BullMQ
Q7 限流→token bucket
```

## §文档生成

| 候选 | ring | 立场 | 触发 |
|---|---|---|---|
| @react-pdf/renderer | adopt | React 范式 PDF | TS 中复杂模板 |
| pdfkit | trial | 像素级原语 | 低级控制 |
| puppeteer | trial | HTML→PDF | pixel-perfect |
| docxtemplater | trial | DOCX 模板 | Word 输出 |
| pandoc-binding | assess | 多格式 server | 后端转换 |

**ADR-6 PDF @rpdf** (vendor-selection)
- ctx: 报告 PDF 模板中等，月 100 份
- dec: @rpdf 主；puppeteer 兜底
- alt: pdfkit（低级）；docxtemplater（非 PDF）
- con: React 范式快；CSS 子集受限

## §通知

| 候选 | ring | 立场 | 触发 |
|---|---|---|---|
| Resend | adopt | DX 友好邮件 | TS 团队 |
| Postmark | trial | 高送达 | 事务邮 |
| SES | trial | AWS 廉价 | 大量 |
| Twilio | adopt | SMS 全球 | 短信 |
| OneSignal | trial | Push 多端 | 移动 |
| Pusher | trial | 实时 channel | WS |
| Webhook 自托 | adopt | HTTP POST | 集成 |

**ADR-7 通知** (vendor-selection)
- ctx: 邮件+短信+webhook，月 <10k
- dec: 邮件 Resend；短信 Twilio；webhook 自托
- alt: Postmark（陡）；SES（DX 弱）
- con: DX 优先；切换迁模板

## 外迁 excludes

- sources / reading_list / getting_started / what_is_not 各 stub
