---
title: SQLite — 嵌入式 SQL 数据库
来源: https://github.com/sqlite/sqlite
日期: 2026-05-29
子分类: 存储与查询
分类: 数据库
难度: 中级
provenance: pipeline-v3
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
- 为什么它有**100% 分支测试覆盖率**——航空软件级别（DO-178B 标准），单测代码量是源码的 600 倍
- 为什么作者选了**公共领域许可**（Public Domain）——不要钱、不限商用、不要署名，连开源协议都嫌啰嗦
- 为什么 2020 年后又出现了 Cloudflare D1 / Turso / LiteFS 这些"边缘云 SQLite"——一个 22 年前的库，在云原生时代被重新发现

## 核心要点

SQLite 的设计可以拆成 **三个反直觉的选择**：

1. **嵌入式（Embedded）**：不是独立进程，是**链接到你应用里的动态库**。SELECT 语句的执行**不跨进程边界**——就是普通函数调用，没有 TCP / socket 开销。

2. **单文件存储**：整个数据库就是一个 `.db` 文件，包括表结构、索引、数据、视图。**复制文件 = 完整备份**；删文件 = 删库；想发给同事？直接发文件就行。

3. **Serverless**：不需要安装服务、不开端口、不要权限管理。读小数据集时**比 PostgreSQL 快一个数量级**——少了网络往返这一步。

加起来叫 "**SQL as a library，not as a service**"。

## 实践案例

### 案例 1：命令行三秒建库

```bash
sqlite3 mydb.db "CREATE TABLE users(id INTEGER, name TEXT); INSERT INTO users VALUES(1, 'Alice');"
```

跑完之后 `mydb.db` 就是完整数据库。`ls -la mydb.db` 看到一个文件，里面就是表 + 数据。`rm mydb.db` 就删库——所有"数据库"操作的本质都是文件 IO。

### 案例 2：Python 嵌入式调用

```python
import sqlite3
conn = sqlite3.connect('mydb.db')
cursor = conn.execute('SELECT id, name FROM users WHERE id = ?', (1,))
print(cursor.fetchone())  # (1, 'Alice')
conn.close()
```

`sqlite3` 是 **Python 标准库自带的**——不用 `pip install`。这是 SQLite 嵌入式哲学的极致体现：你不需要装数据库就能用数据库。

### 案例 3：WAL 模式解锁并发

默认 SQLite 写时锁全库，读写互斥。开 WAL（Write-Ahead Log）模式：

```sql
PRAGMA journal_mode=WAL;
```

之后读和写**不再互相阻塞**——读走数据文件、写走 WAL 日志，定期 checkpoint 合并。这一行 PRAGMA 把 SQLite 从"单用户玩具"变成"中等并发可用"。

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
- 中小型只读 / 读多写少的网站（个人博客、文档站、小型 CMS）
- 边缘计算（Cloudflare D1 / Turso 把 SQLite 部署到全球边缘节点）

**不适用**：
- 高并发写入（多人同时下单、IM 消息流）→ 用 PostgreSQL / MySQL
- 多机分布式事务 → SQLite 不跨进程，更别说跨机器
- 需要细粒度权限控制（行级 RLS、用户组）→ 用 PostgreSQL
- 内置 JSON 复杂查询 / 物化视图 → SQLite 都有，但 PostgreSQL 更强

## 历史小故事（可跳过）

- **2000 年**：D. Richard Hipp 在为美国海军写一个船舶导弹的辅助软件，找数据库时发现 PostgreSQL 太重、文件型 dbm 太弱，干脆**自己写一个嵌入式 SQL 库**——这就是 SQLite 1.0。
- **2004 年**：Hipp 把 SQLite 放到 **Public Domain**——不收钱、不限商用、不要求署名。这个决定让它后来横扫移动端。
- **2010 年起**：Android 选 SQLite 作为系统数据库；iOS Core Data 底层也是 SQLite；Firefox / Chrome 用它存历史和书签。**地球上每台联网设备里都有 SQLite**。
- **2018 年**：SQLite 3 加入 JSON 函数和 Window Function，开始向 PostgreSQL 看齐。
- **2022 年**：Cloudflare 发布 **D1**——SQLite 跑在 Workers 边缘节点上，每个请求就近访问数据。
- **2024 年**：**Turso / LiteFS** 把 SQLite 拓展成分布式、可复制、跨区域同步——一个 22 年前的"单机库"，在云原生时代变成边缘存储的事实标准。

## 学到什么

1. **嵌入式 vs 服务器** 是数据库设计最根本的分叉——一边追求"能在所有地方运行"，一边追求"在中央节点高吞吐"
2. **简单 + 充分测试** 比"功能丰富 + 半成品"打得远——SQLite 用最少的特性、最深的测试，赢了 20 年
3. **公共领域许可** 是 SQLite 横扫嵌入式市场的隐藏推手——商业代码、闭源固件都能直接用
4. **设计的关键不是加什么，是不加什么**——SQLite 主动拒绝"客户端 / 服务器"这一层，于是有了别人没有的简单
5. **测试是 SQLite 的护城河**——100% 分支覆盖 + 数千条 fuzz 测试 + 异常注入测试，让一个小团队维护的库能跑在数十亿设备上不被信任质疑；这条经验值得任何要做"嵌入式基础设施"的项目抄作业
6. **公共领域 vs MIT/BSD**：Public Domain 比 MIT 更宽松——不要求保留版权声明，飞机黑盒 / 闭源固件不会因为"忘了贴 license" 出问题；这是 SQLite 横扫嵌入式的隐形杠杆

## 延伸阅读

- 官方文档：[sqlite.org/whentouse.html](https://sqlite.org/whentouse.html)（"什么时候用 / 不用 SQLite" 是开发者圣经）
- 测试故事：[sqlite.org/testing.html](https://sqlite.org/testing.html)（100% 分支覆盖怎么做到的）
- 边缘云方向：[Turso 官网](https://turso.tech/)（SQLite 分布式复制层）

## 关联

- [[postgresql]] —— 服务器型关系数据库的代表，与 SQLite 形成"重 vs 轻"的设计对照
- [[duckdb-wasm]] —— 同属嵌入式数据库阵营，但 SQLite 偏 OLTP、DuckDB 偏 OLAP

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[bitcoin-core]] —— Bitcoin Core — 比特币参考实现
- [[django]] —— Django — 全功能 batteries-included 的 Python web 框架
- [[duckdb]] —— DuckDB — 嵌入式列存 OLAP
- [[duckdb-wasm]] —— duckdb-wasm — 把分析数据库塞进浏览器标签页
- [[go-ethereum]] —— Go-Ethereum (Geth) — 以太坊主流 Go 客户端
- [[immich]] —— Immich — 把家庭照片从别人的云里救回自己机器
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[leveldb]] —— LevelDB — Google LSM 库
- [[littlefs]] —— littlefs — 给 MCU 用的掉电安全小文件系统
- [[lmdb]] —— LMDB — 闪电内存映射嵌入式 KV 库
- [[mongodb]] —— MongoDB — 文档型 NoSQL 数据库
- [[mysql]] —— MySQL — 全球最流行关系数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[rt-thread]] —— RT-Thread — 中文社区主导的物联网 RTOS
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
- [[signal-android]] —— Signal Android — 让 Android 上的每条消息都只有两端能看见
- [[signal-ios]] —— Signal iOS — 让 iPhone 上的每条消息都只有两端能看见
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[unqlite]] —— UnQLite — 嵌入式 NoSQL 数据库

