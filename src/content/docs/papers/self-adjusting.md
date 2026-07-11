---
title: Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
来源: 'Acar, Blelloch & Harper, "Adaptive Functional Programming", POPL 2002'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Self-Adjusting Computation（自调整计算，常简称 SAC）是一种**让程序在输入小幅变化时自动只重算受影响子部分**的方法。日常类比：像一份 Excel 表格——你改了 B3，依赖 B3 的公式自动刷新，**没引用 B3 的那些格子静坐不动**。

你写一份普通的纯函数程序，加上 3 个原语：`mod`（声明一个会变的格子）/ `read`（读它）/ `write`（写它）。再加 2 个修改入口：`change`（改值）/ `propagate`（触发更新）。运行时建一张"谁读了谁"的依赖图；输入变化时只沿着这张图把受影响节点重算一次。

最早形态是 Acar、Blelloch、Harper 2002 年的 Adaptive Functional Programming 论文，2005 年 Acar 博士论文扩展为更通用的 SAC 框架。

短句概括：你写一份"和往常没两样"的代码，告诉系统**哪里会变**，剩下"输入小变 → 输出准、快、对"的事它包了。前端 reactive、IDE 增量、build 工具的"只重做受影响部分"，本质都是这个机制的不同套衣。

## 为什么重要

不理解它，下面这些都没法解释：

- 为什么改一个 React state，只有依赖它的 component 重渲染——而不是整个页面重画
- 为什么 rust-analyzer 改一行代码后类型推导几乎瞬时——它不是更快地全跑一遍，而是只跑变了的子集
- 为什么 Solid signal、Svelte 5 runes、Vue 3 ref、MobX observable 用法相似——它们都走「追踪依赖 → 只更新受影响部分」这条路
- 为什么 dbt 的 incremental model、增量构建工具的"只重编译变更文件"思路都能成立

## 核心要点

SAC 把"增量计算"拆成 **三块**：

1. **modifiable reference**：一个会变的值，但它**自己记得谁读过自己**。类比：图书馆的书后面贴一张借阅卡，谁借走过都登记在册——下次书的内容更新，按借阅卡逐个通知。

2. **dynamic dependence graph (DDG，动态依赖图)**：程序首次运行时，每个 `read` 都连一条"modifiable → 读者"的边，最终形成一张依赖 DAG。类比：摄影里的脚本表，谁负责拍哪场全部记录在档。

3. **change propagation**：`change` 改了某个 modifiable，再调 `propagate`，系统沿 DDG 找受影响的子树，按 trace 时间戳从早到晚重跑。类比：菜谱里把"鸡蛋"换成"豆腐"，从 step 5 重做，前面 1-4 步不动。

把这三块拼起来：纯函数 + 标记会变的输入 + 自动建图 + 时间戳排序的增量重算。论文还给了**形式化证明**：propagation 后的结果与从头重跑完全一致。文中的 modal type system（模态类型系统）是编译期规矩——像「危险区通行证」，保证你只在允许的地方读写 modifiable。

## 实践案例

### 案例 1：最小例子——`z = x + y`

```sml
val x = mod (fn () => 5)
val y = mod (fn () => 3)
val z = mod (fn () => read x (fn vx =>
                  read y (fn vy => write (vx + vy))))
(* 此时 z = 8 *)

change x 10           (* 把 x 改成 10 *)
propagate ()          (* z 自动变成 13 *)
```

逐部分解释：

- `mod (fn () => ...)` 创建一个 modifiable，初始值由函数体算出
- `read m (fn v => ...)` 读 m 并把后续动作打包成 continuation——**读者于是被登记到 m 的依赖列表**
- `change` 改值，但不会立刻触发；`propagate` 才真正执行重算
- 第二次只重算 `z` 内部的 `read x` 那段，`read y` 不动——因为 `y` 没变

### 案例 2：SolidJS 的"工程化 SAC"

```jsx
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)
createEffect(() => console.log(doubled()))
setCount(5)   // 只 doubled + effect 重算
```

`createSignal` 大致对应 `mod`，`createMemo` 是 `read + write` 链，`setCount` 是 `change + propagate`。**Solid 砍掉了论文的 modal type system（那套「通行证」规矩），改用运行时收集依赖**——工程上更轻，理论保证略弱。

### 案例 3：rust-analyzer 的增量编译

rust-analyzer 用 [Salsa](https://github.com/salsa-rs/salsa) 库把每个 query（parse / type check / name resolve）做成 SAC 的 modifiable。源文件改一行：受影响 query 的依赖子图重跑，**未受影响的 query 命中缓存**。

```rust
#[salsa::query_group(CompilerDb)]
trait Compiler: salsa::Database {
    #[salsa::input] fn source(&self, file: FileId) -> String;
    fn ast(&self, file: FileId) -> Arc<Ast>;
    fn types(&self, file: FileId) -> Arc<TypeMap>;
}
```

`#[salsa::input]` 标的就是 modifiable，普通 query 是 `read + write` 链。这就是 IDE "改完立刻有反应"的根本原因。

## 踩过的坑

1. **必须纯函数式**：副作用会破坏 propagation 语义保证；混进 print / 网络 IO 后增量结果可能与重跑不一致。
2. **trace tree 越长越大**：长寿计算要么周期性重建，要么显式 GC，否则内存膨胀几倍——论文 implementation 段没量化这个开销。
3. **modal type system 工程上几乎没人用**：Solid / Svelte / Salsa / Vue 全部改用运行时检查 + 约定，论文形式化的核心贡献在工业里是被绕过的。
4. **复杂度只是期望情况**：论文的 quicksort O(log n) 调整复杂度是 expected case；最差仍可能 O(n) 全重算，并发 / 多线程下 propagation 正确性也没保证。
5. **AFP 原版没有 memoization**：要 2005 博士论文加 memoization 才能复用未变 sub-trace，POPL 2002 版本读完容易误以为已经完整——其实只追踪依赖、不缓存中间结果。

## 适用 vs 不适用场景

**适用**：
- 输入"长得很像、只改了一点"的反复重算（前端 state、IDE 增量分析、dbt incremental、增量构建）
- 计算图清晰、依赖能被静态/动态追踪的纯函数管线
- 中等规模（千到百万节点）的依赖图——超大可能要分片

**不适用**：
- 一次性计算 / batch 任务：trace tree 的开销 > 重算节省
- 高度副作用密集的程序（IO / 全局状态）——SAC 的语义保证不成立
- 实时硬延迟场景：propagation 仍是同步遍历，最坏情况延迟不可控
- 需要并行 / GPU 加速：原版 SAC 假设单线程，并发版本仍是开放问题

## 历史小故事（可跳过）

- **1989** Pugh 提出 function caching：缓存函数调用结果。但要求整个 input 等价才能命中——粒度太粗。
- **1991** Yellin & Strom 的 INC 系统：用户**手动**写依赖图。表达力受限，递归 / 高阶函数支持差。
- **1997** Elliott & Hudak 的 FRAN：Functional Reactive Programming，关注连续时间流——另一条路线。
- **2002** Acar 等三人 POPL 论文 Adaptive Functional Programming：modifiable + 自动建图 + 形式化证明，第一次把"增量计算"立成一门可证明正确的方法。
- **2005** Acar 博士论文：扩展为 Self-Adjusting Computation 框架，加 memoization 复用未变 sub-trace，统一了增量计算的术语。
- **2014** Hammer 等人的 Adapton (PLDI)：用 demanded computation graph 替掉 trace tree，简化为按需重算——更贴近工程现实。
- **2018-2024** 工程化下沉到日常工具：Salsa 进 rust-analyzer，SolidJS 1.0、Svelte 5 Runes、Vue 3 ref 把同一思想推到 Web 前端千万级开发者面前。

## 学到什么

- "只重算变了的部分" 是个非常普适的工程原则——前端、编译器、构建、数据 pipeline 都受益
- 一个**最小原语集合**（mod / read / write + change / propagate）就能撑起一整片技术栈，比起堆 API 更值得追求
- **形式化证明在工业里常被改写成约定**：Solid / Svelte 砍掉 modal type system 不影响商业落地，但理论根仍在
- 类似"占位 + 收集证据 + 重算"的三段式，与 [[hindley-milner]] 的"占位 + 收集 + 泛化"在思路上同源
- 学一个原始论文胜过学十个工程库——读懂 SAC，再看 Solid / Svelte / Salsa 都像同一题的不同写法

## 延伸阅读

- 论文 PDF：[Adaptive Functional Programming, POPL 2002](https://www.cs.cmu.edu/~rwh/papers/afp/popl02.pdf)（12 页，结构紧凑）
- Acar 博士论文 [Self-Adjusting Computation, CMU 2005](https://www.cs.cmu.edu/~guyb/papers/Acar05.pdf)（完整框架，含 memoization 扩展）
- 工程化实现：[salsa-rs/salsa](https://github.com/salsa-rs/salsa)（rust-analyzer 内核，Rust 实现 SAC）
- 视频：[Niko Matsakis on Salsa, RustConf 2019](https://www.youtube.com/watch?v=_muY4HjSqVw)（90 分钟，从 SAC 讲到 IDE 增量分析）
- [[adapton]] —— 2014 简化版 SAC，DCG 替代 trace tree
- [[push-pull-frp]] —— 同期 reactive 派系，对比阅读看两条路线的合流

## 关联

- [[adapton]] —— SAC 的简化工程化继任者，砍掉 modal type system
- [[salsa-adapton]] —— Salsa + Adapton 的工程实现，rust-analyzer 在用
- [[push-pull-frp]] —— Reactive Programming 另一条理论路线，与 SAC 在现代框架里融合
- [[hindley-milner]] —— 同样是"自动推导 + 形式化证明"的程序语言里程碑
- [[lambda-calculus]] —— SAC 的形式化建立在纯 λ 演算之上
- [[standard-ml]] —— 论文原型实现的宿主语言
- [[solid]] —— 前端最像 SAC 的工程化代表
- [[svelte]] —— Svelte 5 Runes 在编译期插入依赖追踪，细粒度更新（仍有轻量 signal 运行时）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[salsa-adapton]] —— Salsa / Adapton — 让程序只重算"真的变了"的那一小块
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[lexical]] —— Lexical — 把富文本编辑拆成快照、事务和插件
- [[pluto-jl]] —— Pluto.jl — Julia 反应式笔记本
