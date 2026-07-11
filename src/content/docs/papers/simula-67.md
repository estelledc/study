---
title: SIMULA 67 — 面向对象的诞生
来源: Dahl & Nygaard, "SIMULA 67 Common Base Language", 1968
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

SIMULA 67 是挪威 1967 年造出来的一门"做模拟实验"的语言。它本来想解决一个具体问题：怎么在电脑里模拟"船在港口排队卸货"。结果造着造着，**无意中发明了 class、object、继承，并把协程写进通用语言**——也就是后来整个面向对象编程（OOP）的根。

日常类比：像在做沙盘推演时，桌上每个士兵都是一个**有自己脾气的个体**——他记得自己走过的路、剩多少弹药、下一步想干什么。SIMULA 之前的语言只能写"流程"（先做 A，再做 B），SIMULA 第一次让"个体"成为语言的一等公民。

两位作者 Ole-Johan Dahl 和 Kristen Nygaard 都不是计算机科学家，是**运筹学**研究者——研究怎么优化排队、调度、物流。他们发明的不是 OOP，是"如何把模拟问题写得优雅"——OOP 是副产品。

## 为什么重要

不夸张地说，**今天你写的几乎每一行 OOP 代码，都欠 SIMULA 67 一份债**：

- **class / object / inheritance 三个词，第一次同时出现在 SIMULA 67 里**——之前的语言只有"过程"和"数据"，没有"把它们绑在一起的类型"
- **协程（coroutine）被它写进通用语言**——Conway 1958/1963 先提出概念；SIMULA 把可挂起、保留状态、再恢复的对称协程做成语言原语。今天 Go 的 goroutine、Python 的 async/await，工业源头多追溯到这里
- **Smalltalk / C++ / Java / Python 的 OOP 全部直接或间接继承自它**——Smalltalk 的 Alan Kay 公开承认看了 SIMULA 受启发；C# / Kotlin / Scala 是 Java 的徒孙，也都是 SIMULA 的曾孙
- **Bjarne Stroustrup（C++ 作者）的故事最直接**——他在剑桥读博时用 SIMULA 做操作系统仿真，毕业后想"把这种思想带到 C 上"，于是有了 C++（最初叫 C with Classes）。C++ 的 class 就是 SIMULA class 的工业化版本

## 核心要点

SIMULA 67 给后世留下三件大礼：

1. **类与对象（class + object）**：类是模板，对象是按模板造出来的个体。一个对象同时装着**数据**（它的状态）和**方法**（它能干的事）。这之前的语言要么只能定义数据结构（C 的 struct），要么只能定义函数——SIMULA 第一次把它们焊死在一起。

2. **继承（inheritance）**：如果"储蓄账户"和"普通账户"90% 行为一样，没必要复制粘贴——子类可以"前缀"父类，自动继承所有字段和方法，只写差异部分。SIMULA 67 论文里管这叫 **prefix**（前缀），强调它是"在已有类前面再加点东西"。

3. **协程（coroutine）**：对象不只是"被动的数据袋"，它有自己的"执行点"——可以跑到一半暂停（`detach`），过一会儿再从断点恢复（`resume`）。这让"船 A 卸货等 5 分钟，期间船 B 进港"这种仿真逻辑能直接表达，不必手写复杂的事件循环。

## 实践案例

### 案例 1：Account 类 — 把数据和方法绑一起

银行账户的 SIMULA 67 代码：

```
class Account(initial_balance);
  integer initial_balance;
begin
  integer balance;
  balance := initial_balance;

  procedure deposit(amount); integer amount;
  begin
    balance := balance + amount;
  end;

  procedure withdraw(amount); integer amount;
  begin
    if amount <= balance then
      balance := balance - amount;
  end;
end;
```

用法：

```
ref(Account) a;
a :- new Account(100);
a.deposit(50);     -- balance 变 150
a.withdraw(30);    -- balance 变 120
```

注意 `:-` 是**引用赋值**（让 a 指向新对象），`:=` 是值赋值。这个区分今天在 Java/Python 看不到——它们把两种赋值合并了，但代价是新人常踩"对象赋值是引用还是拷贝"的坑。

### 案例 2：SavingsAccount 继承 Account

写一个"储蓄账户"，多一个 `addInterest`（计利息）方法：

```
Account class SavingsAccount(rate);
  real rate;
begin
  procedure addInterest;
  begin
    balance := balance + balance * rate;
  end;
end;
```

`Account class SavingsAccount` 就是"SavingsAccount 前缀 Account"——也就是后来 Java 写的 `class SavingsAccount extends Account`。

用法：

```
ref(SavingsAccount) s;
s :- new SavingsAccount(1000, 0.05);
s.deposit(500);     -- 继承自 Account
s.addInterest;      -- SavingsAccount 自己的
```

`addInterest` 里直接用了 `balance`——这是从 Account 继承来的字段。SIMULA 67 把"前缀拼接"看成是字面意义上的代码组合：父类字段 + 子类方法 = 完整对象。Java 后来加的 `super.method()` 是同一个想法的"主动调用"版本。

### 案例 3：协程 — 一段离散事件仿真

模拟"生产者造一个零件就停，消费者来取一次再恢复生产"：

```
class Producer;
begin
  integer i;
  for i := 1 step 1 until 5 do
  begin
    outtext("produced item "); outint(i); outimage;
    detach;     -- 生产完一件就让出 CPU
  end;
end;

class Consumer;
begin
  ref(Producer) p;
  p :- new Producer;
  while not p.terminated do
  begin
    resume(p);  -- 让 producer 再跑一步
    outtext("consumed one"); outimage;
  end;
end;
```

执行轨迹：Consumer 先创建 Producer（Producer 跑到第一个 detach 暂停） → resume 让 Producer 跑到下一个 detach → 如此交替。**两个对象保留各自的状态，轮流执行**——这就是协程。

今天 Go 的 goroutine 是这个思想的工业化版本，区别是 Go 加了调度器自动切换，SIMULA 是手动 detach/resume。

## 踩过的坑

1. **prefix 不是 subclass，方向反了**：SIMULA 67 写 `Account class SavingsAccount`，前面是父、后面是子；Java 写 `SavingsAccount extends Account` 反过来。读老论文容易搞混。理解口诀：SIMULA 67 把继承看成"在已有类**前面**加新代码"，所以叫 prefix。

2. **没有 `super` 关键字，用 `inner` 反向控制**：Java 子类调 `super.method()` 主动调父类；SIMULA 67 反过来——父类用 `inner` 占位，子类的 body 在那个位置"插入"。主动权在父类。这种思路后来叫 Inversion of Control（控制反转），但在 1968 年它就是 SIMULA 的默认语义。

3. **coroutine 是对称的，不像 Python async**：SIMULA 的 `resume(X)` 后，X 可以 `resume(Y)` 给任意第三方，控制权随便转。Python `await` 只能 yield 给调用者。对称协程更灵活，但也更难推理状态——这是 Python 故意做了限制。

4. **GC 在 1968 年慢得离谱**：SIMULA 67 内嵌了 mark-sweep 垃圾回收，但 UNIVAC 1107（200K 内存）跑起来 GC 暂停可达**几秒**。这导致 Pascal（1970）/ C（1972）故意不做 GC——硬件不够。直到 Java（1995）出来，硬件才追上 SIMULA 的设想。

## 适用 vs 不适用场景

**适用**：
- 理解任何 OOP 语言（Java / C++ / Python / Kotlin / Scala）的"类、对象、继承"为什么长这样——根都在这里
- 离散事件仿真（排队、物流、交通、数字孪生）—— SIMULA 思想沿用至今（SimPy / AnyLogic 直接复刻 API）
- 设计需要"长生命周期、保留状态"的对象抽象（actor 模型、状态机、stateful workflow）

**不适用**：
- 写实际生产代码——SIMULA 67 编译器今天几乎找不到，要学 OOP 直接用 Java / Python
- 高性能场景——SIMULA 的 GC 和对象语义有开销，对极致性能不友好（C++ 故意去掉 GC 就为这个）
- 函数式编程范式——SIMULA 是 OOP 鼻祖，FP 的祖宗是 LISP / λ 演算，方向不同

## 历史小故事（可跳过）

- **1962 年**：Nygaard 在挪威计算中心想做"船舶卸货排队仿真"，和 Dahl 在 Algol 60 上加仿真扩展叫 SIMULA I——已有"过程作为对象"雏形但绑死在仿真场景。
- **1967 年 5 月**：Oslo IFIP 工作会议上把"process"抽象成通用 **class**——任何"数据 + 操作" 都可以是 class，C.A.R. Hoare、Per Brinch Hansen 参与讨论；会后正式定义为 SIMULA 67。
- **1972 年**：Alan Kay 在 Xerox PARC 看了 SIMULA 论文，受启发做了 [[smalltalk-80]]——把"调用方法" 改成"发送消息"，OOP 自此分两派。
- **1979 年**：Bjarne Stroustrup 在剑桥用 SIMULA 67 写博士论文，毕业后做了 C with Classes → C++（1985）。
- **2001 年**：图灵奖授予 Dahl 和 Nygaard 表彰"OOP 的奠基性贡献"，**第二年两人相继去世**，间隔仅 3 个月。

## 学到什么

1. **好思想需要等硬件**：SIMULA 67 的 GC 在 1968 年是过度工程，到 1995 年 Java 时代才落地。今天在用的"形式化验证 / dependent types / effect system"，可能也是另一种"对未来下注"

2. **副产品比目标更重要**：Dahl 和 Nygaard 想做仿真工具，做出来 OOP；JavaScript 想做表单脚本，做出来全栈语言；HTTP 想做学术论文链接，做出来万维网。**伟大发明的诞生轨迹，常常和初衷无关**

3. **先驱不一定赢市场，每条范式都有它的"祖坟"**：SIMULA 67 是 OOP 鼻祖，但工业级落地等到 C++（1985）和 Java（1995）；OOP 的祖坟在 SIMULA、FP 的祖坟在 LISP、类型推导的祖坟在 [[hindley-milner]]——读祖坟是看清今天每个设计决策的来路

## 延伸阅读

- Computerphile 视频：[Simula — Computerphile](https://www.youtube.com/watch?v=mp5lAtRn9XU)（Brailsford 教授十几分钟讲完 SIMULA 来龙去脉）
- 论文 PDF：[SIMULA 67 Common Base Language（1968）](https://softwarepreservation.computerhistory.org/ALGOL/manual/Simula-CommonBaseLanguage.pdf)（密度高，先读前两章即可）
- Stroustrup 自述：[The Design and Evolution of C++](https://www.stroustrup.com/dne.html)（第 1 章讲 SIMULA 怎么影响他）
- [[smalltalk-80]] —— OOP 的另一支血脉，Alan Kay 把 SIMULA 推到极致
- [[hindley-milner]] —— 同代的另一个奠基性思想，类型推导的祖宗

## 关联

- [[smalltalk-80]] —— Alan Kay 看 SIMULA 受启发后做的"激进版 OOP"，把消息传递推到极致
- [[hindley-milner]] —— SIMULA 走 OOP 路线（class），HM 走类型推导路线（function），两条主线塑造了今天所有静态语言
- [[lambda-calculus]] —— FP 的祖坟，与 SIMULA 同期但完全不同方向
- [[mccarthy-lisp]] —— GC 的最早出处（1958），SIMULA 借鉴了 LISP 的 mark-sweep 算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[hotspot-server-compiler]] —— HotSpot Server Compiler — JVM 在运行时把热点 Java 代码翻译成飞快的本地码
- [[hydra-1974]] —— HYDRA — 用 capability 把整个内核重做成对象 + 票据
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[mccarthy-lisp]] —— McCarthy LISP 1960
- [[monitors-1974]] —— Hoare Monitors 1974 — 把锁藏进对象里，让并发代码读起来像普通函数
- [[self-customization]] —— SELF Customization — 给每种"调用者类型"现场打一份方法
- [[smalltalk-80]] —— Smalltalk-80
- [[strongtalk]] —— Strongtalk — 可以装可以卸的 Smalltalk 类型系统

