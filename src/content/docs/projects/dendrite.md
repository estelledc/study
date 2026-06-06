---
title: Dendrite — Go 写的第二代 Matrix homeserver，组件可拆可合
来源: 'https://github.com/element-hq/dendrite'
日期: 2026-05-30
子分类: 实时通信
分类: 通信
难度: 中级
provenance: pipeline-v3
---

## 是什么

Dendrite 是 **Matrix 协议**的另一种 homeserver 实现——用 **Go** 写，组件化架构。日常类比：[[synapse]] 像"全功能但臃肿的国营大邮局"（Python 多进程 + PG + Redis），[[conduit]] 像"村口邮政代办点"（Rust 单二进制 + 嵌入式 KV），Dendrite 居中——像"现代化的连锁邮政"，柜台、分拣、长途运输每一环都有清晰边界，需要时整体打包成一台机器跑（monolith），需要时拆到不同机房分别扩容（polylith）。

最小启动：

```bash
docker run -d --name dendrite \
  -v ~/dendrite-data:/etc/dendrite \
  -p 8008:8008 -p 8448:8448 \
  matrixdotorg/dendrite-monolith:latest
```

底层数据库可以选 [[postgresql]]（推荐，多用户）或 SQLite（玩具规模）。组件之间用 NATS JetStream 传消息。

## 为什么重要

- 不理解 Dendrite，就解释不清"同一个 Matrix 协议为什么会有三种活跃实现"——选型靠的是组件粒度 + 运维门槛 + 性能
- 它示范了 **Go + 组件化** 怎么在重协议（Matrix 联邦极复杂）下兼顾"易部署"和"可扩展"
- 比 [[synapse]] 内存占用低 50-70%，冷启动快——是政府 / 教育机构低预算自托管的常见选项
- 看清"参考实现 vs 重写实现"的权衡——重写永远要追赶规范，而规范一直在长

## 核心要点

Dendrite 的设计可以拆成 **三件事**：

1. **8 个组件 + 清晰接口**：`clientapi`（客户端 API）/ `federationapi`（服务器联邦）/ `roomserver`（房间状态权威）/ `syncapi`（长轮询同步）/ `userapi`（账户）/ `mediaapi`（媒体）/ `appservice`（机器人桥接）/ `relayapi`。每个组件有自己的 Go interface，monolith 模式下走本地函数调用，polylith 模式下走 [[grpc-go]] / NATS 跨进程。

2. **roomserver 是状态权威**：Matrix 的房间状态是 DAG（同 [[synapse]] 的核心模型），Dendrite 把"DAG 算法 + state resolution v2"集中在 roomserver 一个组件里。其他组件查状态都问它，避免分布式状态机一致性问题——把难题集中而不是散开。

3. **monolith vs polylith 切换零代价**：同一份 Go 二进制，配置文件改 `polylith: true` 就拆成多进程。日常类比：像 [[go-zero]] 的微服务模板——本地单进程开发，上生产改一行配置就拆开。Conduit 没有这种切换，Synapse 拆 worker 要改一堆配置 + Redis 总线。

## 实践案例

### 案例 1：单二进制 monolith 跑小公司 IM

20-100 人的工作室直接跑 monolith，比 Synapse 省一半内存：

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: dendrite
  dendrite:
    image: matrixdotorg/dendrite-monolith:latest
    volumes: ["./config:/etc/dendrite"]
    environment:
      DENDRITE_SERVER_NAME: chat.example.com
    ports: ["8008:8008", "8448:8448"]
    depends_on: [postgres]
```

跑起来 ~200MB 常驻内存（同等用户量下 Synapse 通常 600MB-1GB）。Element Web 客户端连上即可联邦聊天。

### 案例 2：polylith 拆 federationapi 单独扩

加入了几个万人房间后，联邦流量突发——`federationapi` CPU 单跑 70%。polylith 模式下把它单独拎出来扩到 3 副本：

```yaml
# polylith 模式片段（节选）
federation_api:
  internal_api:
    listen: http://0.0.0.0:7772
    connect: http://federation-api:7772
  external_api:
    listen: http://0.0.0.0:8072
```

`roomserver` 仍然单实例（状态权威不能多写），`federationapi` / `syncapi` 各自水平扩。负载均衡用 [[nginx]] 或 [[haproxy]] 按路径分发。

### 案例 3：嵌入式 P2P 节点（实验性）

Dendrite 有一个独门绝技——**P2P pinecone 模式**，把 homeserver 编进手机/浏览器，节点之间走 WebRTC + libp2p 直连，不需要中心服务器：

```bash
# 桌面 P2P demo
go run ./cmd/dendrite-demo-pinecone --listen :8008
```

这是 Matrix.org 探索"完全去中心化 IM"的方向——每个用户自己就是 homeserver。生产慎用，但理解 P2P-friendly 架构这是宝贵实验材料。

## 踩过的坑

1. **维护模式（2024 起）**：Element 把人力集中回 [[synapse]] + Element X 客户端，Dendrite 只接安全修复，**不再补新协议特性**。选型前必读官方仓库 README——别拿"未来会补齐"作假设。

2. **Element X 客户端体验降级**：新一代官方客户端 Element X 依赖 MSC4186 (Sliding Sync) 和 MSC3861 (OIDC)，Dendrite 没实现。结果：用 Element X 连 Dendrite，能用但启动慢、消息延迟高。**给用户用 Element Web/Desktop 才是完整体验**。

3. **SQLite 只能跑玩具**：默认配置可以选 SQLite，单房间单用户测试很方便。但联邦一开就锁竞争——多个组件写同一个 SQLite 文件 → "database is locked"。**生产必须切 PostgreSQL**，新手第一次部署最常翻这个坑。

4. **polylith 文档稀缺**：组件可拆是卖点，但生产部署里负载均衡规则、NATS 集群配置、组件间 mTLS 只在 GitHub issue 里散落讨论，没有官方一键脚本。准备 polylith 上线要预留 1-2 周踩坑时间。

## 适用 vs 不适用场景

**适用**：

- 中小团队（10-数百用户）自托管 Matrix，预算受限想省内存
- 需要组件化扩展灵活性（联邦突发流量场景）
- 研究 P2P / 去中心化 IM 的实验环境
- Go 后端团队，想用熟悉语言改协议或加自定义组件

**不适用**：

- 千人以上的生产 Matrix 部署 → 用 [[synapse]] worker 拆分（更成熟）
- 需要 Element X 客户端完整体验 → 必须 Synapse（MSC4186/3861）
- 极简单二进制偏好 → 用 [[conduit]] 更彻底（无 PG 依赖）
- 需要长期协议特性跟进 → Dendrite 维护模式靠不住

## 历史小故事（可跳过）

- **2017 年**：Matrix.org 团队启动 Dendrite，目标是用 Go 重写一个比 Synapse 更省资源、可水平扩展的 homeserver
- **2020 年**：首个公开 beta release，组件化架构成型——8 大组件 + monolith/polylith 双模式
- **2022 年**：协议合规度（Sytest / Complement 通过率）追上 Synapse 大部分功能，开始有公司生产部署
- **2023 年**：Element 重组，仓库迁到 `element-hq/dendrite`，license 切 AGPL-3.0（同 Synapse）；社区分叉讨论再起
- **2024 年**：Element 宣布 Dendrite 进入"维护模式"——只接安全修复，主力回到 Synapse 和 Element X 客户端；新协议特性（sliding sync、OIDC）不会进 Dendrite

## 学到什么

1. **组件化 + monolith/polylith 双模** 是处理"小用户也能跑、大用户可扩展"的好答案——同一份代码两种部署形态，比 Synapse 拆 worker 自然得多
2. **Go 重写 Python 服务** 内存收益可观（50-70%），但代价是协议追赶——Synapse 一旦进入新规范，重写实现要再实现一次
3. **roomserver 集中状态** 比"多组件各自管状态"简单得多——分布式状态机一致性的难题用"集中再扩"绕开
4. **维护模式是开源里的诚实信号**——明确告诉用户"未来不再追新特性"比"装作还在迭代"更负责
5. **P2P 实验** 是 Matrix 重要资产——Dendrite 嵌入式模式让"每个用户即 homeserver"变得可能，长期是去中心化 IM 的方向

## 延伸阅读

- 官方仓库：[element-hq/dendrite](https://github.com/element-hq/dendrite)（README + docs/ 部署指南 + 架构图）
- Matrix 协议规范：[Matrix Spec](https://spec.matrix.org/)（Client-Server / Server-Server / Application Service 三大块）
- 组件架构图：[dendrite docs/architecture](https://element-hq.github.io/dendrite/architecture)（8 组件之间数据流）
- P2P pinecone 实验：[matrix-org/pinecone](https://github.com/matrix-org/pinecone)（覆盖网络路由协议）
- 性能对比：社区 benchmark — Dendrite vs Synapse vs Conduit 内存 / 吞吐对比报告
- 替代实现：[[synapse]]（Python 参考实现）、[[conduit]]（Rust 极简单二进制）

## 关联

- [[synapse]] —— Matrix 参考 homeserver，Python 多进程；Dendrite 是它的 Go 重写候选
- [[conduit]] —— Rust 单二进制实现；Dendrite 居中，组件化但仍可单进程
- [[postgresql]] —— Dendrite 推荐的存储后端，roomserver 状态依赖 PG 行级锁
- [[grpc-go]] —— polylith 模式下组件间通信的实现框架
- [[nats]] —— Dendrite 组件之间的消息总线，JetStream 持久化事件流
- [[go-zero]] —— 同样 Go + 组件化思路；可对照看微服务模板与 Matrix homeserver 怎么各自抽象
- [[nginx]] —— 生产 polylith 部署的反向代理首选，按路径分发到各组件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[conduit]] —— Conduit — Rust 写的极简 Matrix homeserver，单二进制 + 嵌入式数据库
- [[element-android]] —— Element Android — Matrix 协议官方 Android 客户端（Kotlin + Realm）
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[grpc-go]] —— gRPC-Go — Google RPC 框架的官方 Go 实现
- [[haproxy]] —— HAProxy — 高性能 LB，TCP/HTTP 双层负载均衡
- [[matrix-js-sdk]] —— matrix-js-sdk — Matrix Web/Node 端的"老大哥"客户端 SDK
- [[matrix-rust-sdk]] —— matrix-rust-sdk — Matrix 客户端的"共享发动机"
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[signal-server]] —— Signal-Server — 服务端看不到任何明文的即时通信后端
- [[synapse]] —— Synapse — Matrix 协议的参考 homeserver，让聊天像电邮一样能跨服务器互通

