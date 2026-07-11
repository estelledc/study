---
title: SLAM — 让 Windows 驱动 bug 自己撞到工具上
来源: 'Ball & Rajamani, "The SLAM Project: Debugging System Software via Static Analysis", POPL 2002'
日期: 2026-05-30
分类: 形式化方法
难度: 中级
---

## 是什么

**SLAM** 是微软研究院 2000-2002 年做出的一套**自动检查 C 程序有没有违反 API 用法规则**的工具，专攻 Windows 内核驱动。日常类比：写文档时打开"语法检查"——你不用一句句念，工具自己扫，发现"这里少了句号"就标红。SLAM 干的是同一类事，只不过它检查的不是句号，而是"打开文件后必须关闭""加锁后必须解锁""IRP 在返回前必须完成"这种**先后顺序规则**。

你写：

```c
acquire_lock(L);
if (status == OK) return;     // bug：忘了 release_lock
release_lock(L);
```

SLAM 自动报告："存在一条路径让 `acquire_lock` 后没有匹配的 `release_lock`。"

它不需要你跑测试、不需要你标注，**纯静态**算出答案。

## 为什么重要

不理解 SLAM，下面这些事都没法解释：

- 为什么 2006 年起 Windows DDK 自带 **Static Driver Verifier**（SDV）——它就是 SLAM 的产品化版本，所有 WHQL 签名驱动必须过这一关
- 为什么 [[clarke-cegar-2003]] 那篇经典 CEGAR 论文能在工业界落地——SLAM 是它**第一个 KLOC 级别的实战**
- 为什么 Ball 和 Rajamani 拿了 2011 年 ACM SIGPLAN 编程语言软件奖
- 为什么 SeaHorn / CBMC / Astrée 这些后辈都在重复 SLAM 的"抽象 → 检查 → 反例 → 细化"四步

核心矛盾：**驱动有几万行 C 代码 + 指针 + 函数调用 + 循环**，朴素枚举状态空间是天文数字。SLAM 的洞见是：**大部分变量与你要查的规则无关，只需保留几个相关谓词**（如 `lock_held`、`status == OK`），把 C 程序压成一个只有布尔变量的"骨架程序"，再去模型检查。这套技术叫**谓词抽象**（predicate abstraction）。

## 核心要点

SLAM 由 **三个工具拼成一个 CEGAR 循环**：

1. **C2BP**（C to Boolean Program）：选一组谓词 P = {p1, p2, ...}，把每条 C 语句翻译成一个布尔程序里"对这些谓词怎么更新"的最强可靠语句。理论根是 [[cousot-abstract-interpretation]]——谓词抽象是抽象解释里"抽象域 = 布尔格"的特例。

2. **BEBOP**：在生成的布尔程序上跑模型检查。它用**过程摘要**（Reps-Horwitz-Sagiv 风格）处理函数调用，所以跨过程也精确，不会把"调用-返回"配错。

3. **NEWTON**：当 BEBOP 报"有 bug，路径是 s0→s1→...→sn"，NEWTON 把这条路径**拿回 C 源码**用定理证明器验证一遍。如果走得通——真 bug；如果走不通（**伪反例**），NEWTON 从矛盾里**挖出新谓词**加进 P，回到第 1 步。具体做法是把路径上每条赋值翻译成 SSA 公式，扔给 SMT 求解器；不可满足核里的子表达式就是新谓词候选。

整个过程是 [[clarke-cegar-2003]] 描述的 CEGAR 循环在软件上的具体落地：**抽象 → 检查 → 验证 → 细化**。

规则本身用一种叫 **SLIC** 的小状态机语言写，独立于 C 代码。换规则不用改工具——这种解耦是 SLAM 能产品化的关键。

举个 SLIC 规则的样子（伪代码）：

```
state { enum {Locked, Unlocked} s = Unlocked; }
acquire_lock.entry { if (s==Locked) abort; s = Locked; }
release_lock.entry { if (s==Unlocked) abort; s = Unlocked; }
```

工具看到 `abort` 出现在哪条 C 路径上，就报告那条路径违反规则。

## 实践案例

### 案例 1：锁配对

规则（SLIC）："`acquire_lock` 必须严格匹配后续的 `release_lock`，不能连续 acquire 两次。"

```c
acquire_lock(L);
do_work();
if (error) goto fail;
release_lock(L);
return OK;
fail:
return ERR;            // bug：fail 路径忘了 release
```

**第一轮**：P = {`locked`}。C2BP 生成布尔程序，`acquire` 把 `locked` 设 true，`release` 设 false。BEBOP 找到反例：fail 路径返回时 `locked` 仍为 true，违反规则。NEWTON 把路径回放到 C，发现真能走通——**真 bug，报告**。

### 案例 2：伪反例驱动谓词增长

```c
x = read();
if (x > 0) acquire_lock(L);
do_work();
if (x > 0) release_lock(L);
```

**第一轮**：P = {`locked`}。BEBOP 看到一条抽象路径"第一个 if 走 true，第二个 if 走 false"——抽象上 `x > 0` 这两次判断**互不相关**，于是说有 bug。NEWTON 回放 C：两次 `x > 0` 同一个 `x`，不可能一次真一次假——**伪反例**。NEWTON 从矛盾里抽出新谓词 `x > 0` 加入 P。

**第二轮**：P = {`locked`, `x>0`}。两次分支条件被布尔程序里同一个布尔变量绑定，伪路径消失，BEBOP 报"安全"——**真无 bug，通过**。

这正是 CEGAR 的精髓：**伪反例不是失败，是告诉你该往抽象里加哪个谓词**。

### 案例 3：工业落地

SDV（Static Driver Verifier）从 2006 年起进 Windows DDK，跑在每一个第三方提交的驱动上。它带几十条预制 SLIC 规则（IRP 完成、KeAcquireSpinLock 配对、PnP 状态机等）。微软内部估算 SDV 累计避免了**十亿美元量级**的驱动 bug 修复成本。

## 踩过的坑

1. **指针别名是阿喀琉斯之踵**：SLAM 用 [[andersen-pointer-analysis]] 类的流不敏感点分析做先验。两个指针可能指同一对象时，C2BP 必须保守——精度立即下降。堆密集的代码上 SLAM 经常给一堆假报警。

2. **细化可能不停**：谓词抽象本质**不完备**。某些路径一辈子也找不到能区分它们的谓词，循环转个没完。SLAM 设硬上限——超时就报"不知道"，不假装通过。

3. **并发是另一回事**：原始 SLAM 是**顺序**分析。多线程驱动要么单线程跑（漏 bug）要么自合成（爆炸）。后来的工作（如 [[clarke-cegar-2003]] 的并发扩展）补上，但 SDV 主流路径还是按"中断 + 单 CPU"建模。

4. **SLIC 写错没人提醒**：规则写错会让工具静默通过有 bug 的代码。早期微软驱动团队踩过"规则写反了"的坑，后来给 SLIC 加了规则自检。

5. **决策过程的代价**：每次 NEWTON 验证一条路径都调一次 SMT。路径多+谓词多+整数运算复杂时，工具时间从分钟级飙到小时级。SDV 实战里 30% 的开销在 SMT 上。

## 适用 vs 不适用场景

**适用**：
- API 用法的**时序安全规则**（"X 之前必须 Y""X 之后只能 Z"）
- 1-50 KLOC 级别的**单线程**或可建模成单线程的代码
- 控制流复杂、变量多但**只有少数几个布尔谓词决定正确性**的场景（驱动恰好如此）

**不适用**：
- 数值精度规则（"x 永远小于 INT_MAX"）→ 用 [[cousot-abstract-interpretation]] 系的区间/八边形/多面体抽象更合适
- 真正的并发 race / deadlock → 用 TLA+ / Spin / 专门的并发 model checker
- 整个应用级（百万行）→ 用 Infer / CodeQL 这种轻量但不完备的工具
- 算法正确性（排序确实排了序）→ 用 Coq / F* 这类证明助手

## 历史小故事（可跳过）

- **1997**：Graf 和 Saïdi 发明谓词抽象，但只对硬件状态机演示。
- **2000**：Ball 和 Rajamani 在 MSR Redmond 启动 SLAM，目标是"让 Windows 驱动开发者不用懂 model checking 也能用上"。
- **2002**：POPL 论文发表，三件套 C2BP / BEBOP / NEWTON 凑齐。
- **2004**：SLAM 改名 SDV，第一次内部部署到 Windows 团队。
- **2006**：SDV 随 WDK 公开发布；驱动签名走它成了硬性要求。
- **2011**：Ball 和 Rajamani 凭 SLAM 拿 ACM SIGPLAN Programming Languages Software Award。

之后 20 年，BLAST / CPAchecker / SeaHorn / SMACK 都在 SLAM 这条线上演化。

## 学到什么

1. **抽象是可调节的**——谓词集 P 决定精度。少了漏 bug，多了爆炸。CEGAR 让"该多少"自动算出来
2. **解耦让工具能用**：模型检查器（BEBOP）不知道你要查什么；规则（SLIC）不知道 C 怎么编译。换规则换工具都不互相牵连
3. **理论 → 算法 → 产品**的标杆链路：[[cousot-abstract-interpretation]] (1977) → 谓词抽象 (1997) → SLAM (2002) → SDV (2006)，每一步隔 5 年左右
4. **工业验证不是"证明完全没 bug"**——SLAM 在固定规则集 + 固定建模假设下报告"没找到反例"，这已经价值十亿美元

## 延伸阅读

- 论文 PDF：[POPL 2002 SLAM](https://www.microsoft.com/en-us/research/wp-content/uploads/2002/01/popl02.pdf)（11 页，密度高但工程描述清晰）
- 综述：[Ball, Bounimova, Cook 等 — Thorough Static Analysis of Device Drivers, EuroSys 2006](https://www.microsoft.com/en-us/research/publication/thorough-static-analysis-of-device-drivers/)（SDV 工程细节）
- SDV 用户文档：[Microsoft Docs — Static Driver Verifier](https://learn.microsoft.com/windows-hardware/drivers/devtest/static-driver-verifier)
- [[clarke-cegar-2003]] —— CEGAR 的形式化框架；SLAM 是它的工业先驱
- [[cousot-abstract-interpretation]] —— 谓词抽象所属的更大数学家族

## 关联

- [[clarke-cegar-2003]] —— SLAM 与 CEGAR 论文同时期发展，互为印证；Clarke 2003 给抽象数学，SLAM 给工程模板
- [[cousot-abstract-interpretation]] —— 谓词抽象 = 抽象解释里"抽象域 = 布尔格"的特例
- [[andersen-pointer-analysis]] —— SLAM 把它当先验来回答"两个指针可能别名吗"
- [[biere-bmc-1999]] —— 同时期的另一支：BMC 在具体代码上有界展开，SLAM 在抽象上无界检查
- [[cakeml]] —— 另一种验证哲学：把编译器证一次，别每个程序都查
- [[astree]] —— 同样基于抽象解释，目标是数值精度而非时序规则

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[graf-saidi-1997]] —— Graf-Saïdi — 用谓词把无限状态压成有限抽象
- [[colmap]] —— COLMAP — 多视图 SfM/MVS 重建
- [[gazebo-classic]] —— Gazebo Classic — 机器人世界的物理排练场
