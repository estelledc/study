---
title: What Really Happened on Mars Pathfinder — 优先级反转与火星探路者重启事故
来源: https://www.cs.unc.edu/~anderson/teach/comp790/papers/mars_pathfinder_long_version.html
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一家**只有一位前台**的银行（单核 CPU），三类客户按优先级排队：

| 客户 | 优先级 | 在干什么 |
|------|--------|----------|
| **总账会计**（bc_dist） | 高 | 每 125ms 必须把上一窗口的流水入账，否则整栋楼报警 |
| **大堂经理**（bc_sched） | 最高 | 到点检查会计是否做完；没做完就拉响**全楼断电重启** |
| **气象员**（ASI/MET） | 低 | 偶尔来登记天气数据，登记时要拿**唯一一本登记簿**（互斥锁） |
| **一堆普通业务**（通信、成像等） | 中 | 平时占着前台办杂事 |

某天气象员刚拿起登记簿、字还没写完，就被普通业务挤走了（**抢占**）。总账会计这时也要往登记簿里写数据，只好在窗口外干等。普通业务优先级比气象员高，一直占着前台，气象员永远回不来交还登记簿——总账会计也就一直卡住。大堂经理一到点就发现会计超时，**整栋楼重启**。

这就是 1997 年 **NASA 火星探路者（Mars Pathfinder）** 在火星表面反复「死机重启」的根因：**优先级反转（priority inversion）**。不是宇宙射线、不是硬件坏了，而是商用实时操作系统 **VxWorks** 里一个 `select()` 互斥量**没开优先级继承**。

权威一手叙述来自 JPL 飞控软件负责人 **Glenn E. Reeves** 的邮件（1997-12-15），Mike Jones 在 IEEE RTSS 上转述了 Wind River CTO David Wilner 的演讲；UNC 页面收录的是 Reeves 的完整版。

## 这篇材料在说什么

| 维度 | 内容 |
|------|------|
| 任务 | Mars Pathfinder（1997）着陆器 + Sojourner 漫游车 |
| 飞控 CPU | IBM RS6000 单核，运行 Wind River **VxWorks** |
| 总线 | **MIL-STD-1553** @ 8 Hz，连接气象仪 ASI/MET、雷达、加速度计等 |
| 故障现象 | 周期性**整机 reset**；已采集数据不丢，但当天剩余科学计划推迟到次日 |
| 根因 | `select()` / `pipe()` IPC 路径上的 mutex **未启用 priority inheritance** |
| 修复 | 修改全局配置，为 `selectLib` 创建的 semaphore 打开继承；经充分测试后**远程打补丁**上星 |
| 诊断用时 | 实验室内 **< 18 小时**复现；依赖预留的 trace/log 设施 |

一句话：**硬实时系统里，高优先级任务被低优先级任务间接阻塞，是教科书级事故，也是「买 COTS、必须读懂内核默认项」的警示牌。**

## 硬件与软件架构（简化）

```
                    ┌─────────────────┐
                    │  RS6000 + VxWorks │
                    └────────┬────────┘
                             │ VME
              ┌──────────────┼──────────────┐
              │              │              │
         无线电/相机    1553 接口卡    其他 I/O
                             │
                    ┌────────┴────────┐
                    │   MIL-STD-1553    │
                    └────────┬──────────┘
              ┌──────────────┴──────────────┐
         巡航段设备                    着陆器设备
                                    (ASI/MET 气象)
```

1553 总线由两个任务协作，周期 **0.125 s（8 Hz）**：

1. **bc_sched**（最高优先级之一）：为本周期安排 1553 事务  
2. **bc_dist**（第三高）：收集事务结果，写入双缓冲共享内存  

大多数仪器走共享内存；**ASI/MET 例外**——通过 **VxWorks `pipe()` + `select()`** 做 IPC。事故就出在这条路上。

典型时间线（非按比例）：

```
|<-------- 0.125 s 总线周期 -------->|
|****| bc_dist 活跃 |**| bc_sched |****|
t1 硬件启动总线     t2 数据就绪    t4 调度下一周期
```

`bc_sched` 与 `bc_dist` **互相检查**对方是否在本周期内完成；`bc_sched` 发现 `bc_dist` 超时 → 触发 reset。

## 核心概念一：抢占式固定优先级调度

VxWorks 使用**抢占式、基于优先级的调度**：就绪队列里优先级最高的任务立刻运行；高优先级任务就绪时会打断低优先级任务。

Pathfinder 上任务优先级（从高到低，节选）：

| 任务 | 角色 |
|------|------|
| tExec | VxWorks 内核执行体 |
| bc_sched | 1553 总线调度 |
|  entry/landing 相关 | 着陆阶段 |
| bc_dist | 1553 数据分发 |
| 成像、压缩、通信等 | 中等优先级科学/工程任务 |
| ASI/MET | 气象数据采集，**低优先级** |

设计假设：bc_dist 能在每个 8 Hz 窗口内跑完。但假设没考虑**锁上的优先级反转**。

## 核心概念二：优先级反转

**定义**：高优先级任务 H 等待低优先级任务 L 持有的资源；与此同时，一个或多个**中优先级**任务 M 抢占 L，使 L 无法释放资源，从而间接阻塞 H——尽管 M 的优先级既低于 H 又可能高于 L。

经典三层结构（Mars Pathfinder 版）：

```
H = bc_dist（高，等 mutex）
L = ASI/MET（低，持 mutex 或被抢占在 semGive 中途）
M = 多个中等任务（持续运行，不让 L 进展）
```

Mike Jones 在 RTSS 演讲里用的**气象 / 通信**叙事是同一类现象的通俗版；Reeves 邮件给出了**精确调用栈**。

### 事故链（Reeves 原文技术路径）

1. ASI/MET 调用 `select()` → `pipeIoctl()` → `selNodeAdd()`，正在 `semGive()` 归还 mutex 时被**抢占**，`semGive` **未完成**  
2. 多个中等优先级任务运行  
3. bc_dist 通过 IPC 调用 `pipeWrite()`，需要同一 mutex，**阻塞**  
4. 中等任务继续跑，ASI/MET 仍得不到 CPU  
5. bc_sched 唤醒，发现 bc_dist 未完成本周期 → **reset**

mutex 来自 VxWorks **`select()` 机制**：为保护「等待列表」上的文件描述符而创建的互斥信号量；`pipe()` 支持 `select`，Pathfinder 的 IPC 基于 pipe。

## 核心概念三：优先级继承（Priority Inheritance）

**基本想法**：当高优先级任务 H 因等待低优先级任务 L 持有的 mutex 而阻塞时，**临时提升 L 的优先级到 H 的级别**（或不低于阻塞链上最高者），直到 L 释放锁。这样 M 无法长期压住 L，H 能较快继续。

VxWorks 创建 mutex 时可传选项 **`SEM_PRIO_INHERIT`**（具体宏名随版本略有差异）。Pathfinder 上 `selectLib` 默认创建的 semaphore **没有**打开该选项——Wind River 为性能默认关闭；JPL 在别处手动创建的信号量有保护，**唯独漏了 select 内部这一条路径**。

### 示例 1：用伪代码复现「三层反转」

下面不是 Pathfinder 源码，而是把 Reeves 描述抽象成可读的最小模型：

```c
/* 优先级：SCHED=100, HIGH=80, MED=50, LOW=10 */
sem_t bus_mutex;   /* 未开启优先级继承 */

void asi_met_task(void) {
    for (;;) {
        sem_wait(&bus_mutex);      /* L 持有锁 */
        register_fd_in_select();   /* 等价于 selNodeAdd / 未完成 semGive 就被抢占 */
        sem_post(&bus_mutex);
        collect_weather();
    }
}

void bc_dist_task(void) {
    for (;;) {
        wait_for_1553_cycle();
        sem_wait(&bus_mutex);      /* H 阻塞：L 持锁或卡在临界区 */
        pipe_write_met_data();
        sem_post(&bus_mutex);
        signal_cycle_done();
    }
}

void medium_science_task(void) {
    for (;;) {
        do_imaging_or_comm();      /* M：优先级 50，一直占 CPU */
    }
}

void bc_sched_task(void) {
    for (;;) {
        sleep_until_next_8hz_tick();
        if (!bc_dist_finished_this_cycle())
            spacecraft_reset();    /* 看门狗式硬失败 */
    }
}
```

若 `bus_mutex` 无继承：M 跑时 L 无法前进，H 永远等不到锁 → `bc_sched` 判定失败 → reset。

### 示例 2：VxWorks 风格——错误 vs 正确创建 mutex

```c
#include <semLib.h>

/* 错误：select 内部默认类似这样创建 —— 无 PRIORITY INHERITANCE */
SEM_ID bad = semMCreate(SEM_Q_PRIORITY | SEM_INVERSION_SAFE_OFF);
/* 注：实际 selectLib 用全局 options；此处仅示意「选项未包含继承」 */

/* 正确：JPL 最终对 select 相关 semaphore 启用的方向 */
SEM_ID good = semMCreate(SEM_Q_PRIORITY | SEM_INVERSION_SAFE);
/* 或 semMCreate(..., SEM_PRIO_INHERIT) 视 VxWorks 版本文档而定 */

void high_task(void) {
    semTake(good, WAIT_FOREVER);   /* 若 low 持锁，low 临时升到 high 的优先级 */
    critical_section();
    semGive(good);
}
```

Reeves 写道：Wind River 为 `select` 服务提供了**未充分文档化**的全局变量，可改 `semMCreate` 的 `options`，使之后创建的 select semaphore 带继承；**无法**只改 bc_dist–ASI/MET 那一根 pipe 的锁，只能全局改——团队做了影响分析与全系统测试后才上星。

## 他们怎么找到的

飞控软件保留了实验室内用的 **trace/log**（环形缓冲），可对 pipe、msgQ、中断、`select`、tExec 等插桩——遵循 **「test what you fly, fly what you test」**，不是侥幸留后门。`bc_sched` 在检测到该错误时本来就会停 trace 并 dump（天上无法传全量 dump，但地上 replica 可以）。

JPL 在**与飞船同配置的复制品**上反复跑任务组合；**不到 18 小时**复现 reset，trace 一眼看出 priority inversion。

Mike Jones 版本补充：工程师通宵跑，最后只剩一人时终于复现——说明这是**低概率、负载相关**的竞态，不是每次开机必现。

## 他们怎么修的（约 1 亿英里外）

- **不是**在天上开 VxWorks shell 改选项（虽然 shell 在飞船上可用）  
- 使用专门的 **binary patch / diff 上注**流程：地面算好与 onboard 映像的差异，经校验软件写入  
- 飞控保留**两份可写软件映像**，打补丁时始终保留一份干净副本以防万一  

Wind River 分析后认为：开启继承后性能影响很小；且只要每个 fd 上**最多一个任务在 select 等待**（Pathfinder 满足），`select()` 语义不变。

## 为什么发射前没抓到

| 因素 | 说明 |
|------|------|
| 触发条件苛刻 | 需 ASI/MET 采集中 + 中间任务**高负载**同时发生 |
| 测试偏向「标称最好情况」 | 地面试验未覆盖「比预期更好的科学数据率」 |
| 着陆前见过一次 | 未能稳定复现，优先级排在着陆软件之后 |
| 系统设计容错 | 团队**预期**可能 reset，有恢复机制，故列为较低优先级 issue |

Reeves 强调：这不是忽视 bug，而是**时间不够**；且 reset 后数据可恢复、任务可续，优先级判断在任务压力下是理性的——但事故仍成为RTOS 教材永恒案例。

## 与理论文献的关系

优先级反转与继承早在 **Sha, Rajkumar, Lehoczky (1990)** 等实时系统文献中形式化；**Liu & Layland (1973)** 的 RM 调度假设任务独立——一旦共享 mutex，独立假设被打破，就必须额外协议（继承、优先级天花板 protocol、无锁设计等）。

Pathfinder 案例的价值在于：**真实航天器 + COTS RTOS + 具体 API 路径（select/pipe）**，把抽象定理钉在调用栈上。

## 可带走的工程教训

1. **COTS 默认不等于任务安全**：性能导向的默认（关闭继承）在别的子系统里开了、在 select 路径上漏了，就会炸。  
2. **IPC 与「看起来无害」的库函数**（`select`）也要纳入锁审计。  
3. **可观测性要随飞**：trace、shell、可 patch 映像不是奢侈，是远程调试前提。  
4. **低概率 ≠ 可忽略**：火星上科学活动比预期更忙，把「小概率路径」放大成每日 reset。  
5. **修复要全链路验证**：全局改 semaphore 行为前，Wind River + JPL 联合做了语义与性能分析。

## 进一步阅读

| 资料 | 链接/说明 |
|------|-----------|
| Reeves 权威长文（本篇来源） | [mars_pathfinder_long_version.html](https://www.cs.unc.edu/~anderson/teach/comp790/papers/mars_pathfinder_long_version.html) |
| Mike Jones 短版（RTSS 转述） | [mars_pathfinder_short_version.html](https://www.cs.unc.edu/~anderson/teach/comp790/papers/mars_pathfinder_short_version.html) |
| Dr. Dobb's / Glenn Reeves 访谈 | Priority Inversion: How We Found It, How We Fixed It (1999) |
| 风险组 Risks 讨论 | Duke `mars.html` 镜像 |

## 自测题

1. 画出 H、M、L 三方在 mutex 上的时序，说明为何 H 会被 M 间接阻塞。  
2. 若只为 bc_dist–ASI/MET 的 pipe 单独加继承不可行，JPL 实际采用了什么粒度？  
3. `bc_sched` 发现 `bc_dist` 超时后为什么选择 **reset** 而不是仅记录日志？这与 8 Hz 硬实时约束有何关系？  
4. 除优先级继承外，还能用哪些手段避免此类反转？（提示：优先级天花板、减少共享、无锁队列、把 ASI/MET 也改成双缓冲共享内存。）

---

*笔记基于 Glenn Reeves 1997 邮件与公开技术报道整理，面向零基础读者；代码示例为教学抽象，非 JPL 飞控源码。*
