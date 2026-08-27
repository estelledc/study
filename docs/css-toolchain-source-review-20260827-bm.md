# CSS toolchain source review

> 用途：记录 Sass（Dart Sass）与 PostCSS 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer BM
- evidence：GitHub / npm metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、Dart 编译、Node 编译、bundle 或性能测量
- worktrees：本机 `research-worktrees/`，不进入 Git

## Sass (Dart Sass)

- canonical source：`https://github.com/sass/dart-sass`
- revision：`62243d455aa1d2ac7462e4c0ddda964ffbc82363`
- tag：lightweight `1.103.1`（与 npm `sass@1.103.1` 的 `gitHead` 一致）
- package：`sass@1.103.1`（`pubspec.yaml` version `1.103.1`；仓库根 `package.json` 仅用于 Node API 测试依赖，不含发布版本号）
- inspected：
  - `pubspec.yaml`
  - `package.json`
  - `lib/sass.dart`
  - `lib/src/compile.dart`
  - `lib/src/async_compile.dart`
  - `lib/src/syntax.dart`
  - `lib/src/visitor/evaluate.dart`
  - `lib/src/js/compile.dart`
  - `lib/src/js/exports.dart`
  - `lib/src/js/utils.dart`
  - `lib/src/js/legacy.dart`
- observed：
  - Dart 公共入口是 `compileToResult` / `compileStringToResult`；JS 绑定再导出 `compile` / `compileString` 与对应 Async 函数；
  - JS `compile()` / `compileAsync()` 在非 Node 环境直接抛错；`compileString()` 无此限制；
  - `compileString` 默认语法是 SCSS；路径扩展名 `.sass` → 缩进语法、`.css` → 纯 CSS、其余默认 SCSS；
  - 主链是 `Stylesheet.parse` → `evaluate`（Sass AST 变成 CSS AST）→ `serialize`；
  - 未给 `url` 时，JS `compileString` 使用 `NoOpImporter()`，相对导入不会走文件系统；
  - `render` / `renderSync` 与 `nodeImporter` 属于 legacy JS API，固定源码标为 deprecated，并写明将在 Dart Sass 2.0.0 移除；
  - 输出 style 只接受 `expanded`（默认）与 `compressed`。

## PostCSS

- canonical source：`https://github.com/postcss/postcss`
- revision：`07b25773f38f77919f2af02ae3e8896b0deb5988`
- tag：annotated `8.5.26` 解引用到此提交（与 npm `postcss@8.5.26` 的 `gitHead` 一致）
- package：`postcss@8.5.26`（`Processor.version` 同步为 `8.5.26`）
- inspected：
  - `package.json`
  - `lib/postcss.js`
  - `lib/processor.js`
  - `lib/lazy-result.js`
  - `lib/no-work-result.js`
  - `lib/parse.js`
  - `lib/result.js`
- observed：
  - `postcss(...plugins)` 构造 `Processor`；`use()` 只追加规范化后的插件列表；
  - `process()` 在「无插件且无 parser / stringifier / syntax」时返回 `NoWorkResult`，否则返回 thenable 的 `LazyResult`；
  - `NoWorkResult` 先把输入字符串当作 `css` 传出，解析推迟到访问 `.root`；
  - `LazyResult` 先 parse，再跑函数插件或 `Once`，然后按 `Root` / `Rule` / `Declaration` 等 visitor 与 dirty-mark 再遍历，最后 stringify；
  - 对象插件的 `prepare(result)` 会在本轮合并 visitor；同步 `sync()` 遇到 Promise 会抛出要求改用 `.then()` 的错误；
  - `postcss.plugin` 仍导出但会警告 deprecated；标准 CSS parser 遇到 `.scss` / `.sass` / `.less` 的 `from` 时只追加改用专用 parser 的提示。
