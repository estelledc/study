---
title: Backus FP 1978 — 把程序从赋值循环里解放出来
来源: 'John Backus, "Can Programming Be Liberated from the von Neumann Style? A Functional Style and Its Algebra of Programs", Communications of the ACM 1978'
日期: 2026-07-08
分类: compilers-pl
难度: 中级
---

## 是什么

Backus 这篇图灵奖演讲是在问：程序能不能不再围着"变量、赋值、循环、内存格子"打转，而改成像搭积木一样，把小函数拼成大函数？

日常类比：命令式程序像让一个人每次只搬一块砖，还要不断改登记表上的数字；Backus 想要的是传送带，把"成对、相乘、求和"这些整段动作接起来，数据自己从右往左流过去。

他把传统语言称为 von Neumann 风格：变量像存储单元，赋值像把一个词从 CPU 搬到内存，循环和下标负责重复搬运。论文的正面方案叫 FP：程序是函数，函数用组合、map、reduce 这类 combining forms 拼装，并且可以用"程序代数"改写和证明。

这不是今天意义上 Haskell 的完整设计书，而是一份宣言：如果语言本身有好的组合规则，程序就能从"一步步改状态"变成"一层层描述变换"。

## 为什么重要

不理解这篇，下面这些事都不好解释：

- 为什么函数式编程总强调"组合"而不只是"不用变量"：Backus 关心的是大块程序能不能互相拼接
- 为什么 `map / reduce / compose` 后来进入 Python、JavaScript、Spark：它们就是把整批数据当单位处理的工具
- 为什么编译器和验证领域喜欢代数改写：一条程序等式可以像普通代数一样被替换、化简、优化
- 为什么"von Neumann bottleneck" 不只是硬件带宽问题，也是一种思维习惯：程序员被迫想每个词怎么搬

## 核心要点

1. **传统语言的问题是"一词一次"**。类比：明明要搬家，却规定一次只能拿一只杯子，还要每次登记杯子位置。Backus 说赋值语句就是语言层面的瓶颈，它让程序围绕下标、循环变量、临时变量展开。

2. **FP 的关键是 combining forms**。类比：厨房里不是每次重新发明"切菜"，而是把"切、炒、装盘"组合成菜谱。FP 用 `composition`、`ApplyToAll`、`Insert` 等形式，把已有函数接成新函数。

3. **程序代数让程序可以被推导**。类比：`a(x+y)=ax+ay` 能帮你化简算式；Backus 希望 `[f,g]∘h = [f∘h,g∘h]` 这类等式也能帮你改写程序。程序语言本身就成为证明语言。

## 实践案例

### 案例 1：内积从"循环改变量"变成"三段流水线"

传统写法大概是这样：

```js
let c = 0
for (let i = 0; i < a.length; i++) {
  c = c + a[i] * b[i]
}
```

Backus 的 FP 写法可以读成：

```txt
IP = reduce(+) . map(*) . transpose
IP([[1, 2, 3], [6, 5, 4]]) = 28
```

**逐部分解释**：

- `transpose` 先把两条向量变成成对数据：`[[1,6], [2,5], [3,4]]`
- `map(*)` 对每一对做乘法：`[6, 10, 12]`
- `reduce(+)` 把列表折叠成一个和：`28`

重点不是少写几行，而是程序结构直接说出"转置、逐对相乘、求和"，不用读者在脑中模拟 `i` 和 `c` 的变化。

### 案例 2：用组合代替临时变量

假设我们想把一批数先加 1，再平方，再只保留大于 10 的结果：

```js
const step = (xs) =>
  xs.map(x => x + 1)
    .map(x => x * x)
    .filter(x => x > 10)
```

如果写成 Backus 想要的味道，可以把每一步当作可组合函数：

```txt
step = filter(>10) . map(square) . map(add1)
```

**逐部分解释**：

- `map(add1)` 是"对每个元素加 1"，不是"开循环、改数组"
- `map(square)` 继续处理整个序列，输入输出仍然是一个序列
- `filter(>10)` 只说明保留规则，不关心循环计数器

这就是论文说的"whole conceptual units"：程序员想的是整批数据的变换，而不是一个槽位一个槽位地搬。

### 案例 3：AST 系统把状态更新集中到一次

Backus 没有天真地说现实系统不需要状态。他提出 AST 系统：一次大计算内部尽量用 applicative 风格，最后只提交一次新状态。

```txt
handle(input, state):
  result = SYSTEM(input, state)
  return [result.output, result.new_state]
```

**逐部分解释**：

- `SYSTEM` 像一个纯函数：拿到输入和旧状态，算出输出和新状态
- 计算过程中不偷偷改全局变量，所以独立子计算可以并行或重排
- 真正的状态转换只在返回 `new_state` 时发生一次

这和今天很多事务式系统、Redux reducer、数据库提交日志有相似直觉：先算出下一版，再决定是否提交。

## 踩过的坑

1. **把 Backus 读成"反硬件"**：他批评的是硬件模型绑架语言设计，不是说真实机器不需要内存。

2. **把 FP 理解成"所有函数都递归"**：论文反而强调组合形式能写出非重复、非递归的程序，比如内积那条流水线。

3. **把代数改写当成普通优化技巧**：原因是 Backus 想要的是语言级规则，只有语义足够简单，等式替换才可靠。

4. **忽略 FP 系统的局限**：原始 FP 不擅长历史敏感任务，论文才继续引入 FFP 和 AST 去处理定义、名字和状态。

## 适用 vs 不适用场景

**适用**：

- 数据管道、编译器 pass、图像处理这类"一批结构化数据经过多步变换"的任务
- 想把循环下标和临时变量藏进通用组合器的代码库
- 需要做程序改写、等价证明、优化推导的语言研究
- 教学中解释函数式编程为什么重视组合，而不只是语法不同

**不适用**：

- 每一步都必须立刻和外设、网络、数据库交互的流程
- 团队还没理解基本函数、列表、组合时，直接上 FP 记号会显得像乱码
- 只追求在现有 CPU 上最快的底层实现时，论文里的 FP 记号不是性能方案
- 需要完整工程语言特性的场景；这篇给的是方向和模型，不是可直接替代 C/Java 的产品语言

## 历史小故事（可跳过）

- **1950s**：Backus 领导 IBM 团队做出 Fortran，也就是他后来批评的传统高阶语言祖先之一。
- **1959-1960 年**：Backus 参与 ALGOL，并用形式文法描述语言语法，后来演化成 BNF。
- **1977 年**：ACM 把图灵奖授予 Backus，表彰 Fortran 和形式语法贡献；他在获奖演讲里反过来挑战主流语言路线。
- **1978 年**：演讲扩写成 CACM 论文，给 FP、程序代数、AST 系统一个统一叙述。
- **1980s 以后**：ML、Miranda、Haskell、Bird-Meertens 形式主义、Hughes 的模块化论证继续把"组合 + 代数"往工程和教学推进。

## 学到什么

- **语言会塑造思维**：如果语言核心是赋值和循环，程序员自然会把问题拆成内存格子的变化。
- **抽象不只是命名函数**：更强的抽象是提供稳定的组合形式，让函数之间能像积木一样拼。
- **可证明来自可组合**：程序结构越接近代数表达式，越容易用等式改写、解释和验证。
- **状态可以被隔离**：现实系统需要历史，但不必让每个小步骤都直接碰状态。

## 延伸阅读

- 原文 PDF：[Backus 1978 Turing Lecture](https://www.cs.cmu.edu/~crary/819-f09/Backus78.pdf)（长，但 Section 5 的内积例子最值得先看）
- [[hughes-fp-matters]] —— Hughes 用更工程化的例子解释函数式为什么提高模块化
- [[lambda-calculus]] —— Backus 对比的经典 applicative 模型，强大但变量替换规则复杂
- [[mccarthy-lisp]] —— 论文引用的早期函数式语言，展示 FP 之前的 applicative 传统
- [[hoare-logic]] —— Backus 批评传统程序证明太像"在外部谈程序"，而不是用程序语言本身推导
- 参考脉络：paper-context 从参考文献抓到 Arvind/Gostelow 数据流、Backus 1973 closed applicative languages、Church 1941 λ 演算等上游材料。

## 关联

- [[algol-60]] —— Backus 的 BNF 工作来自 ALGOL 传统，这篇则反思 ALGOL/Fortran 共同的命令式底座
- [[lambda-calculus]] —— FP 想保留 applicative 风格，同时避开复杂的变量替换
- [[mccarthy-lisp]] —— Lisp 提供函数式祖先，Backus 认为它后来常被 von Neumann 特性包住
- [[scott-strachey-denotational]] —— 论文承认 denotational semantics 有力量，但认为描述复杂语言仍然会变复杂
- [[hoare-logic]] —— 代表传统程序正确性证明路线，Backus 想把证明拉回程序代数
- [[hughes-fp-matters]] —— 后来的 FP 宣言，把 Backus 的"组合"改讲成工程模块化
- [[landin-secd]] —— Landin 的表达式求值机器是 applicative 计算模型的重要背景

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
