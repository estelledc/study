---
title: Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
来源: 'Hewitt, Bishop, Steiger. "A Universal Modular ACTOR Formalism for Artificial Intelligence", IJCAI 1973'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Actor 模型是一种**把整个程序拆成"一群只会做三件事的小邮筒"**的计算模型。日常类比：像一栋大公寓，每户人家有自己的信箱（mail address）和家门（独立状态）。住户之间不共享任何东西——不共冰箱、不共密码——**只能往别人信箱里塞信**。

每个住户（**actor**）收到一封信，只能做这三件事：

```
1. 给某个 mail address 发一封新信
2. 造一个新住户（new actor）
3. 决定"下一封信来的时候我怎么处理"
```

没有共享内存、没有锁、没有调用栈，只有**邮件**。整个并发程序就是一堆住户互相寄信。这就是 Hewitt 1973 年在 IJCAI 提出的"Universal Modular Actor Formalism"。

更激进的是：**连函数调用本身也用消息表达**。`f(x)` 在 actor 视角下不是"跳进 f 的代码"，而是"给 f 这个 actor 寄一封信，信里写参数 x 和回信地址"。

## 为什么重要

不理解 Actor，下面这些事都说不清楚：

- 为什么 Erlang / Elixir 的电话交换机能做到 99.9999999% 可用——一个进程崩了不影响别人，因为本来就不共享
- 为什么 Akka / Pekko 写分布式服务可以"先单机跑通再扔上集群"——本机消息和远程消息对 actor 来说一样
- 为什么微软 Orleans 把云上的对象叫 "grain" 而不是 "object"——它就是 actor，自动持久化、自动迁移
- 为什么 Smalltalk-80 的"一切都是对象、对象之间发消息"听起来和 Actor 一模一样——它们确实是亲戚

## 核心要点

Actor 形式系统的精髓就 **三条** 规则：

1. **每个 actor 有 mail address**：地址不是内存指针，是一个抽象名字。你不能"读它的内部"，只能往这个地址塞信。类比：你知道隔壁老王的门牌号，但你不能直接打开他冰箱。

2. **消息异步、无序**：你寄出信就回去干自己的事，不等回信；同一个收件人收到信的顺序**不保证**和你寄出的顺序一致。类比：邮局派送同一天的两封信，可能下午那封先到。

3. **行为可替换**：actor 处理完一封信，会指定"下一封信来该用哪个行为处理"。这等价于"改自己的内部状态"，但用替换函数而不是赋值。类比：今天的我决定"明天早起"，明天的我就执行新作息。

三条规则加起来：**没有共享变量，没有锁，并发天然安全**。

## 实践案例

### 案例 1：Erlang 的进程其实就是 actor

```erlang
counter(N) ->
  receive
    inc       -> counter(N + 1);
    {get, To} -> To ! N, counter(N)
  end.
```

这是一个计数器 actor。`receive` 等信，收到 `inc` 就用 `N+1` 重新当 actor（行为替换），收到 `{get, To}` 就给 `To` 这个地址回信。**没有共享内存**——别的进程要 N，必须发一条 `{get, self()}`。

### 案例 2：Akka 把同样的思想搬到 JVM

```scala
class Counter extends Actor {
  var n = 0
  def receive = {
    case "inc"      => n += 1
    case ("get", s) => sender() ! n
  }
}
```

`var n` 看起来像共享变量，但**只有这一个 actor 能动它**。其他线程想加 1 必须发 `"inc"` 这条消息——Akka 内部串行处理同一 actor 的消息队列。这就是 Actor 把"并发"压成"单线程逻辑"的关键。

### 案例 3：Orleans 把 actor 变成"自动持久化的云对象"

```csharp
public interface ICounter : IGrainWithIntegerKey {
  Task Increment();
  Task<int> Get();
}
```

Orleans 的 grain 就是 actor。你不需要 new，集群会自动在某台机器上"激活"它；不用了自动钝化、写到数据库；下次访问自动复活。**程序员只写消息处理**，分布式由 actor 模型免费送。

## 踩过的坑

1. **以为 Actor = 对象 + 多线程**：传统对象方法调用是同步的，调用方等返回值。Actor 发消息**立刻返回**，等回信要再写一条 receive。把 Actor 当对象写会出现"为什么我 set 完读不到"。

2. **依赖消息顺序**：先发 `start`、再发 `data` 给同一个 actor，**对方可能先收到 data**。要顺序就在消息里带 sequence number，让 actor 自己缓存乱序的早到消息。

3. **死信悄悄丢失**：发给已经退出的 actor 的消息默认进 dead letter queue，**不抛异常**。没监督树（supervisor）的话查 bug 像查丢失的信。

4. **Actor 不是万能**：高频小消息（百万级 QPS）排队 + 调度开销可能比共享内存大；纯 CPU 密集计算用 Actor 反而慢。它擅长的是 IO 密集 + 故障隔离。

## 适用 vs 不适用场景

**适用**：

- 高并发、高可用的网络服务（电话、聊天、IM、游戏服务器）
- 故障必须隔离的系统（一个 actor 挂了不能拖死其他）
- 分布式系统（actor 在哪台机器对调用方透明）
- 状态机大量并存的场景（每个用户、每个订单一个 actor）

**不适用**：

- CPU 密集的数值计算（GEMM、FFT）——共享内存 + SIMD 更快
- 强事务一致性场景（银行扣款）——actor 间没有原子提交，要 Saga / 2PC 补
- 极简单的请求-响应（一个 HTTP handler）——上 actor 反而过度设计
- 实时硬约束场景——消息队列调度引入不确定延迟

## 历史小故事（可跳过）

- **1971 年**：Hewitt 在 MIT AI 实验室做 PLANNER 语言，想用它写"会推理的 AI"，发现"函数 + 控制结构"描述并发推理太僵硬。
- **1973 年**：Hewitt 与学生 Bishop、Steiger 在 IJCAI 提出 Actor。受 Simula 67 的对象、Smalltalk 的消息启发，但更激进——**连函数调用都用消息表达**。
- **1986 年**：爱立信的 Joe Armstrong 做电话交换机软件，发现 Actor 思想正好——每条电话呼叫一个进程、崩了重启。Erlang 由此诞生，跑了 30 年。
- **2009 年**：Jonas Bonér 把 Actor 带到 JVM，做了 Akka，让 Java/Scala 也能用。
- **2014 年**：微软研究院做 Orleans，把 Actor 做成"虚拟 grain"，进入 Halo 4 的服务器。
- **2020 年代**：Rust 的 actix、Go 的 ergo、Cloudflare Durable Objects——Actor 思想在云原生场景持续复活。

## 学到什么

1. **共享内存不是并发的唯一答案**——70 年代就有人想出"完全不共享、只发消息"的路子，今天才被广泛理解。
2. **统一的极简模型威力巨大**：Actor 三条规则同时解释了对象、并发、分布式、容错——比给每个问题各造一套机制省得多。
3. **学术 → 工程隔了 13 年**：1973 年的论文 1986 年才有 Erlang 工业落地，再过 23 年才有 Akka。理论先行，等硬件和需求追上来。
4. **形式比性能更长寿**：1973 年的 actor 形式至今没变，Erlang / Akka / Orleans 都是它的实现。

## 延伸阅读

- 论文 PDF：[Hewitt-Bishop-Steiger 1973](https://web.media.mit.edu/~lieber/Lieberary/Actors/Actor-Formalism.pdf)（IJCAI 原版，10 页，密度高）
- 视频：[Carl Hewitt 亲自讲 Actor](https://www.youtube.com/watch?v=7erJ1DV_Tlo)（创始人版本，可窥原意）
- 工程入门：[Joe Armstrong — Programming Erlang](https://pragprog.com/titles/jaerlang2/programming-erlang-2nd-edition/)（用 actor 写电话交换机的最经典教材）
- 现代复盘：[Roland Kuhn — Reactive Design Patterns](https://www.manning.com/books/reactive-design-patterns)（Akka 团队总结 actor 工程经验）
- 论战：[Hewitt — Actor Model vs Lambda Calculus](https://arxiv.org/abs/1008.1459)（晚年论文，Hewitt 主张 Actor 比 lambda 演算更基础——不一定对，但读起来精彩）
- [[erlang-otp]] —— Actor 思想最成功的工业落地
- [[milner-pi-calculus]] —— 90 年代用形式语义重做"会动的通道"

## 关联

- [[erlang-otp]] —— Erlang 进程就是 actor，OTP 是它的工程化封装
- [[orleans]] —— 微软把 actor 升级成"自动持久化的云 grain"
- [[smalltalk-80]] —— "一切是对象、对象间发消息"是 actor 思想的近亲
- [[simula-67]] —— 提供了"对象自带行为和状态"的最早原型
- [[milner-pi-calculus]] —— 同样讲消息传递，但用进程演算给出形式语义
- [[csp-hoare-1978]] —— Hoare 同年的并发模型，但用 channel 而非 mailbox
- [[mccarthy-lisp]] —— Lisp 的 lambda 影响了 actor 的"行为替换"思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hoare-csp-1978]] —— Hoare CSP 1978 — 把并发看成会对话的小程序
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[capnproto]] —— Capn Proto — 数据布局即 wire format 的零拷贝序列化 + RPC
- [[freertos]] —— FreeRTOS-Kernel — KB 级 RAM 跑得动的可抢占多任务内核
