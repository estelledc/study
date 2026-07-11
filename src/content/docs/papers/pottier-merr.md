---
title: Pottier LR(1) Reachability — 让 LR 解析器的错误消息覆盖完整
来源: 'François Pottier, "Reachability and Error Diagnosis in LR(1) Parsers", CC 2016'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

**Pottier 2016** 解决一个具体问题：自动生成的 LR 解析器（OCaml 的 Menhir、老一辈的 yacc/bison）报错时只会说 "syntax error at line 17"。Pottier 给出一个算法，**机械地枚举所有可能报错的状态**，并给每个状态生成一句最短的错误样本输入。

日常类比：你做了一道迷宫，迷宫里有几十个死胡同。以前你只能让玩家撞到死胡同后说"走不通"。Pottier 的算法相当于**事先把每个死胡同的具体走法列出来**，让你给每个死胡同手写一句解释："这里走不通是因为前面少了个右括号"。

```ocaml
(* 旧 yacc 报错 *)
File "main.c", line 17: syntax error

(* Menhir + Pottier 思路报错 *)
File "main.c", line 17: 
  Ill-formed expression. At this point, an expression is expected.
  If this expression is complete, then a closing parenthesis is expected.
```

实现落在 OCaml 的 **Menhir** 解析器生成器里，命令是 `menhir --list-errors`。CompCert（被数学证明正确的 C 编译器）的 ISO C99 解析器靠这套机制把错误消息做到与 clang/gcc 持平。

## 为什么重要

不理解 Pottier 这套，下面这些事都没法解释：

- 为什么用 Menhir 的项目（如 CompCert）报语法错时能说"期待标识符"，而老 yacc 时代常常只能说"syntax error"
- 为什么 Menhir 的 `.messages` 文件改 grammar 后要 `--update-errors` 重新对齐——表里每条都和某个具体状态绑定
- 为什么 LR 错误消息长期被认为"难做好"——根因是 LR 自动机的"未来"既靠当前状态又靠栈，纯静态信息不够
- 为什么这个算法是"反直觉"的——LR(1) 可达性比图可达性难（不是简单 BFS），需要带着"下一个符号假设"反复迭代到稳定

## 核心要点

Pottier 的洞见可以拆成 **三步**：

1. **错误状态枚举**：先回答"哪些状态可能报错"。算法是：找所有 (s, z) 配对——状态 s 配 lookahead（下一个未读终结符）z——使得在状态 s 看到 z 时自动机查表是空格（无 action）。这需要先解决可达性。

2. **LR(1) 可达性**：给定状态 s 和终结符 z，找一句最短输入 w，使自动机读完 w 后停在 s 且下一个未读符号是 z。这不是普通图上的 BFS——转移还依赖"我假设下一个符号是什么"。Pottier 的解法：给每个状态先列出一组"从这儿出发、沿着某条产生式右侧能走的小路"（论文称 star，可想成从该路口出发的星形路网），再解一组带参数的最短路方程，直到答案不再变短。

3. **手写诊断消息表**：算法给每个错误状态吐一句最短样本输入；人类对照样本写一句解释，存进 `.messages` 文件。grammar 改了就 `--update-errors`，新增状态会被标出来要求补消息。

整个流程把 **机械生成** 和 **人写措辞** 分开——算法保覆盖完整，人类保表达准确。

## 实践案例

### 案例 1：Menhir 命令链

最小工作流（OCaml 项目里）：

```bash
# 1. 让 Menhir 列出所有错误状态及最短样本
menhir --list-errors parser.mly > parser.messages

# 2. 人工编辑 parser.messages，给每个状态写消息

# 3. 把 .messages 编译进解析器
menhir --compile-errors parser.messages parser.mly > parser_messages.ml

# 4. grammar 改了之后重新对齐
menhir --update-errors parser.messages parser.mly > parser.messages.new
```

`.messages` 文件长这样：

```
program: INT EOF
##
## Ends with state 17.
##
## program -> expr . EOF
##
At this point, an arithmetic expression is complete; expected EOF.
```

每段 `## Ends with state N` 对应自动机一个错误状态，下面的纯文本就是人工写的诊断。

### 案例 2：CompCert 实证

CompCert 的 ISO C99 grammar 有几百个错误状态。Pottier 团队用算法列出后，**反复迭代 grammar**——发现某些状态写不出准确消息（因为只看当前状态说不清 future），就改 grammar：

```ocaml
(* 加 %on_error_reduce 让某些产生式在错误时优先 reduce
   把"模糊状态"压缩成"清晰状态" *)
%on_error_reduce expression_statement
```

**逐部分解释**：

- 算法先列出"会报错的状态 + 最短坏输入"
- 人工发现某状态消息只能写成"要么 `)` 要么 `]`"这种过宽说法时，就用 `%on_error_reduce` 提前归约，让错误更晚、更具体地被检出
- 最终 CompCert 报错从 "syntax error" 变成 "Ill-formed declaration. Expected an identifier."——论文以此反驳"LR 做不好错误消息"的成见

### 案例 3：你能用上的场景

只要项目用 OCaml + Menhir，几乎免费就能拿到这能力：

```ocaml
(* parser.mly 里照常写 grammar *)
%token INT PLUS LPAREN RPAREN EOF
%start <int> main
%%
main: e = expr EOF { e }
expr: i = INT { i } | LPAREN e = expr RPAREN { e } | a = expr PLUS b = expr { a + b }
```

**落地三步**：跑 `menhir --list-errors` 得到每个错误状态的最短样本 → 对着样本在 `.messages` 里写人话 → `menhir --compile-errors` 编进解析器。grammar 以后再改，用 `--update-errors` 对齐即可。

## 踩过的坑

1. **错误消息会"过近似"valid futures**：某些 LR(1) 状态没法只看自己就说清"接下来允许什么"——可能会说成"要么 `)` 要么 `]`"。Pottier 用 `%on_error_reduce` 声明 + 参数化产生式两种 grammar 重写手段化解，但需要人工判断哪些 reduce 该提前。

2. **也会"欠近似"**——spurious reductions 让某些 future 看起来不被允许其实允许。论文承认这个问题难绕过，建议用 "如果这个表达式完整了，那么..." 这种条件句式诚实表达不全。

3. **算法最坏代价很高**——论文未宣称简单多项式保证；大 grammar 上事实集合可膨胀到千万级。CompCert 规模常能在几十秒级跑完，但论文里更难的 grammar（如 PHP）可到数十分钟、数十 GB，不能当"随便塞进任意超大语法"的万能按钮。

4. **维护成本不低**——每改一次 grammar 就要 `--update-errors` 对齐 `.messages`，新增的错误状态会被标 "NEW"，需要人工补消息；删除的状态会被标 "OBSOLETE"。CompCert 团队为减少这种成本，反复改 grammar 让错误状态总数下降。

## 适用 vs 不适用场景

**适用**：
- LR(1) 解析器（yacc/bison/Menhir 生成，或手写的 LR 表）想要"每状态一条消息"
- 工业级 grammar（语言标准已固定，但错误消息质量要持续打磨）
- OCaml 生态——Menhir 直接装好就能用，是事实上唯一完整实现
- 教学场景——给学生语言写解析器时，出好错误消息能大幅降低学习门槛

**不适用**：
- LL 解析器（递归下降、ANTLR LL(*)）——它们的错误信息本来就好做（栈是显式的），不需要这套
- GLR / 通用解析器（Tomita 那种）——多个解析栈并行，错误状态语义不同
- 完全动态的解释器/REPL——错误更靠运行时上下文，不只靠语法表
- 想做"错误恢复 + 修复建议"——本论文只管"消息质量"，恢复要看 2018 Diekmann-Tratt "Don't Panic"

## 历史小故事（可跳过）

- **1965 年**：Knuth 发明 LR(k) 解析理论，理论上漂亮但表太大。同期错误处理只用 "panic mode"——遇到错误就丢符号直到能继续，根本不解释错误。
- **2002-2003 年前后**：Clinton Jeffery 的 merr 把"每个错误状态一条手写消息"做成工具链——但 merr 看不到完整自动机，无法证明覆盖，只能靠专家与用户报告慢慢"生长"集合。
- **2016 年**：Pottier 这篇 CC 论文把 Jeffery 思路补完——给出 LR(1) 可达性算法，机械保证"消息表覆盖所有错误状态"。同时实现进 Menhir，给 OCaml 生态一条可维护的错误消息工作流。
- **2018 年**：Diekmann/Tratt 在 "Don't Panic! Better, Fewer, Syntax Errors for LR Parsers" 里把错误恢复也补完——能在错误后继续解析并给修复建议。引用 Pottier 这篇做基础。

之后 OCaml/Coq/Why3 等所有 Menhir 用户的错误消息都是 Pottier 这套机制的徒孙。

## 学到什么

1. **"覆盖完整"是工程问题，不只是测试问题**——Pottier 把"怎么知道我没漏"变成可机械验证的算法，这是质量保证从手工到自动的关键一步
2. **静态分析 + 人工措辞分工**：算法给样本和状态，人写自然语言——把机器擅长的（穷举）和人擅长的（表达）切干净，是好工具的范式
3. **图可达性 vs 自动机可达性**：当转移依赖 lookahead 时，BFS 不够，必须做带参数的不动点迭代——理论与实践的微妙边界
4. **改 grammar 比改算法更便宜**：当某个状态写不出好消息，先想"能否改 grammar 让这种状态消失"——Pottier 给 `%on_error_reduce` 就是这个哲学

## 延伸阅读

- 论文 PDF：[Pottier 2016 CC](http://cambium.inria.fr/~fpottier/publis/fpottier-reachability-cc2016.pdf)（11 页，可读）
- Menhir 手册的错误处理章节：[New error handling API](http://cambium.inria.fr/~fpottier/menhir/manual.html)（实操指南）
- 后续工作 "Don't Panic"：[Diekmann-Tratt 2018](https://arxiv.org/abs/1804.07133)（错误恢复，引用 Pottier）
- "Practical LR Parser Generation"：[Davis 2022](https://arxiv.org/abs/2209.08383)（更新的 LR 实践综述）
- [[helium-type-errors]] —— 类型错误质量提升的姊妹工作（Haskell 教学）
- [[compiler-errors]] —— 编译器错误信息综述

## 关联

- [[compiler-errors]] —— 让编译报错有用，本论文是 LR 错误消息这条线的代表作
- [[helium-type-errors]] —— Helium 把"类型错误说人话"做到 ML，思路相通：覆盖+措辞分工
- [[compcert]] —— CompCert 是论文实证案例，错误消息质量也靠这套
- [[hindley-milner]] —— 类型错误也面临"纯静态信息可能不够"的同种困境
- [[bidirectional-typing]] —— 双向类型检查通过把信息传递明确化让错误消息变好，与 Pottier 思路异曲同工
- [[local-type-inference]] —— 类似地用"局部能看到的信息"换错误质量
- [[kahn-natural-semantics]] —— 给程序求值定义清晰规则，能让"错误状态"的语义有迹可循

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[earley-parser]] —— Earley Parser — 一个表能解析任何 CFG 的通用解析器
- [[knuth-lr-1965]] —— Knuth LR(k) — 编译器自己读懂语法的算法
- [[lalr-deremer]] —— DeRemer LALR(1) — 把 LR 表压到能用大小
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[tomita-glr]] —— Tomita GLR — 让 LR 解析器扛得住歧义文法
