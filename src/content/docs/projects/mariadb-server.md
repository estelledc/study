---
title: mariadb-server — MySQL 原作者带走的那一支
来源: https://github.com/MariaDB/server
日期: 2026-05-31
分类: 数据库
难度: 中级
---

## 是什么

`MariaDB/server` 是 **MariaDB 数据库本体的源码仓库**——MySQL 原作者 Monty Widenius 在 Oracle 收购 Sun 的 2009 年带着团队 fork 出来的那一支。约 350 万行 C/C++，从 2009 年到今天独立演进。命名来自 Monty 的二女儿 Maria（大女儿叫 My，那是 MySQL 名字的由来）。

注意区分：

- 上游姊妹仓 [[mysql-server]] 是 Oracle 名下的 MySQL 源码
- 这一篇看 **MariaDB 自己**——为什么 fork、和 MySQL 哪里不一样、那 10 多个存储引擎都干嘛

类比：MySQL 是一辆经典款丰田，MariaDB 是同一个总工程师离职后另起炉灶造的车——底盘相同，但变速箱、座椅、仪表盘换了一遍。

## 为什么重要

理解 MariaDB 能学到三件事，每一件都不限于数据库本身：

- **大型开源项目 fork 后怎么活下去**：不是改个名字就完事，要能独立合并 patch、独立做版本规划、独立维护测试、独立处理安全公告——10 多年没掉队的 fork 凤毛麟角
- **可插拔存储引擎被推到极致**：MySQL 主推 InnoDB，MariaDB 同一个仓库塞了 InnoDB / Aria / MyRocks / ColumnStore / Spider / CONNECT 等 10+ 引擎，OLTP / OLAP / 分片 / 联邦共用一个 SQL 入口
- **fork 推动上游进化**：窗口函数、CHECK 约束、JSON 函数、即时加列——MariaDB 都比 MySQL 早做出来，倒逼 MySQL 8.0 跟进

采用方包括 Wikipedia（2013 全量切换）、Google（约 2013–2014 公开宣布内部迁移）、RHEL 7+ 和 Debian 9+ 默认。

## 核心要点

仓库的设计可以拆成 **三个关键决定**：

1. **保留 MySQL 的 handler 抽象，但塞更多引擎**：`sql/handler.h` 这套接口（打开表 / 读下一行 / 写一行 / 提交）和上游一样，所以老引擎能复用；新引擎只要实现这套"插座"就能挂进来。**类比**：同一套电源插座，换不同电器。

2. **Aria = 崩溃安全的 MyISAM**：MyISAM 快但断电会坏。Monty 重写带 redo log（断电后能把账目对回来的日志）的版本叫 Aria（`storage/maria/`），用作系统表默认引擎。

3. **ColumnStore 把列存塞进 SQL 入口**（`storage/columnstore/`）：源自 InfiniDB，按列存数据、适合大批量分析（OLAP）。同一个 `SELECT` 进 server 后，按表的引擎类型分流到行存或列存。

额外两条：

- **Galera 多主复制**（`wsrep-lib/`）：多个节点都能写，靠写集广播 + 全序认证——像几台收银机共享一本实时对账的总账
- **并行复制比上游早**：10.0 起按事务依赖图并行回放 binlog，从库追主更快

## 实践案例

### 案例 1：从仓库结构入手

```
server/
├─ sql/                  # server 层：解析、优化、复制、binlog
├─ storage/
│  ├─ innobase/          # InnoDB（默认 OLTP）
│  ├─ maria/             # Aria（崩溃安全 MyISAM）
│  ├─ rocksdb/           # MyRocks（写多）
│  ├─ columnstore/       # ColumnStore（OLAP）
│  ├─ spider/            # 分片到多个后端
│  └─ connect/           # 联邦：CSV / 远程库
├─ plugin/  mysql-test/  wsrep-lib/
```

逐部分解释：

1. **先看 `sql/`**：入口与上游类似，从 `sql_parse.cc::mysql_execute_command` 往下追
2. **碰到 `ha_*`**：说明调用到了存储引擎，再跳进 `storage/<engine>/`
3. **按兴趣选一个引擎深入**：不要一上来通读 350 万行

### 案例 2：同一份 SQL 走不同引擎

```sql
CREATE TABLE orders  (id INT PRIMARY KEY) ENGINE=InnoDB;      -- 事务行存
CREATE TABLE logs    (id INT, body TEXT) ENGINE=MyRocks;      -- 写多
CREATE TABLE metrics (ts DATETIME, v DOUBLE) ENGINE=ColumnStore; -- 分析
```

逐部分解释：

1. **建表时选 ENGINE**：决定数据落在哪套存储实现
2. **SQL 入口统一**：解析/优化仍在 `sql/`，执行时按表分流
3. **同实例共存**：事务表 / LSM 表 / 列存表可放在一个库里——这是相对 MySQL 的看家本领

### 案例 3：编译跑起来

```bash
git clone https://github.com/MariaDB/server.git
cd server && mkdir bld && cd bld
cmake .. -DBUILD_CONFIG=mysql_release
make -j8                           # 笔记本约 30 分钟
# 二进制常在 bld 树的 sql/ 或安装前缀的 bin/；名称多为 mariadbd
find . -name mariadbd -type f | head
./sql/mariadbd --initialize --basedir=. --datadir=./data
./sql/mariadbd --basedir=. --datadir=./data &
./client/mariadb -u root
```

逐部分解释：

1. **cmake + make**：先配置再编译；产物路径随选项变化，用 `find` 确认
2. **initialize**：生成空数据目录
3. **mariadbd + mariadb**：服务端与客户端；5.5 起从 `mysqld` 渐进改名，老脚本常有 symlink

## 踩过的坑

1. **以为 100% 兼容 MySQL**：10.0 后差异增多。历史上 JSON 常是 LONGTEXT + CHECK，和 MySQL 原生 JSON 不同；角色/认证也分叉。迁移必做兼容测试。

2. **GTID 格式不同**：MariaDB 与 MySQL 的 GTID 不互通。主从混搭要么走 binlog 位点，要么用中间件转换。

3. **Galera 写集冲突静默回滚**：多主下并发写同一行可能在提交时被回滚。应用必须能 deadlock 重试。

4. **ColumnStore 当 OLTP 用**：列存擅长扫描聚合，主键点查会被 IO 打爆。

5. **Aria 默认非事务**：默认 page 模式（崩溃安全但非事务）；要事务得显式打开。

6. **认证默认值不同**：10.4+ 默认 `unix_socket`，从 MySQL 客户端连过来常要先改密码认证。

## 适用 vs 不适用场景

**适用**：

- 需要 MySQL 兼容 SQL，又想多引擎（InnoDB + ColumnStore / MyRocks / Spider）同实例
- Linux 发行版默认栈、Wikipedia 类大规模只读多的 Web OLTP
- 想用 Galera 做多主、或并行复制追主更快的场景
- 读 MariaDB/MySQL 源码学 handler 可插拔架构（与上游入口几乎同构）

**不适用**：

- 必须 100% 咬死 Oracle MySQL 行为 / 云厂商只提供 MySQL 托管
- 需要与 MySQL GTID 无缝混部主从（格式不互通）
- 只要单一现代引擎、强生态扩展（Postgres 扩展市场往往更厚）
- 把 ColumnStore 当高并发点查 OLTP（选错引擎）

## 历史小故事（可跳过）

- **1995**：Monty 写出 MySQL 1.0；**2008**：Sun 收购 MySQL AB
- **2009**：Oracle 宣布收购 Sun；Monty 离开并启动 fork
- **2010**：MariaDB 5.1 发布；Foundation 成立；版本号先接续 5.x，到 10.0 才独立编号
- **2012–2014**：Wikipedia 全量切换；Google 公开内部迁移
- **2017–2023**：RHEL 默认 MariaDB；ColumnStore；11.0 新优化器代价模型

## 学到什么

1. **fork 不是终点而是起点**：MariaDB 走出独立路线靠的是十年的稳定迭代和向前补特性，不是一次性改名换标
2. **可插拔架构的工业上限**：handler 接口设计够通用，能让 LSM / 列存 / 分片 / 联邦四种风马牛不相及的存储模型共用一个 SQL 入口
3. **fork 反向推进上游**：窗口函数 / CHECK / JSON / 即时加列，MariaDB 早做后倒逼 MySQL 跟进——开源生态里"分裂"也能促进进化
4. **350 万行也能读**：先看 `sql/` 入口，再按引擎兴趣选一个 `storage/<engine>/` 深入，不要一上来就读完整棵树

## 延伸阅读

- 仓库主页：[MariaDB/server](https://github.com/MariaDB/server)
- 官方知识库：[MariaDB Knowledge Base](https://mariadb.com/kb/en/)
- Monty 自述 fork 起因：[Help saving MySQL](https://montywi.livejournal.com/43367.html)（2009）
- [[mysql-server]] —— 上游姊妹仓
- [[rocksdb-lsm]] —— MyRocks 引擎的存储底座

## 关联

- [[mysql-server]] —— 共同源头，2010 年起分叉
- [[mysql]] —— 产品视角的 MySQL 总览
- [[aries-1992]] —— InnoDB / Aria 崩溃恢复的理论母本
- [[rocksdb-lsm]] —— MyRocks 引擎的底座
- [[postgresql]] —— 对照阵营，单一引擎走到底
- [[sqlite-2022]] —— 嵌入式对照，无可插拔引擎概念

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[cockroach]] —— CockroachDB — 全球分布式 SQL
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[rocksdb-lsm]] —— LSM-tree 与 RocksDB — 把所有写都变成顺序写

