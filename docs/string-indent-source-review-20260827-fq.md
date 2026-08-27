# String indent source review (writer FQ)

> 用途：记录 `indent-string` 与 `strip-indent` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fq` 标记 2026-08-27 平行 writer FQ。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 `xo` / `ava` / `tsd`，未测 bundle 或性能
- worktrees：本机 `research-worktrees/indent-string` 与 `research-worktrees/strip-indent`，不进入 Git
- new pages：这两页原先不在 963 个项目里；本轮按明确目标新建，而不是改写既有正文
- excluded slugs：未改 boxen / chalk / ora / ink，也未新建 redent / detect-indent / min-indent

## indent-string

- canonical source：`https://github.com/sindresorhus/indent-string`
- revision：`475241abcb055eb5223d51d26fec37df35a36a8b`
- package：`indent-string@5.0.0`
- tag：annotated `v5.0.0` 解引用到该提交
- provenance：npm `gitHead`、peeled tag 与提交一致
- also observed：`origin/main` 另有两笔后继提交（readme related 链接、测试标题把 `blank` 改成 `includeEmptyLines`），`index.js` / `index.d.ts` / `package.json` 无 diff，未绑定
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `index.test-d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 唯一运行时入口是 default export `indentString(string, count = 1, options = {})`；无 named export；
  - `options.indent` 默认是单空格 `' '`，不是 tab；`includeEmptyLines` 默认 `false`；
  - 先检查 `string` / `count` / `indent` 类型，`count < 0` 抛 `RangeError`，`count === 0` 原样返回；
  - 真正改写只用一条 `String#replace`：`includeEmptyLines` 为真时 `/^/gm`，否则 `/^(?!\s*$)/gm`，替换串是 `indent.repeat(count)`；
  - 默认路径会跳过“整行都是空白”的行；测试覆盖 `\r\n`、前置空格累加、自定义 indent 字符；
  - 纯 ESM：`type=module`，`exports` 指向 `./index.js`，`engines.node >=12`，零运行时依赖，MIT。

## strip-indent

- canonical source：`https://github.com/sindresorhus/strip-indent`
- revision：`102b553f9efaec1c2451cd9ac2385269768f1fed`
- package：`strip-indent@4.1.1`
- tag：annotated `v4.1.1` 解引用到该提交
- provenance：npm `gitHead`、peeled tag 与提交一致；`origin/main` 即该提交
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `test.js`
  - `readme.md`
- observed：
  - 运行时有两个出口：default `stripIndent(string)` 与 named `dedent(string)`；
  - `stripIndent` 用 `/^[ \t]*(?=\S)/gm` 收集“有非空白内容的行”的前导空格/制表符，按**字符个数**取最小值，再 `replace(^[ \t]{min}, '')`；
  - 空白行不参与最小值计算；若某空白行的 `[ \t]` 少於 min，替换匹配不上，该行会原样留下；
  - 没有类型检查；indent 只认空格和 tab，不把其它 Unicode 空白算进前导宽度，也不做视觉列宽换算；
  - `dedent` 先用 `/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/g` 去掉首尾空白行，再调用 `stripIndent`；内部空行与行尾空格保留；
  - 4.1.0 起不再依赖 `min-indent`，算法内联在本文件；纯 ESM，`engines.node >=12`，零运行时依赖，MIT。
