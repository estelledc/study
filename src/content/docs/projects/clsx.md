---
title: clsx — 把混杂参数收成一条 className
description: 对照 clsx 固定版本源码，看它如何把字符串、数字、数组和对象收成一条 className，以及 lite 入口为什么只认字符串。
来源: https://github.com/lukeed/clsx
日期: 2026-08-27
分类: CSS / 样式
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lukeed/clsx
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 925494cf31bcd97d3337aacd34e659e80cae7fe2
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 2.1.1
---

## 是什么

clsx 是一个把字符串、数字、数组和对象收成一条 `className` 的小函数。日常类比：它是饺子馅过滤器——假值扔掉，真值按出现顺序用空格拼起来，不管你是一把一把递还是盒装再套盒。

固定 `2.1.1` 同时导出 default 和 named `clsx`，两者是同一个函数。源码在 `src/index.js`；发布物是 `bin/index.js` 用 terser 压出来的 ESM / CJS / UMD。`clsx/lite` 是另一条入口，只认非空字符串。

```js
import clsx from "clsx";

clsx("btn", isActive && "btn-active", { disabled: isOff });
```

`false && "btn-active"` 在进函数前已经是 `false`，会被丢掉。对象只看 **值是否为真**，为真才把 **键名** 写进结果。

## 为什么重要

不读固定源码，很容易把 clsx 讲成“更好的 classnames”或“自动去重工具”：

- 为什么 `{ foo: true, bar: 0 }` 只留下 `foo`——`0` 是假值，键被跳过
- 为什么 `clsx/lite` 吃对象会得到空串——lite 看见非字符串直接忽略
- 为什么带 `toString` 的对象不会变成自定义类名——默认实现只 `for-in` 键，不调用 `toString`
- 为什么它能当 [[classnames]] 的替换，却没有 `bind` / `dedupe` 这两条支线

## 核心要点

固定版本可以看成四步：

1. **先扔掉假参数**：`clsx()` 从左到右扫 `arguments`。`null`、`undefined`、`false`、`''`、`0`、`NaN` 在外层就被丢掉。

2. **`toVal` 按类型展开**：字符串和数字原样留下（`1` → `"1"`，`Infinity` → `"Infinity"`）。数组递归，假元素跳过。普通对象用 `for-in`，值为真就把键名拼进去；**没有** `hasOwnProperty`。

3. **用空格拼接，不去重**：已有内容时先加一个空格再追加。`clsx('foo', 'foo')` 是 `'foo foo'`。字符串内部的空格也不会被拆开。

4. **lite 是另一份实现，不是参数开关**：`src/lite.js` 只接受 `typeof === 'string'`。数字、对象、数组、函数全部忽略。类型声明里的 `bigint` 在运行时也不是 string/number/object，默认实现同样不会留下它。

## 实践示例

### 案例 1：对象键是类名，值只当开关

```js
import { clsx } from "clsx";

clsx({
  btn: true,
  "btn-primary": variant === "primary",
  hidden: 0,
});
```

`hidden: 0` 不会写出 `hidden`。`variant` 不是 `"primary"` 时，对应键也没有。空对象返回 `''`。

### 案例 2：嵌套数组会被拍扁

```js
clsx("foo", [1 && "bar", { baz: false }, ["hello", ["world"]]], "cya");
// => "foo bar hello world cya"
```

数组里的 `1 && "bar"` 先在 JS 里算成 `"bar"`。`{ baz: false }` 贡献零个键。再深一层的数组继续走 `toVal`。对象上的 `push` / `pop` 只是普通键，不会被当成数组方法。

### 案例 3：lite 只做字符串开关

```js
import { clsx } from "clsx/lite";

clsx("text-base", props.active && "text-primary", props.className);
clsx({ foo: true }); // => ""
clsx(1, ["bar"]);    // => ""
```

文档把 lite 写成 Tailwind 里常见的 `cond && 'class'` 写法。把对象条件抄过来会静默丢类名，不是报错。

## 踩过的坑

1. **以为会去重或拆开 `'foo bar'`**：默认实现既不拆 token，也不合并重复类。后写覆盖要另接合并工具，不是 clsx。
2. **把 lite 当默认**：`clsx/lite` 忽略对象和数字。从 classnames 风格的 `{ foo: true }` 迁过来会得到空串。
3. **指望自定义 `toString`**：`{ toString: () => 'card' }` 在 clsx 里留下的是键名 `toString`，因为函数值是真值。[[classnames]] 的默认入口才会走 `toString()`。
4. **把 README 的 239B / 更快 当成已测事实**：那是仓库自述和 `bench/` 快照。本页未构建、未跑 bench。

## 适用 vs 不适用场景

**适用**：

- React / Vue 里把条件 class 收成一条字符串
- 已经在用对象或数组写法，想换更小的 [[classnames]] 兼容入口
- 只用 `cond && 'class'`，可以考虑 `clsx/lite`

**不适用**：

- 需要 CSS Modules 本地名映射 → classnames 的 `bind`，或自己查 styles 表
- 需要后写覆盖、去掉重复 utility → 不是本库合同
- 需要 IE8：文档指向 `clsx@1.0.x`，不在本页绑定范围内
- 要把静态阅读写成“一定比 classnames 快 / 一定 239 字节”

## 固定版本边界

- 本文绑定 `lukeed/clsx@925494cf...`，tag 与 npm `clsx@2.1.1` 的 `gitHead` 一致；`master` 与该提交相同。
- `engines.node` 为 `>=6`。条件 exports 区分 `.` 与 `./lite`。
- 未安装依赖、运行 uvu、执行 `bin` 打包或测量 gzip，状态保持 `UNVERIFIED`。

## 学到什么

1. **假值过滤发生在两层**——参数层丢掉假值，对象层再按值决定是否留下键。
2. **lite 不是默认的瘦身开关**——它是另一份源码，合同更窄。
3. **兼容 classnames 不等于复制全部入口**——没有 bind，没有 dedupe，也没有 `toString` 协议。
4. **体积和速度只能回到固定 bench 或自己测**——正文不能把 README 数字升级成验证结论。

## 应用型自测

1. `clsx({ foo: true, bar: 0, baz: NaN })` 的结果是什么？
2. `import { clsx } from "clsx/lite"` 之后，`clsx({ on: true }, 1)` 会得到 `"on 1"` 吗？
3. `clsx({ toString: () => "card" })` 会得到 `"card"` 吗？

检查点：

1. `"foo"`。`0` 和 `NaN` 都是假值，对应键被跳过。
2. 不会。lite 忽略对象和数字，结果是 `""`。
3. 不会。默认实现写下键名 `"toString"`。

## 延伸阅读

- 固定源码：[lukeed/clsx](https://github.com/lukeed/clsx) —— 本文绑定 `925494cf31bcd97d3337aacd34e659e80cae7fe2`
- 审查记录：仓库内 `docs/classname-util-source-review-20260827-eh.md`
- [[classnames]] —— 同赛道的对象 / 数组协议，以及 bind、dedupe、`toString`
- [[tailwind]] —— 常见的字符串拼接场景；合并冲突不在 clsx 里

## 关联

- [[classnames]] —— 兼容对象对照，以及本库没有的 bind / dedupe
- [[tailwind]] —— utility class 字符串的常见消费者
- [[shadcn-ui]] —— 模板里常把 clsx 和合并工具一起用，合并不是 clsx 的工作

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
