---
title: On the Criteria To Be Used in Decomposing Systems into Modules — Parnas 1972 信息隐藏与模块化准则
来源: https://www.win.tue.nl/~wstomv/edu/2ip30/references/criteria_for_modularization.pdf
日期: 2026-06-13
子分类: 工程文化
分类: 其他
难度: 入门
provenance: pipeline-v3
---

## 是什么

1972 年 12 月，David L. Parnas 在 *Communications of the ACM* 上发表 **On the Criteria To Be Used in Decomposing Systems into Modules**（分解系统为模块时应采用的准则）。这篇论文常被视作 **信息隐藏（Information Hiding）** 思想的奠基文献之一——不是发明「把程序拆成文件」这种常识，而是回答一个更尖锐的问题：

> **同样能跑、同样拆成 N 个模块，为什么有的拆法让改一处牵全身，有的拆法却让团队并行、局部替换、长期演进都更轻松？**

日常类比：装修一套房子，你可以按「施工工序」分包——先水电队、再泥瓦队、再油漆队；也可以按「房间功能」分包——厨房包给一家、卫生间包给另一家，每家内部自己决定瓷砖怎么铺、管子怎么走。工序分包在流程图上一目了然，但只要你决定「水管改走吊顶」，水电、泥瓦、油漆三家都要改接口；功能分包则把「厨房水管怎么走」藏进厨房模块，换瓷砖不必通知卫生间承包商。

Parnas 用一个小系统 **KWIC 索引**（Key Word In Context，关键词上下文索引）做思想实验：输入多行文本，对每行做「循环移位」（把行首词移到行尾），再按字母序输出所有移位结果。系统小得一个熟练程序员一两周能写完，但论文故意把它当成「大项目」来拆，对比两种模块化方案，证明 **拆模块的准则比「拆成几块」本身重要得多**。

## 历史背景

| 时间 | 事件 |
|------|------|
| 1968 | Dijkstra 发表 *THE* 多道程序系统，展示层次化结构 |
| 1970 | Gauthier & Pont 教科书描述「模块化」好处，但很少谈**按什么准则切分** |
| 1971 | Parnas 技术报告初稿；同年提出 information hiding 概念 |
| 1972-05 | Parnas 发表模块规格说明技术（ACM 15(5)） |
| 1972-12 | 本文正式发表，成为软件工程经典 |

当时业界已能「分模块编译、单独替换目标文件」，大型程序也在用模块化技术——但 Parnas 指出：**很多失败的大系统恰恰高度模块化，问题出在切分准则错了**。大家习惯从流程图出发，把每个处理步骤变成一个模块；他主张从 **易变的设计决策** 出发，让每个模块隐藏一个决策。

## 为什么重要

不理解这篇论文，下面这些事很难放在同一张设计图上：

- 为什么「按 Controller / Service / Repository 三层」有时只是换了个名字的流程图拆分
- 为什么数据库表结构一变，半个代码库跟着改——往往是模块边界泄露了存储格式
- 为什么好的 API 只暴露「做什么」，尽量不暴露「怎么做、用什么数据结构」
- 为什么微服务争论的焦点不是「拆不拆」，而是 **边界按业务能力还是按流水线步骤**

论文还提前点破了后来几十年的张力：**信息隐藏式拆分若强行实现成「每个函数一次跨模块过程调用」，可能更慢**；需要汇编级内联、链接期拼装等实现手段——这与今天「小函数 + LTO」「header-only + 编译器内联」是一脉相承的。

## 核心概念

### 1. 模块化 ≠ 把流程图切成子程序

**分解 1（传统）**：Input → Circular Shift → Alphabetize → Output → Master Control。每个模块对应流水线的一个大步骤，模块之间通过 **具体的表格式、指针约定、内存布局** 通信。

**分解 2（信息隐藏）**：Line Storage、Input、Circular Shifter、Alphabetizer、Output、Master Control。模块按 **所隐藏的设计决策** 划分；Circular Shifter 可能根本不建表，而是按需计算字符；Alphabetizer 也可能延迟排序，外部看不出何时完成排序。

关键句（意译）：**每个模块由它所知道、并对外界隐藏的那个设计决策来刻画；接口应尽可能少暴露内部机制。**

### 2. 信息隐藏（Information Hiding）

隐藏的不是「数据本身」，而是 **可能变化的决策**，例如：

- 行文本存在内存里还是磁盘上
- 字符是每字一词还是四字打包
- 循环移位是预计算索引表还是惰性求值
- 字母序是一次性排好还是按需查找

接口提供抽象操作（如 `CHAR(line, word, char)`、`CSCHAR(shift, word, char)`），调用方 **不应依赖** 行在内存里如何 packing、移位表是否存在。

### 3. 可变更性（Changeability）

论文列了五类常见变更，对比两种拆法的影响范围：

| 变更 | 分解 1（按步骤） | 分解 2（按决策） |
|------|------------------|------------------|
| 输入格式 | 主要影响 Input | 主要影响 Input |
| 行不全部驻留内存 | **几乎每个模块** | 主要影响 Line Storage |
| 字符打包方式改变 | **所有模块**（共享内存格式） | **仅 Line Storage** |
| 移位：预计算表 vs 按需计算 | Alphabetizer、Output 也受影响 | **仅 Circular Shifter** |
| 排序：一次性 vs 延迟 / Hoare FIND | Output 依赖完成时机 | **仅 Alphabetizer** |

这就是信息隐藏的工程回报：**把变更关在做出该决策的模块里**。

### 4. 独立开发（Independent Development）

分解 1 的接口是「复杂表格 + 指针布局」，设计这些格式是 **跨组联合工作**，因为表格效率与各模块算法纠缠在一起。

分解 2 的接口是 **函数名 + 参数类型/个数**，决策简单得多，各组可以更早并行——前提是接口稳定且足够抽象。

### 5. 可理解性（Comprehensibility）

要理解分解 1 里的 Output，你得懂 Alphabetizer 怎么排、Circular Shifter 怎么建表、Input 怎么 packing——**系统只能作为整体被理解**。

分解 2 里你可以单独研读 Alphabetizer 的规格，把它当成「给定抽象移位序列，提供 `ITH(i)` 字母序下标」的黑盒。

### 6. 模块是责任分配，不一定是子程序

Parnas 明确说：文中的 **module 是 responsibility assignment（责任分配）**，不是「一个 .c 文件」或「一个 subroutine」。最终实现时，可以把多个模块的代码 **内联拼装** 进同一个子程序，以避免过程调用开销——模块边界存在于设计与文档中，运行时未必一一对应。

### 7. 层次结构 vs 干净分解

两者 **独立且都想要**：

- **层次（partial order「uses / depends on」）**：底层可单独复用（如 Line Storage 可用于问答系统）
- **干净分解**：隐藏决策、接口稳定

可以有层次但接口泄露实现；也可以接口干净但模块两两依赖、没有清晰层次。KWIC 的分解 2 同时兼顾两者。

### 8. 不要按时间顺序切模块

处理步骤的先后顺序 **不应** 作为模块边界的主要依据。设计决策往往 **横跨多个执行阶段**——Line Storage 几乎贯穿全程，Alphabetizer 与 Circular Shifter 在时间上重叠或可按不同策略交错。

## KWIC 问题简述

**输入**：有序的行集合；每行是有序词序列；每词是有序字符序列。

**循环移位（circular shift）**：反复把行首词移到行尾，得到该行所有旋转版本。

**输出**：所有行的所有循环移位，按字母序列出。

例子：行 `THE QUICK BROWN FOX` 的移位包括 `THE QUICK BROWN FOX`、`QUICK BROWN FOX THE`、`BROWN FOX THE QUICK` 等，最终与其它行的移位一起排序输出。

## 实践案例

### 案例 1：按流水线拆 vs 按存储决策拆（Python 示意）

**分解 1 风格**——模块共享「行在内存中的列表结构」，一改全改：

```python
# 全局共享格式：lines[i] 是 list[str]，所有步骤都依赖此结构
lines: list[list[str]] = []

def input_module(raw_text: str) -> None:
    global lines
    lines = [line.split() for line in raw_text.strip().split("\n")]

def circular_shift_module() -> list[tuple[int, int]]:
    # 返回 (原行号, 旋转次数)——与 lines 内存布局强耦合
    index = []
    for i, words in enumerate(lines):
        for k in range(len(words)):
            index.append((i, k))
    return index

def alphabetize_module(index: list[tuple[int, int]]) -> list[tuple[int, int]]:
    def key(item):
        i, k = item
        rotated = lines[i][k:] + lines[i][:k]
        return " ".join(rotated)
    return sorted(index, key=key)

def output_module(sorted_index: list[tuple[int, int]]) -> None:
    for i, k in sorted_index:
        rotated = lines[i][k:] + lines[i][:k]
        print(" ".join(rotated))
```

若要把 `lines` 改成「磁盘上的流式存储」或「四字一组打包」，**Circular Shift、Alphabetize、Output 全要改**。

**分解 2 风格**——隐藏「行如何存储」，只暴露抽象访问：

```python
class LineStorage:
    """隐藏：词列表 / 压缩存储 / 磁盘页缓存等决策"""

    def __init__(self) -> None:
        self._lines: list[list[str]] = []

    def add_line(self, words: list[str]) -> None:
        self._lines.append(words)

    def char(self, line: int, word: int, ch: int) -> str:
        return self._lines[line][word][ch]

    def words(self, line: int) -> int:
        return len(self._lines[line])

    def line_count(self) -> int:
        return len(self._lines)

    def get_word(self, line: int, word: int) -> str:
        return self._lines[line][word]


class CircularShifter:
  """可隐藏：预计算表 vs 按需旋转"""

    def __init__(self, storage: LineStorage) -> None:
        self._storage = storage

    def shift_count(self) -> int:
        total = 0
        for r in range(self._storage.line_count()):
            total += self._storage.words(r)
        return total

    def kth_shift_text(self, k: int) -> str:
        # 实现可换成查表，调用方不变
        idx = 0
        for r in range(self._storage.line_count()):
            n = self._storage.words(r)
            for rot in range(n):
                if idx == k:
                    parts = [
                        self._storage.get_word(r, w)
                        for w in range(rot, n)
                    ] + [
                        self._storage.get_word(r, w)
                        for w in range(rot)
                    ]
                    return " ".join(parts)
                idx += 1
        raise IndexError(k)


class Alphabetizer:
    def __init__(self, shifter: CircularShifter) -> None:
        self._shifter = shifter
        self._order: list[int] | None = None

    def setup(self) -> None:
        n = self._shifter.shift_count()
        self._order = sorted(
            range(n),
            key=lambda k: self._shifter.kth_shift_text(k),
        )

    def ith(self, i: int) -> int:
        assert self._order is not None
        return self._order[i]
```

此时若把 `LineStorage` 改成 SQLite 后端，**CircularShifter 与 Alphabetizer 的对外契约可保持不变**（只要 `char` / `get_word` 语义不变）。

### 案例 2：泄露排序时机 vs 隐藏排序策略（TypeScript）

分解 1 中 Output **假定** Alphabetizer 在调用前已完全排好——换成「边输出边排序」必须改 Output：

```typescript
// 坏：接口泄露「排序已完成」且泄露索引数组格式
type ShiftIndex = { lineId: number; rotation: number };

function outputSorted(lines: string[][], sorted: ShiftIndex[]): void {
  for (const { lineId, rotation } of sorted) {
    const words = [...lines[lineId]];
    const rotated = words.splice(rotation).concat(words);
    console.log(rotated.join(" "));
  }
}
```

分解 2 风格——Output 只依赖抽象序列，Alphabetizer 内部可换一次性排序、堆、或延迟生成：

```typescript
interface ShiftView {
  count(): number;
  textAt(k: number): string;
}

interface AlphabetOrder {
  /** 第 i 个字母序位置对应原 shift 编号 */
  ith(i: number): number;
}

function outputViaOrder(shifts: ShiftView, order: AlphabetOrder): void {
  const n = shifts.count();
  for (let i = 0; i < n; i++) {
    const k = order.ith(i);
    console.log(shifts.textAt(k));
  }
}

// Alphabetizer 可替换实现，Output 不变
class EagerAlphabetizer implements AlphabetOrder {
  private order: number[] = [];
  constructor(shifts: ShiftView) {
    this.order = Array.from({ length: shifts.count() }, (_, k) => k)
      .sort((a, b) => shifts.textAt(a).localeCompare(shifts.textAt(b)));
  }
  ith(i: number): number {
    return this.order[i];
  }
}
```

Parnas 在回顾 Circular Shifter 接口时还自我批评：规定移位列表的 **具体顺序** 泄露了多余信息；更弱的接口只保证「所有移位存在、不重复、能反查原行」即可，以便实现「移位已按字母序产生、Alphabetizer 为空操作」等优化。

### 案例 3：现代映射——Repository 不是万能药

把「数据库表」藏在 Repository 后面，却让 Service 层直接拿 `UserEntity`（带 ORM 注解、列名、懒加载字段）到处传——这是 **用新名词重复分解 1**：步骤切开了，但 **存储格式决策** 仍泄露给全系统。

信息隐藏式做法：领域层只看见 `User { id, displayName }` 接口；换 PostgreSQL → DynamoDB 时，变动应收敛在单一模块内。

## 设计准则清单（论文末尾归纳）

1. **数据结构 + 访问/修改过程** 属于同一模块，不要「全局共享结构 + 各处随意改」。
2. **调用序列与例程本身** 同属一模块（对汇编/特殊调用约定尤其重要）。
3. **队列控制块格式** 等应藏在控制块模块内，不要当公共接口。
4. **字符集、字母序** 等易变约定应独立成模块。
5. **处理顺序** 尽量对其它模块不可见（设备增减、资源不可用都会改变顺序）。

## 效率与实现

分解 2 若每个 `CHAR` 都是跨模块过程调用，会比分解 1 的「单模块内循环」慢。Parnas 的出路：

- 汇编期把「像子程序一样写」的模块 **内联** 进调用点
- 维护多种程序表示（规格、实现、汇编视图）并在工具链中映射

今天对应：C++ `inline` / LTO、Rust 单 crate 内模块零成本抽象、链接期优化（LTO）、以及「库边界清晰但热路径 monomorphization」。

## 与编译器/解释器的延伸例子

论文提到：按 **隐藏决策** 拆 Markov 算法翻译器时，同一分解同时适用于 **纯编译器** 与多种 **解释器**——寄存器表示、搜索算法、规则解释等模块在两类系统中都存在，只是最终运行表示不同。若按「语法分析器 / 代码生成器 / 运行时」经典流水线拆，则难以如此复用。

## 踩过的坑

1. **「模块 = 文件 = 类」是过度简化**  
   Parnas 的 module 是设计责任；一个类可能泄露多个决策，一个决策也可能跨多个编译单元实现。

2. **信息隐藏 ≠ 保密或加密**  
   目标是 **降低耦合、隔离变更**，不是不让程序员看源码。

3. **流程图拆分在小系统上「也能工作」**  
   KWIC 两种方案都能跑；优势要在变更、并行、理解大系统时才显现。

4. **接口越抽象，越要警惕过度规定**  
   Circular Shifter 规定移位顺序是 Parnas 自认的设计错误——隐藏决策时仍可能 **多泄露半拍**。

5. **层次与隐藏要同时检查**  
   低层模块反向依赖高层会破坏「剪枝复用」；高层依赖底层细节会破坏变更隔离。

## 适用 vs 不适用

| 场景 | 建议 |
|------|------|
| 长期演进的中大型系统、多人协作 | 先列易变决策，再划模块边界 |
| 一次性脚本、竞赛题、原型 | 按流程拆可能更快，接受技术债 |
| 需要形式化规格与独立测试的模块 | 分解 2 式抽象接口更利于单测 |
| 极致单线程热路径、无变更预期 | 可实现合并模块，但文档中仍应标明隐藏的决策 |

## 与今天的关系

- **面向对象**：对象常作为隐藏决策的单元（但「一个 God Class 包打天下」仍是坏的流程图思维）。
- **API 设计**：REST 资源、 gRPC 消息字段应表达 **稳定能力**，而非数据库行布局。
- **微服务**：按 **业务能力 / bounded context** 拆分更接近 Parnas；按 ETL 流水线拆服务往往是分解 1 的分布式版。
- **操作系统**：文件系统隐藏磁盘块布局；系统调用隐藏内核数据结构——都是信息隐藏。

1972 年的这篇论文，核心教训可以压缩成一句：**先问「哪些决策最容易变」，再问「谁该独占这些决策」；不要先画数据流图就把箭头上的方框注册成模块。** 模块化的收益不来自「切了几刀」，而来自 **切刀的位置是否对准易变决策**。

## 延伸阅读

- Parnas, D. L. (1972) *A technique for software module specification with examples* — 与本文配套的规格说明方法
- Parnas, D. L. (1971) *Information distribution aspects of design methodology* — 信息隐藏概念更早阐述
- Dijkstra, E. W. (1968) *The structure of THE multiprogramming system* — 层次化系统的同期范例
- Balzer (1967) / Mealy (1967) — 数据与操作绑定的相关思想
- 现代综述：软件工程教材中 *Design Principles* / *Modularity* 章节通常以本文为起点

## 原文信息

| 字段 | 内容 |
|------|------|
| 作者 | David L. Parnas |
| 发表 | Communications of the ACM, Vol. 15, No. 12, December 1972, pp. 1053–1058 |
| 机构 | Carnegie Mellon University, Department of Computer Science |
| 收稿 | 1971-08；修订 1971-11 |
| 原文 PDF | [TU/e 镜像](https://www.win.tue.nl/~wstomv/edu/2ip30/references/criteria_for_modularization.pdf) |
| ACM DOI | [10.1145/361598.361623](https://doi.org/10.1145/361598.361623) |
| 关键词 | software, modules, modularity, software engineering, KWIC index, software design |
