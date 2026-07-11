---
title: PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
来源: 'Bryan Ford, "Parsing Expression Grammars: A Recognition-Based Syntactic Foundation", POPL 2004'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

**PEG**（Parsing Expression Grammar，解析表达式文法）是 Bryan Ford 在 POPL 2004 提出的一种**语法形式化**：和大学课本里教的"上下文无关文法"（CFG）不同，PEG 写出来的语法**对每一段输入只有一种解析方式**——没有二义、没有歧义、没有"看心情决定走哪条规则"。

日常类比：CFG 像一份**菜单**，告诉你"这道菜的原料可以是 A 或 B 或 C"，至于到底是哪一种菜单本身不管；PEG 像一份**菜谱**——"先试 A，A 不行再试 B，B 不行才试 C"，顺序写死了，结果唯一。

配套算法叫 **packrat parsing**：用一张大表把"在第 5 个字符开始能不能匹配规则 R"的结果**记住**（memoization），下次再问就直接查表。这一记，就把朴素回溯的指数时间压到了 **O(n)**——线性。

```
# 一个 PEG 例子：四则运算
Expr   <- Term ('+' Term / '-' Term)*
Term   <- Factor ('*' Factor / '/' Factor)*
Factor <- '(' Expr ')' / Number
Number <- [0-9]+
```

## 为什么重要

不理解 PEG，下面这些事都没法解释：

- 为什么 Lua 的 LPeg、Rust 的 pest、Janet 这类引擎写起来"像正则但是能写嵌套"
- 为什么很多现代 DSL（Markdown 解析器、配置语言、查询语言）抛弃了 yacc/bison 转用 PEG
- 为什么 PEG 写算术优先级**不需要**像 CFG 那样附一张"优先级表"
- 为什么有时一段 PEG 看起来"明明能匹配"却匹配不到——有序选择的左边赢了就不回头

## 核心要点

PEG 的核心创新就**三件事**，编号 1/2/3：

1. **有序选择 `e1 / e2`**：先试左边，**只在左边失败时**才试右边。CFG 的 `e1 | e2` 是"任一都行，二义没关系"，PEG 的 `/` 是"严格按顺序，左边赢就到此为止"。这是 PEG 不二义的来源。

2. **前瞻断言 `&e` / `!e`**：`&e` = "下面必须是 e，但**不消耗**输入"；`!e` = "下面必须**不**是 e"。日常类比：探员侦查——"我看一眼下家是不是警察，但不进门"。这让你能写"标识符不能是关键字"这种约束。

3. **记忆化（packrat）**：把每个 `(规则, 起始位置)` 对的解析结果存到一张表里。同一对再被问，O(1) 查表。整套递归下降回溯解析就从指数时间降到 **O(n) 时间 / O(n) 空间**。

合起来：PEG 是"语法形式化"，packrat 是"实现这套语法的具体算法"。两者一起出现在 Ford 2002 ICFP（packrat）+ 2004 POPL（PEG）两篇论文里。

## 实践案例

### 案例 1：四则运算 —— 不再需要"优先级表"

CFG 写 `1 + 2 * 3` 这种带优先级的算术，要么写得二义然后外加优先级声明（yacc 风格），要么写一堆分层规则。PEG 直接分层规则就够：

```
Expr   <- Term ('+' Term / '-' Term)*
Term   <- Factor ('*' Factor / '/' Factor)*
Factor <- '(' Expr ')' / Number
```

读法：`Expr` 由 `Term` 加加减加成；`Term` 由 `Factor` 乘除乘除成。**层级本身就是优先级**——下层规则先被尝试。

### 案例 2：标识符不能是关键字 —— `!e` 的妙用

```
Identifier <- !Keyword [a-zA-Z_][a-zA-Z_0-9]*
Keyword    <- 'if' / 'else' / 'while' / 'return'
```

`!Keyword` 读作"下面**不**是关键字才允许往下匹配"。这种约束在 CFG 里很难写，要么靠 lexer 阶段做，要么靠语义动作。PEG 直接写在文法里。

### 案例 3：Lua LPeg 把 PEG 当 API

先 `luarocks install lpeg`（独立库，不是 Lua 自带标准库），再：

```lua
local lpeg = require "lpeg"
local digit = lpeg.R("09")
local number = digit^1                  -- ^1 ≈ PEG 的 e+（一个或多个）
local space = lpeg.S(" \t")^0           -- ^0 ≈ PEG 的 e*（任意个）
local addop = lpeg.P"+" + lpeg.P"-"     -- + ≈ PEG 的 /（有序选择）
local expr = number * (space * addop * space * number)^0  -- * ≈ 序列
print(expr:match("12 + 34 - 5"))         -- 输出匹配结束位置
```

运算符对照：LPeg 的 `+`/`*`/`^n` 分别对应 PEG 的有序选择、序列、重复。整套 API 就是把文法写进运行时。

### 案例补充：packrat 的记忆表长什么样

设语法有 5 条规则、输入 100 字符。记忆表是一张 100 × 5 的二维数组，每个格子有 3 种状态：

- 未尝试：null
- 已成功：(消耗了多少字符, 解析树指针)
- 已失败：FAIL 标记

每条规则在每个位置最多被求值**一次**。这就是 O(n × 规则数) = O(n) 的来源。

## 踩过的坑

1. **有序选择的顺序很要命**：写 `'a' / 'ab'` 永远匹配不到 `'ab'`——左边的 `'a'` 先赢，输入指针前进，第二条没机会。**长的写前面**是 PEG 的口诀。

2. **左递归默认死循环**：`A <- A '+' B` 在 packrat 里会**无限递归**，因为没消耗输入就调自己。要左递归得用 Warth 2008 的扩展（"seed parsing"），或者改写成右递归 + 后处理。

3. **记忆表内存不便宜**：O(n) 听起来好，但常数很大——n × 规则数 × 每个 entry（指针 + 长度 + 标记）。10MB 文件 + 50 条规则可以吃几百 MB。很多生产实现做"部分记忆化"（只缓存热点规则）妥协。

4. **PEG ⊄ CFG，CFG ⊄ PEG**：很多人以为 PEG 是 CFG 的子集——错。PEG 能表达 `a^n b^n c^n`（CFG 不行），但 CFG 的真二义文法（如自然语言）PEG 也表达不了。两者**互不包含**。

## 适用 vs 不适用场景

**适用**：

- 程序语言 / DSL / 配置语言的语法（绝大多数都是天然有序、无二义需求）
- Markdown / JSON / YAML 这类轻量解析器（pest、LPeg 是常见选择）
- 需要"标识符避开关键字"、"贪婪 vs 非贪婪"等灵活约束
- 想直接把语法写进代码 + 同时跑（不想分 lexer/parser 两段）

**不适用**：

- 真正二义的自然语言解析（PEG 总是确定，丢不掉合理的多义解读）→ 用 GLR / Earley
- 内存极度紧张的嵌入式场景（packrat 表是 O(n) 实打实的内存）→ 用 LL(1) / LALR
- 需要左递归且不愿意改写的语法（如经典表达式文法）→ 用 LR 家族或 PEG 左递归扩展
- 已有 yacc/bison 投资且工具链稳的项目 → 别盲目迁移

## 历史小故事（可跳过）

- **2002 年**：Bryan Ford 在 MIT 写硕士论文 *Packrat Parsing: a Practical Linear-Time Algorithm with Backtracking*，发到 ICFP 2002。这是"记忆化让回溯解析变线性"的源头。
- **2004 年**：Ford 抽出背后的语法形式化，POPL 2004 发表 *Parsing Expression Grammars*。从此 PEG 和 packrat 这对概念被分开看：一个是语法层面，一个是算法层面。
- **2007 年**：Roberto Ierusalimschy（Lua 作者之一）发布 **LPeg**——独立 PEG 库（经 LuaRocks 安装，**不是** Lua 官方 standard libraries），工业界开始用 PEG 替代正则做模式匹配。
- **2008 年**：Alessandro Warth 在 OMeta 里提出 seed parsing，让 PEG 也能处理（间接）左递归。
- **2010s**：pest（Rust）、Parsimmon（JS）、parsec/megaparsec（Haskell，思想接近）等 PEG 工具链兴起；tree-sitter（C）主引擎是 GLR 风格，文法 DSL 表面有点像 PEG，不宜直接算作 PEG 实现。

## 学到什么

1. **形式化和算法可以一起设计**：PEG 不是"先有理论再找实现"，而是"为了 packrat 能跑得动，故意把语法定义成确定的"——一个互相成就的例子。
2. **有序 / 无序是工程 vs 数学的分水岭**：CFG 的"无序"对数学家漂亮，对工程师是麻烦；PEG 选了"有序"——丢了一些表达力，换来了实现简单和无二义。
3. **记忆化 = 时间换空间的极致**：packrat 的本质是把"是否匹配"这个谓词记忆化，思想和动态规划、增量计算（[[salsa-adapton]]）一脉相承。

## 延伸阅读

- 论文原文：[Ford POPL 2004](https://bford.info/pub/lang/peg.pdf)（21 页，可读性比一般 POPL 高很多）
- Ford 硕士论文：[Packrat Parsing 2002](https://bford.info/pub/lang/thesis.pdf)（120+ 页，含完整 Haskell 实现）
- Lua LPeg 文档：[lpeg.html](http://www.inf.puc-rio.br/~roberto/lpeg/)（官方 + 大量例子）
- Rust pest 教程：[pest.rs/book](https://pest.rs/book/)（最易上手的 PEG 实现）
- Warth 2008 左递归论文：[Packrat Parsers Can Support Left Recursion](https://www.vpri.org/pdf/tr2007002_packrat.pdf)

## 关联

- [[knuth-lr-1965]] —— LR 解析的源头，PEG 的"对照组"，两条路线选择不同
- [[lalr-deremer]] —— LALR(1) 是 yacc/bison 的引擎，PEG 是它的现代竞品
- [[pottier-merr]] —— LR 错误恢复的研究，PEG 错误信息也是难题
- [[salsa-adapton]] —— 同样基于"记忆化避免重算"的思想，方向是增量计算
- [[self-adjusting]] —— 记忆化 + 依赖追踪的另一支
- [[compiler-errors]] —— 解析器的错误消息怎么做得有用
- [[algol-60]] —— BNF 的诞生，CFG 工业化的起点；PEG 是它的另一种答案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
