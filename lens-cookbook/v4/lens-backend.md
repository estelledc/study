---
schema_version: 4
lens_id: backend
title: lens-backend
domain: lens
layer: app
owner: jason
verified_at: 2026-05-31
review_quarter: 2026Q2
total_budget_chars: 3000
hardware_assumption: 单 region 起步；Node 18+/Py 3.11+/Go 1.22+/Rust 2026
ring_summary: { adopt: 9, trial: 7, assess: 1, hold: 4 }
excludes: [glossary, sources+reading_list, getting_started, what_is_not]
provider_coverage_checklist:
  - Node (Fastify / Hono / Drizzle / BullMQ / pg-boss)
  - Python (FastAPI + SQLAlchemy 2.x + Celery)
  - Go (Gin / sqlc / River / pgx)
  - Rust (Axum / SQLx + Tower)
  - 托管 (Supabase / Neon / Upstash / Clerk)
sources:
  - postgresql.org / orm.drizzle.team / sqlalchemy.org
  - docs.bullmq.io / pg-boss / River / temporal.io
  - oauth.net 2.1 draft / RFC 7636 PKCE
  - hono.dev / fastify.dev / fastapi.tiangolo.com / docs.rs/axum
  - redis-cell GCRA / Stripe rate limiter blog
open_questions:
  - PG-backed queue 吞吐天花板基准散乱
  - tRPC 跨仓 schema 演化协商工具链不熟
  - drizzle-kit auto-diff vs 手写边界
  - Edge runtime PG 连接演化中
  - OAuth2 在 AI agent 代调场景无共识
  - K8s SIGTERM 下队列在途任务无统一 pattern
---

## 1. 选型铁律

1. 默认 Postgres；JSONB 吃漂移
2. Web 用 server session；JWT 仅机机
3. 队列 <1k jobs/s 优先 PG-backed
4. TS 用 Drizzle，Py 用 SQLAlchemy 2.x
5. 限流默认 token bucket，精度换 GCRA
6. 对外 REST；TS tRPC；跨语言 gRPC

## 2. 候选表

verified 2026-05-31。layer 全部 = app。

| 候选 | ring | 立场 | 触发条件 | layer |
|---|---|---|---|---|
| Postgres | adopt | 主库默认 | 事务+JSON+pgvector | app |
| SQLite | adopt | 边缘 | 单机本地 | app |
| MySQL | trial | 历史栈 | 既有运维 | app |
| Redis | adopt | KV/队列 | 跨实例缓存 | app |
| Valkey | trial | Redis 替代 | RSAL 规避 | app |
| Drizzle | adopt | TS ORM | 类型贴 SQL | app |
| SQLAlchemy 2.x | adopt | Py ORM | async+typed | app |
| Prisma | trial | 既有维护 | 非 edge | app |
| FastAPI | adopt | Py 框架 | pydantic+OAS | app |
| Fastify | adopt | Node 框架 | 性能+插件 | app |
| Hono | trial | Edge | Workers/Bun | app |
| Axum | trial | Rust | Tower 生态 | app |
| Server session | adopt | Web 鉴权 | 撤销简单 | app |
| OAuth2 | adopt | SSO | 第三方接入 | app |
| JWT | trial | 机机 token | 无状态需求 | app |
| pg-boss/River | trial | PG 队列 | <1k jobs/s | app |
| BullMQ | adopt | Node 队列 | 高吞吐 | app |
| Celery | adopt | Py 队列 | 工业默认 | app |
| token bucket | adopt | 限流默认 | 突发友好 | app |
| GCRA | trial | 限流升级 | 单 key O(1) | app |
| CockroachDB | assess | 跨 region | PG 协议多区 | app |

hold：TypeORM / Lucia / Memcached / fixed window / MongoDB / sqlc。

## 3. 迷你 ADR

**ADR-1 主库 Postgres** (vendor-selection)
## context
读写中等量，需事务+JSON+全文+向量。MySQL 是惯性，Mongo 因漂移被点名。
## decision
默认 Postgres 单实例；Mongo 不进。
## alternatives
MySQL（拒：JSON/向量弱）；Mongo（拒：事务弱）；Cockroach（拒：跨 region 才需）。
## consequences
pg 生态（pgvector/pg_partman）一处覆盖；JSONB 吃漂移；扩瓶颈拆 distributed-data lens；零锁定。

**ADR-2 鉴权 server session** (architecture)
## context
要求掉用户、改密码即下线、查设备。JWT 撤销靠黑名单等于退化成 session。
## decision
Web 用 cookie+server session；服务间短 JWT 或 mTLS。
## consequences
撤销 = 一行 SQL；多 region 需 store 复制；store 故障即全员掉线需 HA。
## rollback
触发 = store P0 故障 >30min；切 JWT+黑名单 Redis，1-2 周可平移。

**ADR-3 ORM TS 选 Drizzle** (vendor-selection)
## context
Prisma engine 重 edge 限；TypeORM 装饰器坑；Drizzle 类型贴 SQL。Py 用 SQLAlchemy 2.x。
## decision
新 TS 用 Drizzle；新 Py 用 SQLAlchemy 2.x。
## alternatives
Prisma（拒：edge 限+黑盒）；TypeORM（拒：装饰器坑）；Kysely（拒：缺迁移）。
## consequences
心智 = SQL；drizzle-kit auto-diff 简陋需补手写；edge 可跑；回滚需重写 DSL。

**ADR-4 限流 token bucket** (implementation-tuning)
## context
fixed window 边界双倍突刺；sliding window log 内存爆。需突发与精度间折中。
## decision
bucket_capacity = 100, refill_rate = 10/s, redis_ttl = 600。
## rationale
桶有 token 即过；Lua 原子化保多实例一致；GCRA 可平移，单 key O(1)。
## consequences
时钟漂移小偏差可接受；redis-cell 是模块需单装；切换 = 改 Lua 脚本。

## 4. 决策树

```
Q1 全栈 TS 内部？ Y→tRPC+Drizzle+PG / N→Q2
Q2 公网/跨语言？  公网→REST+OpenAPI / 跨语言→gRPC
Q3 需快速撤销？   Y→server session (ADR-2) / N→JWT
Q4 <1k jobs/s+PG？Y→pg-boss/River / N→BullMQ/Celery
Q5 限流？         公网→token bucket (ADR-4) / 内部→lru-cache
```

## 5. 缺口与待补

1. PG queue 吞吐天花板基准散乱
2. tRPC 跨仓 schema 演化协商不成熟
3. drizzle-kit auto-diff 在 enum/RLS 漏
4. Edge runtime PG 连接仍演化
5. OAuth2 在 AI agent 代调无共识
6. K8s SIGTERM 下队列在途任务无 pattern
