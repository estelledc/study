---
title: MySQL — 全球最流行关系数据库
来源: https://github.com/mysql/mysql-server
日期: 2026-05-29
子分类: 数据库
分类: 数据库
难度: 中级
provenance: pipeline-v3
---

## 是什么

MySQL 是 1995 年瑞典工程师 Michael Widenius 写的**开源关系数据库**，凭"快、轻、易部署"成为 Web 时代的默认选项——LAMP / LNMP 技术栈里的 **M** 就是它。

日常类比：

- [[postgresql]] 像**德国工程车**——功能全、规则严、什么都能做
- MySQL 像**丰田卡罗拉**——够用、油耗低、修车铺哪儿都有

你装上一台 Linux，敲三行命令就能起一个 MySQL，连上去 `CREATE TABLE`、`INSERT`、`SELECT`，整套关系数据库的能力就到手了。这种"低门槛 + 性能不差"是它统治 Web 应用 20 多年的根基。

## 为什么重要

不理解 MySQL，下面这些事都没法解释：

- 为什么 WordPress / Drupal / Magento 这些建站系统**默认就是 MySQL**——全球一半以上网站底层是它
- 为什么 Facebook / Twitter / GitHub 这种巨型公司**内部都跑 MySQL 分支**（不是 Postgres，不是 Oracle）
- 为什么 5.7 加了 JSON 字段后开发圈讨论"MySQL 还要不要换 Postgres"
- 为什么 MariaDB 这个名字总跟 MySQL 一起出现——它是 Oracle 收购后社区分裂出的孪生 fork

在中国互联网公司，"数据库选型"几乎等同于"MySQL 还是 [[postgresql]]"——这两个名字撑起了绝大多数业务系统。

## 核心要点

MySQL 的设计可以拆成 **三层关键决定**：

1. **存储引擎可插拔**：同一个 SQL 表面，下面可以挂不同的存储引擎。InnoDB 是默认（支持事务 + 行锁），MyISAM 是老引擎（不支持事务但读快），Memory 是临时表（数据放内存，重启丢）。**类比**：同一台车架，可以换柴油机或电动机。

2. **基于 binlog 的主从复制**：主库把所有写操作写进一个叫 binlog 的日志文件，从库读 binlog 把同样的操作重放一遍。这是 MySQL 横向扩展（一主多从）的基础。

3. **B+ 树索引 + 聚簇主键**：InnoDB 的主键索引就是数据本身（叫聚簇索引），二级索引存的是主键值。**结果**：按主键查超快，但二级索引查要"走两次"（先找主键，再找数据）。

## 实践案例

### 案例 1：5 分钟跑起一个 MySQL

```bash
docker run -d --name mysql -e MYSQL_ROOT_PASSWORD=secret -p 3306:3306 mysql:8
docker exec -it mysql mysql -u root -p
```

输完密码就进 SQL 命令行。新建库、建表、插数据三步：

```sql
CREATE DATABASE shop;
USE shop;
CREATE TABLE products (id INT PRIMARY KEY, name VARCHAR(100));
INSERT INTO products VALUES (1, '咖啡豆');
SELECT * FROM products;
```

整个流程不需要装客户端、不需要配文件、不需要改 my.cnf。这就是它"易部署"的体感。

### 案例 2：JSON 字段——从严格 schema 到半结构化

5.7 之前，MySQL 想存"商品的可变属性"只能搞一张 `product_attrs(product_id, key, value)` 的横表。5.7 之后直接：

```sql
CREATE TABLE products (
  id INT PRIMARY KEY,
  attrs JSON
);
INSERT INTO products VALUES (1, '{"color":"red","size":"L"}');
SELECT JSON_EXTRACT(attrs, '$.color') FROM products WHERE id = 1;
```

这就把 [[postgresql]] 长期独占的"半结构化能力"补上了——很多团队"要不要换 Postgres"的争论从这一刻起没那么紧迫了。

### 案例 3：主从复制——多读副本扛住流量

主库上：

```sql
SHOW MASTER STATUS;
-- File: mysql-bin.000003   Position: 154
```

从库上：

```sql
CHANGE MASTER TO
  MASTER_HOST='主库 IP',
  MASTER_USER='repl',
  MASTER_PASSWORD='...',
  MASTER_LOG_FILE='mysql-bin.000003',
  MASTER_LOG_POS=154;
START SLAVE;
```

从此从库实时跟主库同步——读流量打到从库，主库只接写。这是几乎所有"读多写少" Web 站的标配架构。

## 踩过的坑

1. **默认 utf8 不是真 UTF-8**：MySQL 历史包袱里 `utf8` 字符集其实只支持 3 字节，存不下 4 字节的 emoji（笑哭脸 → 报错或截断）。**正确做法**：建库建表都用 `utf8mb4`，连接也用 `SET NAMES utf8mb4`。新人最常踩的第一个坑。

2. **InnoDB vs MyISAM 选错**：生产业务系统**必须用 InnoDB**——它有事务、有行锁、有崩溃恢复。MyISAM 没事务，断电可能数据损坏。但搜到的老教程经常默认 MyISAM，复制粘贴就翻车。

3. **主从复制延迟**：binlog 是异步的，写完主库到从库可能延迟几十毫秒到几秒。"刚写完就读"的场景从从库读会读到旧数据。**对策**：写完直接读主库，或用半同步复制 / 分组复制。

4. **InnoDB 全文索引比 [[postgresql]] 弱**：MySQL 的 FULLTEXT 索引中文支持差、相关性算法粗糙。真要做搜索一般外挂 Elasticsearch，不直接用 MySQL 全文索引。

5. **大表加字段卡死**：5.6 之前 `ALTER TABLE` 加字段会**全表重建 + 锁表**。千万级表加一个字段可能业务暂停几小时。现代版本好了很多（online DDL），但老系统升级前最好做迁移演练。

## 历史小故事

- **1995 年**：Michael "Monty" Widenius 在瑞典 MySQL AB 公司发布 MySQL 1.0，名字来自他大女儿 My
- **2000 年代初**：LAMP（Linux + Apache + MySQL + PHP）成为 Web 1.0 / 2.0 默认技术栈，MySQL 全球装机量爆发
- **2008 年**：Sun Microsystems 用 10 亿美元收购 MySQL AB
- **2010 年**：Oracle 收购 Sun，连带 MySQL 进了 Oracle 手里——数据库行业最大的并购之一
- **2010 年**：社区担心 Oracle 闭源 MySQL，Monty 带原班人马 fork 出 MariaDB，名字来自他小女儿 Maria
- **2018 年**：MySQL 8.0 发布——加 CTE（with 子句）、窗口函数、角色权限、原子 DDL，工程上一次大跃进
- **2024 年至今**：仍是 Web 应用最常用的关系数据库，云上有 AWS Aurora / 阿里云 RDS / 腾讯云 CDB 等托管服务

## 学到什么

1. **流行 ≠ 最强**：MySQL 在功能严谨度上不如 [[postgresql]]，但凭借"易部署 + 生态完善 + 文档多"统治了 Web 时代
2. **可插拔架构的价值**：存储引擎抽象让 InnoDB 后来居上替代 MyISAM，整个生态平滑过渡
3. **开源 + 商业的拉锯**：Sun 收购 → Oracle 收购 → MariaDB fork——"被大公司控制还是社区主导"是开源软件永恒的张力
4. **用对默认值最重要**：utf8mb4、InnoDB、设置时区——三个默认选对，能避开 80% 的 MySQL 新手坑

## 延伸阅读

- 官方文档：[MySQL 8.0 Reference Manual](https://dev.mysql.com/doc/refman/8.0/en/)
- 中文入门：[MySQL 必知必会（第 4 版）](https://book.douban.com/subject/3354490/)（300 页，2-3 天读完）
- 进阶："High Performance MySQL"（O'Reilly，最权威的 MySQL 调优书）
- [[postgresql]] —— 功能更强的关系数据库对照
- [[sqlite]] —— 嵌入式关系数据库对照（手机端 / 单机应用）

## 关联

- [[postgresql]] —— 关系数据库另一阵营，功能更全但部署更重
- [[sqlite]] —— 嵌入式关系数据库，单文件零部署
- [[redis]] —— 内存键值库，常和 MySQL 搭配做缓存层
- [[clickhouse]] —— 列存分析数据库，OLAP 场景替代 MySQL

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[berenson-1995-isolation]] —— Berenson 1995 — ANSI SQL 隔离级别的漏洞与快照隔离
- [[clickhouse]] —— ClickHouse — 列式 OLAP 数据库
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[go-zero]] —— go-zero — 一份契约文件生成整套 Go 微服务
- [[grafana]] —— Grafana — 监控可视化看板
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[mariadb-server]] —— mariadb-server — MySQL 原作者带走的那一支
- [[memcached]] —— Memcached — 经典内存缓存
- [[memgraph]] —— Memgraph — 内存图数据库
- [[mysql-server]] —— mysql-server — 一个仓库装下整套 OLTP 引擎
- [[neo4j]] —— Neo4j — 主流图数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[redis]] —— Redis — 内存键值数据库
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库
- [[tidb]] —— TiDB — HTAP 分布式数据库
- [[timescaledb]] —— TimescaleDB — PostgreSQL 时序扩展

