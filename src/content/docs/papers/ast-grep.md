---
title: ast-grep — 用 AST 结构而不是正则去搜代码
来源: Herrington Darkholme, ast-grep, GitHub 2022 起，https://ast-grep.github.io/
日期: 2026-05-31
分类: 编程语言
难度: 入门
---

## 是什么

ast-grep（命令行叫 `sg`）是一个**按代码结构搜索和改写代码**的工具。日常类比：grep 像在书里"按字面找词"，ast-grep 像"按句子的语法成分找词"——你能说"找所有'宾语是 logger 的动词'"，而不是"找所有出现 logger 的行"。

举个最小例子。你想把项目里所有 `console.log(x)` 改成 `logger.info(x)`：

```bash
sg --pattern 'console.log($A)' --rewrite 'logger.info($A)' --lang js
```

这里 `$A` 是**占位符**（meta-variable），意思是"这里出现的什么东西，原样塞回去"。比 `sed` 强的地方：它不会误伤字符串里的 `console.log`、注释里的 `console.log`、或者变量名叫 `myConsole.log` 的——因为它读的是**语法树**，不是字符串。

## 为什么重要

不理解 ast-grep 这类工具，下面这些事处理起来会很痛：

- **API 迁移**：Vue 2 升 Vue 3、React 类组件升 hook、某个废弃 API 全项目替换。正则替换 99% 的情况都会漏或错。
- **大规模 lint 自定义规则**：团队约定"禁止 `setTimeout`"，ESLint 写规则要 100 行 JS、要懂 AST 节点类型；ast-grep 一个 YAML 文件搞定。
- **CI 守卫**：PR 里出现某个 anti-pattern 就阻断合并。
- **看代码**：搜 "所有调用了某函数的位置" 比 grep 准确得多——grep 会撞同名变量、字符串、注释。

简单说：grep / sed 把代码当**字符串**，ast-grep 把代码当**结构**。后者是过去十年代码工具该走的方向。

## 核心要点

ast-grep 的全部能力可以拆成 **三个概念**：

1. **Pattern（模式）**：一段**长得跟目标语言一样**的代码，把要变化的位置换成 meta-variable。比如 `console.log($A)` —— 这就是合法 JS 语法，只是 `$A` 是个洞。这点跟 Semgrep 类似，跟 Comby 不同。

2. **Meta-variable（占位符）**：
   - `$A`、`$NAME`：匹配**单个**节点（一个表达式、一个语句）
   - `$$$ARGS`：匹配**任意多个**节点（一串参数、一串语句）
   - 同名占位符要求**值相同**——`$A == $A` 用来找"两边一样"的代码

3. **Rule（规则）**：YAML 写的复合判断，能组合 pattern + 节点种类（kind）+ 上下文关系（inside、has）。复杂规则用 rule，简单查找直接用 pattern。

底下的解析器是 **tree-sitter**——一个能给 20+ 语言出语法树的库。ast-grep 不重写 parser，它只在 tree-sitter 之上盖了一层"模式语言"。

## 实践案例

### 案例 1：API 迁移

把项目里旧的 `request(url, opts)` 全部换成新签名 `httpClient.send({ url, ...opts })`：

```bash
sg --pattern 'request($URL, $OPTS)' \
   --rewrite 'httpClient.send({ url: $URL, ...$OPTS })' \
   --lang ts -i
```

`-i` 是交互模式——每个匹配点都让你按 y/n 确认。比直接全量 sed 安全得多：注释里、字符串里、变量名包含 `request` 的位置不会被改。

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

写 ESLint 等价规则要懂 AST 节点类型、要装一堆模板，写 100 行起步。ast-grep 这边就 5 行 YAML。

### 案例 3：搜代码（不改）

"所有用了 `useState` 但没传初值的地方"：

```bash
sg --pattern 'useState()' --lang tsx
```

跟 grep 比，它不会撞 `myUseState()`、注释里的 `useState()`、字符串里的 `"useState()"`。

## 踩过的坑

1. **pattern 必须是合法语法**——你写 `function $A(` 会被 tree-sitter 拒绝（不完整）。要写完整一个语法单元：`function $A($$$ARGS) { $$$BODY }`。

2. **meta-variable 大小写有约定**：`$A`、`$NAME`（大写）匹配节点；小写的当字面量字符。新人常把 `$x` 写出来才发现不工作。

3. **rule YAML 里 kind 字段依赖 tree-sitter 的语法树节点名**——不同语言节点名不一样（Python 的 `function_definition` ≠ JS 的 `function_declaration`）。要查官方 playground 才知道写啥。

4. **改完不会自动 format**——`--rewrite` 出来的代码可能缩进乱、引号风格乱。一般跑完接 `prettier`/`biome` 走一遍。

5. **不是万能**：跨文件分析、数据流追踪（这个变量从哪来）、副作用追踪——ast-grep 不做。需要这些去 Semgrep / CodeQL。

## 适用 vs 不适用场景

**适用**：

- 单文件结构搜索 / 改写
- API 迁移 codemod
- 团队自定义 lint 规则（语法层面，不涉及类型/数据流）
- CI 里的 anti-pattern 守卫
- 在大仓里看"谁调了我"——比 grep 准

**不适用**：

- 跨文件类型推导 / 数据流分析 → 用 Semgrep / CodeQL
- 全语言无关结构搜索 → Comby 在没有 tree-sitter grammar 的语言上更好用
- 复杂的语义重构（重命名跟着 import / 类型走）→ 用 IDE 自带的 LSP 重构

## 历史小故事（可跳过）

- **2018 年**：tree-sitter 在 GitHub 内部成熟，给所有语言提供统一的 incremental parser。
- **2020 年**：Semgrep 走红，证明"按 AST 模式搜代码"在工业上有需求；但 Semgrep 用 Python + OCaml，慢。
- **2022 年**：Herrington Darkholme 用 Rust + tree-sitter 重写这个思路，发布 ast-grep。卖点：**快**（Rust 并行）+ **简单**（pattern 长得跟目标语言一样）。
- **2024-2025 年**：Vue / Pinia 等项目内部 codemod 用 ast-grep，进入主流工具箱。

## 学到什么

1. **结构化优于字符串化**——这是过去十年代码工具的总方向（LSP / tree-sitter / DAP）。grep/sed 不会消失，但"按结构改"会成默认。

2. **好工具的形状**：pattern 长得跟目标语言一样（不用学新 DSL）+ 性能足够（Rust + 并行）+ 渐进式（CLI → YAML 规则 → Node.js 编程接口）。三件事都做到才被采纳。

3. **生态依赖明显**：ast-grep 没造 parser，它站在 tree-sitter 肩上。十年前想做这个，光写 20 个语言的 parser 就够耗一辈子。**先有底座、再有应用层** 的工程惯例又一次被印证。

4. **跟 Hindley-Milner 隔了一层关系**：HM 是"编译器自己推类型"，ast-grep 是"程序员按结构搜代码"，两件事都把"代码当数据"。前者是理论起点，后者是工具落地。

## 延伸阅读

- 官网（含 playground，可在线试 pattern）：[ast-grep.github.io](https://ast-grep.github.io/)
- GitHub 源码：[ast-grep/ast-grep](https://github.com/ast-grep/ast-grep)
- 作者博客（讲为什么造它）：Herrington Darkholme 系列文章
- [[tree-sitter]] —— ast-grep 站在它肩上的解析器框架
- [[biome]] —— 同样用 Rust 写的 JS/TS 工具链，理念相似
- [[compiler-errors]] —— 好工具的报错信息设计

## 关联

- [[hindley-milner]] —— 同样把"代码当结构"，HM 推类型，ast-grep 改代码
- [[biome]] —— Rust 工具链典型代表，定位互补（biome 做 lint+format，ast-grep 做 codemod）
- [[compiler-errors]] —— pattern 写错时 ast-grep 的报错也走"指给位置 + 给建议"路线

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

