---
title: The Tail at Scale — 尾延迟会被规模放大
来源: 'Jeffrey Dean, Luiz André Barroso, "The Tail at Scale", Communications of the ACM 2013'
日期: 2026-07-09
分类: 系统设计
难度: 中级
---

## 是什么

The Tail at Scale 讲的是：**在大规模在线服务里，平均延迟不够看，最慢那一小撮请求会决定用户体验**。

日常类比：你和 100 个同学一起点团餐，食堂说“平均 10 分钟出餐”。这句话没用，因为你必须等 100 份餐都到齐才能开会。只要其中 1 份被卡住，全场都被拖慢。

系统里也一样。一个搜索请求可能被拆成几百个小请求，分别发到不同机器查索引、读存储、算特征，再合并成最终结果。

单台机器偶尔慢一下，在小系统里只是小瑕疵；到几百上千台机器一起参与时，偶尔慢会被放大成“几乎每次都有地方慢”。

这篇论文的核心不是“让每台机器永远不慢”，而是承认大系统一定会有抖动，然后用复制、备份请求、排队策略和降级策略，把整体服务做成 tail-tolerant。

## 为什么重要

不理解 The Tail at Scale，下面这些事都解释不清：

- 为什么线上服务看平均延迟很漂亮，用户还是会抱怨“偶尔特别卡”
- 为什么大规模系统经常盯 P95 / P99 / P99.9，而不是只盯平均值
- 为什么复制副本不只是为了容灾，也能用来减少尾延迟
- 为什么“多发一个备份请求”既可能救体验，也可能把系统压垮

一句话：**系统设计不是只追最快路径，而是在资源成本、用户体验、吞吐和稳定性之间做取舍**。

## 核心要点

The Tail at Scale 可以拆成 **三个判断**：

1. **规模会放大尾部**：类比一队人过安检，一个人卡住就会拖住整队。单机 1% 慢，在 100 个并行子请求里就可能变成 63% 的用户请求慢。

2. **消灭波动不现实，要容忍波动**：类比城市交通，不可能让每条路永远不堵，但可以有绕路、潮汐车道和信号灯。论文把这种思路叫 tail-tolerant：用软件机制把不稳定部件拼成稳定整体。

3. **每个优化都有代价**：类比叫车时同时叫两辆车，谁先到坐谁，体验会变好，但会浪费司机资源。hedged requests 和 tied requests 也是这样：少量额外请求换更短尾延迟，关键是控制额外负载。

这三个判断合起来，形成一种系统设计习惯：先问“慢请求从哪里来”，再问“这次要用多少成本去遮住它”。

## 实践案例

### 案例 1：fan-out 为什么会放大尾延迟

```python
single_slow_prob = 0.01
fanout = 100
service_slow_prob = 1 - (1 - single_slow_prob) ** fanout
print(round(service_slow_prob, 2))  # 0.63
```

**逐部分解释**：

- `single_slow_prob = 0.01` 表示单个叶子请求有 1% 概率特别慢
- `(1 - single_slow_prob) ** fanout` 表示 100 个叶子请求都不慢的概率
- `1 - ...` 表示“至少一个慢”的概率，结果约等于 63%
- 所以平均值没变坏，用户看到的整体请求却大量变慢

### 案例 2：hedged request 怎么换取尾延迟

```python
def read_with_hedge(primary, backup, key):
    r1 = primary.read(key)
    if not r1.done_after_ms(10):
        r2 = backup.read(key, priority="low")
        return first_finished(r1, r2)
    return r1.result()
```

**逐部分解释**：

- 先发主请求，避免一开始就把每个请求复制两份
- 超过 10ms 还没返回，才向副本发低优先级备份请求
- 谁先返回就用谁的结果，同时取消另一个请求
- 论文里读取 1000 个 BigTable key 的实验，P99.9 从 1800ms 降到 74ms，额外请求只有约 2%

### 案例 3：tied request 为什么比盲目复制更省

```python
def tied_read(a, b, key):
    token = new_cancel_token()
    a.enqueue(key, token, peer=b)
    sleep_ms(1)
    b.enqueue(key, token, peer=a)
    return first_started_or_finished(a, b, token)
```

**逐部分解释**：

- 两个副本队列里放同一个请求，但带上同一个取消标记
- 某个副本真正开始执行时，立刻通知另一个副本取消排队中的副本
- `sleep_ms(1)` 用很小延迟降低“两边同时开跑”的概率
- 论文的 BigTable 读实验里，tied request after 1ms 让 P99 延迟从 67ms 降到 42ms，磁盘额外开销小于 1%

## 踩过的坑

1. **只看平均延迟**：平均值会把少数极慢请求摊薄，原因是用户感受到的是自己那一次请求，不是全站平均。

2. **一上来就复制所有请求**：复制能降尾延迟，但原因是用了更多资源；不加延迟阈值和低优先级，可能把集群打满。

3. **以为探测队列长度一定最优**：探测和真正提交之间有时间差，原因是负载会变化，多个客户端还可能同时涌向同一台“看起来最空”的机器。

4. **把缓存当成尾延迟万能药**：缓存能减少常见路径的工作量，但原因是它不直接处理后台任务、排队、GC、磁盘抖动这些尾部来源。

## 适用 vs 不适用场景

**适用**：

- 搜索、推荐、广告、画像查询等高 fan-out 在线服务
- 数据有多个副本，读请求多，且允许从任意副本返回相同或近似结果
- P99 / P99.9 延迟比平均延迟更影响用户体验的场景
- 已经有容灾副本，希望顺手把副本用于性能稳定性的系统

**不适用**：

- 单机小服务，瓶颈清楚，直接优化慢函数更划算
- 强一致写请求，重复执行会带来副作用，必须靠事务或幂等设计兜底
- 所有副本会被同一个根因同时拖慢的场景，比如同一个上游网络故障
- 资源已经接近满载的集群，额外备份请求可能把尾延迟继续推高

## 历史小故事（可跳过）

- **2004 年前后**：Google 的搜索、索引和存储系统已经大量使用 fan-out 架构，请求会跨很多机器完成。
- **2006 年**：BigTable 论文发表，展示了多副本、tablet、分布式存储这些后来被本文反复用到的背景。
- **2010 年**：Dapper 技术报告把“跨很多服务的一次请求怎么排查”讲清楚，为观察尾延迟提供工具。
- **2013 年**：Dean 和 Barroso 在 Communications of the ACM 发表 The Tail at Scale，把 Google 多年经验整理成系统设计原则。
- **之后**：P99、hedged request、tail-tolerant 变成云服务、数据库和推理服务里反复出现的设计词汇。

这篇文章厉害的地方在于：它没有发明一个单点技巧，而是把“大规模下慢尾巴会被放大”这件事讲成了一套工程语言。

## 学到什么

1. **平均值会骗人**：大规模交互式系统要优先看尾部指标，因为用户最容易记住自己遇到的慢请求。

2. **复制是一种性能工具**：副本不只用来容灾，也能用来抢最快响应，但必须配取消、优先级和阈值。

3. **排队比执行更常见地制造波动**：很多请求一旦开始执行就稳定了，真正不确定的是在队列里等多久。

4. **系统设计是取舍表**：hedged requests、tied requests、micro-partitions、good-enough results 都是在用一点成本换更稳定的体验。

## 延伸阅读

- 论文入口：[The Tail at Scale — Google Research](https://research.google/pubs/the-tail-at-scale/)（短文，适合先读）
- 论文 PDF：[TheTailAtScale.pdf](https://www.barroso.org/publications/TheTailAtScale.pdf)（MinerU 解析使用的原文）
- 相关论文：[[bigtable-2006]] —— 论文里的很多例子来自 BigTable 和底层文件系统
- 相关论文：[[dapper-2010]] —— 看尾延迟问题时，需要 trace 帮你定位哪一段慢
- 相关论文：[[mapreduce]] —— 对照 MapReduce 的 backup task，理解“慢节点备份执行”这类思想

## 关联

- [[bigtable-2006]] —— The Tail at Scale 的 hedged request 实验直接用 BigTable 读 1000 个 key 做例子
- [[dapper-2010]] —— Dapper 解决“慢在哪里”，本文解决“慢尾巴怎么被系统设计遮住”
- [[mapreduce]] —— MapReduce 的 backup task 和本文的备份请求都是处理 straggler 的工程手段
- [[gfs]] —— 多副本文件块让 tied requests 有机会从不同机器抢最快读
- [[paxos-1998]] —— 本文提到强一致写通常靠 quorum / Paxos，读尾延迟和写一致性要分开看
- [[spanner-2012]] —— Spanner 这类全球数据库同样要在一致性、复制和延迟之间做取舍

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bullet]] —— Bullet — C++ 经典 3D 物理引擎与 PyBullet 仿真工具
