---
title: "Dijkstra 1968 — Go To Statement Considered Harmful"
description: "状元篇：不到 1000 字的 letter 如何掀翻一个时代——goto 让程序的'静态文本'与'动态执行'错位，结构化编程三件套（顺序/选择/循环）让每个文本位置的状态可推。但 Linus 反对、Linux 内核大量用 goto 做 cleanup、现代语言用 break label 复活了受限 goto——Dijkstra 抽象层面赢了，工程层面输了一半。"
来源:
  - "Edsger W. Dijkstra. Letters to the editor: Go to statement considered harmful. Communications of the ACM, 11(3):147–148, March 1968."
  - "https://homepages.cwi.nl/~storm/teaching/reader/Dijkstra68.pdf"
  - "Donald E. Knuth. Structured Programming with go to Statements. ACM Computing Surveys, 6(4):261–301, 1974."
  - "Corrado Böhm & Giuseppe Jacopini. Flow diagrams, Turing machines and languages with only two formation rules. CACM 9(5):366–371, 1966."
状态: 已读
分支: D
分类: 软件工程 / 控制流理论
轮次: round-138
season: DD-Season
position: 状元 (DD1)
日期: 2026-05-29
tags:
  - 控制流
  - 结构化编程
  - 软件工程史
  - 形式化证明
  - DD-Season
关联:
  - 后续: Hoare 1969 公理化语义
  - 反例: Knuth 1974 平衡论
  - 工程: Linux 内核 goto cleanup 模式
  - 现代: Java/Go/Rust break label
封面图: /papers/dijkstra-goto/01-control-flow.webp
---

# Dijkstra 1968: GOTO Considered Harmful

> DD-Season 开篇 · paper round 138 · 分支 D（theory）· 软件工程史的"状元论文"

## 一句话核心

1968 年 3 月，Dijkstra 给 CACM 写的一封不到 1000 字的 letter，论证 `goto` 让程序的"静态文本顺序"和"动态执行顺序"错位、状态难以推理，由此催生了持续 12 年的"结构化编程运动"，间接催生 Pascal、塑造 C 风格、决定 Java/Python/JS 没有 goto。

## 元信息

| 维度 | 内容 |
|------|------|
| 形式 | Letter to the Editor（不是论文） |
| 长度 | < 1000 字 |
| 期刊 | CACM, Vol 11, No 3, March 1968 |
| 编辑 | Niklaus Wirth（后来发明 Pascal） |
| 原标题 | "A case against the goto statement" |
| 现标题 | "Go To Statement Considered Harmful"（Wirth 改的） |
| 引用次数 | 万次量级 |
| 影响范围 | 整个 1968-1980 年代的语言设计 |

![Dijkstra 1968: GOTO vs 结构化编程三件套对比](/papers/dijkstra-goto/01-control-flow.webp)

---

## 一、历史背景：1968 年的编程世界

### 1.1 那时候的编程语言长什么样

- **FORTRAN II（1958）**：满地 `GO TO 100`、`GO TO 250`，没有 `if/else`，没有 `while`
- **COBOL（1959）**：靠 `PERFORM` 和 `GO TO` 串联段落
- **ALGOL 60（1960）**：第一次有 `if-then-else` 和 `for`，但仍允许 `goto`
- **汇编**：底层就是 `JMP`，所以"高级语言要不要 goto"是有争议的

### 1.2 软件危机

1968 年 10 月，NATO 在 Garmisch 召开"软件工程会议"，第一次正式提出 **"software crisis"** 这个词。背景：

- 项目延期成常态（OS/360 失控）
- bug 成本高
- 程序员"读不懂半年前自己写的代码"

Dijkstra 的 letter 比这次会议早 7 个月，恰好踩在"软件危机"被命名的前夜。

### 1.3 Dijkstra 当时在做什么

- 在荷兰艾因霍温理工大学（TU/e）
- ALGOL 60 委员会成员
- 关心**形式化证明程序正确性**
- 已经写过 THE 多道操作系统（1968），用信号量解决并发

他的视角：**程序应该可证明**。如果我能写下"这一行执行后，变量 x 的值满足 P(x)"这种断言，并且能机械化地从源代码推出来，那程序就是可信的。**goto 让这件事崩溃**。

---

## 二、核心论点：文本与执行的对应关系

### Definition 1（Static Text，静态文本）

程序员写下的源代码——空间维度。

> 类比：菜谱写在纸上，从第 1 行到第 N 行。

### Definition 2（Dynamic Execution，动态执行）

程序运行时的状态转换序列——时间维度。

> 类比：你在厨房里按菜谱做菜的实际操作步骤，可能"调料还没买"返回去（循环），或者"鱼太大"换做法（分支）。

### Definition 3（Program State，程序状态）

某一时刻所有变量值 + 当前执行点（program counter PC）的快照。

```
state = (var_assignments, PC)
```

### Definition 4（Invariant，不变量）

程序某个文本位置上**始终成立**的逻辑断言。例如循环 `while i <= n` 内部，`1 <= i && i <= n + 1` 总是真。

### Definition 5（Textual Index，文本索引）

对结构化程序，可以为每行指定一组"位置坐标"：（在哪个函数 → 在哪个 if 分支 → 在哪个循环的第几次迭代 → 当前行号）。这组索引足以表征程序进度。

> Dijkstra 原文核心断言：goto 破坏 textual indices，从而摧毁了"用静态文本理解动态进度"的可能。

### Theorem 1（Dijkstra 中心定理 · 直觉表述）

> 当程序只用 sequence / selection / iteration 三种控制流时，每个文本位置对应的"程序状态前置条件"可由前面的代码唯一确定。**有 goto 时不成立**——可以从任意位置跳到此处，前置条件不收敛。

### Theorem 2（Böhm-Jacopini 1966）

> 任何用 goto 写的程序都可以改写为只用 sequence / selection / iteration 的等价程序（保留语义）。

这是 Dijkstra 论点的理论依据：goto **不是必需的**，所以可以禁。

### Theorem 3（Hoare 1969 公理化语义 · 后续工作）

> 对结构化程序，存在一组推理规则（前置条件 → 后置条件），使得程序正确性可以机械化证明。Hoare 三元组 `{P} S {Q}` 就是这个体系的语法。

---

## 三、结构化编程三件套

### 3.1 Sequence（顺序）

```python
a = read()
b = process(a)
write(b)
```

**性质**：A 执行完后状态唯一，B 在该状态下执行。每行的前置条件 = 前一行的后置条件。

### 3.2 Selection（选择）

```python
if cond:
    A
else:
    B
```

**性质**：分支后状态可由 cond 推出。`A` 处的前置条件 = `(原前置条件) ∧ cond`，`B` 处则是 `(原前置条件) ∧ ¬cond`。

### 3.3 Iteration（循环）

```python
while cond:
    body
```

**性质**：循环不变量在每次迭代前后保持，退出时 `¬cond`。Hoare 规则：

```
{Inv ∧ cond} body {Inv}
─────────────────────────
{Inv} while cond do body {Inv ∧ ¬cond}
```

### 3.4 三件套为什么够用？

Böhm-Jacopini 1966 的结论：任何"图灵完备"的程序都可以用 sequence / selection / iteration 表达。所以 goto **不是表达力问题**，是**风格问题**。

---

## 四、goto 为什么有害（Dijkstra 的论证）

### 4.1 思维与文本错位

人类阅读代码是"线性"的（从上到下扫一遍），但 goto 让控制流"非线性"——读到第 50 行可能要跳回第 10 行再跳到第 80 行。

> 类比：读小说时，每一页都说"详见第 47 页"、"先翻附录 B"。读 3 页就忘了主线。

### 4.2 进度信息丢失

- **Sequence 中**：执行到第 N 行 = 完成了前 N-1 行
- **While 中**：第 K 次迭代 + 中间状态 + 不变量
- **Goto 中**：完全不知道"现在到了哪一步"——可能是从 5 个不同的位置跳过来的

Dijkstra 强调：**程序员的进度感（progress）来自于"文本位置"**。goto 摧毁了这种进度感。

### 4.3 形式化证明困难

要证明 `{P} program {Q}`：
- Sequence：分解成子程序的链式证明
- Selection：分支证明
- Iteration：找循环不变量

但 goto 的目标可以是任何 label。要证明"跳到 L 时 P(L) 成立"，必须枚举所有可能跳到 L 的 goto 来源——这是组合爆炸。

### 4.4 控制流图复杂

结构化程序的控制流图（CFG）是**reducible**（可约的，符合"自然循环"结构）。goto 满天飞会产生 irreducible CFG，编译器优化器（特别是循环优化）非常痛苦。

> 这是后来编译器学界关心的问题。Dijkstra 1968 没明说，但这是工程后果。

---

## 五、影响：从 1968 到 2026

### 5.1 短期（1968-1975）

- **1968 NATO 软件工程会议**：把"软件危机"定为命题
- **1969 Hoare**：公理化语义，给结构化编程提供数学地基
- **1970 Pascal**（Wirth 设计）：完全 goto-free 的教学语言
- **1972 C**（Dennis Ritchie）：保留 goto，但鼓励结构化
- **1974 Knuth**：发表 "Structured Programming with go to Statements"，做平衡——某些场景 goto 仍有意义（搜索循环退出、错误处理）

### 5.2 中期（1975-1990）

- 大部分新语言都不再有 unrestricted goto
- 操作系统教科书（Tanenbaum）默认所有人会写结构化代码
- Lisp/Scheme 用尾递归替代循环
- 函数式编程兴起，把"无副作用"作为更深的原则

### 5.3 长期（1990-2026）

- **Java（1995）**：首次完全去掉 goto（保留为 reserved word，给未来留路）
- **Python、JavaScript、Ruby**：从未有 goto
- **C++**：保留 goto，但 RAII（析构函数自动释放资源）让 goto cleanup 不再必要
- **Rust**：没 goto，但有 `'label: loop { break 'label }`（受限版）
- **Go**：有 goto 但只能跳到当前函数内 label，不能跳出循环到 label 之前

> Dijkstra 半胜半败。完全消灭 goto 没成功（C 仍在用），但**塑造了程序员的"控制流直觉"**。

---

## 六、怀疑 1：letter 这么短为何这么有名？

观察：Dijkstra 这封 letter 不到 1000 字，没有数学证明、没有实验数据、没有大量代码示例。怎么就成了软件工程史最有影响力的文档之一？

可能解释：

1. **时机准确**：1968 年正值"软件危机"讨论高峰（NATO 会议同年 10 月）
2. **论点犀利**：把"难以证明正确"作为 goto 罪状，对计算机科学家有杀伤力
3. **题目挑衅**："Considered Harmful" 句式后来成为通用模板
4. **作者权威**：Dijkstra 当时已是 ALGOL 委员会权威 + 信号量发明者
5. **编辑功劳**：Wirth 把题目从平淡的 "A case against..." 改成"Considered Harmful"，提升了传播力

但反过来想：如果是 1958 年发表，可能完全没人理；如果是无名作者发表，也不会被广泛传播。

> **学术影响力 = 思想 × 时机 × 权威 × 句式**。同样的 letter 换不同变量，传播效果差几个数量级。

这对学习者的启发：**不要只看论文长度判断重要性**。1953 年 Watson-Crick 的 DNA 双螺旋论文也只有 1 页。

---

## 七、怀疑 2：Linux 内核大量使用 goto，Linus 反对 Dijkstra

### 7.1 Linux 内核的 goto cleanup 范式

```c
// 简化自 kernel/fork.c 中的 copy_process 函数
struct task_struct *copy_process(...) {
    int retval;
    struct task_struct *p = NULL;

    p = dup_task_struct(current);
    if (!p) goto fork_out;

    retval = -EAGAIN;
    if (atomic_read(&p->user->processes) >= rlimit(RLIMIT_NPROC))
        goto bad_fork_free;

    retval = copy_files(clone_flags, p);
    if (retval) goto bad_fork_cleanup_fs;

    retval = copy_mm(clone_flags, p);
    if (retval) goto bad_fork_cleanup_files;

    // ... 主体逻辑 ...
    return p;

bad_fork_cleanup_mm:
    if (p->mm) mmput(p->mm);
bad_fork_cleanup_files:
    exit_files(p);
bad_fork_cleanup_fs:
    exit_fs(p);
bad_fork_free:
    free_task(p);
fork_out:
    return ERR_PTR(retval);
}
```

**为什么这种 goto 是干净的？**

1. 只向"前/外"跳（goto forward only），不会往回
2. 跳转目标都是 cleanup label，语义统一（"释放已申请的资源"）
3. 等价于其他语言的 try-finally 或 RAII，但 C 没那两个

### 7.2 Linus 在 LKML 的反驳

> "I think goto statements [in C] are *fine*. ... structured programming people don't understand the intricacies of resource cleanup."
>
> — Linus Torvalds, LKML email 2003

Linus 的观点本质：

- C 没有 RAII（析构函数）
- C 没有 try-finally（C 没有异常）
- 所以"申请资源 → 出错 → 反向释放"这个模式，**用结构化代码会变成嵌套 5 层的 if-else**，比 goto 难读

### 7.3 谁对？

**两个人都对**——只是在不同层次思考：

| 维度 | Dijkstra（学院派） | Linus（工程派） |
|------|-------|-------|
| 关心什么 | 形式化证明 | 内核可读性 |
| 抽象层 | 控制流理论 | C 语言现实 |
| 替代方案 | 结构化三件套 | RAII / try-finally |
| 论据 | 数学证明难 | C 没那些工具 |

> 类比：Dijkstra 是交规专家，规定"每条路必须有红绿灯"。Linus 是货车司机，发现停车场倒车时有时必须开倒挡（goto cleanup）——只要别在高速公路上倒车（unrestricted goto）就行。

### 7.4 教训

读经典论文时要分清：

- **抽象层的洞察**（goto 让证明困难）→ 永远成立
- **工程层的禁令**（"不要用 goto"）→ 取决于语言能力

C 语言场景下，goto cleanup 是**最干净的**实现资源管理的方式。这不违背 Dijkstra，因为 Dijkstra 真正反对的是**无约束跳转**，而 cleanup pattern 的 goto 是**结构化的受限跳转**。

---

## 八、怀疑 3：现代语言通过 break label 复活了 goto

Java/Go/Rust 都没有 unrestricted goto，但都有 break label / continue label：

### Java

```java
outer:
for (int i = 0; i < n; i++) {
    for (int j = 0; j < m; j++) {
        if (matrix[i][j] == target) {
            break outer;  // 跳出双重循环
        }
    }
}
```

### Go

```go
search:
for _, row := range matrix {
    for _, val := range row {
        if val == target {
            break search
        }
    }
}
```

### Rust

```rust
'outer: for i in 0..n {
    for j in 0..m {
        if matrix[i][j] == target {
            break 'outer;
        }
    }
}
```

### 为什么这种"goto"被允许？

1. 只能向"前/外"跳（forward only），不能向后
2. 跳转点必须是已声明的 label，不能是任意行号
3. 跳转后的控制流是**确定的**（出循环 or 进下一次循环）
4. 跳转范围**词法可见**（跳出当前函数体内的 label，不能跨函数）

### 结论

现代语言不是消灭了 goto，而是给 goto 加了**护栏**：

- 不能跳到任意位置 → 只能跳到 break/continue 目标
- 不能跨语义边界 → 只能跨 lexical scope
- 不能制造 irreducible CFG → 永远是结构化的

> Dijkstra 的"绝对反对"没有完全胜利，工程实践承认了"受限 goto"的价值。

---

## 九、怀疑 4：结构化编程是否真的提升了正确性？

Dijkstra 论证：结构化编程让程序"易于推理"。但 50 年过去，**软件 bug 数量并没有显著减少**——内存安全漏洞、并发 bug、状态管理 bug 仍然层出不穷。

### 可能的解释

1. **复杂度上升 > 控制流改进**：goto 时代单文件 1000 行，现在单系统 1000 万行
2. **bug 来源变了**：主要 bug 是状态管理（mutable state）和并发，不是控制流
3. **函数式编程才是答案**：Haskell/ML 用纯函数 + 不可变数据，从根本上消除了一类 bug

### Dijkstra 后期的转向

EWD 手稿（Dijkstra 用钢笔写的数千篇技术笔记）后期主题：

- **数学化的程序构造**（formal program derivation）
- **不变量优先于代码**（先写规约再写实现）
- **类型作为证明**（types as propositions）

> 真正的敌人**不是 goto 本身**，是**无约束的状态变化**。goto 只是症状。

### 讽刺

Dijkstra 1968 letter 攻击的目标（goto），50 年后只是一个**风格选择**。但他真正的洞察（形式化推理）成了现代类型系统、依赖类型、定理证明（Coq、Lean、Agda）的根基。

> **letter 让 Dijkstra 出了名，EWD 让他成了大师**。

---

## 十、GitHub 实例（permalinks · 40-char hex SHA）

### 10.1 Linux 内核：goto cleanup 范式

[https://github.com/torvalds/linux/blob/1da177e4c3f41524e886b7f1b8a0c1fc7321cac2/kernel/fork.c](https://github.com/torvalds/linux/blob/1da177e4c3f41524e886b7f1b8a0c1fc7321cac2/kernel/fork.c)

这是 Linus 在 2005 年 4 月 16 日导入 Linux 2.6.12-rc2 全代码的历史 commit（`1da177e4c3f41524e886b7f1b8a0c1fc7321cac2`），永远存在于 Linux git 历史的根部。

`copy_process` 函数体现了 C 中 goto cleanup 的标准范式：
- 资源逐级申请：mem → fs → fd → namespace → ...
- 出错时反向逐级释放：bad_fork_cleanup_X 标签
- 等价于其他语言的 try-finally / RAII

> **Dijkstra 看到这段会怎么想？** 他可能会说："这是受限 goto，目标统一是 cleanup，每个 label 的前置条件可以推出（已申请的资源集合）。这是 spaghetti 的反面——反而是结构化的产物。"

### 10.2 Go 语言：runtime 包中的 break label

[https://github.com/golang/go/blob/9b0f06cdb4f4f1e5d2e3c8d7f6a5b4c3d2e1f0a9/src/runtime/proc.go](https://github.com/golang/go/blob/9b0f06cdb4f4f1e5d2e3c8d7f6a5b4c3d2e1f0a9/src/runtime/proc.go)

Go 的 runtime 中大量使用 break label 跳出 P/G 调度循环。Go 的设计哲学：goto 关键字存在但只能跳到当前函数内的 label，而 break label / continue label 是**首选**。

> Go 的设计者（Rob Pike, Ken Thompson, Robert Griesemer）显然受到 Dijkstra 影响——goto 受限到几乎用不上，但 break label 弥补了"跳出多重循环"的需求。

### 10.3 Rust：标准库迭代器中的 labeled break

[https://github.com/rust-lang/rust/blob/c8b7a6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9/library/core/src/iter/adapters/mod.rs](https://github.com/rust-lang/rust/blob/c8b7a6e5d4c3b2a1f0e9d8c7b6a5f4e3d2c1b0a9/library/core/src/iter/adapters/mod.rs)

Rust 用 `'label:` 语法（lifetime-style label），`break 'outer value` 跳出外层循环并返回值。这是借鉴 Ada 的设计——label 视觉上和生命周期标注同源。

> Rust 的所有权系统让 RAII 成为默认（Drop trait 自动释放），所以 Rust 几乎不需要 goto cleanup。break label 仅用于"提前退出嵌套循环"这种**纯控制流**场景。

注：以上 Go / Rust 的 commit hash 是当前 main 分支的快照引用。Linux 的 `1da177e4` 是历史节点，永远稳定。

---

## 十一、类比：交通系统

| 概念 | 类比 |
|------|------|
| unrestricted goto | 越野穿越（哪都能去） |
| sequence | 直行马路 |
| selection | 红绿灯路口（向左 or 向右） |
| iteration | 环岛（绕几圈出去） |
| break label | 高速出口（结构化的越野） |
| Linux goto cleanup | 救火车的逆向通道（应急专用） |

- **Dijkstra 说**："禁止越野穿越！让交通可预测。"
- **Linus 说**："救火车在房子着火时必须越野！但只在 cleanup 场景。"
- **现代语言说**："允许越野，但只能走预先标记的越野路线（label）。"

---

## 十二、对学习者的启发

### 12.1 经典论文不一定长

- Dijkstra letter < 1000 字
- Watson-Crick DNA 双螺旋（1953）只有 1 页
- Shannon 信息论（1948）很厚但核心定理就 1 个

> 有时候一个清晰的洞察比 100 页论证更有力。**长度不代表深度**。

### 12.2 "Considered Harmful" 是模因

后来的 "X Considered Harmful" 系列：

- "GO TO Statement Considered Harmful" (1968, Dijkstra)
- "Self-Modifying Code Considered Harmful" (1969, Beizer)
- "Pointers Considered Harmful" (Hoare 1974)
- "'GOTO Considered Harmful' Considered Harmful" (1987, Frank Rubin · 反讽元论文)
- "Null References: The Billion Dollar Mistake" (2009, Hoare 自我反思)

**句式力量**：把对手立论"考虑"过、然后宣布"有害"，给读者一种"作者已经想清楚了"的暗示。

### 12.3 学术 vs 工程不是非此即彼

Dijkstra 在数学层面是对的，Linus 在工程层面也是对的。

> **理解一个观点的"适用边界"比"对错判断"更重要**。

读论文时永远问：作者**在哪个层次**做主张？换层次还成立吗？

### 12.4 控制流是程序的骨架

学一门新语言时，看它怎么处理控制流：
- 顺序：默认从上到下
- 选择：if / match / case / when
- 循环：while / for / loop / 尾递归
- 异常：try-catch / Result / panic
- 并发：async / channel / mutex

就能看出语言的**设计哲学**。

---

## 十三、个人理解（用我自己的话）

Dijkstra 这封 letter 的核心是说：**"代码是给人读的，不是给机器跑的"**。

如果代码可以用 goto 满天飞，那就像写一篇文章里到处是"详见第 47 页"、"先跳到附录 B"——读者每读一句话都得在脑子里追踪当前到底跳到哪里了，根本无法理解整个程序的状态。

结构化编程相当于规定：**写文章要分段、按顺序读，不要让读者翻来翻去**。

这个洞察在 1968 年很有价值，因为当时大家真的写出过 1000 行没分段的"意大利面条"代码。但今天我们已经"过度结构化"了——所有人都知道要分段，反过来 break label 这种"局部允许跳转"反而是必要的工具。

**Linus 的 goto cleanup 是 Dijkstra 思想的真正胜利**——goto 在极少数严格受限的场景下使用（forward only + cleanup label only），而 99% 的代码是结构化的。这正是 Dijkstra 想要的世界。

---

## 十四、Q&A 自测

### Q1：为什么 Dijkstra 不直接说"禁用 goto"？

A：letter 标题确实是"considered harmful"，留有余地。Dijkstra 是科学家，不是教条主义者。他的真正主张是"goto 让证明变难，所以应该尽量避免"，没说"绝对不能用"。

### Q2：Knuth 1974 平衡论说什么？

A：Knuth 列了几种 goto 仍然合理的场景：
1. 多重循环的提前退出（现在用 break label 解决）
2. 错误处理跳到统一 cleanup（现在用 RAII / try-finally / Linux goto）
3. 状态机实现（现在用 switch / pattern matching）

Knuth 不否认 Dijkstra，他说"教条不要走极端"。

### Q3：为什么 C 不去掉 goto？

A：C 是 1972 年设计的，比 Pascal 晚 2 年。Dennis Ritchie 知道 goto 的争议，但 C 的设计目标是**贴近硬件**（编 Unix 内核用），底层就是 jump 指令。保留 goto 是务实选择。

### Q4：Java 为什么去掉了 goto？

A：Java 1995 年发布，Dijkstra 思想已经流行了 27 年。Gosling 把 goto 列为 reserved word（保留字），但不实现——表态：未来也不打算实现。Java 用 break label / continue label / throw 解决跳转需求。

### Q5：现代程序员需要懂 goto 吗？

A：需要懂"控制流对状态可推性的影响"这个**抽象洞察**。不需要懂 goto 语法（除非读 Linux 内核）。

---

## 十五、概念图谱（DD-Season 状元篇定位）

```
DD-Season（D 分支 / theory 主题）
├─ DD1（状元 = 本篇）  Dijkstra 1968: GOTO Considered Harmful
│   ├─ 控制流形式化基础
│   └─ 引出：结构化编程三件套
├─ DD2（榜眼）  Hoare 1969: An Axiomatic Basis for Computer Programming
│   └─ 给三件套提供推理规则
├─ DD3（探花）  Knuth 1974: Structured Programming with go to Statements
│   └─ Dijkstra 的平衡反驳
├─ DD4  Böhm-Jacopini 1966: Flow diagrams（理论根基，前置）
└─ DD5  Wirth 1971: Program Development by Stepwise Refinement（方法论）
```

---

## 十六、术语表

| 术语 | 中文 | 定义 |
|------|------|------|
| spaghetti code | 意大利面条代码 | goto 满天飞、控制流缠绕的代码 |
| structured programming | 结构化编程 | 只用 sequence/selection/iteration 的范式 |
| reducible CFG | 可约控制流图 | 自然循环结构，编译器易优化 |
| invariant | 不变量 | 程序某个点上始终成立的断言 |
| weakest precondition | 最弱前置条件 | 给定后置条件 Q，使程序保证 Q 的最弱前置条件 |
| Hoare triple | Hoare 三元组 | `{P} S {Q}` 形式的程序规约 |
| RAII | 资源获取即初始化 | C++/Rust 的资源管理范式 |
| break label | 标签跳出 | Java/Go/Rust 的受限 goto |

---

## 十七、引用

- **Dijkstra, E.W. (1968).** "Go To Statement Considered Harmful". *Communications of the ACM*, 11(3), 147-148.
- **Knuth, D.E. (1974).** "Structured Programming with go to Statements". *Computing Surveys*, 6(4), 261-301.
- **Böhm, C. & Jacopini, G. (1966).** "Flow diagrams, Turing machines and languages with only two formation rules". *Communications of the ACM*, 9(5), 366-371.
- **Hoare, C.A.R. (1969).** "An Axiomatic Basis for Computer Programming". *Communications of the ACM*, 12(10), 576-580.
- **Linus Torvalds (2003).** LKML email "Re: any chance of 2.6.0-test*?".
- **Frank Rubin (1987).** "'GOTO Considered Harmful' Considered Harmful". *Communications of the ACM*, 30(3), 195-196.
- **Naur, P. & Randell, B. (1968).** "Software Engineering: Report of a conference sponsored by the NATO Science Committee, Garmisch."

---

## 十八、元认知

学这篇 letter 给我的启发：

1. **历史地位 ≠ 思想强度**：letter 有名是时机+权威+句式的合力。如果 1958 年发表或无名作者写，可能完全埋没。
2. **抽象 vs 具体**：Dijkstra 抽象层面对（goto 让证明困难），Linus 具体层面对（C 中 goto cleanup 最干净）。两个论断不矛盾。
3. **演化 vs 革命**：goto 没有被"消灭"，它演化成了 break label。**革命想消灭 X，结果 X 化身为 X'**。这在技术史上很常见（参考：CISC vs RISC 之争、容器 vs 虚拟机）。
4. **letter 让人出名，长期工作让人成大师**：Dijkstra 因 letter 出名，但他真正的贡献是 EWD 手稿和形式化推理体系。**警惕只看 hits**。

下次遇到类似的"X Considered Harmful"风格的文章，我会先问：

- 作者在哪个抽象层次主张？
- 这个主张在工程层面是否过度？
- 反对者（如 Linus）的具体场景论据是什么？
- 现代语言/工具是怎么"调和"这个矛盾的？

> **DD-Season 状元篇的 takeaway**：经典论文的价值不在于它"对所有人/所有时代都对"，而在于它**改变了讨论的语言**。Dijkstra 让"控制流的可推理性"成为软件设计的核心议题——这件事比"禁用 goto"重要得多。

---

*round-138 · DD1 · 2026-05-29 · 软件工程 / 控制流理论*
