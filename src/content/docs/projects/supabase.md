---
title: Supabase — Firebase 的开源替代
来源: https://github.com/supabase/supabase
日期: 2026-05-29
子分类: databases-storage
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Supabase 是基于 [[postgresql]] 的一体化后端服务（BaaS）—— 给你一个 Postgres 数据库 + 自动 REST API + 用户认证 + 文件存储 + 实时推送 + 边缘函数，全部开源、可自部署。

日常类比：

- **Firebase**：闭源黑盒。Google 一句话改条款，你的项目就要跟着搬家。数据存在 Google 的 NoSQL 里，迁出极痛苦。
- **Supabase**：开源版。同样 5 分钟起一个项目，但底层是标准 Postgres，想自部署就 docker 起一套，想搬到 AWS RDS 也可以——数据是你的。

一句话定位：**它把 30 年成熟的 Postgres 包装成了"前端可以直接调"的后端**。

## 为什么重要

不理解 Supabase，下面这些事都解释不了：

- 为什么 Firebase 称霸了 10 年，但 2023 年起越来越多团队迁到 Supabase（GitHub 70k+ stars，2026 年仍在涨）
- 为什么 [[postgresql]] 这个 30 年的老 RDBMS 突然成了"现代 BaaS 的底座"
- 为什么 Mozilla / GitHub / Vercel 这种大客户愿意把核心业务放在 Supabase 上
- 为什么"前端直连数据库"这件事不再是 Firebase 的专利

它代表一种新的后端范式：**别再写 Express + Passport + Knex 三件套了，让 Postgres 自己当后端**。

## 核心要点

Supabase 能成立，靠的是把 Postgres 已有的三个能力用到极致：

### 1. PostgREST：把 SQL 表自动变成 REST API

你建一张 `posts` 表，PostgREST 自动给你生成：

```
GET    /rest/v1/posts          ← 查列表
POST   /rest/v1/posts          ← 插入
PATCH  /rest/v1/posts?id=eq.1  ← 更新
DELETE /rest/v1/posts?id=eq.1  ← 删除
```

不用写 controller、不用写 ORM 映射，schema 改一次 API 也跟着改。

### 2. Realtime：监听 Postgres 的"日志流"做实时推送

Postgres 写每一行时都会先写 WAL（Write-Ahead Log，预写日志）。Supabase 的 Realtime 服务订阅这个日志流，把"INSERT 一行 posts"变成"所有订阅者收到 WebSocket 推送"。

类比：你不用在每个写入代码里手动 `pubsub.publish()`，数据库自己当广播站。

### 3. Row Level Security（RLS）：让前端直连数据库还安全

传统做法：前端不能直连 DB，因为 SQL 没法过滤"只能看自己的数据"，所以中间必须有后端做鉴权。

Postgres 原生 RLS 解决了这个问题——你给表写一条策略：

```sql
CREATE POLICY "users see own posts" ON posts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

之后无论前端怎么发 `SELECT *`，Postgres 自己只返回该用户的行。**前端可以直连，数据库自己当门卫**。

## 实践案例

### 案例 1：起一个本地全栈

```bash
npm install -g supabase
mkdir my-app && cd my-app
supabase init
supabase start
# 30 秒后输出：
#   API URL: http://127.0.0.1:54321
#   Studio URL: http://127.0.0.1:54323
#   anon key: eyJhbGc...
```

一键起 5 个 docker 容器：Postgres + Auth + Realtime + Storage + Studio（管理面板）。

### 案例 2：前端 5 行调数据

```js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient('http://127.0.0.1:54321', 'eyJhbGc...')

// 查询
const { data } = await supabase.from('users').select('*').eq('id', 1)

// 实时订阅
supabase.channel('posts')
  .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' },
      (payload) => console.log('新帖子！', payload))
  .subscribe()
```

没有后端代码、没有 WebSocket 服务、没有手写 API。

### 案例 3：用户登录

```js
// 注册
await supabase.auth.signUp({ email: 'a@b.com', password: '...' })

// 登录
const { data } = await supabase.auth.signInWithPassword({ email, password })
// 拿到 JWT，自动带在后续请求里

// 第三方 OAuth
await supabase.auth.signInWithOAuth({ provider: 'github' })
```

JWT 里带着用户 ID，Postgres 的 `auth.uid()` 函数自动从 JWT 取出来——RLS 策略立刻就能用。

## 踩过的坑

1. **RLS 默认是 deny**——表启用了 RLS 但**没写任何策略**，结果是查询返回 `[]`（不是报错）。新人常以为是查询写错了，其实是策略没写。**对策**：在 Studio 的 Policies 面板检查每张表是否有策略。

2. **`user_metadata` vs `app_metadata` 不能搞混**：前者前端可改，后者后端可改。如果把"是否管理员"塞进 `user_metadata`，攻击者在前端调一次 `updateUser` 就能给自己提权。**对策**：所有鉴权用字段都放进 `app_metadata`。

3. **Self-host 时 Realtime 配置容易错**：Realtime 要求 Postgres 启用 logical replication（`wal_level = logical`），还要 publication / replication slot 配对。错一处实时推送就静默失效——日志里也不一定有清晰报错。**对策**：先用 Cloud 版跑通，再迁 self-host。

4. **Edge Functions 是 Deno 不是 Node**：很多 npm 包不能直接用，要找 Deno 替代或写垫片。`fs` / `path` / `process` 等 Node 内置 API 也要换成 Deno 等价物。**对策**：先看 [Deno 兼容包](https://deno.land/x)，没有再考虑写函数到别处。

5. **Cloud → Self-host 数据迁移不是按个按钮**：要导 SQL dump、迁 Auth users 表（包括加密密码 hash）、迁 Storage 对象（S3 → S3）。Supabase 提供 CLI 工具但流程繁琐。**对策**：项目早期就决定 Cloud 还是 Self-host，别中途换。

## 适用 vs 不适用场景

**适用**：

- 个人项目 / 副业 / hackathon — 5 分钟起后端
- 不想被厂商锁、想保留 Postgres 知识可迁移性的团队
- 70% 是 CRUD + 鉴权 + 实时推送的应用（博客、论坛、看板、协作工具）
- 已有 SQL 知识、不想再学一套 NoSQL DSL

**不适用**：

- 写入量极大（50k+ tps）— Postgres 单实例瓶颈，需要 sharding
- 数据天然是文档树或图（多对多关系密集）— 硬塞 Postgres 反而别扭
- 复杂业务流（涉及多个外部 API 调用 + 复杂事务）— 仍然需要写传统后端服务
- Realtime 订阅者数 100k+ — 每个订阅者要跑一次 RLS 检查，CPU 会爆

## 历史小故事（可跳过）

- **2020**：Paul Copplestone（CEO）和 Ant Wilson 在新加坡 YC W20 创立 Supabase。最初只是 PostgREST + Auth 的 wrapper，跑在一台 DigitalOcean 上。
- **2021**：Apache 2.0 开源 launch，GitHub 一夜上 trending，"开源 Firebase" 的标签贴上。
- **2022**：加 Realtime（Elixir 写）+ Storage 服务，从"Postgres wrapper" 升级成完整 BaaS。
- **2023**：Edge Functions GA（基于 Deno），可以在边缘跑用户代码。同年加 pgvector 集成，蹭上 RAG / 向量数据库的浪。
- **2024-2025**：加 Auth UI Components（拖拽式登录页）、Cron Jobs、Queues。从"BaaS"扩展成"无所不能的 Postgres 平台"。

## 学到什么

1. **复用胜过重发明**——Supabase 没造任何新东西，只是把 Postgres 已有的 RLS / logical replication / SECURITY DEFINER 函数串起来，就成了能和 Firebase 抗衡的产品
2. **"前端直连数据库" 这件事，关键不在前端，而在数据库**——只要数据库自己能做行级鉴权，中间那一层后端就可以薄到极致
3. **开源是产品策略不是道德立场**——Firebase 闭源给了 Supabase 最大的竞争空间，开发者宁愿多学一点 SQL 也想保留搬家自由
4. **Postgres 比想象中能干**——不只是关系数据库，还能当消息队列（pgmq）、向量库（pgvector）、全文搜索（tsvector）、地理库（postgis）。Supabase 的赌注就是"Postgres 是终极后端"

## 延伸阅读

- 官方文档：[supabase.com/docs](https://supabase.com/docs)（结构清晰，有交互式 demo）
- 主仓库：[github.com/supabase/supabase](https://github.com/supabase/supabase)
- 官方教程：[supabase.com/docs/guides/getting-started](https://supabase.com/docs/guides/getting-started)（5 分钟跑通本地）
- [[postgresql]] —— Supabase 的底座，先理解 Postgres 才能理解 Supabase 为什么能这么薄
- [[auth-js]] —— Supabase Auth 客户端 SDK 的同代品类
- [[better-auth]] —— 另一种思路的 Auth 库（不绑定 BaaS）

## 关联

- [[postgresql]] —— 30 年的老数据库，Supabase 的全部能力都建在它上面
- [[postgres-js]] —— Postgres 的 JS 客户端，和 supabase-js 是不同层的工具
- [[auth-js]] —— Auth 客户端范式参考
- [[better-auth]] —— 想要 Auth 但不想要整套 BaaS 时的替代

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[cal-com]] —— cal.com — 自己能托管的开源 Calendly
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[edgedb]] —— EdgeDB / Gel — 在 Postgres 上长出图风查询语言，让类型系统替你做 ORM
- [[label-studio]] —— Label Studio — 文本图像音视频时序通吃的标注王者
- [[meilisearch]] —— MeiliSearch — 开发者友好的搜索引擎
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[postgres-js]] —— postgres.js — 写 SQL 但语法层就防注入的 Node 客户端
- [[postgresql]] —— PostgreSQL — 工业级关系数据库

