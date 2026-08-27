---
title: RxJS — 用订阅启动、用退订回收的推式流
description: 固定 7.8.2 的冷订阅、退订与展平/多播默认值。
来源: https://github.com/ReactiveX/rxjs
日期: 2026-08-27
分类: 响应式编程 / 状态管理
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ReactiveX/rxjs
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: e5351d02e225e275ac0e497c7b66eaa5f0c88791
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.8.2
---

## 是什么

RxJS 是一套把“随时间展开的值”写成对象的库。日常类比：像一张只有写好线路、还没发车的公交时刻表——`pipe` 只画换乘，`subscribe` 才发车；`unsubscribe` 停车并回收车辆，但不会假装“本班次正常到站”。

你写：

```ts
import { fromEvent, map, debounceTime } from "rxjs";

const clicks$ = fromEvent(document, "click").pipe(
  debounceTime(200),
  map((event) => (event as MouseEvent).clientX),
);
const sub = clicks$.subscribe({ next: (x) => console.log(x) });
sub.unsubscribe();
```

`fromEvent` 这类源默认是冷的：每次订阅各自启动一份工作。`Subject` 才是热的多播口。固定 7.8.2 还提供 `rxjs/ajax`、`rxjs/fetch`、`rxjs/webSocket` 和 `rxjs/testing` 子路径。

## 为什么重要

不理解 RxJS，下面这些事都没法解释：

- 为什么写出一长串 `pipe` 后界面仍无反应
- 为什么 `unsubscribe` 不会触发 `complete`
- 为什么 `switchMap` 能取消上一次请求，而默认 `mergeMap` 会并发跑完
- 为什么 `shareReplay(1)` 在没人听之后仍可能继续占着上游

## 核心要点

主链可以拆成五步：

1. **构造源**：`new Observable(subscribe)` 只保存订阅函数；`of` / `from` / `interval` 等工厂决定何时 `next` / `error` / `complete`。
2. **组合运算符**：`pipe` 返回新 Observable，不订阅。`switchMap` 在新的内层到来时对上一层 `unsubscribe`；`mergeMap` 默认 `concurrent = Infinity`。
3. **订阅启动**：`subscribe` 包成 `SafeSubscriber`，再进入 `_trySubscribe` 或 lift 后的 `operator.call`。
4. **退订回收**：`Subscription.unsubscribe` 先跑 initial teardown，再跑 `add` 进去的 finalizer；退订不是完成信号。
5. **桥到 Promise**：`firstValueFrom` 收到第一个值就退订；源若先完成且没值，无 `defaultValue` 时拒绝 `EmptyError`。`lastValueFrom` 必须等到完成。

## 实践示例

### 案例 1：搜索框用 switchMap 取消过期请求

```ts
import { fromEvent, switchMap, debounceTime, map } from "rxjs";

fromEvent(input, "input").pipe(
  debounceTime(200),
  map(() => input.value.trim()),
  switchMap((q) => fetch(`/search?q=${q}`)),
).subscribe();
```

新输入会退订上一次 `fetch` 转成的内层。若改成默认 `mergeMap`，旧请求仍会回来写界面。

### 案例 2：shareReplay 默认不按引用计数关源

```ts
import { interval, shareReplay, take } from "rxjs";

const ticks$ = interval(1000).pipe(shareReplay(1));
const a = ticks$.subscribe();
a.unsubscribe();
```

固定实现里 `refCount` 默认 `false`：最后一个订阅者离开后，内部 `ReplaySubject` 仍连着上游。要随引用归零而退订，必须 `shareReplay({ bufferSize: 1, refCount: true })`。

### 案例 3：firstValueFrom 不是“永远可 await”

```ts
import { EMPTY, firstValueFrom } from "rxjs";

await firstValueFrom(EMPTY); // 拒绝 EmptyError
```

源既不发光也不完成时，Promise 会一直挂起。只对“会发光或会完成”的流使用；否则加 `timeout` / `take`。

## 踩过的坑

1. **把 `pipe` 当成启动**：没有 `subscribe` 或 `firstValueFrom` 这类终端，冷源不会工作。
2. **以为退订等于 complete**：源码明确 `complete` 只留给正常结束；`unsubscribe` 只做回收。
3. **把 `shareReplay` 当成会自动停的缓存**：默认 `refCount: false`，`resetOnComplete` 也是 `false`。
4. **漏写 error 回调**：未处理错误会异步抛出，`try/catch` 包不住 `subscribe` 调用本身。
5. **继续用位置参数 `subscribe(next, error, complete)`**：7.8.2 仍接受，但标成 v8 将删除。

## 适用 vs 不适用场景

**适用**：

- 需要取消、并发上限或完成语义的异步编排
- 要把 DOM 事件、计时器和 Promise 收进同一条管道
- 上层已经约定用 Observable，例如 [[redux-observable]]

**不适用**：

- 只想要同步状态快照——先看 [[zustand]] / [[jotai]] / [[valtio]]
- 需要显式状态机图——看 [[xstate]]
- 不能接受“未处理错误异步抛出”和冷/热混用的心智成本
- 想跟尚未发布的 8/9 线 API 对齐；本文不绑定 alpha/beta

## 固定版本边界

- 本文绑定 `ReactiveX/rxjs@e5351d02...`，tag 与 npm `rxjs@7.8.2` 的 `gitHead` 一致。
- 访问当日 `master` 新于本 tag，主要是文档；没有更新的稳定 tag。`next` dist-tag 指向 `9.0.0-beta.0`，未采用。
- `rxjs/operators` 仍可深导入；根入口也再导出同一批运算符。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **订阅才是执行**——对象图可以先搭好，资源从 `subscribe` 才开始占用。
2. **取消和完成是两条通道**——停车不等于到站广播。
3. **展平运算符的差别在退订策略**——`switchMap` 切线，`mergeMap` 默认全开，`concatMap` / `exhaustMap` 另有排队与拒绝。
4. **多播默认值必须读源码**——`shareReplay` 的 `refCount` 不能靠“共享”二字外推。

## 应用型自测

1. `of(1, 2).pipe(map(x => x + 1))` 在没有终端订阅时会打印或发网络请求吗？
2. 对 `interval(1000)` 调用 `unsubscribe()`，`complete` 回调会跑吗？
3. `shareReplay(1)` 的最后一个订阅者离开后，上游 `interval` 默认会停吗？

检查点：

1. 不会。`pipe` 只返回新 Observable。
2. 不会。退订不发送 `complete`。
3. 不会默认停。需要显式 `refCount: true`。

## 延伸阅读

- 文档：[rxjs.dev](https://rxjs.dev/)
- 固定源码：[ReactiveX/rxjs](https://github.com/ReactiveX/rxjs) —— 本文绑定提交 `e5351d02e225e275ac0e497c7b66eaa5f0c88791`
- [[redux-observable]] —— 把本库接进 Redux 5 的 epic 中间件
- [[xstate]] —— 显式状态机，不靠操作符取消语义
- [[effect]] —— 另一条把副作用写进类型的 TypeScript 路线

## 关联

- [[redux-observable]] —— epic 的 `action$` / `state$` 就是本库 Observable
- [[react]] —— 常见宿主；取消仍要自己接到组件生命周期
- [[xstate]] —— 状态图 vs 推式流
- [[zustand]] —— 同步 snapshot store，没有冷订阅模型
- [[effect]] —— 同步/异步效应的类型级编排
