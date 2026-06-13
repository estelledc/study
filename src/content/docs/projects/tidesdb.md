---
title: TidesDB — C 语言 LSM 存储引擎
来源: https://github.com/tidesdb/tidesdb
日期: 2026-06-13
分类: 数据库
子分类: databases-storage
provenance: pipeline-v3
---

# TidesDB — C 语言 LSM 存储引擎

## 一、从日常类比开始

想象你在整理一个巨大的书架，每天都要往里添新书、翻找旧书。

传统数据库（比如 MySQL 的 InnoDB）的做法是：每收到一本书，直接找到它在书架上该放的位置，把书插进去。如果书架已经满了，就得把后面好多本书挪位置——这非常慢。

TidesDB 的做法完全不同：**它不马上把书放回书架**。而是先在你的办公桌上（内存）堆着，等堆满一摞，再一次性把这一摞书排好序，放到书架的最顶层。之后，会有个清洁工（后台线程）定期把几摞书合并成一摞更大的，放到下一层。

这个"先堆在桌上，再分批放书架"的思路，就是 **LSM-Tree（Log-Structured Merge-Tree）** 的核心思想。

TidesDB 就是一个用 C 语言实现的 LSM-Tree 存储引擎，只有 ~6 万行代码，但功能非常完整——支持事务、压缩、缓存、自动合并，还能跑在 Linux、macOS、Windows 上。

## 二、核心概念

### 1. Column Family（列族）

列族是 TidesDB 里的一个独立 KV 命名空间。你可以把它理解为一个独立的"书架"，每个列族有自己的配置（压缩方式、缓存大小等），互不干扰。

### 2. Memtable（内存表）

Memtable 就是上面的"办公桌"。所有写入操作先放在这里——具体来说是一个叫 skip list（跳表）的内存数据结构。它有序、可快速查找。当 memtable 达到一定大小（默认 64MB），它就被冻结，交给后台线程写到磁盘。

### 3. SSTable（Sorted String Table）

SSTable 就是放到书架上的那一排排"排好序的书"。一旦写入磁盘，就**永远不会被修改**，只能被读取或者被后台合并掉。这种不可变性让并发读取不需要加锁。

### 4. WAL（Write-Ahead Log，预写日志）

在数据进入 memtable 之前，TidesDB 会先把写入操作记录到一个日志文件里。这是为了防止电脑突然断电——重启后从 WAL 恢复数据，保证不会丢失。

### 5. Compaction（合并/压缩）

随着写入越来越多，磁盘上会有成千上万个 SSTable。Compaction 就是后台线程把这些小文件合并成大文件的过程，同时丢掉已经被删除的旧数据，释放空间。

### 6. Bloom Filter（布隆过滤器）

这是一个"概率型小册子"。它体积很小，但能快速告诉你：**某个 key 一定不在某个 SSTable 里**。这样读数据时就能跳过大量不必要的磁盘读取。

## 三、数据的一生

一条数据在 TidesDB 里的完整生命周期：

```
写入 → WAL 日志 → Memtable（内存跳表）
            ↓
     内存满了 → 冻结成 SSTable → 放到 Level 1
            ↓
     后台合并 → Level 1 → Level 2 → ... → Level N（最深）
            ↓
     被读取时：从 Memtable 开始找，逐层往下，找到就停
```

## 四、代码示例

### 示例一：初始化数据库、创建列族、写入读取

```c
#include <tidesdb/tidesdb.h>
#include <stdio.h>

int main() {
    // 1. 初始化 TidesDB（使用系统默认内存分配器）
    tidesdb_init(NULL, NULL, NULL, NULL);

    // 2. 配置数据库路径和线程数
    tidesdb_config_t config = {
        .db_path = "./my_database",
        .num_flush_threads = 2,
        .num_compaction_threads = 2,
        .log_level = TDB_LOG_INFO
    };

    // 3. 打开（或创建）数据库
    tidesdb_t *db = NULL;
    if (tidesdb_open(&config, &db) != 0) {
        fprintf(stderr, "无法打开数据库\n");
        return -1;
    }

    // 4. 创建一个列族
    tidesdb_column_family_config_t cf_config = tidesdb_default_column_family_config();
    if (tidesdb_create_column_family(db, "users", &cf_config) != 0) {
        fprintf(stderr, "创建列族失败\n");
        return -1;
    }

    // 5. 获取列族引用
    tidesdb_column_family_t *cf = tidesdb_get_column_family(db, "users");

    // 6. 写入一个 key-value
    const char *key = "alice";
    const char *value = "Alice Smith, Age 30";
    if (tidesdb_put(db, cf, (const uint8_t *)key, strlen(key),
                    (const uint8_t *)value, strlen(value), -1) != TDB_SUCCESS) {
        fprintf(stderr, "写入失败\n");
    } else {
        printf("写入成功: %s\n", key);
    }

    // 7. 读取一个 key
    uint8_t *read_value = NULL;
    size_t read_value_len = 0;
    if (tidesdb_get(db, cf, (const uint8_t *)key, strlen(key),
                    &read_value, &read_value_len) == TDB_SUCCESS) {
        printf("读取成功: %.20s...\n", read_value);
        // 用完记得释放
        tidesdb_free(read_value);
    } else {
        printf("未找到 key: %s\n", key);
    }

    // 8. 关闭数据库并清理
    tidesdb_close(db);
    tidesdb_finalize();
    return 0;
}
```

### 示例二：使用事务 + 布隆过滤器 + 压缩

```c
#include <tidesdb/tidesdb.h>
#include <stdio.h>

int main() {
    tidesdb_init(NULL, NULL, NULL, NULL);

    tidesdb_config_t config = {
        .db_path = "./transaction_db",
        .num_flush_threads = 2,
        .num_compaction_threads = 2,
        .log_level = TDB_LOG_WARN
    };

    tidesdb_t *db = NULL;
    if (tidesdb_open(&config, &db) != 0) {
        return -1;
    }

    // 创建带布隆过滤器和 LZ4 压缩的列族
    tidesdb_column_family_config_t cf_config = tidesdb_default_column_family_config();
    cf_config.enable_bloom_filter = 1;       // 开启布隆过滤器
    cf_config.bloom_fpr = 0.01;              // 1% 误判率
    cf_config.compression_algorithm = TDB_COMPRESS_LZ4;  // LZ4 快速压缩
    cf_config.write_buffer_size = 128 * 1024 * 1024;     // 128MB

    if (tidesdb_create_column_family(db, "orders", &cf_config) != 0) {
        return -1;
    }

    tidesdb_column_family_t *cf = tidesdb_get_column_family(db, "orders");

    // 开启一个事务
    tidesdb_txn_t *txn = NULL;
    if (tidesdb_txn_init(db, &txn, TDB_ISOLATION_READ_COMMITTED) != TDB_SUCCESS) {
        fprintf(stderr, "事务初始化失败\n");
        return -1;
    }

    // 在事务中写入多条数据
    tidesdb_txn_op_t ops[3] = {0};

    ops[0].op = TDB_OP_PUT;
    ops[0].key = (uint8_t *)"order_001";
    ops[0].key_size = 7;
    ops[0].value = (uint8_t *)"{'item': 'laptop', 'qty': 1}";
    ops[0].value_size = 29;

    ops[1].op = TDB_OP_PUT;
    ops[1].key = (uint8_t *)"order_002";
    ops[1].key_size = 7;
    ops[1].value = (uint8_t *)"{'item': 'phone', 'qty': 2}";
    ops[1].value_size = 27;

    ops[2].op = TDB_OP_PUT;
    ops[2].key = (uint8_t *)"order_003";
    ops[2].key_size = 7;
    ops[2].value = (uint8_t *)"{'item': 'tablet', 'qty': 1}";
    ops[2].value_size = 29;

    // 提交事务——要么全部写入，要么全部失败
    if (tidesdb_txn_commit(db, cf, txn, ops, 3) != TDB_SUCCESS) {
        fprintf(stderr, "事务提交失败\n");
        tidesdb_txn_free(txn);
        return -1;
    }

    printf("事务成功：3 条订单已写入\n");

    // 读取验证
    uint8_t *val = NULL;
    size_t val_len = 0;
    if (tidesdb_get(db, cf, (uint8_t *)"order_002", 7, &val, &val_len) == TDB_SUCCESS) {
        printf("订单 2: %.20s...\n", val);
        tidesdb_free(val);
    }

    tidesdb_close(db);
    tidesdb_finalize();
    return 0;
}
```

## 五、TidesDB 的其他亮点

- **ACID 事务**：支持 5 种隔离级别（从读未提交到可序列化），包括防写偏斜的 SSI 机制
- **自动崩溃恢复**：重启时从 WAL 自动恢复内存表
- **TTL（过期时间）**：可以给 key 设置过期时间，自动清理
- **多种压缩算法**：LZ4、Zstd、Snappy，按列族配置
- **两级缓存**：文件句柄缓存 + NUMA 感知的块缓存
- **对象存储模式**：可以把数据存到 S3，配合本地缓存，实现无限扩展
- **完全可移植**：一行 C 代码，跨 Linux/macOS/Windows/ARM/RISC-V

## 六、总结

TidesDB 的核心就一句话：**用内存写换取磁盘读**。写入非常快（顺序写内存），读取稍慢但布隆过滤器和块索引让它仍然很快。后台的合并线程在"安静"时工作，把数据整理得整整齐齐。

作为一个 ~6 万行 C 代码的存储引擎，它是理解现代数据库底层工作原理的一个绝佳起点。RocksDB、LevelDB 都是同一个 LSM-Tree 家族——TidesDB 的设计思路和它们一脉相承，但代码更现代、更模块化。
