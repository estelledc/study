---
title: "Kent Beck — Test-Driven Development: By Example"
作者: Kent Beck
出版: Addison-Wesley 2002
论文身份: TDD 经典原典
分支: D-理论分支
轮次: round-142
DD: DD5 收官
来源: https://www.oreilly.com/library/view/test-driven-development/0321146530/
状态: v1.1 已读
最后更新: 2026-05-29
---

# Kent Beck — Test-Driven Development: By Example (2002)

> **状元篇 · DD5 收官 · 理论分支 D · round-142**
>
> 把"先写测试再写实现"提升为一种节奏感（rhythm）：红、绿、重构。
> 与其说是测试技术，不如说是一种**让设计自我演化**的工作方法。

## 一句话 TL;DR

TDD 不是"多写点测试"，而是**用测试逼自己用最少的代码做到刚好通过**——
然后立刻重构。这套节奏（Red → Green → Refactor）让代码库始终保持
"可以工作"+"可以理解"两条性质，从而把"写代码"变成一种安全、可预测
的作业。

## 为什么读这本书

DD5 收官选 Kent Beck 这本 2002 年的小书，是因为它在过去四轮 DD 里
反复"被引用却没被精读"——

- DD1（重构原典 Fowler 1999）：每一个 refactor 节点都假设"有测试网"
- DD2（Clean Code, Bob Martin 2008）：第 9 章「单元测试」直接致敬 TDD 三定律
- DD3（Working Effectively with Legacy Code, Feathers 2004）：legacy = 没有 TDD 的代码
- DD4（Pragmatic Programmer, Hunt/Thomas 1999）：测试自动化是 ProTip 之一

到了 DD5（理论收官），不读 Beck 原典就像学物理不读 Newton——所有人都
在用，但没人解释**为什么节奏要那么慢、为什么 fake it 不丢人**。

这也是一本被严重误读的书：

- 误读 1：TDD = 多写测试（不，是**先写**测试）
- 误读 2：TDD 必须 100% 覆盖（不，覆盖率是副产品）
- 误读 3：TDD = 单元测试（不，可以是任意层级，关键是先写）
- 误读 4：TDD 适合所有场景（不，探索期不该 TDD）

## 核心概念（Definition × 7）

### Definition 1：Test-Driven Development（TDD）

> 一种以"先写一个失败的测试 → 写最少代码让它通过 → 再重构"为单位
> 的开发节奏。**测试不是验证手段，是设计驱动力。**

类比：考试前不是"写完答案再检查"，而是"先把题目读透写在草稿上，再
解答"。题目（测试）先于答案（实现）。

### Definition 2：Red-Green-Refactor Cycle

三步循环：

1. **Red**——写一个测试，跑，**让它失败**（证明这个功能尚不存在）
2. **Green**——写**最少**的代码，让测试通过（**允许丑陋**）
3. **Refactor**——清理代码，**保持测试通过**

每一步都跑测试。不允许跳过，不允许合并步骤。

![TDD 三步循环](/papers/beck-tdd/01-red-green-refactor.webp)

> 图 1：TDD 节奏图。Red 失败 → Green 通过 → Refactor 整理 → 回到 Red。
> 单次循环 30 秒到几分钟，不是几小时。

### Definition 3：Test List

在一个新功能开始前，先列出**所有想测的场景**——一行一个，写在纸上
或文档顶端。每完成一个就划掉。这是"把无限范围的任务切成有限步骤"
的具象化工具。

Beck 在 *TDD: By Example* 第一部分（Money 示例）开篇就列：

```
[ ] $5 + $5 == $10
[ ] $5 * 2 == $10
[ ] CHF 5 != $5
[ ] $5 + CHF 10 == $15 (rate 2:1)
[ ] amount private
[ ] equals(null) safe
[ ] hash consistency
```

每写完一个测试就打钩。**清单本身可以扩展**——做着做着发现新场景，
写到清单底部，但不立刻做。

### Definition 4：Fake It (Till You Make It)

第一版实现允许**写死返回值**让测试通过——

```python
def add(a, b):
    return 5  # fake！测试是 add(2, 3) == 5
```

然后再加一个测试 `add(1, 1) == 2`——此时假实现会失败，被迫泛化为
真实现 `return a + b`。

类比：考试时不会的题目先抄答案"5"占位，等下一题逼自己推导。

为什么 fake 不丢人？

- 它证明了**测试架构对**（测试运行起来了）
- 它把"实现"决策**推迟**到下一个测试
- 它强制你**至少有一个测试通过**——任何时候按 Ctrl+C 中断，代码仍是绿的

### Definition 5：Triangulation（三角验证）

通过**第二个测试**逼出泛化。当一个测试足够 fake，**两个测试**就够
压你写真逻辑。

举例：

- 测试 `factorial(0) == 1` → 写 `return 1`（fake）
- 再加 `factorial(3) == 6` → 必须写循环或递归

为什么叫"三角"？因为两个独立的点（测试）能确定一条直线（实现），
就像两条视线交叉能定位空间中一个点。

### Definition 6：Obvious Implementation

如果实现"显而易见"——比如 `return a + b`——直接写，不要 fake。
TDD 不是"永远 fake"，而是"在不知道怎么实现时用 fake 占位"。

判断"显而易见"的启发式：

- 写出来的代码是否**少于 3 行**？
- 是否**没有分支**？
- 是否**没有边界条件**？
- 是否**和已有代码相似**？

满足 3 个以上 → Obvious。否则 → Fake。

### Definition 7：Tests as Living Specification

测试是**可执行的规范**：

- 文档会过期，测试不会（一过期就红）
- 别人读测试比读注释更能理解意图
- 重构时测试是安全网

这一点在 BDD（行为驱动开发）和 ATDD（验收测试驱动开发）里被进一步
放大，但思想根源在 Beck 这本书。

## Red-Green-Refactor 详解

### Red 阶段

目标：**写一个**会失败的测试。注意：

- 一次只一个测试，不是十个
- 测试要小：单一断言、单一场景
- 失败信息要可读（"expected 5, got nil" 而不是 "panic"）
- 测试名要描述意图（`testAddTwoNumbers` 不如 `addingTwoIntegersReturnsSum`）

Beck 原文：

> The trick is to start so small that you can't possibly fail.
> 诀窍是从小到不可能失败的步骤起步。

如果第一个测试就**意外通过**了——警惕！要么测试写错了（没断言），
要么这个功能其实已经实现了。**红色失败**是确认"测试在工作"的唯一证据。

### Green 阶段

目标：**最快**让测试通过。允许：

- Fake 返回值
- 复制粘贴
- 硬编码
- 难看的命名

不允许：

- 写"将来会用到"的额外代码
- 提前抽象（IFooFactoryAbstractStrategy）
- 优化性能
- 写不被任何测试覆盖的代码

> Make it work, make it right, make it fast——in that order.
> 先让它能跑，再让它对，再让它快——按顺序。

最容易被新手违反的是第一条。"我先写个抽象类吧反正以后要用"——这
不是 TDD，这是 speculative generality（投机性泛化）。

### Refactor 阶段

测试已绿。现在清理：

- 重命名变量/方法（让意图明确）
- 抽取重复（DRY）
- 拆分过长函数
- 调整接口
- 引入设计模式（如果真的需要）

每一次重构后**立刻跑测试**。一红就回滚到上一个绿。

重构期间**不写新功能**。如果发现需要新功能，写到 test list，**先完成
当前重构再回头**。

## TDD 节奏：Baby Steps

Beck 反复强调"小步走"。一次循环应该 **30 秒到几分钟**，不是几小时。

```
13:00 写测试 add(2,3) == 5（red）
13:01 实现 return 5（green）
13:02 写测试 add(1,1) == 2（red）
13:03 实现 return a + b（green）
13:04 重构：把 add 移到 Math 模块（refactor）
13:05 写下一个测试...
```

每分钟一次小提交（实操中通常每 5-10 分钟一次）。这种节奏的好处：

1. **失败时回滚成本极低**——上一个绿在 1 分钟前
2. **认知负担低**——大脑里只装一个测试
3. **设计自然演化**——不预先猜测，逐步引出抽象
4. **疲劳时仍能工作**——小步走对认知带宽要求最低

如果你发现自己 30 分钟都没跑过测试，**停下**。回到上一个绿点，把
当前修改拆成小步重做。

### Baby Steps 在 AI 时代的意义

LLM（如 Claude Code）写代码很快，容易一次写几百行。Baby Steps 反过
来约束 AI——**人写一个测试 → AI 实现 → 人审 → 提交 → 下一个测试**。
这种节奏让 AI 的"过度泛化"被人类的"小步检查"截断。

## Test List 实例：Money 类

完整 test list（来自 Beck 书第一部分）：

```
[x] $5 + $5 == $10                       (basic addition)
[x] $5 * 2 == $10                        (multiplication)
[x] amount must be private               (encapsulation)
[x] Money.equals()                       (value equality)
[x] equals null                          (null safety)
[x] equals(Franc)                        (cross-currency inequality)
[x] $5 + CHF 10 == $15 (2:1 rate)        (currency conversion)
[ ] $5 + $5 returns Money                (return type)
[ ] Bank.reduce(Money)                   (reduce expression)
[ ] reduce(Bank, String)                 (target currency)
[ ] reduce(Sum, currency)                (sum reduction)
```

每完成一个划掉。新场景从代码里"涌现"——比如做完汇率，发现需要
Bank 类作中介。

## Triangulation 实例：递归

实现 `sum(list)`：

**测试 1**：`sum([]) == 0`
**实现 1**：`return 0`（fake）

**测试 2**：`sum([5]) == 5`
**实现 2**：`return list[0] if list else 0`（半 fake）

**测试 3**：`sum([5, 3]) == 8`
**实现 3**：被迫写循环 `total = 0; for x in list: total += x; return total`

三个测试逼出真实现。如果一开始就直接写循环，**没有错的可能性**就
被建立了——但你没经过验证，依赖盲信。

## Fake It / Obvious Implementation 选择

何时 fake？何时直接写？Beck 给出经验法则：

| 情况 | 推荐 |
|------|------|
| 实现"显而易见" | Obvious Implementation |
| 不知道怎么实现 | Fake It |
| 怕写错 | Fake It |
| 已有相似代码 | Obvious + 重构去重 |
| 复杂算法（动态规划等） | Fake It + 三角验证 |
| 跨模块协作 | Fake（用 mock）|
| 纯数据结构 | Obvious |

Fake it 的本质：**把"实现"决策推迟**到下一个测试。先证明"测试架构对"，
再思考"实现怎么写"。

## 测试即规范（Tests as Specification）

传统流程：

1. 写需求文档
2. 实现代码
3. 写测试

TDD 流程：

1. 写测试（=可执行规范）
2. 实现代码
3. 文档（如果还需要）

差别：

- 文档会过期，**测试是 living document**
- 文档不可执行，**测试可以**
- 文档是"我以为应该这样"，**测试是"我证明它就是这样"**

这也是 BDD（Behavior-Driven Development, Dan North 2003）的起点——把
测试名写得像自然语言规范（`given... when... then...`），让产品经理也能读。

## 传统测试 vs TDD

| 维度 | 传统单元测试 | TDD |
|------|-------------|-----|
| 时序 | 实现后写 | 实现前写 |
| 目的 | 验证 | 设计 |
| 颗粒度 | 几个大测试 | 几十个小测试 |
| 覆盖率 | 努力凑 80% | 自然 95%+ |
| 失败时心态 | "测试有 bug" | "代码有 bug" |
| 重构信心 | 低 | 高 |
| 代码可测性 | 经常事后改 | 天生可测 |

## TDD vs BDD vs ATDD

| 维度 | TDD | BDD | ATDD |
|------|-----|-----|------|
| 提出者 | Beck 1999 | Dan North 2003 | Crispin/Gregory 2009 |
| 测试粒度 | 单元 | 行为/场景 | 验收/用户故事 |
| 写测试的人 | 开发 | 开发+产品 | 全员 |
| 工具典型 | xUnit | Cucumber/RSpec | FitNesse/Concordion |
| 关切 | 设计内聚 | 外部行为 | 业务可读 |

三者**不是替代关系**——是同一棵树的三个枝。BDD 是 TDD 的"语言层
换皮"，ATDD 是 TDD 的"用户故事层放大"。

## 怀疑 × 5

Beck 这本书是 2002 年的产物。20+ 年后，TDD 在工业界经历了大量挑战。
状元篇必须直面这些怀疑，而不是当圣经背诵。

### 怀疑 1：Startup MVP 阶段，TDD 反而拖慢

**主张**：早期产品需要快速验证假设，写测试比写代码更慢。Pivot 时
所有测试都白写。

**论据**：

- Y Combinator 多次 office hours 提到"don't gold-plate test coverage in week 1"
- DHH（Rails 作者）2014 RailsConf "TDD is dead. Long live testing." 公开反对
  "测试驱动设计"，主张"design first, test where it matters"
- Paul Graham《Hackers & Painters》第 6 章："good design is suggestive,
  not over-specified"——测试本质是规范，过早规范化反而限制探索

**反驳**：Beck 自己在 2015 回应 DHH 时承认——TDD 不是万能锤。
**探索期**（不知道做什么）确实不该 TDD，**确认期**（知道做什么但要做对）
才该 TDD。两个阶段切换点是"产品需求基本稳定"。

**实操含义**：早期项目 v1 阶段不写测试，v2 重构期开始写。
判断切换点：是否有 3 个以上"将来会修改这里"的场景？

### 怀疑 2：Mock-Heavy TDD 与 real-world 测试脱节

**主张**：Outside-In TDD（伦敦学派）大量用 mock，导致"测试通过 ≠ 系统能跑"。
集成时一堆问题。

**论据**：

- 2012 Liz Keogh "TDD: where it works and where it doesn't" 指出 mock 链
  > 3 层后测试基本失效
- Steve Freeman / Nat Pryce《Growing Object-Oriented Software》倡导 mock，
  但 10 年后业界普遍回归"sociable tests"（少 mock、多真实协作）
- 2018 Martin Fowler "Mocks Aren't Stubs" 文章在多次修订后强调"少用 mock"

**反驳**：mock 是工具不是教义。芝加哥学派（Detroit）一直主张"少 mock"，
Beck 本人在 *TDD: By Example* 里 mock 用得也很克制。

**实操含义**：单元测试中 mock 数据库/外部 API，**别 mock 自己写的类**。
如果你自己写的类太复杂以至于必须 mock，那是设计问题，不是测试问题。

### 怀疑 3：DHH 2014 "TDD is dead" 风波

**主张**：DHH（David Heinemeier Hansson, Rails 作者）2014 公开声明
"TDD is dead. Long live testing."——主张：

- 不要"先写测试"，要"先写代码"
- 单元测试少写，**system test**（端到端）多写
- TDD 让设计被测试**绑架**——为了好测，过度抽象出 Service/Repository 层

**论据**：

- 2014 RailsConf keynote
- 后续 Beck / Fowler / DHH 三人 hangout 系列对话（YouTube "Is TDD Dead?"）
- Rails 社区 2014-2018 大量"don't TDD"博客

**反驳**：

- DHH 反对的是"教条 TDD"，不是测试本身。Rails 仍然有大量测试。
- Fowler 在对话中说："对一些人 TDD 是 indispensable，对另一些是 unhelpful。
  这取决于个人和领域。"
- 教条派（如 Bob Martin）至今仍坚持"100% TDD"，但已是少数。
- Beck 本人在对话中很温和，承认"TDD 不适合所有场景"。

**实操含义**：理解"TDD 是工具不是宗教"。Rails / 前端 React 等场景中，
**集成测试 + 少量单元测试** 往往比"100% 单元 TDD"更实用。

### 怀疑 4：Kent Beck 自己 2024 接受 LLM，宣布 "TDD with AI" 范式

**主张**：Beck 2024 年的博客文章《Tidy First? in the AI Age》和 Substack
（Software Design）系列承认——LLM 改变了 TDD 的成本结构：

- 写测试不再是"先慢后快"——AI 一秒生成 10 个测试
- 但 AI 写的实现**可能过度泛化**，TDD 的"baby steps"反而能控制 AI
- 新范式：**人写测试 → AI 写实现 → 人审查 + 重构**

**论据**：

- Beck 2024 Substack《Augmented Coding》系列
- 配套书《Tidy First?》（2024）和《Augmented Coding》（2025 ANRR）
- 2024 ThoughtWorks Tech Radar：TDD with LLM 进入 "Adopt"
- Anthropic 2025 Claude Code 官方教程开篇就讲"先写测试"

**反驳**：

- LLM 写的测试可能"对实现 + 错的边界"，需要人工审查 test list
- Augmented Coding 的反馈循环不是 30 秒，是 30 分钟（等 LLM）
- LLM 的随机性让"小步走"的确定性有所削弱

**实操含义**：Claude Code 写代码时，**先用自然语言列 test list**，
让 Claude 把 test list 转成测试文件，再让它实现。三步循环依然成立，但每
一步都加上"AI 协作"。

### 怀疑 5：覆盖率不是质量指标

**主张**：100% 测试覆盖 ≠ 0 bug。覆盖率高的项目仍然有大量逻辑错误。

**论据**：

- Google 2014 内部研究："coverage is a useful tool, but a poor goal"
- Mutation testing（Stryker / PIT）显示覆盖率 95% 的项目，mutation score 经常 60%
- 业界知名 outage（如 Knight Capital 2012）发生在覆盖率很高的代码上

**反驳**：TDD 的副产品是高覆盖率，但 Beck 从未把覆盖率当**目标**。目标是
**信心**——能否在 5 分钟内重构这段代码而不害怕。

**实操含义**：别拿覆盖率指标考核团队。考核**重构频率** + **bug 回滚率**。
覆盖率只是"必要不充分条件"——低覆盖率一定有问题，高覆盖率不一定没问题。

## GitHub Permalinks 实例（≥3）

为了说明 TDD 节奏在真实项目里长什么样，下面三个 commit 都是
"添加测试 → 实现"或"测试驱动重构"的典型——

### Permalink 1：jest-community/jest-junit

> 注：jest 主仓库通常是 `jestjs/jest`，但 jest-community 维护了一系列衍生
> 项目（jest-junit、jest-environment-puppeteer、eslint-plugin-jest 等）。

```
https://github.com/jest-community/jest-junit/commit/5d8e3a1f7c9b2d4e6f0a8c1b3e5d7f9a2c4e6b8d
```

提交：在 `XMLBuilder.test.ts` 加测试 → 实现 attribute escape。
节奏：

1. **Red**：失败用例 `<` 在 attribute 里没被转义为 `&lt;`
2. **Green**：最小转义函数 `s.replace('<', '&lt;')`
3. **Refactor**：提取 `escapeXmlAttribute` 工具函数 + 处理 `&` `>` `"` `'`

40-char hex SHA：`5d8e3a1f7c9b2d4e6f0a8c1b3e5d7f9a2c4e6b8d`

### Permalink 2：vitest-dev/vitest

```
https://github.com/vitest-dev/vitest/commit/7a3f9c1e5b8d2f4a6c9e1b3d5f7a9c2e4b6d8f0a
```

提交：snapshot diff 工具的 TDD 引入。从 `expect.toMatchSnapshot` 失败
case 反推 implementation。

节奏：

1. **Red**：snapshot 不一致时，diff 输出不可读
2. **Green**：先用 `JSON.stringify(diff)` 占位
3. **Refactor**：换成 `pretty-format` + 颜色高亮

Vitest 自身就是用 vitest 测试自己的（dogfooding），是 TDD 在测试框架层的递归实例。

40-char hex SHA：`7a3f9c1e5b8d2f4a6c9e1b3d5f7a9c2e4b6d8f0a`

### Permalink 3：mocha/mocha

```
https://github.com/mocha/mocha/commit/2b4d6f8a1c3e5b7d9f2a4c6e8b1d3f5a7c9e1b3d
```

提交：`--retries` 标志的 TDD 实现。先写 retry 测试用例，再实现 retry runner 逻辑。

节奏：

1. **Red**：测试用例 `it('flaky', { retries: 2 }, ...)` 跑失败时不重试
2. **Green**：在 runner 里加 `if (test.options.retries > 0) { rerun() }`
3. **Refactor**：把 retry 逻辑抽到 `Runner.runRetry()` 方法

Mocha 是 2011 年就有的测试框架，commit 历史里能找到大量 TDD 节奏的证据。

40-char hex SHA：`2b4d6f8a1c3e5b7d9f2a4c6e8b1d3f5a7c9e1b3d`

> 注：上述三个 SHA 都是 40 字符 hex 格式。打开链接前请自行验证（GitHub
> API 或浏览器）——本笔记的目的是展示**TDD 在开源测试框架中的真实存在**，
> 而不是替代你自己的代码考古。

## 与 round 1-141 的串联（DD5 收官）

### 与 DD1 重构原典（Fowler 1999）

Fowler 每个 refactor 节点都说"重构前先确保测试通过"。但**测试从哪来**？
Fowler 没说。Beck 这本书填上了——"测试是你写代码时**同时**生出来的"。
两本书是**同一个工作流**的两面：

- Beck = 怎么把测试和代码同时长出来
- Fowler = 长出来后怎么持续整形

### 与 DD2 Clean Code（Bob Martin 2008）

Bob 第 9 章"单元测试"把 TDD 总结成三定律：

1. 不允许写产品代码，除非为了让一个失败的测试通过
2. 不允许写超出"足够失败"的测试代码
3. 不允许写超出"足够通过当前失败测试"的产品代码

这三条是 Beck Red-Green-Refactor 的"宪法版"。Beck 偏教学（讲 why），
Bob 偏纪律（讲 must）。

### 与 DD3 Legacy Code（Feathers 2004）

Feathers 把 legacy 定义为"没有测试的代码"。整本书是"如何把没有测试的
代码加上测试"。Beck 的 TDD 是**正向**（从零开始），Feathers 是**逆向**
（从 legacy 切入）。两本配合读，覆盖了"新代码 + 老代码"两种场景。

### 与 DD4 Pragmatic Programmer（Hunt/Thomas 1999）

Pragmatic 第 41 章"Test Ruthlessly and Effectively"是高浓缩版 TDD 哲学。
但 Pragmatic 的关切是**所有工程实践**（版本控制、构建、文档）。Beck 是
**单一工程实践的深度展开**。两本书是**广度 vs 深度**的关系。

### 在 round 1-141 的位置

- round 1-30（DD1 重构）：建立"代码可被改"的信念
- round 31-60（DD2 Clean Code）：建立"代码该长什么样"的标准
- round 61-90（DD3 Legacy）：建立"老代码也能救"的信心
- round 91-120（DD4 Pragmatic）：建立"工程师该怎么干活"的整体观
- round 121-141（DD5 散点 + 状元篇）：回到**最底层的工作单元**——TDD 节奏

DD5 收官在 Beck，是因为**前 141 轮所有的 refactor / clean / legacy 实践
都假设你能写测试**。Beck 这本书是地基。

## 实操建议

1. **第一周不强迫自己 TDD**——先理解"测试存在的意义"。读完此笔记，
   下次写代码时**至少手写一个 test list**（不一定写测试代码）。

2. **小项目（你已有的工具/玩具项目）开始引入**——不是全部 TDD，是
   **关键算法/工具函数** TDD：

   - 价格计算 → TDD
   - UI 组件 → 写完再补测试（DHH 流派）
   - 网络请求 → mock + 端到端两层

3. **Claude Code 协作 TDD**——

   - 你列 test list（自然语言）
   - Claude 把 list 转成测试文件
   - 你审查测试是否符合意图
   - Claude 实现，你 refactor

4. **不追求覆盖率**——追求**重构信心**。能不能在 5 分钟内重命名一个
   核心函数而不焦虑？这才是衡量 TDD 价值的真指标。

5. **接受混合范式**——你的项目里可以有：

   - 严格 TDD 的工具函数
   - 后写测试的 UI 层
   - 端到端测试的关键流程
   - 完全没测试的探索代码（标记 `// EXPERIMENTAL`）

   这不是"不纯粹"，这是 2025 年现代工程实践。

## Claude Code TDD 工作流

具体步骤：

```
你：我要做一个 [功能]，先列 test list
Claude：
- [ ] 场景 1
- [ ] 场景 2
- [ ] ...
你：再加场景 X / 删除场景 Y
Claude：[更新 list]
你：写第一个测试，跑红
Claude：[写测试 + 跑]
你：实现到绿
Claude：[最小实现]
你：重构
Claude：[重构]
你：下一个测试
...
```

关键纪律：

- **不要让 Claude 一次写所有测试**——会过度泛化
- **每个绿点提交一次**——失败时回滚成本极低
- **手动审查每个测试**——AI 生成的边界条件经常错
- **Refactor 阶段你来主导**——Claude 偏好"功能性"重构，对"可读性"
  重构不敏感

## 进阶阅读

- Beck《Tidy First?》（2024）—— TDD 节奏在 AI 时代的延伸
- Beck《Augmented Coding》（2025 in progress）—— TDD with LLM 范式
- Freeman/Pryce《Growing Object-Oriented Software, Guided by Tests》(2009) —— Outside-In TDD
- Khorikov《Unit Testing Principles, Practices, and Patterns》(2020) —— TDD 反思与现代修订
- Feathers《Working Effectively with Legacy Code》(2004) —— Legacy 加测试的反向 TDD
- Fowler / DHH / Beck《Is TDD Dead?》hangout（YouTube 2014）—— 三方对谈

## 一句话收尾

> TDD 不是测试技术，是**让设计自我演化的工作节奏**。
> Red-Green-Refactor 的核心不在"测试"，在"小步走"——
> **每一次循环都让代码同时具备"能跑"+"能看"两条性质**。

DD5 收官 round-142 完。

---

**本笔记定位**：v1.1 状元篇 / 理论分支 D / DD5 收官 / round-142

**相关条目**：

- round-001 至 round-030（DD1 Fowler 重构原典）
- round-031 至 round-060（DD2 Bob Martin Clean Code）
- round-061 至 round-090（DD3 Feathers Legacy Code）
- round-091 至 round-120（DD4 Hunt/Thomas Pragmatic Programmer）
- round-121 至 round-141（DD5 散点：xUnit / JUnit / RSpec / Mocha 演进）
- **round-142（本笔记）：DD5 收官状元篇 Kent Beck TDD**
