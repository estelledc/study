---
title: Wadler Prettier — 函数式优雅打印器
来源: 'Wadler, "A prettier printer", The Fun of Programming, 2003'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Wadler Prettier 是一套**让代码格式化变成"代数运算"**的方法。日常类比：你以前写 formatter，要在脑子里画决策树——"超过 80 字符就换行，否则拼一行"。Wadler 让你只写一个**代数表达式**描述布局可能，机器自己挑最优。

举个例子。你想格式化一段 if 判断，写（注意外层的 `group`）：

```haskell
group (text "if" <> line <> nest 4 (text "x > 0"))
```

机器读完，根据当前列宽自动决定输出：

- 列宽够 → `if x > 0`（`group` 把 `line` flatten 成空格）
- 列宽不够 → `if\n    x > 0`（保留换行 + nest 缩进）

没有 `group` 时，`line` **永远换行**——整组"试一行 / 不行再散开"的候选，全靠 `group` 打开。这就是核心魔法：把"换不换行"从 if/else 变成代数推导。

## 为什么重要

不理解 Wadler，下面这些事都没法解释：

- 为什么 Prettier（JS）的 doc-builders 长得像代数表达式——它是 Wadler/Lindig 路线的工程翻译
- 为什么"代码格式化"能从一堆 ad-hoc 启发式（"够长就换"）变成**可推导的布局代数**
- 为什么 Haskell 生态的 `pretty` / `wl-pprint` / `prettyprinter` 能用几十行核心代码覆盖完整表达力
- 为什么严格语言（OCaml / Java / JS）的主流 pretty-printer 多走 Christian Lindig 的 Strictly Pretty 路线，而不是直接抄 Haskell 懒求值版

## 核心要点

Wadler 把 formatter 拆成 **三层**：

1. **Doc ADT（代数数据类型，像积木盒）**：几个构造子搭文档——`text "abc"`（字面量）/ `line`（换行点）/ `nest 4 d`（缩进）/ `<>`（横向拼接）/ `group d`（打开"一行或分行"两个候选）。任何结构都能用它们搭出来。

2. **Best-fit 算法（按列宽选最佳）**：给定列宽（比如 80），用 `fits`（看第一行能不能塞下）决定：够就 **flatten**（把换行候选全压成空格），不够就保留换行。

3. **Lazy evaluation 兜底**：每个 `group` 两个分支，候选看似指数级；Haskell 懒求值让"用不到的分支不算"。这是大文档也能秒级格式化的关键。

三步加起来就是《A prettier printer》——论文里直接贴完整实现（常被称作约 70 行 Haskell）。

## 实践案例

### 案例 1：if 表达式自动选择布局

```haskell
ifDoc = group (text "if" <> line <> nest 4 (text "x > 0"))
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

- `<>` 把三段拼起来，类似字符串拼接
- `line` 是"换行点候选"：在 `group` 成功 flatten 时变空格，失败时变换行
- `nest 4` 只在真换行时生效——它是 line break 处的缩进属性，不是文本前缀
- 外层 `group` 必不可少：没有它，`line` 不会尝试变空格

### 案例 2：JSON 格式化的 group + line 套路

格式化 `{a: 1, b: 2}`：

```haskell
field k v = text k <> text ": " <> text (show v)
jsonDoc = group (
  text "{" <> nest 2 (
    line <> field "a" 1 <> text "," <> line <> field "b" 2
  ) <> line <> text "}"
)
```

**逐步解释**：

- 先用 `field` 把键值对变成 `text` 片段，再拼进大文档
- 整份包进 `group`：列宽够 → `{ a: 1, b: 2 }`（整组 flatten 到一行）
- 列宽不够 → 在每个 `line` 处分行，`nest 2` 给字段加两格缩进
- 现代 formatter（尤其 Prettier）的"短就一行、长就分行"，就是这个原语

### 案例 3：Prettier 里你能看到的 Wadler 影子

```js
const doc = group(concat([
  "function ", name, "(",
  indent(concat([softline, params])),
  softline, ")"
]))
```

**逐步解释**：

- `group` / `concat` / `indent` 对应 Wadler 的 `group` / `<>` / `nest`
- `softline` 是工程细分：短时空字符、长时换行（比裸 `line` 更细）
- Prettier **没发明**这套决策代数，而是把 Wadler/Lindig 思想搬到 JS 生态

## 踩过的坑

1. **严格语言不能直接复制 Haskell 代码**：Wadler 的 best-fit 在 Python / JS 里会**指数爆炸**——Haskell 懒求值帮你剪枝，严格语言必须显式 memo / trampoline。Lindig 2000 专门解决这个问题，现代 Prettier 走 Lindig 路线。
2. **看第一行不一定最优**：`fits` 只检查第一行——多 `group` 嵌套时可能选错"短第一行但后续溢出"的路径；工程上极少触发，全行业仍用。
3. **flatten 把 nest 一起扔了**：`flatten (nest 4 (text "a" <> line <> text "b"))` 得到 `a b`——缩进完全消失。这是设计选择：一行里缩进无意义。
4. **代数律不是无损**：Hughes 1995 用"负缩进 trick"能写的某些复杂 layout，Wadler 表达不出——换更短实现，付的是边角表达力。

## 适用 vs 不适用场景

**适用**：

- 输出有缩进结构：代码格式化、SQL 美化、JSON 漂亮打印、AST 反序列化
- 写代码生成器：先建 Doc 树，再交给 `pretty(width)`——改宽度不用动生成逻辑
- 学函数式代数设计——少量构造子覆盖完整表达力

**不适用**：

- 需要"半 flatten"（部分换行部分不换）——Wadler 是整组 flat 或整组散开
- 增量 format-on-save——每次重排整棵树，没有增量算法
- 极端性能：单文件数千行 AST 通常可接受；百万行级需分片或自写 visitor，常数因子在严格语言里偏大

## 历史小故事（可跳过）

- **1980**：Derek Oppen 写 imperative + buffer 路线；OCaml `Format` 的源头，状态散在 buffer 里。
- **1995**：John Hughes《The design of a pretty-printer library》，第一次用代数视角，但有"负缩进"绕法。
- **1998–2003**：Wadler 章节《A prettier printer》草稿约 1998，收入《The Fun of Programming》2003 出版——单一 `<>` + nest 只在 linebreak 生效，比 Hughes 干净。
- **2000**：Christian Lindig《Strictly Pretty》，移到严格语言，成 OCaml / Java / JS 蓝本。
- **2008–2017**：Leijen 的 wl-pprint 成 Haskell 主流；James Long 把思想搬到 JS，发布 Prettier。

## 学到什么

1. **代数设计能把工程问题变数学问题**——少量构造子 + 几条律就够，不必画状态机
2. **少即是多**：砍掉 Hughes 的"负缩进"换更短代码——理论损失一点表达力，工程上几乎无感
3. **lazy evaluation 不是装饰**——它是把指数候选降到可用的关键；严格语言移植必须重设计执行顺序
4. **几十行够吗？** Haskell 里够，因为代数律消化了大量逻辑；Java / Python 往往要多写几倍

## 延伸阅读

- 论文 PDF：[A prettier printer](https://homepages.inf.ed.ac.uk/wadler/papers/prettier/prettier.pdf)（含完整实现，可 paste 到 ghci）
- 工业化版：[Prettier 文档](https://prettier.io/docs/en/)（对照 group / softline / indent）
- 严格语言版：[Strictly Pretty (Lindig 2000)](https://lindig.github.io/papers/strictly-pretty-2000.pdf)
- 前传对照：Hughes 1995 pretty-printer library（理解 Wadler 简化了什么）
- 相关笔记：[[hindley-milner]] —— 同属"理论 → 算法 → 工程"三段式

## 关联

- [[hindley-milner]] —— 同时代爱丁堡函数式产物，同属"理论 → 算法 → 工程"
- [[lambda-calculus]] —— 函数式的根；Wadler 的代数是 λ 式思维在文档结构上的延伸
- [[turing-1936]] —— 用最少原语描述最多结构的同一思路
- [[reynolds-definitional-interpreters]] —— 用一种语言定义另一种语言的解释器传统
- [[mycroft-strictness]] —— 严格性分析；对照本文"懒求值为何救了指数算法"

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
