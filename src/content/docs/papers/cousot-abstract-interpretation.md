---
title: Cousot 抽象解释 — 给静态分析一套统一数学框架
来源: 'Cousot & Cousot, "Abstract Interpretation: A Unified Lattice Model for Static Analysis of Programs by Construction or Approximation of Fixpoints", POPL 1977'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

抽象解释（Abstract Interpretation）是 Cousot 夫妇 1977 年提出的一套**让编译器不真正运行程序，也能算出程序属性**的数学框架。日常类比：你想知道"今晚菜谱要花多少钱"，不必真的把菜买回家炒一遍，只在超市价签上加一加就够——这就是把"具体执行"换成"抽象计算"。

你写：

```c
int x = read();
int y = x * x;
if (y < 0) abort();
```

编译器在抽象域上推：`x` 是任意整数，平方后必非负，所以 `y < 0` 永远不成立，`abort()` 是死代码。

这套"在抽象域上算"的方法，是 Astrée（空客飞控验证）/ Infer / Frama-C 等静态分析工具的理论根；类型检查、所有权分析里也能看到相近思路。

## 为什么重要

不理解抽象解释，下面这些事都没法解释：

- 为什么 Astrée 能证明 A380 飞控代码"零运行时错误"，而单元测试不行
- 为什么静态分析工具的报警永远是"宁可错杀"——因为它必须 sound 但精度有上限
- 为什么 Rust 的 borrow checker 报错有时让你"重写一段无关代码"才过——分析器在抽象域上看到了你看不到的污染
- 为什么数据流分析、类型检查看起来像不同工具，却常共享"格上算不动点"这套骨架（模型检查主线另走状态探索，不宜混为一谈）

## 核心要点

抽象解释的精髓可以拆成 **三步**。先约定两个符号：⊥（bottom）在"还没算出结果"时表示起点/空信息，在"这条路径不可行"时表示不可能；⊤（top）表示"啥都可能"。α / γ（alpha / gamma）只是一对互逆方向的函数名。

1. **造抽象域**：选一个"简化版"的值集合，叫格（lattice）。比如把所有整数压缩成 `{−, 0, +, ⊤, ⊥}` 五个抽象值。类比：地图把真实地形抽象成等高线——丢细节，留够用的形状。

2. **建 Galois connection**：装一对函数把现实压扁、再展开。α 把具体值投到抽象格（如 α(3) = `+`），γ 把抽象值还原成它代表的具体集合（如 γ(`+`) = 所有正整数）。保证"抽象算出的集合一定盖住真实结果"——即 sound（不漏报）。类比：用价签估菜钱，估出来的区间必须能盖住结账金额。

3. **算不动点**：把程序看成格上的单调函数 F，从 ⊥ 出发反复算 F(⊥)、F(F(⊥))…直到不再变——像拧螺丝拧到头。Tarski 定理保证完备格上单调函数必有最小不动点。格高度无限（如区间）时引入 widening（∇）：强制跳到更宽的值，几步内必收敛，代价是可能变粗。

三步加起来：**抽象域 + Galois connection + 不动点迭代** = 一大类静态分析的骨架。

## 实践案例

### 案例 1：符号分析（最小例子）

抽象域 `{−, 0, +, ⊤, ⊥}` 五个值——⊤ 表示"任意符号都可能"，⊥ 表示"不可能"。注意：下面的注释是抽象解释器**内部规则**，不是真 Python 代码，请别真去 Python 里跑。

```python
x = 3        # 抽象成 +
y = -x       # + 取负 → -
z = x * y    # + * - → -
if z > 0:    # - 不可能 > 0，这条分支死代码
    ...
```

**逐部分解释**：

- `x = 3` → α(3) = `+`
- 乘法在抽象域上有规则：`+ * - = -`
- 比较 `- > 0` 在抽象域返回 `false`，编译器砍掉死分支

这就是符号分析的全部——简单到能在几十行代码实现，却已经能证明"这段不会执行"。

### 案例 2：区间分析（实战常用）

抽象域是闭区间 `[a, b]`，⊤ 是 `[-∞, +∞]`。

```c
for (int i = 0; i < n; i++) {
    arr[i] = ...;   // 越界？
}
```

分析器推：`i` 进入循环时是 `[0, 0]`，每次 +1 后是 `[1, 1]`、`[2, 2]`、…格高度无限，必须 widening。标准三步：

1. **观察**：上界一直在涨、看不到尽头
2. **跳宽**：直接把上界推到 `+∞`，得到 `[0, +∞]`
3. **收紧**：再用循环条件 `i < n` 压回 `[0, n−1]`

结论：只要 `n ≤ array_length`，就不越界。

### 案例 3：可空性分析（Infer / Kotlin）

抽象域格 `{nullable, non-null, ⊤}`。

```java
String s = obj.foo();    // foo 返回 @Nullable → s: nullable
if (s != null) {
    s.length();          // 进了 if 分支 → s: non-null，安全
}
s.length();              // 出 if 后 → 重新 nullable，警告 NPE 风险
```

分析器在每个程序点维护变量的抽象值，进 if 分支时收窄，出分支时合并（join）。这就是 Infer / Kotlin / Dart 空安全的工程实现底层。

## 踩过的坑

1. **抽象域选窄了，分析很快但精度不够，大量假阳性；选宽了，慢甚至不停。** 工程上常用"区间 + 多面体 + 八边形"分层，按需开关。

2. **widening 时机太早会丢精度，太晚或不用则不收敛。** 经典错误：只在循环回边 widening，没考虑嵌套循环外层也要 widening。

3. **把 Galois connection 当成必须。** 实际很多工程实现只用 monotone framework + widening，没显式构造 α/γ。Cousot 1992 论文专门讨论"无 Galois connection 的抽象解释"。

4. **误以为 sound 等于 useful。** sound 但全 ⊤ 的分析等于没分析。工程上要看 precision/recall 不只看 sound——比如 Infer 工程上接受少量 unsound 换可用性。

## 适用 vs 不适用场景

**适用**：

- 编译器优化（死代码消除、常量传播、循环不变量外提）
- 安全分析（空指针、数组越界、整数溢出、信息流）
- 类型推导引擎（HM、可空性、effect 系统）
- 嵌入式 / 航空航天的"零误报"验证

**不适用**：

- 需要存在性证明（"存在某条路径触发 bug"）→ 用符号执行 / 模型检查
- 输入空间小到可以穷举测试 → 直接 fuzz / property test 更便宜
- 完全动态语言里类型几乎全 ⊤ → 抽象解释退化成"啥都不知道"
- 业务逻辑正确性（订单数对不对）→ 抽象解释不解决业务语义

## 历史小故事（可跳过）

- **1960s-70s**：Kildall、Kam-Ullman 各自做数据流分析；Floyd-Hoare 做程序验证；Naur 做类型系统。三个圈子互相不通话。
- **1977 年**：Patrick Cousot 与 Radhia Cousot 在 POPL 发表此文，把上述全部归到"格上的不动点"。
- **1979 年**：续篇 POPL 论文系统化 Galois connection 与抽象域设计。
- **1990s**：衍生出多面体域 Polyhedra（线性约束）、八边形域 Octagon（更便宜的近似）。
- **2003 年**：Astrée 工具对空客 A380 一级飞控代码做完整验证，零误报，证明了这套理论可工业化。

之后近 50 年，几乎每个静态分析工具都是抽象解释的徒孙。

## 学到什么

1. **不必跑程序也能知道程序行为**——只要选对抽象域和单调函数
2. **sound 与 precision 是两件事**：sound 容易，precision 才是工程难点
3. **Galois connection 是设计抽象域的指南针**，但工程实现可以省略
4. **理论 → 算法 → 工程**：1977 论文 → 1990s 抽象域库 → 2003 Astrée 工业落地，每步隔 10 年

## 延伸阅读

- 视频：[Patrick Cousot — Abstract Interpretation in a Nutshell](https://www.di.ens.fr/~cousot/AI/IntroAbsInt.html)（作者本人 1 小时讲）
- 教材：[David Schmidt — Programming Language Semantics](https://santos.cs.ksu.edu/schmidt/text/PLSpre.html)（含抽象解释章节）
- 工具：[Astrée 官网](https://www.absint.com/astree/index.htm)（看工业落地形态）
- [[scott-strachey-denotational]] —— 抽象解释的具体语义来自指称语义
- [[hindley-milner]] —— 类型推导可看作抽象解释的特例

## 关联

- [[scott-strachey-denotational]] —— 提供"具体语义"，抽象解释在它上面投影
- [[hindley-milner]] —— 类型推导是抽象解释的一种工业化形态
- [[hoare-logic]] —— 三元组验证 vs 抽象解释自动化：前者写后者算
- [[bidirectional-typing]] —— 工程化的轻量类型推导，绕开完整 Galois connection
- [[dijkstra-goto]] —— 结构化控制流让抽象解释的不动点更易收敛
- [[kahn-natural-semantics]] —— 大步语义，抽象解释常以小步语义为输入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aflgo-2017]] —— AFLGo — 让灰盒 fuzzing 朝目标代码前进
- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[avgustinov-codeql-2016]] —— QL / CodeQL — 用面向对象外壳写可扩展代码查询
- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[cousot-halbwachs-polyhedra-1978]] —— Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系
- [[e-path-egraph]] —— E-Path — 把 CFG 优化从单行通道改成候选池
- [[egglog-incremental-2026]] —— Egglog — 把 Datalog 和等式饱和合成一台推理引擎
- [[frama-c-2012]] —— Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起
- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[lerner-seminal]] —— Lerner 组合数据流 — 让小优化互相喂招
- [[liskov-abstraction-1974]] —— Liskov 抽象数据类型 — 用操作而不是存储形状定义数据
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[mine-octagon-2006]] —— Miné 八边形抽象域 — 在区间和多面体之间的甜点
- [[newsome-taintcheck-2005]] —— TaintCheck — 给不可信输入贴追踪标签
- [[partial-evaluation-jones]] —— Jones-Gomard-Sestoft 1993 — Partial Evaluation 与自动程序生成
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[securify-2018]] —— Securify 2018 — 用规则自动查智能合约漏洞
- [[slam-microsoft]] —— SLAM — 让 Windows 驱动 bug 自己撞到工具上
- [[steensgaard-pointer]] —— Steensgaard 指针分析 — 用等价合并把指针分析压到几乎线性
- [[turchin-supercompilation]] —— Turchin Supercompilation — 让编译器把程序模拟一遍再写回去
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
