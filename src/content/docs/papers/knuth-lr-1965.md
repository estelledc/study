---
title: Knuth LR(k) — 编译器自己读懂语法的算法
来源: Knuth, "On the Translation of Languages from Left to Right", Information and Control 8(6), 1965
日期: 2026-05-30
分类: 编译器与编程语言
难度: 中级
---

## 是什么

LR(k) 是一类**可以被机器线性时间、确定性识别的上下文无关文法**。日常类比：像从左往右拼乐高——每拿到一块积木先放进手里（栈），再**偷看下一块**决定：是继续拿下一块，还是把手里刚拼好的一小段收成更大的零件。整句是从零件往上归约出来的，不是先猜整句再往下拆。

LR 三个字母拆开：

- **L**：从左到右扫描输入（**L**eft-to-right）
- **R**：构造**最右推导**的逆（**R**ightmost derivation in reverse）——扫描仍从左到右，只是归约顺序对应最右推导倒着走
- **k**：决策时最多看几个前瞻 token（lookahead）

Knuth 在 1965 年证明：给一个 LR(k) 文法，可以**机械地**构造一个解析器，扫一遍输入就能判断对错并产出语法树。

这个算法是后世 yacc / bison / menhir / ocamlyacc / GCC / clang 前端的理论根。

## 为什么重要

不理解 LR，下面这些事都没法解释：

- 为什么 yacc / bison 能从一份 `.y` 语法文件**自动生成**一个 C 编译器的 parser
- 为什么 LR 解析器能在**最早**的位置报语法错误（比如缺一个 `;`，行号几乎贴脸）
- 为什么大学《编译原理》教材一半篇幅在讲"项集 / 闭包 / GOTO 表"——它们都是 LR 的零件
- 为什么 Knuth 一个 1965 年的论文，60 年后还在影响每天 `gcc hello.c` 的那一秒

## 核心要点

LR 解析器的工作机制可以拆成 **三块**：

1. **栈 + 状态机**：解析器维护一个栈，栈顶记着"当前解析到哪了"。比如读到 `1 +`，栈里存的是 `[expr, +]`，状态告诉它"我在等下一个 expr"。

2. **shift / reduce 决策**：每一步看栈顶状态 + 接下来 k 个 token，做两件事之一：
   - **shift**（移进）：把下一个 token 推上栈
   - **reduce**（归约）：把栈顶若干个符号合并成一个非终结符（如把 `1 + 2` 合成 `expr`）

3. **怎么知道该 shift 还是 reduce**：靠**项集**（item set）。每个项是一条带圆点的产生式，如 `E → E · + T` 表示"已经识别了 E，正在等 + T"。把所有可能的"当前在哪一步"打包成一个状态——这就是 LR 状态。

整个过程是机械的：从文法机械算出一张表，运行时查表就行。

## 实践案例

### 案例 1：算术表达式怎么被 LR 解析

文法：

```
E → E + T | T
T → T * F | F
F → ( E ) | num
```

输入 `1 + 2 * 3`，LR 解析过程（简化）：

| 栈 | 输入剩余 | 动作 |
|----|---------|------|
| `` | `1 + 2 * 3` | shift `1` |
| `1` | `+ 2 * 3` | reduce `F → num`，再 reduce `T → F`，再 reduce `E → T` |
| `E` | `+ 2 * 3` | shift `+` |
| `E +` | `2 * 3` | shift `2` 后 reduce 到 `T` |
| `E + T` | `* 3` | **不**reduce，因为前瞻是 `*`，优先级高 |
| `E + T *` | `3` | shift，reduce 到 `T * F`，最后 reduce 到 `E` |

注意第 5 行的关键：解析器**看了一下前瞻 `*`**，决定先不归约 `E + T → E`，否则乘法优先级就丢了。这就是"k=1 个前瞻"的意义。

### 案例 2：yacc 文件长什么样

```yacc
expr : expr '+' term   { $$ = $1 + $3; }
     | term            { $$ = $1; }
     ;
term : term '*' factor { $$ = $1 * $3; }
     | factor          { $$ = $1; }
     ;
factor : '(' expr ')'  { $$ = $2; }
       | NUMBER        { $$ = $1; }
       ;
```

`yacc` 读这个文件，对每条产生式机械计算项集 + GOTO 表，输出一个 C 文件。运行时查表就完成解析。Knuth 1965 给的就是这套表的构造方法，不过 yacc 用的是简化版（LALR(1)）。

### 案例 3：shift-reduce 冲突的真实痛点

```
if a then if b then x else y
```

这个 `else` 跟谁配？两种合法解析。LR 文法在生成表时会发现"同一格子里既能 shift 又能 reduce"——叫 **shift-reduce 冲突**。yacc 默认偏 shift（贴近最近的 if），并打一条 warning。这是每个写过 yacc 的人第一天必踩的坑。

## 踩过的坑

1. **把 LR 的 R 理解成"从右到左扫描"——错**。R 指最右推导逆向重建，扫描方向永远从左到右。混淆这个，整套教材就读反了。

2. **以为 LR(k) 比 LR(1) 强大——错**。Knuth 证明：**语言识别能力上 LR(1) 等于任何 k≥1**。增大 k 只是让你写文法时更宽松，并不能识别更多语言。

3. **把 LL 和 LR 混为一谈**。LL 是自顶向下（从根猜叶），手写递归下降就是 LL；LR 是自底向上（从叶归约到根），yacc 是 LR。两者差别巨大，能识别的文法类也不同。

4. **以为 yacc 是纯 LR(1)——错**。yacc/bison 用的是 **LALR(1)**：状态表小一个数量级，但偶尔会拒绝某些合法的 LR(1) 文法。Knuth 原始 LR(1) 因为表太大在 1960 年代被认为不实用，直到 1969 年 DeRemer 提出 SLR / LALR 才让 LR 真正进入工业。

## 适用 vs 不适用场景

**适用**：

- 编程语言 / 配置语言 / 协议格式的 parser 自动生成
- 语法相对固定、错误位置要精准的场景
- 需要严格证明"这个文法能机械解析且无歧义"

**不适用**：

- 文法本身有歧义且无法消歧（如自然语言）→ 用 GLR / Earley
- 错误恢复要"接着往下读" → 纯 LR 一旦报错就停；需配合错误产生式（参考 [[pottier-merr]]）
- 想手写 parser 看到代码就懂 → 写递归下降（LL）更直观可读
- 文法需要语义信息辅助（如 C 的 `T * x` 既可能是乘法也可能是声明）→ 纯 CFG 不够，需 lexer hack

## 历史小故事（可跳过）

- **1956 年**：Chomsky 给出上下文无关文法，奠定形式语言基础
- **1965 年**：Knuth 27 岁，在加州理工任教，发表本论文。给出 LR(k) 定义 + 等价定理 + 构造算法。当时被认为"理论漂亮但表太大不实用"
- **1969 年**：DeRemer 提出 SLR(1)，状态表大小可接受
- **1971 年**：DeRemer 又提出 LALR(1)，识别力强于 SLR、表小于 LR(1)
- **1975 年**：Stephen Johnson 在 AT&T Bell Labs 写出 yacc，用 LALR(1)。从此 Unix 工具链 + C 编译器全用上 LR 思想
- **1980 年代起**：bison 兼容 yacc，进入 GNU；2000 年后 menhir / ocamlyacc / GLR 各家变体百花齐放

## 学到什么

1. **理论 → 算法 → 工程**：1956 文法 → 1965 LR 构造 → 1969 简化 → 1975 yacc 工业落地。每一步隔近十年，单看 1965 论文像纯数学，但 60 年后日用编译器全靠它
2. **正确性 vs 实用性**：Knuth 给的是最强结果（任何确定性 CFL 都能 LR(1)），工程界用的是它的简化版；这是"理论先封顶，工程再裁剪"的经典模式
3. **机械化的力量**：从文法到解析器一次自动生成，是计算机科学少有的"完全机械化的从规约到实现"案例之一
4. **错误的早发现性**：LR 解析器有可证明的"viable prefix property"——读到错误那一刻立刻报，不会延后

## 延伸阅读

- 经典教材：龙书《Compilers: Principles, Techniques, and Tools》Aho et al. 第 4 章是最完整的 LR 讲解（有动画级图示）
- 自己写一个：[Crafting Interpreters](https://craftinginterpreters.com/) 第二部分（虽然书里写的是递归下降 + Pratt，但讲清楚了 parser 设计取舍）
- yacc 源码 + 文档：`man yacc`，30 分钟读懂工业 LALR 解析器接口
- 论文 PDF：[Knuth 1965 Information and Control 原文扫描](https://www.cs.dartmouth.edu/~mckeeman/cs48/mxcom/doc/knuth65.pdf)（35 页，密度极高）
- [[algol-60]] —— LR 最早的"练习对象"之一，BNF 文法的诞生地
- [[compcert]] —— 形式化验证的 C 编译器，前端就是经过验证的 LR parser

## 关联

- [[algol-60]] —— ALGOL 60 用 BNF 写文法，是 LR 算法最早服务的语言
- [[pottier-merr]] —— Pottier LR(1) Reachability，让 LR 解析器能给出可读的错误消息
- [[compcert]] —— 形式化验证的 C 编译器，前端 LR parser 也被 Coq 证明
- [[cakeml]] —— 端到端验证的 ML 实现，parser 同样基于 LR 思想
- [[llvm]] —— 现代编译器后端代表，前端解析器多用 LR 类算法生成
- [[mccarthy-lisp]] —— Lisp 用 S-表达式绕开了"复杂语法解析"问题；LR 是给 Algol 系语言准备的另一条路
- [[knuth-taocp]] —— 同作者集大成著作；本文是 Knuth 早年对编译器贡献的代表作
- [[standard-ml]] —— ML 编译器前端用 LR 解析；后来工具链如 ml-yacc 直接以 LR(1) 为基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[tomita-glr]] —— Tomita GLR — 让 LR 解析器扛得住歧义文法
