---
title: Pharo — 现代 Smalltalk 环境
来源: https://github.com/pharo-project/pharo
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

# Pharo — 现代 Smalltalk 环境

## 一、从"活着的程序"说起

你用过 VS Code 或 IntelliJ 吗？写代码 -> 保存 -> 编译 -> 运行 -> 看结果 -> 改代码。每一步都在重启。

Pharo 做的事情完全不同。你可以把 Pharo 想象成一整个操作系统长在了代码编辑器里——你的程序、调试工具、代码浏览器、甚至 Git 管理，全部融合在同一个界面里。

最核心的区别：**Pharo 里的代码是活的**。你可以在程序运行的时候直接修改类的定义、添加新方法、改变继承关系，而无需重启。就像一个人在说话的过程中突然改变了思路，听众能立即跟上，而不是让他停下来全部重说。

## 二、从小故事理解"一切皆对象"

在大多数语言里，数字 42 是一个"基本类型"，字符串 "hello" 是另一个"基本类型"，它们和自定义的类是不同级别的存在。

在 Pharo 里，**没有基本类型**。42 是 `Integer` 对象的一个实例，"hello" 是 `String` 对象的一个实例，你的自定义类也是对象。甚至"类"本身也是对象（它有对应的 MetaClass）。

这就像：你家的每一个成员都有自己的房间（包括你自己），没有"这个人和家具不是一类"的说法。所有人都住在房子里，遵守同样的规则。

因为"一切皆对象"，所以 Pharo 只用了 6 个保留字就完成了一套完整的语法。它的语法卡片甚至能印在一张明信片上——这也是为什么 Pharo 社区常说"语法小到装得下一张明信片"。

## 三、核心概念

### 3.1 消息传递（Message Passing）

Pharo 中没有传统意义上的"函数调用"。你发送消息给对象，对象决定如何回应。

这听起来抽象？想象你在餐厅点餐：

- 在 Java/Python 里，你说的是"调用厨房的 cook(汉堡) 方法"——你把动作和参数一起扔过去
- 在 Pharo 里，你说的是"厨房，请做一个汉堡"——你发一条消息给厨房对象

在代码层面，`42 factorial` 不是调用 42 的 factorial 方法，而是向 42 这个对象发送 factorial 消息。对象自己决定怎么算。

### 3.2 系统镜像（System Image）

Pharo 把你的整个开发环境打包成一个"镜像"文件（.image）。这就像给整个虚拟机拍了一张快照——包含所有对象、所有代码、所有运行状态。

你可以：
- 在调试时保存镜像，下次直接恢复现场
- 把整个程序的状态发给同事，而不是只发代码
- 在生产环境中热更新代码，因为整个环境是活的

这不像普通的"保存文件"，更像是给游戏存档——你保存的不是一段代码，而是整个世界。

### 3.3 反射与自省（Reflection）

Pharo 让你能"看到程序内部的每一根电线"。你可以：
- 列出某个类的所有实例
- 找出哪些对象引用了某个对象
- 查看、修改、替换方法的定义
- 枚举一个类的所有父类、所有方法

就像你能走进汽车发动机里面，一边看一边改零件，然后直接开走。

### 3.4 调试器不只是调试器

Pharo 的调试器可以做普通调试器做不到的事：
- 在调试时修改代码并立即生效
- 重启方法的执行（从中间某行重新跑）
- 在调试时创建新方法
- 修改异常的行为，甚至带着替代结果继续运行

### 3.5 小语法，大威力

Pharo 只有 6 个保留字：`self`、`super`、`nil`、`true`、`false`、`thisContext`。

所有控制结构（if/else、loop、for）都是用闭包（closures）和消息传递实现的，而不是语言内置的语法。这意味着你可以用 Pharo 自己的语法，创造属于自己的控制结构。

---

## 四、代码示例

### 示例 1：基本消息传递与集合操作

```smalltalk
"向 42 发送 factorial 消息，计算 42 的阶乘"
42 factorial.
"结果: 140500611775287989854314260624451156993638400000000"

"创建字符串并发送消息"
'Hello, Pharo!' size.
"结果: 13

'Hello, Pharo!' upcase.
"结果: 'HELLO, PHARO!'"

"创建集合并遍历"
{ 1 . 2 . 3 . 4 . 5 } collect: [ :each | each squared ].
"结果: { 1 . 4 . 9 . 16 . 25 }

{ 'apple' . 'banana' . 'cherry' } select: [ :word | word size > 5 ].
"结果: { 'banana' . 'cherry' }
```

这里展示了 Pharo 的消息传递风格：
- `42 factorial` —— 向 42 发送"阶乘"消息
- `size`、`upcase`、`collect:`、`select:` —— 都是向集合/字符串发送的消息
- `[ :each | ... ]` —— 这是一个闭包（匿名函数），`:` 后面是参数，`|` 后面是方法体
- `squared` —— 是向数字发送的消息，返回它的平方

### 示例 2：定义类与面向对象

```smalltalk
"定义一个 Person 类"
Object subclass: #Person
    instanceVariableNames: 'name age'
    classVariableNames: ''
    package: 'MyApp'.

"给 Person 类添加方法"
Person methodsClass side: #instance
    name: aString age: anInteger
        name := aString.
        age := anInteger.

Person methodsClass side: #instance
    fullName
        ^ 'Hello, my name is ' , name.

Person methodsClass side: #instance
    isAdult
        ^ age >= 18.

"创建实例并发送消息"
| alice bob |
alice := Person name: 'Alice' age: 25.
bob := Person name: 'Bob' age: 15.

alice fullName.
"结果: 'Hello, my name is Alice'

alice isAdult.
"结果: true

bob isAdult.
"结果: false

"查看某个类的所有实例"
Person allInstances.
"结果: { alice . bob }

"找出所有成年人的名字"
(Person allInstances select: [ :p | p isAdult ]) collect: [ :p | p name ].
"结果: { 'Alice' }
```

这展示了几个关键概念：
- `Object subclass: #Person` —— 从 Object 派生出 Person 类。在 Pharo 中，所有类最终都继承自 Object
- `instanceVariableNames: 'name age'` —— 定义两个实例变量
- `methodsClass side: #instance` —— 指定这是实例方法（非类方法）
- `^` —— 返回结果（类似 return）
- `:=` —— 赋值操作符
- `allInstances` —— 向 Person 类发送消息，返回所有实例（反射的力量）

### 示例 3：类在运行时的演化

```smalltalk
"先查看 Person 类现有的实例变量"
Person instVarNames.
"结果: #('name' 'age')

"在程序运行时，给 Person 类动态添加一个新的实例变量 'email'"
Person addInstVar: #email.

"这时，已经存在的 alice 和 bob 自动多了一个 email 属性！"
Person allInstances.
"结果: { alice . bob } —— 它们现在都有 email 属性了，虽然还没设值

"给 alice 设置 email"
alice email: 'alice@example.com'.

"甚至可以在运行时改变继承关系"
Object subclass: #Employee subclass: #Person
"Employee 现在也是 Person 的子类（在 Pharo 的某些版本中支持）"
```

这就是"代码是活的"的真正含义——你可以在程序不重启的情况下改变类的结构，所有已经存在的对象都会自动适配。

---

## 五、Pharo 的独特之处

### 5.1 IDE 与程序的边界消失

在普通开发工具中，你写的代码和你使用的 IDE 是分离的。在 Pharo 中，IDE 本身也是用 Pharo 写的——浏览器、调试器、代码编辑器，全都是 Pharo 对象。

这意味着你可以修改 IDE 的任何部分来适应你的需求。比如，你可以为一个特定的类创建一个专门的可视化工具，Pharo 叫这个"Moldable IDE"——可塑形的集成开发环境。

### 5.2 内置 Git 支持

Pharo 的 IDE 内置了完整的 Git 管理功能：
- 按方法粒度（而非文件）追踪代码变更
- 在 IDE 里直接比较方法的修订历史
- 在 IDE 里创建 Pull Request
- 合并分支的粒度到方法级别

这比普通的文件级 Git 管理要精细得多。

### 5.3 高性能虚拟机

Pharo 的虚拟机 Cog 使用了即时编译（JIT），将 Pharo 字节码编译为机器码。加上 Spur 内存管理器（分代垃圾回收），Pharo 的性能已经可以和其他主流语言的环境相媲美。

### 5.4 元编程能力

Pharo 的元模型允许你修改语言本身的语义：
- Traits（特质）—— 一种比多重继承更灵活的行为复用方式
- Metalinks —— 在方法的抽象语法树上插入钩子，实现断点、覆盖率测试等功能
- Proxy objects —— 代理对象可以拦截并重发所有消息给另一个对象

---

## 六、Pharo 的历史与生态

Pharo 诞生于 2008 年 3 月，从 Squeak 分支出来。Squeak 本身又源自 1980 年代 Xerox PARC 的 Smalltalk-80。也就是说，Pharo 是 Smalltalk 家族中最活跃的当代继承者。

- 当前最新版本：13.1（2025 年 6 月发布）
- 语言占比：99.8% Smalltalk
- 开源协议：MIT License
- 社区：Pharo Consortium（企业支持）+ Pharo Association（个人支持）
- 主要支持者：Inria（法国国家信息与自动化研究所）

生态中有几个知名项目：
- **Seaside** —— 用于动态 Web 开发的框架
- **Zinc** —— HTTP 服务器组件
- **Moose** —— 软件分析工具
- **Roassal** —— 数据可视化工具

---

## 七、如何开始

Pharo 支持 Windows、macOS 和 Linux（包括 ARM 处理器）。最简单的启动方式：

```bash
# 下载并运行（macOS / Linux）
wget -O- https://get.pharo.org/64 | bash
./pharo Pharo.image eval "42 factorial"
```

或者直接从 [pharo.org/download](https://pharo.org/download) 下载对应的安装包。

Pharo 还提供在线课程（Mooc），已有超过 3000 人注册学习。

---

## 八、一句话总结

> Pharo 不只是编程语言——它是一个"活着的开发环境"，让你在代码运行时随时观察、修改、扩展程序，就像在跟代码对话而不是跟机器对话。
