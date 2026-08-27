# Job-scheduler source review (writer IL)

> 用途：记录 Agenda、Bree 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IL
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未连接 Mongo / Postgres，未启动 worker thread，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## Agenda

- canonical source：`https://github.com/agenda/agenda`
- revision：`fd90c624938524f1a8f6793942d40f612acbff64`
- package：`agenda@6.2.6`（monorepo tag `agenda@6.2.6`）
- inspected：
  - `packages/agenda/package.json`
  - `packages/agenda/src/index.ts`（DefaultOptions、constructor、define、every、schedule、now、nowDebounced、start、stop、drain）
  - `packages/agenda/src/Job.ts`（repeatEvery、unique、debounce、save、forkMode）
  - `packages/agenda/src/JobProcessor.ts`（process interval、findAndLockNextJob、shouldLock、stop unlock rule、handleNotification）
  - `packages/agenda/src/utils/nextRunAt.ts`
  - `packages/agenda/src/types/AgendaBackend.ts`
  - `packages/agenda/src/backends/index.ts`
  - `packages/mongo-backend/package.json`
  - `packages/mongo-backend/src/MongoBackend.ts`
- observed：
  - constructor requires `backend: AgendaBackend`; default `processEvery=5000`, `defaultConcurrency=5`, `maxConcurrency=20`, `defaultLockLifetime=10*60*1000`;
  - `define(name, processor, options)` keeps options in the third argument;
  - `every` sets `type='single'` then `repeatEvery`; numeric intervals are milliseconds;
  - `start()` waits for `ready`, optionally connects `notificationChannel`, and guards concurrent callers with `startPromise`;
  - `stop()` unlocks locked-but-not-running jobs only;
  - `MongoBackend.name='MongoDB'` and `notificationChannel` is `undefined` (polling);
  - `@agendajs/mongo-backend` at this commit is `4.0.3`.
- provenance split：
  - npm `agenda@6.2.6` has no `gitHead`;
  - this review binds the reachable package tag `agenda@6.2.6` peeled commit, which matches `packages/agenda/package.json` version `6.2.6`;
  - later commits on `main` after this tag were not used.

## Bree

- canonical source：`https://github.com/breejs/bree`
- revision：`465a5e2f452048c99790229ba813bed795b9f366`
- package：`bree@9.2.9`
- inspected：
  - `package.json`
  - `src/index.js`（constructor defaults、init、run、start、stop、add、remove、createWorker、Bree.extend）
  - `src/job-builder.js`
  - `src/job-validator.js`
  - `src/job-utils.js`（parseValue、isSchedule、getHumanToMs）
  - `UPGRADING.md`（v8 → v9 init contract，quoted only as the error message target）
- observed：
  - tag `v9.2.9^{}`, package version and npm `gitHead` identify the same commit;
  - default `root=resolve('jobs')`, `timeout=0`, `interval=0`, `timezone='local'`, `hasSeconds=false`, `acceptedExtensions=['.js','.mjs']`;
  - `init()` must succeed before worker metadata; `start`/`run` call `init()` if needed;
  - `interval` and `cron` are mutually exclusive; `timeout` and `date` are mutually exclusive;
  - `cron` becomes `later.parse.cron(...)` stored on `job.interval`;
  - `run` warns if a worker already exists; `start` throws if timeout/interval/worker already exists;
  - `stop` posts `cancel` and waits until the worker map entry is gone;
  - runtime dependencies do not include a broker.
