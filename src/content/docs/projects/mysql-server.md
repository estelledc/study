---
title: mysql-server — 一个仓库装下整套 OLTP 引擎
来源: https://github.com/mysql/mysql-server
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

`mysql/mysql-server` 是 **MySQL 数据库本体的源码仓库**——从 SQL 解析器、查询优化器，到事务管理、存储引擎，再到主从复制、备份工具，**一仓全收**。约 600 万行 C++，从 1995 年提交到今天，是当今最大的活跃数据库源码库之一。

注意区分：

- 产品总览（生态、选型、文档面貌）见 [[mysql]]
- 这一篇看 **源码仓库本身**——目录怎么切、InnoDB 内部怎么转、想读源码从哪儿下手

类比：[[mysql]] 那一篇讲"丰田卡罗拉为什么卖得好"，这一篇拆开发动机看皮带轮怎么咬合。

## 为什么重要

OLTP（联机事务处理）的所有经典话题——**WAL、MVCC、行锁、崩溃恢复、二阶段提交**——都能在 `storage/innobase/` 这一个子目录里看到工程级实现。要做数据库内核研究 / 中间件 / 国产数据库，绕不过这份源码。

具体能学到：

- **可插拔存储引擎**怎么把"SQL 表面"和"底层存储"解耦——InnoDB / MyISAM / Memory 共用一套上层
- **双日志架构**：redo log（InnoDB 层，崩溃恢复用）+ binlog（server 层，复制用），两者用 XA 协调
- **buffer pool**：64GB 内存怎么管几亿条记录，LRU 改良版怎么避免全表扫描污染
- **大型 C++ 工程**长什么样——600 万行、6000+ 测试、20+ 子模块

Facebook、GitHub、Uber 都自己 fork 这份源码改——大厂改数据库源码是日常。

## 核心要点

仓库设计可拆成 **三个关键决定**：

1. **存储引擎抽象层**（`sql/handler.h`）：定义一套 handler 接口（open/close/read_next/write_row/commit），任何引擎实现这套接口就能挂进来。**类比**：手机壳标准化，任何品牌手机都能塞。InnoDB 是 `storage/innobase/handler/ha_innodb.cc` 实现，MyISAM 是 `storage/myisam/ha_myisam.cc` 实现。

2. **InnoDB = WAL + MVCC + B+ 树**：
   - **WAL**：写数据前先把"我要写什么"记到 redo log，崩溃后重放（`storage/innobase/log/`）
   - **MVCC**：每行带 trx_id + roll_ptr，旧版本走 undo log 链（`storage/innobase/trx/`），读不加锁
   - **B+ 树聚簇索引**：主键索引就是数据本身，二级索引存主键值（`storage/innobase/btr/`）

3. **server 层 vs 引擎层分离**：连接管理、SQL 解析、优化器、binlog 在 `sql/`；具体读写、事务、锁、缓存在 `storage/<engine>/`。这条线是理解 MySQL 复制、XA、原子 DDL 的关键。

## 实践案例

### 案例 1：从仓库结构入手

```
mysql-server/
├─ sql/             # server 层：解析器、优化器、执行器、binlog
│  ├─ sql_parse.cc      # SQL 入口（mysql_execute_command）
│  ├─ sql_select.cc     # SELECT 优化执行
│  └─ binlog.cc         # 二进制日志（复制源）
├─ storage/
│  ├─ innobase/         # InnoDB 引擎（重头戏）
│  │  ├─ handler/       # 对接 server 层 handler 接口
│  │  ├─ btr/           # B+ 树
│  │  ├─ buf/           # buffer pool
│  │  ├─ log/           # redo log
│  │  ├─ trx/           # 事务 + MVCC
│  │  └─ lock/          # 行锁
│  ├─ myisam/           # 老引擎（无事务）
│  └─ memory/           # 临时表
├─ plugin/          # 认证、审计、半同步复制等插件
├─ router/          # MySQL Router（中间件）
└─ mysql-test/      # MTR 测试框架（6000+ 测试）
```

读源码建议从 `sql/sql_parse.cc::mysql_execute_command` 入口往下追，碰到 `ha_*` 调用就跳到 `storage/innobase/handler/ha_innodb.cc`。

### 案例 2：一条 INSERT 在源码里走过哪些层

```sql
INSERT INTO products VALUES (1, '咖啡豆');
```

源码层穿透：

1. **server 层解析**：`sql/sql_parse.cc` → 词法分析 → 语法树
2. **server 层执行**：调 `handler::write_row()`（多态调到引擎实现）
3. **引擎层**：`ha_innodb.cc::write_row()` → 调 InnoDB 内部 `row_insert_for_mysql()`
4. **B+ 树插入**：`btr/btr0cur.cc` 找到主键位置插入数据页
5. **写 redo log**：`log/log0log.cc` 顺序写日志（保证崩溃可恢复）
6. **写 undo log**：`trx/trx0undo.cc` 记录"原本不存在"，便于回滚和 MVCC
7. **回到 server 层 binlog**：`sql/binlog.cc` 写 binlog（给从库重放用）
8. **二阶段提交**：redo log prepare → binlog 写完 → redo log commit（保证两份日志一致）

这 8 步是面试 / 系统课考"为什么先写日志"的标准答案。

### 案例 3：编译跑起来

```bash
git clone https://github.com/mysql/mysql-server.git
cd mysql-server && mkdir bld && cd bld
cmake .. -DWITH_BOOST=../boost -DDOWNLOAD_BOOST=1
make -j8                 # 普通笔记本约 30 分钟
./bin/mysqld --initialize --basedir=. --datadir=./data
./bin/mysqld --basedir=. --datadir=./data &
./bin/mysql -u root -p
```

跑通后可以 `gdb attach` 上去，下断点在 `mysql_execute_command`，从客户端发 `SELECT 1` 就能一路单步看下来。

## 踩过的坑

1. **默认 utf8 不是真 UTF-8**：历史遗留，`utf8` 只 3 字节，存不下 4 字节 emoji。源码在 `sql/sql_yacc.yy` 里仍保留这个别名映射。**正解**：`utf8mb4` 一路设到底。

2. **InnoDB 二级索引"回表"**：二级索引叶子节点存的是主键值，不是行数据。查二级索引后还要拿主键再查一次聚簇索引——这就是"回表两次 B+ 树"。覆盖索引（包含所有查询列）能避开。

3. **redo log 默认太小**：默认 `innodb_log_file_size=48MB`，高并发写场景日志切换频繁，性能抖动。生产建议 1-4GB。

4. **buffer pool 默认太小**：默认 `innodb_buffer_pool_size=128MB`，机器有 64GB 内存也只用 128MB 缓存，命中率惨。建议设 50-70% 物理内存。

5. **ALTER TABLE 大表卡死**：5.6 起有 online DDL，但仍常重建/复制表；千万级表加字段仍可能抖几小时。8.0 原子 DDL 才明显好转。老系统升级前必做迁移演练。

6. **误用 MyISAM**：没事务、断电可能损坏、不支持外键。源码里 `storage/myisam/` 还在但生产严禁——老教程用 MyISAM 的复制粘贴就翻车。

## 适用 vs 不适用场景

**适用**：

- 做数据库内核 / 存储引擎 / 复制中间件研究，需要对照工业实现（`storage/innobase/` 约百万行级）
- 排查「为什么这条 SQL 慢 / 为什么主从不一致」时，要从 handler → InnoDB 路径读源码
- 学习大型 C++ 工程怎么切模块：server 层 `sql/` 与引擎层 `storage/` 的边界本身就是教材

**不适用**：

- 只想选型、装库、写业务 SQL——看 [[mysql]] 产品篇或官方文档即可，不必 clone 600 万行
- 只要托管云库（RDS / Aurora）运维面板，不碰自建与源码改动
- 想找「现代学院派」对照实现——优先 [[postgresql]]；想嵌入式零部署——优先 [[sqlite-2022]]

## 历史小故事

- **1995**：Monty Widenius 在瑞典写出 MySQL 1.0
- **1995-2000**：Heikki Tuuri 独立写 InnoDB 引擎（最初不是 MySQL 的）
- **2000**：MySQL 走 GPL 开源，InnoDB 接入成为可选引擎
- **2005**：Oracle 收购 InnoDB 的母公司 Innobase——埋下后续整合伏笔
- **2008**：Sun Microsystems 10 亿美元收购 MySQL AB
- **2010**：Oracle 收购 Sun，MySQL 进 Oracle；同年 Monty fork 出 MariaDB
- **2010**：InnoDB 成为 MySQL 默认引擎，替代 MyISAM
- **2018**：MySQL 8.0 发布——CTE、窗口函数、原子 DDL、hash join、不可见索引

## 学到什么

1. **可插拔架构的工业范本**：handler 接口让 InnoDB 后来居上替代 MyISAM，整个生态平滑过渡——这是研究"扩展点设计"的活样本
2. **双日志 + XA**：redo log 管崩溃恢复，binlog 管复制，两份日志通过 XA 二阶段提交保持一致——是分布式事务最朴素也最有效的实现
3. **WAL 是 OLTP 的灵魂**：先写日志再改数据，这条原则从 1992 年 ARIES 论文延续到今天的 InnoDB
4. **600 万行也能读**：从入口函数 + handler 接口切入，每一层只看自己关心的部分，不需要"读完整个仓库"

## 延伸阅读

- 仓库主页：[mysql/mysql-server](https://github.com/mysql/mysql-server)
- 源码导读："High Performance MySQL"（OReilly 出版）+ "MySQL 技术内幕：InnoDB 存储引擎"（姜承尧）
- 官方文档：[MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- [[aries-1992]] —— InnoDB 崩溃恢复的理论母本
- [[mysql]] —— 产品视角的姊妹篇

## 关联

- [[mysql]] —— 产品视角总览（生态、选型、运维）
- [[aries-1992]] —— WAL + 崩溃恢复的理论奠基
- [[gray-1981-transaction]] —— 事务抽象的源头
- [[system-r-1976]] —— 关系数据库的第一个工业实现
- [[postgresql]] —— 对照阵营，源码风格更学院派
- [[sqlite-2022]] —— 嵌入式对照，单文件零部署
- [[skip-locked-postgres-9.5]] —— 行锁机制的对照实现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[mariadb-server]] —— mariadb-server — MySQL 原作者带走的那一支
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[vitess]] —— Vitess — 给 MySQL 装上水平分片的代理层

