---
title: listr2 — 把 CLI 任务跑成一棵会自己画进度的树
来源: 'https://github.com/listr2/listr2'
日期: 2026-05-30
分类: 工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/listr2/listr2
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: da0f4383f98214a3bc0e6af2f9f9949e6337ce0a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.0.1
---

## 是什么

listr2 是一个 **Node.js 终端任务列表**：你交出一棵 `{ title, task }` 树，它负责排队、并发、失败/回滚，并把状态交给 renderer 画出来。日常类比：冰箱上的菜单——有的菜必须串着做，有的可以同时下锅；listr2 是按菜单炒、并在门口不断改进度牌的助手。

你写：

```ts
import { Listr } from 'listr2'

await new Listr([
  { title: '安装依赖', task: () => install() },
  { title: '编译', task: () => build() },
]).run()
```

固定 11.0.1 里，`new Listr(...)` 先把每条配置包成 `Task`（初态 `WAITING`），`run()` 再启动 renderer，用 `Concurrency` 领取任务。TTY 下默认 `default` renderer；`process.stdout.isTTY !== true` 时落到 `simple`，不是 `verbose`。

## 为什么重要

不读固定 11.0.1，旧印象很容易把 v8/v9 的默认值和 v11 混在一起：

- 为什么 CI 日志常常是一行一行状态，而本机是会转的树——默认 fallback 是 `simple`，要 `verbose` 得自己指定
- 为什么 `listr.errors` 默认是 `null`，不是空数组——`collectErrors` 默认关掉
- 为什么 Ctrl+C 之后进程以 `127` 退出，并且可能先跑 rollback——根实例挂的是持久 `SIGINT`，不是一次性 listener
- 为什么颜色不再依赖 chalk——`color` 用的是 `node:util` 的 `styleText`

## 核心要点

固定源码可以拆成五步：

1. **任务是数据，执行是 `Task` + `TaskWrapper`**：用户写的对象只描述意图。`TaskWrapper` 提供 `title` / `output` / `newListr` / `skip` / `signal`。

2. **状态机比“转圈然后打勾”长**：`ListrTaskState` 从 `WAITING` 出发，还有 `STARTED`、`COMPLETED`、`FAILED`、`SKIPPED`、`ROLLING_BACK`、`ROLLED_BACK`、`RETRY`、`PAUSED`、`PROMPT*`、`CANCELLED`。每次 `state$` 都会发 `SHOULD_REFRESH_RENDER`。

3. **返回值合同**：`handleResult` 只继续等待 `Listr`、`Promise`、Readable、Observable。返回 `42` 不会报错，任务会马上标完成。

4. **并发是限流器，失败会清队列**：`concurrent: false` → `1`，`true` → `Infinity`，数字就是同时在跑的上限。某个已启动任务 rejected 时，`Concurrency` 会 `queue.clear()`，还没领到号的任务不再启动。

5. **default renderer 自己造帧，log-update 负责贴到屏幕**：`lazy: false` 时 `Spinner` 每 100ms 调一次 `create()`；真正写终端走动态 `import('log-update')` 的 `createLogUpdate`。结束时先 `clear()` + `done()`，再按 `clearOutput` 决定要不要把最后一帧持久写回。

## 实践示例

### 案例 1：运行时展开子树

```ts
await new Listr([
  {
    title: 'build',
    task: (_ctx, task) => task.newListr([
      { title: 'lint', task: () => lint() },
      { title: 'bundle', task: () => bundle() },
    ], { concurrent: true }),
  },
]).run()
```

`newListr` 把当前 `Task` 当作 parent。子列表会被改成 `silent` renderer，由外层 default renderer 画缩进。`concurrent: true` 在这一层变成 `Infinity`。

### 案例 2：限流并发，失败后继续收口

```ts
const list = new Listr(
  hosts.map((host) => ({
    title: `部署 ${host}`,
    task: () => deploy(host),
  })),
  { concurrent: 4, exitOnError: false, collectErrors: true },
)

await list.run()
console.log(list.errors?.length ?? 0)
```

`exitOnError: false` 让单个失败不炸掉整棵树。默认 `collectErrors: false` 时 `errors` 是 `null`；只有显式打开才会得到数组。旧文里的 `tasks.err` 不是这个 API。

### 案例 3：把进度写进 output 通道

```ts
{
  title: '下载权重',
  task: async (_ctx, task) => {
    for await (const chunk of stream) {
      task.output = `${chunk.percent}%`
    }
    task.output = null
  },
}
```

`task.output = '...'` 走 `OUTPUT` 事件。赋 `null` 会 `OUTPUT_RESET`，清掉 output / bottom bar 缓冲。Readable 的 `data` 和 Observable 的 `next` 也会写进同一条通道。

## 踩过的坑

1. **把 fallback 当成 `verbose`**：构造默认 `fallbackRenderer: 'simple'`。CI 里是按状态打一行的 simple，不是 verbose 那种更啰嗦的日志。
2. **读 `listr.errors.length` 而不判空**：默认是 `null`。要用 `listr.errors?.length`，或先开 `collectErrors: true`。
3. **强制 `renderer: 'default'` 跑在非 TTY**：`DefaultRenderer.nonTTY = false`。自己关掉自动降级，log-update 仍会写控制码；本轮未在管道里实测污染量。
4. **普通返回值当成功**：没返回 Promise / stream / Observable / 子 `Listr`，UI 会立刻完成。
5. **把颜色归因于 chalk**：固定包依赖是 `cli-truncate`、`log-update`、`wrap-ansi`。调色板在 `node:util`。

## 适用 vs 不适用场景

**适用**：

- 单进程 CLI 的多步流水线，需要 TTY 树和 CI 逐行两种画法
- 要限流并发，并且接受“第一个失败会清掉还没启动的队列”
- 需要 rollback / retry / prompt adapter，而不是自己堆 spinner

**不适用**：

- 长寿命 daemon 或跨进程编排——这是跑完就退出的批处理模型
- 必须兼容 Node 22.13 以下——`engines.node` 写的是 `>=22.13.0`
- 需要本轮未核验的下载量、webpack-cli / nx 集成或帧率数字

## 固定版本边界

- 本文绑定 `listr2/listr2@da0f4383...`，tag `listr2@11.0.1` 与 npm `gitHead` 同一提交。
- 仓是 monorepo：`listr2`、`@listr2/manager`、两个 prompt adapter。workspace `package.json` 的 `version` 仍是 `1.0.0`，发布号以 tag / npm 为准。
- 默认 renderer 依赖 `log-update@^8.0.0`；CHANGELOG 11.0.0 写明改用 v8 的 partial update。
- 根 `SIGINT` 会 `abort()`，等已启动任务的 rollback，再 `process.exit(127)`。
- 本文未安装依赖、运行 Jest 或在真实终端截帧，状态保持 `UNVERIFIED`。

## 学到什么

1. **列表库的默认值比 slogan 重要**——fallback、errors、并发失败策略都写在 constructor，不在 README 口号里。
2. **渲染器和执行器是两条寿命**——子 Listr 换成 silent，是为了不抢同一块屏幕。
3. **屏幕更新可以是“整树字符串 + 终端补丁”**——`create()` 仍拼整帧，log-update 8 再决定擦哪几行。
4. **中断是一等状态**——`CANCELLED` 和 `127` 是源码合同，不是“用户自己杀进程”的旁白。

## 应用型自测

1. 不传选项时，非 TTY 会落到哪个 renderer？`verbose` 是默认 fallback 吗？
2. `collectErrors` 保持默认，`list.errors` 是 `[]` 还是 `null`？
3. 任务函数 `return 42`，UI 会一直转圈等你吗？

检查点：

1. `simple`。不是。默认 `fallbackRenderer` 是 `'simple'`。
2. `null`。只有 `collectErrors: true` 才是数组。
3. 不会。普通值会立刻完成。

## 延伸阅读

- 文档：[listr2.kilic.dev](https://listr2.kilic.dev)
- 固定源码：[listr2/listr2](https://github.com/listr2/listr2) —— 本文绑定提交 `da0f4383f98214a3bc0e6af2f9f9949e6337ce0a`
- 对照入口：`packages/listr2/src/listr.ts`、`lib/task.ts`、`renderer/default/renderer.ts`
- [[log-update]] —— default renderer 真正往终端打补丁的那一层
- [[ora]] —— 单行 spinner；listr2 管的是一棵任务树

## 关联

- [[log-update]] —— 多行覆盖写回；listr2 11 把它钉在 ^8
- [[ora]] —— 单任务动画，没有任务图
- [[ink]] —— 用 React reconciler 画终端，比任务列表重
- [[commander]] —— 解析参数；进度列表是另一层
- [[enquirer]] —— prompt adapter 的可选对端，不在核心包里

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boxen]] —— boxen — 给终端文本套个边框的事
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[ora]] —— ora — 终端 spinner 用 ANSI 反复擦写同一行
