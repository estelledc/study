# Markdown render source review (writer GT)

> 用途：记录 `showdown` 与 `snarkdown` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gt` 标记 2026-08-27 平行 writer GT。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GT
- original target：`marked` + `markdown-it`（已由 PR #73 合并，本轮不改写）
- fallback excluded：`micromark`、`remark` 及开放 PR 中的同名页
- evidence：GitHub tag metadata、npm latest 与 `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、CommonMark spec suite、CLI、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## showdown

- canonical source：`https://github.com/showdownjs/showdown`
- revision：`9958ba5cfaf01c93ea9e1a48650fb3074eff98ce`
- package：`showdown@2.1.0`
- tag：`2.1.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- also observed：`3.0.0-rc1` → `71a64701115756e743f5ecf739d8abff60fef389`，`3.0.0-rc2` → `4daa1a629cbc4dd6c717852d020fff0943b4034d`（prerelease，未绑定）
- inspected：
  - `package.json`
  - `README.md`
  - `SECURITY.md`
  - `src/showdown.js`
  - `src/converter.js`
  - `src/options.js`
  - `src/helpers.js`
  - `src/subParsers/blockGamut.js`
  - `src/subParsers/spanGamut.js`
  - `src/subParsers/hashHTMLBlocks.js`
  - `src/subParsers/headers.js`
  - `src/subParsers/tables.js`
  - `src/subParsers/runExtension.js`
- observed：
  - 发布物只有 `bin` 与 `dist`；运行时依赖是 `commander`（CLI）；源码入口是 `src/showdown.js` + `Converter`；
  - 默认 flavor 名是 `vanilla`，等于 `getDefaultOpts(true)`：`tables` / `strikethrough` / `tasklists` / `simplifiedAutoLink` / `simpleLineBreaks` 为 false，`ghCodeBlocks` / `encodeEmails` / `ellipsis` 为 true，`noHeaderId` 为 false；
  - 另有 `github` / `original` / `ghost` / `allOn` preset；`setFlavor` 先 `resetOptions` 再覆盖；实例 `setFlavor` 只改本实例 options，不重置；
  - `makeHtml` 先把 `¨`/`$` 换成占位、统一换行，再跑 lang extensions → metadata → hashPreCodeTags → githubCodeBlocks → hashHTMLBlocks → hashCodeTags → stripLinkDefinitions → blockGamut → unhashHTMLSpans → unescapeSpecialChars → completeHTMLDocument → output modifiers；
  - `blockGamut` 顺序是 blockQuotes → headers → horizontalRule → lists → codeBlocks → tables → 再 hashHTMLBlocks → paragraphs；
  - `hashHTMLBlocks` 的 blockTags 含 `script` / `iframe` / `style`；匹配到的整块先推进 `gHtmlBlocks`，之后原样还原，不是转义；
  - 默认 header id 是 `title.replace(/[^\w]/g, '').toLowerCase()`；`github` flavor 才走 `ghCompatibleHeaderId`；
  - `tables()` 在 `options.tables` 为假时直接返回原文；
  - 扩展类型是 `lang` / `output` / `listener`（`language`/`html` 会归一）；`filter` 或 `regex`+`replace`；
  - `makeMarkdown` / `makeMd` 需要 WHATWG DOM；Node / worker 不传 parser 会抛 `HTMLParser is undefined`。
- provenance：
  - GitHub tag `2.1.0`、npm latest 与 `gitHead` 三方均为 `9958ba5c...`；
  - SECURITY.md 写 2.0.x 仍收安全修复，1.x 因 yargs 标为不受支持；本页不把该表当成已复现漏洞。

## snarkdown

- canonical source：`https://github.com/developit/snarkdown`
- revision：`a6dc55c93e29e40d3d77b759ce3a6070537028ee`
- package：`snarkdown@2.0.0`
- tag：`2.0.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.js`
  - `snarkdown.d.ts`
  - `test/index.js`
- observed：
  - 无生产依赖；发布 `src` / `dist` / `snarkdown.d.ts`；默认导出一个函数 `(md, prevLinks?) => string`；
  - 实现是一条全局正则 + 分支：先收集 `^\[name\]: url` 到 `links`，再 `exec` 扫描；
  - `TAGS` 用第二字符区分：`*`/`_` 单字符走 `em`，`**`/`__` 走 `strong`，`~~` 走 `<s>`，`---` / `* * *` 走 `<hr />`；
  - 标题、引用、列表会递归再调 `parse()`；未闭合的 `*`/`**` 由 `flush()` 补闭标签；
  - `encodeAttr` 只处理 `"` / `<` / `>`，用于 href/src/alt 和 code 文本；markdown 里的原始 HTML 会作为未匹配前缀留下；
  - README 写明表格尚未支持、不 sanitize HTML；测试覆盖标题、链接、列表、fence、引用和 hr，没有 table case；
  - 第二参数 `prevLinks` 可把上一轮 reference definition 传入本轮。
- provenance：
  - GitHub tag `2.0.0`、npm latest 与 `gitHead` 三方一致；仓库 latest release 指向同 tag。
