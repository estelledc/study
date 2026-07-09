---
title: 项目候选 — 后端 / API / 微服务
日期: 2026-05-29
---

# 后端 / API / 微服务 项目候选

候选 70 个，按子类分组（Python Web 8 / Go Web 7 / Rust Web 7 / Java/Kotlin 7 / Ruby 4 / PHP 3 / .NET 2 / Elixir 2 / API 网关 8 / gRPC/RPC 5 / GraphQL 5 / Realtime 4 / Job Queue/Workflow 5 / BaaS / Edge 3）。

现有 atlas Web 框架仅覆盖 Node 系 6 条（hono / fastify / express / koa / nestjs / elysia）+ supabase 一个 BaaS。本表 70 条全部为多语言后端 / 多类目，与 161 个现有 atlas 条目、`projects-cli.md` / `projects-devops.md` / `projects-databases.md` 已收清单互斥，不复用任何 slug。

Stars 量级为 2025-2026 区间近似值，仅作影响力参考；候选门槛 ≥ 1.5k stars（少数协议主体如 envoy、grpc 远超）。

## 子类分布

| 子类 | 数量 |
|---|---:|
| [Python Web](#1-python-web) | 8 |
| [Go Web](#2-go-web) | 7 |
| [Rust Web](#3-rust-web) | 7 |
| [Java / Kotlin](#4-java--kotlin) | 7 |
| [Ruby](#5-ruby) | 4 |
| [PHP](#6-php) | 3 |
| [.NET](#7-net) | 2 |
| [Elixir](#8-elixir) | 2 |
| [API 网关 / 反向代理](#9-api-网关--反向代理) | 8 |
| [gRPC / RPC](#10-grpc--rpc) | 5 |
| [GraphQL](#11-graphql) | 5 |
| [Realtime / WebSocket](#12-realtime--websocket) | 4 |
| [Job Queue / Workflow](#13-job-queue--workflow) | 5 |
| [BaaS / Edge Compute](#14-baas--edge-compute) | 3 |

---

## 1. Python Web

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| fastapi | FastAPI | 类型驱动 ASGI 框架，Pydantic 自动校验 + OpenAPI 自动生成，2020 后 Python 后端事实新标准 | 80k | https://github.com/fastapi/fastapi |
| flask | Flask | 轻量 WSGI 微框架，extension 生态最广，"装饰器 + 蓝图"教学范本 | 68k | https://github.com/pallets/flask |
| django | Django | 全功能 batteries-included 框架，自带 ORM / Admin / Auth，Instagram / Pinterest 出身 | 80k | https://github.com/django/django |
| starlette | Starlette | 11k | Pure ASGI toolkit，FastAPI 的底座，~3k 行精读级代码 | https://github.com/encode/starlette |
| sanic | Sanic | 性能向 async Python 框架，对标 Node.js 高吞吐 | 18k | https://github.com/sanic-org/sanic |
| litestar | Litestar | 类型驱动 ASGI 框架（原 Starlite），DI + 性能 + 文档三优 | 6.5k | https://github.com/litestar-org/litestar |
| quart | Quart | Flask 完全 async 移植，API 同源 + ASGI 后端 | 3.3k | https://github.com/pallets/quart |
| robyn | Robyn | Rust 内核 + Python API，多进程 actor 模型 | 4.5k | https://github.com/sparckles/Robyn |

## 2. Go Web

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| gin | Gin | 最流行 Go web 框架，httprouter + middleware chain | 80k | https://github.com/gin-gonic/gin |
| echo | Echo | 极简高性能 Go 框架，路由 + 中间件 + JWT 内置 | 31k | https://github.com/labstack/echo |
| fiber | Fiber | fasthttp 包装，Express-like API + 零拷贝 | 35k | https://github.com/gofiber/fiber |
| chi | chi | net/http 兼容 router，轻量 + 标准库友好 | 19k | https://github.com/go-chi/chi |
| kratos | go-kratos | B 站微服务框架，gRPC + HTTP + 服务发现一体 | 24k | https://github.com/go-kratos/kratos |
| go-zero | go-zero | 字节系微服务框架，自带代码生成 + 网关 + 限流 | 30k | https://github.com/zeromicro/go-zero |
| encore | Encore | 类型安全 Go backend framework，infrastructure 即代码 | 10k | https://github.com/encoredev/encore |

## 3. Rust Web

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| actix-web | Actix Web | Actor 模型 web 框架，Tokio 之上吞吐冠军 | 23k | https://github.com/actix/actix-web |
| axum | axum | tower 生态 web 框架，类型驱动 extractor + handler 推导 | 23k | https://github.com/tokio-rs/axum |
| rocket | Rocket | 类型 / 宏 DSL 驱动，过去 nightly 王者，stable 后回归 | 25k | https://github.com/rwf2/Rocket |
| warp | warp | filter 函数式组合，类型推导路由 | 10k | https://github.com/seanmonstar/warp |
| poem | poem | 全功能 Rust web 框架，对标 actix-web，OpenAPI 一键生成 | 4k | https://github.com/poem-web/poem |
| tide | tide | async-std 团队的 koa-like 框架（已归档但仍是教学范本） | 5k | https://github.com/http-rs/tide |
| salvo | Salvo | 树状 router + middleware，国产 Rust web 框架 | 3.5k | https://github.com/salvo-rs/salvo |

## 4. Java / Kotlin

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| spring-boot | Spring Boot | 事实标准 Java 应用框架，Spring 全家桶 starter 自动装配 | 76k | https://github.com/spring-projects/spring-boot |
| quarkus | Quarkus | Red Hat 出品云原生 Java，GraalVM AOT + 启动毫秒级 | 14k | https://github.com/quarkusio/quarkus |
| micronaut | Micronaut | AOT 编译 Java/Kotlin/Groovy，0 反射 + 低内存 | 6.5k | https://github.com/micronaut-projects/micronaut-core |
| vertx | Vert.x | Eclipse 多语言 reactive toolkit，事件总线 + verticle 模型 | 14k | https://github.com/eclipse-vertx/vert.x |
| ktor | Ktor | JetBrains Kotlin 异步 server + client，DSL 配置 | 13k | https://github.com/ktorio/ktor |
| helidon | Helidon | Oracle MicroProfile 实现，Helidon Nima 虚拟线程内核 | 3.5k | https://github.com/helidon-io/helidon |
| dropwizard | Dropwizard | Coda Hale 出品 Java 12-factor microservice 起步包，metrics 是分支教科书 | 8.5k | https://github.com/dropwizard/dropwizard |

## 5. Ruby

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| rails | Ruby on Rails | DHH 起家全栈框架，convention over configuration 教科书 | 57k | https://github.com/rails/rails |
| sinatra | Sinatra | 极简 Ruby DSL web 框架，"3 行起一个 API" | 12k | https://github.com/sinatra/sinatra |
| hanami | Hanami | 模块化 Ruby 框架，DDD-friendly + dry-rb 生态 | 3.5k | https://github.com/hanami/hanami |
| grape | Grape | Ruby REST API DSL，可挂载在 Rails / Sinatra 旁专做 API | 10k | https://github.com/ruby-grape/grape |

## 6. PHP

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| laravel | Laravel | 现代 PHP 全栈框架，Eloquent + Blade + Artisan 三件套 | 80k | https://github.com/laravel/laravel |
| symfony | Symfony | 组件化 PHP 框架，Laravel 内核 + Drupal 后端皆基于此 | 30k | https://github.com/symfony/symfony |
| slim-framework | Slim | PHP micro 框架，PSR-7 / PSR-15 事实标杆 | 12k | https://github.com/slimphp/Slim |

## 7. .NET

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| aspnetcore | ASP.NET Core | 微软 .NET 跨平台 web 框架，minimal API + Kestrel 服务器 | 36k | https://github.com/dotnet/aspnetcore |
| orleans | Microsoft Orleans | 分布式 virtual actor framework，Halo / Skype 后端原型 | 10k | https://github.com/dotnet/orleans |

## 8. Elixir

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| phoenix | Phoenix | Elixir/OTP web 框架，LiveView 实时渲染 + BEAM 多核 | 22k | https://github.com/phoenixframework/phoenix |
| plug | Plug | Elixir HTTP middleware 协议，Phoenix 底座 | 3k | https://github.com/elixir-plug/plug |

## 9. API 网关 / 反向代理

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| nginx | NGINX | 主流 LB / reverse proxy / 静态服务器，事件驱动 C 实现 | 26k | https://github.com/nginx/nginx |
| haproxy | HAProxy | 高性能 LB，TCP/HTTP 双层负载均衡，云上百万并发 | 5.5k | https://github.com/haproxy/haproxy |
| caddy | Caddy | Go 写的自动 HTTPS 全栈服务器，配置即 Caddyfile | 64k | https://github.com/caddyserver/caddy |
| traefik | Traefik | 云原生反向代理，自动服务发现 + Docker / K8s 集成 | 57k | https://github.com/traefik/traefik |
| kong | Kong | nginx + lua 内核，企业级 API 网关 + plugin 生态 | 41k | https://github.com/Kong/kong |
| krakend | KrakenD | 高性能 Go API 网关，无状态 + 声明式 endpoint 配置 | 10k | https://github.com/krakend/krakend-ce |
| tyk | Tyk | Go 实现开源 + 商业混合 API 网关，自带 portal | 10k | https://github.com/TykTechnologies/tyk |
| envoy | Envoy | CNCF 服务网格数据面，C++ 实现 + xDS 控制协议 | 26k | https://github.com/envoyproxy/envoy |

## 10. gRPC / RPC

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| grpc-go | gRPC-Go | gRPC 官方 Go 实现，HTTP/2 + protobuf | 22k | https://github.com/grpc/grpc-go |
| connect-rpc | ConnectRPC | Buf 团队的 gRPC + REST 混合协议，多语言 SDK | 9k | https://github.com/connectrpc/connect-go |
| twirp | Twirp | Twitch 出品 simple gRPC 替代，protobuf + JSON / HTTP1.1 | 7.5k | https://github.com/twitchtv/twirp |
| thrift | Apache Thrift | Facebook 起家多语言 RPC，IDL + 跨 12 种语言 codegen | 11k | https://github.com/apache/thrift |
| capnproto | Cap'n Proto | 零拷贝序列化 + RPC，Sandstorm 创始人 Kenton Varda 作品 | 12k | https://github.com/capnproto/capnproto |

## 11. GraphQL

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| apollo-server | Apollo Server | GraphQL server 事实标准，Apollo 全家桶服务端 | 14k | https://github.com/apollographql/apollo-server |
| graphql-yoga | GraphQL Yoga | The Guild 出品轻量 GraphQL server，Envelop plugin 系统 | 8.5k | https://github.com/dotansimha/graphql-yoga |
| gqlgen | gqlgen | Go 类型驱动 GraphQL server，code-first 生成 | 10k | https://github.com/99designs/gqlgen |
| strawberry | Strawberry GraphQL | Python type-hint 驱动 GraphQL，Pydantic 友好 | 4.5k | https://github.com/strawberry-graphql/strawberry |
| hot-chocolate | HotChocolate | ChilliCream .NET GraphQL server，code-first + DataLoader | 5.5k | https://github.com/ChilliCream/graphql-platform |

## 12. Realtime / WebSocket

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| socket-io | Socket.IO | 跨浏览器实时通信库，自动 fallback 到 long-polling，老牌一线 | 62k | https://github.com/socketio/socket.io |
| centrifugo | Centrifugo | Go 写的 pub/sub realtime server，水平可扩展 + JWT auth | 9k | https://github.com/centrifugal/centrifugo |
| soketi | Soketi | Pusher 协议兼容的 Node 实现，开源自托管替代 | 5.5k | https://github.com/soketi/soketi |
| hocuspocus | Hocuspocus | Yjs 官方协作后端，websocket + auth + persistence | 2k | https://github.com/ueberdosis/hocuspocus |

## 13. Job Queue / Workflow

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| bullmq | BullMQ | Redis-based Node 任务队列，Bull 下一代 + TS rewrite | 6.5k | https://github.com/taskforcesh/bullmq |
| sidekiq | Sidekiq | Ruby 任务队列事实标准，Redis + 多线程 | 13k | https://github.com/sidekiq/sidekiq |
| celery | Celery | Python 异步任务队列，broker 解耦 + chord/group/chain DSL | 25k | https://github.com/celery/celery |
| asynq | asynq | Go 任务队列，Redis-based + retry / scheduling / rate-limit | 10k | https://github.com/hibiken/asynq |
| temporal | Temporal | 分布式工作流引擎，durable execution + multi-language SDK | 13k | https://github.com/temporalio/temporal |

## 14. BaaS / Edge Compute

| slug | 项目 | 一句话定位 | stars (≈) | GitHub |
|---|---|---|---:|---|
| appwrite | Appwrite | 开源 Firebase 替代，Auth / DB / Storage / Functions 一体 | 46k | https://github.com/appwrite/appwrite |
| pocketbase | PocketBase | 单 Go 二进制 BaaS，SQLite + 实时订阅 + Auth + Admin UI | 45k | https://github.com/pocketbase/pocketbase |
| spin | Spin (Fermyon) | WebAssembly serverless framework，Wasm 模块当 handler | 6.5k | https://github.com/spinframework/spin |

---

## 备注

- 已规避：atlas 现有 Web 框架 6 条（hono / fastify / express / koa / nestjs / elysia）、`supabase`，以及 ORM 已收 8 条（drizzle / kysely / typeorm / sequelize / prisma / postgres-js / mikro-orm / duckdb-wasm）。
- 已规避：`projects-cli.md` / `projects-devops.md` / `projects-databases.md` 全部 slug（含 istio / linkerd2 / argo-workflows / argocd / k6 / locust / kubernetes 等）。
- gorilla/mux、buffalo、lumen、phalcon、nancyfx、parse-server、rethinkdb、cadence、faktory 等已归档 / 显著衰退项目未纳入；如需补足可二次扩展。
- 红线词扫描：未出现任何业务 / 公司内部词。
