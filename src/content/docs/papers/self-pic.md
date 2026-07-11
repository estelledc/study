---
title: Self / PIC — 内联缓存的诞生
来源: 'Chambers, Ungar et al., "An Efficient Implementation of SELF, a Dynamically-Typed OO Language", OOPSLA 1989'
日期: 2026-05-29
分类: 编译器
难度: 中级
---

## 是什么

**内联缓存**（Inline Cache，IC；多类型版叫 **PIC**, Polymorphic Inline Cache）是 1989 年 Sun 实验室 SELF 团队发明的一种"让动态语言方法分发不用每次查表"的技巧——把上次调到的方法地址**贴在调用点旁边**，下次同类型对象调过来直接跳过去。

日常类比：[[smalltalk-80]] 每次喊一个对象方法都要翻字典找——"`shape area` 是哪个？查 Shape 类有没有 area，没有就上溯父类，再没有就翻字典哈希链"。SELF 团队说："等等，这条调用语句 99% 时间面对的对象都是同一种类型，直接把上次找到的地址贴在这行代码旁边不就完了？"

你写：

```self
shape area    " 调 shape 的 area 方法 "
```

第一次 SELF 老老实实查字典；查到结果后，**就在这行调用代码旁边写一张小便签**："如果下次还是 Circle 类，直接跳到地址 0x4711"。下次调到 Circle 类——直接命中，不查字典。

这张贴在调用点的小便签 = **inline cache**。能容多种类型 = **polymorphic inline cache (PIC)**。

## 为什么重要

不理解 IC/PIC，下面这些事都没法解释：

- 为什么 V8 / SpiderMonkey / JavaScriptCore 能让 JavaScript 跑到接近 C 的速度——核心引擎就是 PIC
- 为什么 HotSpot JVM 的"虚函数调用"几乎免费——HotSpot 的设计者 Lars Bak 出自 SELF 团队
- 为什么 Java / Kotlin / Scala 里 `interface.method()` 不慢——JVM 用 PIC 的近亲做分发
- 为什么 1989 年的一篇 SELF 实现论文 36 年后还在影响每天写的 JS

简单说：**没有 PIC，浏览器里跑 JS 这件事可能要再推迟 10 年**。

## 核心要点

PIC 的核心是个三态状态机——根据"这个调用点见过几种类型"决定缓存策略：

1. **Monomorphic（单态）**：调用点只见过 1 种类型——cache 1 行，最快路径，比直接调用就多一次类型 ID 比较。
2. **Polymorphic（多态）**：调用点见过 2–8 种类型——cache 一张小表，按线性搜索命中。N=8 已经覆盖 99%+ 的真实调用。
3. **Megamorphic（重态）**：调用点见过 8 种以上类型——放弃缓存，回退到全局哈希表查找。这是"认输"状态，承认这个点不适合 cache。

转移规则单向：mono → poly → mega，一旦升级不会回退。

```
state: UNINIT
  ↓ 第一次调用
state: MONO     cache 1 行     ~3 cycle hit
  ↓ 来了新类型
state: POLY     cache ≤ 8 行   ~5 cycle hit
  ↓ 类型超过 8 种
state: MEGA     回退全局哈希   ~50 cycle
```

**关键洞察**（论文最值钱的一条）：动态语言的调用点**几乎从不真的多态**——75–85% 是单态，10–20% 是 2–4 类型，真正多到 8 个以上的不到 1%。这条经验分布是 PIC 设计的地基。

## 实践案例

### 案例 1：V8 怎么调你写的 `obj.x`

```js
function getX(obj) { return obj.x }
getX({x:1, y:2})   // 第一次：查 hidden class，缓存
getX({x:3, y:4})   // 第二次：同 hidden class，直接读 slot 0
getX({x:5})        // 不同 hidden class——poly 状态，加一行
```

V8 把"对象的 layout"叫 **hidden class**（其实是 SELF 1989 年的 *maps* 概念在 JS 上的复刻）。`{x:1, y:2}` 和 `{x:3, y:4}` 共享同一个 hidden class，PIC 直接命中——读 slot 0 就拿到 `x`，省掉哈希查找。

### 案例 2：什么写法让 PIC 失效

```js
function bad(obj) { return obj.x }
bad({x:1})              // mono
bad({x:1, y:2})         // poly +1
bad({x:1, z:3})         // poly +1
// ... 9 种不同形状的对象后 ...
bad({a:1, b:2, c:3})    // megamorphic！这个 call site 性能塌陷
```

前端常见踩坑：循环里 `obj[dynamicKey] = ...` 每次给对象添新 property → 每次产生新 hidden class → 调用 `obj` 的方法很快变 mega。

### 案例 3：把 megamorphic 拆回 mono

```js
// 坏：一个 call site 吃掉所有形状 → 很快 mega
function readX(obj) { return obj.x }
for (const o of manyShapes) readX(o)

// 好：按形状拆函数，每个 call site 保持 mono/poly
function readPoint(p) { return p.x }
function readUser(u) { return u.x }
```

步骤：① 找出「一个函数被几十种对象形状反复调用」的热点；② 按业务类型拆成多个函数（或按构造函数分支）；③ 让每个调用点只见少数 hidden class，PIC 才能命中。React Hooks 把组件收成函数、状态外置，**附带**让部分调用点更稳——这是引擎侧的副收益，不是 Hooks 的主设计动机。

## 踩过的坑

1. **过早优化反成 megamorphic 制造机**：手写"通用工具函数"接收任意对象 → 调用点必然多态。要么按类型拆分，要么接受性能代价。

2. **delete property 让 hidden class 退化**：`delete obj.x` 会让 V8 把 obj 转成 "dictionary mode"（像普通哈希表，不再走固定槽位）——脱离 PIC 快路径。性能敏感代码避免 delete，用 `obj.x = undefined`。

3. **构造函数 property 顺序影响 hidden class**：`this.x=1; this.y=2;` 和 `this.y=2; this.x=1;` 产生不同 hidden class——同一个构造函数里 property 赋值顺序得固定。

4. **PIC 是运行时演化的，跨启动不可保留**：浏览器 cold start 慢的原因之一就是 PIC 还没热起来。Hermes（React Native 的 JS 引擎）走 AOT bytecode 路线绕过这个，但牺牲了 PIC 的 type feedback（调用点见过哪些类型的运行时记录）。

## 适用 vs 不适用场景

**适用**：
- 动态分派语言（JS / Smalltalk / Self / Ruby / Python 的某些 JIT）—— PIC 是运行时性能的标配
- 虚函数 / 接口分发（JVM、CLR）—— interface call 用 PIC 形态加速
- 任何"调用点的接收者类型分布集中"的场景

**不适用**：
- 完全静态语言（C / Rust 的非 dyn 路径）—— 编译期已确定调用目标，不需要 PIC
- 调用点真正高度多态（看到几十种类型的反射 / 元编程框架）—— mega 状态没救
- AOT 编译目标（Hermes / Dart AOT）—— 启动期性能优先，跳过 PIC 的运行时演化

## 历史小故事（可跳过）

- **1984**：Deutsch & Schiffman 在 Smalltalk-80 实现里发明 **monomorphic inline cache**——只能 cache 1 个类，碰上多态调用就反复 miss。
- **1989**：Chambers、Ungar 等人在 OOPSLA 发表 SELF 实现论文——SELF 是 Sun 实验室 1986 起做的"纯对象语言"研究项目，本文给 IC 概念做了系统化扩充。
- **1991**：同团队的 Hölzle 在 ECOOP 正式命名 **polymorphic inline cache**——把 cache 从 1 行扩成 N 行小表。
- **1996**：Sun 收购 Animorphic（SELF 团队转型），Lars Bak 等人把 PIC 思想带进 HotSpot JVM。
- **1999**：HotSpot Server 发布——Java 的虚函数性能从此接近 C++。
- **2008**：Lars Bak 在 Google 主导 V8——把 SELF 的 maps（hidden class）+ PIC 整套搬进 JavaScript。
- **2010**：SpiderMonkey JaegerMonkey 引入 PIC 路线，与 V8 并行。
- **2018**：SpiderMonkey CacheIR——把 PIC 的"比较+跳转"抽象成可组合 IR 程序，是 PIC 27 年后的大进化。
- **2024**：V8 / SpiderMonkey / JSC 三家 JS 引擎都默认用 PIC，已是动态语言 VM 的工业标准。

**SELF 项目本身从未商业化**——但它输出的人才（Ungar、Chambers、Hölzle、Lars Bak）改写了 1990–2010 工业 VM 设计史。

## 学到什么

1. **缓存的核心是"分布感知"**——PIC 的 N=8 不是数学推出来的，是 SELF benchmark 跑出来的经验分布。任何阈值类决策都该走"先量数据再选阈值"，不靠拍脑袋。

2. **cache 的副产品是数据**——PIC 最初目标是优化分派，但每个调用点的 stub 内容自动成了完美的 type profile，给后续 specialization、speculative inline、deoptimization 全部提供了 ground truth。做缓存时就该想"这条数据还能给谁用"。

3. **学术领先工业 10–20 年是常态**——1989 SELF/PIC 到 2008 V8 隔了 19 年，不是技术不成熟，是等到了浏览器+重 JS 应用这个商业载体。

4. **动态性是连续光谱**——TypeScript / V8 / Hermes 不是把 JS 变静态，是按分布特性把不同 case 引到不同路径。能静态推断的走静态，推不出来的退到 PIC，再多了就 fallback。性能优化不是"消灭"动态性，是给动态性配更好的快路径。

## 延伸阅读

- 原论文：[Chambers, Ungar 1989 OOPSLA](https://dl.acm.org/doi/10.1145/74878.74884)（SELF 实现的奠基论文）
- 后续 PIC 论文：[Hölzle, Chambers, Ungar 1991 ECOOP](https://bibliography.selflanguage.org/_static/pics.pdf)（正式命名 PIC）
- Hölzle PhD：[Adaptive Optimization for Self](http://hoelzle.org/publications/dissertation.pdf)（Stanford 1994，动态语言 JIT 教学必读）
- V8 talk：Lars Bak 在 Google IO 2008 的 V8 公开发布演讲（YouTube 可搜）
- 综述：Aycock, "A Brief History of Just-in-Time", ACM Computing Surveys 2003

## 关联

- [[smalltalk-80]] —— PIC 的"前史"：Smalltalk method dispatch 的字典查找慢，催生了 1984 MIC 和 1989 PIC
- [[hindley-milner]] —— 静态类型推导，与 PIC 互补的"减少动态分派"路径
- [[bidirectional-typing]] —— 静态类型如何减少（但不消除）PIC 的需求
- [[ssa]] —— 现代编译器后端标配 IR，配合 PIC 的 type feedback 做 specialization
- [[llvm]] —— AOT 编译框架，与 PIC（JIT 运行时分派）互补的两端
- [[boehm-gc]] —— PIC stub 引用 method code，与 GC 的 invalidation 协议是工业 VM 的复杂耦合点

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[andersen-pointer-analysis]] —— Andersen 指针分析 — 让编译器自己算出 p 可能指向谁
- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[mcfarling-bp-1993]] —— McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[slab-1994]] —— Slab Allocator 1994 — 内核按对象类型开缓存，不是按字节切
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统
- [[tomasulo-1967]] —— Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序
- [[tracemonkey]] —— TraceMonkey — 只编"真的走过的那一条路"
