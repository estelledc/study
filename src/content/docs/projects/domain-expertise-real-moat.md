---
title: Domain expertise has always been the real moat
来源: https://www.brethorsting.com/blog/2026/05/domain-expertise-has-always-been-the-real-moat/
日期: 2026-06-13
分类: 其他
子分类: 工程文化
provenance: pipeline-v3
---

## 一句话总结

在 agentic AI 时代，**领域知识才是真正的护城河**——代码写得出来不代表做对了，知道"什么是对的"才是稀缺能力。

## 日常类比

想象一家餐厅。

以前，厨师（程序员）最大的挑战是**学做菜**——火候、刀工、调味，每一样都需要长时间练习。一个资深厨师之所以值钱，是因为他做过成千上万道菜，手里有"感觉"。

现在出现了自动炒菜机（agentic AI）。任何人只要会说"我要一份宫保鸡丁"，机器就能把菜炒出来。问题变了：**你能不能尝出这道菜对不对？**

那个在厨房干了十年、闭着眼睛都知道宫保鸡丁应该是什么味道的厨师（领域专家），突然成了最值钱的人。因为他能立刻尝出机器炒出来的菜差在哪——甜面酱多了、花生不脆了、鸡肉老了——而一个只会用炒菜机的新人，根本不知道"对"是什么味道。

代码就是那道菜。领域知识就是那个"味觉"。

## 文章核心观点拆解

### 1. 写软件最难的部分从来不是写代码

文章作者 Aaron Brethorst 举了两个例子：

- 要做薪资系统，你得先搞懂 garnishments（工资扣款）、pre-tax deductions（税前扣除）、发薪周期跨了调薪日怎么办
- 要做公交 App，你得先搞懂 GTFS 数据格式、trip 和 route 的区别、一辆"准点"的公交车为什么可能还是错的

**代码只是把脑子里的领域模型"翻译"出来。翻译本身从来不是难点。**

```python
# 伪代码：薪资计算中的"发薪周期跨调薪日"问题
# 不懂领域的人写的版本——看起来没问题，但漏了关键规则
def calculate_pay(hours_worked, hourly_rate):
    return hours_worked * hourly_rate

# 领域专家知道的真实规则——发薪周期 6/1~6/15，但 6/10 涨薪到 $25
# 前 9 天按 $20 算，后 6 天按 $25 算
def calculate_pay_with_rate_change(hours_before_change, hours_after_change,
                                    old_rate, new_rate):
    return (hours_before_change * old_rate) + (hours_after_change * new_rate)
```

第一个函数能跑，但算出来是错的。第二个函数才是真实的业务逻辑。

### 2. Agentic AI 切断了"写代码"和"懂领域"之间的绑定

以前，程序员有一条清晰的成长路径：**先学编程，再慢慢学领域**。通过看文档、跟专家聊、在生产环境犯错，逐渐建立领域模型。这条路径是许多行业的职业阶梯。

领域专家没有对应的路径——学写可靠软件需要几年时间，不值得。

Agentic AI 把这条路**只拆了一半**：

| | 以前 | 现在有 AI |
|---|---|---|
| 程序员学领域 | 可以，慢慢来 | 依然可以，但没那么必要了 |
| 领域专家学编程 | 不可能，门槛太高 | AI 替你把代码写了 |

结果：**程序员的"翻译能力"变便宜了，领域专家的"知道什么是对的"没变贵。**

### 3. 两种人的对比实验

文章描述了两个人面对同一个 AI 编码工具：

**A：领域专家（不懂编程）**
- 物流调度员、临床编码员、精算师
- 看不懂 stack trace，分不清 hash map 和 list
- 但看到 AI 生成的排班表，一眼就知道"这司机违法超时了"
- **他们缺的代码生成能力，AI 补上了；他们带来的领域真值，AI 补不上**

**B：通用型工程师（不懂领域）**
- 架构能力强，懂可靠性、测试、凌晨两点的救火
- 但扔进临床编码场景，分不清"看起来合理但错了"和"对的"
- AI 会生成一个编译通过、测试通过、但规则 subtle 地错的计费逻辑
- **工程师能验证"软件建得好"，但验证不了"软件做对了"**

```python
# 伪代码：司机工时规则——领域专家才知道的隐性规则

# 通用工程师让 AI 写的版本——测试通过了，但规则不完整
def validate_driver_schedule(shifts):
    for shift in shifts:
        assert shift.hours <= 14  # 只检查了最大时长
    return True

# 领域专家知道的正确版本——美国 FMCSA 法规的真实规则
def validate_driver_schedule_expert(shifts, rest_periods):
    """
    美国联邦机动车安全管理局(FMCSA)规则：
    - 司机连续驾驶 8 小时后必须休息 30 分钟
    - 一周内总驾驶时间不超过 60 小时（7 天周期）或 70 小时（8 天周期）
    - 两次驾驶之间必须有 10 小时连续休息
    - 单次驾驶不得超过 11 小时
    """
    for shift in shifts:
        if shift.hours > 11:
            return False, "单次驾驶超过 11 小时"
    for i in range(len(shifts) - 1):
        gap = rest_periods[i].duration
        if gap < 10:
            return False, f"第 {i} 和 {i+1} 班次间休息不足 10 小时"
    # 还要检查 60/70 小时周期规则……
    return True
```

工程师写的测试通过了，因为测试本身就不完整。**测试只能证明"代码实现了你告诉它的东西"，不能证明"你告诉它的是对的"。**

### 4. 最值钱的人是"双修"的

文章指出，最有价值的人是**既懂领域又懂代码**的人：

- 知道 AI 生成的代码结构是否合理
- 知道它产出的答案是真是假
- 能写出 encode 了真实规则的测试（比如"司机不能超过 11 小时"），而且知道**这个测试本身有意义**

AI 负责"翻译"，这种人负责"审判"——审判两层：代码对不对，答案对不对。

## 为什么这个观点很重要

### 对程序员的信号

你花了多年苦练的"把清楚的想法变成干净的代码"这项机械技能，价值正在大幅下降。真正稀缺的是一个**经过验证的真实领域模型**。

### 对非程序员的信号

你不懂编程不再是障碍。AI 补齐了那块短板。你十年积累的"知道什么是对的"——那些写在 Excel 里、存在脑子里、靠经验判断的规则——突然变成了最值钱的东西。

### 对创业者的信号

垂直领域的专家 + AI 工具，可能比通用型 AI 工程师团队产出更好的行业应用。因为他们知道哪些规则真正重要，哪些边缘情况会要命。

## 我的理解：第一性原理推导

回到最根本的问题：**软件到底在解决什么？**

软件不是目的，软件是**把领域规则自动化**的手段。

```
领域现实（业务规则、物理定律、监管要求）
    ↓ 翻译成
领域模型（脑子里的结构化理解）
    ↓ 翻译成
代码（机器可执行的指令）
    ↓ 执行
软件系统
```

传统上，程序员卡在"领域模型 → 代码"这一步。Agentic AI 把这一步变成了廉价品。

但"领域现实 → 领域模型"这一步，AI 做不到。没有人能 prompt 出一个" reconciled a thousand payrolls "的人的 tacit knowledge（隐性知识）。

**所以护城河从"代码层"移到了"模型层"。**

## 行动建议

文章最后给出的建议很直接：

> Pick an industry, an instrument, a regulatory regime, a physical process, and learn it the way you once learned a programming language or framework.

翻译一下：

- 选一个行业（物流、医疗、金融、制造）
- 选一套工具或标准（GTFS、ICD-10、GAAP、ISO 9001）
- 选一套监管框架（FMCSA、HIPAA、GDPR、SEC 规则）
- 像当年学 React 或 Kubernetes 那样去学它

这不是"顺便了解一下"，是**系统地、深入地、带着批判性地学**——学到你能看出 AI 生成的方案哪里错了。

## 学到的东西

1. **护城河的迁移**——AI 没有消灭领域价值，反而把它从代码层解放出来，让它成为唯一的壁垒
2. **测试的局限性**——测试只能验证"代码实现了你告诉它的"，不能验证"你告诉它的是对的"。领域的正确性来自领域本身，不是测试
3. **隐性知识的不可替代性**——tacit knowledge（" reconciled a thousand payrolls "的经验）不能被写成文档、不能被 prompt 出来、不能被 skill file 包含
4. **职业路径的翻转**——以前"程序员学领域"是正路；以后"领域专家用 AI"可能比"程序员学领域"更快产生价值

## 延伸阅读

- 作者之前的文章：[Agentic Coding Tools: Not Skynet, Not a Stochastic Parrot](/blog/2025/07/agentic-coding-tools-not-skynet/)
- 相关概念：Tacit Knowledge（隐性知识）—— Michael Polanyi 提出，指"我们知道的比我们能说出来的更多"
- [[agent-memory]] —— Agentic AI 的记忆系统设计，与领域知识的存储和调用方式相关

## 关联

- [[haystack]] —— Haystack 是 AI 工程框架，涉及如何把领域知识注入 AI 系统
- [[crewai]] —— CrewAI 多 Agent 框架，适合领域专家 + AI 的协作模式
- [[dify]] —— Dify 低代码 AI 应用开发平台，领域专家可以直接搭建行业 AI 应用
