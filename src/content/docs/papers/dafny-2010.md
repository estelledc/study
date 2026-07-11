---
title: Dafny — 把"代码该满足的条件"直接写进语法，编译器自动证明
来源: 'Leino, "Dafny: An Automatic Program Verifier for Functional Correctness", LPAR-16, LNCS 6355, Springer 2010'
日期: 2026-05-31
分类: 形式化方法
难度: 中级
---

## 是什么

Dafny 是一门**自带"自动证明器"的编程语言**。日常类比：像一份合同写在代码里——你给方法标注"调用前必须满足 X""返回时一定满足 Y""循环里始终保持 Z"，编译器读完就替你证：写的实现确实把合同履行了。

你写：

```dafny
method Abs(x: int) returns (y: int)
  ensures y >= 0
  ensures y == x || y == -x
{
  if x < 0 { y := -x; } else { y := x; }
}
```

`ensures` 后面那两行是后置条件——返回值必须非负，且要么等于 x 要么等于 −x。Dafny 编译时把整段方法翻成数学命题，丢给 SMT 求解器 Z3 自动判断"实现是否兑现合同"。**不需要你写任何证明步骤**，过了就过了。

这门语言由 Microsoft Research 的 Leino 在 2008 年启动，2010 年 LPAR 论文奠定核心。今天 AWS 用它验加密协议、ETH Zürich 用它教学、Yale 用它讲形式化方法课。

## 为什么重要

不理解 Dafny，下面这些事都没法解释：

- 为什么 AWS 敢用 Dafny 验 s2n-tls 这种加密协议——程序员只要写出不变量，编译器替你确认实现没漏洞
- 为什么 Microsoft IronFleet 项目能证明 1.6 万行分布式协议代码"完全正确"——Dafny 是主力工具
- 为什么 [[boogie-2005]] 论文 5 年后才真正爆发——Boogie 是后端，Dafny 是让普通工程师能用上的前端
- 为什么"自动验证"和"交互式证明"是两条路——Dafny 走自动化，Coq/Lean 走交互式，能力和门槛都在另一端

## 核心要点

Dafny 的设计可以拆成 **四个层次**：

1. **契约直接写在签名里**。`requires`（前置条件）/ `ensures`（后置条件）/ `invariant`（循环不变量）/ `decreases`（终止性度量）——这四个关键词覆盖 [[hoare-logic]] 的全部基本素材。
2. **编译到 Boogie 再到 Z3**。Dafny 不直接面对 SMT，它先翻成 [[boogie-2005]] 的中间语言，由 Boogie 算 weakest precondition，再交 [[z3-2008]] 判定。一次翻译，证明基础设施全套复用。
3. **method vs function 分两套**。`method` 是命令式（有副作用、可改堆），证明的是"实现履行契约"；`function` 是纯函数，可以在规范里直接调用。两者职责清晰。
4. **ghost 变量与动态 frame**。证明用的辅助变量标 `ghost`，编译时整段擦除——运行时零开销；`modifies` 子句声明方法能改哪片堆区域，避免方法间互相破坏不变量。

第四点尤其关键：早期验证工具卡在"这个方法到底改了什么"上没法 modular 验证，Dafny 用 dynamic frames 把"能改的范围"显式上墙。

## 实践案例

### 案例 1：循环 + 不变量

求数组最大值，写法是这样：

```dafny
method Max(a: array<int>) returns (m: int)
  requires a.Length > 0
  ensures forall i :: 0 <= i < a.Length ==> m >= a[i]
  ensures exists i :: 0 <= i < a.Length && m == a[i]
{
  m := a[0];
  var k := 1;
  while k < a.Length
    invariant 1 <= k <= a.Length
    invariant forall i :: 0 <= i < k ==> m >= a[i]
    invariant exists i :: 0 <= i < k && m == a[i]
  {
    if a[k] > m { m := a[k]; }
    k := k + 1;
  }
}
```

后置条件说"m 大于等于所有元素，且 m 出现在数组里"。循环不变量是"到目前为止 m 是前 k 个元素的最大值"。Dafny 自动验：进入循环时不变量成立 + 每轮迭代保持 + 循环退出后蕴含后置——三段式过关。

### 案例 2：终止性证明

```dafny
function Fact(n: nat): nat
  decreases n
{
  if n == 0 then 1 else n * Fact(n - 1)
}
```

`decreases n` 告诉 Dafny："每次递归 n 都在变小且有下界"，所以一定停。如果你写错成 `Fact(n + 1)`，编译器立刻报错——它不会陷入死循环，它在编译期就拦下来了。

### 案例 3：ghost 变量记录抽象状态

想证"往集合里加元素后，抽象内容变大了"，可引入 ghost 序列当证明用的影子账本：

```dafny
class Bag {
  ghost var contents: seq<int>
  method Add(x: int)
    modifies this
    ensures contents == old(contents) + [x]
  {
    // 1) 真实字段怎么改省略；2) ghost 同步记账；3) ensures 对照 old
    contents := contents + [x];
  }
}
```

逐步看：`ghost var` 只存在于证明世界；`old(contents)` 是调用前快照；运行时 ghost 整段擦除，Z3 却靠它抓住"抽象状态怎么变"。

## 踩过的坑

1. **不变量要程序员写出来**。Dafny 不是"全自动证一切"，太弱证不出后置、太强自己保持不住——写对了几秒过，写歪了 Z3 超时。
2. **Z3 时间不稳定**。同一份代码今天 2 秒、明天 30 秒；少用乘法、多用 `seq`、断言切小步更稳。
3. **错误反例难读**。Z3 给的是赋值表（x = 7, a = [3, 1, ...]），看不出"哪条不变量第一次没成立"。
4. **frame 条件容易漏**。`modifies this.x` 却改了 `this.y` 会被拒；验证器要的是显式声明，不是"相邻字段也算"。

## 适用 vs 不适用场景

**适用**：

- 算法 / 协议核心的功能正确性证明（排序、加密、共识算法骨架）
- 数据结构不变量（红黑树平衡、链表无环、堆有序）
- 教学：形式化方法入门首选——比 Coq 门槛低 10 倍
- 库的关键路径：AWS 用它验 s2n、加密 SDK 子模块

**不适用**：

- 大规模并发 / 分布式直接建模（用 [[tla-yu-tlc-1999]] 更合适）
- 需要交互式 / 高阶证明（用 Coq / Lean / [[isabelle-hol-2002]]）
- 性能 / 时序属性（Dafny 验功能正确性，不验"X 毫秒内返回"）
- 既有大型 C / Java 代码库的事后验证（Dafny 是新写代码的工具，不太适合 retrofitting）

## 历史小故事（可跳过）

- **2004-2008 年**：Leino 在 Microsoft Research 主导 Spec#（C# 加契约）。能用，但 C# 包袱重，验证体验拖累。
- **2008 年**：Leino 启动 Dafny，目标是"重新设计一门为验证而生的语言"，不背 C# 兼容包袱。
- **2010 年**：LPAR 论文发表，奠定核心语法。
- **2014 年**：IronFleet 项目用 Dafny 证明 1.6 万行分布式协议代码（Paxos + 状态复制）完全正确——形式化方法工业落地的里程碑之一。
- **2018 年**：Leino 离开 Microsoft 加入 AWS Automated Reasoning 团队，Dafny 重心从研究转向工业。
- **2016 年起**：dafny-lang/dafny 在 GitHub 公开演进，逐步脱离"微软内部工具"印象。
- **2024 年**：Dafny 4 系列加 trait、模块改进、并发支持。

## 学到什么

1. **"契约即语法"是 1969 [[hoare-logic]] 的工程化兑现**——Hoare 写下三元组的 41 年后，普通程序员第一次能用键盘敲出 `requires` / `ensures` 让机器替自己证。
2. **分层抽象的红利持续 20 年**：[[boogie-2005]] 是中间层，Dafny 是前端，[[z3-2008]] 是后端——每一层可独立替换，每一层都被多个项目复用。
3. **自动化 vs 表达力 trade-off**：Dafny 选了"工程师能学会、Z3 算得动"的中间点。再往上是 [[fstar]]（依赖类型）/ Coq（交互式），表达力强但门槛飞涨。
4. **错误反例的可读性是工业落地的真正壁垒**——理论上 Dafny 完备，实务中"读不懂反例"挡住一半新人。这个洞至今未补完。

## 延伸阅读

- 在线教程：[Dafny Reference Manual](https://dafny.org/dafny/DafnyRef/DafnyRef)（官方手册，分章节有可运行示例）
- 互动入门：[Rise4Fun Dafny](https://rise4fun.com/Dafny/tutorial)（浏览器里直接写 Dafny 代码自动验证，零安装）
- 工业案例：[IronFleet 论文](https://www.microsoft.com/en-us/research/publication/ironfleet-proving-practical-distributed-systems-correct/)（用 Dafny 证 1.6 万行分布式协议）
- 视频：Leino 在多个会议讲过 Dafny 设计哲学，B 站搜 "Dafny Leino" 有中字版
- [[boogie-2005]] —— Dafny 的中间层后端
- [[z3-2008]] —— Boogie 之下的 SMT 求解器
- [[hoare-logic]] —— Dafny 的契约语法直接对应 Hoare 三元组
- [[fstar]] —— 同样思路但加依赖类型，能力更强
- [[liquid-types]] —— 把"refinement"塞进类型系统的另一条路

## 关联

- [[hoare-logic]] —— 提供前后置条件 + 不变量的逻辑基础
- [[boogie-2005]] —— Dafny 翻译的目标中间语言
- [[z3-2008]] —— Boogie 调用的 SMT 求解器后端
- [[fstar]] —— 平行项目，同源团队，路线更激进
- [[liquid-types]] —— 把验证嵌进类型系统的另一种风格
- [[tla-yu-tlc-1999]] —— 验"协议状态机"的另一条路，互补不冲突

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boogie-2005]] —— Boogie — 写一次验证后端，多种证明语言复用
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hyperkernel-2017]] —— Hyperkernel — 让 SMT 求解器一键验证操作系统内核
- [[ironfleet-2015]] —— IronFleet — 把分布式协议证到一行 bug 都没有
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对
- [[verus-specgym]] —— Verus-SpecGym — 让机器检查规格是不是写对了
