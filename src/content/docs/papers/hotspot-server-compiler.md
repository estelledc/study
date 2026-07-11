---
title: HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
来源: 'Paleczny, Vick, Click. "The Java HotSpot Server Compiler". Sun JVM Symposium 2001'
日期: 2026-05-30
分类: compilers-pl
难度: 中级
---

## 是什么

HotSpot Server Compiler（业内俗称 **C2**）是 OpenJDK 里默认的"重型 JIT 编译器"。日常类比：像一家长期开门的小馆子——刚开张时随便切菜炒菜（解释器执行字节码），但同一道菜被反复点一千次后，老板会专门把这道菜的流程刻成卡片、磨好刀、备好料（编译成本地码），下次再来速度翻几倍。

C2 不是开机就编译所有代码。它先让 Java 字节码用解释器跑，**一边跑一边数**：每个方法被调用了多少次、每个 if 走了哪一支、每个虚调用实际指向了哪个类。当一个方法热度过线，C2 才把它编成本地机器码，并嵌入"如果以后情况变了就回退"的安全网。

这种"乐观假设 + 真打不过就回退"的范式叫 **dynamic deoptimization**，是 C2 区别于传统静态优化器的根本武器。

## 为什么重要

不理解 C2，下面这些事都没法解释：

- 为什么 Java 启动慢但跑久了反而比 C 还快——前 N 秒在解释 + 编译，之后是高度专门化的本地码
- 为什么虚调用 `list.add(x)` 在 Java 里几乎零开销，而 C++ 的虚函数永远要查 vtable
- 为什么同一个 JVM 服务"预热 5 分钟后再压测"是常识——没预热时 C2 还没来得及编热点
- 为什么 Graal、GraalVM Native Image、Java Vector API 这些 2010s 之后的新东西都长得像 C2 的徒弟

## 核心要点

C2 内部可以拆成 **四块** 协作：

1. **Profile（数据收集）**：解释器和 C1 在跑的时候顺手记下"这个 if 99% 走 then""这个虚调用 100% 是 ArrayList"。类比：餐馆点单系统统计哪几道菜最常被点。

2. **Sea-of-Nodes IR（图状中间表示）**：C2 不用传统的"基本块 + 控制流图"，而是把数据依赖和控制依赖揉到同一张图里。类比：拼乐高时不按说明书一步步来，而是画一张零件互相依赖的网，谁能先拼就先拼。Cliff Click 博士论文提出，让优化扫一遍图就能发现等价表达式。

3. **激进优化**：基于 profile 做内联（包括把虚调用单态化）、全局值编号（GVN）、循环展开、逃逸分析（栈上分配对象）、锁消除。这些优化都建立在"假设 profile 是真的"之上。

4. **Deoptimization 安全网**：每个乐观假设都埋一个守护点（uncommon trap）。比如假设虚调用永远是 ArrayList，C2 在调用前插一行类型检查；假设不成立时，跳进 runtime 把当前优化栈帧拆解、重建成解释器栈帧、继续解释执行。

## 实践案例

### 案例 1：虚调用怎么被单态化

伪代码：

```java
void process(List<Integer> list) {
  for (int i = 0; i < 1000; i++) list.add(i);  // list.add 是虚调用
}
```

解释器跑前几次时观察到 `list` 永远是 `ArrayList`。C2 编译时这样改写：

```text
if (list.getClass() != ArrayList.class) goto deopt;  // 守护点
内联 ArrayList.add 的代码：直接 array[size++] = i
```

虚调用变成普通数组写入，循环可以再被向量化。一旦哪天传进来 `LinkedList`，守护跳到 deopt，C2 撤销这段编译，回到解释器，下次再编时就不再做单态化假设。

### 案例 2：sea-of-nodes 长什么样

考虑 `int z = (a + b) + (a + b);`，传统 IR 看到两条加法指令，需要做"公共子表达式消除"。Sea-of-nodes 直接让两次 `a + b` **是同一个节点**——因为它们是同一份数据依赖：

```text
节点 #4: ADD(节点 #1=a, 节点 #2=b)
节点 #5: ADD(节点 #4, 节点 #4)
```

不需要单独跑一个"消除冗余"的 pass。这种"图相同就是表达式相同"的设计让很多优化变得几乎免费。

### 案例 3：图着色寄存器分配

C2 后端用 Chaitin-Briggs 图着色：把每个虚拟寄存器画成图节点，活跃区间重叠的两个节点连一条干扰边。给图染色，颜色对应物理寄存器；染不下时把某个节点"溢出（spill）"到栈上。

```text
虚拟寄存器：v1 v2 v3 v4 v5（同时活跃的两两相连）
物理寄存器：rax rbx rcx（只有 3 把椅子）
染色：v1=rax, v2=rbx, v3=rcx, v4=spill, v5=rax
```

类比：考场排座位，每个考生是节点，互相认识的连边（不能挨着坐），一共只有 16 把椅子。坐不下时，让某个考生坐到走廊（spill）。这一步直接决定生成代码的内存访问次数，是 C2 后端的性能命门。

## 踩过的坑

1. **JIT 编译本身要花时间**——编译开销 > 收益时反而拖慢启动；C2 用方法热度阈值（默认 10000 次）控制，但短任务永远等不到编译

2. **deoptimization 实现极其复杂**——必须能从优化后的栈帧反推出"如果用解释器跑到这一行，栈和局部变量该是什么"，要靠编译时记录的 debug info 重建

3. **激进内联让方法体爆炸**——一个热方法可能内联十几层，最终 native 码上 MB；C2 要做内联预算（MaxInlineLevel、InlineSmallCode）和层次截断

4. **图着色不一定收敛**——干扰图的 spill 决策不当会触发"溢出再次干扰"循环；Briggs 1992 提出"乐观染色"解决，C2 实现时仍是调参重灾区

## 适用 vs 不适用场景

**适用**：

- 长时间运行的 Java 服务（Web 服务器、数据库、消息中间件）——预热完之后近乎本地码性能
- 调用模式相对稳定的代码——profile 假设大多数时候都成立
- 需要充分利用 CPU 现代特性（SIMD、分支预测）的热路径

**不适用**：

- CLI 工具、Lambda 函数等启动后即结束的短任务——还没编完就跑完了，纯亏编译时间
- 反射 / 动态代理 / ClassLoader 反复加载的场景——profile 假设经常被打破，反复 deopt
- 资源严格受限的嵌入式环境——C2 编译占内存、占 CPU
- 需要可预测延迟的实时系统——deopt 的瞬间会有几毫秒抖动

## 历史小故事（可跳过）

- **1990s 初**：Self 团队（Urs Hölzle、Lars Bak、Cliff Click）在 Stanford 给动态语言做激进自适应优化，提出 PIC（多态内联缓存）和 deoptimization 的雏形 [[self-pic]]
- **1995-1997**：这群人成立 Anamorphic Systems，做 Strongtalk（带可选静态类型的 Smalltalk）；Cliff Click 博士论文里提出 sea-of-nodes IR
- **1997**：Sun 收购 Anamorphic，把 Self / Strongtalk 的优化思想全部移植到 Java，项目代号 HotSpot
- **1999**：HotSpot Client Compiler（C1）发布，主打快速编译；同期 Server Compiler（C2）开始研发
- **2001**：Paleczny-Vick-Click 在 JVM 研讨会发表本论文，正式介绍 C2 的设计
- **2013**：Oracle 开源 Graal——本质就是把 C2 的 IR 思想用 Java 重写，方便研究新优化
- **2017+**：GraalVM Native Image 把 C2 推向极致——编译时直接做 ahead-of-time，启动时间从秒级降到毫秒

## 学到什么

1. **乐观假设 + 安全回退** 比"保守正确"快得多——这是动态语言性能的核心配方，从 Self 到 V8 到 PyPy 都是这套
2. **Profile 是 JIT 的灵魂**——没有运行时数据，再聪明的优化器也只能保守。C2 的激进直接来自"我看到了你前一千次怎么跑"
3. **IR 设计决定优化上限**——sea-of-nodes 让很多冗余分析变成图等价判断，省下整整一类 pass
4. **理论 → 工程要 10 年**——Chaitin 1981 的图着色、Click 1995 博士论文的 sea-of-nodes，到 2001 才工业化集大成
5. **分层编译是工程妥协**——C1 快编译保启动，C2 慢编译保峰值，OpenJDK 后来加 tiered compilation 把两者串起来兼顾两端

## 延伸阅读

- 论文 PDF：[Paleczny, Vick, Click 2001](https://www.usenix.org/legacy/event/jvm01/full_papers/paleczny/paleczny.pdf)（13 页，密度高但好读）
- 视频：[Cliff Click — A Crash Course in Modern Hardware](https://www.youtube.com/watch?v=OFgxAFdxYAQ)（C2 设计者本人讲为什么这样设计）
- 博客：Aleksey Shipilëv 的 JVM Anatomy Park 系列，每篇 5 分钟，把 C2 优化拆开看
- 博客：Mike Pall 写过 LuaJIT 与 C2 对比，理解 trace JIT vs method JIT 的差别
- Cliff Click 博士论文：Combining Analyses, Combining Optimizations（sea-of-nodes 原始来源）
- 源码：OpenJDK `src/hotspot/share/opto/` 是 C2 实现，从 `compile.cpp` 入口往下读
- [[ssa]] —— C2 IR 是 SSA 的图状变种
- [[self-pic]] —— deoptimization 与 PIC 的思想原产地

## 关联

- [[ssa]] —— 静态单赋值，sea-of-nodes 是它的图状演化版
- [[self-pic]] —— Self 团队提出的多态内联缓存与 deoptimization，是 C2 的直系前辈
- [[smalltalk-80]] —— 第一代动态语言运行时，奠定虚调用性能问题的基本盘
- [[kildall-dataflow]] —— 数据流分析的经典框架，C2 的 GVN 和逃逸分析都建立其上
- [[llvm]] —— 静态优化代表，与 C2 形成"静 vs 动"对照，相互启发
- [[strongtalk]] —— Anamorphic 团队前作，HotSpot 团队的练兵之地
- [[simula-67]] —— 面向对象语言的鼻祖，虚调用问题的源头之一
- [[hindley-milner]] —— 静态类型推导的代表，与 C2 的运行时类型 profile 形成"编译期猜 vs 运行期看"的有趣对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[branch-prediction-yeh-patt-1991]] —— Yeh-Patt 1991 — 用最近 12 条分支的历史给 CPU 算命
- [[graalvm-truffle]] —— GraalVM Truffle — 写一棵会自我特化的语法树就能自动得到 JIT
- [[linear-scan-reg-alloc]] —— Linear Scan 寄存器分配 — 把图染色换成单趟扫描，给 JIT 用
- [[mcfarling-bp-1993]] —— McFarling 1993 — 用 XOR 把全局历史和 PC 拧在一起，再让两个预测器打擂台
- [[program-shepherding-2002]] —— Program Shepherding — 给每次跳转安排门卫
- [[pypy-tracing-jit]] —— PyPy meta-tracing JIT — 给解释器加一次 JIT，所有用它的语言一起加速
- [[tomasulo-1967]] —— Tomasulo 算法 — 让 CPU 自己决定指令的执行顺序
- [[tracemonkey]] —— TraceMonkey — 只编"真的走过的那一条路"
