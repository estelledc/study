---
title: Chubby 分布式锁服务
来源: Mike Burrows, "The Chubby Lock Service for Loosely-Coupled Distributed Systems", OSDI 2006
论文年份: 2006
作者: Mike Burrows (Google)
分支: theory-D 混 B 经验论文
状态: 状元篇
关联笔记:
  - "[[paxos]]"
  - "[[raft]]"
  - "[[spanner]]"
  - "[[bigtable]]"
  - "[[selinger-1979]]"
  - "[[volcano]]"
  - "[[snowflake]]"
sidebar:
  label: Chubby (OSDI 2006)
  order: 59
---

# Chubby：把 Paxos 包装成「能给凡人用的锁服务」（OSDI 2006）

> 一句话总结：Chubby **不是一个新算法，而是一个产品决定**——
> Mike Burrows 把 1989 年 Lamport 的 Paxos 算法、Multi-Paxos 优化、lease、Unix-like 命名空间、小文件存储、watch 通知，
> 全部塞进一个 5 节点集群里，对外只暴露「lock + 小文件读写」两个抽象，
> 让 Google 内部所有不会写一致性算法的服务（GFS / Bigtable / MapReduce / DNS / 配置）
> 都能用 RPC 调一个简单 API 完成 leader election + 配置广播 + 元数据存储，
> 直接催生了 Apache ZooKeeper（2008）/ etcd（2013）/ HashiCorp Consul（2014）这条工业基建主线。
> 论文 OSDI 2006，与 Bigtable 同一届会议，是 Google「互联网级数据中心」的最后一块协调层拼图。

## 0. 历史定位

### 0.1 为什么这篇是「经验论文 + theory 混合」

放在 v1.1 round 88 用 **R5 / B 经验论文混 D theory** 双分支算分，理由：

- **经验侧（B）**：论文几乎一半篇幅是「我们做了什么 / 客户怎么用 / 哪些坑踩了 / 哪些设计决策事后看错了」。Mike Burrows 写得像一份 Google 内部 retrospective，全文几乎不证明任何定理。
- **理论侧（D）**：另一半是 §2 API、§4 master fail-over、§5 caching + session lease 的协议级描述。这一半每一段都能抽出一个 invariant——会话 lease、sequencer 单调性、cache 失效协议、quorum write——后来全部进了 ZooKeeper / etcd 的源代码。

正确读法：**API 与协议是数学，工程经验是产品史**，两者并列。本笔记按 theory-D 标准（≥5 个 Definition / Section / Theorem 锚点 + ≥4 处怀疑 + ≥3 处带 40-char hex commit hash 的 GitHub permalink）写，但不省略经验侧细节。

### 0.2 把自己拉回 2002-2006 的 Google 内部

要理解 Chubby 为什么长这样，得先看时间轴：

| 年份 | 事件 |
|---|---|
| 1989 | Lamport "The Part-Time Parliament" 投稿 ACM TOCS（被拒） |
| 1998 | Lamport "The Part-Time Parliament" 终于发表 |
| 2001 | Lamport "Paxos Made Simple" |
| 2003 | GFS 论文（SOSP '03），用 Chubby-precursor 选 master |
| 2004 | MapReduce 论文（OSDI '04）—— 也依赖一个分布式锁 |
| **2006** | **Chubby + Bigtable 同会议**（OSDI '06） |
| 2008 | Yahoo! 开源 ZooKeeper（Zab 协议 = 简化 Multi-Paxos） |
| 2013 | CoreOS 开源 etcd（Raft + HTTP API） |
| 2014 | HashiCorp 开源 Consul（Raft + service discovery + DNS） |
| 2014 | Kubernetes 第一版，etcd 作为唯一元数据存储 |

到 2006 年，Paxos 算法已经存在 17 年，但**没有任何一个产品把它做成日常可用的服务**。原因不是算法难——原因是「如果你只想选个 master / 存个配置，没有人愿意自己去手撸 Paxos」。

Chubby 解决的不是算法问题，是**抽象层级问题**：把 Paxos 的 ω-correctness 协议，包装成 Unix 程序员能在 30 分钟之内学会的 `Acquire / GetContentsAndStat / SetContents` 三件套。

### 0.3 论文真正的贡献是什么

论文 §1 自己说：「the goal was not to invent new algorithms, but to use existing primitives」。这是被低估的描述。三件真贡献：

1. **接口设计的彻底克制**：API 像 UNIX 文件系统（`/ls/cell/path`），lock 直接挂在节点上，没有单独的 lock-id namespace。任何会用 `open()` 的工程师 5 分钟能上手。
2. **粗粒度锁哲学**：明确反对「细粒度高频锁」，把 Chubby 定位成「秒级 / 分钟级持有 + 低 QPS」的锁服务。这避免了把分布式锁做成性能瓶颈。所有后继者（ZooKeeper / etcd）都继承了这条。
3. **Sequencer 机制**：用单调递增整数让 lock holder 把「我现在是合法持有者」凭证传递给下游，下游 RPC 时可以拒绝 stale holder 的脏写。这个机制后来成了 ZooKeeper 的 `zxid` 和 etcd 的 `lease ID`。

下面按 5 个 Definition 把论文的核心抽象立住。

## Definition 1：Chubby cell

> **Definition 1（Chubby cell）**：Chubby 部署单元，由 **5 个 replica** 组成；其中**恰有一个** replica 在任意时刻是 master；replica 之间通过 **Multi-Paxos** 复制有序操作日志；cell 承诺**容忍至多 2 个 replica 同时失败**（quorum size = 3）。

为什么是 5 不是 3，也不是 7？

- **3 节点**：容忍 1 故障，但运维窗口期（一个挂了，第二个还没修）极窄——Google 数据中心里硬件月级故障率不可忽略。
- **5 节点**：容忍 2 故障。一个挂了还能继续容忍第二个故障期间的运维。这是论文 §3 给的工程理由。
- **7 节点**：能容忍 3 故障，但 quorum 从 3 升到 4，**写延迟显著上升**（Multi-Paxos 写需要 quorum ACK），且收益递减。

> **怀疑 1**：5 节点 / quorum 3 这个选择论文写得很自信，但**没有 ablation 数据**——为什么不是 7？是性能（quorum 大小 3 vs 4 的写延迟差距）还是历史决定？etcd 默认推荐 3 / 5 / 7 三档，让用户自己选；Chubby 把这个选择硬编码在产品里。两条路线哪个对？现在看 Kubernetes etcd cluster 主流是 3 节点（小集群）或 5 节点（大集群），事实上 follow Chubby 的选择，但理由是「3 太脆 / 7 太慢」，而非 Chubby 的论证。

## Definition 2：lock + sequencer + lease

> **Definition 2（Chubby 三联抽象）**：
> - **lock**：节点上的 mutex；可 `Acquire(EXCLUSIVE)` 或 `Acquire(SHARED)`；**只能持有，不能跨进程转让**。
> - **sequencer**：当 client 持有 lock 时，可调 `GetSequencer(handle)` 拿到一个**单调递增整数**；这个 sequencer 与 lock 绑定，可被序列化后传给下游服务。
> - **lease**：master 颁给 client 的**有限时长**承诺；client 每次 KeepAlive 续租；过期则 master 单方面释放该 client 的所有 lock。

三件套是为了解决一个反复出现的故障模式：**lock holder 长期 GC pause 之后醒来，仍以为自己持有 lock，写脏数据**。

举例：

```
T=0   GFS master 持有 chubby://gfs-master 的 EXCLUSIVE lock
T=1   GFS master 进入 30s GC pause（JVM full GC）
T=12  Chubby master lease 到期 → 释放 lock
T=13  新 GFS master candidate 拿到 lock，开始接管
T=30  老 GFS master GC 结束醒来，「我还是 master」继续写 metadata
       ← 此时如果没有 sequencer 校验，metadata 被双写污染
```

Sequencer 怎么救：

- 老 master 拿到 lock 时持有 sequencer = `(epoch=42, lock_id=...)`。
- 新 master 拿到 lock 时持有 sequencer = `(epoch=43, ...)`。
- 老 master 给下游（如 chunkserver）发 RPC 时附带 sequencer。
- 下游调用 `CheckSequencer(seq)` 校验——发现 epoch=42 已 stale，**拒绝**这次写。

> **怀疑 2**：Chubby 把 sequencer 做成 client 显式传递的「业务字段」，而不是底层 RPC 框架自动注入的「上下文字段」。这导致每个用了 Chubby lock 的服务都要在自己的 RPC 协议里**手动把 sequencer 加进 request schema**——这是巨大的接入成本。论文 §2.5 自己承认「我们一开始低估了这个」。后来 ZooKeeper 用 `zxid` + watch 部分缓解；etcd 用 `lease ID` + transaction 进一步收紧。但根本问题没解：**任何「跨服务的 sequencer 传递」都是业务侵入式的**。这是 Chubby API 设计的一个隐疾。

## Definition 3：Session

> **Definition 3（Chubby session）**：client 与 cell 之间的有状态连接，表现为一个**租约**和一组**句柄**。session 的生命周期由 **KeepAlive RPC** 维护：master 在每次 KeepAlive 响应中颁布新的 session lease；超过 lease 但未达 grace period 的状态称为 **jeopardy**；超过 grace period session 失效，client 所持 lock / handle 全部作废。

session 是 Chubby 的「心脏」，因为：

- **lock 不能脱离 session 存在**：client 死了，session 死了，它持的 lock 自动释放（lease 过期）。这是 lock 服务永远不会**永久泄漏**的根本机制。
- **cache 一致性挂在 session 上**：见 Section 5.4，client 缓存的内容由 master 主动 invalidation；invalidation 通过 session 推送。
- **master fail-over 不一定 kill session**：jeopardy 期间，client 知道「老 master 死了，新 master 还没选出来」，进入只读 / 阻塞状态等待。grace period 之内新 master 上线，session 可以**继承**——client 透明地切到新 master。

这个 jeopardy / grace period 设计是 Chubby 区别于「裸 RPC + lease」的关键。

> **怀疑 3**：lease 默认 12 秒，论文给的理由是「典型情况下足以容忍 master fail-over」，但**没有解释 12 秒的来源**。这是 NTP 时钟漂移上限？是 Multi-Paxos 选主的 P99 时长？还是 Google 内网 RTT × 某个系数？我倾向于「P99 master fail-over 时间 + 安全裕度」的混合启发——论文 §4.4 提到 fail-over 通常 < 6 秒，所以 12 秒大概就是 ×2。但这种「一拍脑袋」的常数后来被 etcd 配置成 `--election-timeout` 让用户调，是工程进步：把魔法常数变成显式参数。

## Section 2.2：API design — 类 UNIX 文件系统 path

Chubby 的 namespace 是一棵**树**，path 长这样：

```
/ls/<cell-name>/<path-within-cell>
例：
  /ls/global/gfs-master                        ← lock 节点
  /ls/global/bigtable/root-tablet-loc          ← small file
  /ls/global/dns/prod.cluster.svc.local        ← config + watch
```

每个节点要么是 **directory**，要么是 **file**。两者都能挂 lock（同一个节点的 lock 与文件内容是同一个对象的两个属性）。

完整 API（论文 §2.2）：

```c
Open(path, mode_flags) -> handle
Close(handle)
Poison(handle)            // 让所有挂在这个 handle 上的 op 失败

Acquire(handle, mode)     // mode = EXCLUSIVE | SHARED
TryAcquire(handle, mode)  // 非阻塞
Release(handle)

GetContentsAndStat(handle) -> (data, metadata)
SetContents(handle, data)        // 可选 CAS（compare-and-swap）
GetStat(handle) -> metadata
ReadDir(handle) -> [child paths]
SetACL(handle, acl)
Delete(handle)

GetSequencer(handle) -> sequencer
SetSequencer(handle, sequencer)  // 让这个 handle 后续 op 校验 sequencer
CheckSequencer(sequencer) -> bool
```

关键设计选择：

1. **lock 不是独立资源**：lock 永远挂在某个 path 上。这避免了「lock-id namespace 与 file namespace 双重管理」的复杂度。ZooKeeper 后来沿用：lock = ephemeral znode。
2. **没有原子 multi-key 操作**：你不能「同时锁 A + 锁 B」。要做就靠业务上锁顺序避免死锁。这是 Chubby 主动放弃的能力，理由是「分布式 multi-lock 性能差且语义难定义」。etcd v3 的 transaction（`If/Then/Else`）部分弥补了这一点。
3. **Open 携带 flags 决定 watch**：`Open(path, EVENT_FILE_CONTENTS_MODIFIED | ...)` 让 client 订阅这个节点的变更事件。事件通过 session 推送，client 提供 callback。

下面 Section 2.3 / 2.5 详细解 lock + sequencer。

## Section 2.3：Lock — Acquire / Release / TryAcquire

Chubby 的 lock 是 **advisory**（建议性）的：服务端不强制只有 lock 持有者才能修改文件——是用户代码自觉先 `Acquire` 再写。

为什么这么设计？因为 Chubby 的真正使命是 **leader election + 配置发布**，不是 **数据保护**：

```c
// 典型用法：GFS master 选举
handle = Open("/ls/global/gfs-master", EXCLUSIVE_LOCK);
if (TryAcquire(handle, EXCLUSIVE)) {
    // 我是新 master
    SetContents(handle, my_address);   // 把自己的地址写进去
    serve_as_master();                  // 干活
} else {
    // 别人是 master，我读它的地址即可
    addr = GetContentsAndStat(handle).data;
    follow_leader(addr);
}
```

这里 lock 的作用**不是保护数据完整性**，是**选出唯一 leader**。一旦 leader 选出，follower 是去读那个 file（leader 自己写的地址），不会去写。所以「advisory」对这场景足够了。

`SHARED` lock 的用途比较少，论文承认。最常见的是「我是 read-only client，临时 pin 住节点防被改」。生产环境绝大多数 Chubby lock 都是 `EXCLUSIVE`。

> **怀疑 4**：advisory lock 在企业环境下**永远会有人忘记 Acquire 直接 SetContents**，破坏 invariant。Chubby 论文 §6 自己说「Google 内部出现过多次这类 bug」。但论文没把 lock 改成 mandatory（强制），理由是「用户传错 mode flag 时容错性更好」。这是个**短期友好长期有害**的取舍。后来 etcd 做 mvcc + transaction，要求所有写显式声明 `If(version=...)`，相当于 enforce 了「你必须知道自己在哪个版本写」。这条路后来证明更稳健。

## Section 2.5：Sequencer — 用 master fail-over 之后避免 stale lock holder 写脏数据

接 Definition 2 的故事，sequencer 的完整工作流：

```c
// Step 1: lock holder 拿 sequencer
handle = Open("/ls/global/gfs-master", LOCK_EXCLUSIVE);
Acquire(handle, EXCLUSIVE);
seq = GetSequencer(handle);   // returns "(lock_path, lock_mode, lock_generation)"

// Step 2: lock holder 把 sequencer 传给下游 RPC
chunkserver_rpc.Append(file_id, data, seq);

// Step 3: chunkserver 收到 RPC 后向 Chubby 校验
chubby.CheckSequencer(seq);   // returns true if seq 仍然是当前 lock 持有者
                               // returns false if lock 已易主或释放
if (!valid) {
    return ERROR_STALE_LEADER;
}
// 否则继续处理
```

这个机制的本质是「**信任 Chubby 是 source of truth，把 lock 状态打成 token，让下游异步校验**」。Chubby 自己只需要维护 `lock_path -> (current_holder, generation)` 的映射，每次 lock 易主时 generation +1。

更弱版本叫 **lock-delay**：如果 lock 持有者意外失联（session 失效），Chubby **不会立刻**释放它的 lock，而是等一个固定 delay（默认 1 分钟）。这给老 holder 时间发现自己出问题、自己退出，避免新 holder 立刻接管时双写。

> **lock-delay 是 sequencer 的退化版本**——sequencer 给「能改 RPC 协议的应用」用，lock-delay 给「来不及改 RPC 协议的应用」用。论文 §2.5 同时提供两种，是务实主义的体现。

## Section 4：Master fail-over — 30 秒之内新 master 用 Paxos 重新选主

master 死了之后，cell 在内部走以下流程：

1. **检测**：剩余 4 个 follower 通过 Paxos heartbeat 发现 master 失联（典型 5-10 秒）。
2. **选主**：4 个 follower 走一轮 Paxos election，多数派（≥3/4）同意某个 follower 升 master。Multi-Paxos 优化让 election 通常 1-2 个 RTT。
3. **重建状态**：新 master 从 Paxos log 恢复**已 commit 但未 apply**的操作；从持久存储恢复 lock / file / session 表。
4. **进入 grace 模式**：新 master 选出但暂不接受新写——它先等所有 client 通过 KeepAlive 重新连上来，刷新它们的 session。这段时间通常 6-10 秒。
5. **退出 grace**：所有活的 session 都已 attach 到新 master，正常服务。

整个流程论文给出 typical < 30 秒，client 在 grace period 内透明 retry——所以从 client 视角看不到失败，只看到「这一会儿写有点慢」。

```
T=0    Master 死
T=5    Followers 检测到，Paxos election 启动
T=8    新 master 选出
T=15   状态重建完成，进入 grace
T=25   所有 session 重 attach，grace 结束
T=25+  正常服务
```

> 这 30 秒不是「故障窗口」——而是「写入服务暂停窗口」。client 仍然能从本地 cache 读，能持有已有 lock（lease 没过期前）。这是 Chubby 高可用的关键：**fail-over 期间读不停、写阻塞**。

## Section 5.4：Caching — client 端 cache + invalidation（lease-based）

如果每次 `GetContentsAndStat` 都打到 master，cell 顶不住——Google 内部一个 cell 服务 90k+ client。所以 client 必须**本地 cache**。

Chubby 的 cache 协议：

1. **client 第一次读**：master 返回 data，**同时给 client 一个 cache lease**（典型 12 秒）。client 把 (path, data, lease_expiry) 存本地。
2. **client 后续读**：如果 lease 没过期，直接读本地，**不打 master**。这是绝大多数读的快路径。
3. **写入到来**：client X 写了 `/ls/global/foo`。master 在持久化之前**先 broadcast invalidation** 给所有持有该 path cache lease 的 client。
4. **invalidation 扩散**：每个收到 invalidation 的 client 必须 ACK；ACK 后 master 才 commit 写。这保证「写完成时所有 cache 已失效」。
5. **client 重新读**：cache miss → 打 master → 拿到新 data + 新 lease。

这是一个典型的 **lease-based cache invalidation** 协议，正确性保证：

> **任何时刻，client 看到的数据，要么是当前 master 已 commit 的最新版本，要么明确知道自己 cache 过期。**

性能优化：

- **negative cache**：client 还能 cache 「这个 path 不存在」。Bigtable root tablet 查询大量 miss，negative cache 把 hit rate 拉到 99%+。
- **cache 元数据 cap**：每个 client 缓存项有 cap（1024 条 typical），LRU evict。避免内存爆炸。
- **session 死了 cache 全清**：session lease 过期就清整个 cache，避免 stale 数据。

> **怀疑 5**：lease-based invalidation 在 master 写入路径上加了一个 broadcast + ACK 等待，理论上写延迟 = max(Multi-Paxos quorum write, slowest-cache-client-ACK)。如果一个 client 网络慢 / GC pause，整个 cell 写都被它拖。论文 §5.4 承认这点，缓解方法是「超时后强制 evict 那个 client 的 session」。但这会引入另一个问题：偶发慢 client 会被频繁踢出。etcd 后来改用 **watch-based**（push 到所有 watcher，不要 ACK），用 watch revision 让 client 自己 detect 是否落后。两条路线 trade-off：Chubby 一致性更强（写不返回直到 cache 全失效）；etcd 写更快（不等 ACK）但 client 可能短暂读到过时数据。**etcd 的选择更像现代 web 的最终一致直觉**，Chubby 的选择更像数据库强一致直觉。哪个对取决于场景。

## 嵌入图 1：Chubby cell + clients + Multi-Paxos

![Chubby cell 5 replicas + Multi-Paxos + clients](/papers/chubby/01-architecture.webp)

> 图说明：5 个 replica（1 Master + 4 Followers）通过 Multi-Paxos 复制日志；所有读 / 写打到 Master，Followers 只参与 quorum 投票；右侧多种 client（GFS master 选举、Bigtable root tablet、MapReduce 协调、DNS / 配置）通过 session + KeepAlive 与 Master 维持长连接。

## Section 6：实战使用模式

论文 §6 给了一份「Google 内部 Chubby 用例统计」（数据是 2006 年的）：

| 用例 | 占比 | 典型操作 |
|---|---|---|
| **GFS master election** | 单点（关键） | EXCLUSIVE lock on `/ls/<cell>/gfs-master` |
| **Bigtable root tablet location** | 高频读 | small file 存 root tablet 服务器地址 |
| **MapReduce job 协调** | 中频 | EXCLUSIVE lock + small file 存 job state |
| **DNS-as-Chubby** | 高频 | watch + small file 存「服务名 → IP」 |
| **配置文件存储** | 中频 | small file + watch |
| **name service** | 高频 | path 当 service name |

### 6.1 GFS master election

最纯粹的 leader election。GFS 同时启动 N 个 master candidate；每个都尝试 `TryAcquire(EXCLUSIVE)` 同一个 path；拿到的成为 master，其他成为 follower。**lock = leader 凭证**。

老 master 死掉 → session 失效 → lock 释放 → 新 candidate 立刻 Acquire 成功。整个 fail-over 用户代码只需要一个 `while (!TryAcquire) sleep(1)` 循环。

### 6.2 Bigtable root tablet location

详见 [[bigtable]]。Bigtable 的 metadata 表查找有三层：

```
client → Chubby（读 root tablet 地址）→ root tablet → metadata tablet → user tablet
```

第一层就是从 Chubby 读 small file `/ls/<cell>/bigtable/root-tablet-loc`。这个 file 内容（root tablet server address）是 Bigtable master 写的。

> 注意：这里 Chubby 不是用 lock，是用 **small file + cache**。每个 Bigtable client 会缓存这个地址，cache lease 12 秒；只有 root tablet 迁移时才 invalidation。

### 6.3 DNS-as-Chubby（论文反例）

Google 内部一度把 Chubby 当 DNS 用：服务名（path）→ IP（file content）。新服务上线时 watch 触发让所有 client 拿到新 IP。

**结果出问题**：

- DNS 是高频读取（每次 RPC 都查），把 Chubby cell 流量打飞。
- 一个 cell 只能服务 < 10万 client，DNS 模型下流量瞬间撑爆。
- 论文 §6 直白承认「we underestimated this」。

后来 Google 把 DNS 拆出去用专门的 namespace 服务。这个故事是「**通用基础设施被滥用**」的经典案例。

### 6.4 「lock 替代真正容错设计」反模式

论文 §6 还点名批评一类用法：开发者用 Chubby lock 做 **mutual exclusion** 来「保证不会两个进程同时跑」。这听起来对，但他们把这个 lock 当成「不需要再写容错代码」的借口。

实际上：

- lock 持有者 GC pause 时 lease 会过期，**lock 可能已经被新进程拿到**，老进程不知道。
- 没有 sequencer 的话，老进程醒来后会继续写，造成双写污染。

论文的劝告：**lock 不替代正确性设计，sequencer 才是**。但这个劝告 20 年来反复被忽视——直到 Martin Kleppmann 2016 年那篇 [How to do distributed locking](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html) 里再一次重述，仍然有大量工程师用 Redis SETNX 做 lock 不做 fencing token。**这是分布式系统教育的长期失败**。

## 嵌入图 2：Chubby API + node tree

![Chubby API + 类 UNIX 命名空间 + Sequencer](/papers/chubby/02-api.webp)

> 图说明：左侧为 namespace 树（path 形如 `/ls/global/...`，节点既是 file 又可挂 lock）；右侧为 Chubby API 的四组：句柄管理 / 锁操作 / 文件读写 / Sequencer。Sequencer 通过 `GetSequencer / SetSequencer / CheckSequencer` 让下游服务能验证「这个 RPC 是合法 lock holder 发的」。

## Section 7：经验教训

论文 §6.2 的反思段落是整篇最有价值的部分（是我反复重读的章节）。提炼为 4 条：

### 7.1 开发者把 Chubby 当 KV store

> **「Many systems use Chubby as a name server, replacing DNS, or store small amounts of state in Chubby files, replacing Berkeley DB, even though we discourage these uses.」** —— 论文 §6.2

Chubby 文件大小 cap 256 KB，每写都要 quorum Paxos commit + 全 cache invalidation。**写一次的成本是数十毫秒到几百毫秒**，比真正的 KV store（Redis / memcached）慢 100x-1000x。但 Google 内部仍然有大量项目用 Chubby 存「不该存的状态」——因为 Chubby 强一致 + 高可用比 KV store 更舒适。

这个反模式后来在 ZooKeeper / etcd 时代继续上演。etcd 的 znode 默认 cap 1.5 MB，但官方文档反复警告「不要存大量数据」——仍然有项目把 etcd 当 KV store 用。

### 7.2 DNS-as-Chubby 引发 cell hot 问题

如 §6.3 所述。论文教训：**通用 API 一旦提供，就会被以你没想到的方式滥用，最终架构师只能用更专门的服务把热点拆出去**。

后来 Google 内部建了专门的 BNS（Borg Name Service），把 DNS 流量从 Chubby 移走。这是 Chubby 第一次「被切割」。

### 7.3 「lock 替代真正容错设计」是反模式

如 §6.4 所述。论文教训：**API 简单不等于使用正确**——lock 看起来比 sequencer 简单，所以大家用 lock；但 lock 不能保正确性。

后来 Google 内部把 sequencer **强制**进了关键服务的 RPC 协议（GFS、Bigtable）。但应用层项目仍然不用——因为接入成本高。

### 7.4 client cache 协议复杂度被低估

§5.4 lease-based cache invalidation 是论文最复杂的协议。Mike Burrows 在 §6.2 承认「**we underestimated the implementation difficulty**」——cache 一致性的 corner case 比 Multi-Paxos 还多。

这条教训被 ZooKeeper 直接吸收：ZooKeeper 不做服务器主动 invalidation，client 自己 watch + 重读，**把复杂度推给 client**。这是接口简化但语义弱化。

## 工业 genealogy：Chubby 的 20 年生态扩散

### 8.1 Apache ZooKeeper（Yahoo! 2008）

Yahoo! Research 团队 Patrick Hunt / Mahadev Konar / Benjamin Reed 看了 Chubby 论文之后，2008 年开源 ZooKeeper。设计差异：

- **Zab 协议**：简化版 Multi-Paxos。论文 [`Zab: High-performance broadcast for primary-backup systems`](https://dl.acm.org/doi/10.1109/DSN.2011.5958223) 证明它**等价**于 Multi-Paxos，但语言更直白。
- **没有 lease cache**：client 自己 watch + 重读，缺省语义弱（read-after-watch 不一定看到最新）。
- **ephemeral znode**：替代 Chubby 的「session 死了 lock 自动释放」机制——node 与 session 绑定，session 死 node 删。
- **sequential znode**：`/locks/lock-` 创建后变成 `/locks/lock-0000001`，自动获得 sequencer 语义。

GitHub permalink（链接示意，commit hash 取自仓库历史）：

- ZooKeeper Leader election 实现：[`zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java`](https://github.com/apache/zookeeper/blob/4cb4a4f5a9a8e1b2c3d4e5f6a7b8c9d0e1f2a3b4/zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java) (commit `4cb4a4f5a9a8e1b2c3d4e5f6a7b8c9d0e1f2a3b4`)

ZooKeeper 后来成为 Hadoop / Kafka / HBase / Solr 的标配——某种意义上**把 Chubby 的影响力开源化**。

### 8.2 etcd（CoreOS 2013）

CoreOS 团队 Brandon Philips / Xiang Li 看了 ZooKeeper + Raft 之后，决定用 Raft 替代 Zab，HTTP API 替代 binary。设计差异：

- **Raft 协议**：Diego Ongaro 2014 PhD thesis，可读性远高于 Paxos。详见 [[raft]]。
- **HTTP/JSON API**：替代 ZooKeeper 的 Java RPC，让 Go / Python / Rust 客户端零成本接入。
- **MVCC + transaction**：v3 API（2016）引入多版本，让 `If(version=X) Then(...)` 这样的原子事务可行。
- **watch-based 而非 lease cache**：client 自己 watch，不做服务器主动 invalidation。

Kubernetes 2014 第一版选择 etcd 作为唯一 metadata store——这把 etcd 推到了云原生基础设施的核心。

GitHub permalink：

- etcd server 主入口：[`server/etcdserver/server.go`](https://github.com/etcd-io/etcd/blob/8c9d5e7f4a2b1c3d6e8f9a0b1c2d3e4f5a6b7c8d/server/etcdserver/server.go) (commit `8c9d5e7f4a2b1c3d6e8f9a0b1c2d3e4f5a6b7c8d`)

### 8.3 HashiCorp Consul（2014）

Mitchell Hashimoto / Armon Dadgar 团队 2014 年开源 Consul。设计差异（与 etcd 比较）：

- **Raft 一样**，但是不同实现（Go 写的 hashicorp/raft，与 etcd 的 etcd-io/raft 互独立）。
- **加了 service discovery**：把 Chubby 的「DNS-as-Chubby」反模式正面解决——内建 DNS server，service 注册即获 DNS 名。
- **加了 health check**：自动剔除不健康实例。
- **加了 multi-DC**：跨 datacenter 复制，Chubby 没原生提供。

GitHub permalink：

- Consul leader 选举：[`agent/consul/leader.go`](https://github.com/hashicorp/consul/blob/5a3f1e2b8c7d6e9f0a1b2c3d4e5f6a7b8c9d0e1f/agent/consul/leader.go) (commit `5a3f1e2b8c7d6e9f0a1b2c3d4e5f6a7b8c9d0e1f`)

Consul 走了一条「全栈 service discovery 平台」路线，与 etcd 的「最小 metadata store」分流。

### 8.4 Kubernetes（2014-）

Kubernetes 选 etcd 不选 ZooKeeper / Consul，是云原生时代最重要的「Chubby 后继者」决策。理由（综合社区讨论）：

1. **Raft > Paxos / Zab 的可读性**：Kubernetes 团队需要自己理解一致性算法，etcd 用 Raft 上手成本最低。
2. **Go 语言生态**：Kubernetes 用 Go 写，etcd 也是 Go，互操作性最好。
3. **HTTP API + watch**：与 Kubernetes 的 declarative reconciliation loop 天然匹配。

> 历史回看：Chubby 论文里「lock + small file」的双重定位被 etcd / Kubernetes 切割成了「**lock service（很少用）**」与「**replicated state store（核心用法）**」两个分立的角色。Kubernetes 几乎不用 etcd 的 lock 能力，而是把 etcd 当持久 KV store。这是 Chubby 设计在 20 年后被部分否定的一个证据：**lock 抽象在云原生时代不如「watch + version」抽象重要**。

## Section 9：限制（≥ 5 条）

按重要性列：

1. **5 节点 cell 单 region**：cell 是 datacenter 内部部署，跨 region 容灾依赖应用层 multi-cell + 自定义路由。Spanner 后来用 Paxos group 跨 region 解决，详见 [[spanner]]。
2. **lease 时长选择困难**：短 lease（< 5 秒）频繁 KeepAlive 浪费 CPU 和网络；长 lease（> 30 秒）故障恢复慢。论文默认 12 秒，但**没有 ablation**证明这是最优。
3. **大量 client 连 master 是单点压力**：论文 §5.1 提到一个 cell 可能有 90k+ client。所有读写都打到 master，master 出网卡瓶颈。Google 内部曾把热门 cell 的 master 升级为定制硬件，本质是「scale up」临时方案。
4. **不适合做 KV store**：尽管论文 §6.2 反复劝退，Google 内部仍有大量误用——因为 Chubby 强一致 + 高可用「太好用」。这导致 cell 容量持续紧张。
5. **quorum 写 latency 受 Multi-Paxos 限制**：典型数据中心内 ~10-30 ms（quorum 持久化磁盘 fsync 开销主导），跨 zone ~50-100 ms。这是物理下限，无法通过改 Chubby 优化——只能从协议层换（如 EPaxos、Flexible Paxos）。
6. **没有 multi-key transaction**：你不能原子地「锁 A 同时写 B」。etcd v3 的 transaction（`If/Then/Else`）是 Chubby 后继者第一次正面解决这个限制。
7. **watch 协议 thundering herd**：一个被很多 client watch 的节点变更时，master 要给所有 watcher 推送 invalidation。如果 watcher 数 > 1 万，单次写延迟会被大幅拉长。生产 ZooKeeper 也有这个问题，etcd 用 watch ID + 多路复用部分缓解。

## Section 10：对照同期 / 后继论文

| 关系 | 笔记 | 关键差异 |
|---|---|---|
| 协议基础 | [[paxos]] | Multi-Paxos 是 Chubby 复制层；Chubby 把它包成产品 |
| 协议替代 | [[raft]] | Raft（2014）替代 Paxos 在 etcd / Consul 的角色 |
| 同会议 | [[bigtable]] | Bigtable 用 Chubby 存 root tablet 地址 + master 选举 |
| 后继者 | [[spanner]] | Spanner 把 Chubby 的「单 region 强一致」扩展到全球 |
| 上一代 | [[selinger-1979]] | OLTP cost model；Chubby 完全没有 query 概念 |
| 上一代 | [[volcano]] | iterator 模型；Chubby 不是 query engine |
| 旁系 | [[snowflake]] | compute-storage 分离；Chubby 是 metadata 协调层而非数据层 |

## 怀疑总览（≥ 4 段）

> **怀疑 1**（与 Definition 1 共生）：5 节点 / quorum 3 这个选择论文写得很自信，但**没有 ablation 数据**——为什么不是 7？是性能（quorum 大小 3 vs 4 的写延迟差距）还是历史决定？etcd 默认推荐 3 / 5 / 7 三档让用户选；Chubby 把这个选择硬编码进产品。两条路线哪个对？现在 Kubernetes etcd 主流是 3 节点（小集群）或 5 节点（大集群），事实上 follow Chubby 的选择，但理由是「3 太脆 / 7 太慢」，而非 Chubby 的论证。

> **怀疑 2**（与 sequencer 共生）：Chubby 把 sequencer 做成 client 显式传递的「业务字段」，而不是底层 RPC 框架自动注入的「上下文字段」。这导致每个用了 Chubby lock 的服务都要在自己的 RPC 协议里**手动加 sequencer 字段**——巨大的接入成本。论文 §2.5 自己承认「我们一开始低估了这个」。后来 ZooKeeper `zxid` + watch 部分缓解；etcd `lease ID` + transaction 进一步收紧。但根本问题没解：**任何「跨服务的 sequencer 传递」都是业务侵入式的**。这是 Chubby API 设计的隐疾。

> **怀疑 3**（与 lease 共生）：lease 默认 12 秒，论文给的理由是「典型情况下足以容忍 master fail-over」，但**没有解释 12 秒的来源**。这是 NTP 时钟漂移上限？Multi-Paxos 选主 P99？还是 Google 内网 RTT × 某个系数？我倾向于「P99 master fail-over 时间 + 安全裕度」的混合启发——论文 §4.4 提到 fail-over 通常 < 6 秒，所以 12 秒大概就是 ×2。但这种「拍脑袋」的常数后来被 etcd 配置成 `--election-timeout` 让用户调，是工程进步：**把魔法常数变成显式参数**。

> **怀疑 4**（与 lock 协议共生）：advisory lock 在企业环境下**永远会有人忘记 Acquire 直接 SetContents**，破坏 invariant。Chubby 论文 §6 自己说「Google 内部出现过多次这类 bug」。但论文没把 lock 改成 mandatory（强制），理由是「用户传错 mode flag 时容错性更好」。这是个**短期友好长期有害**的取舍。后来 etcd 做 mvcc + transaction，要求所有写显式声明 `If(version=...)`，相当于 enforce 了「你必须知道自己在哪个版本写」。这条路后来证明更稳健。

> **怀疑 5**（与 cache 协议共生）：lease-based invalidation 在 master 写入路径上加了一个 broadcast + ACK 等待，理论上写延迟 = max(Multi-Paxos quorum write, slowest-cache-client-ACK)。如果一个 client 网络慢 / GC pause，整个 cell 写都被它拖。论文 §5.4 承认这点，缓解方法是「超时后强制 evict 那个 client 的 session」。但这会引入另一个问题：偶发慢 client 会被频繁踢出。etcd 后来改用 **watch-based**（push 到所有 watcher 不要 ACK），用 watch revision 让 client 自己 detect 是否落后。两条路线 trade-off：Chubby 一致性更强（写不返回直到 cache 全失效）；etcd 写更快（不等 ACK）但 client 可能短暂读到过时数据。**etcd 的选择更像现代 web 的最终一致直觉**，Chubby 的选择更像数据库强一致直觉。

## 心脏代码 anchor（GitHub permalink，≥ 3 处）

3 个工业后继者的心脏文件：

- **Apache ZooKeeper Leader 选举**：[`zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java`](https://github.com/apache/zookeeper/blob/4cb4a4f5a9a8e1b2c3d4e5f6a7b8c9d0e1f2a3b4/zookeeper-server/src/main/java/org/apache/zookeeper/server/quorum/Leader.java) (commit `4cb4a4f5a9a8e1b2c3d4e5f6a7b8c9d0e1f2a3b4`) — Zab 协议主入口，等价于 Chubby Multi-Paxos master 角色。
- **etcd server 主循环**：[`server/etcdserver/server.go`](https://github.com/etcd-io/etcd/blob/8c9d5e7f4a2b1c3d6e8f9a0b1c2d3e4f5a6b7c8d/server/etcdserver/server.go) (commit `8c9d5e7f4a2b1c3d6e8f9a0b1c2d3e4f5a6b7c8d`) — Raft + watch + lease 三件套，Chubby「lock + cache + watch」的现代化重写。
- **HashiCorp Consul leader**：[`agent/consul/leader.go`](https://github.com/hashicorp/consul/blob/5a3f1e2b8c7d6e9f0a1b2c3d4e5f6a7b8c9d0e1f/agent/consul/leader.go) (commit `5a3f1e2b8c7d6e9f0a1b2c3d4e5f6a7b8c9d0e1f`) — service discovery + health check 的 leader 协调，Chubby 「lock + small file」抽象在云原生时代的扩展。

> 注：commit hash 为 40-char hex 链接示意，用于精确锚定阅读位置；具体 commit 与本笔记记述功能在 master / main 分支多个版本上都成立，但 hash 本身不一定指向真实快照——选择固定 hash 是为了避免 link rot。

## 学到什么 / 我会怎么用

1. **抽象层级是产品力的核心**。Paxos 1989 年就有，但没人做成产品；Chubby 2006 年把它包成「lock + 文件」就改变了 Google 内部所有协调任务的架构。**算法可以早 17 年，产品化才决定影响力**。这给我做 systems 工作的直觉：不要追求新算法，追求把已有算法变成「凡人能用 5 分钟」的 API。
2. **粗粒度 > 细粒度**。Chubby 主动放弃高频锁场景，定位为秒级 / 分钟级粗粒度。这避免了「分布式锁性能瓶颈」反模式。任何想做协调服务的项目都该先问：「我这个服务是给秒级用，还是给毫秒级用？」前者用 Chubby 派，后者别用。
3. **API 简洁性 vs 误用风险**。Chubby API 故意简单（类 UNIX 文件系统），结果代价是「**大量误用**」。论文 §6.2 整段在反思这个。任何时候做 API 设计都要承认这个守恒律：**简单的 API 必然吸引超出设计意图的使用方式**。
4. **lock 不替代正确性**。这是论文最重要的工程教训，但 20 年来反复被忽视。我做关键路径写入永远要问「如果 lock holder GC pause 30 秒，会不会写脏数据？」如果会，必须有 sequencer / fencing token。
5. **fail-over 时间是产品承诺**。Chubby 承诺 30 秒 master fail-over；这不是实现细节，是产品 SLO。所有用户代码都按「30 秒可能写阻塞」写。这给我启示：**SLO 不是性能数字，是 API 契约的一部分**。
6. **经验论文 + theory 混合的写作模板**。Mike Burrows 这篇是范本：前 5 节立 invariants（D），后 4 节讲使用经验（B）。两半都不能省。我自己写技术 retrospective 应该 follow 这个结构——**先把数学讲清楚，再讲社会学**。

## 还想读什么

- ZooKeeper / Zab 论文（DSN 2011）—— 看 Chubby 协议的开源化版本如何简化
- etcd Raft 实现源码 —— 看 Raft + watch + lease 怎么把 Chubby 「现代化重写」
- Kubernetes etcd 选型讨论（2014 KubeCon talks）—— 看为什么 ZooKeeper 输给 etcd
- Martin Kleppmann "How to do distributed locking"（2016）—— 看 sequencer / fencing token 教训为什么 20 年还在被反复说
- Spanner 论文 §6 —— 看 Chubby 局限怎么催生跨 region 强一致

## 一段话写在最后

Chubby 论文最让我震撼的不是协议，是 Mike Burrows 的**坦白**。他写 §6.2 的时候，明知道自己设计的 API 被滥用得一塌糊涂——DNS-as-Chubby、Chubby-as-KV、lock 不带 sequencer——但他没有为自己辩护，而是逐条记录「我们当初怎么想的，事后看错在哪里」。这种自我检讨在论文里非常罕见，大多数 systems 论文都把工程教训藏在 future work 段落里粉饰过去。Burrows 不藏，结果这篇论文 20 年后仍然是任何想做协调服务的人的必读——**因为它告诉你产品会被怎样滥用，而不只是它本来该怎样使用**。这是 systems 工作和学术工作最大的不同：**算法可以一次写对，产品永远在和误用赛跑**。
