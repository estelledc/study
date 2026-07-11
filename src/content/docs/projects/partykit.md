---
title: 'PartyKit — Cloudflare Durable Objects 上的实时协作 framework'
来源: 'https://github.com/partykit/partykit'
日期: 2026-05-30
分类: 基础设施
难度: 中级
---

## 是什么

PartyKit 是一个**专门用来写"多人实时房间"的 framework**——白板、协同光标、聊天室、在线状态、小型实时游戏，写起来就像写一个普通的 HTTP 路由。

日常类比：你想开一家网吧，传统做法要租机房、买交换机、雇网管、写排队系统。PartyKit 像是一个"只交押金就给你一间会议室"的服务——你只管定"进门规则"和"传话规则"，房间本身（人在哪台机器、消息怎么转发、断线怎么续）平台帮你管。

底层是 **Cloudflare Durable Objects**：每个"房间"对应一个全球唯一的 actor，状态只在这一个点上写，但全世界任何节点都可以连进来。它让"实时单点一致性"变得便宜。

## 为什么重要

你想做一个"多人光标白板"，自己从零搭要解决：

- WebSocket 网关怎么扩容（一个房间的人必须落到同一台机器，否则消息广播得跨进程）
- 状态放哪（Redis Pubsub？自建 Node 集群？数据库？）
- 全球延迟（用户在新加坡，机器在弗吉尼亚，光速也要 200ms）
- 断线重连、房间销毁、冷启动持久化……

PartyKit 把这些全部包进 **"写一个 PartyServer 类"** 这一个动作。代价是把自己绑在 Cloudflare Workers/Durable Objects 生态里。2024 年它被 Cloudflare 收购，变成官方协作框架。

## 核心要点

**1. 一个房间 = 一个 Durable Object 实例**

```ts
export default class MyRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}
  onConnect(conn: Party.Connection) { /* 有人进来 */ }
  onMessage(msg: string, sender: Party.Connection) {
    this.room.broadcast(msg, [sender.id]) // 广播给除自己外所有人
  }
}
```

类比：`Party.Room` 是这个会议室的"房间号 + 当前在场名单 + 黑板"，`Party.Connection` 是每个进来的人。

**2. 路由 = 房间 ID**

`https://my-app.partykit.dev/parties/main/<roomId>` 这个 URL 自动路由到 `roomId` 对应的 DO 实例。第一次访问就启动，没人时回收。

**3. 持久化在房间内**

`this.room.storage.put("doc", state)` 直接写在房间本地——不需要外部数据库，DO 自带 KV。重启从 storage 读回。

**4. 不是只能 WebSocket**

PartyServer 也能接 HTTP（`onRequest`）和定时器（`alarm()`）。你可以把它当成"带状态的小 Worker"。

## 实践案例

### 案例 1：和 [[yjs]] 配合做协同文档

PartyKit 不自己做 CRDT，但提供 `y-partykit` adapter：

```ts
import { onConnect } from "y-partykit"
export default class YjsRoom {
  async onConnect(conn, room) {
    return onConnect(conn, room, { persist: true })
  }
}
```

逐步读：① 有人连上房间就交给 `onConnect`；② `persist: true` 把 Yjs 文档写进房间 storage；③ 客户端用 `y-partykit/provider` 替换 `y-websocket`。Yjs 管"两份 JSON 怎么合并"，PartyKit 管"消息怎么到达每个人 + 文档存哪里"。

### 案例 2：最简单的"在线人数"房间

```ts
export default class Counter implements Party.Server {
  count = 0
  constructor(readonly room: Party.Room) {}
  onConnect() {
    this.count++
    this.room.broadcast(JSON.stringify({ count: this.count }))
  }
  onClose() {
    this.count--
    this.room.broadcast(JSON.stringify({ count: this.count }))
  }
}
```

20 行实现全球同步的"当前在线人数"。换成传统架构，至少要一个 Redis + 一个 WS 网关 + 心跳逻辑。

### 案例 3：和 Liveblocks / ShareDB 怎么选

| 维度 | PartyKit | Liveblocks | ShareDB |
|------|----------|------------|---------|
| 抽象 | 你写 onMessage | presence/storage 现成 | OT + 自托管 Node |
| 部署 | 自己的 Cloudflare 账号 | 全托管 SaaS | 自建集群 |
| 退路 | 就是 Workers DO | 锁平台 | 运维重 |

要快速做产品功能选 Liveblocks；要可控、能下沉到底层选 PartyKit；不能绑 Cloudflare 再看 ShareDB / 自建 Yjs。


## 踩过的坑

1. **DO 是单点**：一个房间所有写都串行到一个进程。游戏每秒 1000 条事件、房间 500 人时 CPU 会顶到 50ms 限额。文档 / 白板 / 聊天没问题，高频 OLTP 不要硬塞。

2. **`broadcast` 不是真广播**：每个连接独立 send，房间 1000 人时一次 broadcast 是 1000 次 send。大房间需要"分桶"或上 PubSub 兜底。

3. **冷启动延迟**：DO 首次访问要冷启 actor，~50-200ms。空房间预热可以靠 cron 定时 ping。

4. **本地开发和生产行为不一致**：`partykit dev` 单机起一个 server，没真正模拟 DO 的"全球单点"约束。多 tab 测协同没问题，跨区域测一定要部署到 partykit.dev。

5. **被 Cloudflare 收购后路线图绑死 Workers**：独立 partykit npm 还能用，但新 feature 都向 `cloudflare:workers` 的 DO API 靠拢。新项目可以直接用 Workers + DO + WebSocket Hibernation，省一层抽象。

## 适用 vs 不适用场景

**适用**：
- 协同光标 / 在线状态 / 实时白板 / 多人聊天 / 简单实时游戏
- 已经在 Cloudflare 生态（Workers / Pages / R2）
- 想避开自建 WS 网关 + Redis Pubsub 的运维负担

**不适用**：
- 单房间高频写（>100 ops/s 持续）→ 用消息队列 + 分片
- 需要严格强一致跨房间事务 → 用真正的数据库（Postgres / Spanner）
- 不能依赖 Cloudflare（合规 / 多云策略） → 选 ShareDB / 自建 Yjs server

## 历史小故事（可跳过）

- **2023 年初**：Sunil Pai（前 React core team）观察到"实时协作功能"是每个 SaaS 都想加但都做不好的事。他做了 PartyKit 的第一版，主张"应该和写一个 React 组件一样简单"。
- **2023 年中**：开源后快速积累 1k+ stars，社区催生 y-partykit、partysocket 等周边。
- **2024 年 4 月**：Cloudflare 宣布收购 PartyKit。Sunil Pai 加入 Cloudflare 团队，PartyKit 继续以独立品牌运营，但路线图开始与 Cloudflare Workers / Durable Objects / Hibernation API 深度对齐。
- **意义**：证明了"edge runtime + 单点 actor"是实时协作的可行底座；也意味着这种 framework 长期会下沉成平台原语。

## 学到什么

1. **"一个房间一个 actor"是个被低估的模型**：解决了"实时多人"最难的状态分片问题
2. **DX-first 的 framework 价值在"消除决策"**：不让你选 Redis vs Pubsub vs Kafka，而是直接给你写一个类
3. **被巨头收购后，独立 framework 通常变薄**：能力沉到平台原语里，框架本身退化成"教学包装"

## 延伸阅读

- 官方文档：[docs.partykit.io](https://docs.partykit.io)（看 Concepts → Rooms 这一章就懂模型）
- Sunil Pai 演讲：[The Future of Real-Time Apps](https://www.youtube.com/results?search_query=sunil+pai+partykit)（讲为什么从 React 跑去做 framework）
- Cloudflare 收购公告：解释了为什么 DO + Hibernation 是更彻底的底座
- 进阶题目：自己实现一个"会议室白板"——光标用 broadcast，画笔轨迹用 Yjs 文档，同时跑通

## 关联

- [[yjs]] —— PartyKit 最常见的搭档：Yjs 管 CRDT 合并，PartyKit 管房间和持久化
- [[automerge]] —— 另一种 CRDT 选择，automerge-repo 也能跑在 PartyKit 上
- [[liveblocks]] —— 同类竞品，更产品化、更托管；PartyKit 更底层、更可控
- [[sharedb]] —— 老牌 OT 方案，自托管 Node；和 PartyKit 是两条工程路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
