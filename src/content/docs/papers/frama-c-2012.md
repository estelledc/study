---
title: Frama-C — 一个开源平台把 C 程序的多种验证方法拼到一起
来源: 'Cuoq, Kirchner, Kosmatov, Prevosto, Signoles, Yakobowski, "Frama-C: A Software Analysis Perspective", SEFM 2012'
日期: 2026-05-31
分类: 形式化方法
难度: 中级
---

## 是什么

Frama-C 是一个**给 C 语言代码做形式化验证的开源平台**，全名 Framework for Modular Analysis of C，由法国 INRIA 和 CEA（原子能委员会）联合开发。

日常类比：像一家**装修施工平台**。同一套户型图（C 代码 + ACSL 注解），上面同时跑水电工（演绎验证）、结构工程师（抽象解释）、量房师（程序切片），各干各的活，但读同一套图、用同一种语言记录意见。

它的核心想法是：**别把各种验证方法做成互相孤立的工具，做成插件接到一个公共平台**。这样：

- 不同方法互相喂养（一个插件算出的事实给另一个当假设用）
- 程序员只学一种注解语言（ACSL）就能驱动多种分析
- 验证欧洲航空、核电的安全软件时，能拼出一条多重证据链

## 为什么重要

这篇论文重要不是因为提了一个新算法，而是因为它**奠定了"形式化验证平台"这个范式**。在它之前，做演绎验证的工具（VCC、VeriFast）和做抽象解释的工具（Astrée）几乎不来往。

不理解 Frama-C 平台思路，下面这些事都难解释：

- 为什么 Airbus / EDF 等安全关键软件会用静态分析工具链做证据（Frama-C 是其中开源平台路线）
- 为什么后来的分析工具更爱做成"共享内核 + 插件"，而不是每个方法各写一套前端
- 为什么 ACSL（C 的形式契约语言）成了类似 JML（Java）的事实标准

## 核心要点

Frama-C 的关键设计可以拆成 **三个层** 来看：

1. **共用前端 + 中间表示（CIL）**：把 C 源码翻译成 CIL（C Intermediate Language），所有插件读这个统一的、简化版的 C。类比：所有装修师傅看同一份 CAD 图纸，不再各自重新量房。

2. **共用注解语言 ACSL**：你在 C 代码注释里写形式化契约。类比：施工图纸边角上的标准化备注，水电、结构都看得懂。

   ```c
   /*@ requires n >= 0;
       ensures \result == n * (n + 1) / 2; */
   int sum_to_n(int n) { ... }
   ```

3. **插件互相喂养**：每个插件产出"已证明的事实"，存到公共数据库。下一个插件来跑时把这些事实当前提。类比：水电做完先告诉结构工程师"这堵墙不能开洞"，结构师就不用再自己去查。

三个主力插件（论文重点介绍；命名按今天习惯）：

- **Value Analysis（今称 EVA）**：抽象解释。自动算"每个变量在每个程序点可能的取值"
- **WP**：演绎验证。把 ACSL 契约 + C 代码 → 数学命题 → 丢给 SMT 求解器（Alt-Ergo / Z3 / CVC4）
- **Slicing**：程序切片。给定一个性质，抠出代码里与它相关的最小子集

## 实践案例

### 案例 1：用 WP 证明一个累加函数

```c
/*@ requires n >= 0;
    ensures \result == n * (n + 1) / 2; */
int sum(int n) {
  int s = 0;
  /*@ loop invariant 0 <= i <= n + 1;
      loop invariant s == (i - 1) * i / 2;
      loop variant n - i; */
  for (int i = 1; i <= n; i++) s += i;
  return s;
}
```

`requires` / `ensures` 是函数契约；`loop invariant` 是循环不变量；`loop variant` 是循环递减量（保证不死循环）。WP 把这些注解 + 代码翻译成数学命题，扔给 SMT，几秒返回"全部证明通过"。

### 案例 2：EVA 自动算取值范围

不写注解，直接对一个解析整数的函数跑 EVA：

```c
int parse(char *s) {
  int x = 0;
  while (*s) { x = x * 10 + (*s - '0'); s++; }
  return x;
}
```

EVA 输出："`x` 在循环内可能在 `[INT_MIN, INT_MAX]`，存在溢出风险"。**它没问你一个字**——这就是抽象解释的力量。

### 案例 3：插件之间喂养

先跑 EVA 算出 `n` 的范围 `[0, 100]`，存进公共数据库；再跑 WP 时，WP 把 "n ≤ 100" 当假设用，原本要程序员手写的循环不变量被自动收紧，证明负担小了。

## 踩过的坑

1. **ACSL 注解写错比 C 代码写错更难发现**：注解不会运行，错了只会让证明失败或产生假阴性。论文反复强调要把 ACSL 当代码一样审。

2. **WP 证明失败 ≠ 程序有 bug**：90% 的失败是循环不变量不够强。新手会以为找到了 bug，其实是没把"程序员脑子里的事实"写成 ACSL。

3. **EVA 在指针密集代码上精度崩塌**：链表、树、`void *` 一多，取值集合就退化成"任意"。这时要切换到 WP 或加注解。

4. **插件版本耦合**：插件共享中间表示，主版本一升所有插件要重编。CI 要锁版本。

## 适用 vs 不适用场景

**适用**：
- 嵌入式 C 关键系统（航空、核电、汽车 ISO 26262）
- 已有 C 代码做事后验证，不想重写成 Rust / Ada / SPARK
- 教学：让学生看到"演绎 vs 抽象解释"两种范式跑同一份代码
- 中等规模代码（几千到几万行 C），既不太小（直接 review）也不太大（百万行级别 EVA 会超时）

**不适用**：
- C++ / Rust / 其他语言（Frama-C 只吃 C）
- 完全动态行为（dlopen、自修改代码）
- 想要"一键证明"——ACSL 注解写起来比 C 代码本身慢 3-5 倍
- 强依赖外部库（libc 之外）的应用代码——库的 ACSL 契约缺失就证不动

## 历史小故事（可跳过）

- **2000 年代初**：CEA 内部做 C 静态分析工具 Caduceus / Why；INRIA 做 Frama-C 雏形
- **2008 年**：两边合并成今天的 Frama-C，第一个公开版本（Hydrogen）
- **2012 年**：本论文发表，Frama-C 已有 10+ 插件，被航空和核电行业用上
- **2010s 中后期**：EVA 替换旧的 Value Analysis；WP 替换旧的 Jessie；插件生态稳定下来
- **现在**：每年一个版本（按化学元素命名：Hydrogen → Beryllium → Carbon → ... → 30+ 元素）

化学元素命名是个细节但有意思：每年新版本递进一格，团队用元素周期表给版本号背书"严肃科学工具"的气质。

## 学到什么

1. **平台 vs 工具**：把多种验证方法做成插件比做成独立工具，威力指数级放大——不同分析能互相做证据
2. **共用契约语言的价值**：ACSL 让 EVA / WP / 运行时检查器读同一份意图描述，避免"换一个工具重写一遍注解"
3. **抽象解释 + 演绎验证互补**：抽象解释自动但精度有限；演绎精确但要人写不变量。组合起来覆盖更广
4. **工业落地的现实**：能上飞机和核电站不是因为算法最聪明，而是因为**工具链稳定 + 注解可审计 + 多种证据互相印证**
5. **范式上推**：先用 EVA 跑一遍粗略全景，再用 WP 精修关键函数，再用 Slicing 挑出最小证据子集——这种"由粗到精的验证流水线"比单一精度工具更适合大型代码库

## 延伸阅读

- 官方文档：[Frama-C User Manual](https://frama-c.com/download/frama-c-user-manual.pdf)（介绍各插件用法）
- ACSL 规范：[ACSL Reference Manual](https://frama-c.com/download/acsl.pdf)（契约语言完整语法）
- 论文 PDF：[Frama-C SEFM 2012](https://www.normalesup.org/~kosmatov/articles/frama-c.pdf)（17 页综述，密度适中）
- 实战教程：[Frama-C Tutorial](https://www.frama-c.com/html/tutorial.html)（从安装到第一个 ACSL 证明）
- [[astree]] —— 仅做抽象解释、闭源、Airbus 专用的同代竞品
- [[cousot-abstract-interpretation]] —— EVA 插件背后的统一数学框架

## 关联

- [[astree]] —— 只做抽象解释的闭源工具，对比 Frama-C 的"多方法 + 开源"
- [[cousot-abstract-interpretation]] —— EVA 插件的理论基础
- [[hoare-logic]] —— WP 插件的演绎根基（前置/后置条件）
- [[boogie-2005]] —— 同代的"通用验证后端"，Frama-C 的 WP 也走类似路线
- [[fstar]] —— 把演绎验证做进编程语言本身，Frama-C 走的是事后注解路线
- [[liquid-types]] —— 演绎验证的轻量替代，验证负担更小但表达力较弱

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[apron-2009]] —— Apron — 把区间/八边形/多面体塞进同一个插槽
- [[astree]] —— ASTRÉE 分析器 — 让飞机控制代码的静态分析做到零警告
- [[certikos-2016]] —— CertiKOS — 把整个并发内核拆成 30 多层每层都被 Coq 证过
- [[cousot-abstract-interpretation]] —— Cousot 抽象解释 — 给静态分析一套统一数学框架
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[hyperkernel-2017]] —— Hyperkernel — 让 SMT 求解器一键验证操作系统内核
- [[liquid-types]] —— Liquid Types — 让编译器自己推导出"哪些值才合法"
- [[vcc-2009]] —— VCC — 给并发 C 加注解，让 SMT 自动证它对

