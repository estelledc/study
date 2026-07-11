---
title: TigerBeetle — 只能记账但把记账做到极致的金融数据库
来源: 'Joran Dirk Greef. "Redesigning OLTP for a New Order of Magnitude". QCon SF 2023'
日期: 2026-05-30
分类: 数据库
难度: 中级
---

## 是什么

TigerBeetle 是一个**只会做一件事的数据库——把钱从 A 账户搬到 B 账户**。日常类比：像银行柜台只受理"存钱、取钱、转账"三种业务的窗口——你想存包裹、查物流、办护照都不行，但你要转账它一秒能处理几十万笔。

通用数据库（PostgreSQL / MySQL）是瑞士军刀，啥都能干但啥都不极致。TigerBeetle 反过来：只接受两张表（`accounts` + `transfers`），字段写死，每次只接受一种操作——**批量转账**（一次最多 8189 条）。

代价是它存不了用户头像、订单详情、商品库存。换来的是：双本记账的"借贷必平"约束写在引擎里，应用层根本不可能写出"借了不贷"的 bug；单节点 100K-500K 笔/秒峰值。

## 为什么重要

不理解 TigerBeetle，下面这些事都没法解释：

- 为什么 2024 年还有人从零写数据库——通用 DB 不是已经够好了吗
- 为什么金融团队用 PG 实现转账时"对账不平"bug 反复出现，TigerBeetle 把它根除
- 为什么"只能干一件事"反而能跑出通用 DB 十倍的性能
- 为什么作者宁可自己写 LSM 树也不用 RocksDB——为了能在 CI 里跑万亿次确定性测试

## 核心要点

TigerBeetle 反直觉的关键有 **三条**：

1. **schema 写死 = 编译期不变量**：`accounts` 字段（128 字节）和 `transfers` 字段（128 字节）写在源码里。每条 transfer 必然同时改两个 account 的 debits/credits——你**根本无法**发起一笔不平的转账，因为 API 不允许。类比：像专用收银机，按钮就那几个，按错都按不出去。

2. **VSR 共识替代 Raft**：选 Viewstamped Replication（VSR）不是因为更强，是因为 view-change 更对称、更容易形式化验证。Raft 的 leader 选举有特殊条件触发，VSR 的 view 切换是统一规则——更难写但更易证。

3. **deterministic simulation testing（DST）**：把整个集群跑在受控随机的虚拟时间里——磁盘故障、网络分区、时钟漂移都由 PRNG 控制。CI 跑几小时等价跑 2000 个模拟年。任何状态分歧立即 dump 一个 seed，下次能精确 replay。这逼着团队**自己写 LSM 树**——RocksDB 的后台线程不确定，DST 跑不了。

## 实践案例

### 案例 1：发起一笔最简单的转账

用 TigerBeetle 的 Node.js 客户端：

```javascript
const { createClient } = require('tigerbeetle-node')
const client = createClient({ cluster_id: 0n, replica_addresses: ['3000'] })

await client.createTransfers([{
  id: 1n,
  debit_account_id: 100n,   // 从 100 号账户扣
  credit_account_id: 200n,  // 加到 200 号账户
  amount: 1000n,
  ledger: 1, code: 1, flags: 0,
  pending_id: 0n, user_data_128: 0n, user_data_64: 0n, user_data_32: 0,
  timeout: 0, timestamp: 0n,
}])
```

**逐部分解释**：
- `debit_account_id` + `credit_account_id` 是必填的——这就是双本记账约束
- `amount` 一笔金额，引擎保证 `account[100].debits += 1000` 和 `account[200].credits += 1000` 同时发生
- 字段全是固定整数，**没有 SQL、没有 schema 注册**——客户端发的就是 128 字节定长包

### 案例 2：deterministic simulation 是怎么跑的

```bash
# 在 CI 里跑 1 小时的故障注入测试
zig build vopr -- --seed 12345
# 触发不变量违反 → 把 seed 12345 dump 出来
zig build vopr -- --seed 12345  # 同一个 seed，确定性 replay
```

**逐部分解释**：
1. `--seed 12345` 像游戏存档编号——同一编号必走出同一条故障时间线
2. 进程内起 6 个虚拟 replica，时钟/网络/磁盘全由同一个伪随机数生成器（PRNG）驱动
3. 一旦不变量破了，把 seed dump 出来就能精确 replay——bug 不再"偶尔出现"

### 案例 3：VSR view-change 和 Raft 选举的差异

```
Raft：term + leader election
  - 每个 term 至多一个 leader
  - 触发：election timeout 或 leader 心跳丢失
  - leader 必须有最长日志

VSR：view + view-change
  - 每个 view 编号 = view % N，对应固定 replica 当 leader
  - 触发：任何 replica 怀疑当前 view 即可发起
  - 更对称：选 leader 不是"竞选"，是"轮值"
```

**逐部分解释**：
1. Raft 像选总统——多人可能同时竞选，规则分支多
2. VSR 像值日生——`view % N` 直接点名谁当班，规则统一
3. 轮值更易形式化验证，所以 TigerBeetle 选 VSR 而不是更出名的 Raft

## 踩过的坑

1. **它不是通用数据库**——你不能用它存用户头像、订单详情、商品库存。schema 写死，只能塞 128 字节固定字段。新人最容易把它当成"更快的 PG"用。

2. **客户端必须批接口**——单条 transfer RPC 性能反而差，要把请求批到 8189 条/批才接近峰值吞吐。应用层得改造提交节奏，不能"来一笔写一笔"。

3. **VSR 不是 Raft，运维心智不能照搬**——监控的是 `view` 不是 `term`，view-change 的触发条件更宽松，新人读源码容易把概念搞混。

4. **deterministic simulation 不替代生产灰度**——DST 找的是状态机分歧，找不出真实硬件 bug、性能回归、热账户倾斜。仍然要按金融行业惯例做 canary。

## 适用 vs 不适用场景

**适用**：
- 双本记账场景：银行清算、支付通道、加密交易所、interbank settlement
- 高吞吐 + 低延迟 + 强一致的金融小事务（目标 ≥10 万笔/秒，或热账户高争用）
- 团队有能力把 ledger 子系统独立出来部署

**不适用**：
- 通用业务数据（用户、订单、商品）→ 还是用 PG / MySQL
- 需要复杂查询 / OLAP 分析 → 它没 SQL
- 吞吐远低于 10 万笔/秒且无热账户争用 → PG 记账通常够用
- 需要灵活 schema / 频繁加字段 → schema 写死，加字段要改源码重编
- 早期原型阶段的初创团队 → 先用 PG 验证业务逻辑，业务跑通且确实卡在 ledger 性能上才换

## 历史小故事（可跳过）

- **2018 年前后**：Joran Dirk Greef 在 Coil（一家做 interledger 支付的公司）做工程，反复看到金融团队用 PG/MySQL 做记账，对账 bug 一抓一把。
- **2020 年**：决定从零写专用记账 DB，初版用 Node.js 原型验证想法。
- **2021 年**：用 Zig 重写——为了静态内存分配、编译期保证、单 binary 部署。
- **2022–2023 年**：YC 加持；QCon 等场合公开讲 OLTP 重设计；VOPR 确定性模拟成为核心工程方法。
- **2024 年**：生产就绪发布，GitHub star 破万，部分 fintech 用作 ledger source of truth。

## 学到什么

1. **专用打败通用**：当一个负载场景重要到值得为它专门写整个 stack（schema、共识、存储、I/O），收益可以是 10×。
2. **测试方法学反向决定架构**：要做 deterministic simulation，就不能用 RocksDB——这是"测试方法逼出工程选型"的经典案例。
3. **写死 schema 是反向解耦**——把不变量从应用层下沉到引擎层，bug 在编译期就被排除。
4. **VSR 不弱于 Raft**，只是表达"轮值"而不是"竞选"。选共识协议时不要默认 Raft。
5. **TIGER_STYLE 是把 NASA 的"飞控代码规范"搬到金融系统**——静态分配、断言密度 ≥2/函数、函数 ≤70 行、无递归、有界循环。这种约束让代码可以被人脑阅读，也能被模拟器穷举。

## 延伸阅读

- 官方网站：[tigerbeetle.com](https://tigerbeetle.com)（含 whitepaper 链接）
- GitHub：[tigerbeetle/tigerbeetle](https://github.com/tigerbeetle/tigerbeetle)（Zig，Apache-2.0）
- Joran Greef QCon 演讲：[Building TigerBeetle](https://www.youtube.com/results?search_query=joran+greef+tigerbeetle)
- TIGER_STYLE 编码方法学：[docs/TIGER_STYLE.md](https://github.com/tigerbeetle/tigerbeetle/blob/main/docs/TIGER_STYLE.md)
- [[raft]] —— TigerBeetle 选了 VSR 而非 Raft 的对照对象
- [[lsm-tree-1996]] —— TigerBeetle 自家 LSM forest 的理论根

## 关联

- [[raft]] —— Raft 比 VSR 名气大，但 TigerBeetle 论证 VSR 更易形式化
- [[paxos]] —— VSR 与 Multi-Paxos 等价，TigerBeetle 给 Paxos 家族一个工业实例
- [[lsm-tree-1996]] —— TigerBeetle 不用 RocksDB，自己实现 LSM forest 以保证 deterministic
- [[rocksdb-lsm]] —— RocksDB 是被 TigerBeetle 拒绝的对照——后台线程不确定无法做 DST
- [[aries-1992]] —— ARIES 是通用 OLTP recovery 经典，TigerBeetle 选了完全不同的副本恢复路径
- [[foundationdb]] —— FoundationDB 最早把 deterministic simulation 做成工程方法，TigerBeetle 推到极致
- [[io-uring]] —— TigerBeetle 所有 I/O 走 io_uring，这是它能跑那么快的硬件层基础

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[f1-2013]] —— F1 2013 — 把 Spanner 包成 SQL，扛起 AdWords 全部账单
- [[foundationdb-2021]] —— FoundationDB 2021 — 把数据库拆成五个角色，再用一个 seed 烧十年 bug
- [[gfs]] —— GFS — 为工作负载反向定制的分布式文件系统
- [[paxos-1998]] —— Paxos 1998 — 古希腊议会寓言里藏的共识协议
- [[paxos-simple-2001]] —— Paxos Made Simple — Lamport 用平直英语把共识协议推导一遍
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写
- [[smr-1990]] —— SMR 1990 — 把"容错服务"还原成"多副本一起跑同一台状态机"
- [[zgc]] —— ZGC — 让 GC 停顿与堆大小解耦的低延迟回收器
- [[orleans]] —— Orleans — 让分布式服务写起来像单机对象
