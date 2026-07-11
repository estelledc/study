---
title: Boogie — 写一次验证后端，多种证明语言复用
来源: 'Barnett, Chang, DeLine, Jacobs, Leino, "Boogie: A Modular Reusable Verifier for Object-Oriented Programs", FMCO 2005'
日期: 2026-05-31
分类: 形式化方法
难度: 中级
---

## 是什么

Boogie 是一种**中间验证语言**（Intermediate Verification Language, IVL）。日常类比：把它想成"翻译界的转换站"。

你写了一门带契约的高级语言（比如 C# + 前后置条件），你想让机器自动证明"这段代码不会违反契约"。这中间要经过两步：

1. 把高级语言**语义建模**成数学命题（这一步又复杂又琐碎）
2. 把数学命题交给 **SMT 求解器**（Z3 等）判断是否成立

Boogie 把第一步的产物**单独抽出来**——它定义了一个简单命令式语言，前端只要把自己的代码翻译到 Boogie，剩下的 VC 生成 + SMT 调用全部由 Boogie 包办。

类比：编译器界的 **LLVM IR**——Rust / Swift / Julia 都翻译到 LLVM IR，后端由 LLVM 一次写好，所有人复用。

## 为什么重要

不理解 Boogie，下面这些事都没法解释：

- 为什么 **Dafny / VCC / Spec# / Corral** 这些看起来完全不同的工具，底层验证速度和能力很相似——它们共用 Boogie
- 为什么 Microsoft 在 2008-2014 年敢用形式化验证去攻 **Windows Hyper-V 内核**（VCC 项目）和 **Windows 驱动**（Corral 项目）——因为 Boogie 把验证基础设施成本分摊掉了
- 为什么 [[z3-2008]] 论文一发出来，几乎所有验证工具一夜之间换后端——它们都通过 Boogie 间接接 Z3
- 为什么后来 F\* / Why3 / Viper 都要重新发明类似的中间层——一次抽象的红利持续 20 年

## 核心要点

Boogie 这套思路可以拆成 **三层架构**：

1. **前端翻译**：Spec# / Dafny / VCC 把自己的源代码翻译成 Boogie 程序。比如 C# 里 `class C` 的字段访问，翻译成 Boogie 里的 `map[ref, Field] -> Value` 操作。
2. **VC 生成**：Boogie 把程序通过 Dijkstra **弱前置条件演算**（wp，1976）转换成一条巨大的一阶逻辑公式——"如果这个公式恒为真，程序就正确"。
3. **SMT 求解**：把公式交给 Z3。Z3 要么说"恒真"（验证通过），要么给一个反例（违反契约的输入）。

中间还有一步关键技巧叫 **passification**——把循环和赋值统一改写成静态单赋值（SSA）形式，让 wp 可以一次性扫完整段代码。

更细一点的拆解：

- **过程边界 = 验证单元**：每个 procedure 独立验证。调用方只看 `requires` / `ensures`，不看实现——这就是 **modular verification**
- **循环不变量是契约**：`while` 循环必须显式标 `invariant`。Boogie 在循环顶检查"进入时成立"+"每轮迭代保持"+"退出时蕴含后置"——三段式
- **map 类型**：Boogie 用 `[ref]Field` 这种映射建模"对象的字段"或"数组下标"。这让面向对象、数组、堆都能用同一套机制表达
- **ghost 变量**：只在证明里存在、运行时不需要的变量。例如证明"链表无环"时引入一个 set，记录已访问节点

## 实践案例

### 案例 1：Boogie 程序长什么样

```
procedure Abs(x: int) returns (r: int)
  ensures r >= 0;
  ensures r == x || r == -x;
{
  if (x < 0) { r := -x; } else { r := x; }
}
```

这段 Boogie 代码声明了一个过程 `Abs`，**两条后置条件**（ensures）说明返回值的性质。Boogie 自动生成 VC，丢给 Z3，几毫秒返回"通过"。

### 案例 2：Dafny 是怎么用 Boogie 的

你在 Dafny 里写：

```dafny
method Max(a: int, b: int) returns (m: int)
  ensures m >= a && m >= b
{
  if a > b { m := a; } else { m := b; }
}
```

Dafny 编译器**不直接面对 Z3**。它把上面这段代码翻译成等价的 Boogie 程序，再让 Boogie 去生成 VC、调 Z3。Dafny 的工作量是"如何把 Dafny 语义翻成 Boogie"，而不是"如何驱动 SMT"。

### 案例 3：VCC 验证 Hyper-V 的尺度

VCC 是 Microsoft 用来验证 **Windows Hyper-V hypervisor** C 代码的工具——大约 10 万行 C 代码、20 万行注解。VCC 自己不写 SMT 接口，而是把每个 C 函数翻译成 Boogie，让 Boogie 跑 Z3。Boogie 团队优化一次 VC 生成，VCC 直接受益。

### 案例 4：Corral 借 Boogie 做有界模型检查

Corral 是另一种用法——它把 Boogie 程序当作模型检查的输入，做**有界深度的状态空间搜索**，找 bug 而不是证明全对。同一个 Boogie 程序，可以"被证明"也可以"被检查"，前端不变只换后端策略。这种灵活性是 IVL 抽象的另一份红利。

## 踩过的坑

1. **错误信息三层反查**：Z3 报"在公式第 8347 行不可满足"——你得先反查到 Boogie 行号，再反查到 Dafny 行号，再反查到你的代码。链路一长，调试地狱。后来 Dafny 用了大量 source map 技巧才缓解。
2. **Boogie 不是图灵完备的真实语言**：它是验证用的"伪代码"。复杂语义（比如 C 的指针别名、并发）必须前端用 **ghost 代码**精心建模——这是脏活累活。
3. **modular 验证 = 调用方只看 spec**：好处是规模可扩展；坏处是 spec 写不全就证不出来。新人常以为"反正 Boogie 能看到全部代码"——它不会越界看。
4. **VC 体量爆炸**：循环不变量写得不够紧时，wp 展开会生成超大公式，Z3 跑分钟级甚至超时。学会写**紧的不变量**比学 Boogie 语法更难。
5. **触发器（trigger）调优**：Boogie 把量词公式喂给 Z3 时，要给 Z3 提示 "在什么模式上展开 forall"。提示太松——Z3 实例化爆炸；太紧——证不出来。这是 SMT 用户的共同痛点，Boogie 没消除只是承担了它。
6. **IVL 不是银弹**：你不能假装"翻译到 Boogie 就万事大吉"。如果源语言语义太特殊（lazy 求值、并发内存模型），翻译本身就是研究课题，工作量并不比直写 SMT 少多少。

## 适用 vs 不适用场景

**适用**：

- 想做新的程序验证语言，不想从头写 SMT 后端 → 直接以 Boogie 为后端
- 命令式 / 面向对象代码的模块化验证（每个过程独立证）
- 想把 SMT 自动化用到极致的场景（vs 交互式证明）

**不适用**：

- 高阶证明、依赖类型、定理库——用 [[lean-prover]] / Coq / [[fstar]]
- 纯函数式语言精确语义建模——Why3 / F\* 更顺手
- 实时 / 概率 / 量子等非标准语义——SMT 编码代价太高

## 历史小故事（可跳过）

- **1976**：Dijkstra 提出 **wp 演算**——Boogie VC 生成的数学骨架，比 Boogie 早 30 年
- **1995-1998**：Leino 在 DEC SRC 做 ESC/Modula-3、ESC/Java——第一代"近似自动验证"工具，思路上是 Boogie 的雏形
- **2003**：Microsoft Research 启动 **Spec# 项目**——给 C# 加契约、做静态验证。Barnett / DeLine / Leino 在过程中意识到"VC 生成 + SMT 接口"应该抽出来
- **2005**：FMCO 会议上 Boogie 论文正式发表——这是 IVL 路线第一次有名字
- **2008**：[[z3-2008]] 由 de Moura + Bjørner 在同组发布，与 Boogie 配合成"自动验证全栈"
- **2010**：Leino 用 Boogie 写 **Dafny**——把"语言 + 验证"做成开发者友好的形态
- **2014 后**：Why3、Viper 等借鉴 IVL 思想做新变体
- **2020 后**：AWS s2n / Cryptol、Mozilla Firefox 媒体栈、Linux eBPF 验证器都开始借鉴这套思路——"前端语义 + 中间 IVL + SMT 后端"成了 high-assurance 软件的标准管线

20 年后回头看，Boogie 的最大遗产不是语言本身，而是 **"验证基础设施可以分层复用"** 这个观念。一个好的 IR 抽象，比一个完美的工具走得更远——LLVM 如此，Boogie 也如此。

## 学到什么

1. **抽象一层中间表示，红利能吃 20 年**——LLVM IR 之于编译器，Boogie 之于验证器
2. **wp 演算 + SMT 求解 + 模块化验证** 是自动化形式化验证的"三件套"
3. **错误信息的反查链路**和**spec 完备性**是工程化时绕不开的两座山
4. **理论（1976 wp）→ 工具（1998 ESC/Java）→ 抽象层（2005 Boogie）→ 用户语言（2010 Dafny）**——每一步隔 7-12 年，是形式化方法领域的典型节奏
5. **modular 验证 vs 全程序分析**：Boogie 选择前者——只看一个 procedure 的局部信息 + 调用方的 spec。这是工程上能扩展到十万行 C 代码的关键决策；代价是 spec 写不完整就证不出来
6. **自动化 vs 表达力的权衡**：Boogie + Z3 的组合走"放弃高阶 / 依赖类型，换全自动 SMT"路线，与 Coq / Lean 的"放弃自动化、换最强表达力"形成对照。两条路都能做大型项目，但开发体验完全不同

## 延伸阅读

- 论文 PDF：[Boogie: A Modular Reusable Verifier](https://www.microsoft.com/en-us/research/publication/boogie-a-modular-reusable-verifier-for-object-oriented-programs/)（FMCO 2005，约 25 页）
- Dafny 官方教程：[Dafny: A Language and Program Verifier](https://dafny.org/)（最容易入门的 Boogie 上层语言，浏览器即可跑）
- Leino 的书：*Program Proofs*（2023，Dafny 全书 + Boogie 思路讲解，零基础也能读）
- Boogie 源码：[boogie-org/boogie](https://github.com/boogie-org/boogie)（C# 写的，结构清晰，VC 生成核心约 5000 行）
- Leino 教程：[This is Boogie 2](https://www.microsoft.com/en-us/research/publication/this-is-boogie-2-2/)（Boogie 2 语言参考手册，比原论文更新）
- 课程视频：[VSTTE 暑期学校 Dafny 课程](https://www.youtube.com/results?search_query=dafny+leino)（多年累积，找最近一年的版本）

## 关联

- [[hoare-logic]] —— Boogie VC 生成的理论祖先；wp 演算是 Hoare 三元组的对偶
- [[z3-2008]] —— Boogie 的默认 SMT 后端，两者是黄金搭档
- [[fstar]] —— 另一条验证语言路线（依赖类型 + SMT），与 Boogie 思路对照
- [[lean-prover]] —— 交互式证明助手，与 Boogie "全自动 SMT" 路线形成两极
- [[minisat-2003]] —— SMT 求解器底下的 SAT 引擎，Boogie 间接受益
- [[csp-hoare-1978]] —— Hoare 工作的另一支线（并发），Boogie 是顺序程序方向
- [[llvm]] —— 编译器界的中间表示典范，与 Boogie 在验证界扮演同样角色
- [[ssa]] —— Boogie 的 passification 阶段把代码变成 SSA-like 形式后再生成 VC
- [[hindley-milner]] —— 类型推导走"不依赖 SMT"路线，与 Boogie 的"什么都丢给 SMT"思路形成另一条对照轴
- [[dafny-2010]] —— Dafny 是最典型的 Boogie 前端之一，把用户友好的语法翻译成 Boogie 验证条件
- [[why3-2013]] —— Why3 也是"中间层 + 多后端证明器"路线，可和 Boogie 的 IVL 思想对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
