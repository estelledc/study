# Frontmatter-plugin source review (writer IU)

> 用途：记录 micromark-extension-frontmatter、mdast-util-frontmatter 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer IU
- evidence：GitHub tag metadata、npm latest 与 `gitHead`、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git
- excluded slugs：HM–ID 已预留；不写 `remark-frontmatter`、`vfile-matter`、`gray-matter`、`front-matter`、`marked`、`markdown-it`；不引入 knex / ioredis / redis / BullMQ

## micromark-extension-frontmatter

- canonical source：`https://github.com/micromark/micromark-extension-frontmatter`
- revision：`519a2880cab7d0065f534a70c851a38dd9b5a7f2`
- package：`micromark-extension-frontmatter@2.0.0`
- tag：`2.0.0`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `readme.md`
  - `dev/index.js`
  - `dev/lib/syntax.js`
  - `dev/lib/html.js`
  - `dev/lib/to-matters.js`
  - `test/index.js`
- observed：
  - 公开导出是 `frontmatter`、`frontmatterHtml`、`toMatters`；无 default export；
  - `exports` 在 `development` condition 下走 `dev/index.js`，默认走构建后的 `index.js`；本轮读的是仓内 `dev/` 源，未执行 `micromark-build`；
  - `toMatters` 把缺省 options 收成 `['yaml']`；已知 preset 只有 `yaml`（marker `-`）和 `toml`（marker `+`）；未知字符串抛 `Missing matter definition`；
  - `frontmatter()` 把每个 matter 的开栏首字符登记到 `flow` construct；construct 标记 `concrete: true`；
  - 开栏必须在第 1 列；默认还要求第 1 行，除非 `anywhere: true`；缩进或未闭合到 EOF 都会 `nok`，退回普通 thematic break / 段落；
  - `marker` 会 `repeat(3)`；`fence` 用完整字符串；两者互斥；栏后只允许空白，不允许别的字符；
  - `frontmatterHtml` 在 enter 时 `buffer()`，exit 时 `resume()` 并 `slurpOneLineEnding`，因此 HTML 输出不含 frontmatter；
  - 扩展只认围栏，不解析 YAML/TOML 语义。
- provenance：
  - GitHub tag `2.0.0`、npm latest 与 `gitHead` 三方均为 `2.0.0` / `519a2880...`。

## mdast-util-frontmatter

- canonical source：`https://github.com/syntax-tree/mdast-util-frontmatter`
- revision：`d76616b88bdafdbbcd97247c4d3a8a41cc71ae48`
- package：`mdast-util-frontmatter@2.0.1`
- tag：`2.0.1`（lightweight tag 与 npm `gitHead` 同指上述 commit）
- inspected：
  - `package.json`
  - `readme.md`
  - `index.js`
  - `lib/index.js`
  - `test.js`
- observed：
  - 公开导出是 `frontmatterFromMarkdown`、`frontmatterToMarkdown`；无 default export；`exports` 只有 `./index.js`；
  - 运行时依赖包含 `micromark-extension-frontmatter@^2.0.0`，并从该包复用 `toMatters`；options 合同与 syntax 扩展相同；
  - `frontmatterFromMarkdown` 为每个 matter 注册 `enter[type]`、`exit[type]`、`exit[type + 'Value']`；enter 时压入 `{type, value: ''}` 并 `buffer()`；
  - close 时 `resume()`，再用 `/^(\r?\n|\r)|(\r?\n|\r)$/g` 去掉首尾换行，得到 Literal `value`；不调用 YAML/TOML parser；
  - `frontmatterToMarkdown` 按 `open + (value ? '\n' + value : '') + '\n' + close` 写回；空值仍写出成对围栏；
  - `unsafe` 把开栏首字符标成 `atBreak`，并用 `escape-string-regexp` 保护第二字符，避免正文被误认成新围栏；
  - `@types/mdast` 默认带 `yaml`；`toml` / 自定义 type 要自己扩 `FrontmatterContentMap`；
  - 文档写明必须与 `micromark-extension-frontmatter` 成对使用才能从 markdown 建树。
- provenance：
  - GitHub tag `2.0.1`、npm latest 与 `gitHead` 三方均为 `2.0.1` / `d76616b8...`。
