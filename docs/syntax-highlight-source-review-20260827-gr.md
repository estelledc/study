# Syntax-highlight source review (writer GR)

> 用途：记录 `shiki` 与 `lowlight` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gr` 标记 2026-08-27 平行 writer GR。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GR
- evidence：GitHub tag / release metadata、npm latest、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、WASM、浏览器渲染、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`shiki` 为既有页迁移；`lowlight` 为同主题对照新建页（仓库原先没有该 slug）

## shiki

- canonical source：`https://github.com/shikijs/shiki`
- tag：`v4.4.3`（annotated tag `d887d853...` peel 到下列提交）
- revision：`48cd2cc695ed2e3357c3f9c370578ea843d6d9a3`
- packages：`shiki@4.4.3`、`@shikijs/core@4.4.3`、`@shikijs/transformers@4.4.3`（MIT）
- npm：`shiki@4.4.3` latest，无 `gitHead`；发布物目录为 `packages/shiki`
- engines：`node >= 20`；根仓与包均为 `"type": "module"`
- inspected：
  - `package.json`
  - `packages/shiki/package.json`
  - `packages/shiki/src/index.ts`
  - `packages/shiki/src/bundle-full.ts`
  - `packages/shiki/src/langs-bundle-full.ts`
  - `packages/shiki/src/langs-bundle-web.ts`
  - `packages/shiki/src/themes.ts`
  - `packages/core/src/constructors/bundle-factory.ts`
  - `packages/core/src/constructors/highlighter.ts`
  - `packages/core/src/highlight/code-to-html.ts`
  - `packages/core/src/highlight/code-to-hast.ts`
  - `packages/core/src/highlight/code-to-tokens.ts`
  - `packages/engine-oniguruma/src/index.ts`
  - `packages/engine-javascript/src/engine-compile.ts`
  - `packages/primitive/src/utils/general.ts`
  - `packages/transformers/src/index.ts`
  - `packages/transformers/src/transformers/notation-highlight.ts`
  - `packages/transformers/src/transformers/notation-map.ts`
  - `packages/transformers/src/shared/notation-transformer.ts`
- observed：
  - 默认 `import { createHighlighter, codeToHtml } from 'shiki'` 走 `bundle-full`：`createBundledHighlighter` 带上全量 `bundledLanguages` / `bundledThemes`，engine 默认 `createOnigurumaEngine(import('shiki/wasm'))`；
  - 全量 bundle 登记 242 个 language id、65 个 theme id；`shiki/bundle/web` 另有 57 个 web 语言；
  - `codeToHtml` 等 shorthand 经 `createSingletonShorthands` 维护进程内单例，按调用的 `lang` / `theme` 再 `loadLanguage` / `loadTheme`，函数本身是 async；实例上的 `highlighter.codeToHtml` 在语言主题已加载后是同步的；
  - 细粒度入口是 `createHighlighterCore`：必须显式传入 `engine`，语言和主题也要自己 `load`；
  - 备选 engine 是 `createJavaScriptRegexEngine`（`oniguruma-to-es`），默认 `target: 'auto'`、`recursionLimit: 5`，不支持的 TextMate 模式会抛错，除非 `forgiving: true`；
  - `plaintext` / `txt` / `text` / `plain` 是 hard-coded 纯文本；`ansi` 与它们同属 special lang，不走普通 grammar bundle；
  - 单主题走 `theme`；多主题走 `themes` 对象。多主题默认 `defaultColor: 'light'`、`cssVariablePrefix: '--shiki-'`、`colorsRendering: 'css-vars'`，把非默认主题写成 CSS 变量而不是第二套 inline color；
  - HAST 默认 `structure: 'classic'`（`pre.shiki` > `code` > `span.line`），`tabindex` 默认 `'0'`，`mergeWhitespaces` 默认 true；
  - transformer 钩子顺序是 preprocess → tokens → span/line/code/pre → HTML `postprocess`；
  - `@shikijs/transformers` 的 `transformerNotationHighlight` 识别 `[!code highlight]` / `[!code hl]`，默认给行加 `highlighted`、给 `pre` 加 `has-highlighted`；`matchAlgorithm` 默认 `v3`，纯行注释作用在下一行。
- provenance note：
  - GitHub release `v4.4.3` 指向 annotated tag，剥皮提交为 `48cd2cc6...`，根仓与 `packages/shiki/package.json` 均报 `4.4.3`；
  - npm 未暴露 `gitHead`，本文绑定 tag 剥皮提交，不伪造 publish tree。

## lowlight

- canonical source：`https://github.com/wooorm/lowlight`
- tag：`3.3.0`（lightweight tag）
- revision：`0f36148072cd096ca86753d6f1ff01589d30d78f`
- package：`lowlight@3.3.0`（MIT）
- npm：`lowlight@3.3.0` latest，`gitHead` 与 tag 同指上述提交
- dependency：`highlight.js@~11.11.0`
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `index.d.ts`
  - `lib/index.js`
  - `lib/common.js`
  - `lib/all.js`
- observed：
  - `"type": "module"`，`exports` 只有 `./index.js`；包未声明 `engines`，readme 写 Node 16+；
  - `createLowlight(grammars)` 调用 `highlight.js/lib/core` 的 `newInstance()`，再 `registerLanguage`；
  - 公开 API 是 `highlight` / `highlightAuto` / `listLanguages` / `register` / `registerAlias` / `registered`；
  - `highlight(language, value)` 在语言未注册时抛 `Unknown language`；命中后 `configure({__emitter: HastEmitter, classPrefix})`，并固定 `ignoreIllegals: true`；
  - 输出是 hast `root`，不是 HTML 字符串；`data.language` / `data.relevance` 来自 highlight.js 的结果；
  - `HastEmitter` 把 scope 切成 class：第一段加 `classPrefix`（默认 `hljs-`），后续段加递增下划线后缀；
  - `highlightAuto` 对 `subset`（默认全部已注册名）逐个 `highlight`，取 `relevance` 最高者；全部失败则返回空 `root`，`language` 为 `undefined`；
  - `common` 预置 37 个 grammar，`all` 预置 155 个；空 `createLowlight()` 的 `listLanguages()` 是 `[]`。
- provenance note：
  - npm `gitHead`、GitHub lightweight tag `3.3.0` 与提交 `0f361480...` 一致，`package.json` 版本 `3.3.0`。
