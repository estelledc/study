---
title: Dapper — Google 大规模分布式系统链路追踪基础设施
来源: Sigelman et al., "Dapper, a Large-Scale Distributed Systems Tracing Infrastructure", Google Technical Report dapper-2010-1, April 2010
日期: 2026-05-31
分类: 分布式系统
难度: 中级
---

## 是什么

Dapper 是 Google 2010 年放出来的一篇技术报告，讲他们怎么给"上千台机器协作完成一次请求"的系统装一个**全链路体检仪**。

日常类比：你去医院做一次就诊。挂号 → 内科 → 抽血 → 拍片 → 拿药。事后医院给你一张总单，能看到每一步花了多久、哪一步卡住了。Dapper 就是给一次 web 请求做的"就诊路径单"——这次搜索请求经过了 50 个微服务，每个服务花了多少毫秒，哪一段最慢，全画出来。

它不是搜索引擎、不是数据库，它是**给所有别的系统打配合**的基础设施。Google 内部部署了几年，证明在大规模生产环境下：可以做到**几乎零侵入** + **几乎零开销** + **抓得住尾延迟**。

## 为什么重要

不理解 Dapper，下面这些事都没法解释：

- Jaeger / Zipkin / OpenTelemetry 三大主流追踪系统的术语（trace / span / sampling）为什么完全一样——都是从这篇直接抄的
- 为什么"分布式追踪"这个领域 2010 年之后才真正起势——之前 Magpie / X-Trace 都没活下来，Dapper 给出了**工业落地的样板**
- 为什么 SRE 排查线上慢请求第一反应是"拉一条 trace 看看"——这个工作流就是 Dapper 定义的
- 为什么所有 RPC 框架（gRPC / Thrift / 内部 Stubby）都内置 trace context propagation——Dapper 证明了这是必须放在 RPC 库里的事

一句话：**云原生时代的可观测性三件套（logging / metrics / tracing）里，tracing 这一支几乎完全脱胎于这篇论文**。

## 核心要点

Dapper 的设计可以拆成 **三个抽象 + 三个目标**。

### 三个抽象

1. **trace**：一次请求从入口到所有下游的完整调用图。一次搜索请求 = 一个 trace。
2. **span**：trace 里的一个子段，对应**一次 RPC 调用**。每个 span 有 `trace_id`（哪条 trace）、`span_id`（自己是谁）、`parent_span_id`（被谁调用的）。
3. **annotation**：业务代码可以在 span 上挂事件——"开始处理"、"读完缓存"、"返回"。后来演化成 OpenTelemetry 的 attributes / events。

把所有 span 用 `parent_span_id` 串起来，就拼成一棵 **trace tree**：根节点是入口请求，叶子是最深一层的 RPC。看 trace tree 就能看出谁调谁、谁花了多少时间。

形象类比：trace 像一棵家谱树。trace_id 是这个家族的姓，每个 span 是一个家庭成员，parent_span_id 是 "我爸是谁"。光看一个成员看不出全貌，把整棵树画出来，谁是长辈、谁是子孙就一目了然。

### 三个目标（设计的"红线"）

1. **低开销**：在 Google web search 这种延迟敏感路径上，trace 采集 CPU 开销 < 0.01%。做不到这个数，业务方不让上。
2. **应用层透明**：业务代码不用为了 trace 改一行。Dapper 把 trace context 注入到**通用 RPC 库**（Stubby）和**线程本地存储**里，请求进来时自动开 span、出去时自动埋 trace_id。
3. **大规模可部署**：能在几万台机器上同时跑，且不依赖任何特殊硬件。

## 实践案例

### 案例 1：trace tree 长什么样

```
trace_id=abc123
└── span A: frontend (8ms)
    ├── span B: auth-service (1ms)   parent=A
    └── span C: search-service (6ms) parent=A
        ├── span D: index-shard-1 (3ms) parent=C
        └── span E: index-shard-2 (5ms) parent=C  ← 慢的那个
```

看到 E 比 D 慢 2ms 就找到了瓶颈。这就是 Dapper 给 SRE 的核心价值。

### 案例 2：采样为什么是 1/1024

Google web search 每秒上百万请求。**全采样**：trace 数据本身的写入量会压垮 Bigtable。**全不采**：偶发慢请求看不见。

Dapper 的解法：**默认 1/1024 采样**——每 1024 条请求挑 1 条记全。但保证**整条 trace 要么全采要么全不采**（trace_id 在入口决定，下游沿用），不会出现"半截 trace"。

排查特定场景时可以**临时把采样率调高**到 1/1，问题复现完再调回去。

### 案例 3：out-of-band 收集

如果 trace 数据走在请求路径上，就是给请求加一道延迟。Dapper 的做法：

1. 应用进程把 span 写到**本地日志文件**（同步、但只是 append）
2. 一个独立的 **Dapper daemon** 在机器上跑，异步读日志、批量写到 Bigtable
3. 即使 Bigtable 挂了，请求路径也不受影响

这个"采集和上报解耦"的思路，被后来所有追踪系统继承（Jaeger 的 agent、OpenTelemetry 的 collector）。

### 案例 4：trace_id 怎么生成才不撞

64-bit 随机数。Google 早期算过：每秒 100 万 trace、保留 90 天，总量大约 10^13 条；64-bit 随机空间是 10^19，撞概率可忽略。

为什么不用全局递增 ID（像数据库主键那样）？因为递增 ID 需要一个**中心化分配服务**，trace 入口分布在几万台机器上，每条请求都要去问一次——延迟和单点故障两头不讨好。**随机生成 + 大空间** = 各机器自己生成、不会冲突。这个设计后来被 Jaeger / Zipkin 原样继承。

## 踩过的坑

1. **异步任务断链**：thread-local 存 trace context 在同步代码里完美，遇到线程池/消息队列就**丢了 parent**——任务被另一个线程执行，context 没跟过去。解法是显式 wrap 任务（`runnable.copyTraceContext()`），但容易漏。这是后来所有 trace 库踩到的同一个坑。

2. **采样率与尾延迟的张力**：1/1024 采样能抓住"普遍慢"，但抓不住**只在 0.01% 请求里发生的尾延迟**。后来 Jaeger 引入 **adaptive sampling**——按服务和操作动态调，常见路径采得稀、稀有路径采得密。

3. **时钟漂移**：跨机器的 span 时间戳不可全信。两台机器的本地时钟差几毫秒很正常，导致 child span 看起来比 parent span 还早开始。Dapper 用**因果关系**（parent_span_id 链）兜底，时间戳只用来看"大致顺序"。

4. **annotation 泄漏隐私**：业务方一开始喜欢把请求参数往 annotation 里塞，密码 / 手机号都进去了。Dapper 加了**白名单审查**，OpenTelemetry 学到这点引入了 **attribute scrubbing**。

## 适用 vs 不适用场景

**适用**：

- 微服务架构（10+ 服务协作完成一次请求）的根因排查
- 性能优化——找出哪一段是真瓶颈
- 容量规划——看每个服务在请求路径上的占比
- A/B 实验对延迟的影响评估

**不适用**：

- 单体应用——杀鸡用牛刀，加 logging 就够
- 实时告警——trace 是事后查询工具，告警还得靠 metrics
- 业务正确性验证——trace 看不到"结果对不对"，那是测试和审计的事
- 安全审计——trace 不是审计日志，采样率注定它不全

## 历史小故事（可跳过）

- **2003 年**：Microsoft Research 出 Magpie，要求每个组件**手写 event schema**，工业上没人愿意写，没活下来
- **2007 年**：Berkeley 出 X-Trace，学术原型，给出了 trace tree 的雏形，但没解决"在生产线大规模跑"
- **2010 年 4 月**：Google 把内部跑了 2 年的 Dapper 写成技术报告放出来，**6 页正文 + 4 页评测**，给业界一份完整工业答卷
- **2012 年**：Twitter 开源 **Zipkin**，术语 100% 抄 Dapper
- **2017 年**：Uber 开源 **Jaeger**，加了 adaptive sampling，进 CNCF
- **2019 年**：CNCF 把 OpenTracing 和 OpenCensus 合并成 **OpenTelemetry**，trace 数据模型还是 Dapper 那一套

整整十年过去，trace + span + sampling 三件套没变过。

## 学到什么

1. **基础设施的成功靠"低门槛 + 高价值"**——Dapper 应用层透明、< 0.01% 开销，业务方没理由不接
2. **采样不是性能取舍而是必要设计**——海量数据下"全采"根本做不到，得在数据完整性和可承受成本之间找平衡
3. **out-of-band 是关键**——任何写在请求路径上的"附加功能"都会被砍，必须异步解耦
4. **统一抽象 > 灵活抽象**——Dapper 的 trace+span+annotation 三件套**故意做得简单**，靠简单换到了全行业采纳

## 延伸阅读

- 论文 PDF：[Dapper Tech Report (Google Research)](https://research.google/pubs/dapper-a-large-scale-distributed-systems-tracing-infrastructure/)（14 页，没有数学，读得动）
- 开源实现：[Zipkin](https://zipkin.io/)（最早的 Dapper 仿制品，Scala 写）/ [Jaeger](https://www.jaegertracing.io/)（Uber 出，Go 写）
- 标准化：[OpenTelemetry Tracing Spec](https://opentelemetry.io/docs/specs/otel/trace/)（CNCF 当下事实标准）
- 进阶：Cindy Sridharan, *Distributed Systems Observability*（O'Reilly 2018，把 metrics/logging/tracing 三件套讲透）

## 关联

- [[bigtable-2006]] —— Dapper 把 trace 数据存进 Bigtable，每行一个 trace_id
- [[gfs]] —— Bigtable 的底层存储；trace 日志最终落到 GFS 上
- [[chubby]] —— Dapper daemon 用 Chubby 做配置同步和 leader 选举
- [[borg]] —— Dapper daemon 作为 sidecar 跟着业务进程被 Borg 调度
- [[mapreduce]] —— Dapper 提供的批量分析接口本质是在 trace 数据上跑 MapReduce
- [[spanner-2012]] —— 同样是 Google 系统级论文，spanner 的全局事务诊断也依赖 trace
- [[gpipe-2019]] —— 跨机协作训练同样要看 trace 才能找出 pipeline 瓶颈

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pivot-tracing-2015]] —— Pivot Tracing — 让运维事后想测什么就测什么
- [[tradeoff-analysis]] —— The Tail at Scale — 尾延迟会被规模放大
- [[xtrace-2007]] —— X-Trace — 比 Dapper 早 3 年的跨层跨协议追踪框架
