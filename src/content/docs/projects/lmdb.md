---
title: LMDB — 闪电内存映射嵌入式 KV 库
来源: 'https://github.com/LMDB/lmdb — Howard Chu, OpenLDAP'
日期: 2026-06-06
分类: 数据库
子分类: 存储与查询
难度: 中级
---

## 是什么

**LMDB**（Lightning Memory-Mapped Database）是 Howard Chu 为 OpenLDAP 写的**嵌入式键值数据库库**（不是独立服务器）：把整个库 `mmap` 进进程地址空间，用 **B+ 树** 存 KV，靠 **写时复制（Copy-on-Write）** 实现 **ACID 事务** 和 **MVCC**——读不加锁、写不堵读，崩溃后**无需 recovery**。

日常类比：[[sqlite]] 像带收银台的小便利店（SQL 柜台帮你找货）；LMDB 像仓库货架贴条码——你拿 `mdb_get` 直接伸手取货，**零拷贝**从映射内存返回指针，没有 malloc/memcpy 中间商。

被 [[bitcoin]] Core、各种区块链索引、嵌入式配置库广泛使用。

## 为什么重要

不懂 LMDB，这些设计取舍说不清：

- 为什么「无 WAL、无 checkpoint」也能事务安全——COW 让活跃页永不覆盖
- 为什么读多写少场景能极快——读者无锁快照，OS 页缓存即数据库缓存
- 为什么**单写者**反而避免死锁——写事务串行，读者永不阻塞
- 为什么嵌入式场景偏爱 LMDB 而非 [[leveldb]]——代码极小（~40KB 级）、语义简单

## 核心要点

1. **mmap 单级存储**：数据页直接在映射文件里，读路径 `key → B+ 树 → 返回映射指针`。类比：书页摊开桌上，查字不用复印。

2. **双根节点 COW**：文件头两页轮流当 root，写事务复制路径上节点到新页，最后切换更大 Transaction ID 的根。崩溃只会落在未完成版本，不会 corrupt 已提交快照。

3. **空闲页 B+ 树**：删除释放的页进 freelist 复用，库文件大小**稳定不无限涨**（除非长期挂着老读事务占着旧版本页）。

## 实践案例

### 案例 1：最小读写（C API 概念）

```c
MDB_env *env; MDB_dbi dbi; MDB_txn *txn; MDB_val key, data;
mdb_env_create(&env);
mdb_env_open(env, "./mydb", 0, 0664);
mdb_txn_begin(env, NULL, 0, &txn);
mdb_dbi_open(txn, NULL, 0, &dbi);
key.mv_size = 3; key.mv_data = "foo";
data.mv_size = 3; data.mv_data = "bar";
mdb_put(txn, dbi, &key, &data, 0);
mdb_txn_commit(txn);
```

写事务结束才可见；读方用只读 `mdb_txn_begin(..., MDB_RDONLY, ...)` 拿一致快照。

### 案例 2：Python `lmdb` 包典型用法

```python
import lmdb

env = lmdb.open("/tmp/mydb", map_size=1024**3)  # 虚拟地址空间上限
with env.begin(write=True) as txn:
    txn.put(b"user:1", b"Alice")
with env.begin() as txn:
    print(txn.get(b"user:1"))  # b'Alice'
```

`map_size` 要一次设够虚拟空间；不是立刻占满磁盘，但规划过小会 `MDB_MAP_FULL`。

### 案例 3：与 LevelDB/RocksDB 选型

```text
要嵌入式、读极多、可接受单写者 → LMDB
要高写吞吐、多写并发、列族压缩   → RocksDB
要 SQL + 单文件便携               → SQLite
```

LMDB **不提供网络层**；通常是进程内库或配合自定义 RPC。

### 案例 4：环境 flags 速查

```text
MDB_RDONLY     只读打开，防应用写坏映射
MDB_NOSUBDIR   路径即数据文件而非目录
MDB_MAPASYNC   异步刷盘（性能↑ 崩溃窗口↑）
```

生产默认：**只读映射 + 单写队列**；慎用 `WRITEMAP` 除非确认无野指针。

## 踩过的坑

1. **长寿命读事务**——会阻止旧页回收，文件膨胀成 append-only。
2. **`map_size` 设太小**——写满后 `MDB_MAP_FULL`，需重建环境或预留更大虚拟空间。
3. **多进程写**——只允许一个活跃写事务；多写者要应用层排队。
4. **只读映射模式**——默认防野指针写坏库；要最高写速才开 `MDB_WRITEMAP`（有风险）。
5. **把 LMDB 当 Redis**——无 TTL、无 pub/sub，纯 KV + 游标遍历。
6. **嵌套事务误用**——子事务 abort 规则与 SQLite SAVEPOINT 不同，要读文档。

## 适用 vs 不适用场景

**适用**：
- 区块链/索引本地状态（读多写少、要崩溃安全）
- 嵌入式配置、特征缓存（进程内、低延迟）
- 需要 MVCC 快照遍历（游标 scan）

**不适用**：
- 高并发多写（单写者瓶颈）
- 需要 SQL / 二级索引灵活查询
- 远程多客户端直接连（需自己封装服务）
- 需要在线扩容分片（LMDB 单文件单库）

## 历史小故事（可跳过）

- **2011**：Howard Chu 在 OpenLDAP 项目中发布 LMDB，取代 BDB
- **设计目标**：LDAP 目录读密集、要可靠、要小
- **扩散**：Bitcoin Core 等采用，成为「嵌入式 COW KV」代表
- **今天**：仍是 lmdb.tech 维护，GitHub 为只读镜像

## 学到什么

- **COW + 双根** 可省 WAL 仍保证崩溃安全
- **mmap 零拷贝** 是读性能的核心，不是魔法 B+ 树
- **单写者多读者** 简化并发模型，用吞吐换复杂度
- **空闲页复用** 让空间稳定——但怕长读事务
- **库不是服务**：部署形态是 `.so` 链进进程，不是独立 daemon
- **游标遍历有序**：B+ 树 key 有序，range scan 高效

## 延伸阅读

- 官方文档：http://www.lmdb.tech/doc/
- 架构解读：https://xgwang.me/posts/how-lmdb-works/
- [[sqlite]] —— 另一嵌入式存储路线
- [[leveldb]] —— Google LSM 嵌入式对照
- [[rocksdb]] —— 高写吞吐嵌入式
- SDC 2015 LMDB 演讲 PDF——双根 COW 图解
- OpenLDAP LMDB 源码 `mdb.c`——实现细节入口

## 关联

- [[sqlite]] —— SQL 嵌入式；LMDB 纯 KV
- [[leveldb]] —— LSM vs B+ 树 COW
- [[rocksdb]] —— 写密集场景对照
- [[redis]] —— 内存服务；LMDB 进程内映射
- [[bitcoin]] —— 典型 LMDB 使用者（索引/状态）
- [[etcd]] —— 对比：分布式服务 vs 嵌入式库
- [[nats-server]] —— 消息系统；LMDB 可作其存储后端之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bbolt]] —— bbolt — Go 嵌入式 B+ 树 KV
- [[bitcoin]] —— Bitcoin 白皮书
- [[etcd]] —— etcd — 分布式键值数据库
- [[nats-server]] —— NATS Server — 极简云原生消息中间件
- [[redis]] —— Redis — 内存键值数据库
- [[rocksdb]] —— RocksDB — 嵌入式 LSM 引擎
- [[sled]] —— sled — Rust 现代 BTree + LSM 混合嵌入式 KV
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库

