---
title: FoundationDB — 把数据库拆成 5 个独立角色，再用确定性仿真烧 10 年 bug
来源: 'Zhou et al., "FoundationDB: A Distributed Unbundled Transactional Key Value Store", SIGMOD 2021'
日期: 2026-05-29
分类: 分布式系统
难度: 高级
---

## 是什么

FoundationDB（**FDB**）是一个**分布式键值数据库**，但它真正的招牌不是更快或更便宜，而是两件事：

1. **把数据库拆成 5 种独立进程**——客户端、commit proxy、resolver、transaction log、storage server，每种独立部署、独立伸缩、独立故障切换
2. **用确定性仿真器把整个 cluster 跑在一个进程里**——10 年开发期间烧了相当于真实生产 N 年量级的故障事件

日常类比：传统数据库像一栋楼把所有部门挤在一层；FDB 把每个部门分到独立大楼，专人专线。仿真器则像是把整栋楼塞进电脑里，按一个 seed 复现任何一次"恰好在凌晨 3 点宕机"的剧本。

它是 Apple iCloud、Snowflake metadata 等系统的底座。论文是 SIGMOD 2021 industrial track。

## 为什么重要

不理解 FDB，下面这些事都没法解释：

- 为什么 2020+ 主流分布式数据库（CockroachDB / TiDB / Spanner）都把"事务管理"和"存储"装在同一个 binary 里——这个选择是有代价的
- 为什么 TigerBeetle / Antithesis 这一拨 2020s 新工具都在讲"deterministic simulation"——FDB 是这股潮流的源头
- 为什么 Apple 收购 FoundationDB Inc. 后又选择把它开源——商业失败的产品如何获得技术胜利
- 为什么"测试方法论"可以是分布式系统最大的护城河，比算法本身更难复制

## 核心要点

1. **Unbundled 架构**：把"事务系统"拆成 client / proxy / resolver / log / storage 五种独立角色。类比：餐厅把"点单 / 收银 / 厨房 / 仓库 / 上菜"拆成五条独立流水线，每条单独扩容。

2. **OCC 在 resolver 层做冲突检测**：客户端读时不加锁，只在 commit 时由 resolver 检查"我读过的范围里，过去 5 秒有没有别人写过"。类比：图书馆借书不锁书架，只在还书时检查这本书在借走期间有没有被别人动过。

3. **Flow actor 模型**：所有"等待 I/O"都翻译成 future/promise。一个进程一个线程跑所有 actor——没有 thread = 没有 data race = 没有非确定性。

4. **Sim2 确定性仿真器**：同一份二进制能跑生产、也能跑仿真。仿真模式下网络、磁盘、时钟、kill-process 全部由一个 PRNG seed 决定。任何 bug 拿 seed 都能本地 100% 复现。

5. **Layered 架构**：核心只是 KV，SQL / Document / Record 都是上层独立项目。哲学上漂亮，商业上让 FDB 比 Spanner 难推广。

## 实践案例

### 案例 1：一次事务的生命周期

```python
import fdb
fdb.api_version(720)
db = fdb.open()

@fdb.transactional
def incr_counter(tr, k):
    cur = tr[k.encode()]
    n = int(cur) if cur.present() else 0
    tr[k.encode()] = str(n + 1).encode()
    return n + 1

incr_counter(db, "counter")
```

`@fdb.transactional` 装饰器会自动跑这一套：

1. Client 向某个 commit proxy 拿 read version → 读数据 → 本地累积 read / write 集
2. Client 调 `tx.commit()` → proxy 收到打包请求
3. Proxy 把请求转给 resolver → resolver 检测冲突
4. 无冲突 → proxy 把 mutation 写入 transaction log（fsync 持久化）→ 回 ACK
5. Storage server **异步**从 log 拉数据应用

任何一步失败（包括 OCC 冲突）→ 客户端自动重试。

### 案例 2：OCC 在 resolver 怎么检测冲突

```
事务 T1 在 version=100 读了 key 范围 [k5, k10]
事务 T2 在 version=99 → 110 写了 key=k7

T1 想提交：
  resolver 看 T1 的 read 范围 [k5, k10]
  vs 5 秒历史窗口里已提交事务的 write 集合（含 T2 写的 k7）
  [k5, k10] 与 {k7} 有重叠 → T1 必须 abort
  Client 收到 conflict → 自动重试，从最新 version 再读
```

整个过程**没有任何锁**——只是 range overlap 检查。这就是为什么 FDB 读不阻塞写、写不阻塞读。

### 案例 3：Sim2 仿真器怎么烧 bug

```
开发者跑：bin/fdbserver -r simulation -s 12345

simulation 模式启动：
  - 一个 OS 进程里跑 20 个虚拟节点（actor）
  - 网络是内存队列，PRNG 决定每个 packet 何时投递、是否丢失
  - 磁盘是内存模拟，PRNG 决定 latency / 是否 corruption
  - 25% test 启用 BUGGIFY → 故意延迟 / kill / corrupt
  - 跑 1 小时仿真 ≈ 真实生产 N 天事件量

如果触发 assert 失败：
  → dump seed=12345
  → 开发者本地拿 -s 12345 100% 复现
```

这是为什么 FDB 的分布式 corner case bug 能在 CI 抓住，而不是等生产里出事。

## 踩过的坑

1. **5 秒事务上限**：FDB 的 OCC 历史窗口默认 5 秒，超过的事务必然 abort（"too_old"）。OLAP / 数据迁移类长事务必须切片，应用层负责跨片一致性。

2. **热 key 退化为 OCC 噩梦**：低冲突时 OCC 吞吐爆表，但热 key（热点账户 / 计数器）下事务大量 abort retry，吞吐反而比 2PL 差。RateKeeper 部分缓解但不能根治。

3. **Layered 哲学的商业代价**：核心只给裸 KV，SQL layer 长期处于 alpha——用户想直接写 SQL 就得自己堆 layer。开源 8 年采用率仍主要在大厂内部。

4. **Ops 复杂度真实存在**：5 种 role + cluster controller + master + rate keeper + data distributor 的部署比单 binary 复杂数倍。Apple 内部 ops 经验不能直接复制到小团队。

## 适用 vs 不适用场景

**适用**：

- 高可靠分布式 KV（metadata / index / 配额 / epoch）——Snowflake metadata、Apple iCloud 实证
- 团队接受写代码自己处理 OCC 重试
- 极端可靠性场景，愿意把"测试一次跑过生产 N 年事件"作为目标
- 需要跨行 ACID 但不强求 SQL 的产品（自己堆 layer）

**不适用**：

- 小团队 OLTP 应用 → PostgreSQL 单机足够
- SQL 优先 / 标准 ORM 兼容场景 → CockroachDB / TiDB / Spanner 更友好
- 长事务 / 大批量 ETL → FDB 5 秒上限直接拦
- 高冲突热 key 工作负载 → OCC 退化，选 2PL 系
- 多 region active-active → FDB 单 cluster ACID，跨 region 要应用层补

## 历史小故事（可跳过）

- **2009 年**：Dave Rosenthal、Dave Scherer 等人在纽约创立 FoundationDB Inc.，目标是"分布式 ACID KV"
- **2013 年**：v1 GA。从第一天起坚持 deterministic simulation——10 年后这成了核心护城河
- **2015 年**：Apple 收购，FDB 转为 Apple 内部使用（iCloud 等系统底座）
- **2018 年**：Apple 开源 FDB（Apache-2.0），允许社区使用
- **2021 年**：SIGMOD industrial track 论文公开整套架构 + 测试方法论
- **2018 年起持续**：原创始团队部分成员成立 Antithesis，把 deterministic simulation 商业化

## 学到什么

1. **架构选择有"测试友好度"维度**：unbundled vs bundled 不仅是 ops 复杂度，更是 testing 难度。FDB 选 unbundled 让仿真容易做，长期 ROI 高
2. **Deterministic simulation 是工程护城河**：算法论文抄一晚上就能写出，但 10 年 simulation 哲学是组织能力，不可短期复制
3. **Layered 是哲学胜利、商业失败**：核心简单、上层独立 = Unix 哲学；但终端用户要 SQL，layered 系统采用率长期受限
4. **OCC 不是万能**：低冲突时它最好，高冲突时它最差——选并发控制要看真实工作负载

## 延伸阅读

- 论文 PDF：[FoundationDB SIGMOD 2021](https://www.foundationdb.org/files/fdb-paper.pdf)（14 页 industrial track，工程细节密度高）
- 视频：[Will Wilson — Testing Distributed Systems w/ Deterministic Simulation](https://www.youtube.com/watch?v=4fFDFbi3toc)（Strange Loop 经典 talk，把 Sim2 哲学讲透）
- 官方仓库：[apple/foundationdb](https://github.com/apple/foundationdb)（C++17 + Flow actor compiler，开源完整 cluster + 仿真器）
- [[spanner]] —— 对照路线：bundled NewSQL + TrueTime + 2PC
- [[tigerbeetle]] —— deterministic simulation 哲学在金融 OLTP 的传人

## 关联

- [[spanner]] —— bundled NewSQL 代表，TrueTime + 2PC，与 FDB 哲学正相反
- [[tigerbeetle]] —— 把 FDB 的 deterministic simulation 带到金融双本记账
- [[calvin]] —— deterministic 派另一条路：先全局排序再执行，避开冲突检测
- [[aurora]] —— 另一种 unbundle：把 storage 从 compute 解耦，事务管理仍 bundled
- [[bigtable]] —— FDB 之前的 KV 祖宗，单行事务、没有跨行 ACID
- [[erlang-otp]] —— actor 模型的元老，Flow 是 C++ 工业版
- [[paxos]] —— FDB 的 TLog 复制走 Paxos-style quorum

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[aurora]] —— Aurora — 把数据库的下半身换成日志机
- [[bigtable]] —— Bigtable — Google 把行级随机读写做到 PB 级的存储
- [[calvin]] —— Calvin — 不要每次都协商，先排好顺序大家照做
- [[erlang-otp]] —— Erlang OTP — 容错并发系统设计
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[paxos]] —— Paxos — 分布式共识算法
- [[spanner]] —— Spanner — 全球分布式 SQL 数据库
- [[spanner-2012]] —— Spanner 2012 — 用原子钟和 GPS 给全球数据库发时间戳
- [[tigerbeetle]] —— TigerBeetle — 只能记账但把记账做到极致的金融数据库

