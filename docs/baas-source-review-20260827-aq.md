# BaaS source review

> 用途：记录 PocketBase 与 Appwrite 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AQ
- target pair：`supabase` + `firebase`
- fallback pair：`pocketbase` + `appwrite`
- fallback reason：
  - `supabase/supabase` GitHub `size` ≈ 2.4 GiB，超出本 epoch 的 clone 预算；
  - 仓库内不存在 `firebase` 项目页，不能为对齐目标对新建笔记；
  - `firebase/firebase-js-sdk` 也没有对应 Study slug；
  - 开放 PR 未占用 `pocketbase` / `appwrite`；二者是最近的 needs-evidence 开源 BaaS 对。
- evidence：GitHub metadata 与固定提交静态源码阅读
- not executed：未安装 Go/PHP 依赖，未启动 `serve` / Compose / Swoole，未连接 MariaDB/Mongo/Postgres/SQLite，未调用 Executor，未运行上游 test 或 benchmark
- worktrees：本机 `research-worktrees/pocketbase` 与 `research-worktrees/appwrite`，不进入 Git

## PocketBase

- canonical source：`https://github.com/pocketbase/pocketbase`
- revision：`bc8ffed4e7265a70a6e8de76c0b0b48b945e19ef`
- GitHub release：`v0.40.1`（lightweight tag，与 revision 一致）
- module：`github.com/pocketbase/pocketbase`，`go 1.27`
- inspected：
  - `go.mod`
  - `CHANGELOG.md`
  - `pocketbase.go`
  - `cmd/serve.go`
  - `apis/base.go`
  - `apis/record_crud.go`
  - `apis/realtime.go`
  - `core/base.go`
  - `core/events.go`
  - `core/db_connect.go`
  - `core/settings_model.go`
  - `tools/hook/hook.go`
  - `tools/hook/tagged.go`
  - `plugins/jsvm/jsvm.go`
- observed：
  - `New()` 只构造 `BaseApp` 与 cobra root；`Start()` 注册 `serve` / `superuser` 后 `Execute()`，默认数据目录为可执行文件旁的 `pb_data`；
  - 无 domain 参数时 `serve` 默认 `127.0.0.1:8090`；`apis.NewRouter` 把 CRUD、auth、realtime、file、batch 挂在 `/api`；
  - record CRUD 路径为 `/api/collections/{collection}/records`；`ListRule == nil` 时非 superuser 被拒绝；非空 rule 作为 SQL filter 与客户端 `filter` 同一查询执行；
  - realtime 是 `GET /api/realtime` SSE（`PB_CONNECT`、idle 5 min、max 30 min）加 `POST /api/realtime` 提交 `clientId` + `subscriptions`；
  - `OnRecordCreate(tags...).BindFunc` 需要 `e.Next()`；JS 钩子由 `plugins/jsvm` 加载默认 `pb_data/../pb_hooks` 下的 `*.pb.js` / `*.pb.ts`；
  - 默认 `modernc.org/sqlite` + WAL + `_defensive=1`；`NewFilesystem()` 在 `settings.S3.Enabled` 时走 S3，否则 `pb_data/storage`；
  - 源码 `Version` 字面量为 `(untracked)`，本页按 tag 提交绑定，不把该字面量当成发行版本。

## Appwrite

- canonical source：`https://github.com/appwrite/appwrite`
- revision：`9f8423e2f6fd7237609524a16541430e19f9ee0e`
- GitHub release：`1.9.6`（lightweight tag，与 revision 一致）
- package：`appwrite/server-ce`，`APP_VERSION_STABLE = '1.9.6'`，`php >= 8.3.0`，`ext-swoole` 6
- inspected：
  - `composer.json`
  - `app/init/constants.php`
  - `app/http.php`
  - `app/controllers/api/account.php`
  - `docker-compose.yml`
  - `src/Appwrite/Platform/Modules/Databases/Http/Databases/Collections/Documents/Create.php`
  - `src/Appwrite/Platform/Modules/Databases/Http/DocumentsDB/Collections/Documents/Create.php`
  - `src/Appwrite/Platform/Modules/Databases/Http/TablesDB/Tables/Rows/Create.php`
  - `src/Appwrite/Platform/Modules/Databases/Http/Databases/Collections/Create.php`
  - `src/Appwrite/Platform/Workers/Functions.php`
  - `src/Appwrite/Migration/Migration.php`
- observed：
  - HTTP 入口是 Swoole + Utopia：worker 数为 `_APP_CPU_NUM * _APP_WORKER_PER_CORE`（默认每核 6），并用 `_APP_RISKY_WORKERS_PERCENT`（默认 80%）拆安全/风险 worker；
  - Compose 固定快照含 Traefik 3.6、主 API、console 8.7.30、realtime、多组 worker/task、`openruntimes/executor:0.25.4`、MariaDB 10.11、Mongo 8.2.5、`appwrite/postgres:0.1.0`、Redis 7.4.7；未见 InfluxDB 服务；
  - `POST /v1/account` 与 `POST /v1/account/sessions/email`（别名 `/v1/account/sessions`）仍是邮箱注册/登录；SDK 名分别为 `account.create` 与 `createEmailPasswordSession`；
  - 旧 `POST /v1/databases/:databaseId/collections/:collectionId/documents` 仍在，但 SDK 标注 `deprecated since 1.8.0`，替换为 `tablesDB.createRow`（`POST /v1/tablesdb/:databaseId/tables/:tableId/rows`）；另有 DocumentsDB / VectorsDB；
  - `documentSecurity` 默认 false；开启后文档级与 collection 级权限是“满足其一”；关闭后文档级权限不是访问主路径；
  - Functions worker 从队列取 payload，再交给 Executor；创建文档会注入 `publisherForFunctions` / `queueForRealtime` / `queueForWebhooks`；
  - 迁移表把 `1.9.6` 映射为 `V25`。
