---
title: Dapper 可观测性 — 把一次请求走过的路画出来
来源: 'Sigelman et al., "Dapper, a Large-Scale Distributed Systems Tracing Infrastructure", Google 2010'
日期: 2026-07-09
分类: 可观测性
难度: 初级
---

## 是什么

Dapper 是一套**分布式链路追踪系统**：它把一次用户请求经过哪些服务、每段花了多久、哪里变慢，串成一棵可以查看的树。
日常类比：你寄一个包裹，快递公司会记录"揽收、分拣、运输、派送"每一步；Dapper 做的是给一次线上请求贴快递单。

在单体程序里，慢在哪里通常看一份日志就够了；在 Google 这种系统里，一次搜索可能经过前端、索引、广告、存储、网络几十个服务。
如果每个服务只写自己的日志，工程师看到的是一堆碎纸片；Dapper 给这些碎片贴同一个 `trace_id`，再按父子关系拼回完整故事。

这篇论文重要的地方不只是"提出 trace/span 术语"，而是证明：追踪可以在几乎所有生产服务里默认开启，并且性能影响小到服务团队愿意长期保留。

## 为什么重要

不理解 Dapper，下面这些事都没法解释：

- 为什么微服务慢了以后，光看单机日志经常找错方向
- 为什么 OpenTelemetry、Jaeger、Zipkin 都围绕 trace、span、sampling 这些词设计
- 为什么可观测性系统必须先控制开销，否则再强也会被业务关掉
- 为什么"能看到调用链"只是第一步，真正难的是低侵入、可扩展、能长期存储

## 核心要点

Dapper 的核心可以拆成 **三件事**：

1. **trace 是整张快递单**：一次请求有一个全局 `trace_id`。类比：一个订单号贯穿仓库、运输和派送，所有环节都能凭它归档。

2. **span 是快递路上的一站**：每个 RPC、异步回调或重要操作会生成一个 span，记录开始时间、结束时间、父 span、注释等信息。类比：每个中转站盖一个时间戳。

3. **采样让系统能常开**：不是每个请求都完整记录，而是按比例挑一部分。类比：高速路不可能检查每辆车，但抽样足够发现拥堵规律。

这三件事合起来，解决的是"线上系统太大、太快、太分散，人工看日志跟不上"的问题。

## 实践案例

### 案例 1：一次请求如何带着 trace_id 走过三个服务

```ts
const traceId = newTraceId()
const root = startSpan(traceId, "frontend")
const user = rpc("user-service", { traceId, parent: root.id })
const ads = rpc("ads-service", { traceId, parent: root.id })
finishSpan(root)
```

**逐部分解释**：

- `traceId` 是整次请求的统一编号，后面所有服务都带着它
- `root` 是前端 span，表示用户请求进入系统的第一站
- 两次 `rpc` 会在下游各自产生子 span，父子关系让 UI 能画出调用树

没有这个统一编号，前端、用户服务、广告服务的日志只是三堆独立文本；有了它，工程师能看见"这次请求到底走了哪条路"。

### 案例 2：用 annotation 给 span 加业务线索

```js
const span = tracer.currentSpan()
if (cache.hit(key)) {
  span.annotate("cache", "hit")
} else {
  span.annotate("cache", "miss")
}
```

**逐部分解释**：

- span 先记录结构信息：谁调用谁、耗时多少
- annotation 再补业务信息：缓存命中、输入大小、状态说明
- Dapper 论文强调注释是可选增强，核心追踪不依赖业务代码手写

这点很关键：如果追踪必须每个业务团队手动埋完才有用，它迟早会漏；Dapper 把基础埋点放进通用 RPC、线程和回调库里。

### 案例 3：采样如何控制成本

```python
def should_sample(trace_id, rate):
    bucket = hash(trace_id) % 1024
    return bucket < 1024 * rate

sampled = should_sample(trace_id, 1 / 1024)
```

**逐部分解释**：

- `hash(trace_id)` 保证同一个 trace 的所有 span 做同一个决定
- `1 / 1024` 表示高流量服务只保留千分之一左右请求
- Dapper 还会在收集阶段做第二次采样，用一个开关控制 Bigtable 写入压力

论文里的实验显示，在 Web Search 这类高吞吐服务里，低采样率仍然足够发现常见模式；不采样反而会让追踪系统本身变成新的性能问题。

## 踩过的坑

1. **只装日志不传 trace_id**：日志仍然分散，无法知道一次请求跨服务的因果关系。

2. **把所有请求都追踪**：高流量服务会被写日志和收集链路拖慢，所以 Dapper 必须依赖采样。

3. **以为 span 就等于根因**：span 能指出哪里慢，但排队、锁竞争、内核调度这类原因还要结合其他工具。

4. **把 payload 全塞进 trace**：请求内容可能有隐私和权限风险，Dapper 只默认记录方法名，业务注释需要开发者主动选择。

## 适用 vs 不适用场景

**适用**：

- 微服务、RPC、异步回调很多，单份日志看不清整条请求路径
- 线上延迟长尾排查，需要知道慢请求卡在网络、存储还是某个下游服务
- 需要长期默认开启的可观测性基础设施，不能靠临时打日志
- 想做服务依赖图、资源归因、异常报告跳转到 trace 的平台能力

**不适用**：

- 单进程小脚本，函数调用栈和普通日志已经足够
- 必须记录每一条请求的审计系统，采样 trace 不能替代审计日志
- 需要内核级根因分析的场景，Dapper 只能提供用户态上下文
- 批处理任务如果没有"一次请求"这种天然单位，需要重新定义 trace 颗粒度

## 历史小故事（可跳过）

- **2002 年**：Pinpoint 把全局 ID 用在大型互联网服务问题定位上，说明"把事件串起来"这条路可行。
- **2006 年**：Pip、WAP5 等系统继续探索分布式系统调试，但很多还偏研究原型或依赖较重标注。
- **2007 年**：X-Trace 提出跨层、跨协议的追踪思路，比 Dapper 更强调从网络层到应用层的全链路。
- **2010 年**：Dapper 论文公开 Google 两年多生产经验，重点从"能不能追踪"变成"能不能默认常开"。
- **后来**：Zipkin、Jaeger、OpenTelemetry 把 trace/span/sampling 变成业界通用词汇。

## 学到什么

1. **可观测性先是工程约束，不只是 UI**：系统必须低开销、低侵入、可扩展，团队才敢让它一直开着。
2. **trace/span 是把因果关系显式化**：它不神秘，本质是给跨服务工作贴同一个编号，再记录父子关系和时间线。
3. **采样不是偷懒，而是产品能力**：高流量系统里，代表性样本比全量但拖垮业务更有价值。
4. **追踪不是根因分析的终点**：它负责把调查范围缩小，真正根因可能还要看队列、锁、内核、数据库和业务注释。

## 延伸阅读

- 论文 PDF：[Dapper, a Large-Scale Distributed Systems Tracing Infrastructure](https://static.googleusercontent.com/media/research.google.com/en//pubs/archive/36356.pdf)
- [[xtrace-2007]] —— 更早的跨层追踪框架，适合对比 Dapper 为什么选择更轻量的公共库埋点
- [[pivot-tracing-2015]] —— 追踪之后的下一步：线上临时提出新问题，再动态注入观测点
- [[bigtable-2006]] —— Dapper 中央仓库的存储基础，一条 trace 可以放成 Bigtable 的稀疏行
- [[mapreduce]] —— Dapper 的批量分析 API 借助 MapReduce 扫大规模 trace 数据
- [[chubby]] —— 论文案例里 Bigtable 依赖的分布式锁服务，展示共享基础设施为什么需要追踪

## 关联

- [[xtrace-2007]] —— Dapper 的近亲，二者都用全局 ID 串起跨机器事件
- [[pivot-tracing-2015]] —— 解决 Dapper 不擅长"事后想问新问题"的限制
- [[bigtable-2006]] —— Dapper 把 trace 写进 Bigtable，利用稀疏列存不同数量的 span
- [[mapreduce]] —— 大规模离线分析 trace 时，Dapper 通过 MapReduce 扫描仓库
- [[chubby]] —— 共享服务依赖让排查变复杂，Dapper 用调用链把依赖显性化
- [[borg]] —— 大规模生产集群让"默认常开"追踪成为必要基础设施

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
