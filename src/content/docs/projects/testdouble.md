---
title: testdouble.js — 先排练一次调用，再决定返回或核对
description: when/verify 吃的是全局最后一次 double 调用；模块替换靠 quibble，ESM 要 loader。
来源: https://github.com/testdouble/testdouble.js
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/testdouble/testdouble.js
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 293753e7380eab997a23d09014f4595313c2f2b0
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.20.2
---

## 是什么

testdouble.js 是一个面向 TDD 的最小替身库。日常类比：它不像先造假人再教台词，而像彩排——你当着导演的面把那句调用演一遍，`td.when` 记下这场戏，正式开演时按最后一次排演给结果。

发布入口（`src/index.js` / `src/index.mjs`）用的是 `function.js`、`when.js`、`verify.js` 这一套全局 call store，不是旁边那组 CallLog 目录。

```js
import * as td from "testdouble";

const quack = td.function("quack");
td.when(quack("soft")).thenReturn("quack");
quack("soft"); // "quack"
```

`when()` 并不读取第一个参数。它 `pop()` 任意 test double 的最近一次调用，把这次当作 rehearsal。

## 为什么重要

不理解 rehearsal、last-in-wins 和 quibble，就解释不了：

- 为什么要把完整调用写进 `td.when(fn(arg))`，而不是 `when(fn).withArgs(arg)`
- 为什么后写的 stubbing 会盖住先写的宽规则
- 为什么同一组参数既 `when` 又 `verify` 会收到冗余警告
- 为什么 ESM 替换必须 `await td.replaceEsm` 且进程带 `--loader=testdouble`

## 核心要点

testdouble 主链可以拆成五步：

1. **造 double**：`td.function(name)` 登记到 store，每次调用 `calls.log` 再 `stubbings.invoke`。`td.object` 可以吃方法名数组、可模仿对象，或（有 Proxy 时）一个名字；传入函数会报错（2.0.0 起改走 `function` / `constructor` / `instance`）。

2. **排练 stubbing**：`td.when(double(...args), options)` 弹出最后一次调用。没有 rehearsal 就抛 `td.when` 错误。`thenCallback` 若参数里没有 callback matcher，会自动补一个。

3. **匹配并交付**：`_.findLast` 找最后一条参数匹配且 `times` 未用尽的 stubbing。`thenReturn` 按 `callCount` 取序列值，超出后停在最后一项；还有 `thenDo` / `thenThrow` / `thenResolve` / `thenReject`。

4. **核对副作用**：`td.verify(double(...args), config)` 同样 pop 最近一次调用。命中则通知 matcher；未命中抛出 Wanted / Actual 列表。`times`、`ignoreExtraArgs`、`cloneArgs` 是配置，不是链式 API。

5. **替换与复位**：字符串路径走 quibble（Jest CJS 有专用分支）；对象属性则赋值并登记 `onNextReset`。`td.reset()` 清 store、`quibble.reset()` 以及两类 reset handler。

## 实践示例

### 案例 1：排练精确参数

```js
const load = td.function("load");
td.when(load({ id: 1 })).thenReturn({ name: "Ada" });

load({ id: 1 });            // { name: "Ada" }
load({ id: 2 });            // undefined
```

默认用 lodash `_.isEqual` 比参数，且 arity 必须相同，除非 `ignoreExtraArgs: true`。

### 案例 2：后写的规则赢

```js
const roll = td.function();
td.when(roll(td.matchers.anything())).thenReturn("generic");
td.when(roll("crit")).thenReturn("20");

roll("crit"); // "20"
```

`stubbingFor` 是 `findLast`。更具体的规则写在后面，才会盖住前面的宽松 matcher。

### 案例 3：只 verify 副作用

```js
const log = td.function("log");
log("boot");
td.verify(log("boot"));
```

文档明确：不要对已经 `when` 过、并且测试已经依赖其返回值的同一次调用再 `verify`。源码会警告 “stubbed and verified … redundant”。

## 踩过的坑

1. **`when(fn)` 里忘了演一遍**：`when` 需要最近一次 double 调用。写成 `td.when(fn).thenReturn(1)` 且 `fn` 不是刚被调用的 double，会报 no invocation。

2. **以为 first-match 生效**：后配置的 stubbing 优先。宽规则写在最后，会吞掉前面的精确规则。

3. **ESM 当 CJS 换**：`td.replaceEsm` 在没有 testdouble/quibble loader 时抛错；Jest 下 ESM stub 直接 `not yet supported`。路径要带扩展名。

4. **属性不存在还 `replace`**：`object[property]` 与 `hasOwnProperty` 都假，且没给手动替换值，会 `td.replace` error。

5. **忘了 `td.reset()`**：模块 quibble 和对象属性都靠 reset 队列恢复。漏掉会污染下一则测试。

## 适用 vs 不适用场景

**适用**：

- outside-in TDD，希望测试句式看起来像“主体将会这样调用依赖”
- Node `>= 16` 的 CJS 项目，能接受 quibble 换 `require`
- 主要验证副作用，返回值用 `when`、副作用用 `verify` 分开

**不适用**：

- 已经深度绑在 [[sinon]] 的 `spy.calledWith` / `stub.returns` 风格上
- 浏览器或 Jest ESM 场景还没解决 loader——`replaceEsm` 合同在这里失败
- 只想拦 HTTP、不替换函数——看 [[msw]]
- 把 testdouble 当测试 runner。它不发现文件、不跑断言框架

## 固定版本边界

- 本文绑定 `testdouble/testdouble.js@293753e7...` / tag `v3.20.2` / 包版本 `3.20.2`；npm `gitHead` 与 tag 一致。
- `exports`：`require` → `lib/index.js`，`import` → `lib/index.mjs`，`types` → `index.d.ts`。`engines` 为 Node `>= 16`。
- 运行时依赖 `lodash`、`quibble`、`stringify-object-es5`、`theredoc`。`src/version.js` 写死 `3.20.2`。
- 仓库里还有 `src/function/index.js` 等 CallLog 实现，但发布入口没有切过去；本文按 `index.js` / `index.mjs` 实际 import 描述。
- 本文未安装依赖、未跑 teenytest / example / quibble loader，状态保持 `UNVERIFIED`。

## 学到什么

1. **第一个参数是演出，不是配置对象**——`when` / `verify` 吃全局 call stack。
2. **后写的 stubbing 赢**——宽规则要放前面，精确规则放后面。
3. **verify 只管副作用**——和 stubbing 叠在同一次调用上会被源码警告。
4. **换模块是 loader 合同**——CJS 走 quibble；ESM 另要 `replaceEsm` 和 `--loader=testdouble`。

## 应用型自测

1. `td.when(save).thenReturn(true)` 且 `save` 是刚创建、从未调用的 `td.function()`，会发生什么？
2. 先 `when(fn("a")).thenReturn(1)`，再 `when(fn(td.matchers.anything())).thenReturn(2)`，`fn("a")` 返回什么？
3. 没有 `--loader=testdouble` 时调用 `td.replaceEsm("./x.mjs")` 会怎样？

检查点：

1. 抛 `td.when`：没有检测到 rehearsal 调用。
2. `2`。last-in-wins，后写的 anything 吃掉 `"a"`。
3. 抛 testdouble ESM loader not loaded（Jest 下则是 Jest ESM 尚未支持）。

## 延伸阅读

- 文档：[github.com/testdouble/testdouble.js/tree/v3.20.2/docs](https://github.com/testdouble/testdouble.js/tree/v3.20.2/docs)
- 固定源码：[testdouble/testdouble.js](https://github.com/testdouble/testdouble.js) —— 本文绑定提交 `293753e7380eab997a23d09014f4595313c2f2b0`
- [[sinon]] —— spy/stub/mock/假时钟；对象 wrap，不走 rehearsal
- [[jest]] —— `jest.mock` 是另一条模块替换路线
- [[msw]] —— 网络层 mock，不替换函数

## 关联

- [[sinon]] —— 记录式 / 行为表式替身；testdouble 是排练式
- [[jest]] —— CJS `td.replace` 有 Jest 专用分支；ESM 仍不通
- [[vitest]] —— Vite 项目更常走 `vi.mock`，不是 quibble
- [[msw]] —— 替换网络，不替换依赖图
