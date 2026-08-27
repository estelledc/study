---
title: Navigo — 用 Q 管道串起匹配、钩子与 History 的 vanilla 路由器
description: 介绍 navigo 8.11.1 如何用自写匹配器、Q 中间件和 before/leave 钩子组织客户端路由。
来源: https://github.com/krasimir/navigo
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/krasimir/navigo
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 8784291784b898f486f565e7d3d5cf44297d250e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.11.1
---

## 是什么

Navigo 是一个无运行时依赖的 vanilla JavaScript 路由器。日常类比：前台有一本自己的对照表，来客报地址时先排队过安检（钩子），再决定带去哪个柜台；需要改门口牌子时，才去动 History。

你写：

```js
const router = new Navigo('/');

router.on('/products/:id', function (match) {
  render(match.data.id, match.params);
});
router.resolve();
router.navigate('/products/42');
```

构造时就会 `listen()` popstate，并给 `[data-navigo]` 链接挂钩。固定 8.11.1 源码在 `src/`，发布物是 `lib/navigo.js` / `lib/es/index.js`。

## 为什么重要

不理解 Navigo 的 Q 管道、自写匹配和「脏标记排队」，就解释不了下面几件事：

- 为什么 `new Navigo('/')` 之后还要再 `resolve()` 才跑当前地址
- 为什么默认只命中第一条路由，而不是把所有匹配都跑一遍
- 为什么 `before` 里 `done(false)` 能挡住跳转
- 为什么 hash 模式下反复改 `location.hash` 会把历史记多一条

## 核心要点

固定 8.11.1 的主链可以拆成五步：

1. **构造就挂监听**：默认 `strategy: "ONE"`、`hash: false`、`linksSelector: "[data-navigo]"`。没传 root 时警告并用 `"/"`。

2. **自己把路径编译成正则**：`:name` / `*name` 变成 `([^/]+)`，光秃 `*` 变成 `?(?:.*)`，`/?` 变成可选段。查询串进 `params`，路径参数进 `data`。

3. **`resolve` 与 `navigate` 是两条 Q 链**：`resolve` 先 `setLocationPath` 再匹配；`navigate` 还要经过废弃选项检查、`force`、匹配，最后 `updateBrowserURL`。命中走 `foundLifecycle`（already → before → handler → after），未命中走 `notFound`。

4. **并发用 `__dirty` 排队**：进行中的 resolve/navigate 把后续调用推进 `__waiting`；收尾由 `waitingList` 调 `__markAsClean` 再取出下一件。

5. **钩子可以叫停**：`before` / `leave` 收到 `done`；传入 `false` 会清理脏标记并中止。同一 route + url + query 再来一次只跑 `already`，不再进 handler。

## 实践示例

### 案例 1：对象登记、命名路由和 generate

```js
router.on({
  '/team/:id': {
    as: 'team',
    uses: function (match) { render(match.data.id); }
  }
});
router.navigateByName('team', { id: '12' });
```

`generate` 把路径里的 `:id` 换成数据。若调用时传入 options 且未设 `includeRoot: true`，会再剥掉 root 前缀。

### 案例 2：before 钩子挡住导航

```js
router.on('/secret', showSecret, {
  before: function (done, match) {
    if (!authed) done(false);
    else done();
  }
});
router.navigate('/secret');
```

`checkForBeforeHook` 把每个 before 包成 Q 步骤。`done(false)` 走 `__markAsClean`，后面的 handler / after / 改 URL 都不会继续。

### 案例 3：hash 路由不再用「清空再写回 hash」滚锚点

```js
const hashRouter = new Navigo('/', { hash: true });
hashRouter.navigate('/about#bio');
```

`updateBrowserURL` 在 History 模式下若当前已有 hash，会用 1ms 定时器把 `location.hash` 清空再写回，强迫滚到锚点，并用 `__freezeListening` 忽略这次 popstate。8.11.1 绑定提交把这段限制成「仅非 hash 模式」，避免 hash 路由多记一条 history（#283）。

## 踩过的坑

1. **把构造当成已经 resolve**：构造只挂监听和链接，当前 URL 要显式 `resolve()`。

2. **`force: true` 并不改地址**：它只 `_setCurrent` 一个合成 Match，然后立刻结束 pipeline。

3. **默认 `strategy: "ONE"`**：匹配到第一条注册路由就 `done()`。要跑多条必须改 `ALL`。

4. **仓库没有 `8.11.1` tag**：本页绑定的是 npm `navigo@8.11.1` 的可达 `gitHead`。最新 git tag 仍是 `8.1.0`。

5. **README 的 gzip 体积不是本轮数据**：未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- 要一只可 `new` 的路由器，自己管 root、hash 和命名路由
- 需要 before / leave / already 和 `data-navigo` 声明式链接
- 不想引入 path-to-regexp，接受 Navigo 自己的 `:param` / `*` 合同

**不适用**：

- 想把路由写成全局 `page(path, fn)` 中间件链——看 [[pagejs]]
- 要编译期路径类型和 search schema——看 [[tanstack-router]]
- 必须绑定「git tag 与 npm version 同名」的 provenance；8.11.1 没有这样的 tag

## 固定版本边界

- 本文绑定 `krasimir/navigo@8784291784b898f486f565e7d3d5cf44297d250e`。npm `navigo@8.11.1` 的 `gitHead` 即此提交，`package.json` 自报 `8.11.1`。
- 该提交之后 `origin/master` 还有文档类合并，版本号未再升。
- `callHandler` 每次都会再跑 `updatePageLinks()`，给后来插入的 `data-navigo` 补监听。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **匹配器和 History 更新是两段管道**——`resolve` 读当前地址，`navigate` 才写 URL。
2. **钩子是否继续，靠 `done(false)`，不是靠抛错**。
3. **`ONE` 是默认策略，不是「只会有一条路由」**。
4. **hash 锚点修复本身也会写 history**——8.11.1 才把它从 hash 模式里拿掉。

## 应用型自测

1. `new Navigo('/')` 之后，当前 pathname 会不会立刻进入 handler？
2. 同一个路由、同一个 query 再 `navigate` 一次，handler 还会跑吗？
3. hash 模式下列出的 `updateBrowserURL` 还会清空再写回 `location.hash` 吗？

检查点：

1. 不会。构造只 `listen` + `updatePageLinks`，要 `resolve()` 才会匹配。
2. 不会。`already` 命中后 `done(false)`，跳过 handler。
3. 不会。绑定提交把这段限制为 `!isItUsingHash`。

## 延伸阅读

- 文档：[navigo DOCUMENTATION.md](https://github.com/krasimir/navigo/blob/master/DOCUMENTATION.md)
- 固定源码：[krasimir/navigo](https://github.com/krasimir/navigo) —— 本文绑定提交 `8784291784b898f486f565e7d3d5cf44297d250e`
- 对照：[[pagejs]] —— Express 风格全局函数 + path-to-regexp
- 对照：[[tanstack-router]] —— 类型化路由树

## 关联

- [[pagejs]] —— 同主题的全局 `page()` 对照
- [[tanstack-router]] —— 编译期路径合同
- [[express]] —— 服务端路由中间件的另一种 `next` 形状

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
