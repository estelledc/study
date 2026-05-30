---
title: SQLite — 嵌入式数据库 30 年怎么活下来的
来源: 'Gaffney, Prammer, Brasfield, Hipp, Kennedy, Patel, "SQLite: Past, Present, and Future", VLDB 2022'
日期: 2026-05-30
分类: 数据库
难度: 入门
---

## 是什么

SQLite 是一个**链进你应用进程里**的关系数据库——不是另一个进程、不是网络服务、不开端口。日常类比：PostgreSQL 像出门下馆子（要走过去、点单、等上菜），SQLite 像家里的微波炉（打开门，丢进去，30 秒拿出来）。

你写：

```python
import sqlite3
conn = sqlite3.connect("notes.db")
conn.execute("CREATE TABLE notes (id INTEGER, body TEXT)")
conn.execute("INSERT INTO notes VALUES (1, 'hi')")
```

执行完磁盘上多了一个 `notes.db` 文件——**整个数据库就是这一个文件**。可以 `cp` 走、`scp` 上传、邮件附件发出去，对面直接打开。

这篇论文是 SQLite 作者 D. Richard Hipp 团队 + 威斯康星大学 Jignesh Patel 教授 2022 年在 VLDB 写的 30 年技术综述。

## 为什么重要

不理解 SQLite，下面这些事都没法解释：

- 为什么世界上**装机量最大的数据库**不是 MySQL 也不是 Oracle，而是 SQLite（>1 万亿份在用）
- 为什么你的 iPhone / Android / Firefox / Chrome 都偷偷塞了一份它
- 为什么它**测试代码是产品代码的 640 倍**（产品 ~15 万行，测试 ~9000 万行）
- 为什么一个 2004 年的二进制格式现在还能打开，且承诺到 **2050 年不破坏兼容**

## 核心要点

SQLite 的全部独特性可以拆成 **四层选择**：

1. **进程模型：嵌入式而非 client-server**——库（library）直接链进应用，不开 socket、不起 daemon。省掉网络往返、配置、运维三件大事。
2. **存储模型：单文件 = 整个数据库**——schema、表、索引、WAL 全在一个文件里。文件格式 2004 年定型，承诺到 2050 年向后兼容。
3. **执行模型：VDBE 字节码虚拟机**——SQL 不直接执行，先编译成自定义字节码（类似 JVM），再由一个虚拟机解释。可缓存、可调试、可在 32/64 位机器上一份格式。
4. **质量模型：测试至上**——目标是 DO-178B（航空航天软件标准）的 MC/DC 100% 覆盖。任何一行代码改动都要跑完几十亿条测试用例。

## 实践案例

### 案例 1：单文件能干什么

```bash
sqlite3 mydata.db "SELECT * FROM users LIMIT 5"
cp mydata.db backup.db
scp mydata.db user@server:/data/
```

不需要 dump、不需要导出 SQL、不需要锁表。文件本身就是数据库的**完整二进制快照**。这在嵌入式（手机 app 备份）、CI（测试 fixture）、数据交换（邮件附件传一份小数据集）三种场景下不可替代。

### 案例 2：VDBE 字节码长什么样

```sql
EXPLAIN SELECT name FROM users WHERE id = 1;
```

输出是一系列字节码指令：

```
0  Init       0 7 0
1  OpenRead   0 2 0  -- 打开 users 表
2  Integer    1 1 0  -- 把常量 1 放寄存器
3  SeekRowid  0 6 1  -- 用 rowid=1 查 B-tree
4  Column     0 1 2  -- 取第 1 列（name）
5  ResultRow  2 1 0  -- 输出
```

这些指令由一个 ~150 个 opcode 的虚拟机执行。**类比**：SQL 是 Java 源码，VDBE 字节码是 .class 文件，VDBE 虚拟机是 JVM。好处是 SQL 编译一次可以缓存反复执行，且字节码独立于硬件。

### 案例 3：测试驱动到什么程度

论文里给的数字（截至 2022）：

- 产品代码：约 15.5 万行 C
- 测试代码 + 测试脚本：约 **9200 万行**
- 测试用例数：几十亿
- 测试体系包括：TH3（专有的 100% 覆盖测试）、SQL Logic Tests（几亿条 SQL 跑过 PostgreSQL/MySQL/SQLite 三家结果对照）、模糊测试、IO 错误注入、断电模拟

**类比**：这相当于盖一栋一层楼的房子，但写了 640 层楼的检查清单。

## 踩过的坑

1. **动态类型违反 SQL 标准**：`CREATE TABLE t(x INTEGER)` 后 `INSERT INTO t VALUES('abc')` 不报错——SQLite 用 type affinity（类型亲和），不强制。3.37（2021）后引入 STRICT 表才能严格类型。

2. **网络文件系统不可靠**：NFS / SMB 上 SQLite 的文件锁可能失效。文档明确警告：**不要把 .db 文件放共享盘**。Mac OS 时光机器备份就因此踩过坑。

3. **高并发写不行**：默认整个文件级写锁，写多场景会串行化。WAL 模式（2010 起）允许读写并发，但**还是单写者**。要更高写并发请用 PostgreSQL。

4. **超大数据不行**：理论上限 281 TB，实际 >1 TB 性能明显下降——B-tree 树深、单文件 fsync 慢。

5. **不和 Postgres 竞争**：Hipp 在论文里专门强调 SQLite 的对手不是 PostgreSQL，是 `fopen()`。换句话说，它替代的是『直接读写文件』，不是数据库 server。

## 适用 vs 不适用场景

**适用**：

- 移动 / 桌面应用本地存储（iOS、Android、Electron 应用）
- 浏览器内（Firefox places.sqlite、新出的 sqlite-wasm）
- 嵌入式设备（IoT、汽车娱乐系统、机顶盒）
- CI 测试 fixture、数据交换文件、配置存储
- 中小型只读/低写量网站（写并发 < 几十 QPS）

**不适用**：

- 高并发写入的 OLTP（用 PostgreSQL / MySQL）
- 大数据分析（用 DuckDB——SQLite 同思路但列式 OLAP）
- 分布式（用 Spanner / CockroachDB；新出的 Turso、libSQL 是 SQLite 分布式扩展）
- 网络文件系统场景（锁不可靠）

## 历史小故事（可跳过）

- **2000 年**：D. Richard Hipp 给美军通用动力（General Dynamics）写战舰雷达控制系统，要求『**不依赖任何外部数据库**』。Hipp 用 800 行 C 实现 SQL 子集——这是 SQLite 雏形。
- **2001 年**：Hipp 把代码开源，进入公共领域（Public Domain，比 MIT 还宽松）。
- **2004 年**：文件格式正式定型，承诺到 2050 年不破坏向后兼容。
- **2010 年**：加 WAL 模式，读写可以并发。
- **2013 年**：NGQP（Next-Generation Query Planner）重写查询规划器，从启发式改成基于代价的搜索。
- **2022 年**：本论文发表，第一次完整对外讲清楚 SQLite 的设计哲学和测试方法。

整个 30 年，**核心团队只有 3 个人**。这是软件工程史上少见的小团队 + 大影响案例。

## 学到什么

1. **嵌入式数据库值得独立设计**——不是 PostgreSQL 缩水，是另一种工程权衡（链入进程 / 单文件 / 零运维）
2. **向后兼容是一种长期产品策略**——20 年不破坏文件格式，让 SQLite 进了所有不能停机更新的场景（飞机、汽车、医疗）
3. **测试代码可以比产品代码多两个数量级**——这是把『关键基础设施』和『工具』分开的根本差别
4. **小团队 + 长时间** 能造出比大公司更可靠的基础设施
5. **找对竞品**——SQLite 的对手是 `fopen()` 而不是 PostgreSQL，定位决定一切设计

## 延伸阅读

- 论文 PDF：[SQLite: Past, Present, and Future](https://www.vldb.org/pvldb/vol15/p3535-gaffney.pdf)（VLDB 2022，14 页）
- 官方文档：[SQLite About](https://www.sqlite.org/about.html)（10 分钟读完，比论文更易懂）
- 测试体系详解：[How SQLite Is Tested](https://www.sqlite.org/testing.html)（看完会重新认识『软件质量』）
- 视频：[CMU Database Group - SQLite](https://www.youtube.com/watch?v=ZSKLA81tBis)（Hipp 本人讲）
- [[aries-1992]] —— SQLite 的 WAL 模式是 ARIES 的简化版
- [[b-tree-1972]] —— SQLite 的索引和表都用 B-tree

## 关联

- [[aries-1992]] —— ARIES WAL 协议鼻祖，SQLite WAL 是其工业简化
- [[b-tree-1972]] —— SQLite 索引存储结构
- [[comer-1979-btree]] —— B-tree 综述，解释为什么 SQLite 选它而非 LSM
- [[rocksdb-lsm]] —— 反例：LSM 写优化但读放大；SQLite 选 B-tree 因为嵌入式更看读
- [[stonebraker-2010-sqlnosql]] —— Stonebraker 论 OLTP/嵌入式应垂直拆，SQLite 是典范
- [[bigtable-2006]] —— 另一极：分布式 + 大规模，与 SQLite 单机嵌入式正相反
- [[spanner-2012]] —— 分布式关系数据库，与 SQLite 在『关系』维度同源、在『分布式』维度对立
