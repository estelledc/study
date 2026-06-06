---
title: Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
来源: 'Neil D. Jones, Carsten K. Gomard, Peter Sestoft, "Partial Evaluation and Automatic Program Generation", Prentice Hall, 1993'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 高级
provenance: pipeline-v3
---

## 是什么

Partial evaluation（**部分求值**，常缩写 PE）是把一个程序加上"输入有一部分已知"的先验，提前把这部分能算的都算掉，输出一个更小、更快、只接受剩余输入的新程序。日常类比：你有一份"通用蛋糕食谱"，今天确定要做巧克力口味，于是把"巧克力分支"的步骤抄出来，去掉"如果选香草则……"的所有判断，得到一份"只做巧克力的精简食谱"。原食谱能做所有口味，新食谱只做一种但更短更快。

数学上 PE 给出一个 `mix` 程序：`mix(p, s) = p_s`，使得对任意剩余输入 `d` 都有 `p_s(d) = p(s, d)`。`p` 是原程序，`s` 是已知的静态输入（static），`d` 是运行时才知道的动态输入（dynamic），`p_s` 叫**残余程序（residual program）**。这条等式是整本书的"灵魂等式"——后面所有技术（BTA / specialize / Futamura projections）都是为了让它在工程上可实现。

这本 528 页的书是 Jones、Gomard、Sestoft 三位丹麦哥本哈根大学（DIKU）研究者在 1993 年写的，被视为 PE 领域的"龙书 equivalent"。系统讲了 binding-time 分析、Futamura projections、self-applicable mix 等核心机制。

## 为什么重要

不理解 PE，下面这些事都没法解释：

- 为什么 GraalVM/Truffle 文档反复说"我们的 JIT 是 partial evaluator"——它确实是，直接来自这本书的 mix 模型
- 为什么 PyPy 一个用 Python 写的 Python 解释器比 CPython 快 5 倍——meta-tracing JIT 本质就是 PE 思路
- 为什么 Wadler 的 deforestation、Stream Fusion、Haskell `RULES` pragma 看起来像不同优化但底层相通——都能视作 PE 特例
- 为什么 TensorFlow XLA / PyTorch dynamo 把"trace 后特化算子图"当核心 pipeline——本质 PE
- 为什么"写一个解释器就免费得到一个编译器"这句话不是玩笑——Futamura 第一射影就是这个

## 核心要点

PE 的精神可以拆成 **四步**：

1. **binding-time 分析（BTA）**：扫一遍程序，把每个变量/表达式标 `static`（静态输入能决定的）或 `dynamic`（要等运行时）。类比：剧本里把"已知是巧克力"的台词标黑色，把"等观众投票才知道"的台词标红色。
2. **specialize**：对 static 部分立即求值，对 dynamic 部分生成代码。类比：黑色台词直接念出来变成新剧本里的固定文本，红色台词原封不动留着。
3. **polyvariant specialization**：同一函数被不同 static 输入调用时生成多份特化版本，函数名后挂 static 值的指纹。
4. **generalization**：special 化太狠会代码爆炸甚至不停机，必要时把某些 static 值"降级"成 dynamic，牺牲优化换停机和体积。

技术核心是 **离线 PE（offline PE）**：先做 BTA 再做 specialize。书里花大篇幅论证 offline 比 online 工程上更可控——online 边特化边判断 static/dynamic 看起来更聪明，但调试和停机性差太多。

self-applicable mix 是这本书的高级议题：mix 自己也是 Lisp 程序，所以理论上能 `mix(mix, p)` 把 mix 自己特化。这是 Futamura 第二、第三射影的前提。

三个 Futamura 射影分别给出：第一射影 `mix(interp, source) = compiled` 把解释器特化成编译产物；第二射影 `mix(mix, interp) = compiler` 自动生成编译器；第三射影 `mix(mix, mix) = cogen` 生成"编译器生成器"——你输入解释器 cogen 直接吐出对应的编译器。三层 meta，每升一层抽象一次。第三射影在 1985 年 DIKU 团队首次工程实现，是 PE 领域的标志性成就。

## 实践案例

### 案例 1：power 函数（最经典 PE 例子）

```scheme
(define (power n x)
  (if (= n 0) 1
      (* x (power (- n 1) x))))

;; static n=5, dynamic x
;; PE 后：
(define (power_5 x)
  (* x (* x (* x (* x (* x 1))))))
```

`n` 已知是 5，循环就被展开成直线代码；`x` 还是 dynamic 所以保留。原 power 每次调用要做 6 次比较 + 5 次递归 + 5 次乘法；power_5 只剩 5 次乘法，没有递归没有比较。这就是 PE 的"立竿见影"效果。

### 案例 2：Futamura 第一射影

```
mix(interp, source) = compiled_program
```

`interp` 是某语言的解释器（比如 Scheme 写的 Lua interpreter），`source` 是用户写的 Lua 代码。把 `interp` 当 static 的程序、`source` 当 static 的输入做 PE，输出的 `compiled_program` 接收剩余 dynamic 输入直接跑——这就是把 Lua 编译成了 Scheme 代码。**写一个解释器，PE 一下就免费得到编译器**，这是 Futamura 1971 年提出的洞见。

### 案例 3：Truffle/GraalVM 的现代复活

```java
@Specialization
int doInt(int left, int right) {
    return left + right;
}
```

Truffle AST 节点用 `@Specialization` 标注后，Graal 编译器把"AST 节点 + 当前 type profile"当 static 输入做 PE，输出 native 机器码。这是 Futamura 1 在 JVM 上的工程版，2014 年起被 Oracle 用在 GraalJS（JavaScript）、TruffleRuby、GraalPython 上。三种动态语言用同一套 PE 框架编译，性能逼近 V8。

### 案例 4：正则表达式 NFA → DFA 特化

通用正则匹配器 `match(pattern, input)` 接收 pattern + input 两个输入。如果 pattern 编译期就已知（很多场景如此），把 pattern 当 static 做 PE，输出的 `match_pattern(input)` 等价于把 NFA 模拟过程展开成 pattern 专用的 DFA-style 直线代码。这就是为什么 Rust 的 `regex` crate 编译期能从 pattern 字符串生成专用状态机——背后是 PE 思路。

## 踩过的坑

1. **BTA 不准 → 残余程序代码爆炸或根本没特化效果**——整本书最难的就是把 BTA 调到准。BTA 太保守（什么都标 dynamic）等于没做 PE；BTA 太激进（把不该特化的标 static）会让 special 化时复制太多代码或不停机。

2. **polyvariant specialization 不停机**——递归函数每次 static 参数不同就生成新版本，static 参数空间无穷就停不下来。书里第 8 章专门讲 generalization 启发式：检测到 static 值在循环中单调变化时强制升 dynamic。

3. **self-application 数学上能跑但工程上极难调试**——`mix(mix, p)` 一旦中间结果有 bug，错误信息是"残余程序的残余版本错了"，三层 meta 嵌套谁也看不懂。书里坦言 self-applicable mix 实现工作量是单层 PE 的 5-10 倍。

4. **解释器写得不'PE-friendly' → Futamura 1 出来的'编译产物'比解释器还慢**——典型陷阱：环境查找用 list 而非 record，PE 时 list 索引是 dynamic 没法折叠。书里建议解释器先做 binding-time 友好重构再 PE。

5. **online vs offline 之争**——online PE（边走边判断 static/dynamic）看起来灵活，但停机性差、调试难。书里花整章论证 offline + 离线 BTA 才是工程正道。后来 supercompilation（Turchin）证明 online 也能行，但工程难度高一个量级。

6. **let-insertion 与 code duplication 的折中**——specialize 时一个 dynamic 表达式被多次用到，是要复制粘贴还是 let-bind 一次？复制粘贴可能让后续优化看到更多 static 上下文，但代码会爆炸；let-bind 体积小但放弃了进一步特化机会。书里 7.4 节专门讨论这个折中，没有银弹。

## 适用 vs 不适用场景

**适用**：

- 解释器特化成编译器——Truffle / PyPy / TruffleRuby / GraalJS 全靠这条路线
- 通用算法的"参数已知"特化——正则匹配器（pattern 已知）、ray tracer（场景已知）、神经网络推理（权重已知）
- 数据库查询计划编译——把 SQL 当 static 输入特化通用执行引擎，是 LegoBase / Truffle 风格 query compiler 的思路
- DSL 实现的成本压缩——写解释器比写编译器便宜一个量级，PE 把这个差距抹平

**不适用**：

- 高度数据依赖的程序——大部分变量都 dynamic，BTA 没什么可标的
- 需要严格内存预算的嵌入式——polyvariant specialization 容易代码膨胀几十倍
- 程序员希望对编译产物精确控制的场景——PE 输出的代码人类不易读，调试体验差
- 高级控制流（continuation / coroutine）特别多的程序——书里第 11 章承认这是 PE 的硬骨头，BTA 在 CPS 转换后特别难
- 程序行为强依赖外部副作用（IO / 网络 / 数据库）——副作用永远是 dynamic，PE 没有发挥空间

## 历史小故事（可跳过）

- **1971**：Futamura 在日本发表 "Partial Computation of Programs"，提出三个射影，但当时几乎无人理解
- **1976**：Beckman 等在 Lisp 上实现首个可用 mix，但 self-applicable 还做不到
- **1985**：Jones、Sestoft 等在哥本哈根大学 DIKU 做出第一个 self-applicable mix（mix2），证明 Futamura 2 工程上可行
- **1989**：类似工作在 Scheme（Similix）、Prolog（Logimix）、C 子集上铺开
- **1993**：本书出版，528 页，是 PE 领域的奠基教材
- **1996-2000**：Glasgow 团队 Wadler 推 deforestation，把 PE 思路带进 Haskell 编译器
- **2007 起**：PyPy 用 RPython 写解释器再做 meta-tracing JIT，是 Futamura 1 的工程胜利
- **2014 起**：Oracle Würthinger、Wimmer 等把 PE 搬进 JVM，催生 Truffle/GraalVM
- **2017 起**：JAX、PyTorch fx、torch.compile 在 Python 上做类似 PE 的 trace + specialize
- **2020 起**：TensorFlow XLA、PyTorch dynamo、TVM 在 ML 编译器栈复活 PE 思路，trace 后特化算子图

PE 的工程价值在 2010 年代之后才被业界广泛接受。2000 年之前 PE 一直被视为"理论上漂亮但工程上没用"，直到 PyPy 和 Truffle 用 PE 做出比手写编译器更快的 JIT，整个领域才翻身。这本书在 1993 年成书时，作者们大概没想到 30 年后他们的核心洞见会成为动态语言性能竞赛的底层武器。

Sestoft 后来还写过一本 ML 的实现教材，把 PE 思路贯彻到底。Jones 退休前一直在 DIKU 做编程语言理论，是 Cousot 抽象解释学派在北欧的主要传承者。Gomard 这条线索后来分叉去做指针分析（不是 Lars Andersen，注意不要混），DIKU 这个团队在 1990 年代是欧洲程序变换领域最活跃的圈子。

## 学到什么

1. **解释器和编译器的边界是模糊的**——你写解释器，PE 一下就是编译器；这本书最深刻的洞见是揭示语言实现的"成本结构"可以被 PE 重塑
2. **静态分析 + 代码生成 = PE**——BTA 是静态分析、specialize 是代码生成，两步加起来就是一个 mini compiler；理解 PE 等于理解了"编译器自动化"的精髓
3. **self-application 是程序变换的最高境界**——`mix(mix, mix)` 听起来玄但成立；这是 reflection、metaprogramming、staging 这一族技术的源头
4. **理论与工程的时差可以是 30 年**——Futamura 1971 提出，Truffle 2014 工程化，时差 43 年；不要因为某项技术暂时没工程价值就否定它
5. **Binding-time 这个抽象比 PE 本身更通用**——MetaOCaml 的 staging、Scala LMS、TensorFlow 的 graph mode vs eager mode，都在用"什么时候算"这个 binding-time 维度组织代码
6. **不要被"Futamura 三个射影"的玄学外壳吓住**——核心洞见就一句话：mix 自己也是程序，所以可以 mix 自己；理解了这点，第二、第三射影只是把这个事实推到极致

## 延伸阅读

- 原书 PDF：[Jones, Gomard, Sestoft 1993 — Partial Evaluation and Automatic Program Generation](https://www.itu.dk/people/sestoft/pebook/jonesgomardsestoft-a4.pdf)（528 页，密度高，前 6 章入门）
- Futamura 原始论文：[Futamura 1971 — Partial Evaluation of Computation Process](https://link.springer.com/article/10.1023/A:1010095604496)（重印版有英文）
- 工程实现：[Truffle: One VM to Rule Them All](https://chrisseaton.com/truffleruby/aksum-fopara/aksum-fopara.pdf)（Würthinger 2017，PE JIT 的工程指南）
- 现代 staging：[Lightweight Modular Staging (LMS)](https://scala-lms.github.io/)（Rompf & Odersky，把 staging 做进 Scala 类型系统）
- [[peyton-jones-stg]] —— Haskell STG 机器，PE-friendly IR 的代表
- [[cousot-abstract-interpretation]] —— Abstract interpretation 是 BTA 的理论框架

## 关联

- [[peyton-jones-stg]] —— STG 是为了让 Haskell 程序更适合做 PE 风格优化（fusion、deforestation）而设计的中间表示
- [[cousot-abstract-interpretation]] —— BTA 本质是一种二值（static/dynamic）的抽象解释，跟 Cousot 的 lattice 框架同源
- [[hindley-milner]] —— BTA 的类型系统化版本（binding-time 推断）跟 HM 推断方法论一致，都是约束求解
- [[mycroft-strictness]] —— Strictness 分析跟 BTA 是同时代同方法论的双胞胎，都在抽象解释框架下做静态分析
- [[hughes-fp-matters]] —— Hughes 主张的"why FP matters"里的 fusion / deforestation 是 PE 的特例
- [[call-by-need-1995]] —— call-by-need 求值跟 PE 的"static 部分立即求值"思路相通，都是把"算什么"和"什么时候算"解耦
- [[steensgaard-pointer]] —— Steensgaard 指针分析跟 BTA 同属抽象解释框架下的高效近似分析

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hughes-fp-matters]] —— Why FP Matters — 函数式真正赢在能拆能粘
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[peyton-jones-stg]] —— Peyton Jones STG — 让 Haskell 的 lazy 在普通 CPU 上跑得快
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去

