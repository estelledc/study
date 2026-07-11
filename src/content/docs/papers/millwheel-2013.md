---
title: MillWheel 2013 — Google 给互联网级流处理装上不漏不重的发动机
来源: 'Akidau, Balikov, Bekiroğlu et al., "MillWheel: Fault-Tolerant Stream Processing at Internet Scale", VLDB 2013'
日期: 2026-05-30
分类: distributed-systems
难度: 中级
---

## 是什么

MillWheel 是 Google 内部的**流处理框架**——你写一份"输入怎么变成输出"的图，它替你在几百台机器上跑、坏了自己救活、保证每条数据**不丢也不重**。

日常类比：像一条大型流水线工厂。每个工位（计算节点）拿到零件（一条数据），加工后传给下一个工位。工厂的承诺是——零件即使经手十个工位，**有一份就只算一份**，工人请假（机器宕机）也有备份顶上。

你写一个 DAG（有向无环图）描述各工位逻辑，节点之间传 `(key, value, event_time)` 三元组。MillWheel 替你在数百台机器上调度、保存状态、追踪时间进度，并在每条记录粒度提供 **exactly-once**（精确一次）。

```
Source → 计算 A → 计算 B → Sink
            ↓
        (按 key 持久化的状态)
```

## 为什么重要

不理解 MillWheel，下面这些事都没法解释：

- 为什么 Apache Beam / Cloud Dataflow 能"按事件时间"正确开窗，乱序也不出错
- 为什么 Flink 的 watermark 概念长得跟 MillWheel 几乎一模一样
- 为什么 Storm 的 at-least-once 在计费场景被骂、Spark Streaming 的微批延迟在监控场景被骂
- 为什么"低延迟 + 容错 + 事件时间正确"三角难关，Google 在 2013 年就一次性解了

## 核心要点

MillWheel 的三件套：

1. **按 key 持久化状态**：每个节点对每个 key 维护自己的状态（如计数器、滑动窗口）。状态写到 Bigtable / Spanner，节点崩了重启就能从最近 checkpoint 恢复。类比：工人离岗前把当前进度写在工位标签上，新工人接班照着继续。

2. **record-ID 去重 + 强一致状态提交**：每条记录有唯一 ID，下游记一份"已处理过的 ID 集合"。失败重试同一条 ID 时，去重表挡掉。状态修改和 ID 写入打包成一个原子事务——这就是 exactly-once 的真相。

3. **low watermark（低水位线）**：每个节点定期广播"我处理过的最早事件时间"。框架取所有上游最小值，下游就知道"比这个时间早的数据应该都到了"。类比：工厂统计所有入口闸的最早未处理时间戳，决定哪批货可以正式封箱。

三件套缺一不可。状态没了，重启全凉；不去重，重试就重复；没水位线，不知道何时关窗输出。MillWheel 的工程价值，是把这三件事**组合到一个统一框架里**，让用户写计算逻辑时不用各自重新发明。

## 实践案例

### 案例 1：Zeitgeist 趋势检测

Google 实时统计搜索词频率，发现异常飙升即报警。

```python
# 伪代码：MillWheel computation
def process(key, value, event_time, state):
    # key = 搜索词；value = 1（一次搜索）
    state.counter += 1
    state.window.add(event_time, 1)
    if anomaly(state.window):
        emit("trend_alert", key)
```

按 key（搜索词）维护滑窗计数。机器宕机重启后，状态从 Bigtable 恢复，记录 ID 去重保证不重复计数。论文的评测显示这套链路 P99 延迟约 30 毫秒——用户搜什么、几十毫秒后趋势面板上就反映出来。

### 案例 2：广告点击异常监控

广告系统每秒处理百万级点击。每条点击都要恰好计费一次——重复扣费会被骂，漏扣会赔钱。

```python
def on_click(click_id, ad_id, event_time, state):
    if state.seen.contains(click_id):
        return  # 去重
    state.seen.add(click_id)
    state.charges[ad_id] += cost(ad_id)
```

`state.seen` 和 `state.charges` 在同一原子事务里更新——这是 exactly-once 的关键点：状态变更和"已处理标记"必须一起成功或一起失败。少一步就翻车：如果先扣费再标 seen，机器在两步之间宕机，重启后重试会重复扣费。

### 案例 3：用户行为按事件时间聚合

手机端打的时间戳乱序到达服务器（4G 网慢、离线缓存）。要按"用户实际操作时间"开 1 分钟窗口聚合。

```python
def on_event(user_id, event, event_time, state):
    state.window.add(event_time, event)

def on_watermark(watermark, state):
    # watermark 表示"event_time < watermark 的事件应该都到了"
    for window in state.window.complete_before(watermark):
        emit(window.aggregate())
```

watermark 决定何时关窗输出——它是"事件时间进度"的估计，不是真理（见踩坑 2）。

## 踩过的坑

1. **exactly-once 不是天上掉的**——必须配合"幂等下游 + record-ID 去重 + 原子状态提交"三件套，少一件就退化成 at-least-once，重复计费就来了
2. **low watermark 是估计不是真理**——上游 source 给的时间戳偏差会让水位线推进过快，窗口提前触发，迟到数据被丢；要么允许"晚到处理"，要么调慢水位线
3. **按 key 状态存 Bigtable 看着便宜**——但热 key（明星搜索词）会把单 tablet 打爆，需要二次分桶或限流
4. **timer 是隐藏成本**——大量未来定时器堆在状态里，崩溃重启时回放慢；需要分片 + 延迟加载，否则恢复要几十分钟

## 适用 vs 不适用场景

**适用**：
- 互联网级实时流处理（每秒百万到千万条），需要 exactly-once
- 事件时间正确性重要的场景（计费、监控告警、趋势检测）
- 容忍秒级恢复延迟的关键链路
- 状态可按 key 切分（用户 ID、设备 ID、搜索词）

**不适用**：
- 毫秒级超低延迟交易系统（30ms P99 不够）
- 全局聚合无法按 key 分片的工作负载
- 小规模场景（一两台机器就能扛）—— Bigtable 状态后端反而是负担
- 需要事务跨多 key（MillWheel 状态原子性局限在单 key 内）

## 历史小故事（可跳过）

- **2010 年前后**：Google 内部用 MapReduce 跑批处理，但实时趋势检测、广告监控等场景需要"流"——传统的 lambda 架构（批+流双跑）维护成本极高。
- **2010-2012 年**：Tyler Akidau 团队在 Google 内部从零造 MillWheel，目标是"一份代码同时拿到低延迟、容错、事件时间正确"。
- **2013 年 VLDB**：MillWheel 论文发表，给业界第一次展示了 exactly-once 流处理在互联网规模的真实工程方案。
- **2015 年**：同一团队把 MillWheel 的实战经验抽象成 Dataflow Model（VLDB 2015），开源为 Apache Beam。
- **2015 年至今**：Apache Flink 直接吸收 watermark 设计；Beam 成为流批统一编程模型的事实标准；MillWheel 变成所有现代流处理系统的祖师爷。

## 学到什么

1. **exactly-once 是工程问题，不是物理问题**——靠"幂等下游 + 去重表 + 原子提交"组合拳，不需要新理论
2. **事件时间正确性需要 watermark 这种"进度估计"**——它不是真理，但比"等无限久"现实，比"按到达顺序"准确
3. **状态外置到分布式 KV** 是流处理容错的关键——节点变成无状态的计算单元，重启即恢复
4. **从 MillWheel 到 Beam 到 Flink，流处理的发展是"先解决工程问题，再抽象数学模型"**——理论跟着实践走

## 延伸阅读

- 论文 PDF：[MillWheel VLDB 2013](http://www.vldb.org/pvldb/vol6/p1033-akidau.pdf)（13 页，可读性高）
- 后续抽象：[[dataflow-model-2015]] —— 同一团队两年后的理论提升
- 工业徒孙：[[flink-2015]] —— 借鉴 watermark 思想的开源系统
- 视频：Tyler Akidau "Streaming 101" 系列博客（O'Reilly），把 MillWheel/Beam 的事件时间思想讲透
- 工程视角：[[kafka]] 流的传输层，与 MillWheel 的计算层互补
- 对比阅读：[[mapreduce]] 是批的祖师爷，MillWheel 是流的祖师爷

## 关联

- [[dataflow-model-2015]] —— MillWheel 实战经验的理论总结，开源即 Apache Beam
- [[flink-2015]] —— 同时代开源流处理系统，watermark 思想直接受 MillWheel 启发
- [[kafka]] —— 互补关系：MillWheel 处理流，Kafka 是流的传输层
- [[mapreduce]] —— 批处理祖师爷；MillWheel 把"批的容错思路"挪到无界流上
- [[bigtable-2006]] —— MillWheel 默认的状态后端，按 key 持久化靠它
- [[spanner-2012]] —— 强一致状态后端选项，比 Bigtable 多事务能力
- [[paxos-1998]] —— 共识基石；MillWheel 的状态复制最终落到 Paxos 之上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ciel-universal-execution-engine-distributed-data-flow-2011]] —— CIEL 2011 — 让分布式数据流会自己长出下一步
- [[drizzle-2017]] —— Drizzle — 让 micro-batch 也能跑出 100ms 延迟
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[trill-2014]] —— Trill — 一个引擎同时跑流、批、交互三种分析
