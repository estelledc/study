---
title: Doligez-Leroy GC — OCaml 多线程并发垃圾回收
来源: 'Doligez & Leroy. "A Concurrent, Generational Garbage Collector for a Multithreaded Implementation of ML". 1993'
日期: 2026-06-06
分类: 编程语言
子分类: 类型与 PL 理论
难度: 高级
---

## 是什么

这篇 1993 年论文为 **多线程 OCaml 运行时** 设计了 **并发、分代垃圾回收器（GC）**。应用在跑的同时，GC 线程在后台搬对象、扫堆，通过 **读屏障（read barrier）/ 写屏障（write barrier）** 保证应用线程不会看到「半搬走」的指针。

日常类比：像商场白天营业、夜间装修。并发 GC 是**边营业边装修**——工人（GC）挪货架时，顾客（应用线程）仍购物，但门口有安检（barrier）确保你不会拿到已搬空的地址。

## 为什么重要

不懂这篇，下面这些事说不清：

- 为什么 Go、Java G1、V8 都讲 **concurrent marking/evacuation**——思想可追溯到 90 年代 ML 运行时
- 为什么多线程语言必须区分 **并行 GC** 和 **并发 GC**
- 为什么 [[hindley-milner]] 类型的函数式语言也要面对**可变堆 + 多核**
- 为什么 read/write barrier 是 GC 论文里的高频词

## 核心要点

1. **分代假设**：年轻对象死得快 → 年轻代频繁小回收；老年代少回收。减少 STW（stop-the-world）次数。

2. **并发搬迁**：GC 与应用并行时，对象地址会变。应用读指针前过 **read barrier**，发现转发指针就跟随到新地址。

3. **多线程 ML 特有挑战**：可变字段、信号、C 互操作——barrier 必须覆盖所有堆访问路径，否则 use-after-move 崩溃。

## 实践案例

### 案例 1：read barrier 概念

```c
// 应用线程读堆指针时（伪代码）
value read_field(obj *o, int i) {
    value v = o->fields[i];
    if (is_forwarding_pointer(v))
        v = follow_forward(v);  // barrier：追到新地址
    return v;
}
```

### 案例 2：STW vs 并发对比

```text
STW GC:     应用全停 → 扫堆 → 应用继续   （停顿明显）
并发 GC:    应用跑 + GC 扫/搬并行        （停顿短，barrier 有开销）
```

### 案例 3：与现代 GC 对照

```text
Doligez-Leroy 1993  → OCaml 多线程 concurrent generational GC
Go GC / Java G1     → 并发标记清除/整理，同样依赖 barrier
JS V8 Orinoco       → 并发标记，主线程 barrier
```

读 barrier 代码要追踪所有 `Field(o)` 访问是否经 runtime 包装；C 扩展若直接 `((value*)o)[i]` 可能绕过 barrier，这是 GC bug 温床。

年轻代回收仍可短 STW；并发主要在老年代标记/整理。调优要看「应用线程 barrier 开销」与「STW 时长」的 P99 权衡曲线。

学现代 GC 建议配对读：本篇（并发搬迁）+ [[immix-mark-region]]（标记区域结构）；一个讲并发正确性，一个讲堆布局效率。

## 踩过的坑

1. **barrier 漏一条访问路径**：极难复现的 heap corruption——实现时要枚举所有读写字段入口。

2. **与 C FFI 交错**：C 代码持裸指针时 GC 搬对象 → 必须 pin 或禁止并发阶段。

3. **误以为并发 GC 无停顿**：仍有初始标记等短 STW；只是大幅缩短。

4. **分代策略不当**：晋升太快 → 老年代膨胀；太慢 → 年轻代重复扫描。

## 适用 vs 不适用场景

**适用**：
- 理解现代托管运行时 GC 设计
- 实现/调试带 barrier 的并发收集器
- 学 OCaml 多线程内存模型历史

**不适用**：
- 手动内存管理（C/Rust 无 GC）
- 实时系统硬实时保证（需专用 RTGC 或不用 GC）
- 入门 GC（先看标记-清除基础）


## 进阶话题（可跳过）

这一节把前文和工业落地再绑紧一点，方便你读完就能动手选型或读论文。

1. **正确性证明**：并发 GC 论文含不变式说明；实现者应对照证明查 barrier 覆盖。
2. **与并行 GC 区别**：并行=多 GC 线程；并发=GC 与应用同时跑——术语别混。
3. **Go 1.5+ 对照**：Go 并发标记借鉴同类思想；读 OCaml 原文有助于懂 Go release note。
4. **调试**：use-after-move 崩溃栈常远离根因；启用 GC 日志对拍转发指针。
## 历史小故事（可跳过）

- **1980s**：标准 ML 单线程 GC 成熟，[[hindley-milner]] 类型系统配套。
- **1993**：Doligez & Leroy 为多线程 OCaml 原型写并发分代 GC。
- **2000s+**：思想渗入 Java HotSpot、.NET、Go。
- **今天**：OCaml 5 多域并行仍站在同一 GC 传统上演进。

## 学到什么

1. **并发 GC = 算法 + 屏障 + 证明不变量**
2. **函数式语言也要解决可变堆与多核**
3. **1990 年代 PL 运行时论文仍在教现代 JVM/Go**
4. **read/write barrier 是并发搬迁的核心机制**

## 延伸阅读

- 论文 PDF：[concurrent-gc.pdf](https://xavierleroy.org/publi/concurrent-gc.pdf)
- [[hindley-milner]] —— 同一代 ML 类型/GC 文化圈
- [[standard-ml]] —— ML 家族运行时背景
- 《The Garbage Collection Handbook》并发 GC 章节

## 关联

- [[hindley-milner]] —— OCaml/ML 类型推导基础
- [[standard-ml]] —— ML 运行时与 GC 前身
- [[immix-mark-region]] —— 另一类现代 GC 结构创新


- 入门路径：先读「是什么」+「核心要点」，跑通一个最小案例后再翻「进阶话题」。
- 复习抓手：把「为什么重要」四条用自己的话复述一遍，能讲给同事即算掌握。
- 与仓库其他笔记：用文内 [[wikilink]] 跳到已写条目，别孤立读单篇。

- Xavier Leroy 主页有 PDF 与 slides 可下载。
- OCaml 5 多核文档延续 barrier 讨论。
- JVM G1 并发标记论文可作现代对照阅读。
- 实现并发 GC 先写顺序版再并发化是务实路径。
- 调试转发指针 bug 可用 GC 日志 + 影子堆。


## 读者练习（可跳过）

用 10 分钟做一个小练习，巩固上文：

1. 用自己的话向朋友解释「这篇解决什么问题」。
2. 从「实践案例」挑一个命令或代码块在本地或纸上走一遍。
3. 列出两个你会踩的坑，并写下规避句。

- 第 4 步：在「关联」里挑一篇未读笔记加入待读清单。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
