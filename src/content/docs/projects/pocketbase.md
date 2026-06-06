---
title: PocketBase — 一个 Go 二进制就是完整的后端
来源: 'https://github.com/pocketbase/pocketbase'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

PocketBase 是一个**单文件后端**：你下一个几十 MB 的 Go 可执行文件，双击运行，立刻就拥有数据库、用户登录、文件上传、实时推送、可视化管理后台。日常类比：像装在一个保温杯里的厨房——杯子里塞着炉子、刀、砧板、水槽，打开就能炒菜，不用去租厨房。

它把"开个网站后端"传统上要拼的几样东西（PostgreSQL + Redis + 后端框架 + 鉴权服务 + 管理面板）压进一个二进制：

```bash
./pocketbase serve --http=0.0.0.0:8090
# 8090 端口立刻有了：
# - 完整 REST API（增删改查任意 collection）
# - WebSocket / SSE 实时订阅
# - 多种登录方式（邮箱、OAuth）
# - 浏览器打开 /_/ 就是 Admin 控制台
```

数据全存在本地 `pb_data/` 目录的 SQLite 文件里，部署就是 `scp` 一下二进制和数据目录。

## 为什么重要

不理解 PocketBase 的设计，下面这些事都没法解释：

- 为什么有人会**主动放弃 Firebase 的全球 CDN** 选 PocketBase——是怕 vendor lock-in 和按月计费
- 为什么 SQLite 在 2026 年突然又火——单机性能足够 80% 的 SaaS 场景，且省去整个数据库运维
- 为什么"BaaS = cloud-only"是一个被打破的等式——本地文件 + Go 二进制就够用
- 为什么 Hacker News 上做副业 SaaS 的人越来越多说"先用 PocketBase 跑 MVP"

## 核心要点

PocketBase 的设计哲学可以拆成 **三条**：

1. **一切嵌入**：数据库（SQLite）、Web 服务器（Go net/http）、Admin UI（嵌入的 SPA）、文件存储（本地目录）全编进同一个二进制。类比：瑞士军刀——所有工具都在一把刀里，不用单独带剪刀和起子。

2. **Schema-driven REST**：在 Admin UI 建 collection 定义字段，立刻自动生成对应的 REST endpoint（`/api/collections/posts/records`），无需写任何路由或 ORM 代码。类比：拼乐高——你定义形状，PocketBase 把零件库出货。

3. **实时订阅作为一等公民**：每个 collection 都自带 `subscribe` 能力，前端 SDK 一行调用就能监听变更（基于 SSE）。类比：报纸订阅——一旦某个版面有新闻，邮递员立刻送上门，不用每天去报刊亭问。

三条加起来就是它的口号："**one file, one backend**"——一个文件，一个完整后端。

## 实践案例

### 案例 1：5 分钟起一个待办应用后端

```bash
# 下载 + 启动
wget https://github.com/pocketbase/pocketbase/releases/download/v0.39.0/pocketbase_linux_amd64.zip
unzip pocketbase_linux_amd64.zip && ./pocketbase serve
# 浏览器打开 http://127.0.0.1:8090/_/
# 在 Admin UI 里建 collection: todos { title: text, done: bool }
```

前端立刻可以这样调：

```js
import PocketBase from 'pocketbase'
const pb = new PocketBase('http://127.0.0.1:8090')
const todo = await pb.collection('todos').create({ title: '买菜', done: false })
const list = await pb.collection('todos').getFullList()
```

**没写一行后端代码**——CRUD 全部由 PocketBase 根据 schema 自动生成。

### 案例 2：用 Go hooks 注入业务逻辑

PocketBase 暴露事件钩子，你把它当库 import 进自己的 Go main：

```go
import "github.com/pocketbase/pocketbase"
import "github.com/pocketbase/pocketbase/core"

app := pocketbase.New()
app.OnRecordCreate("orders").BindFunc(func(e *core.RecordEvent) error {
    // 创建订单时自动发邮件
    sendEmail(e.Record.GetString("user_email"))
    return e.Next()
})
app.Start()
```

**两层用法**：纯零代码（cli serve）适合原型；嵌入 Go 写 hooks 适合需要定制规则的产品。

### 案例 3：实时协作清单

```js
// 客户端订阅 collection 的所有变更
pb.collection('todos').subscribe('*', (e) => {
    console.log(e.action, e.record)
    // action: create / update / delete
    // 立刻更新 UI
})
```

服务端是 SSE（Server-Sent Events）单向推送，多个浏览器同时订阅时变更秒同步。**不需要自己搭 WebSocket gateway 或 Redis pub-sub**。

## 踩过的坑

1. **0.x 不保证向后兼容**：从 0.22 升 0.23 可能要改 hook 签名，每次升级先读 release notes 的 migration 段，别盲升。

2. **SQLite 写并发瓶颈**：默认 WAL 模式下读并发好，写仍是单线程。每秒 > 几百次写入时性能掉得厉害，要么前置队列、要么换 PostgreSQL fork（比如 [[supabase]]）。

3. **本地文件存储不能多实例**：默认上传文件存 `pb_data/storage/`，如果你跑两个 pod 各自有本地盘，文件就各存一半。横向扩展前必须配置 S3-compatible 后端（MinIO 也行）。

4. **SSE + 浏览器 6 连接限制**：一个 origin 同时只能 6 个长连接，订阅多个 collection 会被吃满。同站点其他 fetch 会被堵——大型应用要做订阅复用或换 WebSocket 库。

## 适用 vs 不适用场景

**适用**：
- 副业 SaaS / MVP / 内部工具——5 分钟起站，几乎零运维
- 数据量 < 100 GB、写 QPS < 100 的中小应用
- 教学项目和黑客松——讲清楚后端 4 件套不绕弯
- 离线优先的 desktop / mobile app——把 PocketBase 当本地"小后端"嵌入

**不适用**：
- 高写并发（电商秒杀、实时计费） → 选 Postgres + 分布式
- 多区域部署 / 跨机房 → SQLite 单机，没有原生分片
- 需要复杂权限系统（行级 ABAC、多租户隔离） → 用 [[supabase]] 的 Postgres RLS 更直接
- 强合规审计（SOC2 / 金融）→ 0.x 还没成熟到这个程度

## 历史小故事（可跳过）

- **2022 年 8 月**：保加利亚开发者 Gani Georgiev 一个人开源 v0.1，README 一句话："Open Source backend for your next SaaS and mobile app in 1 file"。
- **2023 年**：星标突破 20k，社区开始讨论"是不是 Firebase 的本地替代"。
- **2024-2025 年**：v0.20+ 引入 hooks 系统，用户可以把 PocketBase 当 Go 库 import 进自己代码，从"零代码 BaaS"扩展为"轻量后端框架"。
- **2026 年 5 月**：v0.39 发布，star 45k+，仍未到 1.0——作者坚持 "ready when ready"，不被 hype 推着发。
- 整个项目 **一个全职 maintainer**——这种规模在主流 BaaS 里独一份。

## 学到什么

1. **简单不等于功能少**——把 80% 场景压进单二进制，远比再造一个 cloud BaaS 有价值
2. **SQLite 在 2026 年是被严重低估的后端选型**——单机性能 + 零运维 + 文件级备份
3. **嵌入式 Admin UI 是降低后端门槛的关键**——零代码能跑 demo，写代码能扩功能，两个人群同时覆盖
4. **vendor lock-in 的反向力量很大**——大量开发者愿意为"一个二进制 + 一份数据"放弃云的弹性

## 延伸阅读

- 官方文档：[pocketbase.io/docs](https://pocketbase.io/docs/)（API + hooks + JS/Dart SDK 全在一处）
- Gani 的 blog：[ganigeorgiev.com](https://ganigeorgiev.com/)（讲为什么要做单文件后端）
- 视频：[Fireship — PocketBase in 100 Seconds](https://www.youtube.com/watch?v=Wqy3PBEglXQ)（俯瞰式 demo）
- [[sqlite-2022]] —— 理解 PocketBase 选 SQLite 的底气在哪
- [[supabase]] —— 选 Postgres 路线的同类，对比"自托管 vs 全托管"
- [[appwrite]] —— 另一个开源 BaaS，更重（Docker Compose）但功能更全

## 关联

- [[sqlite-2022]] —— PocketBase 的存储底座，单文件数据库的 30 年验证
- [[supabase]] —— 同赛道的 Postgres + 云托管派，对照看清楚两种 BaaS 哲学
- [[appwrite]] —— Docker Compose 路线的开源 BaaS，对比"重容器 vs 单二进制"
- [[fastify]] —— 当你把 PocketBase 当 Go 库不够用时的 Node.js 同类思路
- [[fiber]] —— Go 生态另一个轻量 web 框架，和 PocketBase 的 net/http 选型对比
- [[express]] —— 最经典的 Node.js 后端框架，PocketBase 的"一个文件"是反向思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[express]] —— Express — Node.js 最经典的 Web 框架
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[fiber]] —— Fiber — 把 Express 写法搬到 Go 上的高性能 web 框架
- [[supabase]] —— Supabase — Firebase 的开源替代

