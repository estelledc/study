---
title: Wadler Prettier — 函数式优雅打印器
来源: 'Wadler, "A prettier printer", 2003'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Wadler Prettier 是一套**让代码格式化变成"代数运算"**的方法。日常类比：你以前写代码 formatter，要在脑子里画决策树——"这行如果超过 80 字符就换行，否则就拼一行"。Wadler 让你不用画决策树，只要写一个**代数表达式**描述布局可能，机器自己挑最优。

举个例子。你想格式化一段 if 判断，写：

```haskell
text "if" <> line <> nest 4 (text "x > 0")
```

机器读完，根据当前列宽自动决定输出：

- 列宽够 → `if x > 0`
- 列宽不够 → `if\n    x > 0`

整个过程**没让你写一行 if/else**。这就是 Wadler 的核心魔法——把"换不换行"从程序员的判断变成机器的代数推导。

## 为什么重要

不理解 Wadler，下面这些事都没法解释：

- 为什么 Prettier (JS) / Black (Python) / rustfmt 都长得很像——它们是**同一套理论**的不同语言版本
- 为什么"代码格式化"从一堆 ad-hoc 启发式（"够长就换"）变成了**可推导的代数**
- 为什么 Haskell 生态有 ghc-prettier / Idris 内置 formatter——Wadler 自己用 70 行 Haskell 把全栈造完，每个新语言抄过去就能用
- 为什么后续 Christian Lindig 改进版（PPrint 路线）成了所有非 Haskell formatter 的主流

## 核心要点

Wadler 把 formatter 拆成 **三层**：

1. **Doc ADT（代数数据类型）**：5 个原子 + 1 个分组算子。`text "abc"`（字面量）/ `line`（换行点）/ `nest 4 d`（缩进 4 格）/ `<>`（横向拼接）/ `group d`（多个候选）。任何文档结构都能用这 5 个搭出来。

2. **Best-fit 算法（按列宽选最佳）**：给定列宽（比如 80），从所有候选 layout 里挑"第一行能塞下且最紧凑"的那个。用一个 `fits` 函数看第一行够不够——够就 flatten 成一行，不够就保留换行。

3. **Lazy evaluation 兜底**：候选 layout 看似指数级（每个 group 两个分支），但 Haskell 懒求值让"用不到的分支不算"。这是 1000 行 JSON 也能秒级格式化的关键。

三步加起来就是论文标题《A Prettier Printer》——70 行 Haskell 论文里直接贴完。

## 实践案例

### 案例 1：if 表达式自动选择布局

```haskell
ifDoc = text "if" <> line <> nest 4 (text "x > 0")
```

不同列宽下输出不同：

```
列宽 = 80：
if x > 0

列宽 = 5：
if
    x > 0
```

**逐步解释**：

- `<>` 把三段拼起来，类似字符串 `+`
- `line` 既可以变成空格（短时）也可以变成换行（长时）——它是"换行点候选"，不是硬换行
- `nest 4` 只在真换行时才生效——它是 line break 处的属性，不是文本前缀

### 案例 2：JSON 格式化的 group + line 套路

格式化 `{a: 1, b: 2}`：

```haskell
group (text "{" <> nest 2 (line <> field "a" 1 <> text "," <> line <> field "b" 2) <> line <> text "}")
```

- 列宽够 → `{ a: 1, b: 2 }`（整组 flatten 到一行）
- 列宽不够 → 分行 + 缩进 2 格

`group` 的语义就是"试试 flatten 到一行，不行再保留换行"。所有现代 formatter（Prettier / Black / rustfmt）都靠这个原语决定"短就一行长就分行"。

### 案例 3：Prettier 里你能看到的 Wadler 影子

```js
const doc = group(concat([
  "function ",
  name,
  "(",
  indent(concat([softline, params])),
  softline,
  ")"
]))
```

`group` / `concat` / `indent` / `softline` 全是 Wadler 1998 的概念——只是 JS 版多了 `softline`（短时空字符、长时换行）这种细分原语。**Prettier 没发明算法，只是把 Wadler 翻译到 JS 生态**。

## 踩过的坑

1. **严格语言不能直接复制 Haskell 代码**：Wadler 的 best-fit 在 Python / JS 里**指数爆炸**——Haskell 的 lazy evaluation 帮你剪枝，严格语言必须显式 memo / trampoline 兜底。Lindig 2000 论文专门解决这个问题，现代 Prettier 都走 Lindig 路线。

2. **看第一行不一定最优**：Wadler 的 `fits` 只检查第一行能不能塞下——多 group 嵌套时可能选错"短第一行但后续溢出"的路径。但工程上极少触发，全行业仍用 Wadler。

3. **flatten 把 nest 一起扔了**：`flatten (nest 4 (text "a" <> line <> text "b"))` 输出 `a b`——nest 4 的缩进**完全消失**。这是设计选择：flatten 后只剩一行，缩进失去意义。新人移植时常忘记这条。

4. **代数律不是无损**：5 个原子构成的代数干净简洁，但 Hughes 1995 用"负缩进 trick"能写的某些复杂 layout，Wadler 表达不出。换 70 行 Haskell + 30% 简洁，付的代价是某些边角 layout 失去。

## 适用 vs 不适用场景

**适用**：

- 任何"输出有缩进结构"的场景：代码格式化、SQL 美化、JSON 漂亮打印、AST 反序列化、HTML 渲染
- 写代码生成器：先建 Doc 树（描述结构），再交给 pretty(width) 决策——改宽度 / 改缩进规则都不用动生成代码
- 学习函数式编程的代数设计——5 个原子覆盖完整表达力是教科书级范例

**不适用**：

- 需要"半 flatten"（部分换行部分不换）—— Wadler 是整组 flat 或整组散开，没中间态
- 增量格式化（编辑器 format-on-save）—— Wadler 每次重排整棵树，没增量算法
- 极端性能要求（百万行）—— 算法常数因子在严格语言里偏大，需自己写 visitor pattern 替代

## 历史小故事（可跳过）

- **1980 年**：Derek Oppen 写了 imperative + buffer 路线的 pretty-printing 算法，OCaml `Format` 库的源头。状态散在 buffer 里，函数式实现极难。
- **1995 年**：John Hughes 写《The design of a pretty-printer library》，第一次用代数视角看格式化。但用了"负缩进 trick"，代码绕。
- **1998 年**：Wadler 在《The Fun of Programming》一书里写章节《A prettier printer》——**单一连接 `<>` + nest 只在 line break 处生效**，比 Hughes 干净一倍。70 行 Haskell。书 2003 年正式出版。
- **2000 年**：Christian Lindig 发表《Strictly Pretty》，把算法移到严格语言（不靠 lazy 求值），成为 OCaml / Java / JS formatter 的实际蓝本。
- **2008 年**：Daniel Leijen 的 wl-pprint 库（Wadler-Leijen 修正版）成为 Haskell 生态主流。
- **2014–2017 年**：James Long 把 Wadler 思想搬到 JS，发布 Prettier，三年内成 frontend 默认 formatter。
- **2024 年**：dprint / Prettier 4 仍基于这套思想——20 多年没人换骨架。

## 学到什么

1. **代数设计能把"工程问题"变"数学问题"**——5 个原子 + 几条律就够，不需要画状态机
2. **少即是多**：Wadler 砍掉 Hughes 的"负缩进"换 30% 更短代码——理论上损失了一些表达力，工程上几乎无感
3. **lazy evaluation 不是装饰**——它是把 Wadler 的指数算法降到线性的关键。严格语言移植必须重新设计执行顺序
4. **70 行代码够吗？** Haskell 里够，因为代数律消化了大量逻辑。Java / Python 里需要 300-500 行——"简洁"是语言 + 设计的合谋

## 延伸阅读

- 论文 PDF：[A prettier printer](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)（22 页，含完整 70 行 Haskell，可直接 paste 到 ghci 跑）
- 工业化版：[Prettier 官方文档](https://prettier.io/docs/en/)（看 doc-builders 模块的 group / softline / indent，逐个对照 Wadler 原语）
- 严格语言版：[Strictly Pretty (Lindig 2000)](https://lindig.github.io/papers/strictly-pretty-2000.pdf)（不靠 lazy 求值的实现，OCaml / Java formatter 的蓝本）

## 关联

- [[hindley-milner]] —— 同时代爱丁堡函数式编程产物，与 Wadler 同属"理论 → 算法 → 工程"三段式
- [[lambda-calculus]] —— 函数式编程的根，Wadler 的代数设计是 λ-演算式思维在文档结构上的延伸
- [[turing-1936]] —— 可计算性源头，与 Wadler 同属"用最少原语描述最多结构"的思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[oxc]] —— oxc — Rust 写一整套 JS/TS 工具链的勇气
- [[reynolds-definitional-interpreters]] —— Reynolds Definitional Interpreters — 用一种语言去定义另一种语言
- [[shfmt]] —— shfmt — Shell 脚本的 gofmt（用 Go 写的统一格式化器）
- [[turing-1936]] —— Turing 1936 可计算性
- [[unified]] —— unified — 把文档处理拆成 AST + plugin 流水线

