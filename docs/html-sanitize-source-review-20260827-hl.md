# HTML-sanitize source review (writer HL)

> 用途：记录 xss、insane 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HL
- evidence：GitHub tag metadata、npm latest 与 `gitHead`、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CLI、bundle 或性能 benchmark；未阅读 `cssfilter` / `he` / `assignment` 的独立源码仓
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：开放 PR #265 的 `sanitize-html` / `isomorphic-dompurify`；调用方禁止的 `marked`、`markdown-it`、`knex`、`ioredis`、`redis`、`BullMQ`

## xss

- canonical source：`https://github.com/leizongmin/js-xss`
- revision：`9c92272047390671b9771a0fb439793f07521d8c`
- package：`xss@1.0.15`
- tag：`v1.0.15`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `SECURITY.md`
  - `CHANGELOG.md`
  - `lib/index.js`
  - `lib/xss.js`
  - `lib/parser.js`
  - `lib/default.js`
  - `lib/util.js`
  - `typings/xss.d.ts`
- observed：
  - 生产依赖是 `commander@^2.20.3` 与 `cssfilter@0.0.10`；`engines.node` 为 `>= 0.10.0`；入口 `lib/index.js` 导出 `filterXSS`、`FilterXSS` 以及 default 与 parser 上的工具；
  - 浏览器挂 `window.filterXSS`，Dedicated Worker 挂 `self.filterXSS`；
  - `FilterXSS` 浅拷贝 options；`whiteList` / `allowList` 经 `keysToLowerCase` 后整表替换，缺省才用 `DEFAULT.whiteList`；`stripIgnoreTag` 与自定义 `onIgnoreTag` 不能同时用；
  - `process()` 可选 `stripBlankChar`，默认 `stripCommentTag`；`stripIgnoreTagBody` 先把忽略标签换成 `[removed]` / `[/removed]`，再按位置切片删掉中间正文；
  - 白名单标签走 `getAttrs` + `parseAttr`；属性值经 `safeAttrValue` 后，空值仍保留属性名（无 `=`）；非白名单标签默认 `escapeHtml`，只替换 `<` / `>`；
  - `safeAttrValue` 对 `href` / `src` 只放行 `http://`、`https://`、`mailto:`、`tel:`、`data:image/`、`ftp://`、`./`、`../`、`#`、`/`；`style` 先挡 `expression(` 与 `url(` 内的 `javascript:`/`vbscript:`/`livescript:`/`mocha:`，再交给 `cssfilter`（`css=false` 则跳过）；
  - 1.0.15 默认白名单加入 `kbd`，并支持 `singleQuotedAttributeValue`。
- provenance：
  - GitHub tag `v1.0.15`、源码 `package.json` 与 npm `xss@1.0.15` 的 `gitHead` 三方一致。

## insane

- canonical source：`https://github.com/bevacqua/insane`
- revision：`641ad8e9e1e9894eddd24806f1d81acb3550dc1d`
- package：`insane@2.6.2`
- tag：`v2.6.2`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `readme.markdown`
  - `changelog.markdown`
  - `insane.js`
  - `sanitizer.js`
  - `parser.js`
  - `defaults.js`
  - `attributes.js`
  - `elements.js`
  - `she.js`
  - `lowercase.js`
  - `toMap.js`
- observed：
  - 生产依赖是 `assignment@2.0.0` 与 `he@0.5.0`；浏览器字段把 `he` 换成仓内 `she.js`；入口 `insane.js`；
  - `strict === true` 时只用传入 options，否则 `assign({}, defaults, options)` 浅合并；因此自定义 `allowedTags` 会整表替换，但未写的 `allowedAttributes` 仍来自 defaults；
  - 解析器用正则切 start/end/comment/text；属性值 `he.decode`，输出属性值 `he.encode`；文本节点默认原样写出，除非给 `transformText`；
  - 不在 `allowedTags` 或 `filter` 返回假值的元素会 `ignore`：非 void 标签连同子孙文本一并丢掉，用同名深度计数配对结束标签；
  - URI 属性（`background` / `base` / `cite` / `href` / `longdesc` / `src` / `usemap`）必须通过 `testUrl`：`#`、`/`、无冒号、冒号落在 `?`/`#` 之后，或 `allowedSchemes`（默认 `http` / `https` / `mailto`）前缀；
  - `class` 只有不在该标签 `allowedAttributes` 里时才按 `allowedClasses` 过滤；列进属性白名单则整串 class 放行；
  - `defaults.js` 给 `iframe` 写了属性白名单，但默认 `allowedTags` 不含 `iframe`；readme 里的 defaults 快照比 `defaults.js` 少 `abbr` / `mark` / `title` / `aria-label` / `alt`。
- provenance：
  - GitHub tag `v2.6.2`、源码 `package.json` 与 npm `insane@2.6.2` 的 `gitHead` 三方一致。
