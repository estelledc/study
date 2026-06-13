---
title: Lottery Scheduling 1994 — 用「彩票」做按比例公平分配 CPU
来源: https://www.usenix.org/legacy/publications/library/proceedings/osdi/full_papers/waldspurger.pdf
日期: 2026-06-13
子分类: 内核与虚拟化
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象社区活动中心只有**一台跑步机**（单核 CPU），门口排着三个人：

- **小明**买了 75 张抽奖券
- **小红**买了 25 张抽奖券
- 管理员每隔一小段时间摇一次奖：**抽到谁的券，谁就上去跑一小段**

没人能保证「下一分钟一定是小明在跑」——这是随机的。但只要摇奖次数足够多，小明大约会占到 **75%** 的上机时间，小红大约 **25%**。你不需要给每个人发固定时刻表，只要管好「每人手里有多少张券」，长期比例自然就对了。

这就是 **Lottery Scheduling（彩票调度）** 的核心直觉：把 **资源份额** 具象成 **彩票（ticket）**，每次分配资源时抽一张中奖券，持券越多，中奖概率越大，长期 CPU 占用率就越接近票权比例。

论文 **Lottery Scheduling: Flexible Proportional-Share Resource Management** 由 MIT 的 **Carl A. Waldspurger** 与 **William E. Weihl** 发表于 **OSDI 1994**，并在 **Mach 3.0 微内核** 上实现了原型调度器。它属于 **proportional-share（按比例份额）** 调度家族：不追求「最短响应时间」或「最小周转时间」，而是保证各计算任务按约定比例分享 CPU、内存、锁、I/O 带宽等稀缺资源。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 会议 | First Symposium on Operating Systems Design and Implementation (**OSDI '94**), Monterey, CA |
| 作者 | Carl A. Waldspurger, William E. Weihl (MIT) |
| 核心机制 | 每次分配前抽奖；总票池为 \(T\)，持 \(t\) 张票的客户中奖概率 \(p = t/T\) |
| 长期性质 | 期望分配比例与票权成正比；相对误差随分配次数 \(n_a\) 增大以 \(O(1/\sqrt{n_a})\) 收敛 |
| 扩展抽象 | Ticket transfer、inflation、currency、compensation ticket |
| 实现 | Mach 3.0 原型，时间片约 100ms；开销与标准 Mach 分时策略相当 |
| 后续 | 同作者博士论文（1995）提出确定性替代 **Stride Scheduling** |

与 **固定优先级调度**（数字越小越重要）相比，彩票调度用**相对份额**表达重要性：说「A 比 B 重要 3 倍」只需给 A 3 张票、B 1 张票，不必纠结「A 是优先级 7 还是 8」。与 **微经济学式资源定价** 相比，彩票机制更简单、模块化，且 tickets 可当作一等对象传递。

## 为什么需要 proportional-share？

传统调度器擅长两类目标：

| 目标 | 典型算法 | 局限 |
|------|---------|------|
| 交互响应 / 吞吐 | 多级反馈队列 MLFQ | 难精确保证「A 永远拿 60% CPU」 |
| 硬实时截止 | Rate Monotonic / EDF | 关注 deadline，不是长期比例 |

而数据库、多媒体、多租户云、科学计算集群等场景常需要：**不同用户/应用按合同或重要性获得可调的 CPU 份额**。例如：

- 视频播放器前台窗口应比后台编码任务获得更多 CPU
- Monte Carlo 模拟中，新启动的实验希望「先快速出粗略结果」，老实验慢速 refine
- 项目组之间按经费或 SLA 划分算力

彩票调度把「份额」变成可编程的 **ticket**，使策略可以在用户态、应用层、系统层灵活组合。

## 核心概念一：Ticket 与抽奖算法

**Ticket（彩票）** 代表对某类资源的权利。若干客户竞争同一资源时：

1. 设客户 \(c_i\) 持有 \(t_i\) 张票，总票池 \(T = \sum t_i\)
2. 在 \([0, T-1]\) 上均匀随机抽一个整数 `winner`
3. 按票区间累加，落在哪个客户的区间，谁赢得本次 **quantum（时间片）**

数学上，客户 \(c_i\) 单次中奖概率 \(p_i = t_i/T\)。连续 \(n_a\) 次独立抽奖后，期望获胜次数 \(E[w_i] = n_a p_i\)，方差 \(Var[w_i] = n_a p_i(1-p_i)\)。因此：

- **短期**：可能出现明显波动（小红连续赢好几次）
- **长期**：实际占比趋近期望占比；百分比误差随 \(n_a\) 增大而缩小

Ticket 的三个设计性质（论文强调）：

| 性质 | 含义 |
|------|------|
| **Abstract（抽象）** | 同一张票可映射不同物理资源（CPU、锁、带宽） |
| **Relative（相对）** | 份额由占总票池比例决定，与绝对票数无关 |
| **Uniform（统一）** | 异构资源可用同一套 ticket 框架管理 |

## 核心概念二：Ticket Transfer（票转让）

客户端阻塞等待服务时，可**临时把票转给服务器**，避免 priority inversion 式的低效：

```
客户端 C 有 100 票，调用 RPC 阻塞在服务器 S 上
→ C 把 100 票转给 S
→ S 以 C 的份额运行，尽快完成请求
→ 返回后票收回
```

这类似「我把我的排队权重借给你，让你替我把活干完」。论文指出，相比单纯提高服务器静态优先级，transfer 让**动态重要性**自然跟随调用链传递。

## 核心概念三：Ticket Inflation / Deflation（通胀 / 紧缩）

在**互信**客户之间，某方可**增发票**（inflation）以提高自己短期中奖率，无需逐张转让。典型场景：

- 用户拖动滑块提高前台视频窗口质量 → 对该窗口关联进程 inflate tickets
- 图形程序先粗渲染 wireframe（高票），再 deflation 把资源让给交互

Inflation 在不可信环境需谨慎：恶意进程可无限印钞。因此论文引入 **currency** 与访问控制。

## 核心概念四：Ticket Currency（货币）

多个管理域（项目、用户、应用）可用**不同货币**计价票，货币之间形成**有向无环图**的兑换关系，底层锚定一种 **base currency** 的守恒票池：

```
系统 base: 10000 票
  ├─ 项目 A 货币（兑换率 1 A = 10 base）→ 管理员发 100 A-tickets
  └─ 项目 B 货币（兑换率 1 B = 5 base）
```

效果：

- **隔离**：各组策略互不干扰
- **组合**：用户可属多组；组 A 可「资助」组 B（发 A 面额票给 B）
- **保护**：ACL 控制谁能 inflate 某种货币

Ticket 像「可分割、可兑换、可转让的计算经济货币」。

## 核心概念五：Compensation Ticket（补偿票）

I/O 密集型进程常**用不满整个时间片**就阻塞（等磁盘、等网络）。若票权相同，CPU 密集型进程会因「多跑满片」而实际占用远超比例。

**补偿机制**：若某客户只用了量子的一小部分 \(f\)（例如 1/5），则在其下次参与抽奖前，临时把有效票放大到 \(1/f\) 倍，直到重新获得 CPU：

- A、B 各 400 票，B 每次只用 1/5 量子
- B yield 时获得补偿，下次等效 2000 票
- 长期 A:B 实际 CPU 时间恢复 **1:1**

这使 **proportional-share 对 I/O bound 与 CPU bound 混合负载仍然公平**。

## 实现：从 O(n) 链表到 O(log n) 树

论文给出两种实现：

| 结构 | 单次 `allocate()` | 适用 |
|------|------------------|------|
| 链表扫描 | \(O(n_c)\) 客户数 | 原型、客户少 |
| 二叉树 partial sum | \(O(\log n_c)\) | 客户多、票分布不均 |

优化技巧：按票数降序排列 + move-to-front，因大户中奖频率高，均摊搜索更短。

**动态性优势**：每次抽奖独立，**无 per-client 调度状态**需在改票数时重算。增减客户、改票分配，下一次 `allocate()` 自动反映新比例——这是随机化相对确定性 stride 的早期卖点之一。

## 代码示例一：最小彩票调度器（Python 模拟）

下面用几十行 Python 模拟「每轮抽 CPU」；与论文 Figure 3-2 的 C 链表算法同构：

```python
import random
from dataclasses import dataclass

@dataclass
class Client:
    name: str
    tickets: int
    wins: int = 0

def pick_winner(clients: list[Client]) -> Client:
  """在 [0, T) 上抽 winner，线性扫描票区间（论文 list-based lottery）。"""
  total = sum(c.tickets for c in clients)
  winner = random.randrange(total)  # 等价 fast_random() % global_tickets
  runsum = 0
  for c in clients:
    runsum += c.tickets
    if runsum > winner:
      return c
  return clients[-1]

def simulate(clients: list[Client], rounds: int = 10_000) -> None:
  for _ in range(rounds):
    w = pick_winner(clients)
    w.wins += 1
  total_wins = sum(c.wins for c in clients)
  for c in clients:
    share = c.wins / total_wins
    expected = c.tickets / sum(x.tickets for x in clients)
    print(f"{c.name}: tickets={c.tickets}, actual={share:.1%}, expected={expected:.1%}")

if __name__ == "__main__":
  jobs = [Client("video", 75), Client("batch", 25)]
  simulate(jobs)
  # 典型输出：video ≈ 75%, batch ≈ 25%（随 round 数有随机波动）
```

运行多次可观察：**rounds=100 时波动大，rounds=100000 时非常接近 75/25**。这正是论文用概率论解释的长期公平。

## 代码示例二：RPC 场景下的 Ticket Transfer

第二个例子展示 **transfer** 如何解决「客户端阻塞、服务器缺票」：

```python
from contextlib import contextmanager

@dataclass
class Process:
  name: str
  tickets: int
  _saved: int = 0

@contextmanager
def ticket_transfer(client: Process, server: Process):
  """客户端阻塞在服务器上时，临时把票转给服务器（论文 §3.1 Ticket Transfers）。"""
  server._saved = server.tickets
  transferred = client.tickets
  server.tickets += transferred
  client.tickets = 0
  try:
    yield
  finally:
    client.tickets = transferred
    server.tickets = server._saved

def run_rpc(client: Process, server: Process) -> None:
  print(f"before RPC: client={client.tickets}, server={server.tickets}")
  with ticket_transfer(client, server):
    print(f"during RPC: client={client.tickets}, server={server.tickets}")
    # 服务器在此以 client+server 的总票权运行
  print(f"after RPC:  client={client.tickets}, server={server.tickets}")

# 用户进程 100 票，内核服务器初始 10 票
user = Process("app", 100)
kernel_server = Process("vfs", 10)
run_rpc(user, kernel_server)
```

没有 transfer 时，服务器只有 10 票，即使用户再重要，RPC 处理也慢；transfer 后服务器暂时持有 110 票，**端到端延迟**与**用户应得份额**一致。

## 代码示例三：补偿票（Compensation）草图

```python
def compensate(client: Process, fraction_used: float) -> None:
  """fraction_used in (0, 1]；用不满量子则临时放大票权至 1/f（论文 §3.4）。"""
  if fraction_used <= 0:
    return
  boost = int(client.tickets / fraction_used)
  client.tickets = boost  # 简化：下次抽奖前有效；新 quantum 开始后恢复

# B 与 A 各 400 票，但 B 每次 I/O 等待只用 20% 量子
io_bound = Process("db_client", 400)
compensate(io_bound, fraction_used=0.2)  # 等效 2000 票直到下次运行
```

完整 Mach 实现会在 `allocate()` 末尾根据 `elapsed/quantum` 调用 `compensate()`，且补偿是**瞬态**的。

## 与 Stride Scheduling 的对比（论文家族延伸）

同作者 1995 博士论文提出 **Stride Scheduling**：为每个客户维护 **stride**（步长），用确定性 pass 值选下一个运行者。

| 维度 | Lottery | Stride |
|------|---------|--------|
| 随机性 | 有，短期波动 | 无，短期更平滑 |
| 动态改票 | 极简单（无状态） | 需更新 pass，但也可高效 |
| 实现复杂度 | 低 | 中等 |
| 误差 | 概率收敛 | 确定性逼近份额 |

OS 教材（如 OSTEP）常把 Lottery 作为入门，Stride 作为「想要更稳定短期行为」的进阶。Linux **CFS（Completely Fair Scheduler）** 的 `vruntime` 思想与 stride 一脉相承，而非直接抽奖。

## 论文实验与结论要点

Mach 3.0 原型实验包括：

1. **相对执行速率控制**：动态改票后，实测 CPU 比例快速跟踪新票权
2. **多媒体 / 视频**：配合 inflation，用户可把资源集中到当前关注窗口
3. **Monte Carlo**：按相对误差动态调票——新实验高票快收敛，旧实验低票慢 refine
4. **多资源**：锁、内存、磁盘带宽也可用同一 ticket 框架（含 inverse lottery 等变体）

结论：**彩票调度用极简随机机制实现了灵活、响应快的 proportional-share 控制**；模块化 ticket 抽象让策略可组合；开销与常规分时调度同量级。

## 局限与实务注意

| 问题 | 说明 |
|------|------|
| 短期不公平 | 实时音视频可能无法忍受几百毫秒内的比例抖动 → 可用 multi-winner lottery 或 stride |
| 安全性 | inflation 需 currency + ACL，防恶意印钞 |
| 单线程服务器瓶颈 | 论文指出：若服务器串行处理请求，客户端票权再合理也受限于服务器结构 |
| 多核 | 经典论文针对单资源；现代 OS 在多核上扩展需 per-CPU 运行队列与全局份额核算 |

## 与周边知识的关系

```text
调度器光谱
├── 硬实时：RM / EDF（deadline 可证明）
├── 分时交互：MLFQ / CFS（延迟与公平启发式）
└── 比例份额：Lottery / Stride / Fair-share（可编程份额）
         ↑
    Waldspurger & Weihl 1994 开辟的「票权」路线
```

读本文时可对照：

- **Liu & Layland 1973**：周期任务与利用率上界（硬实时）
- **Mach 微内核**：论文实现平台
- **《Operating Systems: Three Easy Pieces》第 9 章**：Lottery 友好入门

## 自测题

1. 三个进程票数为 2:3:5，总池 10。某进程持 3 票，单次中奖概率是多少？
2. 为何 I/O 密集进程需要 compensation ticket？
3. Ticket transfer 与单纯提高服务器静态优先级有何不同？
4. 若只有 10 次抽奖，75:25 票权的两进程，实际比例可能偏离很大，这违反 proportional-share 吗？

<details>
<summary>参考答案</summary>

1. \(3/10 = 30\%\)。
2. 否则 CPU 密集进程会占满更多完整量子，I/O 进程虽票权相同却实际吃亏。
3. Transfer 把**调用者**的份额临时绑定到**当前服务链**，动态、可收回；静态优先级无法随 RPC 关系变化。
4. 不违反。Proportional-share 通常指**长期期望或极限**意义下的比例；短期方差是 lottery 的已知代价。

</details>

---

**一句话总结**：Waldspurger & Weihl 1994 用「抽彩票」把 CPU 份额变成可传递、可通胀、可补偿的 **ticket**，在 Mach 上实现了简单、模块化、长期精确的 **proportional-share** 资源管理——为多媒体、多租户与可编程 QoS 调度开了路。
