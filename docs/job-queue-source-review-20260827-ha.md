# Job queue source review (writer HA)

> 用途：记录 `bull` 与 `bee-queue` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ha` 标记 2026-08-27 平行 writer HA。本轮不写 ioredis / node-redis / BullMQ 页面（ioredis 已在 PR #71 与 BullMQ 绑定）。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HA
- evidence：GitHub metadata、npm provenance 与固定提交静态源码阅读
- not executed：未安装两仓依赖，未连接 Redis，未跑 mocha / ava / benchmark，未测吞吐或 lock 续期
- worktrees：本机 `research-worktrees/bull` 与 `research-worktrees/bee-queue`（gitignored），不进入 Git

## Bull

- canonical source：`https://github.com/OptimalBits/bull`
- tag：`v4.16.5`（lightweight tag）
- revision：`489c6ab8466c1db122f92af3ddef12eacc54179e`
- package：`bull@4.16.5`
- npm gitHead：与 revision 一致
- engines：`node >= 12`；源码检查 Redis `>= 2.8.18`
- license：MIT
- inspected：
  - `package.json`、`index.js`、`README.md`
  - `lib/queue.js`
  - `lib/job.js`
  - `lib/backoffs.js`
  - `lib/repeatable.js`
  - `lib/commands/addJob-6.lua`
  - `lib/commands/moveToActive-8.lua`
- observed：
  - 默认前缀 `bull`，`toKey` 拼 `prefix:name:type`；六类主结构是 wait/active 列表、delayed/priority/completed/failed 有序集合；
  - 三个客户端：`client` / `eclient` / `bclient`；Lua 动态拼 key，因此删除 ioredis `keyPrefix`；
  - `process(name?, concurrency?, handler)` 按 job name 注册 handler，同名不能注册两次；字符串 handler 走 sandbox 子进程；
  - `add` 无 `repeat` 时走 `Job.create` → `addJob` Lua；有 `repeat` 时走 `cron-parser` 的 `nextRepeatableJob`；
  - 默认 `attempts=1`、`lockDuration=30000`、`stalledInterval=30000`、`maxStalledCount=1`；`process()` 会自己开 stalled 巡检；
  - 排空后用 `bclient.brpoplpush(wait, active, drainDelay)`，默认 `drainDelay=5` 秒；
  - README 写明本仓处于 maintenance，新功能指向 BullMQ。本页不绑定 BullMQ。

## bee-queue

- canonical source：`https://github.com/bee-queue/bee-queue`
- tag：`v2.0.0`（lightweight tag）
- revision：`47130b378df7871fc300e93cdead7602763316c2`
- package：`bee-queue@2.0.0`
- npm gitHead：与 revision 一致
- engines：`node >= 20`；README 写 Redis 2.8+，建议 3.2+
- license：MIT
- inspected：
  - `package.json`、`index.js`、`README.md`
  - `lib/queue.js`
  - `lib/job.js`
  - `lib/defaults.js`
  - `lib/backoff.js`
  - `lib/redis.js`
  - `lib/lua/addJob.lua`
  - `lib/lua/addDelayedJob.lua`
  - `lib/lua/checkStalledJobs.lua`
- observed：
  - 默认前缀 `bq`，key 形如 `bq:name:waiting`；全部 job 正文在一张 `jobs` hash；
  - 结构：waiting/active 列表、delayed zset、succeeded/failed/stalling 集合；
  - `createJob(data)` 只构造，必须 `save()`；重复自定义 id 的 Lua 返回 `nil`；
  - `activateDelayedJobs` 默认 `false`，延迟 job 不会自动升到 waiting；
  - `process()` 只能登记一个 handler，且要求 `isWorker`（默认 true）；启动时做一次 stalled 检查，周期巡检必须自己调 `checkStalledJobs(interval)`；
  - 默认不设 `retries`，`computeDelay()` 在 `retries > 0` 才回头；
  - 防 stall：处理中每 `stallInterval/2` 从 stalling set `SREM`；
  - 运行时依赖 `redis@^3.1.2`，本页不展开该客户端。
