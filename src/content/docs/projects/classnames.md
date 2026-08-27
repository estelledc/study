---
title: classnames — 条件拼接 className 的三条入口
description: 对照 classnames 固定版本源码，区分默认拼接、bind 查表和 dedupe 集合，并说明更新的 GitHub tag 尚未发布到 npm。
来源: https://github.com/JedWatson/classnames
日期: 2026-08-27
分类: CSS / 样式
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/JedWatson/classnames
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2e3683264bab067d13938b5eb03a96391a089cb4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.5.1
---

## 是什么

classnames 把任意个数的字符串、数字、数组和对象收成一条 class 字符串。日常类比：它是三种插座——默认口只拼接，`dedupe` 口会记住已经出现的名字并能被后面的假值关掉，`bind` 口先查一张本地名字表再输出真实 class。

固定 `2.5.1` 是 CommonJS 包，源码就是发布物：`index.js`、`dedupe.js`、`bind.js` 都是 IIFE，同时挂 `module.exports`、AMD `classnames` 和 `window.classNames`。npm latest 与 tag `v2.5.1` 指向同一提交。GitHub 另有未发布的 `v2.5.2`，本页不绑定。

```js
const classNames = require("classnames");

classNames("btn", { "btn-active": on, hidden: false }, ["px-2"]);
```

假参数直接跳过。对象只输出值为真的 **自有键**。数组会再进同一套规则。

## 为什么重要

不区分三条入口，下面这些现象会对不上号：

- 为什么 `{ toString() { return "card" } }` 在默认入口变成 `card`，在 [[clsx]] 里却变成键名 `toString`
- 为什么 `classNames('foo', 'foo')` 仍是 `foo foo`，只有 `classnames/dedupe` 会收成一个
- 为什么 CSS Modules 要 `.bind(styles)`——字符串 `'foo'` 会先查 `this.foo`
- 为什么不能把 GitHub 上的 `v2.5.2` 当成已经能 `npm install` 到的版本

## 核心要点

默认入口的主链是：

1. **`classNames` 扫参数**：真值才交给 `parseValue`，再用 `appendClass` 做 `value + ' ' + newClass`。

2. **`parseValue` 分型**：字符串和数字原样返回。非对象返回空串，所以函数和布尔值进不了结果。数组 `apply` 回 `classNames`。其余对象先判断自定义 `toString`：只要它不是 `Object.prototype.toString`，且 `toString.toString()` 不含 `'[native code]'`，就用返回值当类名。否则 `for-in` + `hasOwn`，值为真才留下键。

3. **默认不去重、不拆空格**：`'foo bar'` 是一个 token。重复类会原样并列。

另外两条入口不是默认行为的开关：

- **`classnames/dedupe`**：把结果放进 `Object.create(null)` 的集合。字符串按 `/\s+/` 切开；后面的 `{ foo: false }` 可以把先前的 `foo` 关掉。数字键会按普通对象枚举顺序出现在字符串键前面，测试里 `dedupe('a', 1, 'b')` 是 `'1 a b'`。
- **`classnames/bind`**：`parseValue` 改成 `call(this, arg)`。字符串、数字和对象键都走 `this[token] || token`，表里没有的名字原样落下。

## 实践示例

### 案例 1：对象开关和自定义 toString

```js
const classNames = require("classnames");

classNames({ btn: true, hidden: 0 }); // => "btn"

classNames({
  toString: () => "classFromMethod",
});
// => "classFromMethod"
```

`hidden: 0` 被丢掉。带自有 `toString` 的普通对象走方法，而不是输出键名 `toString`。继承来的 `toString` 也算——测试用子类实例覆盖了这一点。同仓还用 `vm` 证明跨 realm 的普通对象仍按键拼接，不会被误判成自定义 `toString`。

### 案例 2：CSS Modules 用 bind

```js
const classNames = require("classnames/bind");
const styles = { foo: "abc", bar: "def" };
const cx = classNames.bind(styles);

cx("foo", ["bar"], { baz: true });
// => "abc def baz"（baz 不在 styles 里，保持原词）
```

表里的 `foo` / `bar` 被换成哈希名；没登记的 `baz` 保持原词。这是“查表，查不到就用原名”，不是“未登记就丢弃”。

### 案例 3：dedupe 才能后写取消

```js
const classNames = require("classnames/dedupe");

classNames("foo", "foo", "bar");                 // => "foo bar"
classNames("foo", { foo: false, bar: true });    // => "bar"
classNames("foo foo", 1, "b", { foo: false });   // => "1 b"
```

默认入口做不到第二行这种“后面的对象把前面的类关掉”。dedupe 还会切开 `'foo foo'`。README 写它大约慢 5 倍，本页未复测。

## 踩过的坑

1. **把 default 当成会去重**：`foo foo` 会进 DOM。要后写覆盖，显式走 `/dedupe`。
2. **以为 bind 会丢掉未知类名**：未知 token 原样输出，调试时容易把 CSS Modules 没编到的名字混进 class 列表。
3. **和 [[clsx]] 互换时忘记 `toString` / `hasOwn`**：clsx 不调用 `toString`，对象枚举也不用 `hasOwn`。
4. **按 GitHub 最新 tag 写版本号**：`v2.5.2` 改了 `dedupe.js` 的拼接方式，但 npm 没有这个版本。本页钉住已发布的 `2.5.1`。

## 适用 vs 不适用场景

**适用**：

- React 条件 `className`，以及仍在用 CJS / AMD / 全局脚本的老页面
- CSS Modules 需要把本地键映射成生成名
- 需要后到的假值撤销已经出现的类名

**不适用**：

- 只要 `cond && 'class'` 的字符串链，且想要更窄的入口 → [[clsx]] 的 `lite`
- 需要 Tailwind 同属性覆盖 → 另找合并库，不是 classnames
- 必须安装 GitHub `v2.5.2` 的行为，却从 npm latest 取值
- 要把 README 的“每天百万次”或“大约 5 倍慢”写成已测结论

## 固定版本边界

- 本文绑定 `JedWatson/classnames@2e368326...`，tag 与 npm `classnames@2.5.1` 的 `gitHead` 一致。
- GitHub `v2.5.2`（`5b2c8d6d...`）存在且超前 3 个提交，主要改 `dedupe.js`；registry 无此版本，故不采用。
- 包没有 `engines` 字段；`exports` 暴露 `.`、`./bind`、`./dedupe`。
- 未安装依赖、运行 `node --test`、启动 browser bench 或测量速度，状态保持 `UNVERIFIED`。

## 学到什么

1. **三条入口是三份源码**——default / bind / dedupe 不是一个函数的选项对象。
2. **自定义 `toString` 是默认入口的正式分支**，并且用 `'[native code]'` 避开跨 VM 误判。
3. **bind 是查表，不是白名单**——没有映射的名字会漏到输出里。
4. **可安装版本以 npm + tag + SHA 对齐为准**——仓库里更新的 tag 不能自动当成 latest。

## 应用型自测

1. `classNames('foo', 'foo')` 会得到 `"foo"` 吗？
2. `require('classnames/bind').bind({ foo: 'abc' })('foo', { bar: true })` 的结果是什么？
3. 只看 npm latest，能安全把正文改绑到 GitHub tag `v2.5.2` 吗？

检查点：

1. 不会。默认入口不去重，结果是 `"foo foo"`。
2. `"abc bar"`。`foo` 被换成 `abc`，`bar` 不在表里，原样留下。
3. 不能。`v2.5.2` 没有对应 npm 包；本页停在可复查的 `2.5.1`。

## 延伸阅读

- 固定源码：[JedWatson/classnames](https://github.com/JedWatson/classnames) —— 本文绑定 `2e3683264bab067d13938b5eb03a96391a089cb4`
- 审查记录：仓库内 `docs/classname-util-source-review-20260827-eh.md`
- [[clsx]] —— 更小的默认实现，以及不处理 `toString` / bind / dedupe 的边界
- [[tailwind]] —— 字符串 utility 场景；冲突合并仍要另接工具

## 关联

- [[clsx]] —— 同协议的瘦实现，lite 与 `toString` 差异最大
- [[tailwind]] —— 常见调用方
- [[shadcn-ui]] —— 组件模板里的 class 拼接，通常还会再接合并层

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
