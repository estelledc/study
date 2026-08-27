# Front-matter parser source review (writer GQ)

> 用途：记录 `gray-matter` 与 `front-matter` 项目页迁移所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gq` 标记 2026-08-27 平行 writer GQ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GQ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 mocha / tape / check-dts，未测 bundle 或性能
- worktrees：本机 `research-worktrees/`（gitignored），不进入 Git
- slugs：`gray-matter`、`front-matter`

## gray-matter

- canonical source：`https://github.com/jonschlinkert/gray-matter`
- revision：`e54a33b394e14a1808b88f939507f374552906e4`
- package：`gray-matter@4.0.3`（MIT，`engines.node >= 6.0`）
- npm：`gray-matter@4.0.3` latest，`gitHead=e54a33b394e14a1808b88f939507f374552906e4`
- tag：GitHub 无 `4.0.3` / `v4.0.3`；最近源码 tag 为轻量 `4.0.2` → `90f81203005a26893247c03eb4790c5e082cb319`
- also observed：`origin/master` 在该提交之后还有 README / security PR，未绑定
- inspected：
  - `package.json`
  - `index.js`
  - `lib/defaults.js`
  - `lib/parse.js`
  - `lib/engines.js`
  - `lib/engine.js`
  - `lib/excerpt.js`
  - `lib/stringify.js`
  - `lib/to-file.js`
  - `lib/utils.js`
  - `gray-matter.d.ts`
  - `test/matter.js`
  - `test/matter.excerpt.js`
- observed：
  - 入口 `matter(input, options)` 经 `toFile` 规范化，无 options 时按 `file.content` 缓存对象引用，再交给 `parseMatter` 就地改；
  - 默认分隔符 `---`；`----` 因开分隔符后下一字符等于分隔符末字符而被拒绝；
  - 开分隔符后第一行非空则当作 language；内置 engine 只有 `yaml` / `json` / `javascript`；`coffee` / `toml` 需 `options.engines`；
  - 缺闭分隔符时 `content` 变为空串，剩余全部当作 matter；
  - `matter.test` 只检查开分隔符前缀；excerpt 默认关闭；`orig` 是非枚举 Buffer；
  - YAML 走 `js-yaml@^3.13.1` 的 `safeLoad` / `safeDump`；JavaScript engine 用 `eval`。

## front-matter

- canonical source：`https://github.com/jxson/front-matter`
- tag：`v4.0.2`（annotated）peel → `af61f89f5aa17cc848ba5a6796e1221c7c26cf96`
- revision：`af61f89f5aa17cc848ba5a6796e1221c7c26cf96`
- package：`front-matter@4.0.2`（MIT，无 `engines`）
- npm：`front-matter@4.0.2` latest，`gitHead` 与 peel 一致
- inspected：
  - `package.json`
  - `index.js`
  - `index.d.ts`
  - `README.md`
  - `test/index.js`
  - `examples/dashes-seperator.md`
  - `examples/yaml-seperator.md`
  - `examples/dots-ending.md`
  - `examples/unsafe.md`
- observed：
  - 单文件正则抽取，不做 IO；返回 `{ attributes, body, bodyBegin, frontmatter }`；
  - 开分隔符必须在首行，允许 `---` 或 `= yaml =`；闭分隔符可以是同一开分隔符或 `...`；
  - 缺闭分隔符时整段当普通文本，`attributes` 为空、`body` 仍是原文；
  - `fm.test` 走完整正则，要求开闭都在；
  - 默认 `js-yaml.safeLoad`；`allowUnsafe: true` 才用 `load`；没有 excerpt / engine / stringify / cache。
