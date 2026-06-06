---
title: ast-grep — 按语法树搜代码、改代码的命令行工具
来源: https://github.com/ast-grep/ast-grep
日期: 2026-05-31
子分类: 命令行工具
分类: CLI
难度: 中级
provenance: pipeline-v3
---

## 是什么

ast-grep（命令叫 `sg`）是 Herrington Darkholme 2022 年用 Rust 写的**按代码结构搜索和改写**的命令行工具。日常类比：

- **grep / ripgrep**：在书里"按字面找词"。你搜 `log` 会撞上 `login`、`dialog`、字符串里的 `"log"`、注释里的 `// log`。
- **ast-grep**：在书里"按语法成分找词"。你说"找所有把 `console.log` 当函数调用的位置"，它读的是语法树，不会撞同名变量、字符串、注释。

最直观对比，把项目里 `console.log(x)` 全部改成 `logger.info(x)`：

```bash
# ripgrep + sed：会误伤字符串、注释、myConsole.log
rg console.log | xargs sed -i 's/console.log/logger.info/g'

# ast-grep：只改真的函数调用
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js
```

`$A` 是占位符（meta-variable），意思是"这里是什么就原样塞回去"。底下的解析器是 **tree-sitter**——一个能给 20+ 语言出语法树的库。ast-grep 只在它之上盖了一层"模式语言"，自己不重写 parser。

## 为什么重要

不理解 ast-grep 这类工具，下面这些事处理起来会很痛：

- **API 迁移**：Vue 2 升 Vue 3、React 类组件升 hook、某个废弃 API 全项目替换。正则替换 99% 的情况都会漏或错。
- **大规模 codemod**：改 5000 个文件的导入路径、把回调改 async/await、给所有函数补 type 注解。
- **团队 lint 规则**：ESLint 写一条规则要懂 AST 节点类型、要装一堆模板，100 行 JS 起步；ast-grep 一个 5 行 YAML 文件搞定。
- **CI 守卫**：PR 里出现某个 anti-pattern 就阻断合并。
- **看代码**：搜"所有调用了某函数的位置"比 grep 准确得多——grep 会撞同名变量、字符串、注释。

简单说：grep / sed 把代码当**字符串**，ast-grep 把代码当**结构**。后者是过去十年代码工具该走的方向（LSP、tree-sitter、DAP 都同源）。

## 核心要点

ast-grep 的全部能力可以拆成 **三个概念**：

1. **Pattern（模式）**：一段**长得跟目标语言一样**的代码，把要变化的位置换成 meta-variable。比如 `console.log($A)` —— 这就是合法 JS 语法，只是 `$A` 是个洞。这点跟 Semgrep 类似，跟 Comby 不同（Comby 用自定义占位符语法）。

2. **Meta-variable（占位符）**：
   - `$A`、`$NAME`：匹配**单个**节点（一个表达式、一个语句）
   - `$$$ARGS`：匹配**任意多个**节点（一串参数、一串语句）
   - 同名占位符要求**值相同**——`$A == $A` 用来找"两边一样"的代码

3. **Rule（规则）**：YAML 写的复合判断，能组合 pattern + 节点种类（kind）+ 上下文关系（inside、has）。简单查找直接用 pattern；复杂规则（"在 try 块里 + 调用了 fetch + 没有 catch"）用 rule。

底下三层都不是 ast-grep 自己写的：tree-sitter 提供 parser，正则用 Rust `regex` crate，并行用 `rayon`。**先有底座、再有应用层** 这条工程惯例又一次被印证。

## 实践案例

### 案例 1：5 分钟跑通

```bash
brew install ast-grep            # macOS
# 或 cargo install ast-grep --locked
# 或 npm install -g @ast-grep/cli

cd your-project
sg --pattern 'console.log($A)' --lang js   # 先看哪些会被改
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js -i
```

`-i` 是交互模式——每个匹配点按 y/n 确认，比直接全量改安全。

### 案例 2：写一条团队 lint 规则

文件 `rules/no-set-timeout.yml`：

```yaml
id: no-set-timeout
language: TypeScript
rule:
  pattern: setTimeout($$$ARGS)
message: 项目里禁用 setTimeout，请用 scheduler.schedule
severity: error
```

放进 CI：

```bash
sg scan --rule rules/no-set-timeout.yml
```

写 ESLint 等价规则要懂 AST 节点类型、装模板、写 100 行 JS。ast-grep 这边 5 行 YAML。

### 案例 3：API 迁移 codemod

把旧的 `request(url, opts)` 全部换成新签名 `httpClient.send({ url, ...opts })`：

```bash
sg --pattern 'request($URL, $OPTS)' \
   --rewrite 'httpClient.send({ url: $URL, ...$OPTS })' \
   --lang ts -U
```

`-U` 是更新文件（不加只是 dry-run 输出 diff）。

## 踩过的坑

1. **pattern 必须是合法语法**——`function $A(` 会被 tree-sitter 拒绝（不完整）。要写完整语法单元：`function $A($$$ARGS) { $$$BODY }`。

2. **meta-variable 大小写有约定**：`$A`、`$NAME`（大写）匹配节点；小写当字面量字符。新人常把 `$x` 写出来才发现不工作。

3. **rule YAML 里 kind 字段依赖 tree-sitter 节点名**——不同语言节点名不一样（Python `function_definition` ≠ JS `function_declaration`）。要查官方 [playground](https://ast-grep.github.io/playground.html) 才知道写啥。

4. **改完不会自动 format**——`--rewrite` 出来的代码可能缩进乱、引号风格乱。一般跑完接 `prettier` / `biome` 走一遍。

5. **不是万能**：跨文件类型推导、数据流追踪、副作用追踪——ast-grep 都不做。需要这些去 Semgrep / CodeQL。

## 适用 vs 不适用场景

**适用**：

- 单文件结构搜索 / 改写
- API 迁移 codemod（最大用例）
- 团队自定义 lint 规则（语法层面，不涉及类型 / 数据流）
- CI 里的 anti-pattern 守卫
- 大仓里看"谁调了我"——比 grep 准

**不适用**：

- 跨文件类型推导 / 数据流分析 → 用 Semgrep / CodeQL
- 全语言无关搜索 → Comby 在没有 tree-sitter grammar 的语言上更好用
- 复杂语义重构（重命名跟着 import / 类型走）→ 用 IDE 自带 LSP 重构
- 纯文本搜索（日志、配置、Markdown）→ 用 ripgrep，不必上 AST

## 历史小故事（可跳过）

- **2018 年**：tree-sitter 在 GitHub 内部成熟，给所有主流语言提供统一的 incremental parser。
- **2020 年**：Semgrep 走红，证明"按 AST 模式搜代码"在工业上有需求；但 Semgrep 用 OCaml + Python，慢，安装重。
- **2022 年**：Herrington Darkholme 用 Rust + tree-sitter 重写这个思路，发布 ast-grep。卖点：**快**（Rust 并行）+ **简单**（pattern 长得跟目标语言一样）+ **轻**（一个二进制，无 Python 依赖）。
- **2024-2025 年**：Vue / Pinia 等项目内部 codemod 工具链采用 ast-grep。`@ast-grep/napi` 让 Node.js 也能编程式调用。

## 学到什么

1. **少做事是最大的优化**——ast-grep 不重写 parser、不做数据流、不管 format，把 90% 场景做透就够了。这是工程优化的第一性原理。

2. **结构化优于字符串化**——这是过去十年代码工具的总方向（LSP / tree-sitter / DAP）。grep / sed 不会消失，但"按结构改"会成默认。

3. **好工具的形状**：pattern 长得跟目标语言一样（不用学新 DSL）+ 性能足够（Rust + 并行）+ 渐进式（CLI → YAML 规则 → Node.js 编程接口）。三件事都做到才被采纳。

4. **生态依赖明显**：ast-grep 没造 parser，它站在 tree-sitter 肩上。十年前想做这个，光写 20 个语言的 parser 就够耗一辈子。

## 延伸阅读

- 官网（含 playground，可在线试 pattern）：[ast-grep.github.io](https://ast-grep.github.io/)
- GitHub 源码：[ast-grep/ast-grep](https://github.com/ast-grep/ast-grep)
- 入门教程：[Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html)
- 规则参考：[Rule Object Reference](https://ast-grep.github.io/reference/rule.html)
- 作者博客：Herrington Darkholme 写过几篇讲设计权衡的文章

## 关联

- [[ripgrep]] —— 同样 Rust 写的搜索工具，互补不互斥（ripgrep 按文本搜，ast-grep 按结构搜）
- [[biome]] —— 同属 Rust 工具链浪潮，定位互补（biome 做 lint+format，ast-grep 做 codemod）
- [[swc]] —— Rust 写的 TS/JS 编译器，同属"用 Rust 改写老工具"流派
- [[claude-code]] —— Claude Code 等编辑器用 ripgrep 做项目搜索，但写 codemod 时会调 ast-grep

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ast-grep]] —— ast-grep — 按语法树搜代码、改代码的命令行工具
- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[dive]] —— dive — 看清 Docker 镜像每一层加了什么文件的 TUI
- [[kakoune]] —— Kakoune — 多光标优先模态编辑器
- [[nvchad]] —— NvChad — 极致美观的 Neovim 配置框架
- [[ripgrep]] —— ripgrep — Rust 写的现代 grep
- [[swc]] —— SWC — Rust 写的 TS/JS 编译器
- [[the-silver-searcher]] —— the_silver_searcher (ag) — 比 grep/ack 快一个数量级的代码搜索
- [[universal-ctags]] —— Universal Ctags — 老牌符号索引器，编辑器跳转到定义的底层引擎

