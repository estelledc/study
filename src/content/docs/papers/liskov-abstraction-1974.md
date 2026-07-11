---
title: Liskov 抽象数据类型 — 用操作而不是存储形状定义数据
来源: 'Liskov & Zilles, "Programming with Abstract Data Types", ACM SIGPLAN Notices 1974'
日期: 2026-05-29
分类: 编程语言
难度: 初级
---

## 是什么

Liskov 和 Zilles 这篇论文把 **抽象数据类型**（Abstract Data Type，ADT）讲成一句很朴素的话：一个数据类型不该由“里面怎么存”来定义，而该由“外面能对它做什么操作”来定义。

日常类比：你去自动售货机买水，只需要知道“投币”“选货”“取货”这些按钮。你不需要知道里面是弹簧、传送带，还是机械臂。ADT 就是在程序里做同一件事：把“按钮”公开，把“机器内部”藏起来。

论文的核心目标不是发明一个具体数据结构，而是给编程语言加一种机制：当语言内置类型不够用时，程序员可以自己造新类型，并且让新类型像 `integer`、`array` 一样被安全使用。

这套想法后来进入 CLU、Ada、Modula、Java、Rust、Go、TypeScript 的接口设计里。今天你写 `Stack.push()`、`Map.get()`、`File.read()`，背后都有这篇论文的影子。

## 为什么重要

不理解这篇论文，下面这些事会很难解释：

- 为什么“封装”不是把字段设成 private 这么简单，而是让调用者只能依赖一组稳定操作
- 为什么一个模块换掉内部数组、链表、哈希表后，外面的代码最好完全不用改
- 为什么类型系统不只是抓低级错误，还能阻止别人绕过抽象边界
- 为什么 OOP 里的对象、接口、类库设计，都继承了 ADT 的一部分思想

## 核心要点

1. **类型由操作定义**：像点餐只看菜单，不看厨房。ADT 的“菜单”就是 `push`、`pop`、`empty` 这类操作；只要菜单不变，厨房怎么改都不影响顾客。

2. **表示必须被隐藏**：像银行卡只露卡号和交易接口，不露银行数据库表。论文强调 `rep` 只能在 cluster 内部看见，外部程序不能偷看对象到底是数组还是记录。

3. **语言要帮忙守门**：像门禁系统不靠口头约定，而靠刷卡规则。强类型检查会限制对象只能被本类型操作处理，避免调用者把隐藏表示当普通数据乱拆。

## 实践案例

### 案例 1：栈的使用者只看操作

```ts
class Stack<T> {
  private items: T[] = []
  push(x: T) { this.items.push(x) }
  pop(): T | undefined { return this.items.pop() }
  empty(): boolean { return this.items.length === 0 }
}

const s = new Stack<number>()
s.push(3)
console.log(s.pop())
```

**逐部分解释**：

- `push`、`pop`、`empty` 是这个栈的公开“菜单”
- `items` 是内部表示，外面不该直接访问
- 调用者知道“后进先出”就够了，不需要知道底层是数组

### 案例 2：同一个栈可以换内部表示

```ts
type Node<T> = { value: T; next?: Node<T> }

class LinkedStack<T> {
  private top?: Node<T>
  push(x: T) { this.top = { value: x, next: this.top } }
  pop(): T | undefined {
    const old = this.top
    this.top = old?.next
    return old?.value
  }
}
```

**逐部分解释**：

- 这版用链表，不再用数组
- 外部仍然只调用 `push` 和 `pop`
- ADT 的价值就在这里：内部重写不该把使用者拖下水

### 案例 3：论文里的 token 为什么要单独成类型

```txt
token$is_op(t)
token$prec_rel(top, t)
token$symbol(t)
```

**逐部分解释**：

- 论文的 `Polish_gen` 程序要把中缀表达式转成后缀表达式
- 它不直接拿字符串查语法表，而是先把符号包成 `token`
- 这样语法表可以用整数下标、字符串、记录等任意表示，翻译主程序都不需要知道

## 踩过的坑

1. **把 ADT 等同于数据结构**：原因是“栈”常被当作数组或链表来教，但论文真正关心的是操作集合和隐藏表示。

2. **以为 private 字段就够了**：原因是字段隐藏只是第一步，真正稳定的是外部能依赖的行为契约。

3. **把 cluster 看成现代 class 的同义词**：原因是 class 往往同时承担继承、对象身份、动态派发，而论文的 cluster 更专注于类型生成和表示隐藏。

4. **忽略类型检查的角色**：原因是没有强类型守门，调用者仍可能把内部表示泄漏出去，抽象边界会变成注释而不是规则。

## 适用 vs 不适用场景

**适用**：

- 设计库 API：外部只该知道能调用哪些操作，不该知道内部表结构
- 需要长期维护的模块：内部实现会变，但外部调用者希望少改
- 解释 OOP、接口、模块系统、泛型容器这些概念的共同源头
- 做程序证明：先证明类型操作满足性质，再证明使用者只依赖这些性质

**不适用**：

- 一次性脚本：抽象边界成本可能比收益高
- 性能极限热路径：仍然能用 ADT，但要靠编译器内联或手动测量避免过度封装
- 需要直接共享内存布局的底层代码：这类场景常常必须暴露表示，ADT 只能作为上层接口
- 没有清晰操作集合的业务对象：先整理行为，再急着封装会更稳

## 历史小故事（可跳过）

- **1967 年**：SIMULA 67 用 class 表达模拟对象，但对象内部信息仍更容易暴露给使用者。
- **1971-1972 年**：Parnas、Dijkstra 强调信息隐藏和逐步求精，程序设计开始从“写指令”转向“控制复杂度”。
- **1974 年**：Liskov 和 Zilles 提出 operation cluster，把“数据类型由操作刻画”放进语言机制里。
- **1977 年**：Liskov 团队发表 CLU 的 abstraction mechanisms，把这篇论文里的思想做成更完整的语言。
- **后来**：Java 接口、Rust trait、Go interface、TypeScript type 都在不同方向继承了“只暴露行为”的路线。

## 学到什么

- **抽象的本质是选择性遗忘**：使用者只记住必要行为，故意忘掉表示细节。
- **好接口比好实现更长期**：实现今天用数组，明天用链表；接口一旦公开，几年都可能不能乱改。
- **类型系统可以保护设计意图**：它不只检查 `int + string`，还可以禁止外部绕过抽象层。
- **论文没有实验，但有强例子**：`Polish_gen`、`token`、`stack` 展示了 ADT 如何让程序更容易理解、维护和证明。

## 延伸阅读

- 论文 DOI：[Liskov & Zilles 1974](https://doi.org/10.1145/800233.807045)（原文 10 页，先看 Abstract、The Meaning of Abstraction、Conclusions）
- 相关论文：Liskov et al., "Abstraction Mechanisms in CLU", CACM 1977（把 cluster 思想做成 CLU 语言机制）
- 相关论文：Guttag, "Abstract Data Types and the Development of Data Structures", CACM 1977（把 ADT 和数据结构教学接起来）
- [[simula-67]] —— 对照看 class 与 ADT 的差别
- [[system-f-reynolds-1974]] —— 同年从类型理论方向解释“类型参数化”
- [[hindley-milner]] —— 后来的 ML 系语言把抽象、模块、多态继续往前推

## 关联

- [[simula-67]] —— SIMULA 给了 class 形态，本文强调表示隐藏和操作边界
- [[smalltalk-80]] —— Smalltalk 把对象消息传递发扬光大，但抽象边界问题仍相通
- [[system-f-reynolds-1974]] —— System F 研究类型多态，本文研究用户自定义数据抽象
- [[hindley-milner]] —— ML 的类型推导让 ADT 和模块系统更顺手
- [[cousot-abstract-interpretation]] —— 都在讲“只保留有用信息”，但一个用于设计，一个用于分析
- [[parnas-information-hiding]] —— 信息隐藏是本文最直接的设计前史
- [[clu-abstraction-mechanisms-1977]] —— CLU 是本文思想的后续工程化版本

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[parnas-information-hiding-1972]] —— Parnas 信息隐藏 1972 — 模块化设计原则
