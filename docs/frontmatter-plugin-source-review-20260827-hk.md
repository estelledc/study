# Frontmatter-plugin source review (writer HK)

> 用途：记录 remark-frontmatter、vfile-matter 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer HK
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- review_mode：`STATIC_REVIEW`
- excluded slugs：`gray-matter`、`front-matter`（开放 PR #263）、`marked`、`markdown-it`（writer AC 已占用），以及 knex / ioredis / redis / BullMQ

## remark-frontmatter

- canonical source：`https://github.com/remarkjs/remark-frontmatter`
- revision：`df7122f529563e35183f97e6643d9bf1725c60f2`
- package：`remark-frontmatter@5.0.0`
- tag：`5.0.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `index.js`
  - `lib/index.js`
  - `readme.md`
  - `test/index.js`
  - `test/fixtures/yaml-default/{input.md,tree.json}`
  - `test/fixtures/yaml-empty/{input.md,tree.json}`
  - `test/fixtures/toml-default/input.md`
  - `test/fixtures/toml-unconfigured/{input.md,output.md,tree.json}`
  - `test/fixtures/yaml-unconfigured/{config.json,input.md,tree.json}`
  - `test/fixtures/core-yaml-not-at-top/{input.md,tree.json}`
  - `test/fixtures/yaml-unclosed/{input.md,tree.json}`
  - `test/fixtures/custom-yaml-anywhere/config.json`
- observed：
  - ESM-only，`exports` 为 `./index.js`，`sideEffects` 为 false；公开 API 只有 default export；
  - `emptyOptions` 是字符串 `'yaml'`；`options || emptyOptions` 使 `null`/`undefined` 回退到 YAML；
  - 实现只向 `processor.data()` 的 `micromarkExtensions`、`fromMarkdownExtensions`、`toMarkdownExtensions` 三个数组 `push` 扩展；
  - 不调用 YAML/TOML 解析器，不写 `file.data`；fixture 中默认 YAML 节点是 `{type:'yaml', value:'title: example'}`；
  - 未配置 TOML 时 `+++` 落成 paragraph；只配 `['toml']` 时开头的 `---` 落成 thematicBreak；
  - 文档中间的 `---` 默认不是 frontmatter；非法 matter 在 `.freeze()` 抛错。
- provenance：
  - GitHub tag `5.0.0`、npm `5.0.0` 与 `gitHead` 三方均为 `df7122f5...`。

## vfile-matter

- canonical source：`https://github.com/vfile/vfile-matter`
- revision：`20c6193bb118f4c65488e0daaf2e66f5cafc733f`
- package：`vfile-matter@5.0.1`
- tag：`5.0.1`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `index.js`
  - `lib/index.js`
  - `readme.md`
  - `test.js`
- observed：
  - ESM-only，公开 API 只有命名导出 `matter`；生产依赖是 `vfile@^6` 与 `yaml@^2`；
  - 匹配正则锚定文件开头，围栏写死为 `---`，兼容 CRLF / CR / LF；
  - 命中后 `file.data.matter = yaml.parse(match[1] || '', yamlOptions) || {}`；未命中也写成 `{}`；
  - `strip` 默认 false；为 true 时 `slice` 掉匹配前缀，`Uint8Array` 会再 `TextEncoder`；
  - 空围栏、空白行围栏、无 matter 都得到 `{}`；正文后续 `---` 不被二次匹配；
  - `yaml.version` 为 `'1.1'` 时 `yes: no` 变成 `{true: false}`，`'1.2'` 时变成 `{yes: 'no'}`。
- provenance：
  - GitHub tag `5.0.1`、npm `5.0.1` 与 `gitHead` 三方均为 `20c6193b...`。
