---
title: VR Revisited 2012 — VR 协议的"工程化重写版"
来源: 'Liskov & Cowling, "Viewstamped Replication Revisited", MIT-CSAIL-TR-2012-021'
日期: 2026-05-30
分类: 分布式系统
难度: 中级
---

## 是什么

**VR Revisited** 是 Barbara Liskov 和她博士生 James Cowling 在 2012 年把 [[vr-1988]] 完全重写后的版本。日常类比：1988 年原版像一篇"会议室主持换届"的寓言故事——讲得通，但你想照着写代码会发现状态转移图不够严谨；2012 重写版像一份**操作手册**，每个角色有明确状态、每条消息有明确字段、每次崩溃重启有明确流程。

它和 1988 版的协议主线相同（primary/backup + view change + viewstamp），但补齐了三块原文没说清楚的工程细节：

1. **显式 status 字段**：每个节点有 `status ∈ {normal, view-change, recovering}`，是一台标准状态机
2. **client table（客户端表）**：每客户端记录最近一次 (request-num, result)，天然实现 **at-most-once（至多一次）**——重复请求不重做
3. **reconfiguration（成员变更）**：动态加减节点走 view change 同一套机制，新增专门章节

今天讲 VR、写 VR 实现、把 VR 跟 [[raft]] 对照——大家引的都是这一版，**不是 1988 原文**。

## 为什么重要

不理解 VR Revisited，下面这些事都没法解释：

- 为什么 [[raft]] 论文（2014）的术语和 VR Revisited 几乎一一对应——term ≈ view-number / AppendEntries ≈ PREPARE / leader election ≈ view change
- 为什么 1988 原版"看了等于没看"还能当经典论文——因为它是骨架；2012 才是肉
- 为什么 [TigerBeetle](https://tigerbeetle.com/) 这种新生代金融数据库选 VR Revisited 而不是 Paxos——工程描述更可执行
- 为什么共识协议教学界普遍把"先读 VR Revisited 再读 Raft"作为推荐路径

## 核心要点

VR Revisited 把节点分成两种角色（动态切换），由 **三个子协议** 串联起来：

1. **Normal case**（正常路径）：客户端 → primary 分配 op-number → 发 `PREPARE` 给 backups → primary 自计 1 票再等 `f` 个 `PREPARE-OK`（合计 `f+1`）→ committed → 回客户端
2. **View change**（换届）：任一节点超时 → 发 `START-VIEW-CHANGE(v+1)` → 收齐 `f+1` 个 `DO-VIEW-CHANGE`（带各自 log）→ 新 primary 挑最大 viewstamp 的 log 做基线 → 发 `START-VIEW`
3. **Recovery**（崩溃恢复）：重启节点带 nonce 发 `RECOVERY` → 收齐 `f+1` 个 `RECOVERY-RESPONSE`（**必含当前 primary**）才能并入 view

**关键不变量**：`2f+1` 节点容忍 `f` 故障；正常路径 quorum 是含 primary 共 `f+1`；换届 / recovery 各需 `f+1`。任意两个 quorum 必交集 ≥ 1，committed 日志不会在换届中丢失——这是 leader-based 共识的几何基石。

**2012 相对 1988 的三个新东西**：

1. **client table**：primary 维护 `client_id → (last_request_num, last_result)`，重发直接返缓存，天然 at-most-once
2. **explicit status 状态机**：节点何时能服务、何时只能等换届，写成枚举
3. **reconfiguration**：把"加/换机器"做成特殊 op，提交后切到新成员组的新 view

**viewstamp = (view-number, op-number)**，类比"第几届会议 + 第几号议案"，字典序比较且 view 优先。换届挑基线只需"取最大 viewstamp 的 log"，不必看节点身份。

## 实践案例

### 案例 1：5 节点正常路径（f=2，quorum=3）

```
Client → Primary P0 (view=1, op=42)
P0: 写本地 log → PREPARE(view=1, op=42, value="X") 给 P1..P4
P1, P2 回 PREPARE-OK → P0 收齐 3 票（含自己）→ committed
P0 查 client_table 写 (client_id, req_num=7, result="OK") → 回 client
P0 异步广播 COMMIT(op=42)，P1..P4 推进自己的 commit-number
```

**对比 1988**：1988 也是这个流程，但没说 client_table——重发请求时 1988 实现要么重做（破坏幂等）要么自己想办法。2012 把这个口子堵上。

### 案例 2：客户端表的妙用

客户端 C1 发 `(request_num=7, op="转账 100")`，primary 提交完回 OK。**网络丢包**，C1 没收到，超时重发同一条。

```
P0 收到 (C1, request_num=7) → 查 client_table → 命中 (7, "OK")
P0 直接回上次的结果，不再走 PREPARE
```

整个集群没多做一次共识。如果没有 client table，重发会变成新 op，用户被扣两次 100。这就是 2012 把 at-most-once 写进协议的价值——**正确性问题不留给应用层**。

### 案例 3：Recovery 为什么必须收 primary 的响应

P3 崩溃重启，发 `RECOVERY(nonce=xyz)`：

```
P0 (当前 primary, view=2) 回 RECOVERY-RESPONSE(view=2, log, commit-num=99, nonce=xyz)
P1, P2 回 RECOVERY-RESPONSE(view=2, log, nonce=xyz)（不含 commit-num）
P3 收齐 3 个响应 + 必含 primary → 用 P0 的 commit-num 知道哪些已 committed
```

**为什么 primary 必须在内**：只有 primary 知道当前 view 的 commit-number；其他 backup 拿到的是异步广播的 commit，可能滞后。recovery 节点若用 backup 的 commit-num 上线，会以为某些已 committed 的 op 还没确认——破坏一致性。这一条 1988 写得含糊，2012 明确为协议条款。

### 案例 4：reconfiguration —— 加一台新机器

集群 P0..P4（5 节点，f=2），现在要扩容到 7 节点，加入 P5、P6：

```
管理员 → primary P0 发 RECONFIGURATION(new_config={P0..P6})
P0: 当特殊 op 走 PREPARE → 自计+等 f 个 PREPARE-OK（合计 f+1）→ committed
所有节点收到 commit 后，停止接受新 client 请求
P0 触发 view change 进入 view+1，新成员组开始服务
P5、P6 走 state transfer 拉历史 log → 进入 normal status
```

把成员变更复用 view change：协议核心仍是"normal / view-change / recovery"三态，不为成员变更再开第四种状态机，**复杂度收敛**。这是 2012 相对 1988 最有工程感的设计。

## 踩过的坑

1. **request-num 必须递增**：client_table 用它去重；如果客户端实现错了用同一 request-num 发不同 op，第二条会被当成"重发"返回上次结果，业务静默错误。
2. **viewstamp ≠ Lamport timestamp**：viewstamp 是 (view, op) 二元组、view 优先；[[lamport-1978]] 是单调递增标量。新人对"viewstamp 用字典序比较"的细节经常想成"看 op 大小"。
3. **view-number mod n 是默认轮转**：实践中可以替换成"优先选 log 最长的"以减少 state transfer，但要保证选择函数确定性，否则不同节点选出不同 primary 会脑裂。
4. **reconfiguration 期间冻结请求**：reconfiguration op 提交后到新 view 起跑前的窗口内，primary 不接受新 client 请求；新人实现时容易漏了这一停顿。
5. **不要把 status=view-change 的节点当作可读副本**：换届期间 log 可能被回滚（基线选最大 viewstamp 时其他节点的"超前"未 committed log 会被覆盖），此时读会拿到稍后被丢弃的数据。
6. **recovery nonce 不能复用**：每次 recovery 必须新生成 nonce；用旧 nonce 会让节点接收到老会话的延迟响应，进入错误的 view。

## 适用 vs 不适用场景

**适用**：

- state machine replication，3–7 副本（f=1 要 3 节点，f=2 要 5 节点）
- 需要协议层 at-most-once、不想在应用层手写去重的系统
- 同城/跨机房三副本：正常路径约 1 个 RTT 提交，view change 通常 1–2 个超时周期
- 需要运行时加减节点（reconfiguration）的长期运行系统

**不适用**：

- 拜占庭故障 → 用 PBFT（Castro & Liskov 1999）
- leaderless / multi-master → 用 EPaxos / Generalized Paxos
- 单机 / 双机 → VR 至少 `2f+1`，f=1 起步要 3 节点
- 强延迟敏感 + 跨大洲 → Spanner 用 Paxos + TrueTime，跨洲延迟另有设计 ([[spanner-2012]])

## 历史小故事（可跳过）

- **1988**：Oki & Liskov PODC 发表 VR 雏形（[[vr-1988]]）
- **1991**：Liskov 团队用 VR 做 Harp 分布式文件系统（SOSP），首个工业落地
- **1999**：Castro & Liskov 把 VR 扩到拜占庭，写出 PBFT
- **2012**：Liskov 与博士生 Cowling 重写 VR Revisited，作为 MIT 技术报告发布——本文
- **2014**：Stanford 的 Diego Ongaro 写 [[raft]]，论文 Section 10 直接致谢 VR Revisited，承认 term/leader/log 三件套来自这里
- **2020s**：TigerBeetle、其他金融领域副本数据库选 VR Revisited 作共识引擎

## 学到什么

1. **同一协议骨架可以重写两次**：1988 是数学家写的"骨架"，2012 是工程师写的"操作手册"，骨架没变，可执行性天差地别——好的论文有重写一次的勇气
2. **at-most-once 语义最好下沉到协议层**：client table 这个小机制让客户端代码大幅简化；不下沉的话每个用户都要自己写去重，错的概率指数升高
3. **状态机要显式**：1988 用文字描述节点角色，2012 用 status 字段做成枚举——一个抽象层级的差距，决定了能不能写出生产级实现
4. **reconfiguration 要复用主协议**：不要为成员变更单独发明一套机制，把它当作一种 op 走同样的 view change，复杂度收敛
5. **一篇好论文的孩子可能比父亲更出名**：Raft 知名度远超 VR Revisited，但 Raft 自承"不过是 VR 的更易懂表达"

## 延伸阅读

- 论文 PDF：[Liskov & Cowling 2012](https://pmg.csail.mit.edu/papers/vr-revisited.pdf)（30 页，先看 Section 4 normal case + Section 5 view change + Section 6 recovery）
- [[vr-1988]] —— 先读这篇看骨架，再读 2012 看肉
- [[raft]] —— 看完 VR Revisited 再看 Raft 会一眼认出"哪些是同义改名、哪些是真简化"
- 视频：[Heidi Howard 关于共识协议的对比讲座](https://www.youtube.com/results?search_query=heidi+howard+consensus)（剑桥博士，把 Paxos / VR / Raft 的几何同源讲得很清楚）
- 实现参考：[TigerBeetle](https://tigerbeetle.com/) 用 VR Revisited 做引擎，代码开源
- [Diego Ongaro Raft 博论](https://web.stanford.edu/~ouster/cs244b/papers/OngaroPhD.pdf)（Section 10 详细列了与 VR 的对应关系）

## 关联

- [[vr-1988]] —— 同协议的 1988 原版，骨架在那但工程细节全在本文
- [[raft]] —— 直接借鉴 VR Revisited 的 leader/term/log 三件套
- [[paxos-1998]] —— 同期共识协议的另一脉，数学等价但语言不同
- [[paxos-simple-2001]] —— Lamport 自己的简化讲法，仍偏数学
- [[lamport-1978]] —— viewstamp 用的逻辑时钟思想从这里来
- [[spanner-2012]] —— Google 跨大洲强一致系统，底层 Paxos 系，与 VR 同属 leader-based
- [[chubby]] —— Google 锁服务，Multi-Paxos 实现，思想与 VR 同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chubby]] —— Chubby — 给凡人用的分布式锁服务
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[raft]] —— Raft — 易理解的共识算法
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[vr-1988]] —— VR 1988 — 用"主备 + 换届"做共识的另一脉

