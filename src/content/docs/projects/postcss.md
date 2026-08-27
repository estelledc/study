---
title: PostCSS — 用插件链变换 CSS 的编译器
description: 把 CSS 解析成节点树，按插件 visitor 变换后再序列化；无插件时可走 NoWorkResult
来源: https://github.com/postcss/postcss
日期: 2026-08-27
分类: CSS 工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/postcss/postcss
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 07b25773f38f77919f2af02ae3e8896b0deb5988
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 8.5.26
---

## 是什么

PostCSS 是一个**用 JS 插件变换 CSS** 的编译器。它自己几乎不内置「加前缀」或「压缩」策略：`postcss(...plugins)` 只构造一条处理器，真正改树的是插件。日常类比：像一条可以换刀具的流水线——传送带和夹具是 PostCSS，切片、去皮、装箱都是插件。

```js
import postcss from "postcss";

const result = await postcss([
  {
    postcssPlugin: "demo-once",
    Once(root) {
      root.walkDecls("color", decl => { decl.value = "rebeccapurple"; });
    },
  },
]).process(".btn { color: red }", { from: undefined });
```

`process()` 返回 thenable。固定 8.5.26 里 `Processor.version` 也是 `8.5.26`。

## 为什么重要

不读固定 8.5.26 源码，下面这些合同很容易被「PostCSS = Autoprefixer」带过：

- 为什么零插件的 `process()` 可以不 parse，访问 `.root` 才补树
- 为什么函数插件拿到的是 `(root, result)`，对象插件却先走 `Once` / visitor
- 为什么同步读取 `.css` 时，异步插件会直接抛错
- 为什么把 `.scss` 丢给默认 parser 只会多一句提示，不会改语法

## 核心要点

固定版本的主链可以拆成五步：

1. **装配 Processor**：`postcss(plugin)` 或 `postcss([a, b])` 都进入 `new Processor(plugins)`。`normalize` 接受函数、带 `postcssPlugin` 的对象、嵌套 `plugins` 数组，以及 `plugin.postcss` / `postcss: true` 工厂。parser/stringifier 对象不能当插件。

2. **选择结果类型**：没有插件且没有 `parser` / `stringifier` / `syntax` 时返回 `NoWorkResult`；否则返回 `LazyResult`。前者先把输入字符串当作 `css` 传出。

3. **parse**：`LazyResult` 构造时调用 `opts.parser` 或 `opts.syntax.parse`，缺省是标准 CSS `parse()`。已经是 `root` / `document` 节点则跳过 parse，只清 dirty mark。

4. **跑插件**：先对每个插件调用函数本体或 `Once`。然后 `prepareVisitors` 收集 `Root` / `Rule` / `Declaration` / `AtRule` 及对应 `Exit`、带属性名过滤的 listener。`prepare(result)` 的返回值会并进本轮插件对象。树被改脏后会再 walk。

5. **stringify**：访问 `.css` / `.content` / `.map` 才序列化。`opts.stringifier` 或 `opts.syntax.stringify` 可替换默认输出。

## 实践示例

### 案例 1：零插件并不等于「先 parse 再原样吐回」

```js
import postcss from "postcss";

const result = postcss().process(".a{color:red}", { from: undefined });
result.css;          // 直接是输入字符串
const root = result.root; // 这时才调用 parse()
```

`NoWorkResult` 把 `css` 先设成输入文本；getter `.root` 才创建 AST。没有插件时不要假设「一定走完整 parse → stringify」。需要自定义 syntax 时，即使插件为空也会改走 `LazyResult`。

### 案例 2：函数插件和 visitor 插件不是同一签名

```js
const fnPlugin = (root, result) => {
  result.warn("via function plugin");
};

const visitorPlugin = {
  postcssPlugin: "demo-decl",
  Declaration: {
    color(decl) { decl.value = "navy"; },
  },
};

await postcss([fnPlugin, visitorPlugin]).process(".a{color:red}", { from: undefined });
```

函数插件在 `runOnRoot` 里立刻拿到整棵 `root`。对象插件的 `Declaration.color` 被登记成 `Declaration-color` listener，只在 walk 到该属性时触发。`Result.warn` 会把 `lastPlugin.postcssPlugin` 填进 message。

### 案例 3：同步取值遇到异步插件

```js
const asyncPlugin = {
  postcssPlugin: "demo-async",
  async Once() { /* 返回 Promise */ },
};

postcss([asyncPlugin]).process("a{}", { from: undefined }).css;
```

`LazyResult.sync()` 看到 Promise 就抛 `Use process(css).then(cb) to work with async plugins`。读 `.css` / `.root` / `.messages` 都会先走 `sync()`。异步插件必须 `await process(...)` 或 `.then()`。

## 踩过的坑

1. **继续用 `postcss.plugin()` 注册插件**：固定源码仍导出它，但第一次调用就 `console.warn` 指向 PostCSS 8 迁移指南。
2. **把 syntax 对象塞进插件列表**：`normalize` 发现 `parse` / `stringify` 会抛 `PostCSS syntaxes cannot be used as plugins`（非 production）。
3. **用默认 parser 吃 SCSS**：`parse()` 只在错误信息里提示改用 `postcss-scss` / `postcss-sass` / `postcss-less`，并不会切换语法。
4. **省略 `from`**：非 production 下 `then()` 会警告 source map 与 Browserslist 可能找错配置。不需要路径时应显式 `from: undefined`。
5. **把 Autoprefixer、cssnano、[[lightningcss]] 的能力算进核心**：那些是插件或替代实现；本包只保证节点协议和调度。

## 适用 vs 不适用场景

**适用**：

- 需要可组合的 CSS AST 变换，而不是固定的一条「加前缀 + 压缩」产品
- 已经能接受「自己声明 plugins」，并分清同步 visitor 与异步 `Once`
- 想和 [[sass]] 对照：先把语言编译成 CSS，再交给插件链

**不适用**：

- 把 SCSS / Less 直接当 CSS 解析，又不装对应 syntax
- 需要单遍 Rust 编译器语义——那是 [[lightningcss]] 的合同，不是本包默认
- 还没在目标 runner 上量过体积或耗时，却把「比 Sass 慢/快」写成当前事实

## 固定版本边界

- 本文绑定 `postcss/postcss@07b25773f38f77919f2af02ae3e8896b0deb5988`。annotated tag `8.5.26` 解引用与 npm `postcss@8.5.26` 的 `gitHead` 都指向该提交。
- `engines.node` 为 `^10 || ^12 || >=14`。依赖是 `nanoid`、`picocolors`、`source-map-js`。`package.json` 里对 `lib/postcss.js` 的 size-limit 是 16.5 KB，这是仓库自检上限，不是本页测得的安装体积。
- 本文未安装依赖、未跑 uvu / integration、未启动 Autoprefixer 或其他插件，状态保持 `UNVERIFIED`。

## 学到什么

1. **核心是调度器**——没有插件时，连 parse 都可以推迟。
2. **插件形态决定调用时机**——函数插件先跑整树，visitor 按节点类型和过滤键触发。
3. **thenable 不是「总是异步」**——同步读属性走 `sync()`；异步插件必须改用 Promise 路径。
4. **syntax 是选项，不是插件**——parser/stringifier 不能丢进 `use()`。

## 应用型自测

1. `postcss().process("a{}", { from: undefined }).css` 会先调用 `parse()` 吗？
2. 对象插件只写 `Declaration: { color() {} }`，walk 到 `font-size` 时会进这个函数吗？
3. 插件的 `Once` 返回 Promise 后，立刻读 `.css` 会得到结果还是抛错？

检查点：

1. 不会。零插件且无自定义 syntax 时走 `NoWorkResult`，`.css` 是原字符串。
2. 不会。过滤键登记为 `Declaration-color`，只匹配该属性。
3. 抛错。`sync()` 拒绝尚未完成的异步插件。

## 延伸阅读

- 官方文档：[postcss.org](https://postcss.org/)
- 固定源码：[postcss/postcss](https://github.com/postcss/postcss) —— 本文绑定提交 `07b25773f38f77919f2af02ae3e8896b0deb5988`
- [[sass]] —— 语言编译器，常作为本包的上游输入
- [[lightningcss]] —— 单遍替代路线，不是 PostCSS 插件
- [[vite]] / [[webpack]] —— 常见 runner，决定何时调用 `process()`

## 关联

- [[sass]] —— 先求值成 CSS，再交给本包
- [[lightningcss]] —— 对照「插件多次 walk」与「单遍变换」
- [[tailwind]] —— 可以当 PostCSS 插件被调度，但 v4 主链已不默认如此
- [[vite]] —— 内置 CSS 管线的常见宿主
- [[webpack]] —— `postcss-loader` 的典型宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
