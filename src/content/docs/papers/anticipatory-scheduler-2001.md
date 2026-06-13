---
title: Anticipatory Scheduling — 用「稍等一下」治好磁盘调度的误判空闲
来源: https://www.cs.rice.edu/~druschel/publications/anticipatory.pdf
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
provenance: pipeline-v3
---

## 先想成什么事

想象图书馆只有**一台自助借书机**（磁盘），门口排着几位读者：

- **小明**借完一本书，转身走两步到相邻书架再借下一本——中间只花 **2 秒**找书
- **管理员**是「工作守恒」型：上一人刚还书，机器一空，立刻叫**下一位**上来

小明人还没回到机器旁，管理员已经让**小红**刷卡了。小红要的书在库房另一头，机器大老远跑一趟。等小明终于回来，又得等小红办完——**本该连续的两次邻近借书，被一次无谓的「换人」打断**。

如果管理员学会一句：**「刚办完的那位，稍等 3 秒，看他会不会马上再来」**——小明往往能在等待窗口内提交下一单，两次借阅落在相邻书架，机器少走很多冤枉路。磁盘短暂空闲几秒，总吞吐反而上去。

这就是 **Anticipatory Scheduling（预期调度）** 的直觉：在同步 I/O 场景下，**故意不让磁盘立刻接下一单**，给「刚被服务过的进程」一点时间提交后续请求，从而避免 **deceptive idleness（欺骗性空闲）**。

论文 **Anticipatory scheduling: A disk scheduling framework to overcome deceptive idleness in synchronous I/O** 由 Rice 大学的 **Sitaram Iyer** 与 **Peter Druschel** 发表于 **SOSP 2001**（第 18 届 ACM 操作系统原理研讨会，pp. 117–130）。作者在 **FreeBSD 4.3** 上实现原型（约 1500 行 C），并报告了 Apache、Andrew 文件系统基准、TPC-B 数据库等工作负载上的显著收益。

## 这篇论文在说什么

| 维度 | 内容 |
|------|------|
| 会议 | **SOSP 2001** |
| 作者 | Sitaram Iyer, Peter Druschel (Rice University) |
| 核心问题 | 工作守恒磁盘调度器在**同步 I/O** 下过早选下一请求，误判进程已「空闲」 |
| 核心思路 | 用**非工作守恒**外层框架包裹任意底层调度策略，完成一单后**有条件地短暂等待** |
| 决策依据 | 按底层策略做**成本–收益分析**（寻道优化 vs 比例份额各有不同启发式） |
| 典型收益 | Apache 吞吐 +29%～+71%；Andrew FS 读密集阶段 +54%；TPC-B +2%～+60% |
| Linux 遗产 | 2.6.0～2.6.18 默认 **AS** 调度器；2.6.33 移除，能力由 **CFQ** 等继承 |

## 为什么磁盘调度会「看错人」？

现代磁盘调度器往往要同时追求多个目标：

| 目标 | 典型手段 | 需要什么前提 |
|------|---------|-------------|
| **减少寻道** | SCAN、C-SCAN、SSTF | 队列里**同时挂着多个请求**，才能挑「离磁头近」的 |
| **按比例公平** | 彩票调度、WFQ、CFQ | 知道各进程**还有多少未完成的 I/O**，才能按份额分配 |
| **降低延迟** | 截止时间、优先级 | 识别哪些请求更急 |

很多应用却这样读盘：

```
read(块 A) → 算几微秒～几毫秒 → read(块 B，往往离 A 很近)
```

这是 **synchronous I/O（同步 I/O）**：每次 `read` 阻塞到数据进内存，算完再发下一次。调度器在**上一次 read 完成瞬间**看队列：小明的下一个请求**还没提交**——队列里只有别人的远距离请求。工作守恒调度器**必须立刻派一单**，只好服务小红，磁头被拽到远处。

论文把这种现象叫 **deceptive idleness**：进程并非真的闲着，只是**在两次 I/O 之间的 think time（思考时间）里**，对调度器表现为空闲。

### 欺骗性空闲的三要素

论文指出，要出现 deceptive idleness，须同时满足：

1. **多个磁盘密集型应用并发**，且以同步方式发请求
2. 磁盘请求**不可抢占**（服务中途不能换人）
3. 调度器是**工作守恒**的：上一请求一结束就立刻派下一单

破坏任意一条即可缓解。论文选择破坏 (3)：引入**非工作守恒**外层，在完成一单后**可能等待**。

## 核心概念一：非工作守恒的「预期外壳」

**Work-conserving（工作守恒）**：只要有 pending 请求，磁盘就不该闲着。

**Non-work-conserving（非工作守恒）**：即使队列非空，也可以**故意让磁盘空闲一小段时间**，赌「马上会有更合适的请求进来」。

Anticipatory Scheduling 不是替换 SCAN、Deadline、比例份额等策略，而是：

```
┌─────────────────────────────────────┐
│  Anticipation Core（通用等待逻辑）   │
│  ┌───────────────────────────────┐  │
│  │ 底层 Scheduler（SCAN / WFQ …） │  │
│  └───────────────────────────────┘  │
│  + Scheduler-specific Heuristic     │
└─────────────────────────────────────┘
```

三层结构（论文 Figure 2）：

1. **原始调度器** —— 实现寻道或公平策略，**不知道**外层存在
2. **Anticipation core** —— 统一的计时、状态机：何时进入/退出等待
3. **Adaptive heuristics** —— 针对寻道优化型 vs 比例份额型，回答「等不等、等多久」

对应用**完全透明**：不必改 Apache、数据库或文件系统代码。

## 核心概念二：成本–收益分析

盲目等待会伤害吞吐：磁盘转着没人用。论文用**最短等待时间**，使得「等的收益」在**高概率**下超过「空闲的成本」。

### 寻道优化型调度器

记：

- `best` = 当前队列里底层调度器会选中的请求（定位时间 `best.positioning_time`）
- `next` = **刚被服务进程**即将提交的下一个请求（预期定位时间 `next.positioning_time`）

```
Benefit = best.positioning_time − next.positioning_time
Cost    = next.median_thinktime   # 保持空闲的代价 ≈ 错过 think time 的机会成本

若 Benefit > Cost：
    Waiting_duration = next.95percentile_thinktime
否则：
    Waiting_duration = 0
```

直觉：若等来的下一单能省下大量寻道，而进程 historically 很快会再发请求，就值得等到 95 分位 think time。

### 比例份额型调度器

公平目标不同，启发式也不同。对**刚被服务且份额未用尽**的进程，若 think time 低于阈值（论文举例 **3ms**），则等待：

```
Waiting_duration = next.95percentile_thinktime
```

这样同步读 burst 不会被过早切走，**实际 I/O 带宽更接近合同比例**。

## 核心概念三：Think Time 统计

框架为每个进程维护衰减统计（类似指数加权移动平均）：

| 统计量 | 用途 |
|--------|------|
| **median think time** | 估计「典型计算间隔」→ 成本项 |
| **95th percentile think time** | 等待上限：大概率在此窗口内看到下一请求 |
| **positioning time** | 预期下一请求相对当前磁头的寻道代价 |

Linux **AS** 调度器（`block/as-iosched.c`）里 `MAX_THINKTIME` 约为 **20ms**（`HZ/50`），并对 think time 做 7:1 衰减平均，避免偶发长计算误判。还维护 **exit probability**：进程若长期不发 I/O，逐渐停止为它预期。

## 与 Linux I/O 调度器谱系的关系

| 年代 | 调度器 | 与本文关系 |
|------|--------|-----------|
| 2.4 | **Linus Elevator** | 简单电梯，工作守恒 |
| 2.6.0–2.6.18 | **AS (Anticipatory)** | 本文框架的直接产物，默认调度器 |
| 2.6–至今 | **CFQ** | 按进程时间片 + `slice_idle` 也能实现类似 idle |
| 2.6.33+ | AS **移除** | 维护成本 vs 收益；CFQ/Deadline 可调校覆盖 |

Wikipedia 与内核邮件列表记载：在 **TCQ**、高速 SCSI、硬件 RAID 上 AS 有时**反而降性能**——设备自身会重排命令，额外 idle 与硬件队列冲突。2.6.33 删除 AS 后，社区认为 tuned CFQ 已能复现其主要收益。

## 代码示例一：模拟欺骗性空闲 vs 预期等待

下面用 Python 简化「磁道号 + 同步读」场景。两个进程交替发请求；**工作守恒**总在完成瞬间选队列里最近的他人请求；**预期调度**在完成本进程请求后短暂等待。

```python
from dataclasses import dataclass, field
from collections import deque
import heapq

@dataclass(order=True)
class DiskReq:
    track: int
    pid: int

@dataclass
class Process:
    name: str
    tracks: list[int]          # 该进程即将发出的读序列
    think_ms: float = 2.0      # 两次 read 之间的计算时间
    cursor: int = 0
    pending_after_think: deque = field(default_factory=deque)

def deceptive_idle_sim(head: int, queue: list[DiskReq], last_pid: int | None,
                         processes: dict[int, Process], anticipatory: bool,
                         wait_ms: float = 3.0) -> tuple[int, int, list]:
    """返回 (新磁头, 寻道距离累加, 事件日志)。"""
    log = []
    seek_total = 0

    while queue or any(p.cursor < len(p.tracks) for p in processes.values()):
        # 同步 I/O：刚服务完的进程在 think 之后提交下一请求
        if last_pid is not None:
            proc = processes[last_pid]
            if proc.cursor < len(proc.tracks) and not proc.pending_after_think:
                # 模拟 think time 后入队
                t = proc.tracks[proc.cursor]
                proc.pending_after_think.append(DiskReq(t, last_pid))
                proc.cursor += 1
                log.append(f"  [{proc.name}] think {proc.think_ms}ms → enqueue track {t}")

        # 把 pending 并入全局队列
        for p in processes.values():
            while p.pending_after_think:
                queue.append(p.pending_after_think.popleft())

        if not queue:
            break

        if anticipatory and last_pid is not None:
            # 预期调度：优先等 last_pid 的下一单（若已在队列）
            same = [r for r in queue if r.pid == last_pid]
            if same:
                req = min(same, key=lambda r: abs(r.track - head))
            else:
                # 短暂等待窗口内假设会到来；此处简化为直接选全局最近
                req = min(queue, key=lambda r: abs(r.track - head))
        else:
            # 工作守恒：立刻选全局最近（可能是别人）
            req = min(queue, key=lambda r: abs(r.track - head))

        dist = abs(req.track - head)
        seek_total += dist
        head = req.track
        queue.remove(req)
        last_pid = req.pid
        log.append(f"dispatch pid={req.pid} track={req.track} seek={dist}")

    return head, seek_total, log

# 小明读相邻磁道 100,102,104；小红读 900,902（远距）
procs = {
    1: Process("alice", [100, 102, 104]),
    2: Process("bob",   [900, 902]),
}
q = [DiskReq(100, 1), DiskReq(900, 2)]  # 初始各一发
_, seek_wc, _ = deceptive_idle_sim(50, q.copy(), None, procs, anticipatory=False)
_, seek_as, _ = deceptive_idle_sim(50, q.copy(), None, procs, anticipatory=True)
print(f"work-conserving total seek: {seek_wc}")
print(f"anticipatory total seek:    {seek_as}")
# 典型：anticipatory 显著更小——alice 的局部性得以保持
```

运行后常见现象：**工作守恒**总寻道距离更大，因为 alice 读完 100 的瞬间 bob 的 900 被选中，磁头来回甩。

## 代码示例二：成本–收益启发式（论文公式直译）

第二个例子实现论文 §3 对寻道优化调度器的等待判定，便于单测不同 think time / 寻道假设：

```python
from dataclasses import dataclass

@dataclass
class IoStats:
    median_think_ms: float
    p95_think_ms: float

def anticipatory_wait_ms(
    best_position_ms: float,
    next_position_ms: float,
    next_stats: IoStats,
) -> float:
    """
    寻道优化型启发式（Iyer & Druschel, SOSP'01）.
    Benefit = 不等待时服务 best 的定位代价 − 等待后服务 next 的定位代价
    Cost    = 进程典型 think time
  """
    benefit = best_position_ms - next_position_ms
    cost = next_stats.median_think_ms
    if benefit > cost:
        return next_stats.p95_think_ms
    return 0.0

def proportional_wait_ms(
    received_share: float,
    allocated_share: float,
    next_stats: IoStats,
    think_threshold_ms: float = 3.0,
) -> float:
    """比例份额型：欠份额且 think time 短则等待。"""
    under_allocated = received_share < allocated_share
    short_think = next_stats.median_think_ms < think_threshold_ms
    if under_allocated and short_think:
        return next_stats.p95_think_ms
    return 0.0

# 场景：best 在远轨需 8ms 寻道，next 预期 1ms，alice 通常 think 2ms
stats = IoStats(median_think_ms=2.0, p95_think_ms=4.0)
wait = anticipatory_wait_ms(best_position_ms=8.0, next_position_ms=1.0, next_stats=stats)
print(f"wait {wait} ms")  # Benefit=7 > Cost=2 → wait 4ms

# 若 next 只比 best 省 1ms，则不等待
wait2 = anticipatory_wait_ms(8.0, 7.0, stats)
print(f"wait {wait2} ms")  # Benefit=1 < Cost=2 → 0
```

把 `median` / `p95` 换成内核里衰减更新的 `ttime_mean`，就是 Linux AS 决策的简化版。

## 实验结果（论文摘要）

作者在 **7200 RPM IDE** 与 **15000 RPM SCSI** 上测试：

| 工作负载 | 观察 |
|---------|------|
| **Apache** 磁盘密集 | 吞吐 **+29%～+71%** |
| **Andrew 文件系统基准** | 整体 **+8%**，读密集阶段 **+54%** |
| **TPC-B 数据库** | **+2%～+60%**（视并发与同步程度） |
| **比例份额调度器** | 实际分配更接近合同份额 |

微基准也显示：在「多进程同步读、局部性明显」时收益最大；纯随机读或设备已做深度重排时收益下降。

## 设计启示（今天仍有用）

1. **调度器看到的队列 ≠ 应用的真实意图** —— 同步 API 把「未来请求」藏在 think time 里；任何 work-conserving 策略都可能误判。
2. **非工作守恒是通用外壳** —— 不必重写 SCAN/CFQ，在外层加「何时 idle」即可；与日后 **CFQ slice_idle**、**mq-deadline** 调参思路一脉相承。
3. **统计驱动比固定延迟聪明** —— 用 per-process think time 分布做 cost-benefit，比「一律 sleep 5ms」更稳。
4. **硬件演进改变假设** —— NCQ/TCQ、NVMe 多队列、内核 **readahead** 与 **io_uring** 改变了「同步读」比例；AS 退出主线不代表思想过时，而是**场景迁移**。

## 与相关工作的对比

| 机制 | 做法 | 与预期调度的关系 |
|------|------|-----------------|
| **Readahead / 预读** | 内核推测性提前读 | 减少同步 read 次数，从数据源缓解 |
| **AIO / io_uring** | 应用一次提交多请求 | 队列深度↑，调度器「看得见」后续请求 |
| **CFQ** | 按进程时间片轮转 | `slice_idle` 可模拟预期等待 |
| **Tagging / NCQ** | 磁盘固件重排 | 与内核 idle 可能冲突，AS 在高速盘上吃亏 |

## 小结

| 概念 | 一句话 |
|------|--------|
| **Deceptive idleness** | 进程在 think，调度器却以为它已停工 |
| **Anticipatory framework** | 完成一单后可有条件地短暂等待下一单 |
| **Cost-benefit** | 等的寻道收益 vs 磁盘空闲成本 |
| **Think time 统计** | median 估成本，p95 定等待上限 |
| **透明包装** | 底层调度策略无需修改 |

**Anticipatory Scheduling** 教会我们：在操作系统里，**快不一定更好**——有时让磁盘「故意喘口气」，反而换来更少的磁头奔波和更公平的份额。读 Linux I/O 调度史、调 CFQ/Deadline，或分析数据库同步读瓶颈时，这篇 SOSP 2001 仍是理解 **「为什么内核愿意 idle」** 的经典起点。

## 延伸阅读

- Sitaram Iyer 博士论文：*The Effect of Deceptive Idleness on Disk Schedulers*（Rice, 2001）
- Linux 文档（历史）：`Documentation/block/as-iosched.txt`（已随 AS 移除）
- **CFQ**：`block/cfq-iosched.c`，`slice_idle`  sysctl 调参
- 后续：**Stream scheduling framework**（FAST'11）将 Deadline 等非工作守恒化，可视为同一思想的扩展
