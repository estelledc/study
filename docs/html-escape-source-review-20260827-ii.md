# HTML-escape source review (writer II)

> 用途：记录 PARALLEL writer II 在 2026-08-27 对 `escape-html`、`escape-goat` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：II
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与上游测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test、benchmark、bundle 或类型检查
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：未写 `he`、`entities`；未改 `marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`bullmq`

## escape-html

- canonical source：`https://github.com/component/escape-html`
- revision：`7ac2ea3977fcac3d4c5be8d2a037812820c65f28`
- package：`escape-html@1.0.3`
- tag：`v1.0.3`（剥皮提交与 npm `gitHead` 一致）
- inspected：
  - `package.json`
  - `Readme.md`
  - `index.js`
  - `Makefile`
  - `benchmark/index.js`
  - `component.json`
- observed：
  - CJS 单导出 `module.exports = escapeHtml`；无 `main` / `exports` / `engines` / runtime 依赖；
  - `'' + string` 先强制字符串化，再以 `/["'&<>]/` 探测；未命中直接返回；
  - 命中后从 `match.index` 起按 `charCodeAt` switch：`34` `&quot;`、`38` `&amp;`、`39` `&#39;`、`60` `&lt;`、`62` `&gt;`；
  - 逐字符替换，不存在“先 `<` 再 `&`”的二次转义；
  - 无 unescape、无 tagged template；`Makefile` 只服务 component 构建。

## escape-goat

- canonical source：`https://github.com/sindresorhus/escape-goat`
- revision：`d4a65160f9dfd2ca17b5e1c19811d1f6cb9c786f`
- package：`escape-goat@4.0.0`
- tag：`v4.0.0`（剥皮提交与 npm `gitHead` 一致）
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `index.d.ts`
  - `test.js`
- observed：
  - ESM，`exports` 为 `./index.js`，`engines.node >= 12`，无 runtime 依赖；
  - `_htmlEscape` 按 `&` / `"` / `'` / `<` / `>` 顺序 replace；`_htmlUnescape` 先实体、最后 `&amp;`，且 `/&#0?39;/g` 覆盖 `&#39;` 与 `&#039;`；
  - `htmlEscape` / `htmlUnescape` 在 `typeof strings === 'string'` 时走内部函数，否则按 tagged template 只处理插值；
  - `test.js` 断言静态片断 `<em>` 不被转义，并断言 `htmlUnescape(htmlEscape('&quot;')) === '&quot;'`；
  - 普通调用没有 `'' + value` 兜底；keywords 含 sanitize/xss，源码仍只做五字符替换。
