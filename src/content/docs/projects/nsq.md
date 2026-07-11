---
title: NSQ — Go 写的去中心化消息队列
来源: https://github.com/nsqio/nsq
日期: 2026-06-01
分类: 数据库 / 消息队列
难度: 中级
---

## 是什么

NSQ 是一个**用 Go 写的、去中心化、无外部依赖**的实时分布式消息平台，2012 年由 bitly（短链服务）开源。一个二进制文件就能跑，不需要 ZooKeeper、etcd 或任何共识组件，被设计为运维门槛极低的消息中间件。

日常类比：**就像小区里的快递柜+广播喇叭组合**——快递员（producer）把包裹塞进任意一个快递柜（nsqd 节点）；门口的公告板（nsqlookupd）只负责告诉收件人「3 号楼和 5 号楼那两个柜子里有你的包裹」，不存包裹本身；收件人（consumer）看公告板后直接跑到对应快递柜取走。公告板挂掉一块也不影响柜子继续工作。

最简单的发消息：

```bash
# 启动 nsqd
nsqd --lookupd-tcp-address=127.0.0.1:4160

# HTTP 发一条
curl -d 'hello nsq' 'http://127.0.0.1:4151/pub?topic=events'
```

发送方根本不需要写客户端 SDK——一个 curl 就完成了。这种**对运维和开发都极简**的取向，是 NSQ 在 Kafka / RabbitMQ 之外能活下来的主要原因。

## 为什么重要

不理解 NSQ 的设计，下面这些事都没法解释：

- 为什么有了 Kafka 这种巨无霸，bitly / stripe / digital ocean / segment 这些中等规模公司还在用 NSQ
- 为什么「消息队列」也可以**没有共识层、没有 leader 选举、没有复杂集群协调**
- 为什么 Go 在 2012 年（语言才 1.0 不久）就被选来写大型分布式中间件
- 为什么「轻量、无共识」的消息队列思路，在 Kafka 变重之后仍然有人讨论和选型

简单说：**NSQ 证明了消息队列不一定要往「越来越重」的方向卷**——选择放弃回放、顺序、强一致这些功能，换来运维成本接近零。

## 核心要点

NSQ 的架构可以拆成 **两个核心守护进程 + 一个管理 UI**，再加 **topic / channel 两个抽象**：

1. **nsqd**：守护进程，真正接收消息、排队、推送给 consumer。每台机器跑一个或多个，互相之间**完全独立**——一个节点挂了只影响那个节点上的消息。

2. **nsqlookupd**：目录服务（**不存消息**）。nsqd 启动后向所有 nsqlookupd 注册「我有 topic A、B」；consumer 查任意一个 nsqlookupd 拿到「topic A 在 host1、host3 上」的合并视图，直接 TCP 连过去。多个 nsqlookupd 互不通信——这种**最终一致的发现**比 ZooKeeper 强一致便宜一个数量级。

3. **nsqadmin**：只读管理界面，连 lookupd 看 topic / channel / lag；**不参与消息路径**，挂了也不影响收发。

4. **topic / channel 模型**：topic 是消息流名字（如 `clicks`）；每个 channel 订阅 topic 都**拿一份完整副本**（如 `clicks#analytics`、`clicks#archive`）；channel 内多个 consumer **负载均衡分摊**消息。

简单说：**topic 是广播频道，channel 是订阅副本（每个副本独立消费），channel 里的 consumer 是分工干活的工人**。

## 实践案例

### 案例 1：本地起一套完整 NSQ 集群

```bash
# 终端 1：lookupd（发现服务）
nsqlookupd

# 终端 2：nsqd（消息节点，告诉它 lookupd 在哪）
nsqd --lookupd-tcp-address=127.0.0.1:4160

# 终端 3：admin UI（看状态）
nsqadmin --lookupd-http-address=127.0.0.1:4161
```

打开 `http://localhost:4171` 就是 nsqadmin，可以看 topic / channel / lag 实时状态。**整个集群三个二进制，零配置文件**。

### 案例 2：发消息和收消息

```bash
# 发：HTTP 简单粗暴
curl -d '{"user":"alice","action":"click"}' \
  'http://127.0.0.1:4151/pub?topic=events'

# 收：用官方 nsq_tail 工具订阅 channel
nsq_tail --topic=events --channel=printer \
  --lookupd-http-address=127.0.0.1:4161
```

注意第二条命令——`channel=printer`。如果你再起一个 `channel=archiver`，**两个 channel 都会拿到同一份消息**（topic 的副本机制）。这是 NSQ 实现「一份事件、多个下游」的方式。

### 案例 3：在线动态拓扑

```bash
# 再启动一个 nsqd（同一个 lookupd）
nsqd --lookupd-tcp-address=127.0.0.1:4160 \
     --tcp-address=:4250 --http-address=:4251
```

新节点启动后**立刻被 lookupd 发现**；正在跑的 consumer（每 60 秒查一次 lookupd）下次刷新就连上新节点开始收消息。**没有任何配置变更、重启或集群协调**——这是「在线动态拓扑」的字面含义。

## 踩过的坑

1. **没有消息回放**：消息消费成功后立刻从 nsqd 删除。新业务想从历史消息开始处理？做不到。这是 NSQ 和 Kafka 最大的差异——选 NSQ 之前先确认你不需要 replay。

2. **不保证顺序**：同一个 topic 的消息可能落到不同 nsqd 节点上，consumer 从多个节点拉取时顺序就乱了。需要严格 FIFO 的场景（如订单状态机）选错就翻车。

3. **mem-queue-size 与崩溃丢消息**：消息先走内存队列（默认约 10000 条），超出部分进磁盘 backend。**consumer 短时挂掉不会丢**（会超时重入队）；真正危险的是 **nsqd 进程崩溃**——当时还在内存、未落盘的消息会没。生产常把 `mem-queue-size` 调小（甚至 0）逼更多消息走磁盘，或接受「崩溃窗口内可能丢」。

4. **无内置复制**：单 nsqd 节点磁盘坏了消息就丢。官方有 `nsq_to_nsq` 工具做镜像，但要自己搭、自己监控。生产高可用方案是「多 producer 写多个 nsqd 节点 + consumer 读所有节点」，靠业务层去重。

5. **HTTP 发消息没批量接口**：`/pub` 一条一条发，QPS 想拉高得用 `/mpub`（multi pub）或者切到 TCP 协议。新人常常用 HTTP 单发压测，得出「NSQ 慢」的错误结论。

6. **lookupd 查询缓存 60 秒**：consumer 默认 60 秒刷一次 lookupd，新增 nsqd 节点最坏要等 60 秒才被发现。压测时如果不调小这个间隔，会误以为「动态拓扑」其实很慢。

## 适用 vs 不适用场景

**适用**：

- 中等规模实时事件分发（每秒万级到十万级，**不是百万级**）
- 单数据中心内的解耦消息传递（微服务事件、日志收集、任务队列）
- 运维资源紧张的团队（不想维护 ZK / Kafka 集群）
- 对消息持久化要求不高（at-least-once 够用，不需要回放）

**不适用**：

- 需要消息回放或长期保留 → 选 Kafka
- 严格 FIFO / exactly-once → 选 Kafka 或 RabbitMQ
- 跨数据中心异步复制 → 选 Kafka MirrorMaker / Pulsar
- 复杂路由（topic exchange / header routing）→ 选 RabbitMQ
- 百万 QPS 级吞吐 → 选 Kafka / Pulsar / Redpanda

## 历史小故事（可跳过）

- **2009 年**：bitly 用 Python 写的事件追踪管道扛不住短链点击量，开始考虑替代方案。
- **2012 年**：Matt Reiferson 等人用刚出 1.0 的 Go 重写，开源命名为 NSQ；当时 Go 在大型分布式系统几乎没先例，是早期标杆项目之一。
- **2016 年**：v1.0.0 发布，API 和协议稳定。
- **2019 年后**：开发节奏放缓，但生产稳定（少 bug、协议不变）；社区活跃度让位给 Kafka / Pulsar 这类更重的方案。
- **现在**：依然是「想要简单消息队列就装 NSQ」的默认选项之一，二进制安装包不到 20MB。

## 学到什么

1. **去中心化的发现服务**——nsqlookupd 用「最终一致 + 客户端合并视图」替代 ZooKeeper 强一致，证明发现层不一定要共识
2. **功能克制是工程哲学**——NSQ 主动放弃回放、顺序、复制，换来运维门槛接近零，这是另一种成熟
3. **topic / channel 双层抽象**——topic 是流，channel 是消费副本，比单层「队列」模型更适合多下游消费
4. **Go 的并发模型适合写消息中间件**——goroutine + channel 让 nsqd 单进程内的 fan-in / fan-out 写起来很自然，这也是 Go 后来主导云原生中间件的早期信号

## 延伸阅读

- 官方文档：[NSQ Documentation](https://nsq.io/overview/design.html)（先看「Design」一章，把无 ZK 设计讲得很清楚）
- 设计博客：[Spray of Messages — NSQ Design](https://word.bitly.com/post/33232969144/nsq)（bitly 官方介绍 NSQ 诞生原因）
- 视频：[NSQ Talk by Matt Reiferson](https://www.youtube.com/watch?v=ipFUANeStYE)（作者亲自讲架构）
- 源码导读：[nsqio/nsq on GitHub](https://github.com/nsqio/nsq)（Go 代码量不大，nsqd 主流程从 `apps/nsqd/main.go` 开始读）

## 关联

- [[kafka]] —— Kafka 是「重而全」的对照组；NSQ 故意往反方向走
- [[rabbitmq-server]] —— RabbitMQ 路由复杂、erlang 集群，NSQ 是「无路由 + 单二进制」的对照
- [[redis]] —— Redis Stream 也是轻量队列方案，但单点；NSQ 多节点天然分布
- [[etcd]] —— etcd / ZooKeeper 是 NSQ 故意不要的那一层共识依赖
- [[golang]] —— NSQ 是早期大型 Go 项目的标杆，证明 goroutine 适合写消息中间件

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[redpanda]] —— Redpanda — Kafka 兼容的 C++ 实现
