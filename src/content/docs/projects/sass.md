---
title: Sass — 把 SCSS/Sass 编译成 CSS 的 Dart 实现
description: Dart Sass 官方实现，把 SCSS、缩进语法或纯 CSS 解析求值后再序列化成 CSS
来源: https://github.com/sass/dart-sass
日期: 2026-08-27
分类: CSS 工具链
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sass/dart-sass
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 62243d455aa1d2ac7462e4c0ddda964ffbc82363
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.103.1
---

## 是什么

Sass（这里指官方实现 Dart Sass）是一个**样式语言编译器**。你写带变量、嵌套、`@use` 的 SCSS 或缩进语法，它交回一份普通 CSS。日常类比：像把一份带批注的菜谱抄成厨房只认的步骤单——批注在抄写时被展开，出门的只有步骤。

npm 上的 `sass` 包由本仓库编译发布。固定 1.103.1 的 JS 现代入口是 `compile` / `compileString`，不是旧的 `renderSync`：

```js
import * as sass from "sass";
const { css } = sass.compileString("$brand: #3366ff; .btn { color: $brand; }");
```

Dart 公共函数名是 `compileToResult` / `compileStringToResult`；JS 绑定再换成更短的名字。

## 为什么重要

不读固定 1.103.1 源码，下面这些边界很容易被「Sass 就是嵌套 CSS」带过：

- 为什么 `compile("a.scss")` 在浏览器里会直接抛错，而 `compileString` 不会
- 为什么 `compileString` 默认当 SCSS 读，`.sass` 文件却走缩进语法
- 为什么没给 `url` 的 `compileString` 解析不了相对 `@use`
- 为什么 `renderSync` 还能跑，却已经被标成将在 2.0.0 删除

## 核心要点

固定版本的主链可以拆成五步：

1. **选语法**：`compileString` 未指定时用 SCSS。按路径编译时，`Syntax.forPath` 把 `.sass` 映射到缩进语法、`.css` 映射到纯 CSS，其余默认 SCSS。JS 侧 `syntax` 只接受 `scss` / `indented` / `css`。

2. **parse**：`Stylesheet.parse` 得到 Sass AST。按文件编译且语法与扩展名一致时，结果可以放进 `ImportCache`；强制改语法则当场读文件再 parse。

3. **evaluate**：`_EvaluateVisitor` 把 Sass 语句求值成 CSS AST。相对导入先问当前 stylesheet 的 importer，再问 `importers`、`loadPaths`、`SASS_PATH` 和 `package:`。

4. **serialize**：`serialize` 把 CSS AST 写成文本。JS `style` 只接受 `expanded`（默认）和 `compressed`；其他字符串会抛 `Unknown output style`。

5. **包装结果**：JS 返回 `{ css, loadedUrls, sourceMap? }`。未请求 source map 时对象上没有该键，不是 `null`。

## 实践示例

### 案例 1：字符串默认是 SCSS

```js
import { compileString } from "sass";

const scss = compileString("$gap: 8px; .card { padding: $gap; }");
const indented = compileString(".card\n  padding: 8px", { syntax: "indented" });
```

第一种不写 `syntax` 就按 SCSS 解析。第二种必须显式 `indented`；把缩进语法丢进默认 `compileString` 会变成语法错误，不是自动切换。

### 案例 2：按路径编译只在 Node

```js
import { compile } from "sass";
const { css } = compile("styles/app.scss", { style: "compressed" });
```

固定源码里 `compile()` / `compileAsync()` 先检查 `isNodeJs`，否则抛 `The compile() method is only available in Node.js.`。浏览器或无文件系统的 runtime 应走 `compileString`，并自己提供 importer。

### 案例 3：没有 url 就没有相对导入

```js
import { compileString } from "sass";
compileString('@use "theme"; .btn { color: theme.$brand; }');
```

JS 绑定在 `options.url == null` 时给入口 stylesheet 装 `NoOpImporter()`。相对 `@use` / `@forward` 不会去读磁盘。要解析本地模块，需要 `url`（通常是 `file:`）或显式 `importers` / `loadPaths`。

## 踩过的坑

1. **继续把 `render` / `renderSync` 当现代合同**：它们还在 `exports` 上，但是 legacy JS API；固定源码对 `nodeImporter` 发出 `legacy-js-api` 弃用警告，并写明 2.0.0 删除。
2. **把 Libsass 的 `nested` / `compact` 当成合法 style**：固定 JS 绑定只认 `expanded` 与 `compressed`。
3. **给 `compileString` 传相对 `url` 字符串**：无 scheme 的相对 URL 会触发 `compile-string-relative-url` 弃用，并将在 2.0.0 变成错误。
4. **以为 `charset` 默认关闭**：未设置时默认 `true`，非 ASCII 样式可能带 `@charset` 或 UTF-8 BOM。
5. **把语言规范仓 `sass/sass` 当成这个实现仓**：笔记绑定的是 `sass/dart-sass`。语言提案与嵌入式协议在另一个仓库。

## 适用 vs 不适用场景

**适用**：

- 需要官方 Sass 语言实现，而不是「长得像嵌套」的 CSS 预处理
- 已经能接受现代 `compile` / `compileString`，并在 Node 或自备 importer 的环境工作
- 想和 [[postcss]] / [[lightningcss]] 对照：语言编译 vs 插件变换 vs 单遍 CSS 编译

**不适用**：

- 还在依赖 node-sass / Libsass 的 `render` 签名，又拒绝改调用方
- 把 SCSS 丢进只会标准 CSS 的 parser（例如未加 `postcss-scss` 的 [[postcss]]）
- 需要未经本页测量的「比 Less 更快」或固定安装体积结论

## 固定版本边界

- 本文绑定 `sass/dart-sass@62243d455aa1d2ac7462e4c0ddda964ffbc82363`。lightweight tag `1.103.1` 与 npm `sass@1.103.1` 的 `gitHead` 都指向该提交。`pubspec.yaml` 版本为 `1.103.1`。
- 仓库根 `package.json` 只声明测试用 Node 依赖，不是发布清单。Dart SDK 约束为 `>=3.13.0 <4.0.0`。
- `compile.dart` / `evaluate.dart` 由对应 async 文件生成；阅读时以生成文件与 `async_compile.dart` 对照，不把 grind 脚本当成运行时入口。
- 本文未安装 Dart/npm 依赖、未调用 CLI、未跑上游测试或测量编译时间，状态保持 `UNVERIFIED`。

## 学到什么

1. **实现仓和语言仓不是同一个**——npm `sass` 来自 Dart Sass，不是 `sass/sass` 规范仓。
2. **入口按运行时切开**——读文件的 `compile` 绑定 Node；字符串入口才跨环境。
3. **语法是显式状态**——默认 SCSS，缩进语法不会因为内容「看起来像」而自动切换。
4. **求值和序列化是两段**——变量、`@use`、mixin 在 evaluate 消失；serialize 只看到 CSS AST。

## 应用型自测

1. 在非 Node 环境调用 `sass.compile("a.scss")`，固定 1.103.1 会编译文件还是抛错？
2. `compileString(".a\n  color: red")` 不传 `syntax`，会按缩进语法解析吗？
3. 不传 `url` 的 `compileString('@use "theme";')` 会从当前工作目录加载 `theme` 吗？

检查点：

1. 抛错。`compile()` 只在 Node.js 可用。
2. 不会。默认语法是 SCSS，缩进语法要 `syntax: "indented"`。
3. 不会。未给 `url` 时入口 importer 是 `NoOpImporter`。

## 延伸阅读

- 语言文档：[sass-lang.com](https://sass-lang.com)
- 固定源码：[sass/dart-sass](https://github.com/sass/dart-sass) —— 本文绑定提交 `62243d455aa1d2ac7462e4c0ddda964ffbc82363`
- [[postcss]] —— 编译之后常用的 CSS 插件管线
- [[lightningcss]] —— 另一条 CSS 变换/压缩路线，不是 Sass 实现
- [[vite]] / [[webpack]] —— 常见宿主，通过 loader 或内置 CSS 管线调用本包

## 关联

- [[postcss]] —— 标准 CSS 插件链；不理解 Sass 语法
- [[lightningcss]] —— 单遍 CSS 编译器，对照「语言求值再序列化」
- [[tailwind]] —— 另一类 CSS 编译器，扫描候选而不是求值 Sass AST
- [[vite]] —— 开发服务器常把 `.scss` 交给 `sass`
- [[webpack]] —— `sass-loader` 的典型宿主

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
