---
title: Nelson-Oppen 1979 — 让多个判定程序坐下来交换"我刚发现 a=b"
来源: Nelson & Oppen, 'Simplification by Cooperating Decision Procedures', ACM TOPLAS 1979
日期: 2026-05-30
子分类: 形式化验证
分类: 形式化方法
难度: 中级
provenance: pipeline-v3
---

## 是什么

Nelson-Oppen（**NO**）是 1979 年 Greg Nelson 和 Derek Oppen 在 TOPLAS 发的一套**让多个专科判定程序协作**的协议。

一句话说清楚问题：

> 你有一个程序专管整数算术，另一个专管数组读写，第三个专管未解释函数 `f(x)`。给你一道混合命题：`f(a-1) = b ∧ a = b+1 ∧ f(b) ≠ b`。每个程序单独都看不懂——要算术的看不懂 `f`，要 `f` 的看不懂减号。怎么判定它整体是否可满足？

NO 的答案：**让它们坐下来，只交换"我新发现某两个共享变量相等"这一种事实**，直到不动点。每个 theory 内部怎么算自己的、不告诉别人；但发现 `a=c` 这种跨 theory 共享变量的等式必须广播。

这个朴素到看着像"显然就该这么做"的协议，是**今天每一个工业 SMT 求解器**（Z3 / CVC5 / Yices）多 theory 协作的理论支柱。1979 年那篇论文画的"theory 之间怎么对话"流程，2026 年的 Z3 内核仍然在跑。

## 为什么重要

不理解 Nelson-Oppen，下面这些事都说不清：

- 为什么 **Z3 能验证 `forall x:int, a:array of int, a[x]+1 > a[x]`** —— 它要把 `array.read` 和整数算术拼起来，靠的就是 NO
- 为什么 **Dafny / Boogie / F\* 这些验证器**敢把"程序正确性"翻译成混合算术 + 数组 + 未解释函数 —— SMT 后端帮你处理
- 为什么 **rust-analyzer / clippy / cargo-audit** 偶尔会调 Z3 —— 内部 NO 协议在跑
- 为什么 **`Z3.from_string("...").check()` 有时秒过有时跑半小时** —— theory combine 的不动点轮数对输入极敏感

## 核心要点

NO 算法可以缩到 **3 步**：

1. **Purification（净化）**：把混合公式拆开。读到 `f(a-1) = b`，引入新变量 `t`：原式变成 `f(t) = b ∧ t = a-1`。现在 `f(t)=b` 只属于"未解释函数 theory"，`t=a-1` 只属于"算术 theory"。每个子句都干净归一个 theory 管。

2. **Independent decision（各管各的）**：每个 theory 单独跑自己的判定程序，看自己这一摊有没有矛盾、有没有蕴含什么共享变量间的等式。比如算术 theory 拿到 `a=b+1 ∧ t=a-1` 自己就能推出 `t=b`。

3. **Equality propagation（广播等式）**：算术 theory 大喊"我发现 `t=b`"。其它 theory 收到 → 把这个等式合并进自己的状态，重新跑判定。如果哪个 theory 喊"我矛盾了"，整体就是不可满足。所有 theory 都没新等式可广播、都没矛盾 → 整体可满足。

不动点循环：**purify → 各自判 → 喊等式 → 重判**，直到没人再喊新东西。

### 为什么"只换等式"就够了

这是 NO 论文最反直觉的结论。直觉上你可能以为要交换很多东西（不等式、模型、值），但 1979 年证明：

> 只要两 theory 的**签名不相交**（不共享函数符号）+ 都是 **stably-infinite**（模型可以任意大）+ 都是 **凸的（convex）**，那只交换共享变量间的**等式**就足以让组合算法完备。

凸的意思：单单 theory 蕴含 `x=y₁ ∨ x=y₂ ∨ ...` 这种"或"的时候必然能蕴含其中某个具体的 `x=yᵢ`。线性算术是凸的，未解释函数也是。位向量、非线性算术不是 → 现代 SMT 要做 case split 补救。

## 实践案例

### 案例 1：手算一题，看 NO 怎么协作

公式：`f(a-1) = b ∧ a = b+1 ∧ f(b) ≠ b`

第 1 步 purify，引入 `t = a-1`：

- 算术 theory（LIA）：`a = b+1`、`t = a-1`
- 未解释函数 theory（EUF）：`f(t) = b`、`f(b) ≠ b`
- 共享变量：`a, b, t`

第 2 步 各管各的：

- LIA 算 `a=b+1` 和 `t=a-1` → 推出 `t=b`，喊出来
- EUF 收到 `t=b` → `f(t)=b` 变成 `f(b)=b`；但已知 `f(b)≠b` → **矛盾** ✗

整体不可满足。两个 theory 一来一回换了**一条等式**就分出胜负。

### 案例 2：DPLL(T) 框架——NO 在 SMT 里的位置

现代 SMT 求解器（Z3 / CVC5）骨架：

```
[CNF 化的混合公式]
       ↓
   SAT 引擎（DPLL/CDCL，DPLL-1962 的后裔）
       ↓ 选了一组文字赋值（theory atoms）
   Theory Combine（Nelson-Oppen 协议）
       ↓ 把 atoms 分发到各 theory
   ┌────────┬────────┬────────┐
  LIA      EUF      Array    BV
   └────────┴────────┴────────┘
       ↑ 等式广播 / 冲突 lemma 回传
```

SAT 引擎管布尔骨架（参考 [[dpll-1962]] [[chaff-2001]]），决定 "哪些原子是真的"。Theory Combine 层就是 NO，把 theory 间的事实拼起来。哪个 theory 说"这组赋值不可能"，就把矛盾原因当一条新子句（**theory lemma**）回传给 SAT 引擎学习——这是 [[marques-silva-grasp-1996]] CDCL 学习子句的扩展。

### 案例 3：在你电脑里 Nelson-Oppen 在哪儿

- **`cargo-audit` 检查 CVE 模式**：版本约束（LIA） + 包名等关系（EUF） → Z3 调用
- **Apple LLVM Sanitizer**：检查指针约束（数组 theory） + 算术（LIA） → Z3
- **Dafny 验证 `arr[i] + 1 > arr[i]`**：array.read（数组 theory） + 整数算术 → SMT 求解
- **KLEE 符号执行**：路径条件混合 BV + LIA → STP/Z3
- **Spectre 缓解器编译**：建模缓存状态约束 → SMT NO 协作

每次你跑 `cargo build`，依赖求解里**也许**还没用 NO（PubGrub 在纯布尔层就解了）；但每次你写 `assert` 让 Dafny / F* 验证，背后都是 NO 在跑。

### 案例 4：non-convex theory 的麻烦——位向量

位向量 BV theory 不是凸的。例如 `x` 是 2-bit，`x ≠ 0 ∧ x ≠ 1 ∧ x ≠ 2 → x = 3`，但单看 `x≠0 ∨ x≠1` 推不出某个具体等式。

NO 朴素版在这里**不完备**——会漏掉一些不可满足公式。补救：

- **Case split**：让 SAT 引擎枚举 `x=0 ∨ x=1 ∨ x=2 ∨ x=3` 各分支
- **Model-based combination**（Shostak / Z3 后来做的）：每个 theory 生成模型而不只是等式

工业 SMT 把 NO 当骨架，但加了一堆扩展应付 non-convex。

## 踩过的坑

1. **签名必须不相交**：两个 theory 不能都管 `+` 号。如果整数算术和实数算术都注册了 `+`，NO 直接坏掉——要先归一到一个 theory 或加 wrapper 函数符号。

2. **stably-infinite 在固定位宽位向量不成立**：8-bit 位向量只有 256 个模型，"模型可任意大"这条假设不满足。Z3 用 model-based theory combination（MBTC）顶替，不再纯靠等式广播。

3. **等式传播实现成 O(n²) 会爆**：每个 theory 有 k 个共享变量、t 个 theory 的话，朴素互相喊等式是 O(t·k²)。工业 SMT 用 **union-find + 延迟广播**——只在 SAT 引擎要 check 时才同步。

4. **non-convex 不报错只是慢**：theory 漏喊等式不会让结果错（因为 SAT 层会 case split 兜底），但会让搜索树膨胀。早期 CVC Lite 在位向量上慢的就是这个。

5. **Purification 引入的辅助变量计数会爆**：复杂嵌套表达式 `f(g(h(x+1)+2))` 会拆出一堆 `tᵢ`。预处理时用 hash-cons 复用同名子项，否则变量数指数级。

## 适用 vs 不适用场景

**适用**：

- SMT 求解多 theory 组合 —— Z3 / CVC5 / Yices 内核
- 程序验证（数组 + 算术 + 未解释函数）—— Dafny / Boogie / F\*
- 符号执行（路径条件多 theory 混合）—— KLEE / SymCC / S2E
- 编译器优化里的算术化简 —— LLVM 部分 pass 用 SMT 验证变换合法性

**不适用**：

- 单 theory 公式 —— 直接调那个 theory 的判定程序，不需要协作
- 量词频繁（∀ ∃）的一阶逻辑 —— 半判定问题，NO 只管 quantifier-free
- 非线性实数算术 —— 不可判定，CVC5 用启发式而非 NO 完备组合
- 概率 / 模糊推理 —— 不在 NO 范围内

## 历史小故事（可跳过）

- **1979**：Nelson & Oppen 在 TOPLAS 发论文，给 Stanford Pascal Verifier 的内核做理论基础。
- **1984**：Shostak 发表另一种组合协议（Shostak combination），更高效但限制更多——Z3 后来吸收了两者的优点。
- **1990s**：CVC Lite / SVC（Stanford） 第一次在工业级求解器实现 NO。
- **2002**：Tinelli & Harandi 重证 NO 完备性，给现代教科书的标准证明定型。
- **2008**：Z3（Microsoft Research）发布，把 DPLL(T) + NO + 高效启发式工程化到极致。
- **2022**：CVC5 发布，SMT-LIB 标准全部以 NO 协议为前提。

从 1979 那篇 30 多页的 TOPLAS，到 2026 年百万行的 Z3 内核，**多 theory 通过共享等价类协作**这个核心从未改变。

## 学到什么

1. **协作协议常常比"造大一统"更管用**：NO 没有发明一个万能 theory，而是定义一个**接口**让各 theory 插进来。这是软件架构的常胜模式。
2. **充分条件比必要条件好教**：NO 论文先证"凸 + stably-infinite + 签名不相交"组合就完备——这三条容易检查。后来发现条件可以放宽，但 1979 版本足够覆盖工业 90% 场景。
3. **算法的"接口"价值常常超过"算法本身"**：NO 协议规定的 theory 接口（sound/complete + 等式输出）成了 SMT-LIB 标准的基础，让 Z3 / CVC5 / Yices 能互换 theory 实现。
4. **非凸的麻烦不是 bug，是真问题**：位向量 non-convex 不是 1979 年没想到，是问题本身就这么难——理论上需要 case split，工程上需要 MBTC。

## 延伸阅读

- 论文 PDF：[Nelson & Oppen 1979 TOPLAS](https://dl.acm.org/doi/10.1145/357073.357079)（30+ 页，符号略密但配例题，能读完）
- 教科书：Bradley & Manna *The Calculus of Computation*（2007，Chapter 10 专讲 NO 组合）
- 综述：Tinelli *A DPLL-based Calculus for Ground Satisfiability Modulo Theories*（2002）
- 工业实现：Z3 源码 `src/smt/theory_combination.cpp`（Microsoft GitHub 公开）
- [[dpll-1962]] —— SMT 的下层 SAT 骨架
- [[chaff-2001]] —— 让 SAT 跑百万变量的工程化
- [[minisat-2003]] —— 教学级 CDCL 实现，SMT 内核常用同款骨架
- [[marques-silva-grasp-1996]] —— CDCL 学习子句，SMT 把它扩成 theory lemma

## 关联

- [[dpll-1962]] —— SMT 的布尔骨架引擎；NO 跑在它的上层
- [[chaff-2001]] —— 工业 SAT 的 watched literals + VSIDS，给 SMT 内核当下层
- [[minisat-2003]] —— 600 行教学 SAT，许多 SMT 求解器把 MiniSat 当布尔层
- [[marques-silva-grasp-1996]] —— CDCL 学习子句；SMT 的 theory lemma 是它的多 theory 推广
- [[hoare-logic]] —— 程序验证目标，验证条件常翻成 SMT 由 NO 后裔自动处理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chaff-2001]] —— Chaff 2001 — 把 CDCL 工程化的两个杀手锏
- [[dpll-1962]] —— DPLL 1962 — 把"逻辑判定"从内存爆炸救成栈式回溯
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hyperkernel-2017]] —— Hyperkernel — 让 SMT 求解器一键验证操作系统内核
- [[marques-silva-grasp-1996]] —— GRASP 1996 — 让 SAT 求解器从冲突里学到东西
- [[minisat-2003]] —— MiniSat 2003 — 600 行 C++ 把 CDCL 写成教科书
- [[nieuwenhuis-dpll-t-2006]] —— Nieuwenhuis-Oliveras-Tinelli 2006 — 给 SMT 求解器写一套数学规则书
- [[z3-2008]] —— Z3 2008 — 把 SMT 工程化到工业默认

