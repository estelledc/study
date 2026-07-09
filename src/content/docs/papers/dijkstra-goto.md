---
title: 'Dijkstra 1968 — Go To Statement Considered Harmful'
description: '1968 年 3 月 Dijkstra 写给 CACM 的不到 1000 字 letter，论证 goto 让源代码的静态文本顺序与运行时执行顺序错位、状态难以推理。结构化编程三件套（顺序/选择/循环）让每个文本位置的前置条件可由前面的代码唯一确定，是 Hoare 1969 公理化语义和现代类型系统的起点。'
来源:
  - 'Edsger W. Dijkstra. Letters to the editor: Go to statement considered harmful. CACM 11(3):147–148, 1968.'
  - 'Donald E. Knuth. Structured Programming with go to Statements. Computing Surveys 6(4):261–301, 1974.'
  - 'Corrado Böhm, Giuseppe Jacopini. Flow diagrams, Turing machines and languages with only two formation rules. CACM 9(5):366–371, 1966.'
状态: 已读
分类: 软件工程 / 控制流理论
tags:
  - 控制流
  - 结构化编程
  - 软件工程史
  - 形式化证明
---

# Dijkstra 1968: Go To Statement Considered Harmful

> 不到 1000 字的 letter，定义了之后 50 年怎么谈论控制流。

## 一句话核心

goto 让程序员无法用源代码位置推断运行时状态；只用顺序/选择/循环三件套，每个位置的前置条件可机械推导，正确性证明才有立足点。这是 Hoare 1969 公理化语义、Wirth Pascal、现代证明助理的共同起跑线。

## 是什么

1968 年 3 月，Dijkstra 给 CACM 写了一封读者来信，篇幅不到一页，标题被编辑 Wirth 改成现在这版。它没有数学证明，没有数据，没有大段代码示例，只把一个朴素直觉说清楚：

- 程序员推理代码靠的是「读到第 N 行 = 完成了前面 N-1 行」这种文本到状态的对应；
- goto 把控制流变成一张可以随意跳转的图，第 50 行可能是从 5 个不同地方跳过来的，状态不再唯一；
- 所以 goto 让程序「难以推理」，应该尽量避免。

它早 NATO 软件危机会议 7 个月，正好踩在「软件危机」这个词被命名的前夜。

## 为什么重要

它不是发现了新算法，而是改变了讨论控制流的语言。

- 给 [hoare-logic](/study/papers/hoare-logic/) 公理化语义提供了讨论对象——Hoare 1969 给三件套写了推理规则；
- 间接催生 Pascal（Wirth，1970），第一个语法上完全去掉 goto 的主流语言；
- 1995 年 Java 把 goto 列为保留字但不实现，传承的是这条线；
- 真正持久的不是「禁止 goto」这个工程主张，而是「控制流的可推理性」这个评价坐标。

之后所有「X Considered Harmful」式文章都在借它的句式。

## 核心要点

- 静态文本顺序：源代码空间维度，从第 1 行到第 N 行；
- 动态执行顺序：运行时状态转换的时间维度；
- goto 让两者错位，同一文本位置可对应多种执行历史；
- 三件套（sequence/selection/iteration）保证文本位置的前置条件由前面的代码唯一确定；
- Böhm-Jacopini 1966 已证三件套图灵完备：goto 不是表达力问题，是风格问题；
- 循环不变量是把「可推理性」落到实处的工具：进入前 Inv 真，每轮迭代后 Inv 仍真，退出时 Inv ∧ ¬cond；
- 控制流图视角：结构化程序的 CFG 是「可约的」（reducible），有自然循环结构；goto 满天飞会产生不可约 CFG，让编译器循环优化非常痛苦；
- 进度感（progress）来自文本位置：在 sequence 中执行到第 N 行就等价于完成了前 N-1 行，这种简单对应是程序员脑内推理的全部地基。

## 实践案例

Linux 内核 fork.c 的 copy_process 函数：资源逐级申请，出错反向跳到 cleanup label 集中释放。这是 C 里最干净的写法，因为 C 没有 try-finally、没有 RAII。

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

只向前跳，目标都是 cleanup label，等价于其他语言的 try-finally。Linus 在 LKML 反复辩护这种写法。

## 踩过的坑

把 letter 当教条。Dijkstra 真正反对的是无约束跳转，cleanup label 这种受限 goto 不在他的射程里；写出嵌套五层的 if-else 反而更难证明。

忽略语言能力差异。在 C++/Rust 里 RAII 让 goto cleanup 没必要；在 C 里硬不用 goto 才是反例。要先看语言提供了什么资源管理机制，再决定怎么写。

把 break label 当成偷偷复活的 goto。它有三道护栏：词法可见、只能向前/向外、目标必须是已声明 label，不会破坏可约 CFG。

只看 letter 长度判断重要性。letter 出名是「时机 + 句式 + 权威 + 编辑改标题」的合力，跟思想强度未必成正比。同样观点在 1958 年发表或换无名作者写，可能完全埋没。

把「结构化编程」等同于「函数式编程」。结构化只管控制流要不要被无约束跳转污染，不变量推理是它的核心；不可变数据、纯函数是后来 Backus、Hughes 那条线的话题，是另一个量级的约束。

## 适用

控制流推理：写循环时主动找不变量；分支后写下「此处状态 P ∧ cond」；这是 Hoare 三元组的入门姿势。

代码评审：看到向后跳的 goto 立刻警觉；看到向前跳到 cleanup label 的 goto 在 C 里不必反对。判断标准是「跳转目标的前置条件是否仍能由前面代码唯一推出」。

语言选型：看一门新语言怎么处理控制流（顺序/选择/循环/异常/并发），就能看出它的设计哲学和 1968 年这条线的距离。Pascal/Java 完全去掉 goto 是一个端，C/Go 保留受限版是另一个端，Rust 的 'label loop break value 是受限版上的进一步精化。

写论文/写文档：「Considered Harmful」句式是借来的。要用就要把对手的具体场景写清楚，而不是只丢一个标签——这恰是这封 letter 的反面教材式启示。

不适用：把它当成「所有跳转都有罪」的教条。Knuth 1974 已经在更细的颗粒度上做过平衡。

## 历史小故事

letter 原标题是 "A case against the goto statement"，平淡。CACM 编辑 Wirth（后来发明 Pascal）把它改成 "Go To Statement Considered Harmful"，挑衅性句式从此成为模板。

Dijkstra 当时是 [algol-60](/study/papers/algol-60/) 委员会成员，刚做完 THE 多道操作系统，正在思考程序怎样可证明。letter 比 NATO Garmisch 软件危机会议早 7 个月，恰好踩在「software crisis」这个词被命名的前夜。

[knuth-taocp](/study/papers/knuth-taocp/) 作者 Knuth 1974 写了 40 页平衡论 "Structured Programming with go to Statements"，列举多重循环退出、错误清理、状态机三类合理 goto 场景，态度是「教条不要走极端」，不是反对 Dijkstra。

1987 年 Frank Rubin 发表 "'GOTO Considered Harmful' Considered Harmful"，反讽元论文，标志这个句式已经走向自我解构。后续还出现了 Pointers Considered Harmful、Null References: Billion Dollar Mistake 等回声。

Java 1995 年发布时把 goto 列为保留字但不实现——一个把否定写进语法的姿态。Pascal、Modula-2、Oberon 这条 Wirth 系语言全部 goto-free。C 保留 goto 是 Dennis Ritchie 的务实选择：贴近硬件，编 Unix 内核需要它。

## 学到什么

抽象层洞察和工程层禁令要分开。Dijkstra 在数学层面是对的（goto 让证明难），Linus 在工程层面也是对的（C 没 RAII，goto cleanup 最干净）。换层次时永远问：作者在哪个层次主张？换到我的语境还成立吗？

革命想消灭 X，结果 X 化身为 X'。goto 没被消灭，它演化成 break label / continue label，护栏更紧但本质相同。CISC vs RISC、容器 vs 虚拟机都有类似剧情：极端对立最后落到「受限版 X 仍在用」。

letter 让人出名，长期工作让人成大师。Dijkstra 因这封信被记住，但他真正的贡献是 EWD 手稿、最弱前置条件、formal program derivation——这些影响了 Coq、Lean、Agda 一整代证明助理。把 letter 和 EWD 混为一谈，会低估他的真实贡献。

经典不一定长。Watson-Crick 1953 年 DNA 双螺旋论文也只有 1 页，Shannon 1948 信息论很厚但核心定理只有一个。长度不代表深度，挑衅性句式可以放大一个清晰洞察的传播力。

读这封 letter 自己写代码时多了一个习惯：写循环之前先写不变量，写分支之前先写「此处 P ∧ cond」，让源代码里每一行都对应一个可推断的状态。这就是 Dijkstra 想给程序员的肌肉记忆。

## 延伸阅读

- Hoare 1969 公理化语义：见 [hoare-logic](/study/papers/hoare-logic/)，给三件套配推理规则；
- Knuth 1974 平衡论：列举 goto 仍合理的具体场景，态度不是反 Dijkstra 而是反教条；
- Böhm-Jacopini 1966：三件套图灵完备的证明，Dijkstra 的理论后盾；
- Wirth 1971 Stepwise Refinement：把结构化编程升级为方法论，Pascal 的设计哲学；
- Linus Torvalds 2003 LKML 邮件：从内核工程视角辩护 goto cleanup，工程派代表论据；
- Frank Rubin 1987 反讽元论文：把"Considered Harmful"句式自身列为有害，标志这条话语线已成熟。

## 关联

- 数学根基：[turing-1936](/study/papers/turing-1936/) 给「可计算」奠基，三件套是它在高级语言里的投影；
- 同代家族：[algol-60](/study/papers/algol-60/) 是 Dijkstra 关心的语言，第一次有 if-then-else 但也仍允许 goto；
- 推理工具：[hoare-logic](/study/papers/hoare-logic/) 把三件套的可推理性形式化为推理规则；
- 工程参照：[knuth-taocp](/study/papers/knuth-taocp/) 作者后来写 Structured Programming with go to Statements 做平衡；
- 句式回声：后续 Pointers Considered Harmful、Null References Considered Harmful 一脉，都借这个句式。

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
