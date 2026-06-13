---
title: Akka: A Component Model for Building Elastic Systems
来源: https://www.researchgate.net/publication/261530356
日期: 2026-06-13
分类: 分布式系统
子分类: systems-dist
provenance: pipeline-v3
---

# Akka: A Component Model for Building Elastic Systems

## 一、引言：我们要解决什么问题？

想象你开了一家越来越火的餐馆。

刚开始，只有一个厨师（单线程程序），能应付。客人多了，你请了第二个、第三个厨师。问题来了：

- 厨师之间怎么沟通？一个炒菜、一个切菜，他们得协调
- 某个厨师突然请假了（服务崩溃），怎么办？
- 客人暴增时，怎么快速加人手？客人少了时，怎么让人休息省资源？

在计算机世界里，这就是**分布式系统**和**并发编程**的难题。传统的线程（Thread）方案是：每来一个客人就派一个服务员去盯——客人一多，服务员本身就成了瓶颈。

Akka 提出了一种新思路：**不用线程管一切，而是用"Actor"（角色）来管**。

> Actor 模型最早由 Carl Hewitt 在 1973 年提出。Erlang 语言用它构建了电信级的高可用系统。Akka 则是 Java/Scala 生态中最成熟的 Actor 框架实现。

---

## 二、核心概念：Actor 是什么？

### 2.1 一个Actor = 一个独立的小人

把每个 Actor 想象成一个**有自己的邮箱、只按自己邮箱顺序读信的小人**：

| 概念 | 类比 | 技术含义 |
|------|------|----------|
| Actor | 一个小人 | 一个独立的计算单元 |
| 邮箱（Mailbox） | 小人的收件箱 | 消息队列，按顺序处理 |
| 消息（Message） | 信件 | 发送给 Actor 的数据 |
| ActorRef | 小人的地址 | 对 Actor 的引用，可跨网络发送 |
| 消息传递 | 把信塞进邮箱 | 异步、非阻塞的通信方式 |

**三条铁律**（Actor 模型的核心）：

1. **不要共享数据**——每个 Actor 有自己的状态，绝不直接访问别人的变量
2. **只通过消息通信**——给别人的邮箱发消息，`actorRef ! message`
3. **异步处理消息**——发完消息就继续干别的事，不等回复

### 2.2 ActorSystem：小人们的大本营

所有 Actor 都必须属于一个 ActorSystem。你可以把它理解为**一栋大楼**：

- 大楼里有前台（Guardian Actor，负责监控顶层 Actor）
- 有楼层（ActorHierarchy，父子层级关系）
- 有物业（调度器 Dispatcher，决定哪个小人什么时候处理哪封信）

**一个应用只创建一个 ActorSystem**，因为它是重量级基础设施。

---

## 三、实战：用 Akka 写第一个 Actor

### 3.1 创建一个简单的 Actor

下面是一个 Scala 示例，实现一个"计数器" Actor：

```scala
import akka.actor.Actor
import akka.actor.Props
import akka.event.Logging

class CounterActor extends Actor {
  val log = Logging(context.system, this)
  var count = 0

  def receive = {
    case "increment" =>
      count += 1
      log.info(s"Count is now: $count")

    case "get" =>
      sender() ! count  // 回复发消息的人

    case _ =>
      log.info("Received unknown message")
  }
}
```

逐行解释：

- `extends Actor`：声明这是一个 Akka Actor
- `def receive = { ... }`：定义这个 Actor 能处理的消息类型。用 Scala 的模式匹配（pattern matching）来区分不同消息
- `case "increment" =>`：收到 "increment" 时，计数器加 1
- `case "get" => sender() ! count`：收到 "get" 时，把当前计数通过 `!` 操作符回复给发送者
- `sender()`：自动指向**上一个消息的发送者**——就像写信人署名，收到信就知道回复给谁

### 3.2 创建 Actor 并发送消息

```scala
import akka.actor.ActorSystem

// 创建 ActorSystem（大楼）
val system = ActorSystem("mySystem")

// 通过 Props 创建 Actor（按图纸造小人），拿到 ActorRef（地址）
val counterRef = system.actorOf(Props[CounterActor](), "counter")

// 发送消息（给小人寄信）
counterRef ! "increment"
counterRef ! "increment"
counterRef ! "get"

// 等一会儿让消息处理完
Thread.sleep(1000)

// 关闭系统
system.terminate()
```

关键概念：

- `Props`：创建 Actor 的配置/配方，是不可变的、可共享的。就像"小人制造图纸"
- `actorOf()`：根据 Props 创建 Actor，返回 `ActorRef`。ActorRef 是**不可变的**、**可序列化的**、**感知网络的**——意味着你可以把它发给另一台电脑上的 Actor，它仍然指向原来的那个 Actor
- `!`：发送消息的操作符（也叫 "tell"），**发完即忘，不等回复**

---

## 四、核心概念深入

### 4.1 监督策略（Supervision Strategy）

回到餐馆的例子：如果一个厨师炒糊了菜（抛出异常），怎么办？

传统方案：厨师直接崩溃，系统停摆。

Akka 的方案：**每个 Actor 都有父 Actor 监督**。子 Actor 出问题时，父 Actor 按预设策略决定怎么做：

| 策略 | 含义 | 餐馆类比 |
|------|------|----------|
| Restart（重启） | 销毁当前 Actor 实例，创建新实例（ActorRef 不变） | 炒糊了，换同一个厨师重新来 |
| Resume（恢复） | 跳过这条消息，继续处理下一条 | 炒糊了，跳过这道菜，做下一道 |
| Stop（停止） | 永久停止这个 Actor | 厨师辞职，不再上岗 |
| Escalate（上报） | 让父 Actor 的父来处理 | 厨师长也搞不定，上报老板 |

这是 Akka 实现**弹性（Elastic）**的关键：错误不会传播，只会被局部消化。

### 4.2 弹性（Elasticity）

"弹性"指的是系统能**自动伸缩**以应对负载变化。Akka 通过三个层面实现：

1. **水平伸缩**：创建更多 Actor 实例处理负载（Actor 轻量，一个 Actor 几乎不占线程）
2. **故障恢复**：通过监督策略自动重启出问题的 Actor
3. **地理分布**：ActorRef 可以指向远程节点上的 Actor，本地代码写一样的 API

### 4.3 事件流（EventStream）

ActorSystem 内置了一个发布-订阅系统。任何 Actor 都可以订阅系统事件，比如：

- 未处理的消息（UnhandledMessage）
- Actor 的创建和销毁
- 调试日志

这类似于一个"系统内网"，让所有 Actor 能间接感知全局状态。

---

## 五、实战：带监督的 Actor 层级

下面展示一个完整的父子 Actor 结构，包含监督策略：

```scala
import akka.actor.{
  Actor, ActorSystem, Props,
  OneForOneStrategy, SupervisorStrategy,
  Terminated
}
import scala.concurrent.duration._

// 子 Actor：一个处理用户请求的工作者
class WorkerActor extends Actor {
  def receive = {
    case work: String =>
      println(s"Worker processing: $work")
      // 模拟可能发生异常的场景
      if (work == "dangerous") throw new RuntimeException("Oops!")
      sender() ! s"Done: $work"

    case _ =>
      println("Unknown work received")
  }
}

// 父 Actor：监督子 Actor，定义重启策略
class SupervisorActor extends Actor {
  // 定义监督策略：OneForOne 表示只影响出问题的子 Actor
  // MAX 5 次重启，1 分钟内
  override val supervisorStrategy = OneForOneStrategy(maxNrOfAttempts = 5,
    withinTimeRange = 1 minute) {
    case _: RuntimeException => SupervisorStrategy.Restart  // 运行时异常 -> 重启
    case _: Exception      => SupervisorStrategy.Stop     // 其他异常 -> 停止
  }

  // 创建子 Actor
  val worker = context.actorOf(Props[WorkerActor](), "worker")

  // 监控子 Actor 的生命周期
  context.watch(worker)

  def receive = {
    case work: String =>
      worker ! work  // 转发给子 Actor

    case Terminated(`worker`) =>
      println("Worker has been terminated!")
  }
}

// 主程序
object Main extends App {
  val system = ActorSystem("ElasticSystem")

  val supervisor = system.actorOf(Props[SupervisorActor](), "supervisor")

  // 发送正常请求
  supervisor ! "process data"

  // 发送会导致异常的请求——但系统不会崩溃！
  supervisor ! "dangerous"
  // SupervisorActor 的监督策略会捕获异常，重启 WorkerActor

  Thread.sleep(2000)
  system.terminate()
}
```

这段代码展示了几个重要概念：

- **`OneForOneStrategy`**：只影响出问题的子 Actor，不影响其他兄弟 Actor
- **`context.watch()`**：注册对子 Actor 生命周期的监控
- **`Terminated` 消息**：子 Actor 被销毁时，父 Actor 会收到这条消息
- **弹性保证**：即使 "dangerous" 请求导致异常，WorkerActor 被重启后系统继续运行

---

## 六、Actor 的生命周期

每个 Actor 从出生到死亡经历几个阶段：

```
创建 → preStart() → 处理消息 → 遇到异常 → 重启(preRestart → preStart) → 停止(preStop)
```

| 生命周期钩子 | 何时调用 | 用途 |
|-------------|---------|------|
| `preStart()` | Actor 第一次创建后 | 初始化资源（创建子 Actor、打开连接等） |
| `postStop()` | Actor 被永久停止后 | 清理资源（关闭连接、释放内存等） |
| `preRestart()` | Actor 被重启前 | 默认行为：停止所有子 Actor，然后调用 `postStop()` |
| `postRestart()` | Actor 被重启后 | 默认调用 `preStart()`，可重写自定义重启逻辑 |

**重要区别**：重启 ≠ 停止再创建

- **重启**：Actor 的 UID（唯一标识）不变，`ActorRef` 仍然有效
- **停止再创建**：UID 改变，旧的 `ActorRef` 失效

---

## 七、总结

Akka 的核心价值可以用一句话概括：**用 Actor 模型简化并发和分布式系统的构建**。

三个关键词：

1. **消息驱动**——Actor 之间异步通信，没有锁，没有竞态条件
2. **弹性自愈**——监督策略让故障局部化，系统自动恢复
3. **位置透明**——本地 Actor 和远程 Actor 使用相同的 API，天然支持分布式

Akka 的设计思想影响了后来的许多技术，包括 Go 语言的 goroutine（"不要通过共享内存来通信，要通过通信来共享内存"的理念异曲同工）。

---

## 八、延伸思考

- Actor 模型虽然消除了锁的问题，但带来了新的难题：消息顺序性、重复投递、消息丢失怎么办？
- Akka 的"重启即销毁实例但保持地址不变"的设计，如何在实际业务中处理未完成的计算？
- 如果 Actor 数量达到百万级别（如物联网场景），ActorSystem 的性能瓶颈会在哪里？

这些问题值得进一步研究 Akka 的更多组件：Cluster（集群）、Persistence（持久化）、Streams（流处理）等。
