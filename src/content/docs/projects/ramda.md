---
title: Ramda — 自动柯里、data-last 的实用函数式工具库
description: 介绍 ramda 0.32.0 如何用自动柯里、占位符和路径拷贝组织 data-last 函数管道。
来源: https://github.com/ramda/ramda
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ramda/ramda
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: f0b1fb524a681bc8c37dd6c35886420f8c2470c3
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.32.0
---

## 是什么

Ramda 是一个面向实用函数式编程的 JavaScript 工具库。日常类比：流水线上先装好“怎么处理”，最后才放原料；每个工位默认复印一份再改，不在原件上涂。

你写：

```js
import * as R from 'ramda';

const names = R.map(R.prop('name'));
names([{ name: 'Ada' }, { name: 'Bob' }]);
```

`R.map` 和 `R.prop` 都已柯里化，数据参数在最后。先拿到 `names`，再喂数组。固定 0.32.0 的 `source/index.js` 导出 272 个公开符号，`package.json` 声明 `sideEffects: false`。

## 为什么重要

不理解 Ramda 的柯里、占位符和“复制路径再写入”，就解释不了下面几件事：

- 为什么 `R.map(fn)` 可以先当转换器保存，稍后再给列表
- 为什么 `R.pipe` 的结果不会自动再柯里一次
- 为什么 `R.assoc('c', 3, obj)` 不会改 `obj`
- 为什么带默认参数的函数丢给 `R.curry` 会在中途炸掉

## 核心要点

固定 0.32.0 的主链可以拆成五步：

1. **按函数拆源码再组装导出**：作者源在 `source/`；`require` 走构建后的 `src/index.js`，`import` 走 `es/index.js`。条件 exports 同时暴露 `./src/*`、`./es/*`、`./dist/*`。

2. **自动柯里**：多数函数经 `_curry1` / `_curry2` / `_curry3` 或 `curryN` 包装。`R.curry(fn)` 用 `fn.length` 当 arity；一次可以喂多个实参，不必只喂一个。

3. **占位符补洞**：`R.__` 是 `{ '@@functional/placeholder': true }`。`_curryN` 遇到占位符会留下空位，等后续调用填上，再决定是执行还是继续返回柯里函数。

4. **管道不自动柯里**：`R.pipe` 要求至少一个函数，第一函数可多元，其余必须一元；结果只保证 arity 等于第一个函数的 `length`。`R.compose` 是 `pipe.apply(this, reverse(arguments))`。`R.flow`（自 0.30.0）则是 `seed + 函数数组` 的立即求值管道。

5. **写入先复制路径**：`R.assoc` 转到 `assocPath`；沿路径浅拷贝，非原语仍按引用挂上。`R.map` 经 `_dispatchable` 分发到 `fantasy-land/map` / `map`、transducer 或默认数组/对象实现，默认实现写新结构。

## 实践示例

### 案例 1：先拼转换器，最后才给数据

```js
const rename = R.map(R.prop('name'));
rename([{ name: 'Ada' }, { name: 'Bob' }]); // => ['Ada', 'Bob']

R.map(R.prop('name'), [{ name: 'Ada' }]);   // 一次喂完也可以
```

`map` 是 `_curry2`。只给 iteratee 时返回新函数；再给 list 才遍历。对象会走 `keys` 后写入新对象，不会改原对象。

### 案例 2：`R.__` 把中间参数留空

```js
const greet = R.replace('{name}', R.__, 'Hello, {name}!');
greet('Alice'); // => 'Hello, Alice!'
```

`replace` 是三元柯里。第二次参数用占位符时，返回的函数只缺那一个洞。`_isPlaceholder` 认的是 `@@functional/placeholder === true`，不是任意假值。

### 案例 3：`assocPath` 复制路径，不改原对象

```js
const user = { a: { b: { c: 0 } } };
const next = R.assocPath(['a', 'b', 'c'], 42, user);
// next.a.b.c === 42
// user.a.b.c === 0
```

路径上缺失或非对象的节点会被换成 `[]` 或 `{}`。注释写明：原型属性会被摊到新对象上，非原语按引用复制。这是浅路径拷贝，不是整树 `clone`。

## 踩过的坑

1. **以为 `R.pipe` / `R.compose` 会自动柯里**：源码写明结果不自动柯里。`pipe(f, g, h)(a)(b)` 的符号展开是 `h(g(f(a)))(b)`，不是 `h(g(f(a, b)))`。

2. **把默认参数函数丢给 `R.curry`**：`curry` 用 `fn.length`。默认参数不计入 length，于是 `curry((a, b, c = 2) => a + b + c)` 会在第三次调用时把数字当函数执行。

3. **把 `R.assoc` 当成深拷贝**：它只复制到写入路径；兄弟分支仍共享引用。要断开整棵树需 `R.clone`，且函数仍按引用复制。

4. **以为 `R.map` 只处理数组**：对象走 `keys`；函数会被组合成新函数；带 `map` / `fantasy-land/map` 的 functor 会 dispatch；transformer 则进入 transducer。

5. **把“从不改用户数据”理解成运行时强制**：设计目标是尽量无副作用，库并不拦截你传入的可变对象在回调里被改写。

## 适用 vs 不适用场景

**适用**：

- 想先拼 data-last 管道，再在调用处喂数据
- 需要默认不可变的对象/列表更新，并能接受路径拷贝语义
- 打包器能消费 `sideEffects: false` 的 ESM / CJS 条件导出

**不适用**：

- 团队习惯 `_.set` / `_.assign` 原地更新——先看 [[lodash]] 默认构建，不要只改 import 名
- 只要防抖节流、模板字符串这类宿主副作用工具——Ramda 核心不提供与 `_.debounce` 对位的实现
- 需要 draft 赋值语法——[[immer]] 更贴近
- 不能接受 `R.curry` 依赖 `function.length` 的边界

## 固定版本边界

- 本文绑定 `ramda/ramda@f0b1fb524a681bc8c37dd6c35886420f8c2470c3`，tag `v0.32.0` 与 npm `ramda@0.32.0` 的 `gitHead` 指向同一提交。
- `package.json` 无运行时依赖；`exports` 区分 `require` → `./src/index.js` 与 `import` → `./es/index.js`。
- `source/index.js` 在该提交有 272 条 `export { default as ... }`。
- `R.flow` 自 v0.30.0 加入，语义是 `reduce(applyTo, seed, pipeline)`。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **data-last 是为了柯里，不是为了好看**——先固定变换，再接数据，才能把 `R.map(R.prop('name'))` 存成值。
2. **管道和柯里是两层合同**——`pipe` / `compose` 不自动柯里；要部分应用请用已经柯里过的函数，或显式 `curry`。
3. **不可变更新通常只复制路径**——`assocPath` 共享未触及的子树；循环引用与函数复制边界由 `clone` 另说。
4. **dispatch 让同一函数服务数组、对象、functor 和 transducer**——读 `_dispatchable` 比背 API 列表更重要。

## 应用型自测

1. `R.pipe(Math.pow, R.negate)` 的返回值，能像 `R.map` 那样先只喂一个参数再喂第二个吗？
2. `R.assoc('c', 3, obj)` 会不会改 `obj` 本身？
3. `R.curry((a, b, c = 2) => a + b + c)(1)(2)` 接下来再喂 `7`，会得到 `10` 吗？

检查点：

1. 不能按柯里函数理解。`pipe` 明确不自动柯里，arity 等于第一个函数的 `length`。
2. 不会。`assoc` 返回新对象，原对象保持原值。
3. 不会稳定得到 `10`。默认参数使 `fn.length` 变小，第三次调用可能把数字当函数执行。

## 延伸阅读

- 文档：[ramdajs.com](https://ramdajs.com/)
- 固定源码：[ramda/ramda](https://github.com/ramda/ramda) —— 本文绑定提交 `f0b1fb524a681bc8c37dd6c35886420f8c2470c3`
- [[lodash]] —— 默认构建的 mutate / iteratee-first 对照组
- [[immer]] —— 另一条不可变更新路线：draft 赋值而不是 data-last 管道

## 关联

- [[lodash]] —— 通用工具库对照组；FP 构建才接近 Ramda 的参数顺序
- [[immer]] —— 不可变状态更新的另一种写法
- [[date-fns]] —— 同样强调独立纯函数，但领域收在日期
- [[zod]] —— Ramda 变换数据，不验证外部 schema

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
