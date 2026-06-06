---
title: Appwrite — 自己能装一遍的开源 Firebase
来源: 'https://github.com/appwrite/appwrite'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

Appwrite 是一个**开源的后端即服务**（BaaS）平台，把"做一个 App 通常要写的后端模块"——注册登录、数据库、文件存储、定时任务、实时推送、邮件推送、静态托管——打包成一套可以自己部署的容器集群，前端只需要装一个 SDK 就能调。

日常类比：像**装修公司送的"精装套餐"**。你不用一个个去找水电工、瓦工、木工，套餐里水电、地板、厨卫、家电全配好；不喜欢哪一样可以换，但底子已经能住人。Firebase 是 Google 直营的精装公寓（你只能租，钥匙在房东手里），Appwrite 把同样的精装方案做成了**开源图纸 + 自带工人**——你可以把它装在自己家里。

它的后端用 PHP 8 写、跑在 Docker 里，配 MariaDB / Redis / InfluxDB；对外提供 TypeScript、Flutter、Swift、Kotlin、Python 等 15+ 语言的客户端 SDK。BSD-3 协议，56k+ GitHub stars。

## 为什么重要

不理解 Appwrite，下面这些事就没法解释：

- 为什么 2019 年后涌现了一批"开源 Firebase"项目（Appwrite / Supabase / PocketBase / Nhost）——核心需求是"我想要 BaaS 但不想被 Firebase 锁定"
- 为什么前端开发者用它写完整 App 比用 Express + Postgres + Auth0 拼快一个量级——它把"后端必需件"压缩到一条 docker compose up
- 为什么自托管 BaaS 总要带一个文档级 ACL 系统——多用户隔离这件事躲不掉
- 为什么"BaaS 选型"的辩论持续 5 年——Firebase 锁定 vs 自托管 vs Supabase 关系型路线，没有银弹

## 核心要点

Appwrite 的设计可以拆成 **三层**：

1. **统一 API 网关**：所有功能（auth / db / storage / functions）走同一套 REST / Realtime / GraphQL 接口，前端 SDK 实际只在和这一个网关讲话。类比：去政府办事大厅有一个总台分发，不用一个窗口跑一遍。

2. **文档级 ACL 权限模型**：每个文档（document）、每个文件、每个 bucket 都能单独配 read / write / update / delete 的角色（any / users / role:xxx / user:id）。类比：每份文件夹都有自己的钥匙，而不是大门一把钥匙开所有抽屉。

3. **Docker Compose 单机起 → 集群可扩展**：默认架构十几个容器（API / DB / Realtime / Functions Executor / Worker / Mail / Push）一键起，规模大了把每个 worker 横向扩。类比：从一个工具箱（单机）到一辆工具车（集群），但工具是同一套。

## 实践案例

### 案例 1：5 行代码做邮箱注册登录

Web 端用 `@appwrite.io/console` 或 `appwrite` SDK：

```ts
import { Client, Account, ID } from "appwrite";
const client = new Client().setEndpoint("https://your.host/v1").setProject("PROJ_ID");
const account = new Account(client);
await account.create(ID.unique(), "a@b.com", "pw123456", "Alice");
await account.createEmailPasswordSession("a@b.com", "pw123456");
const me = await account.get();
```

**逐部分解释**：

- `Client` 配置 endpoint + project ID，每个项目一个隔离命名空间
- `account.create` 创建用户，`ID.unique()` 让服务端生成唯一 ID
- `createEmailPasswordSession` 登录，浏览器自动存 session cookie；下次开页面 `account.get()` 就能拿到当前登录用户

### 案例 2：collection 写权限 ACL，让用户只能改自己的文档

后台建 collection 时设 documentSecurity = on，每条文档插入时绑权限：

```ts
import { Databases, Permission, Role } from "appwrite";
const dbs = new Databases(client);
await dbs.createDocument("DB_ID", "notes", ID.unique(),
  { title: "我的笔记", body: "..." },
  [
    Permission.read(Role.user(me.$id)),
    Permission.update(Role.user(me.$id)),
    Permission.delete(Role.user(me.$id)),
  ]
);
```

`Role.user(me.$id)` 把读 / 改 / 删都限定到"当前登录用户"。其他用户即使知道文档 ID 也读不到——这是 Appwrite 多用户隔离最常用的模式。

### 案例 3：写一个 Function 监听 storage 上传，自动生成缩略图

在控制台建一个 Node.js Function，绑事件 `buckets.images.files.*.create`：

```js
import { Client, Storage } from "node-appwrite";
import sharp from "sharp";
export default async ({ req, res, log }) => {
  const { bucketId, $id: fileId } = req.body;
  const storage = new Storage(new Client().setEndpoint(...).setKey(process.env.API_KEY));
  const buf = await storage.getFileDownload(bucketId, fileId);
  const thumb = await sharp(buf).resize(200, 200).toBuffer();
  await storage.createFile("thumbs", fileId, new File([thumb], "t.jpg"));
  return res.json({ ok: true });
};
```

这个 Function 在容器隔离环境里跑，事件触发时 Appwrite 直接把 `req.body` 注入；写回 storage 时用同一个 client。整个流程**不需要单独的消息队列**——Appwrite 内部用 worker 把事件分发给 Functions Executor。

## 踩过的坑

1. **macOS / Windows 自托管首次启动慢**：非 Linux 主机的 Docker 走桥接卷，文件 IO 走 osxfs / WSL2，第一次起十几个容器要 3-5 分钟，看起来像挂了，其实在初始化 schema 和 worker。
2. **文档级 ACL 和 collection 级 ACL 双层**：collection 设了 `read: any` 但 documentSecurity 没开，文档自己的权限会被忽略，整个 collection 都是公开的。生产前要严格 audit 这两层。
3. **Functions 冷启动 + 并发限制**：默认每个 Function 容器单实例 + 冷启动 200ms-2s，跑高 QPS 任务前要打开 specifications + scaling，或者 Function 里只做调度、把重活外发给独立队列。
4. **跨大版本升级风险**：1.5 → 1.9 之间多次 schema 变更，docker compose pull 完不跑 migration 脚本会启动失败或数据丢字段。每次升级先读 release notes，备份 MariaDB volume。

## 适用 vs 不适用场景

**适用**：
- 个人 / 小团队的 MVP，前端写得快、不想为后端再开 3 个仓库
- 需要"开源 + 自托管 + 数据自己掌握"的前提（比如 EU 合规、内部系统）
- 多端 App（Web + iOS + Android + Flutter），享受统一 SDK
- 中等规模产品（DAU ≤ 10w 量级），单机或 3-5 节点能扛

**不适用**：
- 已有成熟后端、只缺一个组件（比如只想要登录）→ 用 [[clerk]] / [[auth-js]] 比上整套 BaaS 轻
- 重关系型查询（多表 join + SQL 复杂分析）→ Appwrite 的 collection 模型偏文档，[[supabase]] 的 Postgres 路线更顺手
- 万级 QPS 实时业务 → BaaS 抽象会成为瓶颈，需要自研 / 用专门的 [[redis]] / [[kafka]] 栈
- 完全 serverless 偏好（不想跑 Docker）→ 选 Firebase / Supabase Cloud / Cloudflare 直供

## 历史小故事（可跳过）

- **2019 年**：Eldad Fux 在 Hacker News 发出 Appwrite 0.1，定位"开源 Firebase 替代品 for 前端开发者"，PHP 8 + Docker Compose。
- **2020 年**：成立公司，拿到种子轮，社区从 1k 涨到 10k stars，加进 Storage 和 Cloud Functions。
- **2022 年**：1.0 发布，加 Realtime（websocket 推送）+ Teams（多用户协作），Appwrite Cloud 私测。
- **2024 年**：发布 Sites（对标 Vercel 的静态托管）+ Messaging（统一 email / SMS / push），Functions runtime 数加到 15。
- **2025-2026**：1.9.x 系列稳定，56k+ stars，与 Supabase 形成"文档型 vs 关系型"两条 OSS BaaS 主线。

## 学到什么

1. **BaaS 的核心抽象不是"数据库"，是"统一权限网关"**——能把 auth / db / storage 三件事的权限合并表达，前端才省事
2. **PHP 不死**：被嘲笑十年，但 Appwrite / WordPress / Laravel 仍然是中型 web 后端的高效选项，部署简单 + 社区大
3. **开源不等于无锁定**：迁出 Appwrite 也要工作（schema、ACL、Functions），但比迁出 Firebase 至少有 fallback——你可以本地导出全部数据
4. **Docker Compose 是 OSS BaaS 的胜负手**：能否 5 分钟把 7 个服务跑起来决定了第一次试用是不是放弃

## 延伸阅读

- 官方文档：[Appwrite Docs](https://appwrite.io/docs) — 教程从 5 分钟 quickstart 一直到 Functions / Realtime / Sites
- 视频 quickstart：[Appwrite YouTube — Build a full-stack app](https://www.youtube.com/@appwrite)
- 项目仓库：[github.com/appwrite/appwrite](https://github.com/appwrite/appwrite) — PHP 后端 + 容器编排
- [[supabase]] —— 对标的关系型 BaaS，比 Appwrite 更重 SQL
- [[clerk]] —— 只做认证那一段的 SaaS，可以和 Appwrite 互替也可以共存
- [[docker]] —— Appwrite 自托管的运行底座

## 关联

- [[supabase]] —— 同类开源 BaaS，关系型路线（Postgres + RLS）vs Appwrite 文档型路线
- [[clerk]] —— 只做认证模块的商业服务，常作为 Appwrite Auth 的替代或前置
- [[auth-js]] —— Auth.js 是更轻的认证库，对比 Appwrite Auth 是 lib vs 整套服务
- [[docker]] —— Appwrite 用 Docker Compose 编排十几个容器，一键自托管的关键
- [[redis]] —— Appwrite 内部用 Redis 做缓存和事件队列
- [[fastify]] —— 如果只要"轻 API 框架"而不要 BaaS，Fastify + 自配数据库是常见路线
- [[chatwoot]] —— 类似的"开源替代 SaaS"思路（替代 Intercom），Appwrite 替代 Firebase

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[chatwoot]] —— chatwoot — 把 11 种外部聊天渠道归一到同一张消息表
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
- [[redis]] —— Redis — 内存键值数据库
- [[supabase]] —— Supabase — Firebase 的开源替代

