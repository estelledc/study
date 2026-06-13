---
title: Liu-Layland 1973 — 硬实时单核调度的奠基论文（Rate Monotonic + EDF）
来源: https://dl.acm.org/doi/10.1145/321738.321743
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象你是**医院急诊室唯一的医生**（单核 CPU），墙上挂着好几块电子钟，每块钟到点就会响一次，代表一类病人必须被处理完：

- **读体温**（任务 A）：每 100ms 响一次，处理要 30ms
- **看心电**（任务 B）：每 250ms 响一次，处理要 80ms
- **写病历**（任务 C）：每 1000ms 响一次，处理要 150ms

规则很硬：**钟响后，你必须在下一次同一块钟响之前把这类病人处理完**，否则算医疗事故（硬实时 deadline miss）。更狠的是：心电病人刚进来，体温钟又响了——你必须立刻放下手头活去处理更紧急的（**抢占式调度**）。

这篇 1973 年发表在 *Journal of the ACM* 的论文，作者 **C. L. Liu**（MIT / UIUC）和 **James W. Layland**（JPL，喷气推进实验室），回答的就是：**在只有一位医生的情况下，怎么排优先级，才能保证所有钟永远不响「误点」？** 能不能把医生忙到 100% 还不出事？如果只能固定排班表（静态优先级），利用率上限是多少？

论文背景是 **NASA 航天器测控**：天线跟踪、姿态控制等周期性任务必须在截止前完成，失败不是「慢一点也不行」，而是任务失败。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 发表 | J. ACM, Vol. 20, No. 1, pp. 46–61, **1973年1月** |
| DOI | [10.1145/321738.321743](https://dl.acm.org/doi/10.1145/321738.321743) |
| 调度类型 | **抢占式** + **优先级驱动** |
| 主要结论 1 | 最优**固定优先级**调度（Rate Monotonic）有利用率上界，任务多时趋近 **≈69.3%（常被说成 70%）** |
| 主要结论 2 | **动态优先级**按当前 deadline 排序（Earliest Deadline First, EDF）可达 **100% 利用率** |
| 额外讨论 | **混合调度**：部分任务固定优先级，部分动态 |

一句话：**RM 简单可分析但 CPU 可能空转；EDF 吃满 CPU 但实现与验证更复杂。** 此后五十年实时系统教材、FreeRTOS、VxWorks、AUTOSAR 的调度理论几乎都从这篇论文长出来。

## 硬实时 vs 软实时

论文区分 **hard-real-time** 与 **soft-real-time**：

| 类型 | 错过 deadline 的后果 | 例子 |
|------|---------------------|------|
| 硬实时 | **灾难性**，必须数学上保证永不 miss | 飞机襟翼控制、ABS 防抱死、航天器姿态环 |
| 软实时 | 统计上「大多数时候够快」即可 | 视频解码掉帧、网络包偶尔延迟 |

硬实时关心的是：**可行性（feasibility）**——是否存在一种调度方式，使得**任意时刻**都不会 overflow（到了 deadline 任务还没跑完）。

## 论文的五个环境假设（简化版）

要推出可证明的定理，Liu & Layland 先约定任务模型（后文可放松，但定理以此时为前提）：

| 编号 | 假设 | 白话 |
|------|------|------|
| A1 | 请求**周期**发生，间隔恒定 | 体温每 100ms 量一次，不会突然改成 50ms |
| A2 | deadline = **下一周期开始** | 本次量完前，下一次请求不能已经到期 |
| A3 | 任务**独立** | A 不等着 B 跑完才醒（可用周期倍数建模依赖） |
| A4 | 执行时间 **Ci 恒定**（最坏情况 WCET） | 医生看体温永远不超过 30ms |
| A5 | 非周期任务特殊处理 | 初始化、故障恢复可暂时挤掉周期任务 |

每个周期任务 **τi** 用两个数描述：**周期 Ti**、**最坏执行时间 Ci**。请求率 = 1/Ti。

**利用率**（processor utilization）：

\[
U = \sum_{i=1}^{m} \frac{C_i}{T_i}
\]

直观理解：所有任务「占 CPU 的比例」加起来。U > 1 肯定调度不了；U ≤ 1 时还要看调度算法。

## 核心概念一：抢占式优先级调度

**调度算法** = 决定「下一瞬间跑谁」的规则。本文只研究：

- **抢占式**：高优先级任务一到，立刻打断低优先级
- **优先级驱动**：总是跑当前就绪任务里优先级最高的

分类：

| 类型 | 优先级何时定 | 别名 |
|------|-------------|------|
| 静态 / 固定 | 设计时定死，永不改 | Fixed Priority, FP |
| 动态 | 每次请求可能变 | Dynamic Priority |
| 混合 | 一部分固定、一部分动态 | Mixed |

## 核心概念二：临界瞬间（Critical Instant）

要分析「最坏情况响应时间」，论文引入 **critical instant**：

> 对某任务来说，**临界瞬间**是它某次请求响应时间最长的那个时刻。

**定理 1**：对任意任务，临界瞬间出现在 **它与所有更高优先级任务同时被请求** 的时刻。

直觉：低优先级任务刚要开始跑，上面高优先级的钟也一起响了——它要被插队插到吐血，响应时间最长。后面所有可调度性分析都围绕这个「最倒霉的同时到达」场景。

**Deadline** 定义：某次请求必须在 **下一次同任务请求** 之前完成（与假设 A2 一致）。

## 核心概念三：Rate Monotonic（RM）—— 固定优先级的最优规则

**定理 2（RM 最优性）**：在所有**静态**优先级算法里，按 **请求率从高到低** 分配优先级（周期 **越短 → 优先级越高**）是最优的。这就是 **Rate Monotonic Scheduling（RMS）**。

日常类比：钟响得越勤的病人，永远优先于钟响得慢的——不用猜谁更重要，看周期长短就行。

### 利用率上界定理（Liu-Layland Bound）

对 **m** 个独立周期任务，若按 RM 分配优先级，一个**充分条件**是：

\[
U = \sum_{i=1}^{m} \frac{C_i}{T_i} \leq m \left(2^{1/m} - 1\right)
\]

| m（任务数） | 上界 U |
|------------|--------|
| 1 | 100% |
| 2 | 82.8% |
| 3 | 77.9% |
| 5 | 74.3% |
| 10 | 71.8% |
| → ∞ | **ln 2 ≈ 69.3%** |

这就是摘要里「**大任务集时利用率可能低至 70%**」的来源：**不是 CPU 只能干 70% 的活，而是 RM 这种固定排班表在最坏排列下，超过这个利用率就可能找不到可行调度**——即使 U < 100%，RM 也可能 miss；反过来 U 低于上界则 **RM 一定可行**。

注意：这是**充分条件**，不是必要条件。实际任务集可能在 U = 85% 时 RM 仍可行，但要用更紧的响应时间分析（见代码示例 2）。

## 核心概念四：EDF —— 按 deadline 动态抢优先级

**定理 3**：若按 **当前 deadline 最早者优先**（Earliest Deadline First）动态分配优先级，则对独立周期任务：

> **U ≤ 1 ⟺ 存在可行调度**（在论文假设下，EDF 达到 100% 利用率）

日常类比：不再看「谁钟响得勤」，而看「谁下一次必须交卷的时间最近」——deadline 越近越先治。

| 对比项 | Rate Monotonic (RM) | EDF |
|--------|---------------------|-----|
| 优先级 | 固定，按周期 | 动态，按 deadline |
| 利用率上界 | ≈ 69.3%（m 大时）充分条件 | **100%**（U≤1 充要） |
| 实现成本 | 低，适合简单 RTOS | 需维护 deadline 队列 |
| 过载行为 | 可预测谁先 miss | 多个任务可能同时 miss |

论文还简要讨论 **混合调度**：关键任务用 RM 保证可分析性，其余用 EDF 提高利用率。

## 代码示例 1：RM 利用率上界与充分条件检验

下面用 Python 实现 Liu-Layland 上界检验——适合课程作业或设计阶段快速筛任务集：

```python
from math import log

def liu_layland_bound(num_tasks: int) -> float:
    """m 个任务时 RM 调度的经典利用率充分上界。"""
    if num_tasks <= 0:
        raise ValueError("num_tasks must be positive")
    if num_tasks == 1:
        return 1.0
    return num_tasks * (2 ** (1 / num_tasks) - 1)

def utilization(tasks: list[tuple[float, float]]) -> float:
    """tasks: [(C_i, T_i), ...]  最坏执行时间 / 周期"""
    return sum(c / t for c, t in tasks)

def rm_sufficient_schedulable(tasks: list[tuple[float, float]]) -> bool:
    u = utilization(tasks)
    bound = liu_layland_bound(len(tasks))
    return u <= bound

# 航天测控风格的三任务例子（单位：ms）
tasks = [
    (30, 100),   # 传感器采样：C=30, T=100  → U=0.30
    (80, 250),   # 姿态环：C=80, T=250      → U=0.32
    (150, 1000), # 遥测打包：C=150, T=1000  → U=0.15
]
# 总 U = 0.77；3 任务上界 ≈ 0.779 → 充分条件判定：RM 可行

print("U =", utilization(tasks))
print("LL bound =", liu_layland_bound(len(tasks)))
print("RM sufficient schedulable:", rm_sufficient_schedulable(tasks))
print("asymptotic bound ln(2) =", log(2))  # ≈ 0.693
```

若把第一个任务改成 `C=40`（U 总和 0.87），则超过 3 任务上界 0.779——**不能**仅凭 Liu-Layland 断定可行，需要更精确分析或换 EDF。

## 代码示例 2：RM 响应时间迭代（比上界更紧）

对固定优先级任务集，任务 **τi** 的最坏响应时间 **Ri** 可用迭代求（Joseph & Pandya 等后来形式化，思想源自论文临界瞬间分析）：

\[
R_i = C_i + \sum_{j \in hp(i)} \left\lceil \frac{R_i}{T_j} \right\rceil C_j
\]

其中 **hp(i)** 是比 i 优先级更高的任务集合。若某次迭代 **Ri > Ti**，则 RM 不可行。

```python
import math

def rm_worst_response_times(periods, costs):
    """
    periods, costs: 已按 RM 排序（周期升序 = 优先级降序）
    返回每个任务最坏响应时间 Ri；若 Ri > Ti 则不可行。
    """
    n = len(periods)
    R = list(costs)
    for i in range(n):
        while True:
            interference = 0
            for j in range(i):  # 更高优先级 j < i
                interference += math.ceil(R[i] / periods[j]) * costs[j]
            new_R = costs[i] + interference
            if new_R == R[i]:
                break
            R[i] = new_R
        if R[i] > periods[i]:
            return None  # 不可调度
    return R

periods = [100, 250, 1000]
costs   = [40, 80, 150]   # 比示例 1 更吃紧
Ri = rm_worst_response_times(periods, costs)
if Ri is None:
    print("RM infeasible")
else:
    for i, (T, R) in enumerate(zip(periods, Ri)):
        print(f"task {i}: T={T}ms, R={R:.1f}ms, margin={T-R:.1f}ms")
```

这比单纯乘 Liu-Layland 上界**更少误报**：很多 U > 77% 的任务集 RM 其实仍能跑，但必须算 **Ri ≤ Ti**。

## 代码示例 3：极简 EDF 可行性（U ≤ 1）

在论文假设下，独立周期任务用 EDF 时，利用率不超过 1 即可行。仿真里可用 deadline 排序选下一个任务：

```python
def edf_feasible_by_utilization(tasks: list[tuple[float, float]]) -> bool:
  """论文结论：A1–A4 下独立任务，EDF 可行 ⟺ U <= 1。"""
  return utilization(tasks) <= 1.0

# 同一组吃紧任务
tight = [(40, 100), (80, 250), (150, 1000)]
print("U =", utilization(tight))           # 0.87
print("EDF feasible:", edf_feasible_by_utilization(tight))  # True
print("RM LL sufficient:", rm_sufficient_schedulable(tight))  # False
```

真实内核里 EDF 还要处理**优先级反转、共享资源、非周期任务**——论文 A5 把非周期活单独论，现代系统用 **带宽保留（ CBS）** 等扩展。

## 为什么这篇论文仍然重要

| 领域 | 影响 |
|------|------|
| 嵌入式 RTOS | FreeRTOS、Zephyr、ThreadX 的固定优先级就是 RM 思想 |
| 汽车 AUTOSAR | OsScheduleTable / 优先级配置可追溯 WCET + RM 分析 |
| 航天软件 | JPL 传统延续到今日任务调度规范 |
| 学术研究 | 响应时间分析、资源预留、混合关键性系统都建在此模型上 |
| 与 Linux 对比 | `SCHED_FIFO` 是固定优先级；`SCHED_DEADLINE` 实现 EDF 语义 |

读不懂 Liu-Layland，就很难理解面试题「为什么 3 个任务利用率 80% RM 可能不行」「EDF 为什么能跑满 CPU」「critical instant 是什么」。

## 放松假设之后（论文后续讨论方向）

论文末尾讨论放松 A1–A4 的影响，现代教材常补充：

- **执行时间变化**：用 WCET + 测量 guard band
- **任务依赖 / 资源共享**：互斥锁导致优先级反转 → **优先级继承/天花板（PIP/PCP）**
- **多核**：单核定理不直接套用，需分区或全局调度
- **能耗**：RM 的空闲 CPU 可进低功耗，是工程上接受「不到 100%」的理由之一

## 自测清单

1. 硬实时与软实时的区别？为什么航天控制属于前者？
2. 写出任务 (C,T) = (2,5) 和 (4,10) 各自的利用率，总和 U 是多少？
3. RM 下谁优先级更高？周期 5ms 还是 10ms？
4. 3 任务时 Liu-Layland 上界约多少？10 任务呢？
5. 临界瞬间为什么常假设「所有高优先级同时到达」？
6. EDF 在论文模型下 U=0.95 是否一定可行？RM 呢？
7. 充分条件与必要条件：U 低于 LL 上界说明什么？U 高于上界说明什么？

## 延伸阅读

- Liu & Layland 原文：[ACM DL](https://dl.acm.org/doi/10.1145/321738.321743)
- 教材：Buttazzo, *Hard Real-Time Computing Systems*（RM/EDF 标准章节）
- 实践：本库 [FreeRTOS 导读](/docs/papers/freertos-overview) — 固定优先级在 MCU 上的落地
- 形式化：seL4、RTEMS 文档中的 schedulability 与 WCET 工具链

---

**一句话总结**：Liu & Layland 1973 用周期任务模型证明——**RM 是最优固定优先级策略但有 ≈70% 利用率天花板；EDF 动态按 deadline 排序能吃满 CPU**——硬实时单核调度的理论地基由此奠定。
