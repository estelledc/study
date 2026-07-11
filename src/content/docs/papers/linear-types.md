---
title: 线性类型（Linear Types）
来源: 'Wadler, "Linear Types Can Change the World!", IFIP 1990'
日期: 2026-05-29
分类: 编程语言 / 类型理论
难度: 中级
---

## 是什么

线性类型（**linear types**）是一种规则：每个值**必须用恰好一次**——不能复制、不能丢弃、不能用两遍。

日常类比：**博物馆借展品**。你拿到一幅画，必须**还回去**（不能用 0 次直接弄丢），不能**复印一份留着**（不能用 ≥ 2 次），借了就**亲手归还**一次，事就完了。

写法上类比：

```rust
let s: String = String::from("hello");
let t = s;             // s 的所有权 move 给 t，s 失效
println!("{}", s);     // 编译错误：s 已被 move
```

Rust 这段编译不过——`String` 实际是**仿射**（至多用一次，不用就自动 drop），不是严格线性；但"不能用两遍"的体感，正是线性类型思想的工程版。

## 为什么重要

不理解线性类型，下面这些事都没法解释：

- 为什么 Rust 写得磨人但**很难写出 use-after-free / data race**（泄漏仍可能，如 `Rc` 环）——核心是"每个值至多用一次"
- 为什么 Haskell 9.0 之后多了一种箭头 `a %1 -> b`——纯函数式语言也开始管理资源
- 为什么文件 / 网络连接 / GPU buffer 用完不释放是 bug 主因——线性类型把这种错误变成**编译期错误**
- 为什么量子计算需要类型系统帮忙——qubit 物理上不能克隆（no-cloning theorem），天然是线性

一句话：**线性类型把"释放/重用"问题从运行时（GC / 程序员脑子里）搬到编译期**。

## 核心要点

### 三种使用纪律

| 纪律 | 用几次 | 代表语言 |
|------|--------|----------|
| **线性**（linear）  | 恰好 1 次 | Linear Haskell（GHC 9+）/ Idris 2 |
| **仿射**（affine）  | 至多 1 次（0 也行） | Rust |
| **普通**（unrestricted） | 任意次 | Java / Python / OCaml |

线性最严，普通最松。Rust 选了**中间档**——为什么？因为 Rust 觉得"用 0 次就让它自动 drop（析构）"更工程友好，不必逼程序员每个变量都手动消费一次。

### 一次性使用 ≈ 资源安全

文件、连接、锁、GPU buffer——这些资源用完必须释放。普通类型系统管不住"忘了 close"。

线性类型让 `close(f)` 变成**消费 f 的操作**——你只能 close 一次，且不能 close 之后再读。编译器在你按下保存键时就告诉你写错了。

### 与所有权 / 借用 / GC / RAII 的关系

- **GC**（Java）：runtime 兜底，简单但不可控
- **RAII**（C++）：靠析构函数 + 程序员小心
- **线性 / 仿射类型**（Rust）：编译期强制——type checker 通过 = 资源安全

Rust 的 ownership 就是线性类型的**工程化**——把 1990 年的纯数学规则变成 2015 年能写浏览器引擎的语言。

## 实践案例

### 案例 1：Rust 的"value moved here"

```rust
let s = String::from("hello");
let t = s;             // s 的所有权 move 到 t
println!("{}", s);     // 报错：borrow of moved value: `s`
```

编译器内部做的事：

1. 给 s 标记线性——只能用一次
2. `let t = s` 算"消费"——s 从环境里删除
3. `println!("{}", s)` 想再用 s——找不到了，报错

这就是 Wadler 1990 的"context split"规则的工程实现。

### 案例 2：Haskell 的线性箭头

```haskell
-- 普通函数：x 可以用任意次
f :: Int -> Int
f x = x + x

-- 线性函数：x 必须恰好用一次
g :: Int %1 -> Int
g x = x + 1            -- OK，x 用了一次
-- g x = x + x         -- 编译错：x 用了 2 次
```

`%1 ->` 这个怪箭头是 GHC 9.0 加的，**直接复刻 Wadler 1990 的 ⊸ 记号**。30 年后回家了。

### 案例 3：把"文件必须 close"变成编译错误

伪代码（Rust 风格）：

```rust
fn read_log(f: File) -> String { ... }   // 接收 f 的所有权

let f = File::open("log.txt")?;
let s = read_log(f);     // f 被 move 进去
let s2 = read_log(f);    // 报错：f 已 moved
// 函数返回时 f 自动析构（drop = close 文件）
```

普通语言里"忘了 close"是运行时 bug；线性类型让它变成"想 close 两次也不行 / 不 close 就没人接手"——**写错了在编译期就停**。

## 踩过的坑

1. **strict linear（恰好 1 次）在工程上很烦**：写 `λx. λy. x`（K 组合子，丢弃 y）在纯线性下报错——"y 没被使用"。Rust 选 affine 就是为了允许这种场景，由 drop 自动收尾。

2. **借用（borrow）是 Wadler 1990 没有的**：纯线性下"读一下不消费"非常难表达。Rust 用 `&T` / `&mut T` 解决——这是 Niko Matsakis 2010-2015 加的，**不在 Wadler 1990 论文里**。

3. **早 return / panic 让 strict linear 崩**：`if cond { return; } use(x);`——早 return 路径上 x 没用，纯线性会报错。Rust affine 自动 drop 不报错。

4. **嵌套结构的部分更新没解决**：record 里改一个字段，其他字段算"被消费"了吗？Wadler 1990 例子全是 flat array；现实代码里 partial borrow 是巨大工程难题（Rust 借了 10 年才搞稳）。

5. **Linear Haskell 的 `Ur a` 包装很烦**：要把"普通可重用值"塞进线性世界，得显式包成 `Ur a`，写起来啰嗦——这是论文形式优雅但工程不优雅的典型表现。

## 适用 vs 不适用场景

**适用**：

- 系统编程（OS / 数据库 / 浏览器引擎 / 嵌入式）—— Rust 的主战场
- 资源密集型（文件 / socket / GPU / 锁）—— 编译期堵住忘记释放
- 高吞吐 actor 系统（Pony 的 reference capabilities）
- 量子计算 DSL（qubit 物理不可克隆，天然线性）

**不适用**：

- 通用 CRUD 应用 —— 线性类型的认知开销不值得，GC 语言更省心
- 图 / 树 with backreference —— 循环引用难表达，GC 兜底更自然
- 小脚本 / 数据分析 / Notebook —— Python 一行写完
- GUI 事件回调 —— 高动态对象生命周期，线性反而绊脚

## 历史小故事（可跳过）

- **1987 年**：法国数学家 Girard 在线性逻辑（Linear Logic）里提出 `⊸` 和 `!` 两个新符号——把"用几次"加进逻辑学。纯数学，没人能用来写代码。
- **1990 年**：Wadler 在以色列加利利海开 IFIP 工作会议，发表 *Linear Types Can Change the World!*——**第一次把 Girard 的逻辑翻译成可工程化的 type system**。论文 17 页，给了 5 条推导规则 + array update 例子。
- **1995 年**：荷兰 Clean 语言全面采用"唯一性类型"（uniqueness types），是 linear types 的第一个产业版本。但 Clean 太小众，没出圈。
- **2010 年代**：Mozilla 工程师 Graydon Hoare 设计 Rust，**没直接引用 Wadler 1990 那篇论文**——但概念同源。Rust 选 affine（≤1）+ borrow + lifetime，工程上比纯线性好用得多。
- **2015 年**：Rust 1.0 发布，affine 类型 + 借用检查器进入主流视野。
- **2018–2021 年**：Linear Haskell 提案约 2018，随 **GHC 9.0（2021）** 落地，纯线性回到 Haskell——工程上比 Rust 难用，至今 niche。
- **2020 年**：Idris 2 用 quantitative type theory（0 / 1 / ω 三态多重性）—— Wadler 二元划分的精细化版本。

理论 → 工程兑现的时差：**Wadler 1990 → Rust 1.0 是 25 年**。

## 学到什么

1. **资源管理可以是类型问题**——不一定是 runtime 问题（GC）或程序员问题（C 的 free）。这是过去 40 年最大洞见之一。
2. **线性 / 仿射 / 普通三种纪律**对应不同工程取舍：理论纯洁性 vs 工程可用性。Rust 选 affine 不是因为 Wadler 错了，是工程现实的妥协。
3. **形式优雅 ≠ 工程优雅**：5 条干净的推导规则到能用的 type checker 之间隔着 10 年的"错误信息体验"打磨。
4. **理论与工程的 25 年时差是常态**——HM 1969→1980s、线性类型 1990→2015、effect handlers 2009→今天还在路上。理论早投资 25 年，到工程兑现时收益巨大。

## 延伸阅读

- 视频教程：[Niko Matsakis — Rust Borrow Checker（演讲）](https://www.youtube.com/watch?v=lO1z-7cuRYI)（Rust 设计者讲 affine + borrow 怎么落地）
- 论文 17 页 PDF：[Wadler 1990 linear.pdf](https://homepages.inf.ed.ac.uk/wadler/papers/linear/linear.pdf)（Wadler 主页直接发，密度高，要慢读）
- Linear Haskell 入门：[tweag/linear-base GitHub](https://github.com/tweag/linear-base)（GHC 9 的标准库实践）
- Rust Book — Ownership 章节：[doc.rust-lang.org/book/ch04](https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html)（工程视角入门，零理论包袱）

## 关联

- [[hindley-milner]] —— 类型推导的另一支主线；HM 推类型，线性类型管使用次数，组合起来是现代 Rust / Haskell 的根基
- [[lambda-calculus]] —— 线性类型给 λ-演算项加上"用几次"的标签
- [[bidirectional-typing]] —— 现代 Rust / Idris 2 的类型检查算法基础，与线性纪律协同
- [[tofte-talpin-regions]] —— 区域内存管理，lifetime 的另一支祖先；与线性类型互补处理资源生命周期
- [[boehm-gc]] —— GC 派代表；线性类型的"对手阵营"，1990 年代主流方案
- [[effect-handlers]] —— 另一种把"副作用"提到类型层的思路，与线性类型同思想血缘

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bidirectional-typing]] —— 双向类型检查 — 推断和检查两个方向交替前进
- [[boehm-gc]] —— Boehm-Weiser 保守式垃圾回收 — 不改编译器也能给 C 加 GC
- [[calculus-of-constructions]] —— Calculus of Constructions — 让程序和数学证明共用一种语言
- [[coeffect-petricek]] —— Coeffects — 让类型系统追踪「需要多少上下文」
- [[effect-handlers]] —— 代数效应（Algebraic Effects）
- [[gadt-pjones]] —— GADT — 让构造子告诉编译器"我返回的是更精确的类型"
- [[game-semantics-pcf]] —— 博弈论语义与 PCF — 把程序解释成两个人轮流下的对话棋
- [[gradual-typing]] —— 渐进类型 — 让动态和静态类型在同一份代码里共存
- [[granule]] —— Granule — 让类型系统同时数次数、看安全级、追副作用
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[iris-2015]] —— Iris 2015 — 把并发推理拆成 monoid + invariant 两块积木
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[martin-lof-itt]] —— Martin-Löf 直觉主义类型论 — 让"证明"和"程序"变成同一件事
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[move-language]] —— Move — 资源型智能合约语言
- [[reynolds-separation-logic]] —— Separation Logic — 把 Hoare 逻辑扩到带指针的程序
- [[system-f-reynolds-1974]] —— System F — 让类型也能像参数一样被传递
- [[tofte-talpin-regions]] —— Tofte-Talpin Regions — 让类型系统替你管内存生命周期

