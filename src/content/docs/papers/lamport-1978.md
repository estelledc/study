---
title: Lamport 1978 — 分布式系统里没有"绝对的同时"
来源: 'Leslie Lamport, "Time, Clocks, and the Ordering of Events in a Distributed System", CACM 1978'
日期: 2026-05-30
分类: papers / 分布式系统
难度: 中级
---

## 是什么

Lamport 1978 是一篇 8 页论文，它告诉我们：**多台机器组成的系统里，没有"两件事同时发生"这种说法**。日常类比：像两位侦探在不同城市办案，谁也没法用对方的手表读时间——只能靠"凶手的电报先发到 A，再发到 B"这种因果链来推先后。

更具体地说：每台机器都有自己的时钟，且时钟之间永远有偏差（哪怕用 NTP 也只能拉到几毫秒）。如果你的程序逻辑是 "事件 A 必须在事件 B 之前发生"，靠物理时间是判断不准的。Lamport 的办法是**把时间这个概念替换成"因果"**：A 因果在 B 之前 ⟺ A→B（happens-before），且只在三种情形下成立：同进程内 A 先 / A 是 send 而 B 是对应 receive / 传递性。再给每个事件贴一个递增的整数标签（Lamport 时间戳），就能让因果先后变成"标签先后"。

50 年过去，Paxos / Raft / Spanner / Kafka / Git 的时间观全都源自这篇论文。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么分布式系统不能直接用 wall clock 当事件先后判据
- 为什么 Kafka 单 partition 里 offset 一定单调递增、跨 partition 却不能合并排序
- 为什么 Git merge 有两个 parent 不冲突（concurrent 事件本来就无法说谁先）
- 为什么 Raft / Paxos 都要选一个 leader 来"造时间"，而不是各机器民主决定

## 核心要点

Lamport 给的解法分三步，**每一步都解决前一步留下的问题**：

1. **happens-before 偏序（→）**：定义因果关系。同进程内 A 在 B 前则 A→B；A 是发送、B 是接收同一条消息则 A→B；可传递。**两个永不通信的进程上的事件，永远是 concurrent**。类比：光锥，光到不了的地方就是"无关"。

2. **Lamport 时间戳（逻辑时钟）**：给每个事件贴整数标签。每进程一个 counter，本地事件 +1；发消息时把当前 counter 写进消息；收消息时 counter = max(自己, 消息里的) + 1。保证 A→B ⇒ C(A)<C(B)。类比：每个人各自记账本，但收别人来信时把对方账本号也对一下。

3. **扩成全序 + State Machine Replication**：时间戳冲突时用 process id 打破平局，得到事件全序。多副本按这个全序回放命令，状态就一致——这是后来 Raft / Paxos 所依赖的 SMR / 全序思想源头（不是说协议代码直接从本篇抄来）。类比：拍卖会按时间戳叫号，同时同号就按席位号。

## 实践案例

### 案例 1：Kafka 单 partition offset 就是退化版 Lamport 时间戳

Kafka 一个 partition 上 producer 写消息时，broker 给消息分配单调递增的 offset：

```python
# 简化伪码：broker 内部
def append(partition, msg):
    partition.next_offset += 1     # IR1：本地事件 +1
    msg.offset = partition.next_offset
    partition.log.append(msg)
    return msg.offset
```

**逐部分解释**：
- `next_offset` 是该 partition 的"逻辑时钟"，单调递增
- 因为 partition 单 leader 写入，只有一个进程产生事件，IR1 单条规则就够，不需要 IR2
- 跨 partition 时 offset 不可比——这正是"两个不通信进程的事件 concurrent"的工程版

### 案例 2：Git commit 的 happens-before 链

每个 commit 有一个或两个 parent。`parent → child` 就是 happens-before：

```
A ──► B ──► C ──► merge
       \           ^
        ► D ──► E ─┘
```

**逐部分解释**：
- 直线 A→B→C 是同分支（程序顺序，对应 IR1）
- B→D 是分叉（仍是 happens-before，因为继承同一历史）
- C 和 E 是 concurrent——两个分支独立提交，物理时间无关紧要
- merge commit 把两个 concurrent 历史合在一起，对应论文里 "join 两个偏序"

这就是为什么 git log 不按物理时间排序也不会出错。

### 案例 3：多机日志收集按 logical clock 排序

ELK 里多机 log 按 wall clock 拼会乱（机器时钟差秒级）。给每条 log 加 (lamport_ts, node_id) 二元组：

```python
class LogEmitter:
    def __init__(self, node_id):
        self.clock = 0
        self.node_id = node_id

    def emit(self, msg):
        self.clock += 1                    # 本地事件 IR1
        return (self.clock, self.node_id, msg)

    def on_recv(self, peer_clock):
        self.clock = max(self.clock, peer_clock) + 1  # IR2
```

**逐部分解释**：
- `emit` 返回三元组，按 `(ts, node_id)` 排序就是论文里的全序
- 拿到的日志顺序是因果一致的——A→B 一定 A 排在 B 前
- 但 concurrent 的两条 log 顺序会"看起来怪"，那是物理时间和因果时间不一致的真实

## 踩过的坑

1. **把 C(a) < C(b) 当成 a → b**：错。论文证的是必要条件 a→b ⇒ C(a)<C(b)，反过来不成立。两个并发事件的时间戳完全可能一前一后，这是"幽灵因果"误判的根源——典型场景：multi-master 数据库用 Lamport 时间戳判写冲突会漏判。

2. **以为 Lamport 时间戳能检测并发**：不能。要区分 "a→b 还是 a‖b" 必须用 vector clock（Mattern 1988），代价 O(N) 空间。Lamport 时间戳只能拉直成全序，丢掉了"是否真的有因果"信息。

3. **把逻辑时钟当物理时钟**：错。时间戳 1000 和 1001 的两个事件，物理上可能差 1 毫秒也可能差 1 小时，逻辑时钟根本不携带物理时间信息。需要混合用 HLC（Hybrid Logical Clock）才能两头沾。

4. **平局打破用 hash(node)**：节点重启后 ID 变化，破坏 total order 稳定性。要用稳定 ID（ZooKeeper session 序号 / 持久化的 epoch / 配置文件里写死的 rank）。

## 适用 vs 不适用场景

**适用**：
- 单 leader 写入的日志型系统（Kafka 单 partition / WAL）
- 因果一致性即够的场景（社交 timeline / 评论可见性）
- 状态机复制的 ordering 层（Raft log index 本质就是 Lamport 时间戳的稳定化）

**不适用**：
- 需要精确判断"两个事件是否并发"——用 vector clock
- 需要绑定真实物理时间（如 SLA 计费 / token 过期）——用 [[spanner]] TrueTime 或 HLC
- 跨 region 强一致性事务——Lamport 不够，需要 [[paxos]] / [[raft]] 的多数派写

## 历史小故事（可跳过）

- **1976 年**：Lamport 在 SRI 思考"狭义相对论里没有绝对同时"，把这个想法搬到分布式计算
- **1978 年 7 月**：CACM 发表 8 页论文，塞进 happens-before、逻辑时钟、State Machine Replication、物理时钟漂移上界四件事
- **1988 年**：Mattern 和 Fidge 各自独立提出 vector clock，补全 "Lamport 时间戳无法检测并发" 的缺陷
- **1998 年**：Lamport 自己用 SMR 思想发表 Paxos 论文，推开共识协议的大门
- **2013 年**：Lamport 获 Turing Award，颁奖词专门提到这一篇是分布式系统的"创世纪"

Google Scholar 上万级引用，是分布式系统里被引最多的经典论文之一（具体排名随统计口径变化，不宜说成绝对第一）。

## 学到什么

1. **"绝对同时"在分布式里不成立**——这是认识论的转变，从测物理时间到建模因果
2. **partial order 比 total order 更诚实**：concurrent 事件就是不可比，硬排会丢信息
3. **简单算法能用 50 年**：IR1+IR2 两条规则，O(1) 空间和时间，至今每个分布式日志系统都在用
4. **必要条件 ≠ 充分条件**——把"a→b ⇒ C(a)<C(b)"误读成双向蕴含，是工程踩坑的根源

## 延伸阅读

- 论文 PDF：[Time, Clocks, and the Ordering of Events](https://lamport.azurewebsites.net/pubs/time-clocks.pdf)（8 页，先读 Section 2-4）
- 视频：[Martin Kleppmann — Distributed Systems Lecture 4](https://www.youtube.com/watch?v=x-D8iFU1d-o)（1 小时讲透 happens-before）
- 后续：[[paxos]] —— 同作者用 SMR 思路造的共识协议
- 后续：[[raft]] —— Paxos 的工程化，log index 就是 Lamport 时间戳
- 实战：[[kafka]] —— offset 是 Lamport 时间戳的退化版

## 关联

- [[paxos]] —— Lamport 自己用 SMR 思想造的共识协议
- [[raft]] —— Paxos 简化版，log index 是稳定化的 Lamport 时间戳
- [[spanner]] —— 用原子钟 + GPS 做 TrueTime，是"逻辑时钟"的反命题
- [[kafka]] —— 单 partition offset 就是退化版 Lamport 时间戳
- [[bigtable]] —— 用 Chubby 造分布式锁，依赖 Paxos 的 ordering
- [[chubby]] —— 分布式锁服务，session ID 用作稳定 process id
- [[calvin]] —— 确定性事务也要先排全序，思想同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[bitcoin]] —— Bitcoin 白皮书
- [[byzantine-generals-1982]] —— 拜占庭将军问题 — 节点能撒谎时怎么达成一致
- [[calvin-2012]] —— Calvin 2012 — 先排好顺序再执行，让跨分区事务不再走 2PC
- [[chandy-lamport-1985]] —— Chandy-Lamport 1985 — 分布式系统不停机也能拍一张全家福
- [[clarke-emerson-1981]] —— Clarke-Emerson 1981 — 让机器自己检查并发程序对不对
- [[cops-2011]] —— COPS — 大规模跨地域存储如何用得起的代价拿到因果一致
- [[crdt-json]] —— CRDT JSON — 协同编辑 JSON 数据结构
- [[crdt-json-2017]] —— CRDT JSON 2017 — 给嵌套 JSON 一套有数学证明的合并算法
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[dstreams-2013]] —— D-Streams — 把流处理伪装成一串很小的批
- [[dynamo]] —— Dynamo — 让购物车永远能写入的分布式存储
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[fast-paxos-2006]] —— Fast Paxos — 给 Paxos 加一条乐观快车道
- [[fidge-1988]] —— Fidge 1988 — 给每个进程一份"账本向量"，让因果关系变成可判定
- [[flexible-paxos-2016]] —— Flexible Paxos — 两阶段不一定都要多数派
- [[flink-2015]] —— Apache Flink — 流批一体的单引擎
- [[flp-1985]] —— FLP 1985 — 一个坏节点就能让异步共识永不终止
- [[hlc-2014]] —— HLC 2014 — 把逻辑时钟和物理时钟合一，让普通服务器也能拍一致快照
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[jupiter-1995]] —— Jupiter — 把 OT 简化成 client-server，让协同编辑能上工业
- [[lamport-tla-1994]] —— TLA — 把状态机和时序逻辑捏成一个公式
- [[lampson-hints]] —— Lampson Hints — 把做系统的隐式品味写成 27 条经验法则
- [[lampson-hints-1983]] —— Lampson Hints 1983 — 系统设计思维起点
- [[linearizability-1990]] —— Linearizability 1990 — 让并发对象看起来像一次只执行一个操作
- [[mapreduce]] —— MapReduce — 用户只写两个函数，框架替你扛千节点
- [[mattern-1989]] —— Mattern 1989 — 虚拟时间与全局状态：把分布式时钟变成 N 维笛卡尔积
- [[mencius-2008]] —— Mencius — 让多台服务器轮流当 Paxos 的 leader
- [[mills-ntp-1991]] —— NTP 1991 — 用四个时间戳和一棵服务器树，让全互联网的钟差几毫秒
- [[milner-pi-calculus]] —— π-演算 — 让通道名本身能在通道里流动
- [[ntp-mills-1991]] —— NTP 1991 — 用四个时间戳和一组滤波器，让全网服务器的钟差几毫秒
- [[ot-1989]] —— OT — 多人同时改一份文档，操作随上下文自动改坐标
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[percolator-2010]] —— Percolator 2010 — 给 Bigtable 加分布式事务的客户端库
- [[pivot-tracing-2015]] —— Pivot Tracing — 让运维事后想测什么就测什么
- [[pnueli-temporal-1977]] —— Pnueli 时序逻辑 — 给"永远不死锁""请求最终被响应"找一套数学语言
- [[saltzer-1984-e2e]] —— End-to-End Arguments — 把功能尽量推到端上做
- [[sequential-consistency-1979]] —— Sequential Consistency 1979 — 多处理器内存模型的第一个正确性标准
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[stm-shavit-touitou]] —— STM Shavit-Touitou — 把"加锁"改成"事务"的源头
- [[tcp]] —— TCP — 在不可靠的 IP 上凿出一条 reliable 字节流
- [[tla-yu-tlc-1999]] —— TLC — 让 TLA+ 规范可以一键机检的模型检查器
- [[vogels-eventual-2009]] —— Eventually Consistent 2009 — 给互联网规模存储一套'放弃强一致'的官方词汇
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉
- [[vr-revisited-2012]] —— VR Revisited 2012 — VR 协议的"工程化重写版"
- [[zab-2011]] —— Zab — ZooKeeper 怎么把客户端写入按顺序复制到所有副本
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[hocuspocus]] —— Hocuspocus — 给 Yjs 配一个能直接上线的协作后端
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
- [[yjs]] —— Yjs — 让任何编辑器都能接的协同编辑内核
