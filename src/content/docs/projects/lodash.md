---
title: Lodash — 以 iteratee 与 wrapper 组织的通用工具函数集
description: 介绍 lodash 4.18.1 如何用 iteratee、wrapper 与 debounce/throttle 组织通用工具函数，并区分 mutate 与 cloneDeep。
来源: https://github.com/lodash/lodash
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lodash/lodash
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: cb0b9b9212521c08e3eafe7c8cb0af1b42b6649e
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 4.18.1
---

## 是什么

Lodash 是一个围绕数组、对象、字符串和函数的 JavaScript 工具库。日常类比：工具墙上一整排扳手，每把都能单独拿；需要连续加工时，也可以先把材料放进托盘（wrapper），走完再倒出来。

你写：

```js
var _ = require('lodash');

_.map(users, 'name');
_.get(user, 'profile.city', 'unknown');
var later = _.debounce(save, 250);
```

`_.map` 的第二个参数可以是函数、属性名或匹配对象；`_.get` 按路径取值；`_.debounce` 返回带 `cancel` / `flush` 的延迟函数。固定 4.18.1 源码仓以 `lodash.js` 作为 UMD 主文件，并另有 `lodash/fp` 构建。

## 为什么重要

不理解 lodash 的 iteratee、wrapper 和“哪些方法会改原对象”，就解释不了下面几件事：

- 为什么 `_.map(users, 'name')` 能当 `user => user.name` 用
- 为什么 `_([1, 2, 3]).map(n => n * 2)` 还不是数组，必须 `.value()`
- 为什么 `_.set(object, 'a.b', 1)` 会改传入的 `object`
- 为什么 `lodash/fp` 的参数顺序和是否改原值，与默认构建不一致

## 核心要点

固定 4.18.1 的主链可以拆成五步：

1. **按需取方法或取全集**：`require('lodash')` 拿 UMD 全集；`require('lodash/map')` 只取单方法；`require('lodash/fp')` 走 immutable / 自动柯里 / iteratee-first / data-last 的 FP 构建。

2. **规范化 iteratee**：`baseIteratee` 把函数原样留下、`null`/`undefined` 当成 identity、数组当成 `matchesProperty`、普通对象当成 `matches`、其余当成 `property`。

3. **可选 wrapper**：`_(value)` 生成 `LodashWrapper`；`_.chain(value)` 额外把 `__chain__` 设为 true。链式方法先记入 wrapper，不立刻算出最终数组。

4. **惰性求值**：部分序列方法有 `LazyWrapper` 对位。`isLaziable` 检查同名方法是否挂在 `LazyWrapper.prototype`；真正取值走 `wrapperValue` → `baseWrapperValue`。

5. **按方法决定是否改原值**：`_.set` / `_.assign` / `_.pull` 等会改入参；`_.cloneDeep`、`_.map` 等返回新值。FP 构建用 `fp/_mapping.js` 的 `mutate` 表把会改原值的方法转成不可变变体。

## 实践示例

### 案例 1：iteratee 三种写法指向同一条规范化路径

```js
var users = [
  { name: 'Ada', active: true },
  { name: 'Bob', active: false }
];

_.map(users, function(user) { return user.name; });
_.map(users, 'name');
_.filter(users, { active: true });
_.find(users, ['name', 'Ada']);
```

属性字符串走 `property`，对象走 `baseMatches`，`['name', 'Ada']` 走 `baseMatchesProperty`。它们都先进入 `baseIteratee`，不是三套独立实现。

### 案例 2：隐式包装要 `.value()` 才出数组

```js
var squares = _([1, 2, 3]).map(function(n) { return n * n; });
Array.isArray(squares);          // false
Array.isArray(squares.value());  // true
```

`lodash(value)` 见到普通对象且不是数组、也不是 `LazyWrapper` 时，会新建 `LodashWrapper`。中间步骤保存 `__wrapped__` 与 `__actions__`；`value()` 才展开。

### 案例 3：debounce 默认只在尾沿触发，throttle 复用同一套实现

```js
var save = _.debounce(writeDraft, 250);
var ping = _.throttle(heartbeat, 1000);

save.cancel();
ping.flush();
```

`debounce` 默认 `leading = false`、`trailing = true`，可用 `maxWait` 封顶等待。`throttle(func, wait)` 直接调用 `debounce(func, wait, { leading: true, maxWait: wait, trailing: true })`。两者都挂 `cancel` 与 `flush`。

## 踩过的坑

1. **把 Lodash 当成“全部纯函数”**：`_.set` 经 `baseSet` 原地写入；路径上的 `__proto__` / `constructor` / `prototype` 会被拒绝并原样返回对象。需要不可变更新时应看 `lodash/fp` 或 [[immer]]。

2. **丢掉 wrapper 的返回值**：`_(arr).map(fn)` 不是数组。隐式链在部分方法后会自动展开，显式 `_.chain` 则一直保持包装，直到 `.value()`。

3. **把 throttle 理解成另一套计时器**：它没有独立时钟实现，只是给 debounce 加上 `maxWait = wait` 且默认 `leading = true`。

4. **把 npm 包的 `gitHead` 当成源码 tag**：`lodash@4.18.1` 的 npm `gitHead` 指向 `4.18.1-npm` 发布树，`lodash-es@4.18.1` 指向 `4.18.1-es`。本页绑定的是源码 tag `4.18.1` 剥皮提交。

5. **把 README 的 gzip 体积当成本轮测量**：文档写过 core / full build 的压缩体积，本轮未安装依赖、未打包、未测体积。

## 适用 vs 不适用场景

**适用**：

- 需要路径读写、集合变换、防抖节流等一组稳定工具，并接受默认构建的 mutate 语义
- 打包器能按 `lodash/<method>` 或 `lodash-es` 做按方法引用
- 想对照 FP 风格时，明确改用 `lodash/fp`，而不是混用默认参数顺序

**不适用**：

- 整条数据管道必须不可变、自动柯里、data-last——应直接看 [[ramda]] 或 `lodash/fp`
- 只做日期计算——[[date-fns]] / [[dayjs]] 的合同更窄
- 需要把“看起来可变、实际不可变”写成默认写法——[[immer]] 更贴
- 不能接受源码仓 `engines.node >= 4` 与多发布树并存的 provenance

## 固定版本边界

- 本文绑定 `lodash/lodash@cb0b9b9212521c08e3eafe7c8cb0af1b42b6649e`，源码 tag 为 `4.18.1`，`lodash.js` 内 `VERSION` 同为 `4.18.1`。
- 源码仓 `package.json` 标记 `private: true`，`main` 为 `lodash.js`；npm `lodash@4.18.1` 的 `gitHead` 是 `4f0b76e2eca13de1c1fe8b4305abc1f7d63f4b86`（`4.18.1-npm^{}`），`lodash-es@4.18.1` 的 `gitHead` 是 `d85490ebfb8f49ddc1eab84892aa33a3ef547894`（`4.18.1-es^{}`）。
- `cloneDeep` 使用 `baseClone(value, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG)`，并用 `Stack` 回指循环引用。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **iteratee 是一层合同，不是语法糖清单**——字符串、对象、二元数组都先规范化，再交给集合方法。
2. **wrapper 把“调用”和“取值”拆开**——惰性与链式依赖 `__actions__` / `LazyWrapper`，不是每次 map 都立刻出数组。
3. **默认构建不保证不可变**——mutate 表在 FP 构建里才被统一改写。
4. **发布树可以和源码 tag 不是同一提交**——读 npm `gitHead` 前要核对应的 `-npm` / `-es` tag。

## 应用型自测

1. `_.throttle(fn, 1000)` 内部会不会新建一套与 `debounce` 无关的计时器？
2. `_.set(object, 'a.b', 1)` 之后，传入的 `object` 是否保持原引用且被改写？
3. 不传 options 的 `_.debounce(fn, 250)`，第一次调用会立刻执行 `fn` 吗？

检查点：

1. 不会。它调用 `debounce`，并传入 `maxWait: wait`。
2. 会保持原引用并改写；`baseSet` 返回同一个 `object`。
3. 不会。默认 `leading` 为 false，只在尾沿触发。

## 延伸阅读

- 文档：[lodash.com/docs](https://lodash.com/docs)
- FP 指南：[lodash/lodash wiki FP-Guide](https://github.com/lodash/lodash/wiki/FP-Guide)
- 固定源码：[lodash/lodash](https://github.com/lodash/lodash) —— 本文绑定提交 `cb0b9b9212521c08e3eafe7c8cb0af1b42b6649e`
- [[ramda]] —— 默认就不可变、自动柯里、data-last 的对照
- [[date-fns]] —— 同一“一功能一函数”思路，但只覆盖日期

## 关联

- [[ramda]] —— 默认构建的 mutate / 参数顺序对照组
- [[date-fns]] —— 日期版的 function-per-feature
- [[immer]] —— 用 draft 写更新，不靠 lodash 的 `set` 原地写入
- [[vite]] —— 全量 `lodash` 小文件会触发依赖预构建
- [[rollup]] —— CJS 全集与 `lodash-es` 的 tree-shake 边界不同
- [[zod]] —— lodash 不做运行时 schema 校验

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
