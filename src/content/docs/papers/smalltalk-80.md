---
title: Smalltalk-80 The Language and its Implementation
来源: Adele Goldberg & Daniel Robson, "Smalltalk-80: The Language and its Implementation", Addison-Wesley 1983
---

# Smalltalk-80 — OOP 的最纯粹形态

![Smalltalk-80 消息传递模型](/papers/smalltalk-80/01-message-passing.webp)

## 一句话总结（≥ 12 行）

Smalltalk-80 是 Adele Goldberg 和 Daniel Robson 1983 年出版的书，整理了 Alan Kay 在 Xerox PARC 1972-1980 年间设计实现的 Smalltalk 系统。
它和 LISP（McCarthy 1960）+ Algol 60 + Simula 67 一起构成了现代编程语言的四大根源。
Smalltalk-80 不是单纯的语言定义，而是一整套"对象 + 消息 + 镜像"的计算哲学。
它把 Simula 67 的 class 概念推到极致，把 LISP 的元编程思想引入对象世界。

设计哲学三个核心：
1. **everything is an object**：连数字 7、布尔 true、控制流 if/while 都是对象
2. **消息传递是唯一交互**：对象之间通过 send message 通信，没有函数调用、没有方法调用
3. **live image**：整个语言运行时 + 所有对象状态 + 所有源代码都在一张"镜像"里，可以暂停 / 修改 / 继续

技术贡献：
- 第一个 garbage-collected 语言（Java GC 的源头）
- 第一个 GUI（窗口、菜单、鼠标、文本编辑都是对象）—— 启发 macOS / Windows
- 第一个 IDE（Browser / Inspector / Debugger 都是 Smalltalk 对象）
- 第一个 MVC 设计模式（Model-View-Controller）
- 第一个 LiveProgramming 体验（修改代码立即生效，不重启）
- 第一个 unit test 框架（SUnit，启发 JUnit / pytest 全家）
- 第一个 refactoring 工具（Refactoring Browser 1995）

影响：Java（Gosling 早期 Smalltalk 用户）、Python（Guido 借鉴）、Ruby（Matz 直接致敬）、Objective-C（Cox + NeXT）、Self / JavaScript prototype 链 / Erlang actor model 都源于此。
某种程度上：现代所有动态语言都是 Smalltalk 的后代，现代所有 IDE 都是 Browser 的后代，现代所有 hot reload 都是 image 思想的退化版。

但 1980s 工业落地受挫：商用 ParcPlace VM 价格高（每开发者 $5000）、性能差（vs C++）、image-based deploy 与企业 IT 不兼容。
Java 1995 用 Smalltalk 的 80% 思想 + C++ 语法 + 免费 + JVM 部署，吃掉了 Smalltalk 的市场。
Smalltalk 退守研究 / 教育 / 金融领域（GemStone 数据库、JPMorgan 早期交易系统），现代复活以 Pharo / Squeak 为载体。

## Layer 0 — 论文档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 标题 | Smalltalk-80: The Language and its Implementation |
| 作者 | Adele Goldberg, Daniel Robson |
| 出版 | Addison-Wesley, 1983（"Blue Book"）|
| 系列 | "Blue Book"（语言），"Orange Book"（实现），"Green Book"（哲学，Goldberg 1984）|
| 设计源头 | Alan Kay + Dan Ingalls + Ted Kaehler（Xerox PARC）|
| 早期版本 | Smalltalk-72 / Smalltalk-76 / Smalltalk-80 |
| 实现 | VM + image，Bytecode |
| 内存管理 | Generational GC（Lieberman-Hewitt 1983 算法源头之一）|
| GUI | 第一代窗口 / 菜单 / 滚动条 / 重叠窗口 |
| IDE | Browser / Inspector / Debugger / Workspace |
| MVC | Trygve Reenskaug 1979 在 PARC 提出，Smalltalk-80 标准实现 |
| 现代实现 | Pharo / Squeak / Cuis Smalltalk / GemStone / VAST |
| 商业 VM | ParcPlace VisualWorks / IBM VisualAge / Cincom |
| 影响语言 | Java / Python / Ruby / Objective-C / Self / JavaScript |
| Alan Kay 后续 | Etoys（教育）/ Croquet（VR）|
| 1973 年提出 | Dynabook（个人计算机愿景，影响 iPad）|
| OOPSLA | Smalltalk 1986 OOPSLA 第一届主会议 |
| 价格 | ParcPlace VisualWorks $5000/seat（1990s）|
| 用户峰值 | ~50000 商业用户（1995 年）|

## Section 1 — 历史定位（≥ 30 行）

Smalltalk 起源于 1970-1972 年 Alan Kay 在 Xerox PARC 的 Learning Research Group。
Kay 受 Sketchpad（Sutherland 1963）+ Simula 67 + LISP 启发，设计"小孩能用的编程语言"。
Kay 后来在 OOPSLA 演讲中说："I made up the term 'object-oriented'，and I can tell you I did not have C++ in mind."

时间线：
- 1968：Alan Kay 在 University of Utah 读博，看到 Sketchpad 演示
- 1970：Kay 加入 Xerox PARC，提出 Dynabook 愿景
- 1972：Smalltalk-72，由 Dan Ingalls 实现，"消息传递"是最初设计核心
- 1973：第一台 Alto 工作站，Smalltalk 在上面跑
- 1976：Smalltalk-76 加 class hierarchy + bytecode VM
- 1979：Steve Jobs 参观 PARC，看到 Smalltalk + GUI，回 Apple 做 Lisa / Macintosh
- 1980：Smalltalk-80 标准化，Adele Goldberg 写文档
- 1981：Byte Magazine 八月号专题报道 Smalltalk-80（封面：热气球）
- 1983：Blue Book 出版
- 1985：ParcPlace 公司成立商用化
- 1986：第一届 OOPSLA 大会，Smalltalk 是主语言
- 1987：Smalltalk-80 ANSI 标准
- 1995：Java 1.0 发布，Smalltalk 工业份额开始下降
- 1996：Refactoring Browser（Don Roberts + John Brant）发布，启发 IntelliJ
- 2003：Squeak 开源（Alan Kay + Dan Ingalls 主导）
- 2008：Pharo fork from Squeak（更现代化的 IDE）
- 2024：Pharo 11，Smalltalk 在金融 / 教育 / 研究领域仍活跃

技术成就：
- 第一个 IDE（Browser）：能浏览所有 class、method、变量
- 第一个 Inspector：实时查看对象内部状态
- 第一个 Debugger：暂停 / 单步 / 修改 / 恢复
- 第一个 unit test 框架：SUnit（后启发 JUnit / xUnit 全家）
- 第一个 refactor 工具：Refactoring Browser 1995（启发 IntelliJ / VS Code）
- 第一个 design pattern 实践地：GoF 1994 书里大量 Smalltalk 例子

## Section 2 — 设计哲学（≥ 25 行）

Alan Kay 给 OOP 下的定义（不是 C++ / Java 的版本）：

1. EverythingIsAnObject
2. Objects communicate by sending and receiving messages
3. Objects have their own memory (state)
4. Every object is an instance of a class
5. The class holds the shared behavior for its instances
6. To eval a program, control is passed to the first object and the remainder is treated as its message

Kay 后来说："The big idea is messaging." OOP 的核心不是 class、不是继承、不是 encapsulation——是消息。

为什么消息重要？
- 消息是 late binding：发送者不知道接收者怎么处理
- 消息允许接收者改变行为：doesNotUnderstand 可以拦截任何消息
- 消息支持分布式：local send vs remote send 形式相同（Erlang / Akka 直接借鉴）
- 消息支持元编程：sending message about messages（MOP，元对象协议）

vs C++/Java OOP：
- C++/Java 的 method call 是 early binding（compile-time vtable）
- 消息（message）是 runtime dispatch + dynamic lookup
- C++ 的 template / Java 的 generic 试图补救但本质不同

## Definition 1 — Object（≥ 25 行）

定义：Smalltalk-80 所有运行时实体都是 object。每个 object 有：
1. **class pointer**：指向其所属 class 的指针
2. **instance variables**：私有状态
3. **method dictionary**：通过 class 间接持有

primitive 类型也是 object：
- 数字 7 是 SmallInteger 对象
- 布尔 true 是 True singleton
- nil 是 UndefinedObject singleton
- block `[:x | x + 1]` 是 BlockContext 对象
- class itself 是 Metaclass 对象（class 也是对象）

实例代码：
```smalltalk
| x |
x := 7.            "send '7' literal, store in x"
x + 3.             "send '+ 3' message to x, returns 10"
x class.           "send 'class' message, returns SmallInteger"
x class superclass."returns Integer"
x printString.     "send 'printString', returns '7'"
```

每个对象内存布局：
```
+------------------+
| header (class)   |  ← 4 bytes 指针到 class object
| inst var 1       |
| inst var 2       |
| ...              |
+------------------+
```

class 对象的 method dictionary 是 hash table：selector → bytecode。
method lookup 失败时，VM 自动 send `doesNotUnderstand:` message（这也是消息）。

## Definition 2 — Message（≥ 25 行）

定义：对象之间唯一交互方式。Message = (selector, arguments)。

例：`3 + 4` 是 send `+ 4` 到 SmallInteger 3。
- selector 是 `+`
- argument 是 4

控制流：`if true then: [...] else: [...]` 也是 send message 给 Boolean。

```smalltalk
"if-else 是 message"
(x > 0) ifTrue: ['positive'] ifFalse: ['non-positive'].

"while 也是 message"
[x > 0] whileTrue: [x := x - 1].

"for-each 是 message"
#(1 2 3) do: [:each | Transcript show: each printString].
```

实现：每次 send 走 method lookup chain：
1. 查 receiver 的 class 的 method dictionary
2. 找不到 → 查 superclass
3. 一直到 Object（根类）
4. 仍找不到 → send `doesNotUnderstand:` message（这也是 message！）

bytecode 里 send message 的 opcode：
- `send selector` → push receiver, push args, opcode `0xD0+arity`
- VM 执行 lookup，跳到 method bytecode 起点

性能问题：每次 send 都查 method dictionary 太慢。
解决方案：inline cache（Self 1986 引入，启发 V8 / HotSpot）。
- 第一次 send：查 method dict，记录 (receiver class, method)
- 后续 send：先比对 receiver class，命中则直接跳
- monomorphic / polymorphic / megamorphic 三种状态

## Definition 3 — Class hierarchy（≥ 20 行）

每个 class 有 superclass 指针，形成单根树（root = Object）。

```
Object
  ├── Magnitude
  │     ├── Number
  │     │     ├── Integer
  │     │     │     ├── SmallInteger
  │     │     │     └── LargePositiveInteger
  │     │     └── Float
  │     ├── Character
  │     └── Date
  ├── Collection
  │     ├── Array
  │     ├── Dictionary
  │     └── String
  ├── Boolean
  │     ├── True (singleton: true)
  │     └── False (singleton: false)
  └── BlockContext
```

method lookup 从 receiver 的 class 开始向上查。
继承不是 "extends" 关键字——是 superclass 指针。子类可以 override，可以调 `super` 触发上一级 lookup。

metaclass：class 自己也是对象，所以 class 也有 class（Metaclass）。
这让 Smalltalk 支持 class methods 和 class variables。
metaclass 自己也是对象 → 元元类 → 但停在 `Metaclass class class = Metaclass`（自指）。

## Definition 4 — Image-based development（≥ 20 行）

整个 Smalltalk 系统是一个"image" 文件（典型 ~30 MB，现代 Pharo ~100 MB）：
- 所有 class / method 源码 + bytecode
- 所有 object 实例
- 所有窗口位置 / 字体设置 / 工具状态
- 所有调试器栈帧（如果有未关闭的 debugger）

启动 = 加载 image 到内存，关闭 = 写出 image。所有修改持久化。

vs Unix 文件系统：
- Unix：源码 → 编译 → 二进制 → 运行 → 数据写文件 → 关闭丢失运行时状态
- Smalltalk：源码 + 二进制 + 运行时状态 都在 image 里，永远 live

优势：
- 修改代码立即生效，不需要重启
- 调试时可以暂停 / 修改 / 恢复
- 实验性质的探索（live coding）

劣势：
- image 越用越大，"垃圾" 累积（dead code、forgotten objects）
- 多人协作困难（image 是单机状态，git 不友好）
- 部署到生产是难题（image 包含 IDE、调试器、不需要的工具）
- 解决方案：Monticello / Iceberg（git 集成）、Filein/Fileout（导出 .st 文本）

## Theorem 1 — Universality（≥ 20 行）

5 个 message: `+`、`assign`、`return`、`if`、`while` 在 Smalltalk-80 里都是 message send，没有 special syntax。
这让语言极简（核心 ~5 个原语 + 1 个 send 操作）。

```smalltalk
"true 和 false 用 message 实现"
True>>ifTrue: aBlock ifFalse: bBlock
    ^ aBlock value.

False>>ifTrue: aBlock ifFalse: bBlock
    ^ bBlock value.

"3 < 5 返回 true 或 false 对象，对它 send ifTrue:ifFalse:"
(3 < 5) ifTrue: ['yes'] ifFalse: ['no'].

"完全不需要 if 关键字"
```

这是 Smalltalk 设计的极致简洁：
- LISP：1 + 7 个 special form（lambda, define, if, cond, let, quote, set!）
- Smalltalk：1 个 send 操作 + 类层次
- C / Java：~50 个关键字 + 各种 special syntax

## Section 5 — 实验：Smalltalk vs Java vs Python（≥ 30 行）

| 维度 | Smalltalk-80 | Java | Python |
|---|---|---|---|
| 一切都是对象 | 严格 | 几乎（primitive type 不是） | 几乎（low-level type）|
| message passing | 严格 | method call | method call + duck typing |
| live image | 是 | 否（class 文件 + JVM）| 否（pyc + interpreter）|
| GC | 是（generational） | 是 | 是 |
| GUI 内建 | 是（开始就有） | 否（AWT/Swing 后加） | 否（tkinter 后加）|
| IDE 内建 | 是（Browser） | 否（Eclipse/IntelliJ） | 否（PyCharm）|
| 类型系统 | 动态 | 静态 | 动态 |
| 性能 | 慢（VM + GC） | 中（JIT） | 慢 |
| 工业采用 | 1980s 高，2000s 低 | 1995-至今 主流 | 2000s 至今 主流 |
| 元编程 | 强（MOP） | 弱（reflection） | 中（metaclass） |
| reflection | 完全（包括 source）| 部分 | 部分 |
| 部署 | 难（image-based） | 易（jar/war） | 易（pip）|
| 生态 | 小（GemStone、Pharo） | 巨大 | 巨大 |

为什么 Smalltalk 输给 Java？
1. 性能：1995 年 ParcPlace VM 比 C++ 慢 10 倍，比 JVM 慢 3-5 倍
2. 价格：ParcPlace 收 $5000/seat，Java 免费
3. 部署：image 大、不能 strip、不能交叉编译；Java jar 简单
4. 语法：Smalltalk 太另类，C++/Java 程序员看不懂
5. 营销：Sun 投巨资推 Java，Xerox / ParcPlace 营销不力
6. 生态：Java 早期就有 servlet、JDBC、JNDI；Smalltalk 都是商业方案

## Section 6 — 后续衍生 + 影响（≥ 30 行）

直接衍生：
- **Self（David Ungar 1986）**：去掉 class，纯 prototype。直接启发 JavaScript prototype 链
- **Objective-C（Brad Cox 1983）**：C + Smalltalk 消息传递。NeXT/Apple 主语言至 2014
- **Java（James Gosling 1995）**：Smalltalk OOP + C++ 语法 + JVM。统治企业开发 25 年
- **Python（Guido 1991）**：Smalltalk + Modula。每个对象有 __dict__ method dictionary
- **Ruby（Matz 1995）**：Matz 公开称 Ruby 是"Smalltalk + Perl 的混血"
- **Erlang（Joe Armstrong 1986）**：Smalltalk 消息传递 + 分布式 actor
- **Pharo / Squeak**：现代 Smalltalk 复活（研究、教育）
- **Newspeak（Gilad Bracha 2007）**：Java 派的 Smalltalk 现代化尝试
- **Dart（Lars Bak 2011）**：Self/V8 经验做的现代脚本语言

技术启发：
- Java GC + bytecode VM：直接来自 Smalltalk
- IDE 概念（Eclipse / IntelliJ / VS Code）：Browser 的延伸
- MVC（React / Vue / Angular）：Reenskaug 1979 在 Smalltalk 实践
- IDE refactoring 工具（Don Roberts 1996 Smalltalk Refactoring Browser）：IntelliJ refactor 起源
- hot reload（React Fast Refresh / Erlang code reload）：image-based 思想退化
- live coding（Sonic Pi / Glamorous Toolkit）：Smalltalk live image 复兴

非技术启发：
- Steve Jobs 1979 PARC 之行：见到 Smalltalk + GUI → Macintosh 设计基础
- Alan Kay Dynabook 1973 设想：iPad 2010 实现
- 教育领域：Etoys / Scratch（MIT Media Lab）—— 让小孩学编程

## Section 7 — 现代复活：Pharo / Squeak / Glamorous Toolkit（≥ 25 行）

2003 年 Squeak 开源（Alan Kay + Dan Ingalls 主导），目标：
- 教育（小孩学编程，Etoys）
- 研究（Croquet，VR / 元宇宙）
- 探索（替代 Linux / Windows 的"个人计算机"愿景）

2008 年 Pharo fork from Squeak：
- 更现代的 IDE（Calypso Browser）
- 更好的 git 集成（Iceberg）
- 更小的核心 image（dead code 清理）
- 工业友好（GemStone 数据库 / Seaside web 框架）

Glamorous Toolkit（Tudor Girba 2018）：
- "moldable development"：每个数据结构有自己的 inspector view
- 把 IDE 当作"思考工具"，不只是写代码
- 启发 Cursor / Zed 等现代 IDE 的 AI 集成方向

应用领域（2024）：
- 金融：JPMorgan Kapital（外汇交易系统，Smalltalk 25 年）
- 物流：UPS / FedEx 内部系统（部分仍在 Smalltalk）
- 数据库：GemStone/S（持久化对象数据库）
- 教育：Etoys / Scratch（小孩学编程）
- 研究：CS 课程（OOP 教学的最佳载体）

## 怀疑（≥ 4 段）

> 怀疑：Smalltalk 1980s 太超前——live image / GC / GUI / IDE 一次性给齐，但工业用不起 ParcPlace VM 高价 + 性能差。如果 Sun 早 5 年开源 Smalltalk + 改 C++ 语法，是不是 Java 就不会被发明？答案可能：会发明类似的，但不会叫 Java。商业生态决定语言命运，不只是技术优劣。

> 怀疑：Alan Kay 多次说"我说的 OOP 不是 C++/Java 那种"。他原意是"消息传递 + 极致动态"，工业理解成"class + 继承"。50 年后我们用的"OOP" 是被简化的版本。这是工业实用主义的胜利还是哲学的失败？也许都对：哲学纯粹度让位于工程可行性。

> 怀疑：现代 Smalltalk（Pharo / Squeak）仍是研究界小众。每年 ~10000 活跃用户。是因为生态太小回不去主流？还是 Smalltalk 哲学本身（everything is an object）在编译期类型时代不再优势？Rust / Go 的崛起证明：现代主流是"少 OOP + 多 type / concurrency"，Smalltalk 的方向被时代抛弃了。

> 怀疑：Live image-based development 在 2024 hot reload / Smalltalk image 概念上 IDE（如 Cursor / VS Code）部分实现。但完整 image 思想在 cloud / serverless 时代是否复活？还是 stateless / 12-factor 已彻底胜出？目前看 stateless 主导，但 LLM 长程记忆 / agent state persistence 可能让 image 思想以新形态回归。

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

- squeak-smalltalk/squeak-vm: `https://github.com/squeak-smalltalk/squeak-vm/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/vm/sqVM.h`
- pharo-project/pharo: `https://github.com/pharo-project/pharo/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/Kernel/Object.class.st`
- OpenSmalltalk/opensmalltalk-vm: `https://github.com/OpenSmalltalk/opensmalltalk-vm/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/platforms/Cross/vm/sqVirtualMachine.c`

## 学到 + 关联（≥ 15 行）

学到 ≥ 5：
1. "everything is an object" 是 OOP 的纯粹形态，但工程实践退而求次
2. 消息传递 vs 方法调用：哲学差异巨大，工程影响微小
3. live image 是 hot reload 的理论上限
4. IDE / GUI / GC 都是 Smalltalk 给现代计算机的礼物
5. Alan Kay 的"未来计算"哲学影响 Apple / iPad / 教育软件
6. 商业生态决定语言成败，不只是技术优劣
7. 元编程（MOP）是 Smalltalk 给 Python / Ruby 的核心遗产
8. 单根继承 + dynamic dispatch 是现代 OO 语言的最大公约数
9. inline cache（Self 1986）是 V8 / HotSpot 性能基础
10. MVC 在前端框架（React / Vue）以新形态延续

关联：
- [[mccarthy-lisp]] —— 函数式 vs OOP 双源头，元编程思想 LISP 给 Smalltalk
- [[hindley-milner]] —— 静态类型 vs Smalltalk 动态类型对照
- [[lambda-calculus]] —— 计算理论基础
- [[turing-1936]] —— 计算的可计算性根源
- [[llvm]] —— 现代编译器基础设施（vs Smalltalk image-based）
- [[ssa]] —— 现代编译器中间表示
- [[self-pic]] —— Self / V8 的 inline cache（Smalltalk 性能优化的延续）
- [[design-patterns-gof]] —— GoF 1994 大量 Smalltalk 例子
- [[mvc-reenskaug]] —— Trygve Reenskaug 1979 在 Smalltalk 提出
