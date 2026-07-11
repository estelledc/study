---
title: Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
来源: 'Sagiv, Reps & Wilhelm, "Parametric Shape Analysis via 3-Valued Logic", TOPLAS 2002'
日期: 2026-05-30
分类: 编程语言
难度: 高级
---

## 是什么

参数化形状分析（**Parametric Shape Analysis**）是**让编译器在不跑程序的情况下，证明你的链表/树/图在做完一连串指针赋值之后还是合法的链表/树/图**的方法。日常类比：像物业巡查公寓——不需要打开每户门看里面什么样，只看楼层布局图就能断言"这个楼里没有死路"。

你写一段反转链表的代码：

```c
while (cur != NULL) {
  next = cur->next;
  cur->next = prev;
  prev = cur;
  cur = next;
}
```

光看代码很难肉眼证它输出仍是无环单链表。这个框架能在**编译期**得出："输入若是无环单链表，输出也必然是无环单链表"。

它的"参数化"指——你想证什么性质（无环？有序？无共享？），就**加几条逻辑谓词**而不是改算法。底层引擎用 **Kleene 三值逻辑**（真/假/不确定）表示堆，所以同名工具叫 **TVLA**（Three-Valued Logic Analyzer）。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 Java / Rust 的指针操作有时被静态工具警告"可能造成环"——背后正是这套形状抽象在跑
- 为什么 separation logic 出来后还有人继续用 TVLA——两者从不同角度逼近同一问题
- 为什么 [[andersen-pointer-analysis]] 之类的 points-to 分析不够用——它只告诉你"指针指哪"，没告诉你"指完之后整体形状是什么"
- 为什么写形状分析的工具都要"加几行就能换分析"——这正是论文标题里"参数化"三个字想送的礼物

## 核心要点

整套框架可以拆成 **三件武器**：

1. **逻辑结构当堆**：堆里每个对象是一阶逻辑结构里的一个节点，节点之间的关系（"x 指向 y"、"y 可达 z"）是谓词。类比：堆是一张关系数据库表，对象是行，指针是外键。具体语义和抽象语义共用同一套结构定义。

2. **3 值逻辑做抽象**：具体执行时谓词非真即假（2 值）；为了让分析能停下来，必须把无穷多对象折叠成有限个"汇总节点"。被折叠对象上原本真假不一的事实就打上**第三个值 1/2（unknown）**。Kleene 1952 早就给出三值真值表，这里直接用。

3. **embedding 定理保安全**：被折叠的抽象结构里若某事实仍是 true，那它在所有被汇总的真实堆里都为 true；abstract 上若是 false，具体也都 false；只有 1/2 才表示"不知道"。这条定理保证分析**保守且可靠**——不会把假性质证成真（找 bug 时 1/2 仍可能误报）。

加上 **focus**（暂时把 1/2 分裂回 1 和 0，让指针赋值能精确算）和 **coerce**（用 integrity 规则把 1/2 收紧），整套机器就能跑了。

## 实践案例

### 案例 1：链表反转保持"无环单链表"

输入是 `n` 个对象组成的无环单链表。抽象后只保留 3 个节点：当前节点、已反转前缀的 summary、未反转后缀的 summary。

```
[reversed prefix |s|] ← prev    cur → [unreversed suffix |s|]
```

`|s|` 表示 summary。每轮循环 focus 把 cur 分裂出"真正的 cur 节点"和"剩下的 suffix"，做指针更新，再 coerce 收紧。最终断言"prev 指向的链表仍无环"为 true，证毕。整个证明不需要写循环不变量，框架自己迭代到不动点。

### 案例 2：插入排序保持"有序"

加一条 instrumentation 谓词：

```
sorted_upto(x) := ∀y.(y reachable_from list_head ∧ y ≠ x) ⇒ data(y) ≤ data(next(y))
```

**逐部分解释**：

- `reachable_from` 是 instrumentation 谓词，由用户写规则告诉框架怎么从 next 闭包推出
- `sorted_upto(x)` 在每条赋值后由 coerce 重新求值
- 如果某轮某节点 sorted_upto 变成 1/2，说明算法可能出错，立刻报警

### 案例 3：检测内存泄漏

加一条 `reachable_from_root` 谓词，让它在每次 free / 指针重定向后自动重算。分析跑完后扫一遍：哪些节点这条谓词是 false 或 1/2？

- false → 一定泄漏（已经从 root 不可达）
- 1/2 → 可能泄漏（程序某条路径上不可达）
- true → 安全

比起运行时 GC 检查，这个在编译期就能拦住一类错误。如果你的语言已经有 GC（Java、Go），这套分析也能用来证"GC 之后哪些循环引用还会卡住"。

## 踩过的坑

1. **把 3 值当成普通三态枚举**：忘了 Kleene 真值表里 `1/2 ∧ false = false`、`1/2 ∨ true = true` 这种吸收规则，写出来的可达性传播就错。

2. **直接在 summary 节点上做指针赋值**：summary 代表多个对象，赋值会破坏 embedding，必须先 focus 把目标节点分裂回具体节点再更新，否则保守性失守。

3. **instrumentation 谓词加得太多**：每加一条，抽象结构数量按指数涨。经验是只加 reachable / cyclic / sorted 这种核心三件套，不要把"是否在第 3 层"这种业务谓词也塞进去。

4. **忘了写 coerce / integrity 规则**：谓词更新后 1/2 比例会越积越大，最后所有断言都变 unknown，看起来跑通其实啥也没证。新人常把这一步当 optional，实则它是精度的命门。

## 适用 vs 不适用场景

**适用**：

- 链表 / 树 / DAG 等指针密集结构的形状不变量证明
- 写底层数据结构库时验证 destructive update 不破坏不变量
- 验证 GC、内存池等堆管理代码的正确性
- 想证明 sortedness、reachability、no-sharing 等性质的小规模程序

**不适用**：

- 大规模工业代码（万行起）—— 抽象结构组合爆炸
- 需要算术精度（数值边界、缓冲区溢出）—— 用区间分析或 polyhedra
- 函数式不可变数据 —— 没有 destructive update，问题本身简单
- 并发 / 锁正确性 —— 这套框架默认顺序语义，需要扩展

## 历史小故事（可跳过）

- **1990 年**：Chase-Wegman-Zadeck 给出第一个针对链表的 shape graph 算法，但每种结构都得手写专用算法
- **1996 / 1998 年**：Sagiv-Reps-Wilhelm 先在 POPL'96 发"Solving shape-analysis problems in languages with destructive updating"，TOPLAS 1998 出完整版，铺垫描述 store 的图记号
- **1999 年**：POPL 发"Parametric Shape Analysis via 3-Valued Logic"，第一次把"三值逻辑 + 参数化谓词"摆出来
- **2002 年**：同题 TOPLAS 完整版（约 80 页）发表，把 embedding theorem、focus、coerce 全证齐
- **2000 年起**：TVLA（Lev-Ami & Sagiv, SAS 2000）在 Tel Aviv 开源，开始有人拿它证小型 OS 内核里的链表函数
- **2002 年起**：Reynolds 和 O'Hearn 推 separation logic，从断言式角度切同一问题，二者从此并行发展

## 学到什么

1. **参数化是工具长寿的秘诀**——分析框架不该针对一种结构写死，而要让用户加谓词就换分析
2. **三值逻辑不是奇技淫巧**——它是"我不知道"在数学上最干净的表达，比异常处理或 Optional 更适合静态分析
3. **抽象一定要带可靠定理**——embedding theorem 是这篇论文真正的硬骨头，没有它整个框架就是启发式
4. **理论 → 工具 → 应用** 三步走——POPL 99 出理论，TOPLAS 02 出完整版，TVLA 出工程实现，应用再陆续跟上
5. **focus 与 coerce 是抽象 + 精度的两个旋钮**——focus 在赋值前细化、coerce 在赋值后约束，两者一推一拉防止精度无声漏掉

## 延伸阅读

- 论文 PDF：[3vl-toplas.pdf](https://www.cs.tau.ac.il/~msagiv/3vl-toplas.pdf)（Sagiv 主页直链，约 80 页，建议先读 §3 embedding 再看 §4 focus）
- 教程视频：[Mooly Sagiv — Static Analysis 课程](https://www.cs.tau.ac.il/~msagiv/courses/pa15.html)（Tel Aviv 公开课，含 TVLA 上机）
- TVLA 工具：[TVLA 主页](http://www.cs.tau.ac.il/~tvla/)（开源工具，能跑论文里所有例子）
- 论文前作：Sagiv-Reps-Wilhelm POPL 1999（同主题缩减版，10 页好啃）
- [[cousot-abstract-interpretation]] —— 这套形状分析是抽象解释的具体实例化
- [[andersen-pointer-analysis]] —— points-to 分析告诉你"指哪"，shape 分析进一步告诉你"整体长什么样"

## 关联

- [[cousot-abstract-interpretation]] —— 形状分析是抽象解释在堆领域的旗舰应用
- [[andersen-pointer-analysis]] —— 同样研究指针，但只关心"指向哪"不关心"整体形状"
- [[steensgaard-pointer]] —— 用等价合并加速 points-to，思路与 summary 节点同源
- [[kildall-dataflow]] —— 数据流框架是形状分析的算法骨架（不动点迭代）
- [[liquid-types]] —— 用 refinement type 证类似性质，但聚焦数值约束
- [[refinement-types-1991]] —— 同期另一种"加约束"思路，与 instrumentation 谓词异曲同工
- [[tofte-talpin-regions]] —— 也用类型/逻辑管堆，但关心生命周期不是形状
- [[hindley-milner]] —— 类型推导也是不动点迭代，与本框架的算法骨架同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[cousot-halbwachs-polyhedra-1978]] —— Cousot-Halbwachs 凸多面体域 — 让分析器自己发现变量间的线性关系
- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[infer-biabduction]] —— Bi-Abduction — 让静态分析自动猜出函数缺什么前提
- [[mcmillan-smv-1993]] —— McMillan SMV 1993 — 把状态空间从 10^6 推到 10^20 的符号模型检测
- [[mine-octagon-2006]] —— Miné 八边形抽象域 — 在区间和多面体之间的甜点
- [[reps-ifds]] —— Reps-Horwitz-Sagiv IFDS — 把跨过程分析变成图上找路
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
