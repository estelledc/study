---
title: DeRemer LALR(1) — 把 LR 表压到能用大小
来源: DeRemer, "Practical Translators for LR(k) Languages", MIT PhD Thesis, 1969
日期: 2026-05-30
分类: 编译器与编程语言
难度: 中级
---

## 是什么

LALR(1)（**L**ook-**A**head **LR**(1)）是 1969 年 Frank DeRemer 在 MIT 博士论文里提出的一种 **LR 解析表压缩方法**。日常类比：原版 LR(1) 表像是把每条街都画一张完整地图，DeRemer 发现 "其实街角长得一样的几张可以贴在一起，只在贴出来的角上注一句小字" ——表瞬间小一个数量级，但导航功能几乎不丢。

为什么这事重要：Knuth 1965 证明了 LR(k) 文法可以**机械生成**线性时间解析器（见 [[knuth-lr-1965]]），但有个工程死结——一份 C 这种规模的文法直接展开 LR(1) 表，状态数动辄上千、内存几 MB。1960 年代的机器**装不下也跑不动**，理论再漂亮也没人能用。

DeRemer 找到一个化简：

```
LR(1) 状态数：~6000 （C 语言文法量级）
LALR(1) 状态数：~300  （同一文法）
```

差不多 **20 倍** 的压缩，且大多数真实编程语言文法压完仍然没有冲突。这一刀，让 yacc / bison / ocamlyacc / menhir 这些工具变成可能。

## 为什么重要

不理解 LALR，下面这些事都没法解释：

- 为什么 50 年来大量工业语言前端（C、Pascal、早期 Java、SQL，以及无数 DSL）用 yacc/bison 类工具生成——**LALR(1) 是那条工具链的算法基础**（现代 Go gc、javac 等则常改手写递归下降）
- 为什么大学《编译原理》上来就讲 "项集 / lookahead / GOTO 表"——它们是 LALR 的零件
- 为什么 yacc 的 `.y` 文件里你会看到诡异的 `%left '+'`、`%right '='` 声明——那是绕开 LALR shift/reduce 冲突的工程补丁
- 为什么有些研究项目（tree-sitter、PEG）宁愿用别的算法也不碰 LALR——后面"踩过的坑"里讲

## 核心要点

LALR(1) 的关键洞察可以拆成 **三步**：

1. **先建 LR(0) DFA（不看 lookahead）**：和 LR(1) 一样把项集（item set）做闭包、转移，但**先忽略**每个项后面带的 lookahead token，只看产生式 + 圆点位置——这一份叫 "core"。

2. **合并 core 相同的状态**：原版 LR(1) 把 "core 一样但 lookahead 不同" 的状态当成两个；DeRemer 直接把它们合并成一个，**lookahead 集做并集**。这一刀就是压缩的来源。

3. **重算冲突**：合并后再检查每个状态——如果 shift/reduce 或 reduce/reduce 冲突没出现，文法就是 LALR(1)；冲突出现，就要么改文法、要么升级到 canonical LR(1) / GLR。

实际工业实现里还有一个高效算法（DeRemer-Pennello 1982）专门算 lookahead 集，但思想就是上面这三步。

## 实践案例

### 案例 1：状态数压缩可视化

文法（最小算术）：

```
E → E + T | T
T → T * F | F
F → ( E ) | id
```

- canonical LR(1) 表：~22 个状态
- LALR(1) 表：~12 个状态
- SLR(1)（更激进的简化）：~12 个状态但表达力弱

真实 C 文法压缩比上千 → 几百，省下来的不止内存——表越小，**生成器编译**和**parser 启动**都更快。

### 案例 2：yacc 的 dangling-else 冲突

经典歧义：

```
stmt → if expr then stmt
     | if expr then stmt else stmt
```

LALR(1) 表生成时会报 **shift/reduce 冲突**——读到 `else` 时不知道要 shift（绑给最近的 if）还是 reduce（绑给外层）。

yacc 实战里的处理：

```yacc
%nonassoc THEN
%nonassoc ELSE
```

或干脆默认 shift（绑最近 if，符合 C 语义）。这种 "用优先级声明压住冲突" 是 yacc/bison 用户每天都在做的事，本质上是**给 LALR 表手动打补丁**。

### 案例 3：现代继承者 menhir

OCaml 的 menhir 是 LALR(1) 的现代化实现，主要改进在错误信息——一旦 LALR 表合并了状态，原版 yacc 报错只能说"在状态 X 期待 token Y"。menhir 通过反查项集，告诉你"我以为你要写一个表达式，但你给了 `;`"。这条思路在 [[pottier-merr]] 里更进一步。

## 踩过的坑

1. **LALR(1) ⊊ LR(1)**：有些文法 LR(1) 通过，LALR(1) 因为 lookahead 合并产生 **reduce/reduce 冲突**。这种文法叫 "non-LALR but LR"，遇到时要么改文法，要么换 GLR / canonical LR。

2. **错误位置偏移**：合并状态意味着报错时 parser 可能在 "合并后的那一刻" 才发现问题，行号比 canonical LR(1) 偏几个 token。读 yacc 错误时常见 "expected `;`" 但实际错在前两行。

3. **优先级声明 ≠ 文法属性**：新人容易把 `%left '+'` 当成 "+ 是左结合"——其实那是绕冲突的命令式补丁。文法本身仍歧义，只是 yacc 帮你选了一边。换个工具可能解析结果都不同。

4. **手写 LALR 生成器极难**：lookahead 集传播算法（DeRemer-Pennello）边界情况多。不是研究项目就用现成的 bison / menhir / lalrpop，**别自己写**。

## 适用 vs 不适用场景

**适用**：

- 工业编程语言前端（C / Java / Go / Pascal / SQL）——绝大多数都是 LALR(1) 文法
- 需要**确定性、线性时间**解析的场景
- 文法稳定、不会频繁演化的领域 DSL

**不适用**：

- 文法本身有歧义（自然语言、Markdown）→ 用 GLR / Earley / PEG
- 需要**优秀错误信息**给非程序员用户 → 手写递归下降或用 [[pottier-merr]] 思路
- 文法频繁演化（IDE 里增量解析）→ tree-sitter 用 GLR 更合适
- 需要 lookahead > 1 token → 用 LR(k) 或 GLR

## 历史小故事（可跳过）

- **1965 年**：Knuth 证明 LR(k) 文法可机械生成解析器，但表大小指数爆炸，纯理论。
- **1969 年**：DeRemer MIT 博士论文给出 LALR——表压一个数量级。
- **1971 年**：DeRemer 又发表 SLR（Simple LR），更激进的简化（牺牲一点表达力换更小的表）。
- **1975 年**：Steve Johnson 在贝尔实验室基于 LALR 实现 **yacc**（Yet Another Compiler Compiler），随 Unix 一起传播。
- **1982 年**：DeRemer-Pennello 给出第一个高效 lookahead 集算法，让 LALR 表生成本身也快起来。
- **1985 年起**：GNU 社区做 **bison**（兼容 yacc），成为开源世界事实标准。

## 学到什么

1. **理论可行 ≠ 工程可用**——Knuth LR(1) 1965 就证明了能跑，1969 才有 DeRemer 让它实际能上机器
2. **状态合并是表压缩核心思想**——把 "看起来不一样但本质相同" 的状态贴到一起，是编译器、缓存、数据库索引共同用的招
3. **大多数真实文法很温和**——LALR(1) 不能覆盖所有 LR(1) 文法，但工业语言文法绝大多数都在它的能力范围内
4. **算法 → 工具 → 生态**：DeRemer 1969 → yacc 1975 → bison 1985 → 50 年主导编译器前端

## 延伸阅读

- 经典教材："Compilers: Principles, Techniques, and Tools"（龙书）第 4 章把 LR / LALR / SLR 三种讲透
- 论文 PDF：[DeRemer 1969 thesis @ MIT DSpace](https://dspace.mit.edu/handle/1721.1/13511)
- 现代实现：menhir manual + lalrpop README，看 LALR 在今天怎么用
- [[knuth-lr-1965]] —— LR 算法的奠基论文，DeRemer 是直接继承
- [[pottier-merr]] —— LR 解析器错误消息的现代解法

## 关联

- [[knuth-lr-1965]] —— LR(k) 理论奠基；DeRemer 把它从理论变工程
- [[pottier-merr]] —— 让 LR 报错可读，弥补 LALR 状态合并带来的错误定位损失
- [[algol-60]] —— BNF 文法的诞生地，是 LR / LALR 最早的"练习对象"
- [[compcert]] —— 形式化验证 C 编译器，前端用经过证明的 LALR(1) parser
- [[cakeml]] —— 端到端验证 ML 编译器，parser 同样基于 LR / LALR 思想
- [[llvm]] —— 现代编译器后端代表，前端 clang 实际手写递归下降；但围绕它的 IR 工具链 parser 多走 LALR
- [[mccarthy-lisp]] —— Lisp 用 S-表达式绕开"复杂语法解析"问题，是和 LALR 完全相反的另一条路
- [[standard-ml]] —— ML 编译器前端用 ml-yacc，直接以 LALR(1) 为基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[pottier-merr]] —— Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
- [[standard-ml]] —— Standard ML — 让编译器替你把类型补完
- [[tomita-glr]] —— Tomita GLR — 让 LR 解析器扛得住歧义文法

