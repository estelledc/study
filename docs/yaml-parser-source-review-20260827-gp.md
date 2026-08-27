# YAML parser source review (writer GP)

> 用途：记录 yaml、js-yaml 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GP
- evidence：GitHub tag metadata、npm latest 与 `gitHead`、固定提交静态源码与文档阅读
- not executed：未安装两仓依赖，未运行上游 test、YAML Test Suite、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/yaml` 与 `research-worktrees/js-yaml`，不进入 Git
- fallback unused：仓库原先没有这两页；按主目标新建，未改写 yq / dasel

## yaml

- canonical source：`https://github.com/eemeli/yaml`
- revision：`ddb21b04cb889722cec8f89dc1b67f19d62d7f7d`
- package：`yaml@2.9.0`
- tag：annotated `v2.9.0`（tag object `c52c941c...` 剥开后与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `docs/01_intro.md`
  - `src/index.ts`
  - `src/public-api.ts`
  - `src/options.ts`
  - `src/doc/Document.ts`
  - `src/compose/composer.ts`
  - `src/parse/parser.ts`
  - `src/parse/lexer.ts`
  - `src/nodes/toJS.ts`
  - `src/nodes/Alias.ts`
  - `src/schema/Schema.ts`
  - `src/schema/tags.ts`
  - `src/schema/core/schema.ts`
  - `src/schema/core/bool.ts`
- observed：
  - 无生产 `dependencies`；`engines.node` 为 `>= 14.6`；发布走 `dist/` 与 `browser/`；
  - 公开三层：`parse`/`stringify`、`parseDocument`/`parseAllDocuments`/`Document`、`Lexer`/`Parser`/`Composer`/`CST`；
  - `Document` 默认 `version: '1.2'`，`setSchema('1.2')` 绑 `schema: 'core'` 且 `resolveKnownTags: true`；`merge` 默认 false；
  - `parse()` 调 `parseDocument()` 再 `toJS()`；多文档写入 `MULTIPLE_DOCS` 后默认 throw `errors[0]`；`logLevel: 'silent'` 才吞掉；
  - `parseAllDocuments` 在空流上返回带 `empty: true` 的数组；`stringify(undefined)` 默认 `undefined`，数字 indent 夹到 1–8，文档以 `\n` 结尾；
  - `toJS()` / `Node.toJS()` 的 `maxAliasCount` 默认 `100`；`0` 禁止别名，超限抛 `ReferenceError`；
  - core bool 只匹配 `true`/`True`/`TRUE`/`false`/`False`/`FALSE`。
- provenance：
  - GitHub annotated tag `v2.9.0`、npm latest 与 `gitHead` 三方均为 `2.9.0` / `ddb21b04...`。

## js-yaml

- canonical source：`https://github.com/nodeca/js-yaml`
- revision：`e5a3ba0efee53629b979f784cd53736f89ea61b6`
- package：`js-yaml@5.4.1`
- tag：lightweight `5.4.1`（与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `docs/migrate_v4_to_v5.md`
  - `docs/safety.md`
  - `src/index.ts`
  - `src/load.ts`
  - `src/dump.ts`
  - `src/schema.ts`
  - `src/parser/parser.ts`
  - `src/parser/constructor.ts`
  - `src/tag/mapping/map.ts`
  - `src/tag/scalar/bool_core.ts`
  - `src/tag/scalar/bool_yaml11.ts`
- observed：
  - 包描述为 YAML 1.2 parser and serializer；生产依赖只有 `argparse`；无 ESM default export；
  - `load` = `parseEvents` + `constructFromEvents`；`dump` = `jsToAst` + 可选 visit + `present`；
  - load 默认 `CORE_SCHEMA`（无 `!!merge`）；dump 默认 `DUMP_SCHEMA`（`YAML11_SCHEMA` + core int/float resolve）；
  - `load('')` 抛 empty-document；多文档抛 single-document；`loadAll` 返回数组，iterator 签名 deprecated；
  - `Schema.extend` / `Type` / `DEFAULT_SCHEMA` / `js-yaml/lib/...` 已移除，改 `withTags` 与 `define*Tag`；
  - `mapTag` 产出 `{}`，标量键 `String(key)`，对象键报错，`__proto__` 走 `defineProperty`；
  - 构造器默认 `maxAliases: -1`、`json: false`、`maxTotalMergeKeys: 10000`；解析器默认 `maxDepth: 100`；
  - safety 文档要求限制输入长度、捕获全部异常，并在物化后做节点计数走查。
- provenance：
  - GitHub tag `5.4.1`、npm latest 与 `gitHead` 三方一致；仓库未使用 GitHub Releases latest 字段。
