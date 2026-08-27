# Markdown parser source review (writer AC)

> 用途：记录 marked、markdown-it 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer AC
- evidence：GitHub release/tag metadata、npm latest 与 `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、CommonMark spec suite、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：A–AB 已分配对，以及 open PR slugs（`zustand`、`jotai`、`tanstack-query`、`swr`、`react-hook-form`、`tanstack-form`、`mcp-ts-sdk`、`ollama`、`aichat`、`shell-gpt`、`haystack`、`langfuse` 等）

## marked

- canonical source：`https://github.com/markedjs/marked`
- revision：`53cb13f13fc13d433269248c5caa255ffa1361ee`
- package：`marked@18.0.11`
- tag：`v18.0.11`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `src/marked.ts`
  - `src/Instance.ts`
  - `src/defaults.ts`
  - `src/Lexer.ts`
  - `src/Tokenizer.ts`
  - `src/Parser.ts`
  - `src/Renderer.ts`
  - `src/Hooks.ts`
  - `src/helpers.ts`
  - `src/rules.ts`
- observed：
  - no production `dependencies`；`engines.node` 为 `>= 20`；发布物走 `lib/marked.esm.js` / `lib/marked.d.ts`；
  - 默认选项是 `async: false`、`breaks: false`、`gfm: true`、`pedantic: false`、`silent: false`；没有 `html: false` 开关；
  - `lex()` 先 `blockTokens`，再清空 `inlineQueue` 做第二遍 `inlineTokens`；block 顺序是 space → code → fences → heading → hr → blockquote → list → html → def → table → lheading → paragraph；
  - `gfm: true` 时启用 table、task checkbox、`del` 与 GFM url tokenizer；`Renderer.html` 原样回写 token 文本；
  - `cleanUrl()` 只做 `encodeURI`，失败返回 `null` 后 link/image 退化成可见文字；没有 `javascript:` / `data:` allowlist；
  - `use({ renderer })` 把新函数包在旧函数外：新函数先跑，返回 `false` 才回退；addon tokenizer 用 `unshift`，比内建规则更早匹配；
  - hook 链是 preprocess → provideLexer → processAllTokens → walkTokens → provideParser → postprocess；pass-through hook 为 preprocess / postprocess / processAllTokens / emStrongMask；
  - 扩展漏写会缩短 `raw` 时，`infiniteLoopError` 抛 `Infinite loop on byte: ...`。
- provenance：
  - GitHub latest release、npm latest 与 `gitHead` 三方均为 `18.0.11` / `53cb13f1...`。

## markdown-it

- canonical source：`https://github.com/markdown-it/markdown-it`
- revision：`157b33bc13649aebecf9ab9b3b8c85ae645abb5a`
- package：`markdown-it@15.0.0`
- tag：`15.0.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `src/index.ts`
  - `src/markdownit.ts`
  - `src/parser_core.ts`
  - `src/parser_block.ts`
  - `src/parser_inline.ts`
  - `src/ruler.ts`
  - `src/renderer.ts`
  - `src/presets/default.ts`
  - `src/presets/commonmark.ts`
  - `src/presets/zero.ts`
  - `src/rules_core/linkify.ts`
  - `docs/architecture.md`
  - `docs/safety.md`
  - `docs/migration/migration_v15.md`
- observed：
  - 生产依赖是 `argparse`、`entities`、`linkify-it`、`mdurl`、`punycode.js`、`uc.micro`；根导出包一层 `callable()`，无 `new` 仍可调用，文档标明兼容包装未来可能删除；
  - `new MarkdownIt()` 走 `default` preset：`html: false`、`linkify: false`、`breaks: false`、`typographer: false`、`maxNesting: 100`；default 不 `enableOnly`，因此 table 与 strikethrough 规则保持开启；
  - `commonmark` preset 才关掉 table / strikethrough / linkify / replacements / smartquotes，但同时把 `html` 设为 `true`、`xhtmlOut` 为 `true`、`maxNesting` 为 `20`；
  - core 链顺序是 normalize → block → strip_references → inline → linkify → replacements → smartquotes → text_join；`linkify` 规则在 `options.linkify` 为假时直接返回；
  - `validateLink` 默认拒绝 `javascript:` / `vbscript:` / `file:` / 多数 `data:`，只放行 `data:image/(gif|png|jpeg|webp)`；
  - v15：`linkify-it` 默认不再认 `example.com` 这类 fuzzy link，需 `md.linkify.set({ fuzzyLink: true })`；类型随包发布；`markdown-it/lib/...` 内部路径不再导出，`Token` / `Ruler` / `Renderer` 等挂在类静态属性上。
- provenance：
  - GitHub tag `15.0.0`、npm latest 与 `gitHead` 三方一致；仓库未使用 GitHub Releases latest 字段。
