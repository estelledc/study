# Redis client / queue source review (writer AE)

> 用途：记录 ioredis、BullMQ 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL AE
- evidence：GitHub metadata、npm metadata、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未连接 Redis/Postgres，未运行上游 test、worker、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## ioredis

- canonical source：`https://github.com/redis/ioredis`
- revision：`8ed2946504a36ae9b1e186b9dccc56afcd046d78`
- package：`ioredis@6.0.0`
- provenance：npm `gitHead`、GitHub tag `v6.0.0` 与本提交三方一致
- inspected：
  - `package.json`
  - `CHANGELOG.md`
  - `README.md`
  - `lib/index.ts`
  - `lib/Redis.ts`
  - `lib/redis/RedisOptions.ts`
  - `lib/cluster/ClusterOptions.ts`
  - `lib/Pipeline.ts`
  - `lib/transaction.ts`
  - `lib/himport/HimportCoordinator.ts`
- observed：
  - `engines.node` 为 `>=20.0.0`；README 把 v6 矩阵写成 Node >=20、Redis 6.2 ~ latest；
  - 默认 `protocol` 为 `3`（RESP3）；`replyMapping` 默认为 `"legacy"`，因此默认回复形状仍按 RESP2 扁平化；
  - `replyMapping: "resp3"` 只允许与 `protocol: 3` 组合，否则构造期抛错；
  - 默认 `retryStrategy` 是 `min(2^(times-1)*50, 5000)` 再加 0–199ms jitter；`maxRetriesPerRequest` 默认 20；
  - 默认 `lazyConnect` 为 false，构造后立即 `connect()`；`enableOfflineQueue` / `enableReadyCheck` 默认为 true；
  - standalone / Sentinel / Cluster 仍是三条连接路径；Pipeline 与 `MULTI/EXEC` 仍在；
  - `himportFieldsets` 被标为 experimental，并要求 Redis 8.10+；
  - README 写明维护按 best-effort，并把 node-redis 写成新项目推荐客户端。这是上游文档立场，不是本轮运行比较。

## BullMQ

- canonical source：`https://github.com/taskforcesh/bullmq`
- revision：`9d737e9d0e467eeacf6f6a43f3f806fa2873ee1b`
- package：`bullmq@6.3.1`
- provenance：npm `gitHead` 与 GitHub tag `v6.3.1` 一致；该提交树内 `package.json` / `src/version.ts` 仍写 `6.3.0`（发布提交未回写版本号）
- inspected：
  - `package.json`
  - `src/version.ts`
  - `src/index.ts`
  - `src/utils/create-backend.ts`
  - `src/postgres/create-postgres-backend.ts`
  - `src/classes/queue.ts`
  - `src/classes/worker.ts`
  - `src/classes/flow-producer.ts`
  - `src/classes/job-scheduler.ts`
  - `src/classes/redis-connection.ts`
  - `src/types/job-options.ts`
  - `src/interfaces/queue-options.ts`
  - `src/interfaces/worker-options.ts`
  - `docs/gitbook/guide/migrations/migrate-from-v5-to-v6.md`
  - `docs/gitbook/guide/postgresql.md`
  - `docs/gitbook/guide/job-schedulers/README.md`
- observed：
  - 默认 backend 仍是 Redis；`Queue` / `Worker` / `FlowProducer` / `QueueEvents` 依赖 `IQueueBackend`；
  - `ioredis`、`redis`、`pg` 都是 optional peer；未装 ioredis 时，连接选项路径会在加载失败后提示换 client 或改 backend；
  - Worker 构造函数在缺少 `opts.connection` 时抛 `Worker requires a connection`；默认 `concurrency: 1`、`lockDuration: 30000`、`autorun: true`、`drainDelay: 5`、`maxStalledCount: 1`；
  - Redis worker 用独立 blocking connection，注释写明阻塞取活是 `BZPOPMIN`，单次最长 10 秒；
  - `JobsOptions` 不再包含 `repeat`；`Queue.add(..., { repeat })`、`removeRepeatable` 等 v5 API 已在 v6 删除，改走 `upsertJobScheduler` / `removeJobScheduler`；
  - `job.data` 经 `JSON.stringify` 入库，类实例方法不会到 worker 侧；
  - 默认完成后/失败后都保留 job；`removeOnComplete` / `removeOnFail` 的 age/count 清理是“下一次同类结束时 best-effort”，没有后台定时器；
  - PostgreSQL backend 是可选工厂 `createPostgresBackend`，文档要求 Postgres 13+ 与 `pg`；Redis 仍被文档写成默认且更成熟路径；
  - Flow 仍是树：子 job 完成后父 job 才进入处理，并可读取子结果。
