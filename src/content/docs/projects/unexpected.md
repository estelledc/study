---
title: Unexpected — 冻结的 expect 函数用句子匹配断言
description: The default export is frozen; clone before plugins. to be uses Object.is, to equal walks types.
来源: https://github.com/unexpectedjs/unexpected
日期: 2026-08-27
分类: 测试
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unexpectedjs/unexpected
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: a47e211af54bdbf19ae15b81c3f30f86aa5bde7a
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.2.1
---

## 是什么

Unexpected 是一个可扩展的 BDD 断言库。日常类比：它不是一盒散装 matcher，而是一台**已经焊死出厂设置的收音机**——默认 `expect` 已经 `freeze()`，要加台插件得先 `clone()` 出一台新的。

你写的是句子，不是链式 matcher：

```js
const expect = require("unexpected");

expect({ id: 1 }, "to equal", { id: 1 });
expect(2, "to be", 2);
```

顶层 `expect` 是一个函数：`expect(...args)` 立刻进入 `_expect(new Context(), args)`。固定 13.2.1 先装 styles、types、assertions，再冻结。

## 为什么重要

不理解冻结、类型查找和 promise 登记，就解释不了下面几件事：

- 为什么 `require("unexpected").use(plugin)` 会抛 “frozen instance”
- 为什么 `"hello" to be "hello"` 其实走的是 `to equal`，而数字 `to be` 走 `Object.is`
- 为什么异步断言如果没从 `it` 返回，mocha / jasmine 会在 `afterEach` 里翻车
- 为什么再装一次 `unexpected-set` 会被直接拒绝

## 核心要点

固定版本的主链可以拆成五步：

1. **造一台顶层 expect**：`createTopLevelExpect()` 返回函数，并把 `expectPrototype` 接到它的原型上。

2. **装内建层并冻结**：`use(styles).use(types).use(assertions).freeze()`。`freeze()` 只置 `_frozen = true`。

3. **按句子找规则**：`lookupAssertionRule(subject, description, args)`。找不到时从右往左试最长前缀，好让 `"to have items satisfying to be a number"` 这类嵌套句子拆开。

4. **执行 handler**：命中后 `_createWrappedExpect`，再 `oathbreaker(handler(...))`。返回 promise 时包一层 unexpected-bluebird。

5. **登记未完成的 promise**：pending 结果会进 `notifyPendingPromise`。测试已通过但仍有未返回 promise 时，`afterEach` 抛错。

## 实践示例

### 案例 1：默认实例不能再 `use`

```js
const expect = require("unexpected");
expect.use(require("unexpected-snapshot")); // Error: frozen, clone() first

const expect2 = expect.clone().use(require("unexpected-snapshot"));
```

`use` / `addAssertion` / `addType` / `hook` 都检查 `_frozen`。同名插件 version 不同会抛 unmet peerDependencies 类错误；完全相同则 no-op。

### 案例 2：`to be` 和 `to equal` 不是同一条路

```js
expect(1, "to be", 1);                 // objectIs
expect("a", "to be", "a");             // 字符串改走 to equal
expect({ a: 1 }, "to equal", { a: 1 }); // findCommonType().equal，默认 depth 100
```

`expect.equal` 在 depth 耗尽后用 `seen` 侦测环，环结构抛 `Cannot compare circular structures`。`<any> to be <any>` 不走这条深比较。

### 案例 3：异步断言必须被返回

```js
it("loads", () => {
  return expect(fetchUser(), "to be fulfilled with", { id: 1 });
});
```

`to be fulfilled` 对 Promise 做 `expect.promise(() => subject)`。函数重载会先调用 subject 再当 Promise 看。本轮未跑 mocha。

## 踩过的坑

1. **往默认导出上 `addAssertion`**：出厂实例已冻结。先 `clone()`。

2. **只传一个参数**：`The expect function requires at least two parameters.`

3. **把第二个参数当 chai 风格函数却期望字符串断言**：function 会走 `withError`，不是描述句子。

4. **再装已内建的旧插件**：`unexpected-promise`（8.5.0 起）和 `unexpected-set`（13.0.0 起）会硬失败。

5. **把 `unexpected-react` 当成这个包的一部分**：那是另一份插件，本轮未审查。

## 适用 vs 不适用场景

**适用**：

- 想要句子式断言、类型感知 diff，以及可克隆的 plugin 实例
- 测试运行器提供 `afterEach`（mocha / jasmine 路径已写进 `notifyPendingPromise`）
- 需要 `child()` / `exportAssertion` 做隔离插件，而不是改全局 expect

**不适用**：

- 只想用 `expect(x).toBe(y)` 这种链式 API
- 要把插件直接打进默认导出
- 需要 React wrapper 断言——那属于未审查的 `unexpected-react`，不是 13.2.1 核心

## 固定版本边界

- 本文绑定 `unexpectedjs/unexpected@a47e211a...`，annotated tag `v13.2.1` 剥开后与 npm `gitHead` 一致。
- 发布入口是 `./build/lib/index.js`；源码审查读的是 `lib/`。
- package 没有 `engines` 字段；异步实现依赖 `unexpected-bluebird`。
- 本文未安装依赖、未跑上游测试或浏览器 karma，状态保持 `UNVERIFIED`。

## 学到什么

1. **默认可不是“空壳 expect”**——它已经装好类型和断言，并且焊死。
2. **句子查找依赖类型**——同一句 `to be`，string 和 number 不是同一条规则。
3. **异步合同包含测试运行器**——pending promise 会被 hook 盯住。
4. **扩展点在 clone / child，不在默认单例**。

## 应用型自测

1. `require("unexpected").addAssertion(...)` 会成功吗？
2. `expect(0, "to be", -0)` 按 `to be` 会过吗？
3. 异步 `expect(promise, "to be fulfilled")` 不从 `it` 返回，测试绿了还会怎样？

检查点：

1. 不会。默认实例已 `freeze()`。
2. 不会。`to be` 用 `objectIs`，`0` 与 `-0` 不相等。
3. mocha / jasmine 的 `afterEach` 可能在测试已通过后仍抛 “promise that was not returned”。

## 延伸阅读

- 文档：[unexpected.js.org](https://unexpected.js.org/)
- 固定源码：[unexpectedjs/unexpected](https://github.com/unexpectedjs/unexpected) —— 本文绑定提交 `a47e211af54bdbf19ae15b81c3f30f86aa5bde7a`
- [[enzyme]] —— leftover React-test 双子的渲染一侧；不要把 `unexpected-react` 的行为写进本页

## 关联

- [[enzyme]] —— 组件树 wrapper；和 Unexpected 互补，但各有独立 revision
