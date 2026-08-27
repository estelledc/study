---
title: PocketBase — 一个 Go 二进制就是完整的后端
来源: https://github.com/pocketbase/pocketbase
日期: 2026-05-30
分类: backend-api
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/pocketbase/pocketbase
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.40.1
---

## 是什么

PocketBase 是一个把数据库、HTTP API、鉴权、文件和实时订阅压进同一进程的后端。日常类比：像把炉子、砧板和水槽塞进一个保温杯——打开就能炒菜，不用再租一间厨房。

固定 `v0.40.1` / `bc8ffed4...` 的启动面是 `pocketbase.New()` 加 `Start()`：先嵌入 `core.BaseApp`，再注册 `serve` / `superuser`。无域名参数时，`serve` 默认听 `127.0.0.1:8090`；数据目录默认是可执行文件旁的 `pb_data`。

```go
app := pocketbase.New()
if err := app.Start(); err != nil {
    log.Fatal(err)
}
```

`Start()` 本身不监听端口，它只是把系统命令挂到 cobra 再 `Execute()`。真正的 HTTP 路由在 `apis.NewRouter`：`/api/collections/{collection}/records`、`/api/realtime`、auth、file、batch。

## 为什么重要

不读这条主链，下面这些事都会被旧印象带偏：

- 为什么“一个二进制”不等于“没有规则引擎”——collection rule 会直接变成 SQL 过滤
- 为什么前端 `subscribe()` 不能单独成立——SSE 连接和订阅列表是两次 HTTP
- 为什么多实例不能只复制二进制——默认文件在 `pb_data/storage`，SQLite 也在同一目录
- 为什么 0.40 不能当 0.39 的静默补丁——最低 Go 是 1.27，JSON 已切到 `encoding/json/v2`

## 核心要点：架构与请求流程

可以把固定版本拆成四段：

1. **进程装配**：`NewWithConfig` 建 `BaseApp`（连接池、query timeout、数据目录），`OnBootstrap` 才打开 SQLite。默认 DSN 带 `busy_timeout(10000)`、`journal_mode(WAL)` 和 `_defensive=1`。

2. **Schema-driven CRUD**：`GET/POST /api/collections/{collection}/records` 与 `GET/PATCH/DELETE .../{id}`。`ListRule == nil` 时非 superuser 直接 403；非空 rule 作为 filter 与客户端 `filter` 同一查询执行。这是刻意的性能/正确性折中，不是两次鉴权。

3. **Realtime 两步**：`GET /api/realtime` 建立 SSE，先推 `PB_CONNECT`（带 `clientId`），空闲 5 分钟、最长 30 分钟；`POST /api/realtime` 再用同一个 `clientId` 提交最多 1000 条 subscription。SDK 的 `collection.subscribe` 只是这层协议的包装，本仓不包含 JS SDK。

4. **钩子双入口**：Go 侧 `app.OnRecordCreate("orders").BindFunc(...)` 必须 `e.Next()`；JS 侧由 `plugins/jsvm` 加载默认 `pb_data/../pb_hooks` 下的 `*.pb.js` / `*.pb.ts`。两者都是 tagged hook，不是“创建后自动发邮件”的隐藏魔法。

## 实践案例

### 案例 1：用 HTTP 合同建一条 record

```http
POST /api/collections/todos/records
Content-Type: application/json

{"title":"买菜","done":false}
```

对应实现是 `recordCreate`：先找 collection，再看 `CreateRule`。规则为 `nil` 时只有 superuser 能写；规则为非空字符串时，会先造一条 dummy row 用同一套 filter 表达式探路，再 `form.Submit()`。没有单独的 ORM 层。

### 案例 2：Go hook 插在创建链上

```go
app := pocketbase.New()
app.OnRecordCreate("orders").BindFunc(func(e *core.RecordEvent) error {
    // 副作用必须自己保证可重入；失败应在 Next 前返回
    return e.Next()
})
_ = app.Start()
```

`OnRecordCreate` 与 `OnRecordCreateRequest` 不是同一层：前者跟模型保存走，后者跟 HTTP handler 走。只绑其中一个，不能假定另一条也触发。

### 案例 3：Realtime 先连后订

```http
GET /api/realtime
Accept: text/event-stream

POST /api/realtime
Content-Type: application/json

{"clientId":"<from PB_CONNECT>","subscriptions":["todos"]}
```

`POST` 会核对 client IP，并禁止已经鉴权的连接改成另一个身份。只开 SSE、不 POST，订阅列表为空。

## 踩过的坑

1. **把 `ListRule == nil` 当成“公开列表”**：源码是反过来的——`nil` 只给 superuser。空字符串才是“无额外 filter”。
2. **以为 `timeout` 和 SSE 共用一个 write deadline**：`realtimeConnect` 会把 write deadline 清掉；连接寿命由 idle/max timer 管，不是全局 `WriteTimeout`。
3. **两个进程共用一份 `pb_data` 却不配 S3**：`NewFilesystem()` 在 `settings.S3.Enabled` 为假时写 `pb_data/storage`。本地盘分叉后文件只在其中一个实例。
4. **把源码里的 `Version = "(untracked)"` 写成发行号**：二进制发行靠 tag；本页绑定 `v0.40.1` 提交，不把该字面量当 SemVer。
5. **0.40 当补丁升**：CHANGELOG 写明最低 Go 1.27，并迁移 `encoding/json/v2`；命令错误现在会以非零码退出，旧的 `cmd && next` 脚本会断。

## 适用 vs 不适用场景

**适用**：

- 单机 MVP / 内部工具，能接受一份 `pb_data` 目录
- 需要 collection rule 当行级 filter，而不是另写一层 BFF
- 想用 Go 或 `pb_hooks` 把副作用挂在同一进程

**不适用**：

- 多区域、多副本写入——默认 SQLite 单文件，不是分布式 SQL
- 把实时订阅当成无限长连接——固定实现 30 分钟会拆线
- 需要跨实例共享上传文件却不配 S3
- 不能接受 0.x 的 hook / JSON / 退出码变化

## 固定版本边界

- 本文绑定 `pocketbase/pocketbase@bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef`，tag `v0.40.1`。
- 默认驱动是 `modernc.org/sqlite` 1.57.0；连接池默认 `DataMaxOpenConns=120`、`QueryTimeout=30s`。
- 未执行 `serve`、未打开 SQLite、未跑上游测试；状态保持 `UNVERIFIED`。

## 学到什么

1. **“单二进制”真正省下的是进程拓扑，不是规则**——rule、hook、SSE 订阅仍是三条独立合同。
2. **默认拒绝写在 rule 指针上**——`nil` 与 `""` 语义相反，不能靠 Firebase 经验外推。
3. **实时通道和订阅列表分开**，才能解释重连、换 token 和 IP 校验。
4. **本地盘是隐藏的分片键**——文件与 SQLite 都在 `pb_data`，横向扩展先改存储合同。

## 应用型自测

1. 某 collection 的 `ListRule` 是 `nil`。匿名请求 `GET /api/collections/posts/records` 会得到列表吗？
2. 客户端只建立了 `GET /api/realtime`，没有 POST。能收到 `todos` 的 create 事件吗？
3. 两个容器各挂自己的空盘，都没开 `settings.S3`。上传的文件会出现在两个实例里吗？

检查点：

1. 不会。`ListRule == nil` 时只有 superuser 能 list。
2. 不会。SSE 只先推 `PB_CONNECT`；订阅要靠 `POST /api/realtime`。
3. 不会。默认文件系统是各自的 `pb_data/storage`。

## 延伸阅读

- 官方文档：[pocketbase.io/docs](https://pocketbase.io/docs/)
- 固定源码：[pocketbase/pocketbase](https://github.com/pocketbase/pocketbase) —— 本文绑定提交 `bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef`
- [[appwrite]] —— Compose 集群路线的开源 BaaS，对照单进程与多 worker
- [[supabase]] —— Postgres + RLS 路线，对照 SQLite + collection rule

## 关联

- [[sqlite-2022]] —— 默认存储引擎的背景，不代替本页的 DSN / defensive 合同
- [[supabase]] —— 同赛道的 Postgres 派
- [[appwrite]] —— 同赛道的容器集群派
- [[fiber]] —— 只要 Go HTTP、不要嵌入式 BaaS 时的另一条路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
