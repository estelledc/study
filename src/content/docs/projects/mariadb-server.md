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

采用方包括 Wikipedia（2013 全量切换）、Google（2014 内部切换）、RHEL 7+ 和 Debian 9+ 默认。

## 核心要点

仓库的设计可以拆成 **三个关键决定**：

1. **保留 MySQL 的 handler 抽象，但塞更多引擎**：`sql/handler.h` 这套接口（open / read_next / write_row / commit）和上游一模一样，所以 MyISAM / InnoDB 这些老引擎的代码能直接复用。新增的 Aria / MyRocks / ColumnStore 也只要实现这套接口就能挂进来。

2. **Aria = 崩溃安全的 MyISAM**：MyISAM 快但断电会损坏。Monty 重写了一份带 redo log 的版本叫 Aria（`storage/maria/`），用作系统表的默认引擎。可以把 Aria 看成"MyISAM 的 v2"。

3. **ColumnStore 把列存塞进 SQL 入口**（`storage/columnstore/`）：源自 InfiniDB，列式存储 + 大规模并行查询，给 OLAP 用。同一个 `SELECT` 走到 server 层后，按表的引擎类型自动分流到行存或列存。

额外两条工程决定值得注意：

- **Galera 多主复制深度集成**（`wsrep-lib/`）：写集广播 + 全序认证，N 个节点都能写——MySQL 直到 Group Replication 才追上类似能力
- **并行复制比上游早**：10.0 起按事务依赖图并行回放 binlog，从库追主库速度显著提升

## 实践案例

### 案例 1：从仓库结构入手

```
server/
├─ sql/                  # server 层：解析器、优化器、复制、binlog
├─ storage/
│  ├─ innobase/          # InnoDB（默认 OLTP 引擎）
│  ├─ maria/             # Aria（崩溃安全 MyISAM）
│  ├─ myisam/            # 老 MyISAM（仍保留）
│  ├─ rocksdb/           # MyRocks（LSM-tree，写多场景）
│  ├─ columnstore/       # ColumnStore（列存 OLAP）
│  ├─ spider/            # Spider（分片到多个后端）
│  └─ connect/           # CONNECT（联邦：CSV / Excel / 远程库）
├─ plugin/               # 认证、审计、半同步复制等
├─ mysql-test/           # 测试框架
└─ wsrep-lib/            # Galera 多主复制集成
```

入口推荐和上游一致：从 `sql/sql_parse.cc::mysql_execute_command` 往下追，碰到 `ha_*` 调用就跳到对应 `storage/<engine>/handler/`。

### 案例 2：同一份 SQL 走不同引擎

```sql
CREATE TABLE orders   (id INT PRIMARY KEY) ENGINE=InnoDB;     -- OLTP
CREATE TABLE logs     (id INT, body TEXT) ENGINE=MyRocks;     -- 写多
CREATE TABLE metrics  (ts DATETIME, v DOUBLE) ENGINE=ColumnStore; -- OLAP
CREATE TABLE shards   (id INT) ENGINE=Spider COMMENT='backend "node1,node2"';
```

server 层解析完 SQL 后，按表的 ENGINE 字段调对应 handler 实现，互不干扰。同一个数据库实例里事务表 / LSM 表 / 列存表 / 分片表共存——这是 MariaDB 区别于 MySQL 的看家本领。

### 案例 3：编译跑起来

```bash
git clone https://github.com/MariaDB/server.git
cd server && mkdir bld && cd bld
cmake .. -DBUILD_CONFIG=mysql_release
make -j8                           # 笔记本约 30 分钟
./sql/mariadbd --initialize --basedir=. --datadir=./data
./sql/mariadbd --basedir=. --datadir=./data &
./client/mariadb -u root
```

二进制名从 5.5 起从 `mysqld` 渐进改成 `mariadbd`，老脚本兼容做了 symlink。`gdb attach` 后下断点位置和 MySQL 几乎一样。

## 踩过的坑

1. **以为 100% 兼容 MySQL**：早期 fork 时是 drop-in replacement，10.0 之后差异越来越多。JSON 类型实现不同（MariaDB 是 LONGTEXT + CHECK，MySQL 是原生类型），角色 / 权限 / 默认认证插件也分叉。生产迁移必做兼容性测试。

2. **GTID 格式不同**：MariaDB GTID 和 MySQL GTID 不互通。主从混搭要么走老式 binlog 位点复制，要么用中间件转换。云厂商的"无缝迁移"工具大都在这一步翻车。

3. **Galera 写集冲突静默回滚**：多主同步复制下，并发写同一行可能在提交时被回滚（deadlock error）。应用必须能处理 deadlock 重试，不能假设事务一定提交成功。

4. **ColumnStore 当 OLTP 用**：列存擅长批量扫描和聚合，做主键点查会被 IO 打爆。建表前要想清楚是 OLTP 还是 OLAP，别一锅炖。

5. **Aria 默认非事务**：`storage/maria/` 默认是 page 模式（崩溃安全但非事务）。要事务行为得明确指定 transactional=1，老教程常常忽略。

6. **认证默认值不同**：MariaDB 10.4+ 默认 `unix_socket` 认证，从 MySQL 客户端连过来要先 `ALTER USER ... IDENTIFIED BY 'pwd'`，否则报 access denied 一脸懵。

7. **System-Versioned Tables 写放大**：10.3 引入的"系统版本化表"会把所有历史版本永久保存，给审计 / 时态查询用。如果当成普通表用，磁盘消耗会随更新次数线性增长，几个月就把盘塞爆。

## 历史小故事（可跳过）

- **1995**：Monty 在瑞典写出 MySQL 1.0
- **2008**：Sun 10 亿美元收购 MySQL AB
- **2009**：Oracle 宣布收购 Sun，社区担忧 MySQL 命运；Monty 离开并启动 fork
- **2010**：MariaDB 5.1 发布；Oracle 完成收购；MariaDB Foundation 成立
- **2012**：Wikipedia 发起从 MySQL 切到 MariaDB 的全量迁移
- **2014**：Google 公开切换内部 MySQL 到 MariaDB
- **2017**：Red Hat 在 RHEL 7 默认用 MariaDB 替代 MySQL；ColumnStore 发布
- **2020**：MariaDB 10.5 默认 ed25519 认证、即时加列
- **2023**：MariaDB 11.0 GA，新查询优化器代价模型
- **2024**：MariaDB Foundation 与 Corporation 治理分工进一步明确，Foundation 主导社区版路线图

一个细节：MariaDB 5.x 直接接续 MySQL 5.x 的版本号，到 10.0 才开始独立编号——这是为了避免和 MySQL 5.6 / 5.7 撞号又能体现"已经独立演进"的双重诉求。

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

（暂无反向链接）

