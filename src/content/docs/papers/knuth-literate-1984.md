---
title: Literate Programming — Knuth 1984 文学化编程与 WEB 系统
来源: http://www.literateprogramming.com/knuthweb.pdf
日期: 2026-06-13
分类: 其他
子分类: 工程文化
难度: 入门
provenance: pipeline-v3
---

## 是什么

1984 年，Donald E. Knuth 在 *The Computer Journal* 上发表 **Literate Programming**（文学化编程）。这篇论文不是又一种新语法糖，而是对「程序该怎么写、怎么读」的一次立场鲜明的翻转：

> **程序首先是写给人类阅读的文献，其次才是交给机器执行的指令。**

Knuth 在斯坦福写 TeX 排版系统时，把这套思想落成了 **WEB** 语言与工具链。论文用实例展示 WEB，并解释为什么它比「先写代码、后补注释」的传统流程更合理。

日常类比：想象你在写一本**带插图的菜谱**，而不是先写一张冷冰冰的配料表再另附说明。

- **传统编程**像先交厨房机器一份「步骤 1、步骤 2、步骤 3」的操作清单，说明书是事后贴的便利贴——读者要在「代码文件」和「文档文件」之间来回跳。
- **文学化编程**像作者从第一页就按「为什么做这道菜 → 这一步的火候原理 → 具体用量与操作 → 和下一章如何衔接」来写；同一套源稿，印厂可以排出**给人看的精美菜谱**（WEAVE），后厨也可以抽出**可执行的配方卡**（TANGLE）。

Knuth 把复杂软件看成一张 **web（网）**：由许多简单片段编织而成，片段之间通过命名与引用相连。理解系统，就是沿着这张网读下去，而不是从 `main` 一路硬啃到底。

## 历史背景

| 时间 | 事件 |
|------|------|
| 1970s | Knuth 开发 TeX，需要同时维护算法与高质量文档 |
| 1983 | Stanford 技术报告 *The WEB System of Structured Documentation*（WEB 用户手册） |
| 1984 | 本文发表于 *The Computer Journal* 27(2)，正式提出 literate programming 术语 |
| 1987 | Silvio Levy 将 WEB 改编为 **CWEB**，面向 C / C++ |
| 1992 | Knuth 出版文集 *Literate Programming*（CSLI Lecture Notes 27），收录本文及 TeX 程序节选 |

同一时期，业界主流仍是「源码 + 独立文档」。结构化编程（Dijkstra）解决的是控制流纪律；Parnas 的信息隐藏解决的是模块边界。Knuth 补上的问题是：**人类读者按什么顺序、什么粒度，才能把程序当成连贯叙述来理解？**

## 为什么重要

不理解文学化编程，下面这些事很难放在同一张图上：

- 为什么 Knuth 的 TeX、METAFONT 源码本身可以成为排版精美的书籍（*Computers & Typesetting* 卷 B、D）
- 为什么「注释写得好」和「程序结构适合阅读」不是一回事——注释是外挂，文学化是**源文件即文档**
- 为什么 Jupyter Notebook、R Markdown、Swift Playground 等「叙述 + 可执行块」工具会让人感到熟悉
- 为什么现代文档生成器（Sphinx、Rustdoc 内嵌示例、doctest）都在不同程度上追逐「单一真相来源」

论文的深层主张：**可维护性来自可读性；可读性来自作者对叙述顺序的掌控，而不是来自编译器要求的文件顺序。**

## 核心概念

### 1. 两个受众、两种产物

WEB 把一份源文件同时服务两个目标：

| 工具 | 输入 | 输出 | 服务对象 |
|------|------|------|----------|
| **WEAVE** | `.web` / `.w` | `.tex` → PDF | 人类读者（带索引、交叉引用、排版） |
| **TANGLE** | `.web` / `.w` | `.p` / `.c` 等 | 编译器 / 机器 |

同一份 WEB 源是 **single source of truth**：不会出现「文档里的伪代码和真代码分叉」那种经典腐烂。

### 2. 程序是超文本，不是线性磁带

Knuth 早在万维网（WWW）之前就用了 **WEB** 这个名字。每个片段（section / chunk）有名字，可以：

- 按**叙述顺序**排列（先讲动机，再讲数据结构，再讲主算法）
- 通过 **«chunk name»** 引用，让 TANGLE 按依赖关系拼出编译器需要的顺序

这类似「写百科词条」：读者从概述点进细节；机器则从依赖图拓扑排序出可编译单元。

### 3. 文学性：解释「为什么」，而不只是「是什么」

文学化编程鼓励：

- 用自然语言交代不变式、复杂度、设计取舍
- 在局部可见的范围内展示结构（不要逼读者翻十个文件才看见一个 `if` 的上下文）
- 把算法讲成故事，代码块是故事里的「公式」

Knuth 认为：**好的程序员本来就会写说明性文字**；WEB 只是把文字和代码锁在同一份可验证的源里。

### 4. WEB = 文档语言 + 编程语言

原型 WEB 组合的是 **TeX**（排版）与 **Pascal**（算法）。CWEB 则换成 **C/C++**。Neither alone is enough：

- 纯 TeX 无法机械生成可执行系统
- 纯 Pascal/C 的语法顺序是为编译器优化的，不是为读者优化的

### 5. 块（chunk）与 «引用»

WEB/CWEB 源由交替的「TeX 叙述段」和「代码段」组成。代码段可命名，例如 `@<Initialize the table@>=` … `@>`；别处用 `«Initialize the table»` 拉入。TANGLE 展开所有引用，生成完整源文件；WEAVE 则保留章节结构并生成索引。

### 6. 与结构化编程、信息隐藏的关系

- **结构化编程**：控制流应可推理（Dijkstra 反对随意 `goto`）
- **信息隐藏**：模块应隐藏易变决策（Parnas）
- **文学化编程**：**呈现顺序**应服务于人类理解，由作者编排，工具负责重排给机器

三者正交，可以同时遵守。

### 7. 代价与局限

Knuth 本人也承认：WEB **不是给初学者用的**——你需要同时熟悉 TeX 和宿主语言。工具链（WEAVE/TANGLE）增加构建步骤；团队若没有「文档即源码」的文化，收益会打折扣。

## 代码示例一：CWEB 风格的素数筛（概念示意）

下面是一段 **简化示意**（非完整可编译文件），展示叙述与代码如何交织。`@c` 引入 C 代码，`@` 段标记 chunk 名：

```cweb
@* Prime Numbers.
This program prints primes up to @{n@}, using Eratosthenes' sieve.
We explain the invariant before showing the code.

@<Global constants@>=
#define MAX 1000

@ The sieve marks composites in @|table[]|@.
@<Sieve setup@>=
char table[MAX + 1];
for (int i = 2; i <= n; i++) table[i] = 1;

@<Main program@>=
int main(void) {
  int n = 100;
  «Sieve setup»;
  for (int p = 2; p <= n; p++)
    if (table[p]) {
      printf("%d\n", p);
      for (int k = 2 * p; k <= n; k += p) table[k] = 0;
    }
  return 0;
}
```

**读者路径**：先看目标与不变式，再进 `main`，需要时跳进 `«Sieve setup»`。

**TANGLE 路径**：把 `«Sieve setup»` 展开进 `main` 之前，得到编译器习惯的扁平 `.c` 文件。

## 代码示例二：用 chunk 拆分「读入—处理—输出」

第二个例子强调 **叙述顺序 ≠ 编译顺序**。作者想先讲输出格式，再讲解析，TANGLE 仍可按引用拼出正确程序：

```cweb
@* A tiny word-count filter.
We present sections in pedagogical order: output, then processing, then parsing.

@<Print the report@>=
void print_report(int words, int lines) {
  printf("%d lines, %d words\n", lines, words);
}

@<Process one line@>=
int count_words(const char *line) {
  int n = 0, in_word = 0;
  for (; *line; line++) {
    if (isspace((unsigned char)*line)) in_word = 0;
    else if (!in_word) { in_word = 1; n++; }
  }
  return n;
}

@<Driver@>=
int main(void) {
  char buf[256];
  int lines = 0, words = 0;
  while (fgets(buf, sizeof buf, stdin)) {
    lines++;
    words += count_words(buf);
  }
  print_report(words, lines);
  return 0;
}
```

传统写法往往被迫 `main` 置顶；文学化写法允许 **先写 `print_report` 给读者看终点**，再在文末用 `«Driver»` 收束。现代语言里，你仍可用任意拓扑顺序组织源文件，但 WEB 在 **1980 年代就把「可重排片段 + 命名引用」工具化**了。

## 工具链一瞥

```text
           ┌─────────────┐
  foo.w ──►│   WEAVE     │──► foo.tex ──► PDF（给人读，带索引）
           └─────────────┘
           ┌─────────────┐
  foo.w ──►│   TANGLE    │──► foo.c  ──► 编译器 ──► 可执行文件
           └─────────────┘
```

CWEB 对应工具名为 **CWEAVE** / **CTANGLE**。Knuth 的 TeX、METAFONT、MMIX 模拟器等大型程序均以 `.w` 源维护，并出版与代码一致的纸质文献。

## 与现代工具的对照

| 思想 | WEB/CWEB (1984) | 现代近似物 |
|------|-----------------|------------|
| 叙述 + 代码同一源 | `.w` 文件 | Jupyter、R Markdown、Quarto |
| 从源生成排版文档 | WEAVE → TeX | Sphinx、MdBook、LaTeX `\lstinline` |
| 从源抽取可执行代码 | TANGLE | Literate Haskell、`noweb`、部分 build 脚本 |
| 命名片段与拼装 | `«chunk»` | 语言内模块、include，或自定义宏 |
| 交叉引用与索引 | WEAVE 自动生成 | IDE、LSP、doc 站内链 |

差异在于：WEB 是为 **长时间维护的大型系统** 设计的工业级工具链，不是单次数据分析笔记本；但其哲学直接影响了后来「可执行文档」整条谱系。

## 论文中的 WEB 哲学摘录（意译）

- 复杂软件最好被看作 ** delicately pieced together web**，理解局部与邻接关系即理解整体。
- 程序员需要 **同时** 掌握排版语言与编程语言；各擅其一都不够。
- 目标是 **state-of-the-art documentation** 与 **robust, portable** 程序并存，而非二选一。
- 调试时间应显著下降——当你读的是连贯文章时，错误更容易定位在「哪一段叙述承诺了什么」。

## 常见误解

| 误解 | 澄清 |
|------|------|
| 「就是多写注释」 | 注释附属于代码；文学化源 **同时生成** 文档与程序，叙述结构是首要的 |
| 「反对结构化编程」 | Knuth 与 Dijkstra 争论过 `goto`，但文学化关注的是 **文档化与顺序**，不是破坏结构 |
| 「只适合 TeX 生态」 | 思想可移植；CWEB、`noweb`、Org Babel 等都是变体 |
| 「小项目用不上」 | 小项目收益小；TeX 级复杂度时，单一真相来源的收益才显现 |

## 与 TeX 巨著的关系

Knuth 把 WEB 用于 **TeX: The Program**、**METAFONT: The Program** 等书：书中排版精美的代码列表，就是从同一份 `.web` WEAVE 出来的。这是文学化编程最硬核的「狗食」——不是幻灯片理念，而是数十年生产系统。

## 学习路径建议

1. **读本文 PDF**（约 12 页），抓住 WEB / WEAVE / TANGLE 三角关系。
2. **浏览** Stanford CWEB 页面上的 [cweb.pdf](http://www.literateprogramming.com/cweb.pdf) 用户手册前几章，看真实 `@` 语法。
3. **对照** 任意一篇 Jupyter 教程，思考：哪些块是「叙述」，哪些是「可被测试的 chunk」。
4. **可选动手**：安装 `cweb`，编译官方 `cweave.w` / `ctangle.w` 迷你示例，体验一次 TANGLE 输出。

## 自测题

1. WEAVE 和 TANGLE 各解决什么问题？输入输出是什么？
2. 为什么 Knuth 说程序像 **web** 而不是 **tree**？（提示：多向引用与片段复用）
3. 叙述顺序与编译顺序不一致时，WEB 如何避免混乱？
4. 文学化编程与「结构化编程」「信息隐藏」分别解决哪一层问题？
5. 你今天用的哪些工具，可以看成文学化编程思想的「轻量化后代」？

## 延伸阅读

- Donald E. Knuth, *Literate Programming*, CSLI Lecture Notes 27, 1992（文集，含修订版本文）
- Knuth & Levy, *The CWEB System of Structured Documentation*（CWEB 手册）
- D. E. Knuth, *TeX: The Program*（WEB 源 WEAVE 成书的范例）
- Norman Ramsey, **noweb** — 更轻量的文学化编程工具，影响许多课程作业模板

## 一句话总结

**Literate Programming 把程序写成给人读的文献，用 WEAVE 排出书籍、用 TANGLE 抽出机器码；Knuth 用 WEB 证明：文档与源码不必是两份真相，而可以是同一张用叙述编织的网。**
