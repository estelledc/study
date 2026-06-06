---
title: Vellvm — 在 Coq 里给 LLVM IR 写一份机器证明的语义
来源: 'Zhao, Nagarakatte, Martin, Zdancewic, "Formalizing the LLVM Intermediate Representation for Verified Program Transformations", POPL 2012'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 高级
provenance: pipeline-v3
---

## 是什么

**Vellvm**（Verified LLVM）是一份**用 Coq 证明助手把 LLVM IR 的语义钉死下来**的工作。日常类比：LLVM 的官方文档像一本翻译给人看的菜谱（"加适量盐"），不同厨师可能做出不同味道；Vellvm 把菜谱重写成**克数 + 温度 + 时间**的精确公式，机器照着做绝不走样。

LLVM IR 是 Clang、Rust、Swift 共同的"中间语言"。原本它的语义只散落在英文 LangRef 文档里，Vellvm 把每条指令、每个 pass（优化步骤）的输入输出关系**写成 Coq 里的数学定义**。一旦写成数学，就能用证明助手验证："这个优化前后程序意思**完全一样**"。

论文同时给出三种等价的语义（小步、大步、抽象机），并完整证明了 LLVM 主力优化 **mem2reg**（把栈变量提升成寄存器）保持语义。

## 为什么重要

不理解 Vellvm，下面这些事都没法解释：

- 为什么 LLVM 优化每隔几个月就有一次"miscompile"（编错了改了原义）的 bug 报告——文档语义不够精确
- 为什么 CompCert（验证 C 编译器）名气很大，但工业界还要做 Vellvm——它专攻 LLVM 这一公共底座
- 为什么"undefined behavior"（未定义行为）是 LLVM 优化最头疼的话题——形式化前没人能精确说它到底意味着什么
- 为什么形式化方法走出学术圈这么慢——Coq 证明体量大，跟 IR 升级速度匹配不上
- 为什么 LLVM 文档每隔几年就要一次大刷新——形式化研究持续往回喂"哪里写得不够紧"

## 核心要点

Vellvm 的工作可以拆成 **三层**：

1. **三种等价语义**：把 LLVM IR 同时写成"小步"（每条指令是一步）、"大步"（整段函数算结果）、"抽象机"（带显式栈和寄存器）三种风格，再机器证明三者等价。类比：同一道菜用文字、视频、流程图三种方式描述，再证明三份描述讲的是一道菜。

2. **SSA 主导分析框架**：LLVM IR 用 SSA（静态单赋值），phi 节点把控制流汇合处的变量"选出"正确版本。Vellvm 把 SSA 的支配关系（dominator）和 phi 求值规则全在 Coq 里定义，让任何 SSA 上的优化都可以共用这套基础设施。

3. **mem2reg 完整验证**：作为示范，把"栈变量提升到寄存器"这个最常用的 LLVM pass 整体证明语义保持。这个 pass 涉及到 alloca / load / store 改写成 phi，是 SSA 优化的入门难度题，但完整证明仍要数千行 Coq。

合起来：**给工业 IR 一套数学外衣，让 pass 的正确性从"测试通过"升级到"机器证明"**。

## 实践案例

### 案例 1：mem2reg 把栈变量提升成寄存器

mem2reg 是 LLVM 默认开启的入门优化。LLVM 前端通常把局部变量先放栈上，再让优化器提升到寄存器：

```llvm
; 提升前
%x = alloca i32
store i32 5, i32* %x
%v = load i32, i32* %x
ret i32 %v

; mem2reg 提升后
ret i32 5
```

Vellvm 在 Coq 里证明：**对任何起始内存状态，提升前和提升后的程序对外可观察行为完全相同**。这个证明涉及内存模型、SSA 支配关系、phi 节点的语义，整体几千行。日常用 LLVM 你看不见，但每次 -O1 都靠这种 pass 起飞。

### 案例 2：undef 不是随机数

LLVM IR 有个特殊值 `undef`，用来表达"读未初始化变量"。文档说"编译器可以替换成任何值"，但**到底什么时候能替换**长期模糊：

```llvm
%x = add i32 undef, 1   ; %x 是不是也 undef？
%y = and i32 %x, 0      ; %y 必是 0 还是也 undef？
```

Vellvm 把 undef 形式化为"非确定性求值"——每次读取都可能返回任意值，但**类型必须对**。这一精确化，让"undef 安全消除"的优化可以被证明，也暴露了 LLVM 文档原本含糊之处。

### 案例 3：写新优化前先做语义保持引理

假设你想加一个常量折叠优化（compile-time 把 `add i32 2, 3` 折成 `5`）。在 Vellvm 上的标准流程：

1. 在 Coq 里定义你的 transform 函数（IR → IR）
2. 写一个引理 `forall p, observable(p) = observable(transform(p))`
3. 用 Vellvm 已有的指令语义、内存模型证明
4. Coq 通过后，再生成 LLVM C++ 实现

如果 step 2-3 失败，说明 transform 有 bug——**在写 C++ 代码前已被拦下**。这个流程的代价是慢，收益是**确定性**：上线后再也不需要回头查"是不是优化把代码改坏了"。

## 踩过的坑

1. **undef 与未定义行为是噩梦**：既要让编译器能用 undef 做激进优化，又不能破坏类型安全。Vellvm 用非确定性把它讲清楚，但代价是后续每个证明都要处理"任意值"分支。

2. **SSA 不是凭直觉那么简单**：phi 节点在控制流汇合处的求值次序、变量在哪里被支配，这些都得机器证明，**不能用"感觉对"绕过**。

3. **内存模型抽象层选不准**：太底层（每个 byte 是 8 个 bit）证明繁琐到爆；太高层（int32 是不可分原子）又对不上 LLVM 的 GEP / bitcast 实际语义。Vellvm 选了 byte 级，付出工程代价。

4. **Coq 证明跟不上 LLVM 升级速度**：LLVM 每半年加新指令、改 IR，Vellvm 主力是 PhD 学生，维护赶不上。这是形式化进入工业的根本张力。

5. **小步 / 大步 / 抽象机三套语义都得维护**：等价性证明完一次就稳定，但**新增指令**要把三套都补一遍，否则等价性会破掉。

## 适用 vs 不适用场景

**适用**：

- 编译器研究——验证某个新 pass 不破坏语义
- 工具链审计——给安全敏感（密码学 / 内核）的代码做"编译没改原义"证明
- 教学——展示形式化语义如何应用到真实工业 IR
- 启发后续工作——Vellvm2 / Velliris 把它扩展到并发和外部调用
- IR 设计评审——新增指令前用 Vellvm 检查能否被语义化表达

**不适用**：

- 给现有 LLVM 优化 pass 做日常 bug fix——证明体量太大，不匹配工业节奏
- 应付 LLVM 最前沿改动——Vellvm 落后主线 1-2 年
- 只想"让代码跑得快"——形式化不是性能工具
- 没 Coq 经验的工程团队——上手成本极高，需要数月学习
- 动态语言（Python / JS）——LLVM IR 是静态类型 IR，Vellvm 的工具不直接适用

## 历史小故事（可跳过）

- **2002 年**：Chris Lattner 在 UIUC 启动 LLVM 项目，几年后成长为 Clang / Rust / Swift 共同的中后端，但 IR 语义只写在 LangRef 文档里。
- **2006 年**：Xavier Leroy 发布 CompCert，证明了一整条 C → 汇编的编译器，是首个工业级形式化编译器。但它从源语言出发，绕开了 LLVM IR。
- **2012 年**：宾州大学的 Zhao、Nagarakatte、Martin、Zdancewic 把焦点放在 LLVM IR 自身，发表 Vellvm 论文，给 LLVM IR 第一份机器证明的语义。
- **2013-2018 年**：Vellvm 衍生出 SoftBound（运行时边界检查证明）、面向并发的扩展，开始触及 C++ 内存模型。
- **2021 年**：Vellvm2 / Velliris 升级到支持非确定性、对齐内存、外部调用，更贴近真实 LLVM。
- **至今**：LLVM 主线没有合并 Vellvm，但每次大改 IR 文档前会被研究者拉来对照——形式化已经成为 IR 设计的"二级评审"。

## 学到什么

1. **工业 IR 也能形式化**——不是只有玩具语言才配数学定义；只要肯写，工业 IR 同样可以
2. **三种等价语义是技巧**——同一对象的多种写法互相印证，证明负担可以分摊
3. **形式化暴露文档隐藏歧义**——一旦想机器证明，文档里所有"含糊"都会立刻浮出水面
4. **覆盖率 vs 维护成本是真实张力**——Vellvm 没追平 LLVM 主线不是失败，是工程 + 理论必然的代价
5. **数学是 LLVM 的"二级评审"**——形式化研究虽然慢，却倒逼主线设计更精确

## 延伸阅读

- 项目主页：[Vellvm at UPenn](https://www.cis.upenn.edu/~stevez/vellvm/)（论文 + Coq 源码 + 后续衍生工作的入口）
- 视频教程：[Steve Zdancewic — Verified Compilers](https://www.youtube.com/results?search_query=zdancewic+vellvm)（作者本人讲座，从 mem2reg 切入）
- 论文 PDF：[Zhao et al. POPL 2012](https://www.cis.upenn.edu/~stevez/papers/ZNMZ12.pdf)（密度极高，建议先看 §2 mem2reg 例子）
- LLVM 文档：[LLVM Language Reference](https://llvm.org/docs/LangRef.html)（被 Vellvm 形式化的对象本身，对照读最有感觉）
- [[compcert]] —— CompCert，Vellvm 的姊妹工作，证明从 C 出发的编译器
- [[llvm]] —— Vellvm 形式化的对象本身

## 关联

- [[llvm]] —— Vellvm 是它的形式化版；理解 LLVM IR 是读 Vellvm 的前提
- [[compcert]] —— 同样追求"机器证明的编译器"，路线不同：CompCert 从 C 出发，Vellvm 从 LLVM IR 出发
- [[ssa-form]] —— Vellvm 把 SSA 支配关系全部 Coq 化，是基础设施
- [[hoare-logic]] —— 程序证明的早期框架，Vellvm 用更现代的工具但思路相通
- [[coq-tactical]] —— Vellvm 几千行证明的写作语言
- [[kildall-dataflow]] —— 数据流分析的统一框架，被 mem2reg 这类 pass 间接用到
- [[compiler-errors]] —— LLVM 优化 bug 暴露在用户面前的样子，Vellvm 想从根上消除
- [[mlir]] —— LLVM 之上的多层 IR 框架，未来形式化也得跟上去

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[compcert]] —— CompCert — 每条优化都被数学证明保持语义的 C 编译器
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[kildall-dataflow]] —— Kildall 数据流框架 — 用一套格论统一所有全局编译优化
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mlir]] —— MLIR — 给编译器一套乐高，每层抽象都能搭自己的方言

