# Micromark / Unified source review

> 用途：记录 micromark、unified 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer DJ
- original target：remark + unified；仓库无 `remark` 项目页，新建页会把 atlas `unknown_difficulty` / `empty_description` 预算各 +1 超限，且不得改 taxonomy 阈值
- fallback pair：micromark + unified（同属 Markdown 管线，排除 marked / markdown-it）
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装三仓依赖，未运行上游 test、CLI、bundle、CommonMark suite 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- also inspected, not published as a new Study page：`remarkjs/remark@5017a27db024db6feec85a3e1e19f8d78a485680` / `remark@15.0.1`（npm `gitHead` 一致）；仅作 fallback 决策证据

## unified

- canonical source：`https://github.com/unifiedjs/unified`
- revision：`242105bd6e18c61ca10f37d99529b89f1be37518`
- git tag：`11.0.5`
- package：`unified@11.0.5`
- inspected：
  - `package.json`
  - `index.js`
  - `lib/index.js`
  - `lib/callable-instance.js`
  - `index.d.ts`
  - `readme.md`
  - `test/`（freeze / use / process / processSync 合同）
- observed：
  - 公开入口是 `export const unified = new Processor().freeze()`：默认导出已是冻结空 processor；调用 `unified()` 走 `CallableInstance` 的 `copy`，得到未冻结副本；
  - `use()` 只把 plugin / preset / list 记进 `attachers`，并在同函数再次 `.use(plugin, opts)` 时按引用去重；两边 options 都是 plain object 则 `extend(true)` 合并，否则后写的 primary 覆盖；
  - plugin 函数在 `freeze()` 时才以 processor 为 `this` 调用；返回函数则挂到 `trough` transformer 链；`.use(plugin, false)` 在 freeze 时跳过；`.use(plugin, true)` 把首参改成 `undefined`；
  - `parse` / `run` / `stringify` / `process` 及其 Sync 变体都会先 `freeze()`；冻结后不能再 `use` / `data` 写入，必须先 `processor()` 复制；
  - `process` 主链是 `parse` → `run`（trough）→ `stringify`；compiler 若返回 `string` / `Uint8Array` 写入 `file.value`，否则写入 `file.result`；
  - `processSync` / `runSync` 在 transformer 异步未完成时抛 `` `processSync` finished async ``；
  - 缺 parser 时 `parse`/`process` 抛 `Cannot … without parser`；缺 compiler 时 `stringify`/`process` 抛 `Cannot … without compiler`；
  - 11.0.5 的 GH-246 修的是 `CallableInstance` 不再复制函数自有属性，避免旧浏览器异常；本页不把它外推为运行时兼容性证据；
  - `package.json` 无 `engines`；readme 写明当前主线兼容 Node.js 16+。
- provenance：
  - GitHub tag `11.0.5` 与 npm `unified@11.0.5` 的 `gitHead` 都指向该可达提交。

## micromark

- canonical source：`https://github.com/micromark/micromark`
- revision：`3fae15528f69dfaf2a8865a7f7d92bfb4abd7bc9`
- git tag：`4.0.2`
- package：`micromark@4.0.2`
- inspected：
  - 根 `package.json`、`readme.md`
  - `packages/micromark/package.json`
  - `packages/micromark/dev/index.js`
  - `packages/micromark/dev/lib/parse.js`
  - `packages/micromark/dev/lib/preprocess.js`
  - `packages/micromark/dev/lib/postprocess.js`
  - `packages/micromark/dev/lib/compile.js`
  - `packages/micromark/dev/lib/constructs.js`
  - `packages/micromark/dev/lib/create-tokenizer.js`
  - `packages/micromark/dev/stream.js`
  - `test/io/misc/dangerous-html.js`
  - `test/io/text/image.js`（`allowDangerousProtocol`）
- observed：
  - 一站式入口是 `compile(options)(postprocess(parse(options).document().write(preprocess()(value, encoding, true))))`；
  - `preprocess` 处理 BOM、把 `\0` / `\t` / `\n` / `\r` 切成 chunk；`parse` 用 `combineExtensions` 合并默认 CommonMark constructs 与 `options.extensions`，再创建 document / flow / content / text / string tokenizer；
  - `postprocess` 循环 `subtokenize` 直到完成；`compile` 把事件编成 HTML，注释写明 markdown 无法真正流式，结束前会缓冲事件；
  - `micromark/stream` 是 EventEmitter duplex：`write` 只喂 tokenizer，`end` 才 `postprocess` + `compile` 并 `emit('data')` 一次；注释写明“部分工作可流式，最终仍要缓冲”，且自身不处理、不发出 parse error；
  - 默认 HTML 编译关闭原始 HTML（需 `allowDangerousHtml`）并用协议白名单（`href`：`https?|ircs?|mailto|xmpp`，`src`：`https?`），`allowDangerousProtocol` 才会关掉白名单；
  - GFM / MDX / math / frontmatter 不在本包 constructs 里，需外部 syntax / html extension；
  - 本包发 concrete token 事件，不建 mdast；建树是 `mdast-util-from-markdown` 等上游消费者的事；
  - 4.0.2 发布说明是内部字段允许 trailing whitespace；devDependency 含 `commonmark.json@^0.31.0`，本页未跑该套件；
  - 公开导出是 `micromark` / `parse` / `compile` / `preprocess` / `postprocess` 与 `micromark/stream`，不是旧文里的 `micromark/lib/parse`。
- provenance：
  - GitHub tag `4.0.2` 与 npm `micromark@4.0.2` 的 `gitHead` 都指向该可达提交。
