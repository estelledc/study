---
title: LMDB — 内存映射 KV 库
来源: 'https://github.com/LMDB/lmdb'
日期: 2026-07-09
分类: databases
难度: 中级
---

## 是什么

LMDB 是一个**嵌入到程序里的键值数据库库**：你给它一个 key，它还你一段 value。日常类比：SQLite 像一本带目录和表格的账本，LMDB 像一个按字母排好的抽屉柜，每个抽屉只负责“标签 → 内容”。

它最特别的地方是 **mmap（内存映射）**。普通数据库读文件时，常常要“从磁盘读到缓冲区，再复制给应用”；LMDB 把数据库文件映射到进程地址空间，应用读到的 value 很多时候就是文件页面本身。

所以 LMDB 的核心定位不是“功能最多”，而是“路径最短”：B+ 树负责按 key 有序查找，mmap 让读取少复制，事务让写入要么完整成功、要么像没发生过。

## 为什么重要

不理解 LMDB，下面这些事很难讲清：

- 为什么一个不到大型数据库体量的 C 库，可以支撑 OpenLDAP 这种读多写少的目录服务。
- 为什么“没有独立数据库进程”也能做到 ACID 事务和多进程并发读取。
- 为什么 mmap 既能很快，也会带来 map size、远程文件系统、指针生命周期这些坑。
- 为什么存储引擎不是只有 LSM 一条路，B+ 树 + copy-on-write 也能做出极简高性能。

## 核心要点

1. **mmap：把文件交给操作系统管理**。类比：不再把整本书复印给你，而是把书架开放给你翻，哪页热就让操作系统把哪页留在内存里。LMDB 因此不需要自己再写一套复杂 page cache。

2. **Copy-on-write B+ 树：写新页，不涂改旧页**。类比：改合同不在原件上乱划，而是复印一份改完，确认无误后把“当前版本”指向新合同。读者还在看旧版本时，旧页不会被覆盖。

3. **单写多读：写排队，读不堵**。类比：仓库只有一个人能改货架位置，但很多人可以同时看目录。LMDB 同一时刻只有一个写事务，读事务看到的是自己开始时的稳定快照。

这三点合起来就是它的价值：牺牲高并发写入能力，换来极短读路径、简单恢复模型和很小的实现复杂度。

## 实践案例

### 案例 1：官方 C 示例的最小写入和读取

LMDB 官方样例展示的是“建环境 → 开事务 → 写 key/value → 再用游标读出来”：

```c
MDB_env *env;
MDB_txn *txn;
MDB_dbi dbi;
MDB_val key = {3, "uid"};
MDB_val val = {5, "alice"};

mdb_env_create(&env);
mdb_env_set_mapsize(env, 1UL << 30);
mdb_env_open(env, "./data", 0, 0664);
mdb_txn_begin(env, NULL, 0, &txn);
mdb_dbi_open(txn, NULL, 0, &dbi);
mdb_put(txn, dbi, &key, &val, 0);
mdb_txn_commit(txn);
```

逐部分解释：

- `env` 是数据库环境，背后通常会有一个数据文件和一个锁文件。
- `txn` 是事务；哪怕只读也要开事务，因为它定义了“这一刻看到的数据版本”。
- `MDB_val` 只是一段内存地址加长度；LMDB 不替你理解字符串、JSON 或结构体。
- `mdb_txn_commit` 是提交点，失败就不能假装写入已经成功。

读的时候常用游标，因为 B+ 树里的 key 天然有序：

```c
mdb_txn_begin(env, NULL, MDB_RDONLY, &txn);
mdb_cursor_open(txn, dbi, &cur);
while (mdb_cursor_get(cur, &key, &val, MDB_NEXT) == 0) {
    printf("%.*s => %.*s\n", (int)key.mv_size, key.mv_data,
           (int)val.mv_size, val.mv_data);
}
mdb_txn_abort(txn);
```

这段代码的重点不是 API 名字，而是顺序：读也在事务里，游标随着事务活着，事务结束后 `val.mv_data` 指向的数据不要继续拿着用。

### 案例 2：OpenLDAP 用 mdb 后端存目录数据

LMDB 起家就和 OpenLDAP 关系很深。OpenLDAP 管理员配置一个 mdb 数据库时，核心片段长这样：

```text
dn: olcDatabase=mdb,cn=config
objectClass: olcDatabaseConfig
objectClass: olcMdbConfig
olcDatabase: mdb
olcDbMaxSize: 1073741824
olcSuffix: dc=example,dc=com
olcRootDN: cn=Manager,dc=example,dc=com
olcDbDirectory: /usr/local/var/openldap-data
olcDbIndex: objectClass eq
```

逐部分解释：

- `olcDatabase: mdb` 表示 slapd 的这个数据库用 LMDB 后端，而不是老式 BDB/HDB 后端。
- `olcDbMaxSize` 是最大映射空间，像提前告诉仓库“最多预留多大地皮”。
- `olcDbDirectory` 是 LMDB 环境目录，里面保存数据文件和锁文件。
- `olcDbIndex` 是 LDAP 层的索引要求，底层仍落到 LMDB 的有序 key/value 存储里。

实际导入和查询会走 LDAP 工具，而不是直接手写 `mdb_put`：

```bash
slapadd -n 1 -l users.ldif
ldapsearch -x -b dc=example,dc=com uid=alice
```

这说明 LMDB 在这里是“发动机”，用户平时操作的是 OpenLDAP 这辆车。

### 案例 3：在线备份和排查 reader table

LMDB 自带命令行工具，适合运维时检查环境状态、做热备份：

```bash
mdb_copy -c /var/lib/app-lmdb /backup/app-lmdb
mdb_stat -e /var/lib/app-lmdb
mdb_stat -r /var/lib/app-lmdb
mdb_stat -rr /var/lib/app-lmdb
```

逐部分解释：

- `mdb_copy -c` 会复制当前有效页面，并跳过空闲页，适合做紧凑备份。
- `mdb_stat -e` 看环境信息，例如 map size、最后页号、事务号。
- `mdb_stat -r` 看 reader table，定位是不是有读事务长时间不结束。
- `mdb_stat -rr` 会尝试清理已经死亡的 reader 记录，避免旧快照拖住页面回收。

这些命令体现了 LMDB 的运维风格：没有后台 compaction 服务，但你要理解事务和 reader 对空间回收的影响。

## 踩过的坑

1. **把 mmap 当成真的占满内存**：map size 预留的是地址空间，不等于立刻吃掉同样多的物理内存。
2. **长读事务不关闭**：旧读者还在看旧版本，被删除的页面就不能复用，数据库文件会涨得很快。
3. **拿着 value 指针跨事务使用**：`MDB_val.mv_data` 常指向 mmap 区，事务结束后必须自己拷贝需要长期保存的数据。
4. **放到远程文件系统上**：文件锁和 mmap 同步语义可能不可靠，LMDB 官方明确不建议这样用。

## 适用 vs 不适用场景

**适用**：

- 本地嵌入式 KV：配置、索引、缓存、目录服务后端。
- 读远多于写，并且希望读路径短、延迟稳定。
- 单机多进程共享同一个本地数据库文件。
- 需要 key 有序、范围扫描、前缀扫描，但不需要 SQL。

**不适用**：

- 高并发写入 OLTP，同一时刻一个写者会成为上限。
- 需要复杂查询、join、二级索引和查询优化器，应该看 SQLite/Postgres。
- 跨机器共享同一份数据库文件，LMDB 不是分布式数据库。
- 不愿意理解事务生命周期、map size、文件系统语义的场景。

## 历史小故事（可跳过）

- **2011 年前后**：Howard Chu 为 OpenLDAP 写出 MDB，目标是替代更复杂、调参更多的旧后端。
- **后来改名 LMDB**：为了避免名字冲突，Lightning Memory-Mapped Database 这个名字逐渐固定下来。
- **设计方向很克制**：它没有 SQL、网络协议、后台线程，尽量把工作交给操作系统和一棵 copy-on-write B+ 树。
- **社区扩散**：C 原库之外，Python、Rust、Go 等语言都有绑定，很多项目把它当成本地持久化组件。
- **今天的定位**：GitHub 上约 3k stars，不是最流行的数据库项目，但在“极小、极快、嵌入式 KV”这条线上很有代表性。

## 学到什么

1. **少一层复制就是性能**：LMDB 的快不是魔法，而是 mmap + zero-copy 把读路径压短。
2. **简单来自强约束**：单写者听起来保守，却换来了无死锁、恢复简单、实现小。
3. **B+ 树和 LSM 是两种性格**：LMDB 偏读和稳定延迟，RocksDB 偏写吞吐和后台合并。
4. **事务生命周期是资源管理**：读事务不是“免费打开不管”，它会影响旧页面什么时候能回收。

## 延伸阅读

- 官方仓库：[LMDB/lmdb](https://github.com/LMDB/lmdb)
- 官方入门：[Getting Started](https://www.lmdb.tech/doc/starting.html)
- 官方 API 总览：[LMDB API](https://www.lmdb.tech/doc/group__mdb.html)
- 官方工具文档：[mdb_stat](https://www.lmdb.tech/doc/man1/mdb_stat_1.html)
- [[lmdb-2011]] —— 更偏论文和设计来龙去脉的 LMDB 笔记。
- [[b-tree-1972]] —— 理解 LMDB 为什么能按 key 有序查找。

## 关联

- [[lmdb-2011]] —— 同一主题的论文笔记，解释 mmap + CoW B+ 树的设计来源。
- [[b-tree-1972]] —— LMDB 的底层索引属于 B+ 树家族。
- [[aries-1992]] —— 传统数据库常用 WAL 恢复，LMDB 用 CoW 走了另一条路。
- [[rocksdb-lsm]] —— 写优化存储路线，对比 LMDB 的读优化路线。
- [[rocksdb]] —— 嵌入式 KV 另一大代表，但内部结构和权衡完全不同。
- [[sqlite]] —— 同样嵌入式，但提供 SQL、表、索引和查询器。
- [[redis]] —— 同样是 KV，但 Redis 是服务化内存数据库，LMDB 是本地嵌入式库。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
