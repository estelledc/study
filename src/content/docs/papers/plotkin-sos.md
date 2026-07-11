---
title: Plotkin SOS — 用规则讲清楚程序"走一步"是什么
来源: 'Gordon D. Plotkin, "A Structural Approach to Operational Semantics", DAIMI FN-19, Aarhus University 1981 (JLAP 2004)'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

SOS（**Structural Operational Semantics**，结构化操作语义）是一套**用一组形如"前提 → 结论"的规则、按程序语法结构逐项写出"程序走一步"是什么样**的方法。日常类比：像菜谱告诉你"切完葱再下锅"，每一步只描述当下做什么、做完变成什么状态——不一次说完整道菜，只说每一刀。

你写：

```
x := 1; y := x + 2
```

SOS 不去算最终值，而是写下规则："如果第一个语句已经能走一步变成 skip 和新状态 s'，那整段也能走一步，剩下 y := x + 2 在 s' 上继续。"

这套"按语法每一种构造写一条规则"的风格，是 Standard ML 1990 年定义、JavaScript 规范、WebAssembly 规范的语义层骨架。

## 为什么重要

不理解 SOS，下面这些事都没法解释：

- 为什么编程语言"标准"是几百页 PDF 而不是一份参考实现——SOS 把行为写成规则，让不同实现都能对得上
- 为什么 Coq / Isabelle 能证明"我这个编译器优化不会改变程序行为"——证明工具天然吃 SOS 这种归纳规则
- 为什么 WebAssembly 规范看起来像数学论文而不是 C 代码——它正文几十页全是 SOS 风格规则
- 为什么并发语义那么难——朴素 SOS 加并发会爆炸，需要扩展

## 核心要点

SOS 的写法可以拆成 **三件事**：

1. **一步关系**：定义一个二元关系 `→`，意思是"程序 P 在状态 s 走一步变成 P' 和 s'"。类比：象棋里不研究终局，只研究"这一步从这格走到那格"。

2. **按语法结构写规则**：每条规则形如"上面是前提，横线下面是结论"。比如算术加法的关键规则：如果 e1 能走一步变成 e1'，那 e1 + e2 就能走一步变成 e1' + e2。规则**只看子表达式的一步**，不调用全局解释器。

3. **结构归纳证明性质**：因为每条规则按语法构造写，证明"程序不会走错"时只要逐条规则验证。这一步让 SOS 和定理证明器（Coq / Isabelle）天然契合。

三件事加起来，给一门语言写 SOS = 给每种语法构造（赋值、while、调用…）写一组规则。

## 实践案例

### 案例 1：算术表达式的"一步求值"

最经典的 SOS 规则，加法的"先算左边"：

```
        e1 → e1'
  ─────────────────────
   e1 + e2  →  e1' + e2
```

**逐部分解释**：

- 横线上面是**前提**："如果 e1 能走一步变成 e1'"
- 横线下面是**结论**："那 e1 + e2 能走一步变成 e1' + e2"
- 这条规则告诉你"加号左边先算"——但**没规定**怎么算，那是另一条规则的事
- 配上常量规则 `n1 + n2 → n1+n2`（两边都是数才相加），整套加法语义就完整了

### 案例 2：while 循环的"一步展开"

```
   while b do c   →   if b then (c; while b do c) else skip
```

**逐部分解释**：

- 这条规则没有前提（横线上面空），是直接改写
- 把"while"展开成"if + 顺序 + 再来一次 while"——意思是 while 等价于"判断一次，跑一次 body，再判断一次"
- 这种"每次走一步就展开一次"的风格，避免了"循环"这个概念本身——只剩 if 和顺序
- 这条规则是教材必考，背下来对理解递归和循环互译很有用

### 案例 3：把规则翻成 Python 解释器骨架

```python
def step(prog, state):
    # 规则：常量加常量 -> 求和
    if prog == ("+", n1, n2) and isinstance(n1, int) and isinstance(n2, int):
        return (n1 + n2, state)
    # 规则：左边先走一步
    if prog[0] == "+":
        e1_new, state2 = step(prog[1], state)
        return (("+", e1_new, prog[2]), state2)
    # 规则：while 展开
    if prog[0] == "while":
        _, b, c = prog
        return (("if", b, ("seq", c, prog), "skip"), state)
    ...
```

**逐部分解释**：

- 每个 `if` 分支对应一条 SOS 规则
- `step` 一次只走一小步，主循环反复调用 `step` 直到走不动
- 这就证明 SOS 不只是理论玩具——它能直接指导写解释器

## 踩过的坑

1. **small-step 和 big-step 写混**：SOS 默认是 small-step（一次走一步），有的教材把"整个程序求最终值"的 big-step 也叫 SOS，规则形状不一样，证明 type soundness 时混用会卡半天。

2. **忘了带状态/环境**：写规则只盯表达式不盯 store，碰到赋值 `x := e` 就漏掉副作用——状态 s 里 x 没更新，整套语义就错了。规则得写成 `(prog, s) → (prog', s')`。

3. **直接给并发加规则**：朴素 SOS 处理并发会爆炸（每种 interleaving 一条规则），需要切到 labelled transition 或 reduction context 等扩展，没意识到这点会写出"少 case"的并发语义。

4. **当成解释器跑**：SOS 是规范不是实现。规则可以非确定（多条都能匹配同一个程序），不能直接当解释器，需要再加"求值策略"（如"总选最左"）才能确定下一步走哪条。

## 适用 vs 不适用场景

**适用**：

- 给新语言写**正式规范**——SML、JS、WebAssembly 都用 SOS
- 在 Coq / Isabelle 里**机械化证明**编译器优化、类型安全
- 教学：把"循环""赋值"这种隐含概念拆成规则，新人最容易抓住要点
- 中等大小语言（< 50 种语法构造）

**不适用**：

- 工业大语言（C++ / Rust 那种 1000 页规范）→ 规则爆炸，得用 K-framework 或分层 SOS
- 复杂并发 / 弱内存模型 → 朴素 SOS 不够，要 axiomatic 或 declarative semantics
- 想直接拿来跑的解释器 → SOS 非确定，需要再加求值策略
- 需要数学函数语义来证抽象性质 → 该用 denotational semantics 而不是 SOS

## 历史小故事（可跳过）

- **1970 年代初**：编程语言语义主流是 Scott / Strachey 的 denotational semantics（把程序映射成数学函数）。强大但门槛高，工程师写不动。
- **1981 年**：Gordon Plotkin 在 Aarhus 大学讲课时整理出"结构化操作语义"讲义，作为技术报告 DAIMI FN-19 流传。报告本身没正式发表，但被广泛传抄。
- **1990 年**：Standard ML 的官方 Definition 直接采用 SOS 风格写整门语言，让 SOS 第一次落到工业语言。
- **2004 年**：Plotkin 把 1981 原稿轻度修订，发表到 JLAP 期刊——让这份"灰色文献"终于有正式引用入口。
- **至今**：累计被引超 1000 次，是计算机科学被引最多的技术报告之一。

## 学到什么

1. **复杂行为可以拆成"一步一步"的规则**——这是把工程问题变成数学问题的关键转换
2. **结构归纳是 SOS 的灵魂**——每条规则只看子表达式，让证明可分解
3. **规范 ≠ 实现**——SOS 写的是"允许什么"，留出空间给实现选择策略
4. **理论 → 工业**走了 10 年（1981 → 1990 SML），别小看慢慢传播的论文

## 延伸阅读

- 视频：[Robert Harper — Practical Foundations Lecture on Operational Semantics](https://www.cs.cmu.edu/~rwh/pfpl/)（PFPL 教材配套）
- 教材：Pierce 《Types and Programming Languages》第 3 章——零基础入门 SOS
- 论文 PDF：[Plotkin 2004 JLAP 版](https://homepages.inf.ed.ac.uk/gdp/publications/sos_jlap.pdf)（127 页，密度高）
- [[standard-ml]] —— SOS 的第一个工业宿主
- [[lambda-calculus]] —— SOS 用的"项"语法基础

## 关联

- [[lambda-calculus]] —— SOS 描述的对象就是 λ-项的归约一步
- [[standard-ml]] —— SML 1990 Definition 是 SOS 的工业首秀
- [[hindley-milner]] —— HM 类型系统的 soundness 证明天然用 SOS 推
- [[algol-60]] —— ALGOL 60 报告用 BNF 描述语法，SOS 给它"运行起来"的语义
- [[effect-handlers]] —— 代数效应的语义层就是扩展过的 SOS
- [[bidirectional-typing]] —— 双向类型规则的形状和 SOS 推理规则同源
- [[compiler-errors]] —— 编译器报错信息精度依赖 SOS 风格的"哪一步出错"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cakeml]] —— CakeML — 从源码到机器码每一步都被数学证明的 ML 编译器
- [[call-by-need-1995]] —— Call-by-Need Lambda Calculus — 给惰性求值一套真正的演算
- [[frank-effects]] —— Frank — 让 effect handler 写得就像普通函数
- [[frenetic-2011]] —— Frenetic 2011 — 把 OpenFlow 流表换成函数式程序
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[kahn-natural-semantics]] —— Kahn 自然语义 — 用一棵推理树说清楚程序求值
- [[landin-secd]] —— Landin SECD — 第一台机械求值 lambda 表达式的抽象机器
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[mycroft-strictness]] —— Mycroft 严格性分析 — 编译器替你判定哪些参数能"先算"
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
