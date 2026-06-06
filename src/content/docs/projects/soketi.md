---
title: Soketi — 自己跑一台 Pusher，把实时通信费砍到零头
来源: 'https://github.com/soketi/soketi'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Soketi 是一个**开源、可自己部署的 WebSocket 服务器**，它"装得像 Pusher 商业服务"——客户端 SDK（pusher-js）一行不改，env 里把地址换成自家服务器就能用。日常类比：你在家自己装了台咖啡机，用的还是连锁店那个 App 下单，但豆子和电费由你出，月费从 49 美金降到 5 美金 VM 钱。

它的内核是：

- **协议层**：100% 兼容 Pusher 协议（subscribe / publish / presence-channel / private-channel）
- **传输层**：Node.js + uWebSockets.js（一个 C++ 写的 WebSocket 引擎，号称比 Socket.IO 快 10 倍）
- **扩展层**：单机内存表 / 多机靠 Redis pub/sub 互相广播

```bash
# 起一个 soketi（drop-in 替换 Pusher.com）
docker run -p 6001:6001 quay.io/soketi/soketi:latest
```

## 为什么重要

不理解 Soketi，下面这些事情很难讲清：

- 为什么"实时聊天 / 在线协作"的服务费可以从月付几百美金降到几美金 VM
- 为什么 Pusher 协议变成了"WebSocket 界的事实标准"——不是 Pusher 公司多牛，而是 SDK 生态太大
- 为什么 [[socket-io]] 和 Pusher 是两个生态——一个自定义协议给 Node 自家用，另一个面向多语言 SDK
- 为什么"自托管 SaaS 替代品"是 2020 年代开源圈的一个大主题（Plausible / Supabase / Soketi）

## 核心要点

理解 Soketi 抓 **三件事**：

1. **协议兼容是杀手锏**：自己写一个 WebSocket 服务器没难度，难的是让你**已经接好的** pusher-js / Laravel Echo / Pusher Android SDK 不改一行就能跨过来。Soketi 选择"协议级 drop-in"，于是用户迁移成本几乎为零。

2. **uWebSockets.js 撑性能**：这是个 C++ 原生模块，把 epoll/kqueue 直接 bind 给 Node。同样 1GB / 1CPU 的 VM，纯 JS 的 [[socket-io]] 大概撑几千连接，Soketi 能撑数万。代价是部署平台必须能跑原生 C++ binding。

3. **Redis adapter 撑横向扩展**：单实例足够时不用配 Redis；多实例时每个 Soketi 节点订阅 [[redis]] 的 pub/sub channel，A 节点收到消息就 publish 到 Redis，B / C 节点 subscribe 到再下发给自己客户端。

三件加起来，让 Soketi 在"开源 + 兼容主流协议 + 性能够"这三点上同时打满。

## 实践案例

### 案例 1：Laravel + Soketi 替换 Pusher 商业服务

Laravel Echo 默认用 Pusher 协议。换 Soketi 只改 `.env`：

```env
BROADCAST_DRIVER=pusher
PUSHER_APP_ID=app-id
PUSHER_APP_KEY=app-key
PUSHER_APP_SECRET=app-secret
PUSHER_HOST=soketi.your-server.com
PUSHER_PORT=6001
PUSHER_SCHEME=http
```

前端 `resources/js/echo.js` 不动一行：

```js
import Echo from 'laravel-echo'
window.Echo = new Echo({ broadcaster: 'pusher', key: 'app-key', wsHost: 'soketi.your-server.com', wsPort: 6001 })
Echo.channel('orders').listen('OrderShipped', (e) => console.log(e))
```

迁移耗时通常 30 分钟以内。

### 案例 2：3 节点 + Redis 撑 10 万连接

```yaml
# docker-compose.yml 简化版
services:
  redis: { image: redis:7 }
  soketi-1: { image: soketi/soketi, environment: { ADAPTER_DRIVER: redis, REDIS_HOST: redis } }
  soketi-2: { image: soketi/soketi, environment: { ADAPTER_DRIVER: redis, REDIS_HOST: redis } }
  soketi-3: { image: soketi/soketi, environment: { ADAPTER_DRIVER: redis, REDIS_HOST: redis } }
```

前面再挂一台 [[nginx]] 做 sticky session（同一客户端粘到同一节点，避免 reconnect 风暴），就能稳跑 10 万连接级。

### 案例 3：本地开发省掉 Pusher 测试账号

写实时功能时，本地启一个 Soketi：

```bash
npx @soketi/soketi start
# WebSocket 服务监听 6001 端口
```

前端把 host 指过去就能离线开发；CI 里跑 e2e 测试也不用真的发请求到 Pusher.com，省钱省额度还快。

## 踩过的坑

1. **AGPL-3.0 许可证**：你魔改 Soketi 源码再对外提供 SaaS，必须把魔改也开源。闭源商用前先让法务过一遍——这是 AGPL 和 MIT 最大的区别。

2. **多实例必须配 Redis**：很多人本地单实例跑得好，上线起 2-3 个 pod 后发现"A 客户端发的消息 B 客户端收不到"，根因是没配 adapter，每个 Soketi 节点各管各的内存表。

3. **uWebSockets.js 不是纯 JS**：它是 C++ binding，Vercel / Cloudflare Workers / AWS Lambda 这种 serverless 平台**部署不了**。必须长跑进程的 VM / 容器。

4. **Presence channel 鉴权要后端配合**：Soketi 不知道你的用户是谁，它只验签名。`/broadcasting/auth` 接口由你自己实现，返回的 `user_info` 字段会被广播给同 channel 所有人——这里漏字段或多字段都是事故源。

## 适用 vs 不适用场景

**适用**：

- 已经在用 Pusher 商业服务、想自托管降成本的团队
- Laravel / Rails / Django 这种"协议偏好 Pusher / Ably"的生态
- 实时聊天 / 通知 / 协作编辑 / presence indicator
- 单实例就能撑住的中小项目（< 5000 并发）

**不适用**：

- Serverless 部署偏好（用 Cloudflare Durable Objects / Pusher Channels Beam 等托管方案）
- 需要 RPC 风格双向通信（用 [[socket-io]] 或 gRPC streaming）
- 闭源商业产品里嵌入 WebSocket 服务（AGPL 风险）
- 协议要求超出 Pusher 能力（消息分片 / 优先级队列等——选 [[nats]] 或 MQTT）

## 历史小故事（可跳过）

- **2018 年**：Alex Renoki 在 Laravel 圈做 `laravel-websockets`——纯 PHP 实现 Pusher 协议，省下 Pusher.com 月费。
- **2021 年**：纯 PHP 性能撞墙（千连接级就吃力），Alex 启动 Soketi 项目，用 Node + uWebSockets.js 重写。
- **2022 年**：Soketi 加入 PHP Foundation，成为官方推荐的 Laravel Echo 后端。GitHub star 突破 5k。
- **2024 年**：核心代码进入维护模式，issue / PR 节奏放缓但仍可用——典型的"够用就停"开源项目轨迹。

## 学到什么

1. **协议兼容比新协议更重要**：Soketi 没发明协议，蹭 Pusher 的 SDK 生态，迁移成本被它一个人吃掉，用户拣到便宜
2. **性能瓶颈不在 Node 而在 IO 层**：换 uWebSockets.js 之后单机能撑数万连接，证明"Node 慢"很多时候是 IO 库选错
3. **横向扩展靠外部消息总线**：Redis pub/sub 是最便宜的方案；NATS / Kafka 也能塞进去当 adapter
4. **AGPL 是双刃剑**：保护了开源贡献者不被白嫖，也让闭源商用得绕一圈，选型时要先看 LICENSE

## 延伸阅读

- 官方文档：[docs.soketi.app](https://docs.soketi.app/)（部署 / 配置 / 鉴权 / metrics 全在这）
- Pusher 协议规范：[pusher.com/docs/channels/library_auth_reference/pusher-websockets-protocol](https://pusher.com/docs/channels/library_auth_reference/pusher-websockets-protocol/)
- [[socket-io]] —— 另一种实时通信生态，自定义协议偏 Node 自家用
- [[redis]] —— Soketi 多实例的 pub/sub 总线
- [[nats]] —— 比 Redis 更专业的消息中间件，也能当 adapter

## 关联

- [[socket-io]] —— 同样是 WebSocket 框架，但协议自定义、绑 Node
- [[redis]] —— Soketi 多节点广播的标配 adapter
- [[nats]] —— 替代 Redis 的另一种 pub/sub 选择
- [[express]] —— Soketi 自己的 HTTP 控制面（/apps/.../events）就是 Express 风格
- [[fastify]] —— 同生态的 Node web 框架，性能取舍是另一种思路
- [[laravel]] —— Soketi 的最大用户群，Echo 后端首选
- [[nginx]] —— 多实例前面常挂 nginx 做 sticky session

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[redis]] —— Redis — 内存键值数据库
- [[socket-io]] —— Socket.IO — 让浏览器和 Node.js 像打电话一样互相喊事件

