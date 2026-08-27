---
title: ast-grep — 按语法树搜代码、改代码的命令行工具
来源: https://github.com/ast-grep/ast-grep
日期: 2026-08-27
分类: CLI
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: tool
  canonical_source: https://github.com/ast-grep/ast-grep
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c41e023a64060c9f263c23320aa5ff67be4bc474
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.45.2
---

## 是什么

ast-grep 是按 **AST 结构**搜索和改写代码的命令行工具。日常类比：ripgrep 在书里按字面找词；ast-grep 按语法成分找——`console.log($A)` 只匹配函数调用，不会撞上字符串或注释里的同名文本。

固定 `0.45.2` 的 CLI crate 同时产出两个二进制：`ast-grep` 与别名 `sg`。工作区版本、`@ast-grep/cli@0.45.2` 的 npm `gitHead` 与 lightweight tag `0.45.2` 都指向同一提交。

```bash
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js
```

`$A` 是 meta-variable：匹配单个 AST 节点，改写时原样填回。解析器来自 tree-sitter 0.26.3；ast-grep 自己写的是模式、规则和改写层。

## 为什么重要

不按固定源码读，下面这些印象会对不上：

- 旧笔记把语言数写成含糊的「20+」——`SupportLang` 枚举在这一提交里是 28 个内置语言
- `$x` / `$name` 看起来像占位符，但首字符必须是 `A-Z` 或 `_`，小写不是 meta-variable
- `sg -U` 不会单独落盘；没有 `--rewrite` 时 clap 直接拒绝
- YAML 规则的 `-r` 属于 `scan`，CLI 一次性改写的 `-r` 属于 `run --rewrite`

## 核心要点

固定 0.45.2 的主链可以拆成五步：

1. **默认入口是 `run`**：第一个参数以 `-` 开头且出现 `--pattern`/`-p` 或 `--kind`/`-k` 时，不必写 `run`。否则要显式子命令。
2. **模式先被 tree-sitter 吃进去**：`Pattern::try_new` 要求模式是合法语法单元。同名 `$A` 再次出现时必须和已捕获节点精确相等。
3. **规则是 YAML 对象**：`rule` 可写 `pattern` / `kind` / `regex`，以及 `inside` / `has` / `precedes` / `follows`，再用 `all` / `any` / `not` 组合。`language` 走大小写不敏感别名（`js`/`javascript`、`ts`/`typescript`）。
4. **扫描与一次性改写是两条命令**：`sg scan --rule file.yml` 读规则文件；`sg -p ... -r ...` 做一次性 rewrite。`scan` 另有 `--inline-rules`，与 `--rule` 互斥。
5. **并行走 `ignore::WalkParallel`**：生产者线程解析文件，主线程打印。不是自己重写 parser，也不是在这一提交的 workspace 依赖里直接挂 `rayon`。

`SupportLang` 内置：Bash、C、Cpp、CSharp、Css、Dart、Elixir、Go、Haskell、Hcl、Html、Java、JavaScript、Json、Kotlin、Lua、Markdown、Nix、Php、Python、Ruby、Rust、Scala、Solidity、Swift、Tsx、TypeScript、Yaml。自定义语言走 `ast-grep-dynamic`。

## 实践示例

### 案例 1：先看匹配再改写

```bash
sg --pattern 'console.log($A)' --lang js
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js -i
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js -U
```

`-i` 开交互确认；`-U` / `--update-all` 不询问直接改文件，但必须同时给 `--rewrite`。不加 `-i`/`-U` 只打印 diff。

### 案例 2：一条 YAML lint 规则

```yaml
id: no-set-timeout
language: typescript
rule:
  pattern: setTimeout($$$ARGS)
message: 项目里禁用 setTimeout，请用 scheduler.schedule
severity: error
```

```bash
sg scan --rule rules/no-set-timeout.yml
```

`$$$ARGS` 是 multi-capture，匹配零个或多个兄弟节点。`severity` 只能是 `hint` / `info` / `warning` / `error` / `off`。自动修复写 `fix`，不是 CLI 的 `--rewrite`。

### 案例 3：签名迁移

```bash
sg --pattern 'request($URL, $OPTS)' \
   --rewrite 'httpClient.send({ url: $URL, ...$OPTS })' \
   --lang ts -U
```

同名占位符要求结构相同。需要「只匹配某种 kind」时用 `--selector` 或 `--kind`，二者不能和对方叠在同一条 `run` 上。

## 踩过的坑

1. **把 `$foo` 当占位符**：`extract_meta_var` 的首字符只接受 `A-Z` 与 `_`。`$123`、`$abc` 都不是变量。
2. **残缺 pattern**：`function $A(` 过不了 tree-sitter。要写完整单元，例如 `function $A($$$ARGS) { $$$BODY }`。
3. **`run -U` 却不给 rewrite**：测试与 clap 都要求 `--rewrite`；只扫描请用 `scan`。
4. **YAML `language: TypeScript` 能过，但 kind 名仍跟 grammar**：JS 的 `function_declaration` 与 Python 的 `function_definition` 不能混用。
5. **改写后不会自动 format**：`--rewrite` / `fix` 只替换匹配节点，缩进和引号风格要另接 formatter。

## 适用 vs 不适用场景

**适用**：

- 单文件结构搜索与 codemod
- 语法层团队规则和 CI 守卫（`scan`，可选 GitHub / SARIF 输出）
- 需要 pattern 长得像目标语言，而不是另学一套 DSL

**不适用**：

- 跨文件类型推导或数据流——固定源码没有这些分析器
- 没有 tree-sitter grammar 的语言——先看 dynamic 自定义语言，或改用纯文本搜索
- 把「Rust 并行」写成已测吞吐——本文没有跑 benchmark
- 需要语义重构跟着 import / 类型走——应看 LSP，不要外推 ast-grep

## 固定版本边界

- 本文绑定 `ast-grep/ast-grep@c41e023a64060c9f263c23320aa5ff67be4bc474`。lightweight tag `0.45.2` 与 npm `@ast-grep/cli@0.45.2` 的 `gitHead` 同指此提交；workspace `version` 为 `0.45.2`。
- MSRV 写在 workspace：`rust-version = "1.88.0"`。另有 `lsp`、`outline`、`test`、`new`、`completions` 以及 napi / pyo3 / wasm crate；本文未启动 LSP，也未跑上游测试。
- 未安装 CLI、未对真实仓库执行 rewrite，状态保持 `UNVERIFIED`。

## 学到什么

1. **结构搜索的合同是 parser + 占位符规则，不是正则习惯**——大小写和完整性都写在源码里。
2. **同一条短选项在不同子命令含义不同**——`run -r` 是 rewrite，`scan -r` 是 rule 文件。
3. **内置语言表要按枚举读**——不能把文档里的「很多语言」当成当前 revision 的清单。
4. **并行和解析是底座，产品层是 pattern / YAML / 打印器**——少做事才能覆盖多语言。

## 应用型自测

1. `sg -p 'console.log($x)' -l js` 会把 `$x` 当成 meta-variable 吗？
2. `sg -p 'console.log($A)' -U` 会直接改文件吗？
3. 固定 0.45.2 的 `SupportLang` 里有没有 `Vue`？

检查点：

1. 不会。`$x` 首字符是小写，`extract_meta_var` 返回 `None`。
2. 不会。`-U` 要求同时提供 `--rewrite`，否则解析失败。
3. 没有。内置 28 个语言不含 Vue；HTML 可注入脚本语言，但那不是独立的 `Vue` 枚举。

## 延伸阅读

- 官网与 playground：[ast-grep.github.io](https://ast-grep.github.io/)
- 固定源码：[ast-grep/ast-grep](https://github.com/ast-grep/ast-grep) —— 本文绑定提交 `c41e023a64060c9f263c23320aa5ff67be4bc474`
- Pattern 语法：[Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)
- 规则对象：[Rule Object Reference](https://ast-grep.github.io/reference/rule.html)
- [[ripgrep]] —— 文本搜索对照
- [[biome]] —— lint/format 对照，不是 codemod

## 关联

- [[ripgrep]] —— 按文本搜，和按 AST 搜互补
- [[biome]] —— 同属 Rust 工具链，职责是 lint + format
- [[swc]] —— TS/JS 编译器，不是通用多语言 codemod
- [[asdf]] —— 本轮对照的版本管理器；安装 CLI 的方式以各发行渠道为准

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[dive]] —— dive — 看清 Docker 镜像每一层加了什么文件的 TUI
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎
