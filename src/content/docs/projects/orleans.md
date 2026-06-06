---
title: Orleans — 让分布式服务写起来像单机对象
来源: 'https://github.com/dotnet/orleans'
日期: 2026-05-30
子分类: Web 后端
分类: 后端 API
难度: 中级
provenance: pipeline-v3
---

## 是什么

Orleans 是 .NET 平台上的**分布式 virtual actor framework**，把每个有状态实体抽象成一颗 **grain**（虚拟 actor），开发者按单机面向对象的方式写代码，运行时自动负责把 grain 分发到集群、按需激活和休眠、做位置透明调用、状态持久化。

日常类比：像一个**永远营业的快递柜**——每个客户都有自己的格子（grain），格子在哪台机器上你不用关心，你按客户号去取/放东西，柜子运营商负责调度仓位、断电恢复、排队送达。

你写：

```csharp
public interface IPlayerGrain : IGrainWithStringKey {
    Task<int> AddScore(int delta);
}
```

调用：

```csharp
var p = client.GetGrain<IPlayerGrain>("alice");
await p.AddScore(10);  // alice 这颗 grain 在哪台 silo 上？runtime 自己找
```

这个"runtime 自己找位置 + 自己拉起 / 关掉 grain"的能力，是 Halo 4/5、Skype、Azure IoT Hub 敢用单一编程模型撑百万在线的核心机制。

一个集群里所有运行 grain 的 .NET 进程叫 **silo**（"筒仓"，存粮食的）。silo 之间互相心跳，组成 cluster。某个 silo 挂掉，它身上的 grain 在下一次被调用时会被自动激活到另一台健康的 silo——这就是"虚拟"的含义：grain 的生命不绑在某台具体机器上。

## 为什么重要

不理解 Orleans 的 virtual actor 模型，下面这些事都没法解释：

- 为什么写分布式有状态服务一直是后端工程的"大魔王"——分片、再平衡、失败接管全要手工管
- 为什么 Erlang/OTP 的 actor 模型在游戏 / 通讯领域复活了一次（Orleans 是 .NET 世界的那次复活）
- 为什么 Halo 4 上线时同时在线百万玩家，但写后端的工程师不到 20 人
- 为什么"无服务器"和"有状态"长期对立，virtual actor 给了一种调和方案

## 核心要点

Orleans 的核心可以拆成**三块**：

1. **Grain 是虚拟 actor**：grain 在逻辑层面"永远存在"，你按 ID 调用它就能用。runtime 在第一次调用时把它激活到某台 silo（进程），闲置一段时间自动休眠。类比：电话号码永远存在，号码本身不占人，打过去才有客服上线接听。

2. **位置透明 + 单线程语义**：调用 grain 看起来就是普通方法调用（带 `await`），背后可能跨机器；同一颗 grain 内方法**串行执行**，所以不用写锁。类比：每个客户的格子只有一个工作人员，他一次只处理一个请求，自动避免并发冲突。

3. **状态持久化 = 主动 WriteStateAsync**：grain 有 `State` 属性，但你**必须显式**调 `WriteStateAsync` 才落盘（Azure Storage / SQL / Redis 等 provider）。这一步把"内存对象"和"持久化对象"的边界画清楚。

三块加起来，让你用"调用对象方法"的姿势写**带状态、能伸缩、能容错**的服务。

## 实践案例

### 案例 1：多人游戏房间

```csharp
public class RoomGrain : Grain, IRoomGrain {
    private readonly List<string> _players = new();
    public Task Join(string name) {
        _players.Add(name);
        return Task.CompletedTask;
    }
    public Task<int> Count() => Task.FromResult(_players.Count);
}
```

每个房间一颗 grain，按房间 ID 寻址。10 万房间 = 10 万 grain，runtime 自动散到集群。同房间的玩家请求**自动串行**，不用任何锁。

### 案例 2：IoT 数字孪生

```csharp
public class DeviceGrain : Grain<DeviceState>, IDeviceGrain {
    public async Task UpdateTelemetry(double temp) {
        State.LastTemp = temp;
        State.UpdatedAt = DateTime.UtcNow;
        await WriteStateAsync();   // 显式落盘
    }
}
```

一台设备一颗 `DeviceGrain`，存最近一次遥测、阈值、配置。设备上报数据走 `await device.UpdateTelemetry(data)`。设备一年没上线，grain 自动休眠不占内存；上线第一秒立刻被运行时重新激活，状态从 storage 自动加载。Azure IoT Hub 的 device-twin 概念就是这个范式。

### 案例 3：排行榜（热点 grain 警告）

```csharp
public interface ILeaderboardGrain : IGrainWithStringKey {
    Task Submit(string player, int score);
    Task<List<(string, int)>> Top(int n);
}
```

一个全局排行榜 = 一颗 grain。**问题**：所有写入都走这一颗，串行队列变瓶颈。**修复**：分桶——按玩家 ID hash 成 100 颗 ShardLeaderboardGrain，再用一颗 RootGrain 定期合并 top-N。这是用 Orleans 必学的"避免热点"模式。

## 踩过的坑

1. **把全局集合当成一颗 grain**：写"users 单例 grain 装所有用户"，瞬间所有请求排队，吞吐归零。grain 应该按**自然分区键**（用户 ID / 房间 ID / 设备 ID）建。

2. **忘了 WriteStateAsync**：grain 状态在内存里改了不持久化，silo 重启就丢。新人最常见的"我明明改了状态怎么没了"。

3. **Reentrancy 默认关闭**：grain A 调 grain B，B 在执行中又回调 A，A 这边的方法还没返回——死锁。要么把 grain 标 `[Reentrant]`，要么重排调用图避免环。

4. **timer / reminder 混用**：grain 内的 `RegisterTimer` 在 grain 休眠后**会丢**；要跨休眠周期触发必须用 `Reminder`（持久化定时器）。把 reminder 当 timer 用会让你以为 timer 不可靠。

## 适用 vs 不适用场景

**适用**：

- 大量自然分区的有状态实体（玩家 / 设备 / 会话 / 文档 / 房间）
- 需要"按 ID 调用"的细粒度服务，单实体吞吐不极端
- .NET 技术栈、希望少写分布式样板代码

**不适用**：

- 单点高吞吐写入（数据库 / 消息队列才是答案，不是 grain）
- 强一致性跨 grain 事务——Orleans 有事务支持但代价高，重事务用专门数据库
- 需要细粒度控制 grain 物理位置（virtual actor 的核心是"你不该关心位置"）
- Java / Go / Python 团队（Orleans 强绑 .NET；类似模型可看 Akka / proto.actor）

## 历史小故事（可跳过）

- **2010 年**：Microsoft Research 启动 Orleans 项目，背景是 Halo 4 后端无法用传统"无状态服务+数据库"扛百万在线对战
- **2011 年**：原型代号 "Cloud Computing Futures"，提出 virtual actor 概念——actor 在逻辑层永存，物理层按需起停
- **2014 年**：343 Industries 用 Orleans 上线 Halo 4 全球玩家服务；玩家匹配 / 状态 / 战绩全跑在 grain 上
- **2015 年 1 月**：Orleans 开源到 GitHub（dotnet/orleans）
- **之后**：Skype messaging、Azure IoT Hub device twin、Halo 5、Gears of War、Visual Studio Online 都用上 Orleans 模型

## 学到什么

1. **virtual actor**——actor 永远存在的抽象，把"在哪台机器、什么时候启动"从开发者头上拿走
2. **位置透明 + 单线程 grain**——并发安全靠"每实体串行"而不是锁；规模靠 grain 数量水平扩展
3. **抽象层级要选对**：grain 是"细粒度有状态实体"，全局集合 / 高吞吐流不该套 grain，要分桶或换工具
4. **runtime 接管的代价**：写得快但调试链路长，热点 / 死锁 / 状态丢都来自"以为 runtime 帮你管，其实没"

## 延伸阅读

- 官方文档：[Microsoft Learn — Orleans Overview](https://learn.microsoft.com/dotnet/orleans/overview)（30 分钟读完，含 grain / silo / cluster 三层）
- 论文：[Orleans: Distributed Virtual Actors for Programmability and Scalability](https://www.microsoft.com/en-us/research/publication/orleans-distributed-virtual-actors-for-programmability-and-scalability/)（MSR-TR-2014）
- 视频：[Sergey Bykov — Orleans @ NDC 2015](https://www.youtube.com/watch?v=WgYsLwZxvHg)（Orleans 主创讲设计动机和踩坑）
- [[erlang-otp]] —— 同样是 actor 模型，先驱思想
- [[aspnetcore]] —— .NET 后端的 web 层，常和 Orleans 拼 silo + API 网关

## 关联

- [[erlang-otp]] —— Orleans 的 actor 模型直接对标 Erlang/OTP，差别在 virtual actor 抽象更彻底
- [[aspnetcore]] —— 通常 ASP.NET Core 当 API 层，Orleans 当业务+状态层
- [[temporal]] —— 同样解决"分布式有状态"，但 Temporal 走 workflow，Orleans 走 actor
- [[lamport-1978]] —— grain 内的串行执行让单 grain 视角的因果序天然成立
- [[raft]] —— Orleans cluster 内部用一致性协议管 silo membership
- [[kafka]] —— 高吞吐流处理的"反例"——别把 Kafka 干的事用 grain 抗
- [[tigerbeetle]] —— 单节点单写入串行的另一种实现路径，对比 grain 思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aspnetcore]] —— ASP.NET Core — 微软跨平台 web 框架
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[raft]] —— Raft — 易理解的共识算法
- [[temporal]] —— Temporal — 持久化工作流引擎
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库

