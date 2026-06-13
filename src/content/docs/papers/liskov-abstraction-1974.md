---
title: Programming with Abstract Data Types — Liskov & Zilles 1974 抽象数据类型宣言
来源: https://en.wikipedia.org/wiki/Abstract_data_type
日期: 2026-06-13
分类: 编程语言
子分类: 类型与 PL 理论
难度: 入门
provenance: pipeline-v3
---

## 是什么

1974 年 3 月，MIT 的 **Barbara Liskov** 与 IBM 剑桥系统组的 **Stephen Zilles** 在 *ACM SIGPLAN Notices*（第 9 卷第 4 期，页 50–59）发表了 **Programming with Abstract Data Types**。论文出自他们为**结构化编程**设计一门新语言（后来定名为 **CLU**）的工作，首次把「抽象数据类型（Abstract Data Type, ADT）」写成了可操作的编程语言机制，而不只是教科书里的概念。

日常类比：你去银行办业务，柜台只给你**账户号、存款、取款、查余额**这几项操作——你不需要知道金库里钞票怎么码放、账本记在哪种数据库里。若银行明天把账本从纸质换成电子，只要「存款 / 取款」的语义不变，你的用法就不变。**ADT 就是把这种「只暴露操作、隐藏实现」的契约，写进编程语言里。**

论文要回答的核心问题是：高级语言内置的 `int`、`array` 等抽象永远不够用，语言设计者**不可能提前猜中**所有领域需要的类型。解决办法不是无限往语言里塞新关键字，而是给程序员一种**自己定义新抽象**的机制——在 CLU 里叫 **operation cluster（操作簇，简称 cluster）**。

## 历史背景

| 时间 | 事件 |
|------|------|
| 1968 | Dijkstra 发表 [[dijkstra-goto-1968]]，结构化编程运动兴起 |
| 1971–72 | Wirth 等人推广**逐步求精（stepwise refinement）**：先写抽象机器上的程序，再一层层填实现细节 |
| 1973 | Liskov 在 MIT 技术报告中提出 cluster 雏形，对象放堆上、编译期完整类型检查 |
| 1974-03 | 本文在「Very High Level Languages」研讨会上发表（DOI: [10.1145/942572.807045](https://doi.org/10.1145/942572.807045)） |
| 1975+ | CLU 实现成熟；Java `class`、C++ `class`、Rust `struct` + `impl`、Go 未导出字段等，都可视为 ADT 思想的后裔 |
| 1980s | Guttag 等人发展**代数规范**；Liskov 本人因 CLU 与分布式系统工作获 2008 年图灵奖 |

论文写于「极高层次语言（very-high-level languages）」热潮之中：目标是把程序员从位运算和内存布局里解放出来，让他**在问题域合适的抽象上思考**。Liskov 与 Zilles 的洞见是：**抽象本身也应该是可扩展的**——语言应像「无限层次的高级语言」，而不是固定抽象清单。

## 为什么重要

不理解这篇 1974 年的短文，下面这些事很难放在同一张图上：

- 为什么 Java 的 `List` 接口、Rust 的 `trait`、Go 的「小接口」都在说**行为定义类型**，而不是「这个 struct 里有哪些字段」
- 为什么「把表示细节藏起来」是模块边界的第一原则，而不是可有可无的编码风格
- 为什么 [[standard-ml]] 的 `signature` / `structure`、OCaml 的模块、Haskell 的 `data` + 导出列表，都和同一套 ADT 家谱有关
- 为什么后来 **Liskov 替换原则（LSP）** 讨论的是「子类型能否替换父类型」——名字里的 Liskov 就是本文作者

本文还区分了**逻辑结构**与**物理结构**：程序员负责清晰、可维护的逻辑结构；编译器负责映射到高效机器代码。这一分工预见了今天「写可读代码、让编译器优化」的主流做法。

## 核心概念

### 1. 抽象数据类型（ADT）

论文给出的定义（意译）：

> 抽象数据类型是一类**抽象对象**，这类对象**完全由其上可执行的操作所刻画**。因此，定义一个 ADT，就是定义刻画该类型的那一组操作。

注意三个关键词：

- **对象（object）**：有身份、可存于变量中、可传参（CLU 里对象在堆上，变量持有引用）
- **操作（operations）**：外界与这类对象交互的**唯一**合法入口
- **完全刻画**：不允许用户依赖「内部长什么样」——否则抽象就漏了

这与维基百科上 ADT 条目一致：ADT 是**数学模型**加上**操作集合**；实现可以换，只要操作语义不变。

### 2. 操作簇（operation cluster / cluster）

ADT 在 CLU 中的实现单元叫 **cluster**，结构上分三块：

1. **头部（header）**：列出对外可见的操作名（如 `push`, `pop`, `empty`）
2. **表示（rep）**：只在 cluster **内部**可见的数据布局
3. **操作实现**：创建对象与各项操作的代码

只有 cluster 内部的代码能访问 `rep`；集群外的程序**只能通过声明的操作**碰对象。这就是今天说的 **封装（encapsulation）**。

### 3. 函数抽象（functional abstraction）

并非所有过程都绑定在某个 ADT 上。论文把**不隶属于某一抽象类型的操作**称为 **functional abstraction**——例如通用的排序、格式化输出。有了 ADT 之后，「程序里的大多数抽象操作会属于某个类型的操作集」，剩下少数是函数抽象。

### 4. 调用语法：`type$operation(object, args...)`

CLU 用 **`类型名$操作名(参数)`** 调用抽象操作，**第一个参数总是目标对象**。例如 `stack$push(s, token)`。带上类型名是为了：

- 消歧：多个参数可能是不同 ADT 时，明确操作属于哪个类型
- 允许不同 ADT 使用同名操作（如多种类型都有 `create`）而不冲突

现代语言里 `s.push(token)` 只是语法糖；论文时代的显式写法更利于早期编译器的类型检查。

### 5. 类型参数（泛型）

cluster 可以带 **type parameter**，例如 `stack(element_type: type)` 定义「元素类型可参数化」的栈。实例化时 `stack(integer)` 与 `stack(token)` 是**不同类型**，各自类型检查独立——这是参数化多态，比 C 宏安全得多。

### 6. 与结构化编程的关系

论文把 ADT 嵌进 **逐步求精** 流程：

1. 先在「抽象机器」上写程序——这台机器恰好提供你设计好的 ADT 和操作
2. 再为每个 ADT 写 cluster，把抽象机器「落地」到真实表示

这样每一层只关心**当前层的契约**，符合 Dijkstra「一次做一个决定」的原则。ADT 让**数据方面的决定**也可以推迟，而不只是控制流方面的决定。

### 7. 逻辑结构 vs 物理结构

程序员写的是**逻辑结构**（易读、易改）；编译器生成的是**物理结构**（快、省内存）。两者可以不一致，只要工具链保证调试器、类型检查等仍按逻辑结构呈现。论文承认：好逻辑结构不自动等于好性能，但把优化交给编译器比让人手写纠缠在一起更可持续。

## 代码示例

### 示例 1：论文中的参数化栈 cluster（CLU 语法，节选）

下面改编自 Liskov & Zilles 论文与后续 CLU 文献中的经典 `stack` 定义，展示 **header + rep + create + operations** 三部分如何拼在一起：

```text
stack: cluster(element_type: type)
  is push, pop, top, erasetop, empty:

  rep(type_param: type) = (
    tp: integer;
    e_type: type;
    stk: array[1..] of type_param;
  )

  create
    s: rep(element_type);
    s.tp := 0;
    s.e_type := element_type;
    return s;
  end

  push: operation(s: rep, v: s.e_type);
    s.tp := s.tp + 1;
    s.stk[s.tp] := v;
    return;
  end

  pop: operation(s: rep) returns s.e_type;
    v: s.e_type := s.stk[s.tp];
    s.tp := s.tp - 1;
    return v;
  end

  empty: operation(s: rep) returns boolean;
    return s.tp = 0;
  end
end stack
```

**怎么读这段「外星语法」：**

- `stack(element_type: type)`：定义一个**泛型**栈，元素类型由调用方指定
- `rep(...)`：**只有** `stack` 这个 cluster 内部能看见 `tp`（栈顶指针）和 `stk` 数组
- 集群外用户写 `s: stack(integer)` 或 `s: stack(token)`，只能调用 `stack$push(s, x)` 等，**不能**写 `s.tp`
- 若你把 `rep` 从数组改成链表，只要 `push`/`pop`/`empty` 语义不变，用户代码**零修改**

这就是 ADT 相对「裸结构体 + 全局函数」的胜利：**不变式（invariant）**（如 `0 ≤ tp ≤ length`）被关在 cluster 门内维护。

### 示例 2：同一 ADT 思想在现代 TypeScript 中的写法

今天多数语言没有 `$` 语法，但契约相同：对外只导出操作，隐藏 `rep`。

```typescript
// 文件: stack.ts — 表示细节不导出
type StackRep<T> = { items: T[] };

export function createStack<T>(): StackRep<T> {
  return { items: [] };
}

export function push<T>(s: StackRep<T>, v: T): void {
  s.items.push(v);
}

export function pop<T>(s: StackRep<T>): T {
  if (s.items.length === 0) throw new Error("empty stack");
  return s.items.pop()!;
}

export function isEmpty<T>(s: StackRep<T>): boolean {
  return s.items.length === 0;
}
```

```typescript
// 文件: main.ts — 用户层只依赖操作，不碰 items
import { createStack, push, pop, isEmpty } from "./stack";

const s = createStack<number>();
push(s, 1);
push(s, 2);
while (!isEmpty(s)) {
  console.log(pop(s)); // 2, then 1
}
```

TypeScript 的 `StackRep` 类型在技术上仍可从模块外访问字段——语言靠**约定**而非硬封装。Java、C#、Rust 用 `private` 字段做到编译器强制；CLU 用 `rep` 作用域做到**语言级**强制。论文 1974 年就坚持：**没有硬边界，抽象会随维护慢慢泄漏。**

### 示例 3：对比「非 ADT」写法——为什么论文要发明 cluster

```python
# 反模式：任何人都能破坏栈的不变式
class Stack:
    def __init__(self):
        self.items = []

def broken_pop(s: Stack):
    s.items = []  # 合法 Python，但语义灾难
```

```python
# 更接近 ADT：只暴露方法，内部用 _items 约定私有
class Stack:
    def __init__(self):
        self._items: list = []

    def push(self, v):
        self._items.append(v)

    def pop(self):
        if not self._items:
            raise IndexError("empty")
        return self._items.pop()
```

Python 的 `_items` 仍是君子协定；CLU / Java / Rust 则让编译器拒绝 `s._items` 式访问。论文的价值在于把「银行柜台」模型**写进语言语义**，而不只是团队规范。

## 与 CLU 语言的其他遗产

本文是 CLU 设计文档之一，同一语言还影响了：

- **异常（exception）**：结构化错误处理
- **迭代器（iterator）**：比单纯 `for` 更灵活的遍历抽象
- **基于堆的对象 + 强类型**：与 C 结构体数组划清界限

Liskov 在 1980 年代 MIT 技术报告 *Abstraction Mechanisms in CLU* 中进一步用编程例子说明**过程抽象、控制抽象、数据抽象**三类抽象如何配合。读 1974 本文可视为理解 CLU 乃至整个「OO 之前的数据抽象」路线的入口。

## 常见误解

| 误解 | 澄清 |
|------|------|
| ADT = `class` | ADT 是**契约**（操作集）；`class` 只是实现契约的一种语言手段。Java `interface` + 多个实现更接近论文精神 |
| ADT 反对性能 | 论文明确区分逻辑/物理结构，并期望编译器优化映射；不是「为了抽象而牺牲速度」 |
| 本文发明了面向对象 | 论文**没有**子类继承；Liskov 后来才系统讨论子类型。ADT 是 **OO 的数据抽象子集**，不是 OO 全体 |
| 只有系统语言需要 ADT | 只要模块边界存在（API、微服务 DTO、配置对象），「只暴露操作」都适用 |

## 与今日实践的对应

| 1974 论文概念 | 现代对应 |
|---------------|----------|
| ADT | API 资源模型、领域实体、protobuf message + service |
| cluster | Java `class`、Rust `struct` + `impl`、Go package + 未导出标识符 |
| `type$op(obj, …)` | `obj.op(…)`、UFCS（Rust）、扩展方法 |
| type parameter | 泛型 `Stack<T>`、TypeScript 泛型 |
| functional abstraction | 无状态的 `fn sort<T>(…)`、工具函数 |
| rep 隐藏 | `private` 字段、Rust 模块隐私、`opaque type` |

## 学习路径建议

1. **先读摘要 + 第 1–2 节**（动机与 ADT 定义），建立「操作刻画类型」直觉
2. **对照一个你熟悉的语言**：用 Java `interface List` 或 Rust `trait Stack` 手写最小栈，体会「用户看不见 rep」
3. **读 CLU stack 例子**（上文示例 1 或论文 PDF 全文）——理解 cluster 三段式
4. 若做分布式系统，再读 Liskov 的 [[vr-1988]] / [[pbft-1999]]——同一位作者，从**数据抽象**走到**复制状态机抽象**，方法论一脉相承

## 延伸阅读

- 论文 PDF：[Programming with Abstract Data Types](http://jpk.pku.edu.cn/course/sjjg/chapter1/resource/Programming%20with%20Abstract%20Data%20Types.pdf)（Liskov & Zilles, 1974）
- DOI：[10.1145/942572.807045](https://doi.org/10.1145/942572.807045)
- 维基百科：[Abstract data type](https://en.wikipedia.org/wiki/Abstract_data_type)
- CLU 历史：[A History of CLU](https://publications.csail.mit.edu/lcs/pubs/pdf/MIT-LCS-TR-561.pdf)（MIT LCS TR-561）
- 后续机制详解：*Abstraction Mechanisms in CLU*（Liskov, Snyder, Atkinson, Schaffert）
- 结构化编程背景：[[dijkstra-goto-1968]]、Wirth 逐步求精
- 模块与类型系统后继：[[standard-ml]]、[[hindley-milner]]

## 一句话总结

**Liskov & Zilles 1974 年告诉我们：类型不只是编译器内置的 `int` 和 `array`，而是程序员可以用「操作簇」自行扩展的契约；把表示藏起来、把行为暴露出来，结构化编程才能真正一层层求精而不被实现细节反噬。**
