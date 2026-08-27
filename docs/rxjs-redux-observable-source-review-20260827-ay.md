# RxJS / redux-observable source review

> 用途：记录 PARALLEL writer AY 在 2026-08-27 对 `rxjs`、`redux-observable` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- writer：AY
- review date：2026-08-27
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与仓内文档阅读
- review_mode：`STATIC_REVIEW`
- verification_status：`UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、vitest、bundle、TypeScript 编译或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- 两页均为新建 `study-v2` 笔记；仓库原先没有这两个 slug
- 未改 open PR 已占用 slug，也未改 `xstate`

## RxJS

- canonical source：`https://github.com/ReactiveX/rxjs`
- published identity：git tag `7.8.2`（仓库未使用 GitHub Releases latest）
- revision：`e5351d02e225e275ac0e497c7b66eaa5f0c88791`
- package：`rxjs@7.8.2`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/internal/Observable.ts`
  - `src/internal/Subscription.ts`
  - `src/internal/Subject.ts`
  - `src/internal/config.ts`
  - `src/internal/firstValueFrom.ts`
  - `src/internal/lastValueFrom.ts`
  - `src/internal/observable/innerFrom.ts`
  - `src/internal/operators/switchMap.ts`
  - `src/internal/operators/mergeMap.ts`
  - `src/internal/operators/shareReplay.ts`
- observed：
  - `subscribe` 才进入 `_trySubscribe` / `operator.call`；`pipe` 只组合；
  - 位置参数 `subscribe(next, error, complete)`、`Observable.create` 与 `lift` 标为 v8 移除或内部化；
  - `unsubscribe` 跑 teardown / finalizer，不调用 observer `complete`；
  - `switchMap` 在新内层订阅前对旧内层 `unsubscribe`；
  - `mergeMap` 默认 `concurrent = Infinity`；
  - `shareReplay` 默认 `refCount = false`，并经 `share({ resetOnError: true, resetOnComplete: false, resetOnRefCountZero: refCount })`；
  - `firstValueFrom` 在首值后立即退订；完成且无值时无 `defaultValue` 则 `EmptyError`；
  - 条件 exports 区分 `.`、`./ajax`、`./fetch`、`./operators`、`./testing`、`./webSocket`。
- provenance note：
  - npm `latest` 的 `gitHead` 与 tag `7.8.2` 指向同一 commit；
  - `master` HEAD `54796b38...` 新于本 tag，提交说明为文档；
  - `next` dist-tag 为 `9.0.0-beta.0`，另有 `8.0.0-alpha.*`；本文不绑定预发布线。

## redux-observable

- canonical source：`https://github.com/redux-observable/redux-observable`
- published identity：annotated tag `v3.0.0-rc.3`（npm `latest`，非稳定 semver）
- revision：`a544c2d6aa99b8546e089da94bbf5bbef69d08cd`
- package：`redux-observable@3.0.0-rc.3`
- accessed_at：2026-08-27
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/createEpicMiddleware.ts`
  - `src/combineEpics.ts`
  - `src/epic.ts`
  - `src/operators.ts`
  - `src/StateObservable.ts`
  - `src/utils/console.ts`
- observed：
  - peer 为 `redux@>=5 <6` 与 `rxjs@>=7 <8`；
  - `createEpicMiddleware` 只接受 `options`；把函数当 root epic 传入会在非生产环境抛 `TypeError`；
  - 自造独立 `QueueScheduler`，`action$` / `state$` / 输出都 `observeOn` / `subscribeOn` 这条队列；
  - 中间件先 `next(action)`，再推 `state$`，再推 `action$`；
  - `epic$` 用 `mergeMap` 订阅输出，结果 `subscribe(store.dispatch)`；
  - `combineEpics` 是 `merge`；不返回流会抛 `TypeError`；
  - `ofType` 先 `isAction` 再比较 `type`；
  - `StateObservable` 订阅时先推 `.value`，仅在 `!==` 时更新。
- provenance note：
  - npm `latest` `gitHead` 与 annotated tag 目标 commit 一致；
  - `main` HEAD `847e7e08...` 新于本 tag，是文档现代化合并，未当发布合同；
  - 上一非 RC 标签 `v2.0.0` 指向 `57368e9b...`，peer 为 `redux@>=4 <5`，构造函数合同不同。
