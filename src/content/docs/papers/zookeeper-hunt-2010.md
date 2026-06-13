---
title: ZooKeeper Wait-free Coordination 学习笔记
来源: https://www.usenix.org/legacy/event/usenix10/tech/full_papers/Hunt.pdf
日期: 2026-06-13
分类: 分布式系统
子分类: 共识与复制
provenance: pipeline-v3
---

# ZooKeeper：Wait-free Coordination for Internet-scale Systems

## 一、从"合租厨房"讲起

想象你和三个室友合租一套房子。厨房里有一个冰箱，你们都往里面放食材、拿东西。

这里会出现几个典型问题：

- **谁先放**？如果你和室友同时往冰箱里写同一个位置，数据会乱掉
- **怎么知道变没变**？你不在厨房时，室友换了冰箱里的调料，你怎么知道？
- **冰箱坏了怎么办**？如果冰箱坏了，你们还能做饭吗？
- **谁说了算**？你们争论菜谱时，听谁的？

分布式系统面临的是完全相同的问题。ZooKeeper 就是一个"数字冰箱"——它让成千上万个程序（在多台机器上运行）能够协调地读写同一个共享状态。

它的核心主张是：**简单接口 + 极高吞吐 = 可以广泛使用**。

> 论文原文：*ZooKeeper aims to provide a simple and high performance kernel for building more complex coordination primitives at the client.*

## 二、核心概念

### 2.1 ZNode：层级命名空间

ZooKeeper 的数据模型就像一个简化版文件系统：

```
/
├── app1
│   ├── lock
│   ├── config
│   └── leader
├── app2
│   └── nodes
```

每个节点叫 **znode**，每个 znode 存的数据最多 1MB（默认很小，通常只有几字节）。

znode 有两种特殊类型：

| 类型 | 行为 | 类比 |
|------|------|------|
| **持久化 znode** | 创建后一直存在，除非被显式删除 | 冰箱里permanent贴的标签 |
| **临时 znode** | 客户端断开会由系统自动删除 | 冰箱里的"在位证"，人走证就废 |

临时 znode 是实现心跳检测的关键——如果一个服务挂了，它的临时 znode 自动消失，其他节点立刻知道。

### 2.2 Watch 机制：不用轮询的通知

传统做法：每 5 秒问一次"配置变了吗？"——这叫 **polling**，浪费资源。

ZooKeeper 的 watch 机制像订了报纸：

1. 你读 `/app/config` 时带上 watch 标志
2. 服务器说：给你，顺便以后 `/app/config` 变了就通知我
3. 以后配置一变，服务器主动推一条事件给你
4. **watch 是一次性的**——收到一次通知后自动注销

> Watch 只告诉你"变了"，不告诉你"变成什么了"。你需要再读一次拿到新值。

### 2.3 Wait-free：为什么重要？

**Wait-free** 的意思是：无论其他进程在做什么（即使它们一直崩溃），每个正确调用的操作都保证在有限步内完成。

类比：你去银行柜台办业务。Wait-free 意味着不管队伍里有人吵架、有人插队、有人晕倒，你的业务**一定**能在有限时间内办完，不会被无限期阻塞。

在 ZooKeeper 中：

- **读操作**（getData、exists、getChildren）是 wait-free 的——每个服务器本地就能处理，不需要和其他服务器商量
- **写操作**需要 leader 协调（通过 ZAB 协议），但论文保证：只要多数派服务器存活，写操作也能在有限时间内完成

这就是论文标题 "wait-free coordination" 的核心含义。

### 2.4 两大排序保证

ZooKeeper 提供两个关键保证：

1. **FIFO 客户端顺序**：同一个客户端发来的请求，按发送顺序执行
2. **线性化写入**（A-linearizability）：所有写操作可以被排成一个全局顺序，符合因果逻辑

这两个保证让上层协议（如锁、选主）的实现变得简单——你不需要考虑"我的请求会不会被乱序处理"。

### 2.5 ZAB 协议：原子广播

ZooKeeper 内部使用 **ZAB（ZooKeeper Atomic Broadcast）** 协议保证多副本一致性：

```
客户端 → Leader → Follower1 (广播提案)
                    Follower2
                    Follower3
Leader 收集多数确认 → 提交事务 → 应用数据树
```

流程：
1. 客户端连接任意服务器提交写请求
2. 请求被转发给 Leader
3. Leader 给每个请求分配全局递增的事务 ID（zxid），向所有 Follower 发送提案
4. Follower 写入本地磁盘（write-ahead log）后回复 ACK
5. Leader 收到多数派 ACK 后提交事务，广播 commit
6. 所有服务器将事务应用到内存数据树

> 关键设计：读操作不走 ZAB！读直接从本地内存返回，这是 ZooKeeper 高吞吐的秘密武器。

## 三、代码示例

### 示例 1：实现分布式锁（无 herd effect 版本）

最粗暴的锁实现：所有等待者同时去抢，这叫 herd effect（羊群效应），就像一扇门开了100个人一起挤。

ZooKeeper 的方案是**排队等号**——每个客户端只看前面一个人的 znode：

```python
# 伪代码：ZooKeeper 分布式锁
def acquire_lock(zk, lock_path="/app/lock"):
    """
    创建临时顺序节点，排队等待锁
    """
    # 1. 创建一个临时+顺序节点（zk 自动追加序列号，如 lock-0000000001）
    my_znode = zk.create(
        f"{lock_path}/lock-",    # 路径模式
        b"",                      # 空数据
        ephemeral=True,          # 临时：断连自动删除
        sequential=True          # 顺序：自动追加递增序号
    )

    while True:
        # 2. 获取父节点下所有子节点
        children = zk.get_children(lock_path, watch=False)

        # 3. 如果我的 znode 序号最小，说明我排第一，拿到锁
        if my_znode == min(children):
            return True

        # 4. 找出比我小的最大那个节点（我前面那个人）
        my_seq = int(my_znode.split("-")[-1])
        predecessors = [c for c in children if int(c.split("-")[-1]) < my_seq]
        prev_znode = lock_path + "/" + max(predecessors)

        # 5. 只关注前一个人！如果他被删了（锁释放了），我就被唤醒
        zk.exists(prev_znode, watch=True)

        # 6. 等待 watch 触发（前一个人释放了锁），循环回去重新检查
        #    （注意：前一个人可能挂了没拿锁就走了，所以要 re-check）
        wait_for_watch_event()
        # 回到步骤 2 重新排队


def release_lock(zk, my_znode):
    """删除自己的 znode 释放锁"""
    zk.delete(my_znode)
```

这个设计的精妙之处：只有排在当前人前面的那一个节点被删除时，才会触发 watch 通知**当前这个人**。其他人完全不受影响。

### 示例 2：动态配置管理

ZooKeeper 最常见的用途：让成百上千个服务实例共享一套配置，配置变更时自动感知：

```python
# 伪代码：动态配置管理
def load_config_with_watch(zk, config_path="/app/config"):
    """
    读取配置，并注册 watch 以自动感知变更
    """
    # 第一次：读取配置 + 注册 watch
    data, stat = zk.get(config_path, watch=True)
    config = parse_config(data)

    while True:
        # 7. 用配置干活……
        result = do_work(config)

        # 8. 等待配置变更通知（watch 是一次性的！）
        #    注意：客户端可能因为网络延迟收不到 watch
        #    论文建议：收到通知后先写操作（flush），再读
        event = zk.receive_watch_event(timeout=60)

        if event and event.path == config_path:
            # 9. 先 sync（可选，确保读到最新值）
            zk.sync(config_path)
            # 10. 重新读取配置
            data, stat = zk.get(config_path, watch=True)  # 重新注册 watch
            config = parse_config(data)
            print(f"配置已更新！新值：{data}")

        yield result
```

> 论文中提到的 subtle bug：客户端 A 更新了配置，通过另一个通道告诉客户端 B。B 去 ZooKeeper 读时，可能读到的还是旧副本（因为各服务器的数据还没同步完）。解决方法是先做一个写操作（或 sync），再读，这样就能保证读到最新数据。

### 示例 3：Leader 选举

这是 ZooKeeper 最经典的应用场景：

```python
# 伪代码：Leader 选举
def elect_leader(zk, election_path="/app/election"):
    """
    多个节点竞争 leader 身份，只有一个成功
    """
    # 创建临时顺序节点
    my_znode = zk.create(
        f"{election_path}/node-",
        b"",
        ephemeral=True,
        sequential=True
    )
    my_seq = int(my_znode.split("-")[-1])

    # 获取所有竞选节点
    children = zk.get_children(election_path, watch=True)
    min_seq = min(int(c.split("-")[-1]) for c in children)

    if my_seq == min_seq:
        print(f"我（{my_seq}）当选 leader！")
        return "LEADER"
    else:
        # 不是 leader，监听当前 leader 的节点
        leader_znode = f"{election_path}/node-{min_seq:010d}"
        zk.exists(leader_znode, watch=True)
        print(f"我是 follower，监听 leader（{my_seq}）")
        return "FOLLOWER"
        # 当 leader 节点消失（watch 触发），重新选举
        # （可能自己就是新的最小序号）
```

临时节点在这里是关键：leader 挂了，它的 znode 自动消失，watch 触发，剩下的节点重新选举。

## 四、性能数据

论文中的实测数据令人印象深刻（50 台服务器集群）：

| 配置 | 纯读吞吐 | 纯写吞吐 | 延迟（3 节点） |
|------|----------|----------|---------------|
| 3 台 | ~87K ops/s | ~21K ops/s | ~1.2ms |
| 13 台 | ~460K ops/s | ~8K ops/s | — |

几个关键发现：

- **读远快于写**：读操作 10:1 到 100:1 的比例是典型工作负载
- **读不经过 ZAB**：每个服务器本地处理读，所以读吞吐随节点数线性增长
- **写受限于原子广播**：leader 是瓶颈，节点越多写吞吐反而下降
- **容错快**：选主通常 < 200ms，follower 挂掉几乎不影响

## 五、和 Chubby 的对比

论文将 ZooKeeper 与 Google Chubby 做了比较：

| 特性 | ZooKeeper | Chubby |
|------|-----------|--------|
| 读请求 | 任何服务器处理 | 必须去 leader |
| 一致性 | 最终一致（松弛） | 强一致 |
| 性能 | 高吞吐 | 中等 |
| 接口 | 层级文件系统 API | 层级文件系统 API |
| 设计哲学 | 可以用它做锁 | 它就是一个锁服务 |

ZooKeeper 的核心设计选择是**用一致性换性能**——读操作允许读到旧数据（通过 sync 可以补救），因此读不需要经过 leader，吞吐量大幅提升。这使得 ZooKeeper 可以被大量使用，而 Chubby 往往只用在关键路径上。

## 六、总结：ZooKeeper 的思想精髓

1. **简单就是力量**：层级命名空间 + 小数据 + 全读全写，接口极简
2. **读本地、写集中**：读走本地副本、写走 leader 协调，兼顾吞吐和一致性
3. **Watch 代替轮询**：事件驱动，不需要客户端反复查询
4. **排队代替抢锁**：顺序节点 + watch，精确唤醒，消灭 herd effect
5. **Wait-free 的保证**：无论系统多乱，操作一定能在有限时间内完成

ZooKeeper 证明了：一个足够简单、足够快的协调内核，可以让上层应用广泛使用它，从而构建出更复杂的分布式原语——锁、选主、屏障、配置管理……全部可以用它的 API 实现。

这就是论文标题所说的 **wait-free coordination for Internet-scale systems**。
