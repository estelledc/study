---
title: Dijkstra 1968 — Go To Statement Considered Harmful
来源: 'Edsger W. Dijkstra. Letters to the editor: Go to statement considered harmful. CACM 11(3):147–148, 1968.'
日期: 2026-05-30
分类: 软件工程 / 控制流理论
难度: 中级
---

## 是什么

1968 年 3 月，Dijkstra 给 CACM 写了一封约一两页的读者来信（letter），标题被编辑 Wirth 改成现在这版。它没有证明、没有数据，只把一个直觉说清楚：**goto 让你没法用「读到第几行」推断程序跑到了哪一步**。

日常类比：读菜谱时，你默认「做到第 5 步 = 前 4 步都做完了」。若菜谱到处写「请跳到第 12 步 / 跳回第 3 步」，同一页可能对应五种厨房状态——你就不敢只看页码下锅。goto 就是这种乱跳菜谱。

- 程序员推理靠「读到第 N 行 ≈ 完成了前面 N-1 行」；
- goto 让第 50 行可能从 5 个地方跳来，状态不再唯一；
- 所以应尽量用顺序 / 选择 / 循环三件套，让每个位置的前置条件可机械推导。

它比 NATO 软件危机会议早约 7 个月，踩在「software crisis」被命名的前夜。

## 为什么重要

它不是新算法，而是改了讨论控制流的语言：

- 给 [[hoare-logic]] 公理化语义提供了讨论对象——Hoare 1969 给三件套写了推理规则；
- 推动 Wirth 系语言（Pascal 1970 起）把结构化控制当默认；Pascal 仍保留受限 goto，Oberon 等更彻底；
- 1995 年 Java 把 goto 列为保留字但不实现，传承的是这条线；
- 真正持久的不是「禁止 goto」，而是「控制流可不可推理」这个评价坐标。

之后所有「X Considered Harmful」式文章都在借它的句式。

## 核心要点

1. **文本顺序 vs 执行顺序**  
   类比：菜谱页码是空间，下锅顺序是时间。goto 让两者错位，同一文本位置可对应多种执行历史。

2. **三件套保证前置条件唯一**  
   顺序 / 选择 / 循环让「走到这里时成立什么」由前面代码唯一确定。Böhm-Jacopini 1966 已证三件套图灵完备：goto 不是表达力问题，是风格问题。

3. **循环不变量把可推理性落地**  
   进入前 Inv 真，每轮后仍真，退出时 Inv ∧ ¬cond。结构化程序的控制流图通常可约（reducible）；乱跳 goto 易产生不可约图，编译器循环优化也更痛苦。

## 实践案例

### 案例 1：用 for 代替 goto 循环

```c
// 别这样：i=0; loop: if(i>=n) goto done; sum+=a[i]; i++; goto loop; done:
for (int i = 0; i < n; i++) sum += a[i];
```

- `for` 把「初值 / 条件 / 步进」写在同一行，读者一眼知道循环怎么前进；
- 等价 goto 版要在脑内拼三条跳转，状态更难跟；
- 审查时先看循环边界，再看循环体。

### 案例 2：C 里受限的 cleanup goto

```c
p = dup_task_struct(current);
if (!p) goto fork_out;
if (copy_files(...) < 0) goto bad_fork_cleanup_fs;
if (copy_mm(...) < 0)    goto bad_fork_cleanup_files;
return p;
bad_fork_cleanup_files: exit_files(p);
bad_fork_cleanup_fs:    exit_fs(p);
fork_out:               return ERR_PTR(retval);
```

- 只向前跳到清理标签，等价其他语言的 try-finally；
- C 没有 RAII，这是资源逐级释放的常见写法；Linus 在 LKML 辩护过；
- 判断标准：跳转目标的前置条件是否仍能由前面代码推出。

### 案例 3：早返回代替错误标签

```python
def safe_divide(a, b):
    if b == 0 or a is None or b is None:
        return None
    return a / b
```

- 异常路径先剥离，主路径集中在底部；
- 比跳到 `error_label` 再汇合更易测试覆盖；
- 在有异常/Result 的语言里，这比裸 goto 更贴合类型系统。

## 踩过的坑

1. **把 letter 当教条**：Dijkstra 反对的是无约束跳转；cleanup 这类受限 goto 不在射程里，嵌套五层 if-else 反而更难证明。
2. **忽略语言能力**：C++/Rust 有 RAII，goto cleanup 常没必要；在 C 里硬不用才是反例。
3. **把 break label 当成偷偷复活的 goto**：它有词法可见、只能向外、目标已声明等护栏，通常不破坏可约 CFG。
4. **把结构化编程等同函数式**：结构化只管控制流；不可变数据、纯函数是另一条线。

## 适用 vs 不适用场景

**适用**：

- 写循环时主动找不变量；分支后写下「此处状态 P ∧ cond」——Hoare 三元组的入门姿势
- 代码评审：向后乱跳的 goto 立刻警觉；C 里向前 cleanup 不必一刀切反对
- 语言选型：看一门语言怎么处理顺序/选择/循环/异常/并发，就能量出它和 1968 这条线的距离
- 写文档借用「Considered Harmful」句式时，先把对手的具体场景写清楚

**不适用**：

- 把「所有跳转都有罪」当教条——Knuth 1974 已在更细颗粒度上做过平衡
- 汇编/驱动热路径等确有测量数据的极致优化
- 在已有 RAII/defer/异常的语言里，再手写标签跳转通常得不偿失

## 历史小故事（可跳过）

- 原标题 "A case against the goto statement"，Wirth 改成挑衅句式，从此成模板。
- Dijkstra 当时是 [[algol-60]] 委员会成员，刚做完 THE 操作系统。
- Knuth 1974 写 40 页平衡论，列举多重循环退出、错误清理、状态机等合理场景。
- 1987 Frank Rubin 发 "'GOTO Considered Harmful' Considered Harmful"，句式开始自我解构。
- Java 保留 goto 字但不实现；C 保留 goto 是贴近硬件的务实选择。

## 学到什么

1. 抽象层洞察和工程层禁令要分开：Dijkstra 在数学层面是对的（goto 让证明难），Linus 在工程层面也可以是对的（C 没 RAII，cleanup 最干净）。换层次时永远问：作者在哪个层次主张？
2. 革命想消灭 X，结果常变成受限版 X'（break label / continue label）——护栏更紧但本质相关。
3. letter 让人出名，长期工作（最弱前置条件、EWD 手稿）才成大师；别把这封信和他的全部贡献混为一谈。
4. 写循环前先写不变量，写分支前先写「此处 P ∧ cond」——让每一行对应可推断状态，这是 letter 想留下的肌肉记忆。

## 延伸阅读

- [[hoare-logic]] —— Hoare 1969 给三件套配推理规则
- Knuth 1974 *Structured Programming with go to Statements* —— 平衡论
- Böhm-Jacopini 1966 —— 三件套图灵完备
- Wirth 1971 Stepwise Refinement —— 结构化方法论
- Linus 2003 LKML —— 内核视角辩护 goto cleanup
- Frank Rubin 1987 —— 句式自我解构的元论文

## 关联

- [[turing-1936]] —— 「可计算」奠基，三件套是它在高级语言里的投影
- [[algol-60]] —— Dijkstra 关心的语言，有 if-then-else 仍允许 goto
- [[hoare-logic]] —— 把可推理性形式化为推理规则
- [[knuth-taocp]] —— 作者后来写平衡论
- [[the-os-1968]] —— 同期 Dijkstra 用分层 + 信号量做可证明 OS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[dijkstra-shortest-path]] —— Dijkstra 最短路径 — 一杯咖啡时间想出来的贪心算法
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[multics-1965]] —— MULTICS 1965 — 把计算机做成像电力一样的公共服务
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[the-os-1968]] —— THE 1968 — Dijkstra 用分层 + 信号量造出第一个可证明的 OS
- [[unix-1974]] —— UNIX 1974 — 用极小内核做出能用的分时系统
