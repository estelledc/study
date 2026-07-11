---
title: 彩票调度 — 用抽奖代替优先级的资源分配
来源: 'Waldspurger & Weihl, "Lottery Scheduling: Flexible Proportional-Share Resource Management", OSDI 1994'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

**彩票调度**（Lottery Scheduling）是一种 OS 调度器思路：每个进程拿一把"彩票"，调度器每次要决定"下一个时间片给谁跑"时，**随机抽一张票**，票在谁手里谁就上 CPU。

日常类比：单位发年终奖，传统做法是按工龄排队（优先级），高工龄永远先拿；彩票做法是按工龄发抽奖券，工龄高的人券更多但**任何人都有可能中**。长期看高工龄拿得多（比例对的），短期看新人也偶尔中奖（不会饿死）。

形式化一句话：**进程占总票数的比例 = 它长期分到的 CPU 时间比例**。

```
进程 A: 100 张票
进程 B: 200 张票
进程 C: 300 张票
                     ──→ 长期 CPU 占比 1:2:3
```

## 为什么重要

1990 年代初操作系统调度器普遍用**优先级数字**（Unix 的 nice 值、Windows 的 priority class），这套机制的老大难：

- **饿死**：低优先级永远轮不上
- **优先级反转**：低优先级持有锁，高优先级阻塞在锁上等它
- **调参玄学**：nice 值差 1 实际差多少 CPU？没有清晰对应
- **嵌套场景失效**：用户里有进程组、组里再分线程时，优先级如何累加？

Waldspurger 把"绝对顺序"换成"按概率比例"，上面四个毛病一次解决：

- 饿死：只要你有 1 张票，**长期一定中**
- 反转：客户可以**借票**给服务端（详见后文）
- 调参直观：100 票 vs 200 票 = 1:2，所见即所得
- 嵌套：引入"币种"层级，组内组外都可独立分票

更长远的影响：**Linux cgroups 的 `cpu.shares`、Docker 的 `--cpu-shares`、K8s 的 CPU 权重语义**，都是"按份额抢 CPU"——你给一个 cgroup 1024 share、另一个 512 share，它们就按 2:1 分。这和 1994 年这篇的票数直觉一脉相承（实现上多是确定性份额，不必真抽签）。

## 核心要点

论文给了 5 个原语，零基础只要先抓**前 3 个**：

### 1. Ticket（票）

资源的最小度量单位。**票数比例 = 资源比例**。和"优先级 5"这种纯数字不同，票数有清晰的数学含义。

### 2. Currency（币种 / 分层）

直接给所有进程发票会很乱——用户 A 启了 10 个进程，每个 100 票；用户 B 启了 1 个进程，1000 票，看起来公平实际不公平（B 一个进程顶 A 十个）。

解决：**分层发票**。

```
系统总票（base 币种）
  ├─ 用户 A：500 票     ──兑换──→  A 币种内 1000 张子票，按需分给 A 的进程
  └─ 用户 B：500 票     ──兑换──→  B 币种内  100 张子票，全给 B 的那 1 个进程
```

用户级 A=B（500 vs 500），用户内部 A 自己再切。结果：A 整体和 B 整体五五开，A 内部 10 个进程平分 A 的份额。

### 3. Ticket Transfer（票券转移，解决优先级反转）

经典场景：低优先级进程 L 拿着锁，高优先级 H 想拿这把锁就阻塞了。传统调度器没法识别"H 在等 L"，结果 L 拿不到 CPU、H 也跑不动。

彩票方案：**H 等 L 的时候，把自己的票临时借给 L**。L 票数暴涨 → 抽到的概率大涨 → 快速跑完释放锁 → H 拿到锁继续跑，把票要回来。

整个过程不需要内核检测"反转"，**借票天然成立**。

### 4. Ticket Inflation（通胀）

进程觉得自己急用 CPU，**临时给自己印更多票**（仅限同一组互相信任的进程使用）。慎用，类比就是开印钞机。

### 5. Compensation Ticket（补偿票）

进程没用完时间片就主动让出（比如 I/O 阻塞 100 ms 里只跑了 30 ms），下次调度时调度器**临时给它加票**让它中奖概率上升，把欠的份额补回来。这一条让"不抢满 CPU 的良民进程"不吃亏——不补的话纯随机会让 I/O 密集型进程长期被低估。

具体做法：分到 1/f 时间片就把它的票数乘 f。f=3 表示只用了三分之一，下次它的中奖概率乘 3。

## 实践案例

### 案例 1：长期比例 vs 短期波动

```python
import random
from collections import Counter

tickets = {"A": 1, "B": 2, "C": 3}
bag = [p for p, n in tickets.items() for _ in range(n)]
wins = Counter(random.choice(bag) for _ in range(100_000))
for p, w in sorted(wins.items()):
    print(p, w / 100_000)  # 约 0.167 / 0.333 / 0.500
```

**逐部分解释**：

- `bag` 按票数展开成抽签袋，抽到谁谁赢一个时间片
- 跑 10 万次后占比逼近 1:2:3；若只看连续 100 次，A 可能中 25 次（假象 25%）
- 这就是随机调度的固有方差：窗口越短，偏离越大

### 案例 2：cgroups 里的彩票思想

```bash
# 给 cgroup A 分 1024 share, B 分 512 share
echo 1024 > /sys/fs/cgroup/cpu/A/cpu.shares
echo  512 > /sys/fs/cgroup/cpu/B/cpu.shares
```

CPU 满载时，A : B 长期得到 2:1。`cpu.shares` 数字就是论文里的 ticket 数。Linux CFS 用红黑树+vruntime 做**确定性比例份额**（不是抽签），但**按权重分 CPU 的语义**和这篇一脉相承。

### 案例 3：客户端-服务端借票

```python
def handle_request(client, server):
    # 客户把票临时借给服务端，跑完再还
    server.tickets += client.tickets
    server.run_until_done(client.request)
    server.tickets -= client.tickets
```

**逐部分解释**：

- X Server 这类"客户发请求、服务端代跑"场景里，服务端常成瓶颈
- 借票后紧急客户的请求被优先抽中；调度器**不必懂** X Server 协议
- 请求结束还票，避免服务端永久吞掉客户份额

## 踩过的坑

1. **短期不公平**：抽签的本质决定了"窗口越短，方差越大"——长时间窗口看比例是对的，短窗口任意一段可能严重偏离。**对延迟敏感的实时任务不合适**。

2. **印钞机问题**：通胀机制必须限定信任域。同一用户内部可以互相通胀，跨用户不行——否则恶意进程印 100 万张票饿死所有人。

3. **票数粒度**：票数太少（如总共 10 张）方差大；太多（10 亿）数据结构开销上来。论文用**树形组织**摊到 O(log n) 抽签。

4. **不能直接做实时**：彩票只保证**长期比例**，不保证"H 一定 5 ms 内跑"。硬实时系统（汽车控制、医疗设备）还得用 EDF / RM 这种确定性调度。

## 适用 vs 不适用场景

**适用**：

- 多用户分时系统（论文最初目标）
- 容器 / cgroup 类资源配额（已成事实标准）
- 需要"软"公平、不要饿死、可解释比例的场景
- 多种资源（CPU / 内存 / 带宽）共用一套机制：都发票就行

**不适用**：

- 硬实时（机器人控制、刹车系统）
- 极低延迟交易（短期波动放大尾延迟）
- 单用户单进程（杀鸡用牛刀）

## 历史小故事（可跳过）

- **1994 年**：Waldspurger 在 MIT 读 PhD，导师 Weihl，做的就是"如何把分时系统的资源管理做得更直观"。OSDI 论文 14 页，给的是 Mach 上的原型。
- **1995 年**：博士论文扩展为 Stride Scheduling（确定性版本，去掉随机性）——其实和 Linux 后来的 CFS 思路重合。
- **2003 年**：Linux 2.6 引入 O(1) 调度器；2007 年 Ingo Molnár 用红黑树+vruntime 写了 CFS，做的是**确定性比例份额**（不是抽签，但和「按权重分 CPU」同一问题族）。
- **2010s**：cgroups v1/v2、Docker、Kubernetes 把"按权重分资源"做成云原生基础设施。

## 学到什么

1. **概率可以代替优先级**：当你纠结"A 一定要先于 B"时，问问自己是不是只需要"A 长期占得多"就够了。能把绝对约束放松成统计约束，方案空间瞬间打开。
2. **分层是处理嵌套公平的通用招数**：currency 这层抽象解决了"组内 vs 组间"的双重比例。后来的 cgroups 层级、K8s namespace + ResourceQuota 都是同一招。
3. **机制 + 协议而非中央调度**：借票让客户端-服务端协作避开优先级反转，没有任何调度器代码懂"反转"是什么。**让参与者自己表达需求**比中央算法识别需求更鲁棒。
4. **简单概率原语 → 30 年生命力**：cgroup share、container CPU 配额都是它的徒孙。

## 延伸阅读

- 论文 14 页 PDF：[Waldspurger-Weihl 1994](https://www.usenix.org/legacy/publications/library/proceedings/osdi/full_papers/waldspurger.pdf)
- OSTEP 教科书第 9 章 [Lottery Scheduling](https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-sched-lottery.pdf)（Wisconsin 大学公开教材，把这篇拆成本科讲义）
- 中文导读：陈皓《Linux 进程调度发展史》提到 CFS 和这条线
- [[cfs-scheduler]] —— Linux CFS 的确定性变体（待写）
- [[cgroups-v2]] —— 现代容器的资源隔离层（待写）

## 关联

- [[mach-os]] —— 论文原型实现的微内核 OS
- [[microkernel-l4]] —— 同时代的另一种 OS 架构思路，调度也强调灵活
- [[cfs-scheduler]] —— 确定性版本的"彩票"，今天 Linux 默认调度器
- [[cgroups-v2]] —— `cpu.weight` 的 weight 就是 ticket 数
- [[kubernetes-scheduling]] —— Pod 的 cpu request 在 cgroup 层映射成 share

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bvt-1999]] —— BVT 1999 — 让一份调度器同时照顾"急性子"和"老黄牛"
- [[lottery-ticket-2019]] —— 彩票假设 — 大网里藏着一张能独立训出来的小网
