---
title: SQLite — 嵌入式 SQL 数据库
来源: https://github.com/sqlite/sqlite
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

SQLite 是一个**完整的 SQL 数据库**，但它不是独立服务器，而是**一个文件 + 一个动态库**。日常类比：[[postgresql]] 是要预约的医院（先起进程、再建连接、再说话）；SQLite 是放在抽屉里的医疗手册——**打开就能查，看完合上**。

你写：

```python
import sqlite3
conn = sqlite3.connect('mydb.db')
conn.execute('SELECT * FROM users')
```

没起服务器、没监听端口、没装客户端——`mydb.db` 这个文件本身就是数据库。这种"嵌入式"运行模式，是它和 PostgreSQL / MySQL 最根本的差别。

## 为什么重要

不理解 SQLite 的"小而无处不在"，下面这些事都解释不通：

- 为什么**全球部署量第一的数据库**是它（不是 MySQL，也不是 Oracle）——你手机里的 iOS / Android 系统数据库都是 SQLite
- 为什么它强调**100% 分支 / MC/DC 测试覆盖**——按航空软件 DO-178B 的测试思路做（项目本身未宣称正式取证），测试代码量远超源码
- 为什么作者选了**公共领域许可**（Public Domain）——不要钱、不限商用、不要署名，连开源协议都嫌啰嗦
- 为什么 2020 年后又出现了 Cloudflare D1 / Turso / LiteFS 这些"边缘云 SQLite"——一个二十多年前的库，在云原生时代被重新发现

## 核心要点

SQLite 的设计可以拆成 **三个反直觉的选择**：

1. **嵌入式（Embedded）**：不是独立进程，是**链接到你应用里的动态库**。SELECT 语句的执行**不跨进程边界**——就是普通函数调用，没有 TCP / socket 开销。

2. **单文件存储**：整个数据库就是一个 `.db` 文件，包括表结构、索引、数据、视图。**复制文件 = 完整备份**；删文件 = 删库；想发给同事？直接发文件就行。

3. **Serverless**：这里的 serverless **不是**云厂商那种按请求计费，而是**没有独立数据库进程**——不需要安装服务、不开端口、不要权限管理。读小数据集时**比 PostgreSQL 快一个数量级**——少了网络往返这一步。

加起来叫 "**SQL as a library，not as a service**"。

## 实践案例

### 案例 1：命令行三秒建库

```bash
sqlite3 mydb.db "CREATE TABLE users(id INTEGER, name TEXT); INSERT INTO users VALUES(1, 'Alice');"
```

**逐部分解释**：

- `sqlite3 mydb.db "..."` 打开（或创建）名为 `mydb.db` 的文件，并在里面执行 SQL
- `CREATE TABLE` / `INSERT` 把表结构和一行数据写进这个文件
- 跑完后 `ls mydb.db` 看到的那个文件就是完整数据库；`rm mydb.db` 等于删库

### 案例 2：Python 嵌入式调用

```python
import sqlite3
conn = sqlite3.connect('mydb.db')
cursor = conn.execute('SELECT id, name FROM users WHERE id = ?', (1,))
print(cursor.fetchone())  # (1, 'Alice')
conn.close()
```

**逐部分解释**：

- `sqlite3` 是 **Python 标准库自带的**——不用 `pip install`
- `connect('mydb.db')` 把数据库文件挂进当前进程，没有服务器、没有端口
- `?` 占位符传参，避免把用户输入直接拼进 SQL（防注入的基本写法）

### 案例 3：WAL 模式解锁并发

默认 SQLite 写时锁全库，读写互斥。开 WAL（Write-Ahead Log）模式：

```sql
PRAGMA journal_mode=WAL;
```

**逐部分解释**：

- 默认模式：写的时候读者也要等，像单车道施工
- WAL：读者继续走原来的数据文件，写者把新改动追加到旁边的 WAL 日志
- 定期 **checkpoint** 把日志合并回主文件；这一行 PRAGMA 把「单用户玩具」推到「中等读并发可用」

## 踩过的坑

1. **写并发性能差**：SQLite 同一时刻**只允许一个写者**（即使开了 WAL）。多进程同时写会排队甚至超时。要高写入并发？换 PostgreSQL。

2. **类型系统极弱**：SQLite 是**动态类型**——你声明 `name TEXT`，但 `INSERT INTO users VALUES(1, 12345)` 也会成功（数字被存成 TEXT）。生产代码**必须自己校验**，别指望数据库挡住脏数据。

3. **没有内置全文搜索方案**：要做搜索得编译 FTS5 扩展（很多发行版默认带，但不是所有）。`LIKE '%word%'` 不走索引、慢得像爬。

4. **大数据集性能下降**：单库超过 100 GB 后，VACUUM、备份、迁移都变慢；写并发瓶颈也更明显。要做分库分表？SQLite 不是合适的工具——这是它的设计取舍。

5. **没有用户和权限**：所有访问者通过文件系统权限管理，没有 `GRANT` / `REVOKE`。**多租户场景请绕道**。

## 适用 vs 不适用场景

**适用**：
- 移动端 / 桌面端本地存储（手机 App 缓存、Electron 应用、配置数据）
- 测试和原型（不想为单测起一个 PostgreSQL 容器）
- 读多写少的中小站：大致单写者、库体积到几十 GB 仍常见（个人博客、文档站、小型 CMS）
- 边缘计算（Cloudflare D1 / Turso 把 SQLite 部署到全球边缘节点）

**不适用**：
- 高并发写入（多人同时下单、IM 消息流）→ 用 PostgreSQL / MySQL
- 多机写扩展 / 原生跨机复制与分布式事务 → SQLite 本职是单机文件库（多进程可共享同一文件，但不是集群数据库）
- 需要细粒度权限控制（行级 RLS、用户组）→ 用 PostgreSQL
- 内置 JSON 复杂查询 / 物化视图 → SQLite 都有，但 PostgreSQL 更强

## 历史小故事（可跳过）

- **2000 年**：D. Richard Hipp 在为美国海军写一个船舶导弹的辅助软件，找数据库时发现 PostgreSQL 太重、文件型 dbm 太弱，干脆**自己写一个嵌入式 SQL 库**——这就是 SQLite 1.0。
- **2004 年**：Hipp 把 SQLite 放到 **Public Domain**——不收钱、不限商用、不要求署名。这个决定让它后来横扫移动端。
- **2010 年起**：Android 选 SQLite 作为系统数据库；iOS Core Data 底层也是 SQLite；Firefox / Chrome 用它存历史和书签。**地球上每台联网设备里都有 SQLite**。
- **2015 / 2018 年**：JSON1 扩展约在 3.9（2015）进入主线；Window Function 在 3.25.0（2018-09）加入，开始向 PostgreSQL 看齐。
- **2022 年**：Cloudflare 发布 **D1**——SQLite 跑在 Workers 边缘节点上，每个请求就近访问数据。
- **2022–2024 年**：**LiteFS / Turso** 等把 SQLite 拓展成可复制、跨区域同步——一个二十多年前的"单机库"，在云原生时代变成边缘存储的常见底座。

## 学到什么

1. **嵌入式 vs 服务器** 是数据库设计最根本的分叉——一边追求"能在所有地方运行"，一边追求"在中央节点高吞吐"
2. **简单 + 充分测试** 比"功能丰富 + 半成品"打得远——SQLite 用最少的特性、最深的测试，赢了 20 年
3. **公共领域许可** 是 SQLite 横扫嵌入式市场的隐藏推手——商业代码、闭源固件都能直接用
4. **设计的关键不是加什么，是不加什么**——SQLite 主动拒绝"客户端 / 服务器"这一层，于是有了别人没有的简单
5. **测试是护城河**：按航空软件 **DO-178B 的思路**做 100% MC/DC 覆盖（项目本身未宣称正式取证），让小团队维护的库能跑在数十亿设备上
6. **Public Domain 比 MIT 更松**：不要求保留版权声明，闭源固件也不会因为“忘了贴 license”出问题

## 延伸阅读

- 官方文档：[sqlite.org/whentouse.html](https://sqlite.org/whentouse.html)（"什么时候用 / 不用 SQLite" 是开发者圣经）
- 测试故事：[sqlite.org/testing.html](https://sqlite.org/testing.html)（100% 分支覆盖怎么做到的）
- 边缘云方向：[Turso 官网](https://turso.tech/)（SQLite 分布式复制层）
- 许可说明：[sqlite.org/copyright.html](https://sqlite.org/copyright.html)（Public Domain 声明原文）

## 关联

- [[postgresql]] —— 服务器型关系数据库的代表，与 SQLite 形成"重 vs 轻"的设计对照
- [[duckdb]] —— 同属嵌入式阵营，但 DuckDB 偏分析（OLAP），SQLite 偏事务（OLTP）
- [[duckdb-wasm]] —— 把分析库塞进浏览器，可和 SQLite 的"库即文件"对照
- [[leveldb]] —— 嵌入式 KV，没有 SQL；理解"库 vs 引擎"边界
- [[mysql]] —— 另一条客户端/服务器路线，部署量常被拿来和 SQLite 对比

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

