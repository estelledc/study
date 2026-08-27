# Markdown-render source review (writer HM)

> 用途：记录 commonmark.js、Remarkable 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：HM
- evidence：GitHub tag metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、CommonMark spec suite、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：marked、markdown-it、showdown、snarkdown；以及 knex、ioredis、redis、BullMQ

## commonmark.js

- canonical source：`https://github.com/commonmark/commonmark.js`
- revision：`cb2c2303d3550ec6ef28ceb2841f148e8761eebf`
- package：`commonmark@0.31.2`
- tag：`0.31.2`（与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `README.md`
  - `lib/index.js`
  - `lib/blocks.js`（`parse`、`processInlines`、`Parser` 工厂、`incorporateLine`）
  - `lib/inlines.js`（`options.smart` 弯引号 / dash / ellipsis）
  - `lib/node.js`（walker、container 类型、读写字段）
  - `lib/render/html.js`（默认放行 HTML、`safe` 协议过滤）
  - `lib/common.js`（引用，未整文件复述）
- observed：
  - `exports` 区分 `require` → `./dist/commonmark.js` 与默认 `./lib/index.js`；`engines.node` 为 `*`；生产依赖 `entities`、`mdurl`、`minimist`；
  - `Parser.parse` 先按行建块，再 `processInlines` 只处理 `paragraph` / `heading`；
  - `Parser` 函数直接返回状态对象，不是 class 实例字段；
  - `HtmlRenderer` 默认把 `html_inline` / `html_block` 原样写入；`safe: true` 才替换为注释，并拒绝 `javascript:` / `vbscript:` / `file:` / 多数 `data:`，只放行 `data:image/(png|gif|jpeg|webp)`；
  - 节点类型名单无 table / strikethrough；扩展靠改树，不靠 Ruler。
- provenance：
  - GitHub tag `0.31.2`、源码 `package.json` 与 npm `gitHead` 三方一致。

## Remarkable

- canonical source：`https://github.com/jonschlinkert/remarkable`
- revision：`58b6945f203ca7a0bb5a0785df90a3a6a8b9e59c`
- package：`remarkable@2.0.1`
- tag：`v2.0.1`（源码 `package.json` 版本同为 `2.0.1`）
- inspected：
  - `package.json`
  - `README.md`
  - `lib/index.js`
  - `lib/parser_core.js`
  - `lib/parser_inline.js`（`validateLink`）
  - `lib/parser_block.js`
  - `lib/ruler.js`
  - `lib/renderer.js`
  - `lib/rules.js`（`htmlblock` / `htmltag` / `link_open` / `fence`）
  - `lib/configs/default.js`
  - `lib/configs/commonmark.js`
  - `lib/configs/full.js`
  - `lib/rules_core/replacements.js`
  - `lib/rules_core/smartquotes.js`
  - `lib/rules_core/inline.js`
  - `lib/linkify.js`
  - `lib/helpers/parse_link_destination.js`
- observed：
  - 生产依赖 `argparse`、`autolinker`；`engines.node` 为 `>= 6.0.0`；发布物走 `dist/cjs` / `dist/esm`；
  - 默认 preset：`html: false`，block 含 table / footnote，inline 含 del；`commonmark` preset 裁掉这些并设 `html: true`、`xhtmlOut: true`；`full` 不限制规则表；
  - `configure` 在存在 `rules` 时调用 `ruler.enable(list, true)`，未列出的规则关闭；
  - `validateLink` 拒绝 `vbscript` / `javascript` / `file` / 全部 `data`，先做实体展开；
  - 构造选项 `linkify` 已移除，只留警告；插件 `remarkable/linkify` 用 Autolinker，仍再跑 `validateLink`；
  - `typographer` 为假时，已启用的 replacements / smartquotes 规则直接返回。
- provenance：
  - GitHub tag `v2.0.1` 与源码版本字段一致；npm `remarkable@2.0.1` 无 `gitHead`，本审查不伪造 registry 第三证。
