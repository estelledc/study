---
title: Anticipatory Scheduling — 用「稍等一下」治好磁盘调度的误判空闲
来源: 'Sitaram Iyer & Peter Druschel, "Anticipatory Scheduling: A Disk Scheduling Framework to Overcome Deceptive Idleness in Synchronous I/O", SOSP 2001'
日期: 2026-06-13
分类: 操作系统
子分类: 内核与虚拟化
难度: 初级
provenance: pipeline-v3
---

## 是什么

想象图书馆只有一台自助借书机（磁盘），小明借完一本书，转身走两步到相邻书架再借下一本——中间只花 2 秒。但管理员是"工作守恒"型：上一人刚还书，机器一空，立刻叫下一位。小明的下一本书还没到来，管理员已经让小红刷卡了。小红要的书在库房另一头，机器大老远跑一趟。等小明回来，还得等小红办完——**本该连续的两次邻近借书，被一次无谓的「换人」打断**。

如果管理员学会一句：**「刚办完的那位，稍等 3 秒，看他会不会马上再来」**——小明往往能在等待窗口内提交下一单，两次借阅落在同一片区，机器少走很多冤枉路。磁盘短暂空闲几秒，总吞吐反而上去。

这就是 **Anticipatory Scheduling（预期调度）** 的直觉：应用在做同步读盘时——`read()` 阻塞到数据进内存，算几毫秒，再发下一发 `read()`——两次请求之间的"计算间隔"让调度器误以为该进程已经空闲。调度器立刻把磁头派去服务别的进程，结果磁盘刚跑远，原进程的下一次 `read()` 又来了，磁头再跑回来。论文把这种误判叫 **deceptive idleness（欺骗性空闲）**。

作者 Iyer 与 Druschel（Rice 大学）在 SOSP 2001 上发表这篇 13 页论文，提出：**故意不让磁盘立刻接下一单**，给它短暂喘口气——如果原进程在这个窗口内提交了下一请求，磁头就不必跑远路。这套框架在 FreeBSD 4.3 上实现（约 1500 行 C），对 Apache 吞吐提升高达 71%。

## 为什么重要

不理解欺骗性空闲和预期调度，下面这些现象就没法解释：

- 为什么同一块磁盘，跑 Apache 时吞吐忽高忽低——多进程交替同步读，工作守恒调度器反复把磁头拽来拽去，性能差距可达 70%
- 为什么 Linux 2.6 内核专门加了一个叫 AS（Anticipatory Scheduler）的 I/O 调度器，又为什么在 2.6.33 被移除——硬件演进（NCQ、NVMe）改变了"预期等待"的前提
- 为什么 CFQ 调度器里有一个叫 `slice_idle` 的参数——它就是"预期等待"的思想后代，允许调度器在一个进程的时间片用完后再等几毫秒
- 为什么数据库的同步读瓶颈不是"磁盘太慢"而是"调度太急"——在并发 OLTP 场景下，过早切换进程比磁盘转速更影响吞吐

## 核心要点

1. **欺骗性空闲：调度器看到的队列不等于应用的真实意图**。类比：你在 ATM 取完钱，转身把卡放进钱包（2 秒），再插卡取第二笔。ATM 在你"转身"的瞬间看到队列空了，就让下一个人先上——但你其实马上还要用。同步 I/O 的 `read() → 计算 → read()` 循环就是这种情况。进程不是在空闲，只是在两次 I/O 之间的"think time"里。

2. **非工作守恒的外壳：不替换底层调度器，只给它加一个"等待门卫"**。工作守恒（work-conserving）是经典调度铁律——只要队列不空，磁盘就不该闲着。预期调度打破了这一条：在完成一个请求后，即使队列里还有别人的请求，也**可以有条件地等待几毫秒**。这个等待不是盲目的——下一条详细讲怎么决策。

3. **成本–收益分析决定"等不等、等多久"**。等待的收益是省下的寻道距离（原进程下一请求离磁头很近），等待的成本是磁盘空转的时间（≈ 进程的历史 think time 中位数）。论文为每个进程维护 think time 的衰减统计（中位数估成本、95 分位定等待上限），只有当预期收益大于成本时才等待。对比例份额调度器，决策依据变成"该进程份额是否未用尽 + think time 是否够短"。

## 实践案例

### 案例 1：工作守恒 vs 预期调度——寻道距离对比

两个进程，小明读磁道 100/102/104（邻近），小红读 900/902（远处）。模拟两种策略的总寻道距离：

```python
from dataclasses import dataclass

@dataclass(order=True)
class Req:
    track: int
    pid: int

# alice: tracks [100, 102, 104]; bob: [900, 902]
queue = [Req(100, 1), Req(900, 2)]
head = 50

# work-conserving: 完成一个立刻选全局最近
# 结果: alice 读完 100 → bob(900) 被选中（因为 900 比 alice 的下一单 102"更早"出现在队列里）
# 磁头: 50→100(seek 50)→900(800)→102(798)→902(800)→104(798) = 总计 3246

# anticipatory: 完成 alice 的 100 后短暂等待，等 alice 的 102 入队再服务
# 磁头: 50→100(50)→102(2)→104(2)→900(796)→902(2) = 总计 852
```

**逐部分解释**：工作守恒在 alice 读 100 完成的瞬间，队列里只有 bob 的 900——alice 的 102 还在"计算间隔"里。调度器被迫选 900，磁头跑了远路。预期调度多等了几毫秒，alice 的 102 就入队了，磁头几乎原地不动。**让磁盘"喘口气"，总寻道距离从 3246 降到 852**。

### 案例 2：论文的成本–收益公式 —— 用 Python 实现等待决策

论文 §3 给出寻道优化型调度器的等待判定公式：

```python
from dataclasses import dataclass

@dataclass
class ProcStats:
    median_think_ms: float    # 中位 think time（成本项）
    p95_think_ms: float       # 95 分位 think time（等待上限）

def should_wait(best_seek_ms: float, next_seek_ms: float, stats: ProcStats) -> float:
    """
    best_seek_ms: 当前队列里"最佳候选人"的寻道代价
    next_seek_ms: 刚被服务进程预期下一请求的寻道代价
    stats:       该进程的历史 think time 统计
    返回: 等待时长（ms），0 表示不等待
    """
    benefit = best_seek_ms - next_seek_ms   # 等待能省多少寻道
    cost = stats.median_think_ms             # 等待的代价（磁盘空转）
    if benefit > cost:
        return stats.p95_think_ms            # 等到 95 分位
    return 0.0

# best 在 800 磁道外（8ms 寻道），next 预期在相邻磁道（1ms），进程 think 约 2ms
s = ProcStats(median_think_ms=2.0, p95_think_ms=5.0)
print(should_wait(8.0, 1.0, s))  # 5.0 → 等！benefit=7 > cost=2
print(should_wait(8.0, 7.5, s))  # 0.0 → 不等。benefit=0.5 < cost=2
```

**逐部分解释**：这就是 AS 调度器决策的心跳。`benefit > cost` 时才等待，防止"盲等等到吞吐下降"。`p95_think_ms` 做等待上限——95% 的情况下下一请求会在此窗口内到达。Linux 内核里对应的是 `as_antic_waitnext()` 函数，读取 `aic->ttime_mean`（衰减平均 think time）做同样的判断。

### 案例 3：Linux 2.6 的 AS 调度器——在 /sys 里你能看到什么

（历史信息——AS 在 2.6.33 已移除，但你仍能在旧内核或文档里见到这套接口）

```bash
# 查看当前用的 I/O 调度器
cat /sys/block/sda/queue/scheduler
# 输出类似: noop [deadline] cfq  （方括号=当前选中）

# 切换到 AS（仅 2.6.0–2.6.18）
echo anticipatory > /sys/block/sda/queue/scheduler

# AS 的核心可调参数（单位：ms）
cat /sys/block/sda/queue/iosched/antic_expire     # 等待超时（默认 ~6ms）
cat /sys/block/sda/queue/iosched/read_expire       # 读请求截止时间
cat /sys/block/sda/queue/iosched/read_batch_expire # 读批次超时
```

**逐部分解释**：`antic_expire` 就是前面说的"等待上限"——调度器最多等你这么久，时间到了还没见到原进程的下一请求，就切换去服务别人。`read_expire` 是另一层保护：不能让读请求无限等待（即使预期调度在生效），超过这个时间就必须处理。这些参数的存在说明了一个权衡：**预期等待是概率下注，不是保证**。

## 踩过的坑

1. **在 NCQ/TCQ 硬件上预期等待反而降性能**：硬盘自己的命令队列已经在做重排，内核再加一层等待会与固件的重排逻辑冲突，磁头多空转。这就是 Linux 2.6.33 移除 AS 的核心原因——SATA NCQ 普及后 AS 的前提不再成立。

2. **等待时长选错了会吃掉全部收益**：如果 `antic_expire` 设太大（比如 50ms），等待期间的磁盘空转会超过省下的寻道时间。论文强调 wait duration 必须**小于平均 seek time**，否则得不偿失。

3. **think time 统计对突发型应用不准**：如果进程平时 think 1ms，偶尔 think 100ms（GC、缺页），单靠中位数和 95 分位不够。内核 AS 加了 `exit_probability` 机制——如果进程长期不见人影，逐渐降低对它的预期。

4. **预期调度只管同步读，异步写不适用**：异步写请求由内核 pdflush 线程批量提交，不存在 "read→compute→read" 的间隔模式。对异步写开预期等待纯属浪费。CFQ 后来用 `slice_sync` 和 `slice_async` 分开处理正是吸取了这个教训。

## 适用 vs 不适用场景

**适用**：

- 多进程同步读并发（Apache 服务静态文件、数据库 OLTP 查询、文件搜索）
- 机械硬盘（HDD）——寻道是性能瓶颈，省一次寻道就省几毫秒
- 调度器有 per-process 统计能力——需要追踪每个进程的 think time 和寻道位置
- 应用不改代码、不换文件系统场景——预期调度对应用层完全透明

**不适用**：

- NVMe SSD / 高端 SCSI 带深度硬件队列（NCQ/TCQ）——设备已做重排，内核等待是画蛇添足
- 纯随机读（每个请求都落到不同区域）——等待也等不来局部性
- 纯异步写 / 大块顺序 I/O——同步读的 think time 间隔不存在
- 实时系统——预期等待引入的延迟不可控

## 历史小故事（可跳过）

- **2001 年**：Iyer 与 Druschel 在 SOSP 发表论文，在 FreeBSD 4.3 上实现原型，Apache 吞吐 +71%。这是第一篇系统性地论证"非工作守恒磁盘调度"的顶会论文。

- **2002 年**：Nick Piggin 为 Linux 2.5 开发 AS（Anticipatory Scheduler）调度器，基本照搬论文框架。2.6.0 发布时 AS 成为**默认 I/O 调度器**，直到 2.6.18。

- **2003–2005 年**：CFQ（Completely Fair Queueing）出现。Jens Axboe 在 CFQ 里加入了 `slice_idle`——按进程时间片轮转后短暂等待同一进程的下一请求——思想上直接继承自 AS。

- **2008 年**：SATA NCQ 普及。AS 在带硬件队列的盘上性能倒退。内核邮件列表展开长讨论——"是硬件变了还是 AS 的设计前提有误？"

- **2010 年（2.6.33）**：AS 调度器从 Linux 主线**正式移除**。社区共识：tuned CFQ + Deadline 已能覆盖 AS 的主要场景。但每当你调 CFQ 的 `slice_idle` 时，你都在用这篇 2001 年论文的思想。

## 学到什么

1. **调度器看到的队列不等于应用的真实意图**——同步 API 把"未来请求"藏在 think time 里，任何 work-conserving 策略都可能被欺骗。这是调度理论里一个反直觉但极重要的洞察。

2. **有时"故意慢一点"比"永远最快"更好**——预期调度是一种非工作守恒策略，用短暂的磁盘空闲换取大幅减少的寻道开销。操作系统里很多"矛盾"设计（惰性分配、copy-on-write、延迟写回）都是同一哲学的不同应用。

3. **硬件的演进会改变算法的前提**——AS 在 IDE 硬盘上大放异彩，在 NCQ/SSD 上变成累赘。好的系统设计会区分"想法"和"实现"：非工作守恒等待这个想法是永恒的，具体等多久、什么时候等则必须随硬件而变。

4. **顶会论文的思想生命周期可以比代码实现长得多**——AS 代码在 2.6.33 删了，但"预期等待"活在 CFQ 的 `slice_idle` 里、mq-deadline 的调参里、乃至数据库 I/O 调度器的设计里。

## 延伸阅读

- 论文原文：[Anticipatory Scheduling: A Disk Scheduling Framework (SOSP 2001)](https://www.cs.rice.edu/~druschel/publications/anticipatory.pdf)
- Linux 内核文档（历史）：`Documentation/block/as-iosched.txt`（描述了 AS 调度器的所有可调参数）
- Jens Axboe 的 [Linux Block IO 介绍](https://lwn.net/Articles/408443/)——CFQ 怎么继承了 AS 的"预期等待"思想
- Sitaram Iyer 博士论文：*The Effect of Deceptive Idleness on Disk Schedulers*（Rice, 2001）
- 后续工作：[Stream Scheduling Framework (FAST 2011)](https://www.usenix.org/conference/fast-11)——将非工作守恒思想扩展到 Deadline 等调度器

## 关联

- [[cfq]] —— CFQ 的 `slice_idle` 是预期等待的直接后代，按进程时间片轮转后在 slice 末尾短暂等待
- [[nvme]] —— NVMe 多队列和超低延迟改变了"预期等待"的前提，调度逻辑从内核移到设备
- [[io-uring]] —— io_uring 让应用一次提交多个 I/O 请求，从源头减少"syncread→compute→syncread"模式
- [[bpf]] —— eBPF 可以追踪 per-process I/O think time，是 AS 统计思想的现代观测工具
- [[linux-kernel-map]] —— Linux I/O 栈全景：bio 层 / 调度器 / 块设备驱动，预期调度坐在调度器这一层
- [[the-unix-philosophy]] —— 机制 vs 策略的分离——AS 提供了"非工作守恒等待"的机制，策略留给各个启发式插件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
