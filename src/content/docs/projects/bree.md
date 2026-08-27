---
title: Bree — 用 worker thread 在本进程里跑作业脚本的调度器
description: 介绍 bree 9.2.9 如何用 timeout/interval/cron 和 Worker 组织进程内作业。
来源: https://github.com/breejs/bree
日期: 2026-08-27
分类: 基础设施
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/breejs/bree
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 465a5e2f452048c99790229ba813bed795b9f366
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 9.2.9
---

## 是什么

Bree 是一个面向 Node.js 的进程内作业调度器。日常类比：你在本店后厨墙上钉了一排独立工位；到点就打开一扇门（worker thread）进去干活，干完关门。隔壁店看不到这面墙，也没有共享账本。

固定 9.2.9 用 CJS 入口 `src/index.js`。作业默认从 `resolve('jobs')` 目录按名字找 `.js` / `.mjs`；也可以在配置里写函数，那时会走 `worker.eval`。

```js
const Bree = require("bree");

const bree = new Bree({
  jobs: [
    { name: "email", cron: "0 9 * * *" },
    { name: "cleanup", interval: "1h" }
  ]
});

await bree.start();
```

`start()` 若还没 `init()`，会先 `init()`：校验 root、把 cron 编成 `@breejs/later` schedule，再按 timeout / date / interval 挂 `safe-timers` 或 `later.setInterval`。真正执行是 `new Worker(job.path)`。

## 为什么重要

不理解 Bree 的“配置数组 + 线程 + 没有共享存储”，就解释不了下面几件事：

- 为什么部署 3 个 Node 实例会把同一条 cron 跑 3 遍
- 为什么 `timeout: 0` 不是“不跑”，而是下一轮事件循环立刻跑
- 为什么同一个 name 不能同时再 `start()`，但 `run()` 只会警告
- 为什么 v9 必须先成功 `init()`，否则 `getWorkerMetadata` 会直接抛错

## 核心要点

固定 9.2.9 的主链可以拆成五步：

1. **构造只收配置**：默认 `root=resolve('jobs')`、`timeout=0`、`interval=0`、`timezone='local'`、`hasSeconds=false`、`acceptedExtensions=['.js','.mjs']`、`closeWorkerAfterMs=0`。`defaultExtension` 不能带前导点。
2. **`init()` 才落地**：jobs 为空且 `doRootCheck` 时，会去 `import(jobs/index.js)` 的 default 导出。字符串作业名会拼路径并 `stat`；`index` / `index.js` / `index.mjs` 是保留名。
3. **时间字段互斥**：`interval` 与 `cron` 不能同时出现；`timeout` 与 `date` 不能同时出现。`cron` 字符串经 `cron-validate` 校验后，在 `buildJob` 里变成 `later.parse.cron(...)`。
4. **`start` 挂闹钟，`run` 开线程**：有限 timeout 走 `setTimeout`；schedule 走 `later.setTimeout` / `later.setInterval`。`run(name)` 若该 name 已有 worker，只 `warn` 后返回。过去的 `date` 会 `warn` 并 `emit('job past')`，不抛错。
5. **`stop` 发 `cancel` 再等退出**：给 worker `postMessage('cancel')`，并用 `p-wait-for` 等到 Map 里没有这个 name。`removeCompleted` 只在没有残留 timeout/interval 时从数组删掉作业。

## 实践示例

### 案例 1：目录作业和 cron

```js
const bree = new Bree({
  root: require("node:path").join(__dirname, "jobs"),
  hasSeconds: false,
  jobs: ["email", { name: "report", cron: "0 9 * * *" }]
});
await bree.start();
```

字符串 `"email"` 会被建成 `{ name, path: root/email.js, timeout: 0, interval: 0 }`。默认 timeout 是 `0`，所以 `start('email')` 会在 0ms 后 `run` 一次；没有正 interval 就不会重复。

### 案例 2：函数作业走 eval worker

```js
const bree = new Bree({
  jobs: [
    function ping() {
      console.log("pong");
    }
  ]
});
await bree.start();
```

`buildJob` 把函数序列化成 `(${fn.toString()})()`，并设 `worker: { eval: true }`。绑定函数或 native 函数在校验期会被拒绝。

### 案例 3：`run` 与 `start` 对“已经在跑”态度不同

```js
await bree.start("email");
await bree.run("email");   // 已有 worker 时只警告
await bree.start("email"); // 抛 Job "email" is already started
```

`start` 看到 timeout / interval / worker 任一还在就抛错。`run` 只检查 `workers` Map。

## 踩过的坑

1. **把 Bree 当成跨进程队列**：它没有 repository，也没有锁。三个副本就是三套闹钟。跨进程账本看 [[agenda]]。
2. **把 `timeout: 0` 理解成禁用**：有限 timeout 一律 `setTimeout(..., job.timeout)`；`0` 是立即第一次。要“只按 cron、不要先跑一次”，应只设 `cron` / `interval`，不要依赖默认 timeout 去取消。
3. **同时写 `interval` 和 `cron`**：`validateJob` 直接报错。`buildJob` 会把 cron 写进 `interval` 字段，所以配置层必须二选一。
4. **作业名叫 `index`**：保留给 `jobs/index.js` 的目录清单。
5. **v8 习惯构造完就能 `getWorkerMetadata`**：v9 要求 `_init === true`，否则抛错并指向 `UPGRADING.md`。

## 适用 vs 不适用场景

**适用**：

- 单进程服务里按 cron / 人类时间 / Date 跑独立脚本
- 希望作业隔离在 worker thread，并能 `postMessage('done')` 或 `closeWorkerAfterMs` 收尾
- 不打算引入 Mongo / Postgres / 外部 broker

**不适用**：

- 多实例只想跑一份定时任务——需要 [[agenda]] 这类带锁的存储
- 作业之间要共享失败账本、重试次数和 dashboard
- 把 Bree 的 keywords 里出现的 Redis / Bull 字样当成它的运行时依赖——`package.json` 依赖只有 later、cron-validate、human-interval、ms、safe-timers 等，没有 broker

## 固定版本边界

- 本文绑定 `breejs/bree@465a5e2f452048c99790229ba813bed795b9f366`。annotated tag `v9.2.9` 剥开后、`package.json` 的 `9.2.9` 与 npm `bree@9.2.9` 的 `gitHead` 指向同一提交。
- `engines.node` 为 `>=12.17.0 <13.0.0-0||>=13.2.0`。`main` 是 `src/index.js`，`types` 是 `src/index.d.ts`。
- `Bree.extend` 按 Day.js 风格只安装一次插件（`plugin.$i`）。
- 本文未安装依赖、启动 worker、运行上游测试或测量线程开销，状态保持 `UNVERIFIED`。

## 学到什么

1. **进程内调度没有分布式锁**——副本数等于执行倍数。
2. **timeout 是第一次，interval/cron 是以后**——两者在 `start()` 里分阶段挂上。
3. **作业是文件或 eval 字符串，不是注册在内存里的 async 函数表**——路径校验发生在 `init()`。
4. **v9 把 init 从隐式变成合同**——先建配置，再 `init`/`start`，才能碰 worker 元数据。

## 应用型自测

1. 默认配置下，`jobs: ['email']` 且 `jobs/email.js` 存在，`start()` 后第一次执行大概在什么时候？
2. 同一进程里对已经 `start('email')` 的作业再调 `start('email')`，会怎样？
3. `{ name: 'tick', interval: '10s', cron: '* * * * *' }` 能通过 `init()` 吗？

检查点：

1. 约在当前事件循环之后立刻跑。默认 `timeout` 是 `0`。
2. 抛 `Job "email" is already started`。
3. 不能。`interval` 与 `cron` 互斥。

## 延伸阅读

- 固定源码：[breejs/bree](https://github.com/breejs/bree) —— 本文绑定提交 `465a5e2f452048c99790229ba813bed795b9f366`
- 默认配置与 Worker：[src/index.js](https://github.com/breejs/bree/blob/465a5e2f452048c99790229ba813bed795b9f366/src/index.js)
- cron 如何变成 interval：[src/job-builder.js](https://github.com/breejs/bree/blob/465a5e2f452048c99790229ba813bed795b9f366/src/job-builder.js)
- [[agenda]] —— 带 backend 锁的持久化对照
- 升级说明：[UPGRADING.md](https://github.com/breejs/bree/blob/465a5e2f452048c99790229ba813bed795b9f366/UPGRADING.md)

## 关联

- [[agenda]] —— 跨进程账本与锁；Bree 没有这一层
- [[inngest]] —— 步骤恢复，不是目录脚本闹钟
- [[temporal]] —— 工作流运行时，远重于 worker thread
- [[node-js]] —— `worker_threads.Worker` 是 Bree 的执行器

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[agenda]] —— Agenda — 把任务状态交给可插拔 backend 的 Node 调度器
