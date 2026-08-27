# HTML sanitize source review (writer GU)

> 用途：记录 `sanitize-html` 与 `isomorphic-dompurify` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gu` 标记 2026-08-27 平行 writer GU。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL GU
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未实例化 jsdom，未调用 `sanitize` / `sanitizeHtml`，未运行 mocha / vitest / bundle / 性能 benchmark
- worktrees：本机 `research-worktrees/sanitize-html`（apostrophe sparse checkout）与 `research-worktrees/isomorphic-dompurify`，不进入 Git
- slugs：`sanitize-html`、`isomorphic-dompurify`

## sanitize-html

- canonical source：`https://github.com/apostrophecms/apostrophe`（`packages/sanitize-html`）
- revision：`ab4c660b4426fd8f27cf7955e7a3b4a120dc38b3`
- package：`sanitize-html@2.17.7`（MIT）
- npm：`sanitize-html@2.17.7` latest，无 `gitHead`；`repository.directory` 为 `packages/sanitize-html`
- also observed：独立仓 `apostrophecms/sanitize-html` 在 `6ac6b8ea4898` 宣布 deprecate；其 tag `2.17.0` 与 npm `2.17.0` `gitHead` 同为 `86efc067a63515e08ecfc47f94d8bca0e3715030`。本页不绑定该旧仓。
- inspected：
  - `packages/sanitize-html/package.json`
  - `packages/sanitize-html/index.js`
  - `packages/sanitize-html/CHANGELOG.md`（2.17.2–2.17.7）
  - `packages/sanitize-html/README.md`（默认 allowlist / 选项合同）
- observed：
  - 发布物只有 `index.js`；`engines.node >= 22.12.0`，依赖 `htmlparser2@^12`、`launder`、`parse-srcset`、`postcss`、`deepmerge`；
  - `sanitizeHtml(html, options)` 用 `htmlparser2.Parser` 的 `onopentag` / `ontext` / `onclosetag` 拼字符串，不是 DOM；
  - 默认 `allowedTags` 不含 `img` / `svg` / `script` / `iframe` / `textarea`；`allowedAttributes` 只给 `a` 与（预留的）`img`；
  - `disallowedTagsMode` 默认 `discard`：丢掉标签、留下子内容，除非该标签在 `nonTextTags`；
  - URL 走 `launder.naughtyHref`；默认 scheme 为 `http` / `https` / `ftp` / `mailto` / `tel`；
  - `animatesUrlAttribute` 在 SVG SMIL 动画把 `attributeName` 指向 URL 槽时整标签跳过（2.17.7 / GHSA-g8qq-57p8-ggw5）；
  - 允许 `textarea` / `xmp` 时，`ontext` 必须转义：`textarea` 走完整 `escapeHtml`，`xmp` 只转义尖括号。

## isomorphic-dompurify

- canonical source：`https://github.com/kkomelin/isomorphic-dompurify`
- tag：annotated `3.23.0` → peel `7607c2f4c16695cced78e4e5f30ab87f895257a0`
- package：`isomorphic-dompurify@3.23.0`（MIT）
- npm：无 `gitHead`；依赖 `dompurify@^3.4.12`、`jsdom@^30.0.0`
- engines：`^22.22.2 || ^24.15.0 || >=26.0.0`
- inspected：
  - `package.json`
  - `tsup.config.ts`
  - `src/index.ts`
  - `src/browser.ts`
  - `README.md`
  - `tests/sanitize.test.ts`
  - `tests/clearWindow.test.ts`
  - `tests/factory.test.ts`
  - `tests/types.test.ts`
- observed：
  - 自身不做清洗规则；Node 入口用 `JSDOM('<!DOCTYPE html>').window` 调 `DOMPurify` factory，再用 `Proxy` 把属性绑到当前实例，并把默认导出做成可调用 factory；
  - 具名 `sanitize` / `addHook` / `setConfig` 闭包在模块级 `purify` 上；`removed` 是指向当前实例的 `Proxy`；
  - `clearWindow()` 关闭当前 jsdom window 并新建 factory；hooks / config 不会自动搬过去；浏览器构建里它是空函数；
  - `exports` 的 `node` 条件指向 `dist/index.*`，`default` 指向 `dist/browser.*`；`tsup` 把 `dompurify` / `jsdom` 标为 external；
  - 未阅读 `dompurify` 或 `jsdom` 源码，不把包装层测试期望写成已运行证据。
