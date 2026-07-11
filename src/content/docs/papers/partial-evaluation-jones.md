---
title: Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
来源: 'Neil D. Jones, Carsten K. Gomard, Peter Sestoft, "Partial Evaluation and Automatic Program Generation", Prentice Hall, 1993'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

Partial evaluation（**部分求值**，常缩写 PE）是把一个程序加上"输入有一部分已知"的先验，提前把这部分能算的都算掉，输出一个更小、更快、只接受剩余输入的新程序。日常类比：你有一份"通用蛋糕食谱"，今天确定要做巧克力口味，于是把"巧克力分支"的步骤抄出来，去掉"如果选香草则……"的所有判断，得到一份"只做巧克力的精简食谱"。原食谱能做所有口味，新食谱只做一种但更短更快。

数学上 PE 给出一个 `mix` 程序：`mix(p, s) = p_s`，使得对任意剩余输入 `d` 都有 `p_s(d) = p(s, d)`。`p` 是原程序，`s` 是已知的静态输入（static），`d` 是运行时才知道的动态输入（dynamic），`p_s` 叫**残余程序（residual program）**。这条等式是整本书的"灵魂等式"——后面所有技术（BTA / specialize / Futamura projections）都是为了让它在工程上可实现。

这本 xii+415 页的书是 Jones、Gomard、Sestoft 三位丹麦哥本哈根大学（DIKU）研究者在 1993 年写的（另有 Andersen、Mogensen 执笔章节），被视为 PE 领域的奠基教材。系统讲了 binding-time 分析、Futamura projections、self-applicable mix 等核心机制。

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

;; static n=5, dynamic x → PE 后：
(define (power_5 x)
  (* x (* x (* x (* x (* x 1))))))
```

逐步看：`n=5` 是 static，所以 `(= n 0)`、`(- n 1)` 在特化时就能算完，递归被展开成直线乘法；`x` 是 dynamic，只能原样留下。原 `power` 每次要比较 + 递归 + 乘法；`power_5` 只剩 5 次乘法——这就是 PE 的立竿见影。

### 案例 2：Futamura 第一射影（三步对照）

1. 手头有 Scheme 写的 Lua 解释器 `interp(source, input)`，以及一段已知的 Lua 源码 `source`
2. 跑 `mix(interp, source)`：把解释器当程序、源码当 static 输入做 PE
3. 得到残余程序 `compiled(input)`——它只收运行时输入，语义等于 `interp(source, input)`，但已不含"解释循环"

一句话：**写解释器，PE 一下就得到编译产物**（Futamura 1971）。正则 `match(pattern, input)` 在 pattern 已知时特化成专用匹配器，是同一套路的日常版。

### 案例 3：Truffle/GraalVM 的现代复活

Truffle 给 AST 节点标上特化版本（例如"两个 int 就走 int 加法"）。Graal 把"当前节点 + 已观察到的类型画像"当 static 输入做 PE，吐出 native 机器码——Futamura 1 在 JVM 上的工程版。2014 年起同一套框架服务 GraalJS、TruffleRuby、GraalPython。
## 踩过的坑

1. **BTA 不准 → 残余程序代码爆炸或根本没特化效果**——整本书最难的就是把 BTA 调到准。BTA 太保守（什么都标 dynamic）等于没做 PE；BTA 太激进（把不该特化的标 static）会让 special 化时复制太多代码或不停机。

2. **polyvariant specialization 不停机**——递归函数每次 static 参数不同就生成新版本，参数空间无穷就停不下来。书里第 4 章引入 generalization，第 14 章专讲停机：检测到 static 值在循环中单调变化时强制升 dynamic。

3. **self-application 数学上能跑但工程上极难调试**——`mix(mix, p)` 一旦中间有 bug，错误信息是"残余程序的残余版本错了"。书里坦言 self-applicable mix 工作量是单层 PE 的数倍；第 7.4 节给了可复用的 self-application 配方。

4. **解释器不 PE-friendly → 编译产物比解释器还慢**——环境用 list 查找时索引常是 dynamic，折叠不了。应先做 binding-time 友好重构再 PE。

5. **let-insertion 与代码爆炸的折中**——dynamic 表达式被多次用到时，复制能保留更多特化机会但体积膨胀，`let` 绑定一次更稳。书里第 5 章讨论用 let-insertion 把"防复制"和"有限展开"拆开处理。
## 适用 vs 不适用场景

**适用**（静态参数占比高时最值）：

- 解释器特化成编译器——Truffle / PyPy / TruffleRuby / GraalJS
- 通用算法的"参数已知"特化——正则（pattern 已知）、ray tracer（场景已知）、推理（权重已知）
- 数据库查询计划编译——SQL 当 static，特化通用执行引擎（LegoBase / Truffle 风格）
- DSL：写解释器便宜一个量级，PE 把差距抹平

**不适用**：

- 静态参数占比低、几乎全是数据依赖——BTA 标不出多少 static，特化白做
- 需要严格内存预算的嵌入式——polyvariant specialization 容易代码膨胀几十倍
- 希望精确手控编译产物——残余代码人类不易读，调试体验差
- 高级控制流（continuation / coroutine）很多——书里 12.3 节用 CPS 做 binding-time 改进，但 BTA 仍很难
- 强依赖 IO / 网络 / 数据库副作用——副作用永远 dynamic，PE 空间小

## 历史小故事（可跳过）

- **1971**：Futamura 在日本发表 "Partial Computation of Programs"，提出三个射影，但当时几乎无人理解
- **1976**：Beckman 等在 Lisp 上实现首个可用 mix，但 self-applicable 还做不到
- **1985**：Jones、Sestoft 等在哥本哈根大学 DIKU 做出第一个 self-applicable mix（mix2），证明 Futamura 2 工程上可行
- **1989**：类似工作在 Scheme（Similix）、Prolog（Logimix）、C 子集上铺开
- **1993**：本书出版（xii+415 页），是 PE 领域的奠基教材
- **1990 前后**：Wadler 等推 deforestation，把 PE 思路带进 Haskell 编译器
- **2007 起**：PyPy 用 RPython 写解释器再做 meta-tracing JIT，是 Futamura 1 的工程胜利
- **2014 起**：Würthinger、Wimmer 等把 PE 搬进 JVM，催生 Truffle/GraalVM
- **2017 起**：JAX、torch.compile、XLA、TVM 等在 ML 栈用 trace + specialize 复活同类思路

PE 在 2000 年前常被视为"理论漂亮、工程没用"，直到 PyPy / Truffle 用 PE 思路做出强 JIT 才翻身。Sestoft 后来写过 ML 实现教材；Jones 长期在 DIKU 做 PE 与程序分析（书中第 15 章专讲抽象解释，与 Cousot 框架相通）；C 语言 PE / 指针相关章节由 Lars Ole Andersen 执笔（C-Mix），勿与 Gomard 混淆——Gomard 此后主要转向产业界。

## 学到什么

1. **解释器和编译器的边界是模糊的**——写解释器，PE 一下就是编译产物；语言实现的成本结构可以被 PE 重塑
2. **静态分析 + 代码生成 = PE**——BTA 分析、specialize 生成代码，合起来就是迷你编译器自动化
3. **self-application 成立且有用**——`mix(mix, mix)` 听起来玄，却是 staging / metaprogramming 一族的源头；核心就一句：mix 自己也是程序
4. **Binding-time 比 PE 招牌更通用**——MetaOCaml staging、Scala LMS、训练图 vs eager，都在管"什么时候算"；理论到 Truffle 级工程可隔几十年

## 延伸阅读

- 原书 PDF：[Jones, Gomard, Sestoft 1993 — Partial Evaluation and Automatic Program Generation](https://www.itu.dk/people/sestoft/pebook/jonesgomardsestoft-a4.pdf)（xii+415 页，前 6 章入门）
- Futamura 原始论文：[Futamura 1971 — Partial Evaluation of Computation Process](https://link.springer.com/article/10.1023/A:1010095604496)（重印版有英文）
- 工程实现：[Truffle: One VM to Rule Them All](https://chrisseaton.com/truffleruby/aksum-fopara/aksum-fopara.pdf)（Würthinger 等，PE JIT 工程指南）
- 现代 staging：[Lightweight Modular Staging (LMS)](https://scala-lms.github.io/)（Rompf & Odersky）
- [[peyton-jones-stg]] —— Haskell STG，PE-friendly IR 代表
- [[cousot-abstract-interpretation]] —— 抽象解释是 BTA 的理论近亲

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

- [[papers/dspy]] —— DSPy — 把 prompt 写成签名，让编译器替你调
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[immix-mark-region]] —— Immix — 把"扫"和"搬"两种垃圾回收揉成一个
- [[metaml-multi-stage]] —— MetaML — 让你显式地写"先生成代码、再跑代码"
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[scala-macros]] —— Scala Macros — 让 Scala 在编译期把方法调用替换成任意代码
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[template-haskell]] —— Template Haskell — 让 Haskell 在编译期把代码当数据玩
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
