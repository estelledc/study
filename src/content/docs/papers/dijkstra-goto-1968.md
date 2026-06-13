---
title: Go To Statement Considered Harmful — Dijkstra 1968 结构化编程宣言
来源: https://homepages.cwi.nl/~storm/teaching/reader/Dijkstra68.pdf
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
难度: 入门
provenance: pipeline-v3
---

## 是什么

1968 年 3 月，荷兰计算机科学家 **Edsger W. Dijkstra** 在 *Communications of the ACM* 上发表了一封只有两页的「读者来信」，标题是 **Go To Statement Considered Harmful**（`goto` 语句是有害的）。全文没有一行代码，却改变了此后半个世纪程序员写程序的方式。

论文的核心主张很直白：**`goto` 应该从所有「高级」编程语言中废除**（机器码除外）。Dijkstra 观察到，程序员产出的代码质量，与程序里 `goto` 的密度呈负相关——`goto` 越多，程序越难理解、越难推理、越难证明正确。

日常类比：想象你在读一本小说。正常写法是「第一章 → 第二章 → 第三章」，偶尔出现「如果下雨就跳第五章」这种分支，或者「回到第三章开头再读一遍」这种循环——你始终知道自己在书的哪一页。`goto` 则像书里随机写着「现在翻到第 217 页第 3 段」——你当然还能读下去，但**再也说不清「故事进行到哪一步」**，变量人物关系、伏笔含义都会在这一跳里变得暧昧不清。

这篇短文常被视作 **结构化编程（Structured Programming）** 运动的公开起点。它本身不发明 `if`/`while`/`for`，而是解释为什么这些结构比裸 `goto` 更适合人类大脑。

## 历史背景

| 时间 | 事件 |
|------|------|
| 1966 | Bohm & Jacopini 证明：任意流程图都可改写为只用**顺序、选择、迭代**三种结构 |
| 1968-03 | Dijkstra 发表本文（原稿标题是 *A Case against the GO TO Statement*，编辑 Niklaus Wirth 改成了现在更刺眼的标题） |
| 1970s | Pascal、C 等语言保留 `goto` 但主流教材开始强调结构化写法 |
| 1980s+ | Java 等语言直接取消 `goto`；C# 保留 `goto` 但视为代码异味 |

Dijkstra 后来抱怨：IBM 偷走了「结构化编程」这个词，有人把它**简化成「禁止 goto」**——那只是冰山一角。他真正关心的是：**我们能否用有限的、可推理的程序结构，构造足够表达力的软件，并在此基础上证明正确性。**

## 为什么重要

不理解这篇两页纸，下面这些事都没法放在同一张图上：

- 为什么现代语言把 `if`/`else`、`while`、`for` 当作一等公民，却把 `goto` 藏进角落或干脆删掉
- 为什么代码审查里「满屏跳转标签」会被一眼打回
- 为什么「能读懂代码」和「能证明代码没错」在 Dijkstra 眼里是同一件事的两面
- 为什么后来出现 **「X considered harmful」** 模板文章（从 `unsigned` 到 `cookies` 都有人写过）

更重要的是论文里那个少被引用、但技术上最锋利的论点：**程序执行到某一刻时，变量值的含义依赖于「执行进度」；而 `goto` 会破坏你用「进度坐标」理解程序的能力。**

## 核心概念

### 1. 执行进度的「坐标系」

Dijkstra 问：怎样描述一个正在运行的程序「进行到哪了」？

在没有 `goto`、只有顺序语句时，一个**文本索引**（textual index）就够了——就是「当前执行到源文件的第几行」。

加入 **过程调用（procedure）** 后，一个索引不够：你得记录「正在执行哪个过程的哪一行」，以及「这是第几层嵌套调用」——变成一串文本索引，长度等于动态调用深度。

加入 **循环（repetition）** 后，还要加 **动态索引（dynamic index）**：第几次进入这个 `while`？嵌套循环时，索引序列混合「文本位置 + 第几轮循环」。

关键性质：**这些索引的值不由程序员随手指定，而是由程序文本和执行过程自动生成。** 它们是描述进度的**独立坐标**。

### 2. 变量含义依赖于进度

论文最著名的例子（意译）：

> 你要统计房间里的人数 `n`。每当看到有人进门，就把 `n` 加 1。  
> 在「已经看到有人进门」和「还没执行 `n++`」之间的那一瞬间，  
> **`n` 的值等于房间里实际人数减 1。**

这不是 bug，而是**进度与变量之间的约定**。你能说清「此刻执行到哪一步」，才能说清「此刻 `n` 代表什么」。

`goto` 的问题在于：它允许控制流任意跳跃，使得**很难找到一组简单、稳定的坐标**来刻画进度。有人试图用「某些关键变量的值」当坐标，但 Dijkstra 指出——**变量值的语义本身就要靠进度来解释**，这形成循环依赖。

唯一总能用的坐标是「从程序启动以来执行了多少条语句」——像一台归一化时钟。它唯一，但**毫无帮助**：在这个坐标系里，表达「`n` 等于房间人数减 1」这类陈述会变得极其笨重。

### 3. `goto` 是「太原始的邀请」

Dijkstra 的原话精神：`goto` **本身太 primitive**，它太像一张邀请函，邀请你把程序写成一团乱麻。`if`、`while`、`repeat`、`case`、过程调用等结构，是在**给跳转套上缰绳**——不是消灭控制流，而是让控制流可被抽象、可被归纳证明。

这与 Bohm-Jacopini 的结构定理一致：表达能力上不必然需要 `goto`；需要的是**可管理的控制流纪律**。

### 4. 与正确性证明的关系

Dijkstra 在同一时期的笔记（EWD 系列）里把观点说得更满：证明程序正确，不能靠穷举所有输入（组合爆炸）；必须依赖**程序结构**（数学归纳法适配循环、抽象适配过程）。`goto` 让「从静态文本推断动态行为」变难，直接损害这条路线。

## 实践案例

### 案例 1：面条代码 vs 结构化改写

下面是一段带有 `goto` 的伪 C 代码，实现「读入正数并求和，遇到非正数则结束」：

```c
/* 风格 A：goto + 标签 — 能跑，但进度模糊 */
int sum = 0, x;
start:
    x = read();
    if (x <= 0) goto done;
    sum += x;
    goto start;
done:
    print(sum);
```

等价的结构化写法：

```c
/* 风格 B：while — 进度坐标清晰：在循环第几轮一目了然 */
int sum = 0, x;
while (1) {
    x = read();
    if (x <= 0) break;
    sum += x;
}
print(sum);
```

两种写法机器层面可能生成类似的跳转指令，但人类读者在风格 B 里自带坐标：**「我们在 `while` 的某一轮」**。审查者可以说：「循环不变式：`sum` 是已读正数的和」——这对证明与维护至关重要。

### 案例 2：用 `goto` 实现状态机 — 为何后来改用 `switch`

早期网络协议常手写状态机。`goto` 版：

```c
enum { WAIT_HDR, READ_BODY, DONE } state = WAIT_HDR;

dispatch:
    if (state == WAIT_HDR) {
        if (!read_header()) goto error;
        state = READ_BODY;
        goto dispatch;
    } else if (state == READ_BODY) {
        if (!read_body()) goto error;
        state = DONE;
        goto dispatch;
    }
    return OK;
error:
    return FAIL;
```

结构化改写（表驱动或 `switch`）：

```c
while (state != DONE) {
    switch (state) {
    case WAIT_HDR:
        if (!read_header()) return FAIL;
        state = READ_BODY;
        break;
    case READ_BODY:
        if (!read_body()) return FAIL;
        state = DONE;
        break;
    default:
        return FAIL;
    }
}
return OK;
```

`switch` 并没有魔法，但它把「下一状态」绑在**可枚举的局部结构**上，读者不必在标签海洋里找「从 `error` 能跳到哪儿」。

### 案例 3：Linux 内核里仍存在的 `goto` — 何时算「有纪律的使用」

Linux 内核风格指南允许 **`goto` 仅用于统一的错误清理路径**（常见于 C 资源申请）：

```c
int setup(void) {
    if (alloc_a() < 0) return -ENOMEM;
    if (alloc_b() < 0) goto err_a;
    if (alloc_c() < 0) goto err_b;
    return 0;
err_b:
    free_b();
err_a:
    free_a();
    return -ENOMEM;
}
```

这不是反驳 Dijkstra，而是 **C 语言缺少 defer/RAII 的折中**：所有 `goto` 目标向下、单向、用于清理，不形成 arbitrary 循环。社区共识是：**这是受控的例外，不是鼓励面条代码。**

## 结构化程序的三种基本结构

Bohm & Jacopini (1966) 与 Dijkstra 共同支撑的图片可以记成：

```
顺序 (Sequence)     ：一条接一条执行
选择 (Selection)    ：if / else / case — 二选一或多选一
迭代 (Iteration)    ：while / for / repeat — 条件满足则重复
```

现代语言再加 **过程抽象**（函数、模块）处理重复逻辑与命名层次。这五样足以表达可计算性意义上的「所有程序」，同时保留可读的进度坐标。

## 踩过的坑

1. **「禁止 goto」≠ 结构化编程的全部**  
   Dijkstra 本人后来吐槽，业界把结构化编程降格成「不用 goto」。数据抽象、不变式、分层设计同样是支柱。

2. **机器码里仍有跳转**  
   论文说的是**高级语言**应提供更高层结构，让程序员不必亲手编织蜘蛛网。编译器把 `while`  lowering 成 `jmp` 完全 OK。

3. **少数场景 `goto` 仍有辩护**  
   错误处理（C）、跳出多层循环（某些语言用 labeled break 替代）、极致性能手写汇编。关键是：**跳转是否受纪律约束**，而非绝对禁字。

4. **标题是编辑改的**  
   原稿较温和 (*A case against...*)，Wirth 改成 *Considered Harmful* 引爆传播。读正文时别被标题吓到——论证是几何与逻辑性的，不是道德审判。

5. **与「函数式没有循环」不是一回事**  
   函数式用递归表达迭代，坐标系换成「调用栈深度 + 归纳假设」。争论焦点相同：**人类如何跟踪计算进度。**

## 适用 vs 不适用

| 场景 | 建议 |
|------|------|
| 业务逻辑、库 API、教学示例 | 用 `if`/`while`/`for`/函数，避免 `goto` |
| 需要形式化验证、安全关键系统 | 遵循结构化子集；`goto` 使静态分析变难 |
| C 资源清理、内核错误路径 | 受控 `goto` 可接受，集中单出口清理 |
| 手写汇编、JIT 代码生成 | 底层跳转不可避免，与本文讨论的抽象层不同 |

## 与今天的关系

- **Rust / Go / Java**：无 `goto` 或极少用；错误用 `Result`、`panic`、defer 模式处理。
- **静态分析 & 编译器优化**：CFG（控制流图）上的 structured region 更易做数据流分析；任意 `goto` 破坏 structuredness。
- **「代码异味」文化**：Spaghetti code 仍是对 untamed `goto` 的贬称。

1968 年的两页纸，本质是在说：**编程不仅是告诉机器做什么，更是让人类（包括六个月后的你自己）能追踪「故事进行到哪一页」。** `goto` 撕掉了页码；`if` 和 `while` 把页码印了回去。

## 延伸阅读

- Dijkstra, EWD 215 / EWD 268 — 结构化编程更长笔记
- Bohm, C. & Jacopini, G. (1966) — 顺序/选择/迭代的结构定理
- Knuth, D. (1974) *Structured Programming with go to Statements* — 对「一刀切禁止」的反驳与调和
- Wirth, N. — Pascal 语言设计，与本文发表于同一时期的 ALGOL 传统

## 原文信息

| 字段 | 内容 |
|------|------|
| 作者 | Edsger W. Dijkstra |
| 发表 | Communications of the ACM, Vol. 11, No. 3, March 1968, pp. 147–148 |
| 机构 | Technological University, Eindhoven |
| 原文 PDF | [CWI 镜像](https://homepages.cwi.nl/~storm/teaching/reader/Dijkstra68.pdf) |
| ACM DOI | [10.1145/362929.362947](https://doi.org/10.1145/362929.362947) |
