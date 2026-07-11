---
title: Liquid Types — 让编译器自己推导出"哪些值才合法"
来源: 'Rondon, Kawaguchi, Jhala, "Liquid Types", PLDI 2008'
日期: 2026-05-29
分类: 编程语言
难度: 高级
---

## 是什么

Liquid Types 是一套**让编译器不仅知道"这是个 int"，还能自动推出"它必须 > 0"或"它必须 < 数组长度"的方法**。日常类比：医院给药瓶贴标签——不光写"液体"，还写"成人剂量 0.5-1.5 mL"，超剂量直接拒发。Liquid Types 就是给变量贴这种"剂量标签"，超界的代码编译时就被拦下。

"Liquid" 不是"液体"，是 **L**ogically **Qu**al**i**fie**d** 的拼字游戏——逻辑限定的数据类型。

它解决一个老大难问题：传统类型只能区分大类（int / string / list），不能区分"哪些 int 才合法"。Liquid Types 把这一层精细约束**自动推出来**，程序员只需提供少量"候选模板"，编译器自己组装。

## 为什么重要

不理解 Liquid Types，下面这些事都没法解释：

- 为什么 OCaml / Haskell 这么强类型也会运行时数组越界 —— 普通 HM 类型只看到 `int`，看不到下标 vs 长度的关系
- 为什么 Liquid Haskell / Flux for Rust 能让你"标几行就证明全程序安全" —— Liquid Types 是它们共享的内核
- 为什么 SMT 求解器（Z3 等）从工业验证工具变成日常类型检查器 —— Liquid Types 是这条路的拐点
- 为什么 dependent type（Coq / Agda）那么强但工业落地慢 —— 它要程序员手写所有证明，Liquid Types 是"够用 + 自动"的折中

## 核心要点

Liquid Types 的核心可以拆成 **三步**：

1. **加约束的类型**：refinement type 写作 `{v: int | v > 0}`，读作"满足 v > 0 的 int"。日常类比：招聘启事——不光要"程序员"，还要"3 年以上经验的程序员"。

2. **候选模板（qualifier）**：用户提供一组"模板谓词"，比如 `v < ?`、`v >= 0`、`v < len(?)`。编译器**只**从这些模板的组合里找最合身的。日常类比：选择题——不让你自由作答，只让你从给定选项组合答案，搜索空间瞬间从无限缩成有限。

3. **SMT 解方程**：每个变量被赋一个"占位约束 K"，用法收集到的关系（如 `a[i]` 要求 `i < len(a)`）变成约束方程，丢给 Z3 问"K 用哪些 qualifier 的合取能让方程成立？"。日常类比：侦探拿口供问 Z3 "这堆证词能拼出一致故事吗？"

三步合起来，程序员**不写**精细类型，只写少量 qualifier 池子。注解负担从论文实验里的 31% 降到 <1%。

## 实践案例

### 案例 1：数组下标自动证明不越界

```ocaml
let rec loop a i acc =
  if i = Array.length a then acc
  else loop a (i + 1) (max acc a.(i))
```

**逐部分解释**：

- 用户在 qualifier 池里放 `v >= 0` 和 `v < len(?)`（`?` 是 placeholder，编译器替换成具体变量名）
- 编译器读到 `i + 1` 收集到约束：返回值 = `i + 1`，要求新 i 也保持下标合法
- Liquid Types 解出 `i : {v: int | 0 <= v && v < Array.length a}`
- 在 `a.(i)` 这一行编译器自动验证：i 满足下标约束，**不会**越界
- 整个过程没写一个手动 cast / assert / `if i < length`，全自动证明

### 案例 2：除以零编译时拦截

```ocaml
let safe_div x y = x / y
let bad = safe_div 10 0
let ok  = safe_div 10 (Random.int 100 + 1)
```

Liquid Types 给标准库 `/` 的分母赋类型 `{v: int | v != 0}`。

- 第二行 `safe_div 10 0`：编译器要证 `0 != 0`，失败 → **编译错**
- 第三行 `Random.int 100 + 1`：返回 1-100，编译器从 `Random.int` 的 refinement `{v: int | 0 <= v && v < 100}` 加 `+1`，推出 `>= 1`，蕴含 `!= 0` → 通过

数学库 / 金融库的边界场景这是黄金特性，把"运行时炸"的一类 bug 提到编译时。

### 案例 3：Liquid Haskell 保证列表有序

```haskell
{-@ type SortedList a = [a]<{\x y -> x <= y}> @-}
{-@ insertList :: Ord a => a -> SortedList a -> SortedList a @-}
insertList x [] = [x]
insertList x (y:ys)
  | x <= y    = x : y : ys
  | otherwise = y : insertList x ys
```

`{-@ ... @-}` 是 Liquid Haskell 的注解。`SortedList a` 类型说"任意相邻两元素满足 x <= y"。Liquid 引擎逐分支检查 `insertList` 真的维持有序：

- `[]` → 单元素列表平凡有序
- `x <= y` 分支 → 把 x 放最前，剩余原本就有序，自动通过
- `otherwise` 分支 → 递归 `insertList x ys` 仍是 SortedList，y 又 <= 它的头元素，组合成 SortedList

哪个分支没维持就编译时拒绝。这种"递归不变量"以前要在 Coq / Agda 里手写证明，现在 SMT 自动办。

## 踩过的坑

1. **qualifier 池子大小要拿捏**：太小，约束推不出（"我函数签名都标了为啥还报错"）；太大，SMT 越来越慢，实验里有的程序变 10×。
2. **表达能力局限于一阶逻辑 + 少量函数符号**：复杂数据结构不变量（红黑树黑高度平衡）超出 SMT 决断能力，要拆成手写引理。
3. **SMT timeout 不等于代码错**：Z3 是半判定的，超时**不是**反例。新人常被 "timeout: 1s" 误判成 bug。
4. **let-多态 + 副作用 + refinement** 三件套互相干扰：和 HM 老问题 value restriction 一样，引入 refinement 后规则更绕，多态变量+引用要慎。

## 适用 vs 不适用场景

**适用**：

- 数组下标 / 除零 / null 检查这种**算术 + 一阶**约束
- 数据结构不变量（sorted / non-empty / balanced 简单版）
- 资源使用边界（文件句柄状态、网络协议步骤）
- 需要"少手写 + 高保证"的工业代码

**不适用**：

- 复杂程序逻辑（涉及停机性、高阶递归不变量）→ 用 Coq / Agda 全 dependent type
- 高度多态库（HKT、复杂 typeclass 链）→ Liquid 推不动，要手写一堆精细注解
- 不熟 SMT 行为的团队 → 误报 / timeout 经常恐慌
- 完全动态语言（Python / JS）→ Liquid Types 必须建在静态类型之上

## 历史小故事（可跳过）

- **1991 年**：Freeman & Pfenning 提出 [[refinement-types-1991]]——给类型加"精细子集"概念，但要求程序员**手写**每个 refinement，工业不可落地。
- **2002 年**：Xi & Pfenning 的 Dependent ML 把 refinement 配上索引推导，往前推一步，但仍要重注解。
- **2006 年前后**：SMT 解器（Z3 / Yices）日渐成熟，软件验证社区（SLAM / BLAST）证明 SMT 能解大量真实程序约束，给"类型 × SMT"打地基。
- **2008 年**：Rondon-Kawaguchi-Jhala 在 PLDI 发表 Liquid Types——把 SMT 接进来，引入 qualifier 池子，**annotation 降到 < 1%**，工业可用门槛降低；配套工具 DSolve（OCaml 子集）发布。
- **2014 年**：Vazou-Jhala 的 Liquid Haskell 把这套搬到 Haskell 公开发行，社区开始大规模实验证明真实代码。
- **2022 年**：Lehmann et al. 的 Flux 把 Liquid Types 适配到 Rust，借助 Rust 所有权处理指针程序的精细约束。

## 学到什么

1. **不可判定问题，用"用户引导"切成可判定子集**——qualifier 池就是这个 trick 的代表，比"硬上 dependent type"务实得多
2. **类型系统 + SMT** 是过去 20 年 PL 工程化最重要的拼图之一，Liquid Types 是这个组合的范本
3. **refinement 让 type 从"分类标签"变成"运行时事实"**——`{v:int | v > 0}` 不再是抽象概念，而是真实的运行约束
4. **理论祖先 1991 → 工程实用 2008 → 工业 14 年扩散**，又一次"理论 → 算法 → 工程"三段式
5. **annotation burden 是 PL 工具能否被采用的真正瓶颈**——31% → 1% 的差别决定 Liquid 是否能进真实项目

## 延伸阅读

- 论文 PDF：[Rondon-Kawaguchi-Jhala 2008](https://goto.ucsd.edu/~rjhala/papers/liquid_types.pdf)（PLDI 2008，14 页）
- 教程站：[Liquid Haskell tutorial](https://ucsd-progsys.github.io/liquidhaskell/)（带可交互例子，看完能写真代码）
- 后续工作：[Flux: Liquid Types for Rust](https://arxiv.org/abs/2207.04034)（PLDI 2023，把 Liquid 套到 Rust 所有权）
- 综述视频：[Niki Vazou — Refinement Types](https://www.youtube.com/results?search_query=niki+vazou+refinement+types)（Liquid Haskell 主作者，多场会议讲座可选）
- [[refinement-types-1991]] —— 概念祖先，Liquid 是它的工程化版本
- [[hindley-milner]] —— Liquid Types 的"骨架"推导沿用 HM 的 algorithm W

## 关联

- [[refinement-types-1991]] —— Freeman-Pfenning 的开山论文，Liquid 是它的"自动化 + 工业化"续作
- [[hindley-milner]] —— Liquid 类型推导的算法骨架直接复用了 HM 的 W 风格约束生成
- [[hoare-logic]] —— refinement type 的谓词本质上是 Hoare 式前置/后置条件嵌进类型
- [[bidirectional-typing]] —— 同样的策略：把高难推导退化为局部可判定
- [[system-f-reynolds-1974]] —— 多态基础，Liquid 在 HM 多态上加 refinement 层
- [[lambda-calculus]] —— 推导对象仍是 λ-项，refinement 只是"加注解"
- [[standard-ml]] —— 第一个工业 HM 宿主，Liquid 早期实验也以 ML 为载体（DSolve）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biere-bmc-1999]] —— Bounded Model Checking — 把硬件验证翻译成一道 SAT 题
- [[clarke-cegar-2003]] —— CEGAR — 用反例自动改进抽象，让大软件能被验证
- [[dafny-2010]] —— Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明
- [[frama-c-2012]] —— Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[hacl-star-2017]] —— HACL* — 用数学证明过的 C 加密代码，跑在你 Firefox 和 Linux 内核里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[lacuna-program-holes]] —— LACUNA — 把 AI agent 的行动变成编译器先检查的程序洞
- [[sagiv-shape-analysis]] —— Sagiv 参数化形状分析 — 用三值逻辑证明链表树仍是链表树
- [[stainless-2017]] —— Stainless — 让编译器替你证明 Scala 函数真的满足规约
