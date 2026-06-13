---
title: Autothrottle — 零基础学习笔记
来源: https://www.usenix.org/conference/nsdi24/presentation/wang-zibo
日期: 2026-06-13
分类: 基础设施
子分类: 云原生
provenance: pipeline-v3
---

# Autothrottle：给微服务装上一个"自动油门"

## 什么是 SLO？先从一个生活场景说起

你去餐厅吃饭，跟服务员说："我最多等 30 分钟。"——这 30 分钟就是你设定的 **SLO**（Service Level Objective，服务等级目标）。

如果餐厅超时了，你就给差评；如果提前上菜，你当然满意。餐厅老板的目标就是：在不超过 30 分钟的前提下，**尽量少雇人**（省 CPU），因为多雇一个人就多花一份工资。

这就是 SLO-Targeted Resource Management（面向 SLO 的资源管理）要解决的核心问题：**在保证用户体验不下降的前提下，尽可能减少云资源消耗。**

## 为什么微服务让这件事变得很难？

以前的程序是"单体应用"——所有功能写在一个程序里。资源不够？加机器就行，简单粗暴。

现在的程序是"微服务"——一个应用被拆成几十个甚至上百个小服务。比如"发朋友圈"这个功能：

```
用户发请求
  → 网关（Gateway）
    → 权限检查服务
      → 图片处理服务
        → 数据库写入服务
          → 通知服务（发消息给朋友）
```

每个服务就像一个餐厅里的不同工种：切菜的、炒菜的、端盘子的。它们各自的忙碌程度**完全不同**，也**不会**跟整体的"等餐时间"保持简单对应关系。

这就是 Autothrottle 论文要解决的核心困难：

1. 每个服务的资源使用模式千差万别（有的忙时忙死，有的闲时闲死）
2. 整体延迟（SLO）和单个服务的资源使用之间**没有强相关性**
3. 一个服务调整资源后，要等很久才能看到对整个应用延迟的影响（延迟反馈）

## Autothrottle 的核心思想：两层控制，像"空管系统"

Autothrottle 的解决思路非常优雅——**承认两层现实的存在，不强行把它们揉在一起**。

类比：机场的空管系统。

- **Tower（塔台）**：站在高处，看全局航班起降节奏，决定每架飞机大概的"起飞窗口"
- **Captain（机长）**：在驾驶舱里，根据塔台给的窗口，自己操控油门和方向

Autothrottle 也分两层：

| 层级 | 名称 | 职责 | 用什么"仪表盘" |
|------|------|------|----------------|
| 应用层 | Tower | 观察整体 RPS 和 P99 延迟，决定每个服务应该被"限制多少 CPU" | 端到端延迟、SLO 是否违反 |
| 服务层 | Captain | 在每个服务内部，把 CPU 调整到 Tower 给的"限制目标" | CPU throttle count（被限流的次数） |

两层之间传递的不是"你要分配多少 CPU"，而是一个更巧妙的指标：**CPU Throttle Ratio（CPU 限流比率）**。

### 什么是 CPU Throttle？

Linux 系统里有一个 cgroups 机制，给每个服务分配一个 CPU 配额（quota）。当服务在一段时间内用完了配额，它的请求就会"排队等待"——这就是被"限流"（throttled）。

```
时间线：[0ms --- 100ms CFS周期 --- 200ms]

假设服务在 60ms 时就耗尽了配额：
|====== 服务运行的 60ms ======|==== 被限流排队 40ms ====|
                              ^
                        从这里开始，后续请求被延迟
```

CPU Throttle Ratio 就是：被限流的次数 / 总时间周期数。

**为什么选它而不是 CPU 使用率？** 因为论文实验发现，CPU Throttle 与延迟的相关性远高于 CPU 使用率。一个服务可能 CPU 使用率只有 50%，但如果这 50% 集中在几个瞬间爆发，后面的请求就会被大量排队限流——这时候 Throttle Ratio 会很高，准确反映了服务质量在下降。

## Tower：用"上下文赌博机"做全局决策

Tower 是一个轻量级的在线学习控制器，它用的是 **Contextual Bandits（上下文赌博机）** 算法。

### 什么是 Contextual Bandits？

想象你去一家新餐厅，每次去都面临一个选择：点不同的菜。但你不知道哪道菜最好吃。

- 传统强化学习（RL）：要考虑今天吃什么会影响明天的口味偏好——太复杂
- 上下文赌博机：每次选择只影响这次的结果，不考虑长期影响——更简单、更实用

Tower 的每一轮决策只关心**当前这一分钟**，不试图预测未来的长期影响。这正是微服务场景所需要的——因为微服务之间的依赖太复杂，长期预测极不可靠。

Tower 的决策三要素：

```python
# Tower 的决策模型伪代码

class Tower:
    # 输入：上下文（Context）
    # 观察过去 1 分钟的应用 RPS（每秒请求数）
    def get_context(self, last_minute):
        context = last_minute.avg_rps
        return context

    # 输出：动作（Action）
    # 从一组预设的 throttle target 中选择
    # 默认有 9 个档位：0, 0.05, 0.1, ..., 0.35, 0.4
    def choose_action(self, context):
        # 上下文赌博机算法：根据历史经验
        # 选择在这个 RPS 下成本最低的 throttle target
        throttle_target = self.bandit_algorithm.select(context)
        return throttle_target

    # 反馈：成本（Cost）
    # SLO 满足 → 成本 = CPU 用量（归一化到 0-1）
    # SLO 违反 → 成本 = P99 延迟（归一化到 2-3，惩罚更重）
    def compute_cost(self, slo_met, cpu_usage, p99_latency):
        if slo_met:
            return normalize(cpu_usage, 0, 1)
        else:
            return normalize(p99_latency, 2, 3)

    # 每 1 分钟跑一次
    def run_step(self):
        context = self.get_context(last_minute)
        action = self.choose_action(context)
        cost = self.compute_cost(...)
        # 赌博机算法更新模型权重
        self.bandit_algorithm.update(context, action, cost)
```

### 为什么只有两层聚类？

一个应用可能有 28 到上千个服务。如果每个服务单独选 throttle target，组合爆炸（9^28 种可能），赌博机根本学不过来。

Autothrottle 的做法：用 K-Means 聚类把服务分成 2 类，每类共用一个 throttle target。这样动作空间从 9^28 缩小到 9^2 = 81 种——赌博机完全可以处理。

## Captain：在每个服务里快速调油门

Captain 是一个基于启发式的本地控制器，它收到 Tower 的 throttle target 后，持续微调服务的 CPU 配额。

### Captain 的两条控制回路

```
                    测到的 Throttle Ratio 高于目标？
                           │
                    ┌──────┴──────┐
                   是             否
                   │               │
           乘性扩容           瞬时缩容
           (multiplicative   (instantaneous
            scale-up)         scale-down)
```

**扩容（CPU 不够用了）**：

```python
# Algorithm 1: Captain 扩容逻辑（每 N=10 个 CFS 周期执行一次）

def captain_scale_up(quota, throttle_ratio, throttle_target, alpha=1.2):
    """
    如果测到的限流比率超过阈值(alpha * target)，就加大 CPU 配额。
    使用乘性增长：配额 = 配额 * (1 + throttle_ratio - alpha * target)
    差距越大，增长越猛——因为积压的请求越多。
    """
    margin = max(0, margin + throttle_ratio - throttle_target)

    if throttle_ratio > alpha * throttle_target:
        # 乘性扩容：差距越大，扩得越多
        new_quota = quota * (1 + throttle_ratio - alpha * throttle_target)
        quota = new_quota
    else:
        # 瞬时缩容：用历史使用量快速回收多余 CPU
        history = get_cpu_usage_history(last_M=50, cfs_periods)
        proposed = max(history) + margin * stdev(history)

        # 只在缩容幅度合理时才执行
        if proposed <= beta_max * quota:
            quota = max(beta_min * quota, proposed)

    return quota
```

**缩容（CPU 有余量）**：

Captain 维护一个最近 50 个 CFS 周期的 CPU 使用量滑动窗口。当 throttle ratio 低于目标时，说明 CPU 给多了，直接根据历史数据估算真实需求，一步到位地缩减配额——不需要像扩容那样慢慢探。

**回滚机制（万一缩过头了怎么办？）**：

```python
# Algorithm 2: Captain 回滚机制

def rollback_if_reckless(last_quota, new_quota, throttle_ratio,
                          throttle_target, alpha=1.2, N=10):
    """
    每次缩容后，接下来 N 个周期内持续监控。
    如果发现 throttle_ratio 超过阈值，说明缩过头了——
    立即恢复到缩容前的配额，并且多给一些余量。
    """
    throttle_ratio = throttle_count_since_scale_down / N

    if throttle_ratio > alpha * throttle_target:
        # 回滚：恢复到上一次配额 + 差额
        quota = last_quota + (last_quota - new_quota)
        margin += throttle_ratio - throttle_target
```

扩容只会浪费钱（云应用本来就过度配置），但缩容过头会导致 SLO 违反——直接影响用户。所以回滚机制至关重要。

## 两层怎么协作？完整流程

```
时间轴（以 1 分钟为一个大周期）：

第 0 分钟：Tower 观察到 RPS = 500
  → 赌博机算法决定：给 A 类服务 throttle target = 0.1
  → 给 B 类服务 throttle target = 0.15

第 1 分钟：每个服务的 Captain 收到 target
  → Captain 监控 throttle ratio
  → 如果高于 target → 乘性扩容
  → 如果低于 target → 瞬时缩容

第 2 分钟：Tower 收到反馈
  → 收集各服务的 CPU 用量和全局 P99 延迟
  → 计算 cost
  → 更新赌博机模型

循环往复...
```

关键设计：Tower 每 1 分钟才更新一次 target，给 Captain 充足的调整时间和尾部延迟数据采样时间。这让 Tower 的决策变成"一步决策"，大大简化了学习难度。

## 论文实验结果

在三个微服务应用上测试（Train-Ticket 28 个服务、Social-Network 28 个服务、Hotel-Reservation 21 个服务）：

| 对比基线 | Autothrottle 的 CPU 节省 |
|----------|--------------------------|
| 最优启发式基线 | 最多节省 26.21% |
| 所有基线对比 | 最多节省 93.84% |
| 生产环境 21 天真实负载 | 节省 35.2 个 CPU 核，SLO 违规减少 13.2 倍 |

## 为什么这个方法比 ML 预测更实用？

论文提到 Sinan（另一个基于深度学习的资源管理方案）训练一个 28 服务应用的模型需要 14 小时 + 6 小时数据收集。部署后预测错误还会导致 40% 以上的过度分配。

Autothrottle 的 Contextual Bandit 几乎不需要离线训练，直接在线学习。每次决策只花一分钟——**简单、实用、部署快**，这就是它"Practical"（务实）的含义。

## 核心概念速查

| 概念 | 一句话解释 |
|------|-----------|
| SLO | 对用户体验的承诺（如 P99 延迟 < 200ms） |
| CPU Throttle | 服务用完了 CPU 配额后被调度器强制暂停的次数 |
| CPU Throttle Ratio | 被限流的周期数 / 总周期数，衡量 CPU 是否吃紧 |
| Tower | 应用层全局控制器，用 Contextual Bandit 学习最优 throttle target |
| Captain | 服务层本地控制器，启发式调整 CPU quota |
| Contextual Bandit | 轻量级在线学习算法，每次决策只考虑当前一步 |
| 两层解耦 | 应用层看 SLO 反馈，服务层看本地指标，中间用 throttle target 桥接 |

## 一个思考题

想象你在运营一个短视频 App，有"视频加载"、"推荐计算"、"评论接口"三个服务。晚高峰 RPS 从 1000 飙升到 10000。

Tower 会怎么调整？Captain 们又会分别做什么？欢迎带着你的想法继续深入读论文的第 5 节（实验）和第 6 节（相关工作和讨论）。
