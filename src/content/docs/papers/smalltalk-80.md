---
title: Smalltalk-80
来源: 'Adele Goldberg & David Robson, "Smalltalk-80: The Language and its Implementation", Xerox PARC 1983'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Smalltalk-80 是 1980 年 Xerox PARC 团队设计的一门"**一切都是对象**"的编程语言。日常类比：想象桌上每件物品都是个有自己脾气的小生命——茶杯会回应"加水"，台灯会回应"开灯"——它们之间不靠按钮也不靠开关，而是互相递便条说"请你做这件事"。

代码长这样：

```smalltalk
| sum |
sum := 0.
1 to: 10 do: [:i | sum := sum + i].
```

这段代码累加 1 到 10。但有个反常的事实：**`+`、`to:do:`、连数字 `5` 本身都是对象**。`5 + 3` 在 Smalltalk 眼里是"对象 5 收到一张叫 `+ 3` 的便条"。

## 为什么重要

不理解 Smalltalk-80，下面这些事都没法解释：

- 为什么 Java / Python / Ruby / Objective-C / Swift 都把"对象"当核心概念——它们的祖父辈都在这本 1983 年的"蓝皮书"里
- 为什么 IDE 里"修改代码立刻看到效果"是天经地义的——这个体验是 Smalltalk 第一个做出来的
- 为什么 MVC（Model-View-Controller）会成为前端架构标准——它在 Xerox PARC 的 Smalltalk 项目里诞生
- 为什么 Alan Kay 后来反复说"我说的 OOP 不是 Java 那种"——因为他指的是**消息传递**，不是 class 和继承

## 核心要点

Smalltalk-80 的设计可以浓缩成 **三件事**：

1. **一切都是对象 + 用消息说话**：连数字、布尔值、`if/else` 控制流都是对象。`5 + 3` 是给 5 发消息 `+`，参数是 3。`if x > 0 then ... else ...` 是给布尔对象发消息 `ifTrue:ifFalse:`。

2. **Image-based 持久化**：整个内存（所有对象 + 所有源代码 + 所有窗口位置）保存成一张"镜像"快照。下次启动直接接着昨天的状态跑，连未关闭的调试器都还在。类比：电脑不是关机重启，而是冬眠醒来。

3. **Live coding**：改一个类的方法，**已经存在的对象立即生效**。不重启、不重新编译。类比：飞机飞行中换引擎，乘客毫无察觉。

## 实践案例

### 案例 1：连循环都是消息

```smalltalk
| sum |
sum := 0.
1 to: 10 do: [:i | sum := sum + i].
"sum = 55"
```

读法：

- `1 to: 10 do: [...]` 不是 for 循环关键字，是给数字 1 发一个名叫 `to:do:` 的消息
- 参数是数字 `10` 和一个 block（闭包）`[:i | sum := sum + i]`
- 数字 1 收到消息后，自己负责重复执行 block，每次把当前数传给 `i`

整个语言只有 **send 一种操作**，不需要 `for` / `while` 关键字。

### 案例 2：定义一个类 + super

```smalltalk
Object subclass: #Account
    instanceVariableNames: 'balance'
    classVariableNames: ''.

Account >> deposit: amount
    balance := balance + amount.
    ^ self.

Account subclass: #SavingsAccount
    instanceVariableNames: 'rate'.

SavingsAccount >> deposit: amount
    super deposit: amount.
    balance := balance + (amount * rate).
    ^ self.
```

读法：

- `Object subclass: #Account`：在 Object 下新建 Account 类，实例有 `balance`
- `Account subclass: #SavingsAccount`：SavingsAccount **继承** Account，再多一个 `rate`（利息比例）
- `super deposit: amount`：先跑父类的 deposit（把本金加进 balance），再按 `amount * rate` 加一笔奖励利息
- 这就是**继承 + 覆盖**：子类改写同名方法，但还能用 `super` 复用父类逻辑

### 案例 3：live coding 改类立刻生效

假设系统里已有 `a := Account new`，且 `a deposit: 100` 跑过。打开浏览器，把 `Account>>deposit:` 从：

```smalltalk
balance := balance + amount.
```

改成：

```smalltalk
balance := balance + amount + 1.
```

保存后，**同一个** `a` 再发 `deposit: 100` 就会多加 1——不用重启、不用 `Account new`。VM 只是把方法字典里的指针换成新版本，下次消息走新路径。
## 踩过的坑

1. **image 越用越大**：所有"忘记的对象"和"半成品代码"都留在 image 里，几个月后 image 从 30 MB 涨到 500 MB。现代 Pharo 用 Iceberg（git 集成）+ 干净启动 image 缓解。

2. **多人协作难**：image 是单机状态，git diff 完全不友好（二进制）。1990 年代用 Monticello 切片导出文本，现代 Pharo 改成跟 git 兼容的格式。

3. **部署到生产困难**：image 包含 IDE / 调试器 / 临时变量——直接丢服务器上既臃肿又危险。要专门做 strip image 工具，剔除生产不需要的部分。

4. **性能慢**：每次 send 都要查方法字典，1980s 比 C 慢约 10 倍。Self（约 1986）发明 inline cache；经 Self / Strongtalk 一脉，同样思路进了 HotSpot 与 V8——今天 JS 引擎快，有这条血脉的功劳。

## 适用 vs 不适用场景

**适用**：

- 教育（Etoys / Scratch 是 Smalltalk 的后代——给小孩学编程）
- 探索性研究（live image 让"边想边改"很顺）
- 长期运行的金融系统（JPMorgan Kapital 用了 25 年；状态全在 image 里活着）
- 持久化对象数据库（GemStone：把 image 思想做成多机数据库）

**不适用**：

- 容器化 / serverless（image 思想和 stateless 部署天生冲突）
- 需要静态类型 / 编译期检查（Smalltalk 是动态的，错的消息要运行时才发现）
- 团队 > 50 人 + 严格 code review 流程（image 协作和 PR 流程不匹配）
- 需要 jar / wheel / npm 这种打包发布（image 不是一个文件 = 一个产物）

## 历史小故事（可跳过）

- **1971 年**：Alan Kay 在 Xerox PARC 提出"Dynabook"愿景（一台小孩能用的个人电脑），需要配一门小孩能学会的语言。受 [[simula-67]] 启发设计 Smalltalk-72，Dan Ingalls 实现。
- **1976 年**：Smalltalk-76 加入 class 继承和 bytecode VM——开始有现代 OOP 的样子。
- **1979 年**：Steve Jobs 参观 Xerox PARC，看到 Smalltalk 的图形界面 + 鼠标 + 窗口，回 Apple 做 Lisa / Macintosh。
- **1980 年**：Smalltalk-80 定型，Adele Goldberg 主导文档化。
- **1983 年**：这本"蓝皮书"出版（封面是热气球，1981 年 Byte Magazine 八月号封面同款）。
- **1995 年**：Java 发布，吃掉 Smalltalk 的工业市场——但 Java 借了 Smalltalk 的 GC、bytecode VM、单根继承——只是把语法换成 C 风格。
- **2008 年**：Pharo fork from Squeak，Smalltalk 在研究和金融小圈子里活到今天。

## 学到什么

1. **"一切都是对象"是种世界观**——连 `if` 都不是关键字而是消息时，语言变得极简（核心 1 个 send 操作 + 类层次），但每一行代码都在思考"谁给谁发消息"
2. **Image-based 是 hot reload 的理论上限**——React Fast Refresh / Erlang code reload 都是 image 思想的退化版
3. **IDE / GUI / GC 都是 Smalltalk 给现代计算机的礼物**——Java GC、Eclipse Browser、IntelliJ refactor、JUnit 测试，每一项都能在 1980 年代 Smalltalk 找到原型
4. **Alan Kay 的 OOP 和 Java 的 OOP 不是同一件事**——前者强调消息传递 + 极致动态，后者强调 class + 继承 + 静态类型；工业界选了后者，但前者的精神留在 Erlang / actor / 微服务里
5. **商业生态决定语言成败**——Smalltalk 技术领先，但 ParcPlace VM 卖 $5000/seat、image 部署难、营销不力，输给免费的 Java；技术再好也得有可落地的商业模型

## 延伸阅读

- 蓝皮书 PDF：[Smalltalk-80: The Language and its Implementation](http://stephane.ducasse.free.fr/FreeBooks/BlueBook/Bluebook.pdf)（免费下载，660 页）
- Alan Kay 演讲：[The Early History of Smalltalk](https://gagne.homedns.org/~tgagne/contrib/EarlyHistoryST.html)（OOPSLA 1993，Kay 自己讲设计动机）
- 现代实现：[Pharo](https://pharo.org/)（开箱即用，下载就能玩 live image）
- [[simula-67]] —— Smalltalk 的精神祖先，class 概念发源
- [[mccarthy-lisp]] —— 元编程思想从 LISP 传到 Smalltalk

## 关联

- [[simula-67]] —— class / 继承的概念在 Simula 67 提出，Smalltalk 推到极致
- [[mccarthy-lisp]] —— LISP 的"代码即数据"和元编程思想被 Smalltalk 吸收成元类（metaclass）
- [[hindley-milner]] —— 静态类型推导 vs Smalltalk 的纯动态类型，两条不同路线
- [[lambda-calculus]] —— Smalltalk 的 block（闭包）本质就是 λ 演算项
- [[turing-1936]] —— 计算理论根基，Smalltalk 在它之上谈"如何组织计算"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[algol-60]] —— ALGOL 60 — BNF 与块结构
- [[beck-tdd]] —— Beck TDD — 用红绿重构循环让设计自己长出来
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[generational-gc]] —— Generational GC — 把全堆扫描换成"频繁扫小区，偶尔扫整堆"
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[hydra-1974]] —— HYDRA — 用 capability 把整个内核重做成对象 + 票据
- [[lieberman-realtime-gc]] —— Lieberman-Hewitt 1983 — 把对象寿命统计偏斜兑换成有界停顿
- [[liskov-abstraction-1974]] —— Liskov 抽象数据类型 — 用操作而不是存储形状定义数据
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[self-pic]] —— Self / PIC — 内联缓存的诞生
- [[simula-67]] —— SIMULA 67 — 面向对象的诞生
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统
