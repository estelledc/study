---
title: Beck TDD — 用红绿重构循环让设计自己长出来
来源: 'Kent Beck, "Test-Driven Development: By Example", Addison-Wesley 2002'
日期: 2026-05-30
分类: 软件工程
难度: 初级
---

## 是什么

测试驱动开发（**TDD**）是一种**先写一个会失败的测试，再写最少的代码让它通过，再回头清理**的开发节奏。日常类比：考试时你不是答完再检查，而是**先把题目读透抄在草稿纸上**，再围着这道题写解答。题目（测试）先于答案（实现）。

Kent Beck 2002 年的小书《Test-Driven Development: By Example》就讲这一个事：一段代码不是"写完再测"，而是和测试一起长出来。书里用一个货币加法的小例子从头到尾演示——

```python
def test_add():
    assert Money(5) + Money(5) == Money(10)  # 先写这一行，跑红
```

注意第一行就是测试。还没有 `Money` 类，跑起来必然报错（红）。然后写**最简单**的 `Money` 类让它绿，再回头清理。测试先于实现，是 TDD 区别于普通"单元测试"的唯一关键。

## 为什么重要

不理解 TDD，下面这些事都没法解释：

- 为什么 Fowler《重构》每一步都假设"有测试网"，那张网到底从哪来
- 为什么 OCaml / Rust 工程师改完代码敢按 Enter 提交——因为有测试当安全带
- 为什么 LLM 写代码时人最该坚持的反而是"先写一个小测试"
- 为什么"覆盖率 100%"听起来好但不是 TDD 的目标

## 核心要点

TDD 的工作流可以拆成 **三步循环**，外加两件搭配的工具：

1. **红（Red）**——写一个测试，跑，让它失败。证明"这个功能尚不存在"。类比：先在白纸上画一个空格，准备装答案。

2. **绿（Green）**——写最少的代码让测试通过。允许丑陋、允许写死返回值。类比：考试遇到不会的题，先随便写一个数占位，至少卷面是满的。

3. **重构（Refactor）**——清理代码，跑测试确认仍是绿。每一次小整理都立刻跑。类比：草稿写完誊抄到正式答卷，但保证内容不变。

围绕这三步还有两个常用工具：**Test List**（开始前写下所有想测的场景，一行一个，做完一个划掉一个）和 **Fake It**（不知道怎么实现就先写死返回值占位，等下一个测试逼出真实现）。每一格 30 秒到几分钟，**不允许跳格**。这种"小步走"是 TDD 的灵魂——出错时上一个绿点离你只有一分钟。

## 实践案例

### 案例 1：Money 加法（书里第一部分）

Beck 开篇第一件事是写 `[ ] $5 + $5 == $10`：

```python
def test_add():
    assert Money(5) + Money(5) == Money(10)
```

跑红。然后 Green 的实现允许"假"：

```python
class Money:
    def __init__(self, n): self.n = n
    def __add__(self, o): return Money(10)  # fake!
    def __eq__(self, o): return isinstance(o, Money) and self.n == o.n
```

这段故意只让第一个测试过：`__eq__` 负责让两个 `Money` 能比较，`__add__` 先写死 10。第二个测试 `Money(2) + Money(3) == Money(5)` 会把这个假实现打红，逼你改成 `return Money(self.n + o.n)`——这就是**三角验证**（triangulation）。

### 案例 2：sum 函数三角验证

实现 `sum(list)`：

```python
def test_sum_empty():    assert sum_list([]) == 0       # 实现 return 0
def test_sum_single():   assert sum_list([5]) == 5      # 实现 return list[0] if list else 0
def test_sum_multiple(): assert sum_list([5, 3]) == 8   # 被迫写循环
```

三个独立点定一条线，没有早写循环带来的"盲信"。空列表先逼出边界值，单元素逼出读取第一个元素，多元素才逼出循环；每一步都只为眼前这个红灯写最少代码。这就是 Beck 说的"两个独立点确定一条直线，三角验证（triangulation）就是这个意思"。

### 案例 3：和 LLM 协作的 TDD

人脑列 test list（自然语言），让 LLM 把每一行翻成测试代码，再让 LLM 实现：

```
[ ] 空字符串返回 0
[ ] 单字符 "5" 返回 5
[ ] "5 USD" 返回 5
[ ] "5 USD 3 CNY" 抛 ValueError
```

每写一个测试就跑红，让 LLM 写最小实现转绿，**人来主导重构**。这种节奏让"AI 一次写 200 行"被拆成 10 个 20 行的小绿点，回滚成本仍然极低。Beck 自己 2024 年在博客里把这种节奏叫 Augmented Coding。

## 踩过的坑

1. **把 TDD 当成"补测试"**——方向反了。TDD 的关键是测试**先于**实现去驱动设计，先写代码再补测就退化成普通单元测试。

2. **跳过重构步骤**——只剩"红绿"两步，几个月后代码会越写越脏，最后变成"有测试的烂代码"。Refactor 不是可选项。

3. **一次写十个测试**——违反 baby steps，回滚成本爆炸。正确做法是写一个红，转一个绿，再写下一个红。

4. **滥用 mock**——把自己写的类全 mock 掉，集成时全是问题。原则：mock 数据库 / 外部 API / 时间，**别 mock 自己写的领域类**。

## 适用 vs 不适用场景

**适用**：

- 工具函数 / 算法 / 解析器：输入输出明确，TDD 最舒服
- 重构期：先用测试锁住现有行为，再改实现
- 跨人协作：测试作为可执行规范，比文档准
- 和 LLM 协作：让"小步走"约束 AI 的过度泛化

**不适用**：

- MVP 探索期：连产品形态都没定，写测试等于过早规范化
- 纯 UI / 视觉调整：肉眼比测试更快也更准
- 一次性脚本：跑完即扔，写测试是浪费
- 高度集成的系统测试：端到端测试更合适，TDD 单元层撑不到

## 历史小故事（可跳过）

- **1989 年**：Kent Beck 在 Smalltalk 写出 SUnit——第一个把"红绿条"做成 IDE 反馈的单元测试框架
- **1997 年**：Beck 和 Erich Gamma 在飞机上一起把 SUnit 移植到 Java，做出 JUnit
- **1999 年**：Extreme Programming 公开 "Test-First" 实践；Fowler《重构》同年出版，假设有 TDD 测试网
- **2002 年**：Beck 出版 TDD: By Example，把节奏单独讲清，正式区分 TDD 和"测试"
- **2014 年**：DHH 写《TDD is dead》，Beck/Fowler/DHH 三方 hangout 谈"教条 TDD"边界
- **2024 年**：Beck 在 Augmented Coding 系列博客承认 LLM 改变了 TDD 的成本结构，节奏要重新校准

## 学到什么

1. **测试不是验证手段，是设计驱动力**——先写测试才能从"使用方"角度想接口
2. **小步走**比"先想清楚再写"更适合复杂系统——回滚成本是工程节奏的真指标
3. **覆盖率是副产品**——目标是"重构信心"，能 5 分钟改名字而不焦虑
4. **TDD 是工具不是宗教**——探索期不该用，确认期再用，混合范式是正常的
5. **Fake It 不丢人**——它把"实现"决策推迟到下一个测试，先证明"测试架构对"

## 延伸阅读

- 视频：[Is TDD Dead?](https://www.youtube.com/watch?v=z9quxZsLcfo)（Beck/Fowler/DHH 2014 三方对谈，5 集 hangout）
- 书：[Tidy First?](https://tidyfirst.substack.com/) Kent Beck 2024 — TDD 在 AI 时代的延伸
- 书：Freeman & Pryce《Growing Object-Oriented Software, Guided by Tests》(2009) — Outside-In TDD
- 书：Khorikov《Unit Testing Principles, Practices, and Patterns》(2020) — 现代 TDD 反思
- [[fowler-refactoring-1999]] —— TDD 是它的前置条件

## 关联

- [[fowler-refactoring-1999]] —— 重构原典；TDD 提供了它假设存在的测试网
- [[feathers-legacy-2004]] —— 反向 TDD：给没有测试的老代码补测试
- [[martin-clean-code-2008]] —— Bob Martin 把 TDD 总结成"三定律"
- [[smalltalk-80]] —— Beck 1989 SUnit 诞生于此
- [[playwright]] —— 端到端测试工具；TDD 单元层之上的另一种安全网
- [[compiler-errors]] —— 编译报错和测试失败一样，是"红"信号

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ci-effects]] —— CI Effects — 持续集成不是免费午餐，价值看实现细节
- [[compiler-errors]] —— Compiler Error Messages — 让编译报错有用
- [[copilot-rct]] —— Copilot RCT — AI 编程助手的第一个严格随机对照实验
- [[debugging-dichotomy]] —— Debugging Dichotomy — 程序员真实 debug 行为分两轨
- [[great-swe]] —— Great SWE — 资深工程师"伟大"的标准是 humble + always learning
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[no-silver-bullet]] —— No Silver Bullet — 软件难度的二分手术刀
- [[pair-programming]] —— Pair Programming — 两个人共用一台机器写代码
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[programmer-interruption]] —— Programmer Interruption — IDE 数据告诉你被打断后多久才能继续敲代码
- [[smalltalk-80]] —— Smalltalk-80

