---
title: Appwrite — 自己能装一遍的开源 Firebase
来源: https://github.com/appwrite/appwrite
日期: 2026-05-30
分类: backend-api
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/appwrite/appwrite
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 9f8423e2f6fd7237609524a16541430e19f9ee0e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.9.6
---

## 是什么

Appwrite 是一套自托管的后端即服务：账号、数据库、存储、函数、实时和消息被拆成多个进程，前端只跟统一的 `/v1` 网关说话。日常类比：精装图纸加一队工人——你可以装在自己机房，但水电、木工、监理不是同一个人。

固定 `1.9.6` / `9f8423e2...` 的包名是 `appwrite/server-ce`，`APP_VERSION_STABLE` 为 `1.9.6`。HTTP 入口在 `app/http.php`：Swoole 监听 `PORT`（默认 80），worker 数是 `_APP_CPU_NUM * _APP_WORKER_PER_CORE`（每核默认 6），并用 `_APP_RISKY_WORKERS_PERCENT`（默认 80%）把请求分到“安全 / 风险”两组 worker。

```php
// app/init/constants.php
const APP_VERSION_STABLE = '1.9.6';
```

Composer 要求 `php >= 8.3.0` 和 `ext-swoole` 6。这已经不是“随便找台 PHP-FPM 就能起”的仓库。

## 为什么重要

不读 1.9.6 的路由表，旧教程会把三件事写错：

- 为什么 `Databases.createDocument` 还在，却不能当主 API——SDK 从 1.8.0 起指向 `tablesDB.createRow`
- 为什么文档上的 ACL 有时完全不生效——`documentSecurity` 默认 false
- 为什么“自托管 = MariaDB + Redis + InfluxDB”过时——固定 Compose 里是 MariaDB、Mongo、Postgres 和 Redis，没有 InfluxDB 服务

## 核心要点：架构与请求流程

1. **网关 + 队列**：浏览器 SDK 打进 Swoole HTTP；写文档时 handler 同时注入 `queueForRealtime`、`publisherForFunctions`、`queueForWebhooks`。函数真正执行在 `Functions` worker，再交给 `openruntimes/executor:0.25.4`。冷启动、超时和重试属于 Executor，不是网关线程。

2. **三套数据库 HTTP 面**：旧 collection 文档仍在 `POST /v1/databases/:databaseId/collections/:collectionId/documents`，但标注 `deprecated since 1.8.0`，替换方法是 `tablesDB.createRow` → `POST /v1/tablesdb/:databaseId/tables/:tableId/rows`。并行还有 DocumentsDB 与 VectorsDB。教“Appwrite 只有文档库”已经不完整。

3. **双层权限**：创建 collection 时 `documentSecurity` 默认 false。源码注释写的是：开启后，用户需要 **文档级或 collection 级** 其中一套权限。关掉时，文档上的 `$permissions` 不是访问主路径——只在 collection 上写 `read: any` 就会把整表打开。

4. **账号合同仍在 controllers**：`POST /v1/account` 对应 SDK `account.create`；`POST /v1/account/sessions/email`（别名 `/v1/account/sessions`）对应 `createEmailPasswordSession`。MFA 已迁到 Platform 模块，但邮箱密码主链还在 `app/controllers/api/account.php`。

## 实践案例

### 案例 1：邮箱注册与登录（路由合同）

```http
POST /v1/account
{"userId":"unique()","email":"a@b.com","password":"pw123456","name":"Alice"}

POST /v1/account/sessions/email
{"email":"a@b.com","password":"pw123456"}
```

密码创建路径要求 8–256 字符，并走项目的 `passwordStrength` / `passwordDictionary` 配置。登录路径的 abuse key 含 email。这些限制写在路由 label 上，不是 SDK 自己发明的。

### 案例 2：新主路径按 table 写一行

```http
POST /v1/tablesdb/DB_ID/tables/notes/rows
{
  "rowId": "unique()",
  "data": {"title":"我的笔记"},
  "permissions": ["read(\"user:USER_ID\")","update(\"user:USER_ID\")","delete(\"user:USER_ID\")"]
}
```

`Create` 类继承旧文档 handler，只是换了 path、response model 和 scope（`rows.write` 兼 `documents.write`）。旧 `databases.createDocument` 例子在 1.9.6 仍能对上路由，但源码已经标替换对象。

### 案例 3：函数不在网关里跑

创建文档后，`publisherForFunctions` 入队；`Functions` worker 读 payload，再调 Executor。事件名、超时和 runtime 镜像属于 worker/executor 合同。把 Function 写成“同步插在 createDocument 后面的 PHP 函数”与固定源码不符。

## 踩过的坑

1. **继续把 InfluxDB 写成默认指标库**：`docker-compose.yml` 固定快照没有 Influx 服务；出现的是 MariaDB 10.11、Mongo 8.2.5、`appwrite/postgres:0.1.0`、Redis 7.4.7。
2. **`documentSecurity` 没开却在文档上堆 Permission**：关闭时更新路径按 collection 权限判定；文档 ACL 不能当隔离。
3. **把 1.5 的 `Databases` SDK 原样贴到 1.9**：`createDocument` 仍在，但 `deprecated since 1.8.0`，替换为 `tablesDB.createRow`。
4. **用 PHP-FPM 想直接跑 `app/http.php`**：入口依赖 Swoole 6 与自定义 `dispatch`。Compose 里的主 API 镜像才是受支持的进程模型。
5. **跨小版本只 `docker compose pull`**：迁移表把 `1.9.6` 映射为 `V25`。不跑对应 migrate，schema 与常量会对不上。

## 适用 vs 不适用场景

**适用**：

- 需要自托管、多端 SDK、账号/库/存储/函数在同一网关后的产品
- 能运维一组 worker、Executor 和至少一套数据存储
- 接受 TablesDB 作为 1.8+ 的主数据面

**不适用**：

- 只要登录、不要整套 BaaS → [[clerk]] / [[auth-js]] 更轻
- 以复杂 SQL join 为主 → [[supabase]] 的 Postgres 路线更直接
- 不想跑 Docker / Swoole 集群
- 把旧 collection SDK 当长期稳定面

## 固定版本边界

- 本文绑定 `appwrite/appwrite@9f8423e2f6fd7237609524a16541430e19f9ee0e`，tag 与 `APP_VERSION_STABLE` 均为 `1.9.6`。
- 许可证在 `composer.json` 为 BSD-3-Clause。
- 未启动 Compose、未连库、未调 Executor；状态保持 `UNVERIFIED`。

## 学到什么

1. **BaaS 的稳定面是网关路径，不是营销模块名**——Documents / Tables / Vectors 可以并存，SDK 方法会先过期。
2. **权限开关比权限字符串更先决定结果**——`documentSecurity` 关掉时，文档 ACL 不是主路径。
3. **自托管拓扑会换存储**——不能把三年前的 Influx/Maria 组合抄进 1.9.6。
4. **函数是队列消费者**——网关负责入队，Executor 负责跑；失败域不在 PHP 请求线程。

## 应用型自测

1. 1.9.6 里 `databases.createDocument` 还在。新代码应把它当主 API 吗？
2. collection 的 `documentSecurity` 为 false，文档写了 `read("user:me")`，collection 是 `read("any")`。陌生人能读到吗？
3. 按 1.9.6 的 `docker-compose.yml`，指标/队列默认还依赖 InfluxDB 吗？

检查点：

1. 不应当。源码从 1.8.0 起把替换写成 `tablesDB.createRow`。
2. 能。关闭文档级安全后，collection 的 `any` 才是读路径。
3. 不依赖。固定 Compose 没有 InfluxDB 服务。

## 延伸阅读

- 官方文档：[appwrite.io/docs](https://appwrite.io/docs)
- 固定源码：[appwrite/appwrite](https://github.com/appwrite/appwrite) —— 本文绑定提交 `9f8423e2f6fd7237609524a16541430e19f9ee0e`
- [[pocketbase]] —— 单进程 SQLite 路线，对照 worker 拓扑
- [[supabase]] —— 关系型 BaaS，对照 TablesDB / DocumentsDB

## 关联

- [[pocketbase]] —— 单二进制 BaaS，对比“一进程 vs 一集群”
- [[supabase]] —— Postgres + RLS，对比文档/表双面
- [[clerk]] —— 只做认证时的更窄替代
- [[docker]] —— 固定 Compose 的运行底座
- [[redis]] —— 队列与缓存，不是文档库

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pocketbase]] —— PocketBase — 一个 Go 二进制就是完整的后端
